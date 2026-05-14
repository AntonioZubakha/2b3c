/**
 * Scenario 9: Deal Status Update Race Condition
 * Тестирует concurrent status updates на одной сделке
 * Tests audit issue #1: Race conditions in deal flow
 */

import { Types } from 'mongoose';
import * as testHelpers from '../helpers/testHelpers';
import * as testData from '../fixtures/testData';
import Deal from '../../../models/Deal';
import { ScenarioResult, StepResult } from './01-buyer-to-lgdeal-happy-path';

export { ScenarioResult };

export async function runScenario(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: StepResult[] = [];
  
  let dealId: Types.ObjectId | undefined;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 9: Deal Status Update Race Condition                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log('🎯 Goal: Test concurrent status updates on same deal');
  console.log('🔍 Audit Issue #1: Race conditions without optimistic locking\n');
  
  try {
    // ========== STEP 1: Setup ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(9000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Create deal ==========
    console.log('\n📝 Step 2: Creating test deal...');
    const deal = await testHelpers.createTestBuyerDeal({
      buyerUserId: testData.BUYER_USER_ID,
      buyerCompanyId: testData.BUYER_COMPANY_ID,
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      products: [{
        productId: testData.PRODUCT_1_ID,
        price: 5000
      }],
      shippingAddress: testData.createTestShippingAddress()
    });
    
    dealId = deal._id;
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'OnDeal', true, dealId);
    
    // Progress to payment stage
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'awaiting_payment'
        }
      }
    );
    
    steps.push({
      step: 'Create Deal',
      success: true,
      message: 'Deal created at awaiting_payment status',
      timestamp: new Date()
    });
    
    // ========== STEP 3: Simulate concurrent updates ==========
    console.log('\n📝 Step 3: 🚨 Simulating concurrent status updates...');
    console.log('   User A: Trying to confirm payment (awaiting_payment → payment_received)');
    console.log('   User B: Trying to cancel deal (awaiting_payment → cancelled)');
    console.log('   EXECUTING SIMULTANEOUSLY...\n');
    
    // Simulate concurrent updates without optimistic locking
    const updatePromises = [
      // Update 1: Confirm payment
      Deal.updateOne(
        { _id: dealId },
        {
          $set: { 
            status: 'payment_received',
            'paymentDetails.paymentDate': new Date()
          },
          $push: {
            activityLog: {
              action: 'payment_confirmed',
              performedBy: testData.LGDEAL_SUPERVISOR_ID,
              details: 'Payment confirmed',
              timestamp: new Date()
            }
          }
        }
      ),
      
      // Update 2: Cancel deal (slight delay to make race more realistic)
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return Deal.updateOne(
          { _id: dealId },
          {
            $set: {
              stage: 'cancelled',
              status: 'cancelled',
              cancellationReason: 'Buyer requested cancellation'
            },
            $push: {
              activityLog: {
                action: 'deal_cancelled',
                performedBy: testData.BUYER_USER_ID,
                details: 'Deal cancelled by buyer',
                timestamp: new Date()
              }
            }
          }
        );
      })()
    ];
    
    const results = await Promise.all(updatePromises);
    
    console.log(`   Update 1 (confirm payment): modified ${results[0].modifiedCount} document(s)`);
    console.log(`   Update 2 (cancel): modified ${results[1].modifiedCount} document(s)`);
    
    steps.push({
      step: 'Concurrent Updates',
      success: true,
      message: 'Executed 2 concurrent status updates',
      timestamp: new Date()
    });
    
    // ========== STEP 4: Check final state ==========
    console.log('\n📝 Step 4: Checking final deal state...');
    
    const finalDeal = await Deal.findById(dealId);
    
    if (!finalDeal) {
      errors.push('Deal not found after concurrent updates');
    } else {
      console.log(`\n   Final State:`);
      console.log(`   Stage: ${finalDeal.stage}`);
      console.log(`   Status: ${finalDeal.status}`);
      console.log(`   Activity Log Entries: ${finalDeal.activityLog.length}`);
      
      // Analyze inconsistency
      const hasConfirmPaymentLog = finalDeal.activityLog.some(log => log.action === 'payment_confirmed');
      const hasCancelLog = finalDeal.activityLog.some(log => log.action === 'deal_cancelled');
      
      if (hasConfirmPaymentLog && hasCancelLog) {
        errors.push('🚨 RACE CONDITION: Both payment_confirmed AND deal_cancelled in activity log!');
        console.error('\n❌ INCONSISTENCY DETECTED:');
        console.error('   Both operations were applied, resulting in contradictory state');
      }
      
      if (finalDeal.status === 'cancelled' && finalDeal.paymentDetails?.paymentDate) {
        errors.push('🚨 Cancelled deal has payment date (inconsistent state)');
        console.error('❌ Deal is cancelled but has payment date');
      }
      
      if (finalDeal.status === 'payment_received' && finalDeal.cancellationReason) {
        warnings.push('Deal has payment_received status but also has cancellation reason');
      }
      
      console.log('\n📊 Analysis:');
      console.log(`   Has payment confirmed log: ${hasConfirmPaymentLog ? '✅' : '❌'}`);
      console.log(`   Has cancellation log: ${hasCancelLog ? '✅' : '❌'}`);
      console.log(`   Both logs present: ${hasConfirmPaymentLog && hasCancelLog ? '❌ RACE CONDITION!' : '✅'}`);
    }
    
    steps.push({
      step: 'Verify Final State',
      success: finalDeal !== null,
      message: `Final state: ${finalDeal?.stage}/${finalDeal?.status}`,
      timestamp: new Date()
    });
    
    // ========== STEP 5: Test with optimistic locking (RECOMMENDED FIX) ==========
    console.log('\n📝 Step 5: Testing RECOMMENDED FIX (optimistic locking)...');
    console.log('   Creating new deal to test optimistic locking approach...\n');
    
    const deal2 = await testHelpers.createTestBuyerDeal({
      buyerUserId: testData.BUYER_USER_ID,
      buyerCompanyId: testData.BUYER_COMPANY_ID,
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      products: [{
        productId: testData.PRODUCT_2_ID,
        price: 8000
      }],
      shippingAddress: testData.createTestShippingAddress()
    });
    
    await Deal.updateOne(
      { _id: deal2._id },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'awaiting_payment'
        }
      }
    );
    
    // Optimistic locking approach
    const optimisticUpdatePromises = [
      // Update 1: Confirm payment WITH condition
      Deal.updateOne(
        { 
          _id: deal2._id,
          status: 'awaiting_payment' // ⬅️ Optimistic lock
        },
        {
          $set: { status: 'payment_received' }
        }
      ),
      
      // Update 2: Cancel WITH condition
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return Deal.updateOne(
          { 
            _id: deal2._id,
            status: 'awaiting_payment' // ⬅️ Optimistic lock
          },
          {
            $set: { 
              stage: 'cancelled',
              status: 'cancelled'
            }
          }
        );
      })()
    ];
    
    const optimisticResults = await Promise.all(optimisticUpdatePromises);
    
    console.log(`   With Optimistic Locking:`);
    console.log(`   Update 1 (confirm): modified ${optimisticResults[0].modifiedCount}`);
    console.log(`   Update 2 (cancel): modified ${optimisticResults[1].modifiedCount}`);
    
    const totalModified = optimisticResults[0].modifiedCount + optimisticResults[1].modifiedCount;
    
    if (totalModified === 1) {
      console.log('\n✅ OPTIMISTIC LOCKING WORKS: Only one update succeeded');
    } else if (totalModified === 2) {
      errors.push('Both updates succeeded - race condition still possible');
      console.log('\n❌ Both updates succeeded - race condition occurred');
    } else {
      warnings.push('No updates succeeded - unexpected result');
    }
    
    steps.push({
      step: 'Test Optimistic Lock',
      success: totalModified === 1,
      message: `Optimistic locking: ${totalModified} update(s) succeeded`,
      timestamp: new Date()
    });
    
    // ========== ANALYSIS ==========
    console.log('\n📊 ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Current Implementation:');
    console.log('  ❌ No optimistic locking on status updates');
    console.log('  ❌ Race conditions possible with concurrent requests');
    console.log('  ❌ Can result in inconsistent deal states');
    console.log('');
    console.log('Recommended Fix:');
    console.log('  ✅ Add current status to update query (optimistic lock)');
    console.log('  ✅ Check modifiedCount after update');
    console.log('  ✅ Return error if update failed (status changed by another operation)');
    console.log('  ✅ Use MongoDB transactions for multi-document updates');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 9 RESULTS                                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`Duration: ${duration}ms`);
    console.log(`Steps: ${steps.length}`);
    console.log(`Successful: ${steps.filter(s => s.success).length}`);
    console.log(`Failed: ${steps.filter(s => !s.success).length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
    }
    
    const success = errors.length === 0;
    console.log(`\n${success ? '✅ SCENARIO PASSED' : '❌ SCENARIO FAILED'}\n`);
    
    return {
      success,
      dealId,
      errors,
      warnings,
      duration,
      steps
    };
    
  } catch (error) {
    console.error('\n❌ SCENARIO FAILED WITH EXCEPTION:', error);
    errors.push(`Exception: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      success: false,
      dealId,
      errors,
      warnings,
      duration: Date.now() - startTime,
      steps
    };
  }
}

