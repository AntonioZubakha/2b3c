/**
 * Scenario 1: Happy Path - Buyer to LGDEAL Deal
 * Полный успешный flow от создания сделки до доставки
 */

import { Types } from 'mongoose';
import * as testHelpers from '../helpers/testHelpers';
import * as testData from '../fixtures/testData';
import Deal from '../../../models/Deal';
import { IDeal } from '../../../types';

export interface ScenarioResult {
  success: boolean;
  dealId?: Types.ObjectId;
  errors: string[];
  warnings: string[];
  duration: number;
  steps: StepResult[];
}

export interface StepResult {
  step: string;
  success: boolean;
  message: string;
  timestamp: Date;
}

export async function runScenario(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: StepResult[] = [];
  
  let dealId: Types.ObjectId | undefined;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 1: Happy Path - Buyer to LGDEAL Deal               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // ========== STEP 1: Setup Test Data ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(1000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized successfully',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Buyer adds product to cart ==========
    console.log('\n📝 Step 2: Buyer adds product to cart...');
    await testHelpers.addProductToCart(
      testData.BUYER_USER_ID,
      testData.PRODUCT_1_ID
    );
    
    steps.push({
      step: 'Add to Cart',
      success: true,
      message: 'Product added to cart',
      timestamp: new Date()
    });
    
    // ========== STEP 3: Create buyer-to-lgdeal deal ==========
    console.log('\n📝 Step 3: Creating buyer-to-lgdeal deal...');
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
    await testHelpers.displayDealDetails(dealId);
    
    // Verify initial state
    const stateValid = await testHelpers.verifyDealState(dealId, 'request', 'pending');
    if (!stateValid) {
      errors.push('Initial deal state is incorrect');
    }
    
    steps.push({
      step: 'Create Deal',
      success: stateValid,
      message: `Deal ${deal.dealNumber} created with status pending`,
      timestamp: new Date()
    });
    
    // ========== STEP 4: Mark product as OnDeal ==========
    console.log('\n📝 Step 4: Marking product as OnDeal...');
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'OnDeal', true, dealId);
    
    const productStatusValid = await testHelpers.verifyProductStatus(testData.PRODUCT_1_ID, 'OnDeal', true);
    if (!productStatusValid) {
      errors.push('Product status not updated correctly');
    }
    
    steps.push({
      step: 'Update Product Status',
      success: productStatusValid,
      message: 'Product marked as OnDeal',
      timestamp: new Date()
    });
    
    // ========== STEP 5: LGDEAL approves request ==========
    console.log('\n📝 Step 5: LGDEAL approves request...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'awaiting_invoice'
        },
        $push: {
          activityLog: {
            action: 'request_approved',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Request approved by LGDEAL supervisor',
            timestamp: new Date()
          }
        }
      }
    );
    
    const approvedStateValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'awaiting_invoice');
    if (!approvedStateValid) {
      errors.push('Deal state after approval is incorrect');
    }
    
    steps.push({
      step: 'Approve Request',
      success: approvedStateValid,
      message: 'Request approved, moved to payment_delivery stage',
      timestamp: new Date()
    });
    
    // ========== STEP 6: LGDEAL uploads invoice ==========
    console.log('\n📝 Step 6: LGDEAL uploads invoice...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'invoice_pending',
          'paymentDetails.invoiceFilename': 'test-invoice.pdf',
          'paymentDetails.uploadedByCompany': testData.LGDEAL_COMPANY_ID.toString()
        },
        $push: {
          activityLog: {
            action: 'invoice_uploaded',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Invoice uploaded',
            timestamp: new Date()
          }
        }
      }
    );
    
    const invoiceUploadedValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'invoice_pending');
    if (!invoiceUploadedValid) {
      errors.push('Deal status after invoice upload is incorrect');
    }
    
    steps.push({
      step: 'Upload Invoice',
      success: invoiceUploadedValid,
      message: 'Invoice uploaded successfully',
      timestamp: new Date()
    });
    
    // ========== STEP 7: Buyer accepts invoice ==========
    console.log('\n📝 Step 7: Buyer accepts invoice...');
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
            details: 'Invoice accepted by buyer',
            timestamp: new Date()
          }
        }
      }
    );
    
    const invoiceAcceptedValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'awaiting_payment');
    if (!invoiceAcceptedValid) {
      errors.push('Deal status after invoice acceptance is incorrect');
    }
    
    steps.push({
      step: 'Accept Invoice',
      success: invoiceAcceptedValid,
      message: 'Invoice accepted, awaiting payment',
      timestamp: new Date()
    });
    
    // ========== STEP 8: LGDEAL confirms payment received ==========
    console.log('\n📝 Step 8: LGDEAL confirms payment received...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'payment_received',
          'paymentDetails.status': 'paid',
          'paymentDetails.paymentDate': new Date(),
          'paymentDetails.amountPaid': 5000
        },
        $push: {
          activityLog: {
            action: 'payment_confirmed',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Payment confirmed by LGDEAL',
            timestamp: new Date()
          }
        }
      }
    );
    
    const paymentConfirmedValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'payment_received');
    if (!paymentConfirmedValid) {
      errors.push('Deal status after payment confirmation is incorrect');
    }
    
    steps.push({
      step: 'Confirm Payment',
      success: paymentConfirmedValid,
      message: 'Payment confirmed',
      timestamp: new Date()
    });
    
    // ========== STEP 9: LGDEAL adds tracking number ==========
    console.log('\n📝 Step 9: LGDEAL adds tracking number...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          status: 'shipped',
          'shippingDetails.trackingNumber': 'TEST-TRACK-123456',
          'shippingDetails.status': 'shipped'
        },
        $push: {
          activityLog: {
            action: 'tracking_number_added',
            performedBy: testData.LGDEAL_SUPERVISOR_ID,
            details: 'Tracking number added: TEST-TRACK-123456',
            timestamp: new Date()
          }
        }
      }
    );
    
    const shippedValid = await testHelpers.verifyDealState(dealId, 'payment_delivery', 'shipped');
    if (!shippedValid) {
      errors.push('Deal status after shipping is incorrect');
    }
    
    steps.push({
      step: 'Add Tracking',
      success: shippedValid,
      message: 'Tracking number added, package shipped',
      timestamp: new Date()
    });
    
    // ========== STEP 10: Buyer confirms delivery ==========
    console.log('\n📝 Step 10: Buyer confirms delivery...');
    await Deal.updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'completed',
          status: 'completed',
          completedAt: new Date(),
          'shippingDetails.deliveredDate': new Date(),
          'shippingDetails.deliveryConfirmedBy': testData.BUYER_USER_ID
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
    
    // Mark product as sold
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'Sold', true, dealId);
    
    const completedValid = await testHelpers.verifyDealState(dealId, 'completed', 'completed');
    const productSoldValid = await testHelpers.verifyProductStatus(testData.PRODUCT_1_ID, 'Sold', true);
    
    if (!completedValid) {
      errors.push('Deal not properly completed');
    }
    if (!productSoldValid) {
      errors.push('Product not marked as sold');
    }
    
    steps.push({
      step: 'Confirm Delivery',
      success: completedValid && productSoldValid,
      message: 'Delivery confirmed, deal completed',
      timestamp: new Date()
    });
    
    // ========== FINAL: Display final state ==========
    console.log('\n📊 Final Deal State:');
    await testHelpers.displayDealDetails(dealId);
    await testHelpers.displayProductDetails(testData.PRODUCT_1_ID);
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 1 RESULTS                                            ║');
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

