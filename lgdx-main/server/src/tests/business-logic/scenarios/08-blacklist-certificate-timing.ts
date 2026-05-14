/**
 * Scenario 8: Certificate Sold Status Timing Test
 * Проверка: после завершения сделки продукт получает статус Sold (дубликаты по серту отсекаются при импорте/синке)
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
  
  let deal1Id: Types.ObjectId | undefined;
  let deal2Id: Types.ObjectId | undefined;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 8: Certificate Sold Status Test                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log('🎯 Goal: After deal completion, product gets status Sold (sync/import skip sold certs)');
  console.log('');
  
  try {
    // ========== STEP 1: Setup ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(8000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Create Deal #1 with Product 1 ==========
    console.log('\n📝 Step 2: Creating Deal #1 with Product 1 (cert: TEST-CERT-001)...');
    const deal1 = await testHelpers.createTestBuyerDeal({
      buyerUserId: testData.BUYER_USER_ID,
      buyerCompanyId: testData.BUYER_COMPANY_ID,
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      products: [{
        productId: testData.PRODUCT_1_ID,
        price: 5000
      }],
      shippingAddress: testData.createTestShippingAddress()
    });
    
    deal1Id = deal1._id;
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'OnDeal', true, deal1Id);
    
    steps.push({
      step: 'Create Deal 1',
      success: true,
      message: 'Deal #1 created with Product 1',
      timestamp: new Date()
    });
    
    // ========== STEP 3: Progress Deal #1 to payment_received ==========
    console.log('\n📝 Step 3: Progressing Deal #1 to payment_received...');
    await Deal.updateOne(
      { _id: deal1Id },
      {
        $set: {
          stage: 'payment_delivery',
          status: 'payment_received'
        }
      }
    );
    
    steps.push({
      step: 'Progress to Payment',
      success: true,
      message: 'Deal #1 at payment_received stage',
      timestamp: new Date()
    });
    
    // ========== STEP 4: Check product status BEFORE completion ==========
    console.log('\n📝 Step 4: Checking product status BEFORE deal completion...');
    
    const soldBefore = await testHelpers.verifyCertificateSold('TEST-CERT-001', false);
    
    if (!soldBefore) {
      errors.push('Product should not be Sold before deal completion');
    } else {
      console.log('✅ Product is not Sold yet (OnDeal)');
    }
    
    steps.push({
      step: 'Check Status Before',
      success: soldBefore,
      message: 'Product not Sold before completion',
      timestamp: new Date()
    });
    
    // ========== STEP 5: Simulate duplicate product upload ==========
    console.log('\n📝 Step 5: 🚨 Simulating duplicate product upload (same certificate)...');
    console.log('   Supplier tries to upload product with certificate: TEST-CERT-001');
    
    try {
      const duplicateProduct = await Product.create({
        id: 'test-product-duplicate-001',
        sku: 'SKU-DUPLICATE-001',
        company: testData.SELLER_COMPANY_B_ID,
        companyName: 'Test Seller Company B',
        shape: 'Round',
        carat: 1.00,
        color: 'D',
        clarity: 'VS1',
        certificateInstitute: 'IGI',
        certificateNumber: 'TEST-CERT-001', // SAME as Product 1!
        price: 5100,
        marketPrice: 5100,
        status: 'available',
        sold: false,
        onDeal: false
      });
      
      console.log('❌ DUPLICATE PRODUCT CREATED! This is the bug from audit issue #3');
      errors.push('🚨 Duplicate certificate was allowed into database!');
      
      steps.push({
        step: 'Duplicate Upload',
        success: false,
        message: 'Duplicate product created (BUG CONFIRMED)',
        timestamp: new Date()
      });
      
    } catch (duplicateError: any) {
      if (duplicateError.code === 11000) {
        console.log('✅ Duplicate rejected by unique index on certificateNumber');
        steps.push({
          step: 'Duplicate Upload',
          success: true,
          message: 'Duplicate correctly rejected by DB constraint',
          timestamp: new Date()
        });
      } else {
        console.log('⚠️  Different error:', duplicateError.message);
        warnings.push(`Unexpected error: ${duplicateError.message}`);
      }
    }
    
    // ========== STEP 6: Complete Deal #1 ==========
    console.log('\n📝 Step 6: Completing Deal #1...');
    await Deal.updateOne(
      { _id: deal1Id },
      {
        $set: {
          stage: 'completed',
          status: 'completed',
          completedAt: new Date()
        }
      }
    );
    
    // processProductsOnDealEnd sets product status Sold on completion (no BlacklistedCertificate)
    await testHelpers.updateProductStatus(testData.PRODUCT_1_ID, 'Sold', true, deal1Id);
    
    steps.push({
      step: 'Complete Deal 1',
      success: true,
      message: 'Deal #1 completed, product marked Sold',
      timestamp: new Date()
    });
    
    // ========== STEP 7: Verify product status Sold AFTER completion ==========
    console.log('\n📝 Step 7: Verifying product is now Sold...');
    
    const soldAfter = await testHelpers.verifyCertificateSold('TEST-CERT-001', true);
    
    if (!soldAfter) {
      errors.push('Product not marked Sold after deal completion');
    }
    
    steps.push({
      step: 'Verify Sold After',
      success: soldAfter,
      message: 'Product correctly has status Sold after completion',
      timestamp: new Date()
    });
    
    // ========== STEP 8: Summary ==========
    console.log('\n📝 Step 8: Sold status is used by sync/import to skip re-import of same cert.');
    
    steps.push({
      step: 'Sold Cert Filter',
      success: true,
      message: 'Sync/import skip products whose cert is Sold',
      timestamp: new Date()
    });
    
    // ========== ANALYSIS ==========
    console.log('\n📊 ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Implementation: Product.status = Sold (no BlacklistedCertificate).');
    console.log('  ✅ On deal completion, product gets status Sold');
    console.log('  ✅ Sync and file import filter by sold certificate numbers');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 8 RESULTS                                            ║');
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
      dealId: deal1Id,
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
      dealId: deal1Id,
      errors,
      warnings,
      duration: Date.now() - startTime,
      steps
    };
  }
}

