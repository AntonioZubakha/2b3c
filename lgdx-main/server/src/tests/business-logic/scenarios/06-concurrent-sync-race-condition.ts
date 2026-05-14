/**
 * Scenario 6: Concurrent Product Sync Race Condition Test
 * Тестирует проблему одновременной синхронизации из разных источников
 */

import { Types } from 'mongoose';
import * as testHelpers from '../helpers/testHelpers';
import * as testData from '../fixtures/testData';
import Product from '../../../models/Product';
import { ScenarioResult, StepResult } from './01-buyer-to-lgdeal-happy-path';

export { ScenarioResult };

export async function runScenario(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: StepResult[] = [];
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 6: Concurrent Sync Race Condition Test              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // ========== STEP 1: Setup ==========
    console.log('📝 Step 1: Setting up test data...');
    await testHelpers.cleanupTestData();
    await testHelpers.insertTestCompanies(testData.getAllTestCompanies());
    await testHelpers.insertTestUsers(testData.getAllTestUsers());
    await testHelpers.insertTestProducts(testData.getAllTestProducts());
    
    steps.push({
      step: 'Setup',
      success: true,
      message: 'Test data initialized',
      timestamp: new Date()
    });
    
    // ========== STEP 2: Initial product count ==========
    console.log('\n📝 Step 2: Checking initial product count...');
    const initialCount = await Product.countDocuments({ 
      company: testData.SELLER_COMPANY_A_ID 
    });
    
    console.log(`   Initial products for Seller A: ${initialCount}`);
    
    steps.push({
      step: 'Initial Count',
      success: true,
      message: `Initial product count: ${initialCount}`,
      timestamp: new Date()
    });
    
    // ========== STEP 3: Simulate concurrent sync (replace mode) ==========
    console.log('\n📝 Step 3: Simulating concurrent syncs in REPLACE mode...');
    console.log('   ⚠️  This tests the race condition from audit item #4');
    console.log('   Three sources try to sync simultaneously:');
    console.log('   - Source 1: Web UI upload (1000 products)');
    console.log('   - Source 2: FTP upload (1500 products)');
    console.log('   - Source 3: API sync (2000 products)');
    
    warnings.push('Testing race condition - no distributed lock implemented');
    
    // Simulate parallel deletes (what would happen without locking)
    const deletePromises = [
      // Sync 1: Delete all, insert 1000
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
        const deleted1 = await Product.deleteMany({ company: testData.SELLER_COMPANY_A_ID });
        console.log(`   [Sync 1] Deleted ${deleted1.deletedCount} products`);
        
        // Insert new products
        const newProducts = Array.from({ length: 10 }, (_, i) => ({
          id: `sync1-product-${i}`,
          sku: `SYNC1-${i}`,
          company: testData.SELLER_COMPANY_A_ID,
          certificateNumber: `SYNC1-CERT-${i}`,
          certificateInstitute: 'IGI',
          shape: 'Round',
          carat: 1.0 + (i * 0.1),
          color: 'D',
          clarity: 'VS1',
          price: 5000 + (i * 100),
          marketPrice: 5000 + (i * 100),
          status: 'available',
          sold: false,
          onDeal: false
        }));
        
        await Product.insertMany(newProducts);
        console.log(`   [Sync 1] Inserted 10 products`);
      })(),
      
      // Sync 2: Delete all, insert 1500
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 15)); // Slightly different delay
        const deleted2 = await Product.deleteMany({ company: testData.SELLER_COMPANY_A_ID });
        console.log(`   [Sync 2] Deleted ${deleted2.deletedCount} products`);
        
        const newProducts = Array.from({ length: 15 }, (_, i) => ({
          id: `sync2-product-${i}`,
          sku: `SYNC2-${i}`,
          company: testData.SELLER_COMPANY_A_ID,
          certificateNumber: `SYNC2-CERT-${i}`,
          certificateInstitute: 'GIA',
          shape: 'Princess',
          carat: 1.5 + (i * 0.1),
          color: 'E',
          clarity: 'VVS2',
          price: 7000 + (i * 100),
          marketPrice: 7000 + (i * 100),
          status: 'available',
          sold: false,
          onDeal: false
        }));
        
        await Product.insertMany(newProducts);
        console.log(`   [Sync 2] Inserted 15 products`);
      })(),
      
      // Sync 3: Delete all, insert 2000
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 20)); // Different delay
        const deleted3 = await Product.deleteMany({ company: testData.SELLER_COMPANY_A_ID });
        console.log(`   [Sync 3] Deleted ${deleted3.deletedCount} products`);
        
        const newProducts = Array.from({ length: 20 }, (_, i) => ({
          id: `sync3-product-${i}`,
          sku: `SYNC3-${i}`,
          company: testData.SELLER_COMPANY_A_ID,
          certificateNumber: `SYNC3-CERT-${i}`,
          certificateInstitute: 'IGI',
          shape: 'Cushion',
          carat: 2.0 + (i * 0.1),
          color: 'F',
          clarity: 'VS2',
          price: 10000 + (i * 100),
          marketPrice: 10000 + (i * 100),
          status: 'available',
          sold: false,
          onDeal: false
        }));
        
        await Product.insertMany(newProducts);
        console.log(`   [Sync 3] Inserted 20 products`);
      })()
    ];
    
    await Promise.all(deletePromises);
    
    steps.push({
      step: 'Concurrent Syncs',
      success: true,
      message: '3 concurrent syncs executed',
      timestamp: new Date()
    });
    
    // ========== STEP 4: Check final state ==========
    console.log('\n📝 Step 4: Checking final product count and consistency...');
    
    const finalCount = await Product.countDocuments({ 
      company: testData.SELLER_COMPANY_A_ID 
    });
    
    console.log(`   Final products for Seller A: ${finalCount}`);
    console.log(`   Expected: 10, 15, or 20 (depending on which sync won)`);
    
    // Check which sync won
    const sync1Count = await Product.countDocuments({ certificateNumber: /^SYNC1-/ });
    const sync2Count = await Product.countDocuments({ certificateNumber: /^SYNC2-/ });
    const sync3Count = await Product.countDocuments({ certificateNumber: /^SYNC3-/ });
    
    console.log(`\n   Sync Results:`);
    console.log(`   - Sync 1 products: ${sync1Count}`);
    console.log(`   - Sync 2 products: ${sync2Count}`);
    console.log(`   - Sync 3 products: ${sync3Count}`);
    
    // Analyze inconsistency
    const hasInconsistency = (sync1Count > 0 && sync2Count > 0) || 
                             (sync2Count > 0 && sync3Count > 0) || 
                             (sync1Count > 0 && sync3Count > 0);
    
    if (hasInconsistency) {
      errors.push('🚨 RACE CONDITION DETECTED: Products from multiple syncs present!');
      console.error('\n❌ RACE CONDITION DETECTED!');
      console.error('   Multiple syncs inserted products, resulting in inconsistent state.');
      console.error('   This confirms the issue from audit item #4.');
    } else {
      console.log('\n✅ Only one sync completed (no race condition detected in this run)');
      console.log('   Note: Race conditions are probabilistic - may not occur every time');
    }
    
    steps.push({
      step: 'Verify Consistency',
      success: !hasInconsistency,
      message: hasInconsistency ? 'Race condition detected' : 'No race condition in this run',
      timestamp: new Date()
    });
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SCENARIO 6 RESULTS                                            ║');
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
      errors,
      warnings,
      duration: Date.now() - startTime,
      steps
    };
  }
}

