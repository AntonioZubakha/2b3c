/**
 * Scenario 5: Invoice Rejection and Re-upload
 * Seller загружает invoice, buyer отклоняет, seller загружает новый
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
  console.log('║  SCENARIO 5: Invoice Rejection and Re-upload Cycle            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // ========== STEP 1: Setup ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(5000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Create and approve deal ==========
    console.log('\n📝 Step 2: Creating and approving deal...');
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
    
    // Approve deal
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'awaiting_invoice'
        }
      }
    );
    
    steps.push({
      step: 'Create & Approve',
      success: true,
      message: 'Deal created and approved',
      timestamp: new Date()
    });
    
    // ========== STEP 3: LGDEAL uploads first invoice ==========
    console.log('\n📝 Step 3: LGDEAL uploads first invoice...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'invoice_pending',
          'paymentDetails.invoiceFilename': 'invoice-v1.pdf',
          'paymentDetails.uploadedByCompany': testData.LGDEAL_COMPANY_ID.toString()
        },
        $push: {
          activityLog: {
            action: 'invoice_uploaded',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'First invoice uploaded',
            timestamp: new Date()
          }
        }
      }
    );
    
    steps.push({
      step: 'Upload Invoice v1',
      success: true,
      message: 'First invoice uploaded',
      timestamp: new Date()
    });
    
    // ========== STEP 4: Buyer REJECTS invoice ==========
    console.log('\n📝 Step 4: 🚫 Buyer REJECTS invoice...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'awaiting_invoice', // Revert to awaiting
          'paymentDetails.invoiceFilename': null
        },
        $push: {
          'paymentDetails.rejectedInvoices': {
            date: new Date(),
            reason: 'Incorrect amount shown',
            rejectedBy: testData.BUYER_USER_ID,
            originalFilename: 'invoice-v1.pdf'
          },
          activityLog: {
            action: 'invoice_rejected',
            performedBy: testData.BUYER_USER_ID,
            details: 'Invoice rejected. Reason: Incorrect amount shown',
            timestamp: new Date()
          }
        }
      }
    );
    
    const rejectedValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'awaiting_invoice');
    if (!rejectedValid) {
      errors.push('Deal status after invoice rejection is incorrect');
    }
    
    steps.push({
      step: 'Reject Invoice',
      success: rejectedValid,
      message: 'Invoice rejected, back to awaiting_invoice',
      timestamp: new Date()
    });
    
    // ========== STEP 5: LGDEAL uploads corrected invoice ==========
    console.log('\n📝 Step 5: LGDEAL uploads corrected invoice (v2)...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'invoice_pending',
          'paymentDetails.invoiceFilename': 'invoice-v2-corrected.pdf'
        },
        $push: {
          activityLog: {
            action: 'invoice_uploaded',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Corrected invoice uploaded (v2)',
            timestamp: new Date()
          }
        }
      }
    );
    
    steps.push({
      step: 'Upload Invoice v2',
      success: true,
      message: 'Corrected invoice uploaded',
      timestamp: new Date()
    });
    
    // ========== STEP 6: Buyer accepts corrected invoice ==========
    console.log('\n📝 Step 6: Buyer accepts corrected invoice...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'awaiting_payment'
        },
        $push: {
          activityLog: {
            action: 'invoice_accepted',
            performedBy: testData.BUYER_USER_ID,
            details: 'Corrected invoice accepted',
            timestamp: new Date()
          }
        }
      }
    );
    
    const acceptedValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'awaiting_payment');
    if (!acceptedValid) {
      errors.push('Deal status after accepting corrected invoice is incorrect');
    }
    
    steps.push({
      step: 'Accept Corrected Invoice',
      success: acceptedValid,
      message: 'Corrected invoice accepted',
      timestamp: new Date()
    });
    
    // ========== STEP 7: Verify rejection history ==========
    console.log('\n📝 Step 7: Verifying rejection history...');
    
    const dealData = await Deal.findById(dealId);
    const rejectedInvoices = dealData?.paymentDetails?.rejectedInvoices || [];
    
    if (rejectedInvoices.length !== 1) {
      errors.push(`Expected 1 rejected invoice, found ${rejectedInvoices.length}`);
    } else {
      console.log('✅ Rejection history correctly saved');
      console.log(`   Rejected: ${rejectedInvoices[0].originalFilename}`);
      console.log(`   Reason: ${rejectedInvoices[0].reason}`);
    }
    
    steps.push({
      step: 'Verify History',
      success: rejectedInvoices.length === 1,
      message: 'Rejection history verified',
      timestamp: new Date()
    });
    
    // ========== FINAL: Complete deal ==========
    console.log('\n📝 Step 8: Completing deal...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'payment_received'
        }
      }
    );
    
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'shipped',
          'shippingDetails.trackingNumber': 'TEST-TRACK-567890'
        }
      }
    );
    
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'completed',
          status: 'completed',
          completedAt: new Date()
        }
      }
    );
    
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'Sold', true, dealId);
    
    const completedValid = await testHelpers.verifyDealState(dealId, 'completed', 'completed');
    
    steps.push({
      step: 'Complete Deal',
      success: completedValid,
      message: 'Deal completed successfully',
      timestamp: new Date()
    });
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 5 RESULTS                                            ║');
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

