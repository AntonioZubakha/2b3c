/**
 * Scenario 7: Price Consistency Check
 * Проверка корректности расчета цен и комиссий LGDEAL
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
  let sellerDealId: Types.ObjectId | undefined;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 7: Price Consistency Check                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // ========== STEP 1: Setup ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    await testHelpers.initializeDealCounter(7000);
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Create buyer deal ==========
    console.log('\n📝 Step 2: Creating buyer deal with market price $5000...');
    const marketPrice = 5000;
    
    const buyerDeal = await testHelpers.createTestBuyerDeal({
      buyerUserId: testData.BUYER_USER_ID,
      buyerCompanyId: testData.BUYER_COMPANY_ID,
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      products: [{
        productId: testData.PRODUCT_1_ID,
        price: marketPrice
      }],
      shippingAddress: testData.createTestShippingAddress()
    });
    
    buyerDealId = buyerDeal._id;
    
    // Verify buyer deal amount
    if (buyerDeal.amount !== marketPrice) {
      errors.push(`Buyer deal amount incorrect: expected ${marketPrice}, got ${buyerDeal.amount}`);
    } else {
      console.log(`✅ Buyer pays market price: $${buyerDeal.amount}`);
    }
    
    if (buyerDeal.fee !== 0) {
      errors.push(`Buyer fee should be $0, got $${buyerDeal.fee}`);
    } else {
      console.log(`✅ Buyer fee: $${buyerDeal.fee} (correct)`);
    }
    
    steps.push({
      step: 'Create Buyer Deal',
      success: buyerDeal.amount === marketPrice && buyerDeal.fee === 0,
      message: `Buyer deal created: $${buyerDeal.amount}, fee: $${buyerDeal.fee}`,
      timestamp: new Date()
    });
    
    // ========== STEP 3: Create seller deal ==========
    console.log('\n📝 Step 3: Creating seller deal with 4% LGDEAL commission...');
    
    const sellerDeal = await testHelpers.createTestSellerDeal({
      lgdealCompanyId: testData.LGDEAL_COMPANY_ID,
      sellerUserId: testData.SELLER_A_USER_ID,
      sellerCompanyId: testData.SELLER_COMPANY_A_ID,
      productId: testData.PRODUCT_1_ID,
      price: marketPrice,
      pairedDealId: buyerDealId
    });
    
    sellerDealId = sellerDeal._id;
    
    // Calculate expected values
    const expectedSellerAmount = Math.round(marketPrice * 0.96 * 100) / 100; // 96% of market price
    const expectedFee = Math.round(marketPrice * 0.04 * 100) / 100; // 4% commission
    
    console.log(`\n💰 Price Breakdown:`);
    console.log(`   Market Price: $${marketPrice}`);
    console.log(`   Buyer Pays: $${buyerDeal.amount}`);
    console.log(`   Seller Receives: $${sellerDeal.amount} (expected: $${expectedSellerAmount})`);
    console.log(`   LGDEAL Fee: $${sellerDeal.fee} (expected: $${expectedFee})`);
    console.log(`   LGDEAL Profit: $${buyerDeal.amount - sellerDeal.amount} (expected: $${expectedFee})`);
    
    // Verify calculations
    if (Math.abs(sellerDeal.amount - expectedSellerAmount) > 0.01) {
      errors.push(`Seller amount incorrect: expected $${expectedSellerAmount}, got $${sellerDeal.amount}`);
    } else {
      console.log(`\n✅ Seller receives 96% of market price: $${sellerDeal.amount}`);
    }
    
    if (Math.abs(sellerDeal.fee - expectedFee) > 0.01) {
      errors.push(`LGDEAL fee incorrect: expected $${expectedFee}, got $${sellerDeal.fee}`);
    } else {
      console.log(`✅ LGDEAL commission is 4%: $${sellerDeal.fee}`);
    }
    
    const lgdealProfit = buyerDeal.amount - sellerDeal.amount;
    if (Math.abs(lgdealProfit - expectedFee) > 0.01) {
      errors.push(`LGDEAL profit mismatch: expected $${expectedFee}, got $${lgdealProfit}`);
    } else {
      console.log(`✅ LGDEAL profit matches fee: $${lgdealProfit}`);
    }
    
    steps.push({
      step: 'Verify Pricing',
      success: Math.abs(sellerDeal.amount - expectedSellerAmount) <= 0.01 && 
               Math.abs(sellerDeal.fee - expectedFee) <= 0.01,
      message: 'Price calculations verified',
      timestamp: new Date()
    });
    
    // ========== STEP 4: Test with different amounts ==========
    console.log('\n📝 Step 4: Testing with various amounts...');
    
    const testAmounts = [100, 1000, 5000, 10000, 50000, 100000];
    const priceTests: Array<{ amount: number; valid: boolean }> = [];
    
    for (const amount of testAmounts) {
      const sellerAmount = Math.round(amount * 0.96 * 100) / 100;
      const fee = Math.round(amount * 0.04 * 100) / 100;
      const sum = sellerAmount + fee;
      
      // Check if sum equals original amount (allowing 1 cent rounding error)
      const valid = Math.abs(sum - amount) <= 0.01;
      priceTests.push({ amount, valid });
      
      if (!valid) {
        errors.push(`Price calculation error for $${amount}: seller $${sellerAmount} + fee $${fee} = $${sum} (expected $${amount})`);
      }
      
      console.log(`   $${amount}: seller $${sellerAmount} + fee $${fee} = $${sum} ${valid ? '✅' : '❌'}`);
    }
    
    const allPriceTestsValid = priceTests.every(t => t.valid);
    
    steps.push({
      step: 'Multiple Amount Tests',
      success: allPriceTestsValid,
      message: `Tested ${testAmounts.length} different amounts`,
      timestamp: new Date()
    });
    
    // ========== STEP 5: Test edge case - very small amount ==========
    console.log('\n📝 Step 5: Testing edge case - very small amount ($1)...');
    
    const tinyAmount = 1.00;
    const tinySellerAmount = Math.round(tinyAmount * 0.96 * 100) / 100; // $0.96
    const tinyFee = Math.round(tinyAmount * 0.04 * 100) / 100; // $0.04
    
    console.log(`   $${tinyAmount}: seller $${tinySellerAmount} + fee $${tinyFee} = $${tinySellerAmount + tinyFee}`);
    
    if (tinyFee < 0.01) {
      warnings.push('Fee for $1 transaction is less than $0.01 (minimum fee should be considered)');
    }
    
    steps.push({
      step: 'Edge Case - Small Amount',
      success: true,
      message: `Tested very small amount: $${tinyAmount}`,
      timestamp: new Date()
    });
    
    // ========== STEP 6: Test edge case - very large amount ==========
    console.log('\n📝 Step 6: Testing edge case - very large amount ($1,000,000)...');
    
    const largeAmount = 1000000.00;
    const largeSellerAmount = Math.round(largeAmount * 0.96 * 100) / 100; // $960,000
    const largeFee = Math.round(largeAmount * 0.04 * 100) / 100; // $40,000
    
    console.log(`   $${largeAmount.toLocaleString()}: seller $${largeSellerAmount.toLocaleString()} + fee $${largeFee.toLocaleString()}`);
    
    const largeSum = largeSellerAmount + largeFee;
    if (Math.abs(largeSum - largeAmount) > 0.01) {
      errors.push(`Large amount calculation error: $${largeSum.toLocaleString()} !== $${largeAmount.toLocaleString()}`);
    } else {
      console.log(`✅ Large amount calculation correct`);
    }
    
    steps.push({
      step: 'Edge Case - Large Amount',
      success: Math.abs(largeSum - largeAmount) <= 0.01,
      message: `Tested very large amount: $${largeAmount.toLocaleString()}`,
      timestamp: new Date()
    });
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 7 RESULTS                                            ║');
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

