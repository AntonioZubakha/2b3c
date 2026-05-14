/**
 * Scenario 4: Reject Alternative Product
 * Buyer отклоняет альтернативный продукт и возвращается к оригинальному
 */

import { Types } from 'mongoose';
import * as testHelpers from '../helpers/testHelpers';
import * as testData from '../fixtures/testData';
import Deal from '../../../models/Deal';
import Product from '../../../models/Product';
import { ScenarioResult, StepResult } from './01-buyer-to-lgdeal-happy-path';

export { ScenarioResult };

export async function runScenario(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: StepResult[] = [];
  
  let buyerDealId: Types.ObjectId | undefined;
  let originalSellerDealId: Types.ObjectId | undefined;
  let altSellerDealId: Types.ObjectId | undefined;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 4: Reject Alternative Product                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // ========== STEP 1: Setup ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(4000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Create buyer deal ==========
    console.log('\n📝 Step 2: Creating buyer deal...');
    const buyerDeal = await testHelpers.createTestBuyerDeal({
      buyerUserId: testData.BUYER_USER_ID,
      buyerCompanyId: testData.BUYER_COMPANY_ID,
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      products: [{
        productId: testData.PRODUCT_1_ID,
        price: 5000
      }],
      shippingAddress: testData.createTestShippingAddress()
    });
    
    buyerDealId = buyerDeal._id;
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'OnDeal', true, buyerDealId);
    
    steps.push({
      step: 'Create Deal',
      success: true,
      message: 'Buyer deal created',
      timestamp: new Date()
    });
    
    // ========== STEP 3: Create original seller deal ==========
    console.log('\n📝 Step 3: Creating original seller deal...');
    const originalSellerDeal = await testHelpers.createTestSellerDeal({
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      sellerUserId: testData.SELLER_A_USER_ID,
      sellerCompanyId: testData.SELLER_COMPANY_A_ID,
      productId: testData.PRODUCT_1_ID,
      price: 5000,
      pairedDealId: buyerDealId
    });
    originalSellerDealId = originalSellerDeal._id;
    
    steps.push({
      step: 'Create Original Seller Deal',
      success: true,
      message: 'Original seller deal created',
      timestamp: new Date()
    });
    
    // ========== STEP 4: Create alternative deal ==========
    console.log('\n📝 Step 4: Creating alternative seller deal...');
    const altSellerDeal = await testHelpers.createTestSellerDeal({
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      sellerUserId: testData.SELLER_B_USER_ID,
      sellerCompanyId: testData.SELLER_COMPANY_B_ID,
      productId: testData.PRODUCT_ALT_1_ID,
      price: 5200,
      pairedDealId: buyerDealId
    });
    altSellerDealId = altSellerDeal._id;
    
    await Deal.updateOne(
      { _id: buyerDealId },
      { 
        $set: { 
          pairedDealIds: [originalSellerDealId, altSellerDealId]
        } 
      }
    );
    
    steps.push({
      step: 'Create Alternative Deal',
      success: true,
      message: 'Alternative seller deal created',
      timestamp: new Date()
    });
    
    // ========== STEP 5: LGDEAL selects alternative ==========
    console.log('\n📝 Step 5: LGDEAL selects alternative product...');
    await Deal.updateOne(
      { _id: buyerDealId },
      {
        $set: {
          status: 'alternative_product_proposed',
          'products.0.selectedAlternativeProduct': testData.PRODUCT_ALT_1_ID,
          'products.0.originalProductDetailsBeforeSwap': testData.testProducts.product1,
          'products.0.originalPriceBeforeSwap': 5000,
          'products.0.originalShippingCostBeforeSwap': 0,
          'products.0.price': 5200,
          amount: 5200,
          'products.0.suggestedAlternatives': [{
            product: testData.PRODUCT_ALT_1_ID,
            pairedLgdealToSellerDealId: altSellerDealId
          }]
        },
        $push: {
          activityLog: {
            action: 'alternative_product_selected',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Alternative product selected',
            timestamp: new Date()
          }
        }
      }
    );
    
    const proposedValid = await testHelpers.verifyDealState(buyerDealId, 'request', 'alternative_product_proposed');
    if (!proposedValid) {
      errors.push('Deal status after alternative selection is incorrect');
    }
    
    steps.push({
      step: 'Select Alternative',
      success: proposedValid,
      message: 'Alternative product proposed to buyer',
      timestamp: new Date()
    });
    
    // ========== STEP 6: Buyer REJECTS alternative ==========
    console.log('\n📝 Step 6: 🚫 Buyer REJECTS alternative product...');
    console.log('   Expected: Return to original product and price');
    
    await Deal.updateOne(
      { _id: buyerDealId },
      {
        $set: {
          status: 'pending',
          stage: 'request',
          'products.0.selectedAlternativeProduct': null,
          'products.0.product': testData.PRODUCT_1_ID, // Revert to original
          'products.0.price': 5000, // Revert to original price
          amount: 5000, // Revert total amount
          activePurchaseDealId: null // Clear active purchase
        },
        $push: {
          activityLog: {
            action: 'alternative_product_rejected',
            performedBy: testData.BUYER_USER_ID,
            details: 'Buyer rejected alternative product. Reason: Prefer original',
            timestamp: new Date()
          }
        }
      }
    );
    
    const rejectedValid = await testHelpers.verifyDealState(buyerDealId, 'request', 'pending');
    if (!rejectedValid) {
      errors.push('Deal status after rejection is incorrect');
    }
    
    steps.push({
      step: 'Reject Alternative',
      success: rejectedValid,
      message: 'Alternative rejected, reverted to original',
      timestamp: new Date()
    });
    
    // ========== STEP 7: Verify product restoration ==========
    console.log('\n📝 Step 7: Verifying that deal reverted to original product...');
    
    const updatedDeal = await Deal.findById(buyerDealId);
    if (!updatedDeal) {
      errors.push('Deal not found after rejection');
    } else {
      const firstProduct = updatedDeal.products[0];
      
      // Verify product ID reverted
      if (firstProduct.product.toString() !== testData.PRODUCT_1_ID.toString()) {
        errors.push('❌ Product ID not reverted to original');
      } else {
        console.log('✅ Product ID correctly reverted to original');
      }
      
      // Verify price reverted
      if (firstProduct.price !== 5000) {
        errors.push(`❌ Price not reverted: expected 5000, got ${firstProduct.price}`);
      } else {
        console.log('✅ Price correctly reverted to $5000');
      }
      
      // Verify total amount reverted
      if (updatedDeal.amount !== 5000) {
        errors.push(`❌ Total amount not reverted: expected 5000, got ${updatedDeal.amount}`);
      } else {
        console.log('✅ Total amount correctly reverted to $5000');
      }
      
      // Check if original product is still available (ISSUE FROM AUDIT)
      const originalProduct = await Product.findById(testData.PRODUCT_1_ID);
      if (originalProduct?.status !== 'OnDeal') {
        warnings.push('⚠️  Original product not OnDeal - should check availability before reverting');
        console.log('⚠️  Original product status:', originalProduct?.status);
      }
    }
    
    steps.push({
      step: 'Verify Restoration',
      success: updatedDeal?.products[0]?.price === 5000,
      message: 'Deal reverted to original product and price',
      timestamp: new Date()
    });
    
    // ========== FINAL: Display final state ==========
    console.log('\n📊 Final State:');
    console.log('\n🔷 Buyer Deal (Reverted):');
    await testHelpers.displayDealDetails(buyerDealId);
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 4 RESULTS                                            ║');
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

