/**
 * Scenario 3: Deal Cancellation with Cascade
 * Проверка cascade отмены всех связанных сделок
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
  
  let buyerDealId: Types.ObjectId | undefined;
  let sellerDeal1Id: Types.ObjectId | undefined;
  let sellerDeal2Id: Types.ObjectId | undefined;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 3: Deal Cancellation with Cascade                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // ========== STEP 1: Setup Test Data ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(3000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized successfully',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Create buyer deal with 2 products ==========
    console.log('\n📝 Step 2: Creating buyer deal with 2 products...');
    const buyerDeal = await testHelpers.createTestBuyerDeal({
      buyerUserId: testData.BUYER_USER_ID,
      buyerCompanyId: testData.BUYER_COMPANY_ID,
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      products: [
        { productId: testData.PRODUCT_1_ID, price: 5000 },
        { productId: testData.PRODUCT_2_ID, price: 8000 }
      ],
      shippingAddress: testData.createTestShippingAddress()
    });
    
    buyerDealId = buyerDeal._id;
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'OnDeal', true, buyerDealId);
    await testHelpers.updateProductStatus(testData.PRODUCT_2_ID, 'OnDeal', true, buyerDealId);
    
    steps.push({
      step: 'Create Buyer Deal',
      success: true,
      message: `Buyer deal ${buyerDeal.dealNumber} created with 2 products ($13000)`,
      timestamp: new Date()
    });
    
    // ========== STEP 3: Create 2 paired seller deals ==========
    console.log('\n📝 Step 3: Creating 2 paired seller deals...');
    
    // Seller deal 1 (Product 1 from Seller A)
    const sellerDeal1 = await testHelpers.createTestSellerDeal({
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      sellerUserId: testData.SELLER_A_USER_ID,
      sellerCompanyId: testData.SELLER_COMPANY_A_ID,
      productId: testData.PRODUCT_1_ID,
      price: 5000,
      pairedDealId: buyerDealId
    });
    sellerDeal1Id = sellerDeal1._id;
    
    // Seller deal 2 (Product 2 from Seller A)
    const sellerDeal2 = await testHelpers.createTestSellerDeal({
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      sellerUserId: testData.SELLER_A_USER_ID,
      sellerCompanyId: testData.SELLER_COMPANY_A_ID,
      productId: testData.PRODUCT_2_ID,
      price: 8000,
      pairedDealId: buyerDealId
    });
    sellerDeal2Id = sellerDeal2._id;
    
    // Link to buyer deal
    await Deal.updateOne(
      { _id: buyerDealId },
      { 
        $set: { 
          pairedDealIds: [sellerDeal1Id, sellerDeal2Id] 
        } 
      }
    );
    
    steps.push({
      step: 'Create Seller Deals',
      success: true,
      message: `Created 2 paired seller deals`,
      timestamp: new Date()
    });
    
    // ========== STEP 4: Approve both seller deals ==========
    console.log('\n📝 Step 4: Seller A approves both deals...');
    await Deal.updateMany(
      { _id: { $in: [sellerDeal1Id, sellerDeal2Id] } },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'awaiting_invoice'
        },
        $push: {
          activityLog: {
            action: 'request_approved',
            performedBy: testData.SELLER_A_USER_ID,
            details: 'Request approved by Seller A',
            timestamp: new Date()
          }
        }
      }
    );
    
    steps.push({
      step: 'Approve Seller Deals',
      success: true,
      message: 'Both seller deals approved',
      timestamp: new Date()
    });
    
    // ========== STEP 5: Advance seller deal 1 to payment_received ==========
    console.log('\n📝 Step 5: Advancing Seller Deal 1 to payment_received...');
    await Deal.updateOne(
      { _id: sellerDeal1Id },
      {
        $set: { status: 'payment_received' },
        $push: {
          activityLog: {
            action: 'payment_confirmed',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'LGDEAL confirmed payment to Seller A',
            timestamp: new Date()
          }
        }
      }
    );
    
    steps.push({
      step: 'Payment to Seller 1',
      success: true,
      message: 'Seller Deal 1 moved to payment_received',
      timestamp: new Date()
    });
    
    // ========== STEP 6: Buyer cancels the main deal ==========
    console.log('\n📝 Step 6: ⚠️  Buyer cancels the main deal...');
    console.log('   Expected: Both seller deals should be cancelled via cascade');
    console.log('   ISSUE TO TEST: Seller Deal 1 already payment_received - should it be cancelled?');
    
    await Deal.updateOne(
      { _id: buyerDealId },
      {
        $set: {
          stage: 'cancelled',
          status: 'cancelled',
          cancellationReason: 'Buyer changed mind'
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
    
    const buyerDealCancelled = await testHelpers.verifyDealState(buyerDealId, 'cancelled', 'cancelled');
    if (!buyerDealCancelled) {
      errors.push('Buyer deal not properly cancelled');
    }
    
    steps.push({
      step: 'Cancel Main Deal',
      success: buyerDealCancelled,
      message: 'Main buyer deal cancelled',
      timestamp: new Date()
    });
    
    // ========== STEP 7: Verify cascade cancellation ==========
    console.log('\n📝 Step 7: Verifying cascade cancellation of seller deals...');
    
    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ (из аудита):
    // - Seller Deal 2 (status: awaiting_invoice) → ДОЛЖНА быть отменена
    // - Seller Deal 1 (status: payment_received) → НЕ ДОЛЖНА быть отменена (уже оплачена!)
    
    const finalSellerDeal1 = await Deal.findById(sellerDeal1Id);
    const finalSellerDeal2 = await Deal.findById(sellerDeal2Id);
    
    if (!finalSellerDeal1 || !finalSellerDeal2) {
      errors.push('Seller deals not found');
    } else {
      // Check Seller Deal 1 (payment_received)
      if (finalSellerDeal1.status === 'cancelled') {
        errors.push('🚨 CRITICAL: Seller Deal 1 was cancelled despite being payment_received!');
        console.error('❌ Seller Deal 1 should NOT be cancelled (payment already received)');
      } else {
        console.log('✅ Seller Deal 1 correctly remains active (payment_received)');
      }
      
      // Check Seller Deal 2 (awaiting_invoice)
      if (finalSellerDeal2.status !== 'cancelled') {
        warnings.push('Seller Deal 2 was NOT cancelled (expected cascade cancellation)');
        console.error('⚠️  Seller Deal 2 should be cancelled via cascade');
      } else {
        console.log('✅ Seller Deal 2 correctly cancelled via cascade');
      }
    }
    
    steps.push({
      step: 'Verify Cascade',
      success: finalSellerDeal1?.status !== 'cancelled' && finalSellerDeal2?.status === 'cancelled',
      message: 'Cascade cancellation behavior verified',
      timestamp: new Date()
    });
    
    // ========== STEP 8: Verify product statuses ==========
    console.log('\n📝 Step 8: Verifying product statuses after cancellation...');
    
    const product1 = await testHelpers.verifyProductStatus(testData.PRODUCT_1_ID, 'available', false);
    const product2 = await testHelpers.verifyProductStatus(testData.PRODUCT_2_ID, 'available', false);
    
    if (!product1 || !product2) {
      errors.push('Products not returned to available status');
    }
    
    steps.push({
      step: 'Verify Products',
      success: product1 && product2,
      message: 'Products returned to available status',
      timestamp: new Date()
    });
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 3 RESULTS                                            ║');
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
      dealId: buyerDealId,
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
      dealId: buyerDealId,
      errors,
      warnings,
      duration: Date.now() - startTime,
      steps
    };
  }
}

