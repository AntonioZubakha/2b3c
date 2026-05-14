/**
 * Scenario 2: Alternative Product Selection
 * LGDEAL предлагает альтернативный продукт, buyer принимает
 */

import { Types } from 'mongoose';
import * as testHelpers from '../helpers/testHelpers';
import * as testData from '../fixtures/testData';
import Deal from '../../../models/Deal';
import { IDeal } from '../../../types';
import { ScenarioResult, StepResult } from './01-buyer-to-lgdeal-happy-path';

export { ScenarioResult };

export async function runScenario(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: StepResult[] = [];
  
  let dealId: Types.ObjectId | undefined;
  let sellerDealId: Types.ObjectId | undefined;
  let altSellerDealId: Types.ObjectId | undefined;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 2: Alternative Product Selection                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // ========== STEP 1: Setup Test Data ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(2000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized successfully',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Create buyer-to-lgdeal deal ==========
    console.log('\n📝 Step 2: Creating buyer-to-lgdeal deal with original product...');
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
    
    steps.push({
      step: 'Create Deal',
      success: true,
      message: `Deal ${deal.dealNumber} created with original product`,
      timestamp: new Date()
    });
    
    // ========== STEP 3: Create lgdeal-to-seller deal for original product ==========
    console.log('\n📝 Step 3: Creating paired deal for original product (Seller A)...');
    const sellerDeal = await testHelpers.createTestSellerDeal({
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      sellerUserId: testData.SELLER_A_USER_ID,
      sellerCompanyId: testData.SELLER_COMPANY_A_ID,
      productId: testData.PRODUCT_1_ID,
      price: 5000,
      pairedDealId: dealId
    });
    
    sellerDealId = sellerDeal._id;
    
    // Link to buyer deal
    await Deal.updateOne(
      { _id: dealId },
      { $push: { pairedDealIds: sellerDealId } }
    );
    
    steps.push({
      step: 'Create Seller Deal',
      success: true,
      message: `Seller deal ${sellerDeal.dealNumber} created for original product`,
      timestamp: new Date()
    });
    
    // ========== STEP 4: Seller A не может поставить продукт ==========
    console.log('\n📝 Step 4: Simulating product unavailability from Seller A...');
    warnings.push('Original product from Seller A is unavailable');
    
    // Mark original product as unavailable
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'inactive', false);
    
    steps.push({
      step: 'Product Unavailable',
      success: true,
      message: 'Original product marked as unavailable',
      timestamp: new Date()
    });
    
    // ========== STEP 5: Create alternative deal with Seller B ==========
    console.log('\n📝 Step 5: Creating alternative deal with Seller B...');
    const altSellerDeal = await testHelpers.createTestSellerDeal({
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      sellerUserId: testData.SELLER_B_USER_ID,
      sellerCompanyId: testData.SELLER_COMPANY_B_ID,
      productId: testData.PRODUCT_ALT_1_ID,
      price: 5200, // Alternative is slightly more expensive
      pairedDealId: dealId
    });
    
    altSellerDealId = altSellerDeal._id;
    
    // Mark alternative product as OnDeal
    await testHelpers.updateProductStatus(testData.PRODUCT_ALT_1_ID, 'OnDeal', true, altSellerDealId);
    
    steps.push({
      step: 'Create Alternative Deal',
      success: true,
      message: `Alternative seller deal ${altSellerDeal.dealNumber} created`,
      timestamp: new Date()
    });
    
    // ========== STEP 6: Add alternative to buyer deal suggestions ==========
    console.log('\n📝 Step 6: Adding alternative product to buyer deal...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          'products.0.suggestedAlternatives': [{
            product: testData.PRODUCT_ALT_1_ID,
            pairedLgdealToSellerDealId: altSellerDealId
          }]
        },
        $push: {
          pairedDealIds: altSellerDealId
        }
      }
    );
    
    steps.push({
      step: 'Add Suggestion',
      success: true,
      message: 'Alternative product added to suggestions',
      timestamp: new Date()
    });
    
    // ========== STEP 7: LGDEAL selects alternative product ==========
    console.log('\n📝 Step 7: LGDEAL selects alternative product...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'alternative_product_proposed',
          'products.0.selectedAlternativeProduct': testData.PRODUCT_ALT_1_ID,
          'products.0.originalProductDetailsBeforeSwap': testData.testProducts.product1,
          'products.0.originalPriceBeforeSwap': 5000,
          'products.0.price': 5200, // New price
          amount: 5200 // Update total
        },
        $push: {
          activityLog: {
            action: 'alternative_product_selected',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Alternative product selected by LGDEAL',
            timestamp: new Date()
          }
        }
      }
    );
    
    const proposedValid = await testHelpers.verifyDealState(dealId, 'request', 'alternative_product_proposed');
    if (!proposedValid) {
      errors.push('Deal status after alternative proposal is incorrect');
    }
    
    steps.push({
      step: 'Select Alternative',
      success: proposedValid,
      message: 'Alternative product selected and proposed to buyer',
      timestamp: new Date()
    });
    
    // ========== STEP 8: Approve alternative seller deal ==========
    console.log('\n📝 Step 8: Seller B approves the alternative deal...');
    await Deal.updateOne(
      { _id: altSellerDealId },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'awaiting_invoice'
        },
        $push: {
          activityLog: {
            action: 'request_approved',
            performedBy: testData.SELLER_B_USER_ID,
            details: 'Request approved by Seller B',
            timestamp: new Date()
          }
        }
      }
    );
    
    steps.push({
      step: 'Approve Alt Deal',
      success: true,
      message: 'Alternative seller deal approved',
      timestamp: new Date()
    });
    
    // ========== STEP 9: Buyer accepts alternative product ==========
    console.log('\n📝 Step 9: Buyer accepts alternative product...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'awaiting_invoice',
          activePurchaseDealId: altSellerDealId // Track which seller deal is active
        },
        $push: {
          activityLog: {
            action: 'alternative_product_accepted',
            performedBy: testData.BUYER_USER_ID,
            details: 'Alternative product accepted by buyer',
            timestamp: new Date()
          }
        }
      }
    );
    
    const acceptedValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'awaiting_invoice');
    if (!acceptedValid) {
      errors.push('Deal state after accepting alternative is incorrect');
    }
    
    steps.push({
      step: 'Accept Alternative',
      success: acceptedValid,
      message: 'Buyer accepted alternative, moved to payment stage',
      timestamp: new Date()
    });
    
    // ========== STEP 10: Cancel original seller deal ==========
    console.log('\n📝 Step 10: Cancelling original seller deal...');
    await Deal.updateOne(
      { _id: sellerDealId },
      {
        $set: {
          stage: 'cancelled',
          status: 'cancelled',
          cancellationReason: 'Product unavailable, alternative selected'
        },
        $push: {
          activityLog: {
            action: 'deal_cancelled',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Deal cancelled - alternative product selected',
            timestamp: new Date()
          }
        }
      }
    );
    
    const sellerDealCancelled = await testHelpers.verifyDealState(sellerDealId!, 'cancelled', 'cancelled');
    if (!sellerDealCancelled) {
      errors.push('Original seller deal not properly cancelled');
    }
    
    steps.push({
      step: 'Cancel Original',
      success: sellerDealCancelled,
      message: 'Original seller deal cancelled',
      timestamp: new Date()
    });
    
    // ========== STEP 11: Continue with payment flow ==========
    console.log('\n📝 Step 11: Continuing with payment flow for alternative product...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: { status: 'invoice_pending' },
        $push: {
          activityLog: {
            action: 'invoice_uploaded',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Invoice uploaded for alternative product',
            timestamp: new Date()
          }
        }
      }
    );
    
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: { status: 'awaiting_payment' },
        $push: {
          activityLog: {
            action: 'invoice_accepted',
            performedBy: testData.BUYER_USER_ID,
            details: 'Invoice accepted',
            timestamp: new Date()
          }
        }
      }
    );
    
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: { 
          status: 'payment_received',
          'paymentDetails.amountPaid': 5200 // New amount
        },
        $push: {
          activityLog: {
            action: 'payment_confirmed',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Payment confirmed for $5200',
            timestamp: new Date()
          }
        }
      }
    );
    
    steps.push({
      step: 'Payment Flow',
      success: true,
      message: 'Invoice, payment flow completed',
      timestamp: new Date()
    });
    
    // ========== STEP 12: Complete deal ==========
    console.log('\n📝 Step 12: Completing the deal...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'completed',
          status: 'completed',
          completedAt: new Date()
        },
        $push: {
          activityLog: {
            action: 'delivery_confirmed',
            performedBy: testData.BUYER_USER_ID,
            details: 'Delivery confirmed by buyer',
            timestamp: new Date()
          }
        }
      }
    );
    
    // Mark alternative product as sold
    await testHelpers.updateProductStatus(testData.PRODUCT_ALT_1_ID, 'Sold', true, dealId);
    
    const completedValid = await testHelpers.verifyDealState(dealId, 'completed', 'completed');
    const altProductSold = await testHelpers.verifyProductStatus(testData.PRODUCT_ALT_1_ID, 'Sold', true);
    
    if (!completedValid) {
      errors.push('Deal not properly completed');
    }
    if (!altProductSold) {
      errors.push('Alternative product not marked as sold');
    }
    
    steps.push({
      step: 'Complete Deal',
      success: completedValid && altProductSold,
      message: 'Deal completed with alternative product',
      timestamp: new Date()
    });
    
    // ========== VERIFICATION: Check that original product is NOT sold ==========
    console.log('\n📝 Verification: Original product should remain inactive...');
    const originalProduct = await testHelpers.verifyProductStatus(testData.PRODUCT_1_ID, 'inactive', false);
    
    if (!originalProduct) {
      errors.push('Original product status is incorrect');
    }
    
    // ========== FINAL: Display final state ==========
    console.log('\n📊 Final State:');
    console.log('\n🔷 Buyer Deal:');
    await testHelpers.displayDealDetails(dealId);
    console.log('\n🔷 Alternative Seller Deal (Active):');
    await testHelpers.displayDealDetails(altSellerDealId!);
    console.log('\n🔷 Original Seller Deal (Cancelled):');
    await testHelpers.displayDealDetails(sellerDealId!);
    console.log('\n🔷 Alternative Product (Sold):');
    await testHelpers.displayProductDetails(testData.PRODUCT_ALT_1_ID);
    console.log('\n🔷 Original Product (Inactive):');
    await testHelpers.displayProductDetails(testData.PRODUCT_1_ID);
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 2 RESULTS                                            ║');
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

