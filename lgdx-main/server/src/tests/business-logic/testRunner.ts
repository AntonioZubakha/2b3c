/**
 * Business Logic Test Runner
 * Главный файл для запуска всех тестовых сценариев
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { connectTestDB, disconnectTestDB, cleanupTestData } from './helpers/testHelpers';

// Import scenarios
import * as scenario01 from './scenarios/01-buyer-to-lgdeal-happy-path';
import * as scenario02 from './scenarios/02-alternative-product-selection';
import * as scenario03 from './scenarios/03-deal-cancellation-cascade';
import * as scenario04 from './scenarios/04-reject-alternative-product';
import * as scenario05 from './scenarios/05-invoice-rejection-cycle';
import * as scenario06 from './scenarios/06-concurrent-sync-race-condition';
import * as scenario07 from './scenarios/07-price-consistency-check';
import * as scenario08 from './scenarios/08-blacklist-certificate-timing';
import * as scenario09 from './scenarios/09-deal-status-race-condition';
import * as scenario10 from './scenarios/10-optimistic-locking-verification';

interface TestSuite {
  id: string;
  name: string;
  description: string;
  category: string;
  run: () => Promise<scenario01.ScenarioResult>;
}

// Определяем все доступные тесты
const TEST_SUITES: TestSuite[] = [
  {
    id: '01',
    name: 'Happy Path - Buyer to LGDEAL',
    description: 'Полный успешный flow от создания сделки до доставки',
    category: 'core',
    run: scenario01.runScenario
  },
  {
    id: '02',
    name: 'Alternative Product Selection',
    description: 'LGDEAL предлагает альтернативу, buyer принимает',
    category: 'alternative',
    run: scenario02.runScenario
  },
  {
    id: '03',
    name: 'Deal Cancellation Cascade',
    description: 'Проверка cascade отмены связанных сделок',
    category: 'cancellation',
    run: scenario03.runScenario
  },
  {
    id: '04',
    name: 'Reject Alternative Product',
    description: 'Buyer отклоняет альтернативу и возвращается к оригиналу',
    category: 'alternative',
    run: scenario04.runScenario
  },
  {
    id: '05',
    name: 'Invoice Rejection Cycle',
    description: 'Seller загружает invoice, buyer отклоняет, seller загружает новый',
    category: 'payment',
    run: scenario05.runScenario
  },
  {
    id: '06',
    name: 'Concurrent Sync Race Condition',
    description: 'Тест race condition при одновременной синхронизации',
    category: 'sync',
    run: scenario06.runScenario
  },
  {
    id: '07',
    name: 'Price Consistency Check',
    description: 'Проверка корректности расчета цен и комиссий LGDEAL',
    category: 'payment',
    run: scenario07.runScenario
  },
  {
    id: '08',
    name: 'Certificate Blacklist Timing',
    description: 'Проверка: после завершения сделки продукт получает статус Sold',
    category: 'security',
    run: scenario08.runScenario
  },
  {
    id: '09',
    name: 'Deal Status Race Condition',
    description: 'Тест concurrent status updates на одной сделке',
    category: 'security',
    run: scenario09.runScenario
  },
  {
    id: '10',
    name: 'Optimistic Locking Verification',
    description: 'Проверка что optimistic locking работает в actionController',
    category: 'security',
    run: scenario10.runScenario
  }
];

interface TestRunOptions {
  scenarios?: string[]; // IDs of scenarios to run (empty = all)
  category?: string; // Filter by category
  stopOnError?: boolean; // Stop on first error
  cleanupAfter?: boolean; // Cleanup test data after run
  verbose?: boolean; // Verbose output
  mongoUri?: string; // Custom MongoDB URI
}

interface TestRunResult {
  totalTests: number;
  passed: number;
  failed: number;
  totalErrors: number;
  totalWarnings: number;
  totalDuration: number;
  results: Array<{
    suite: TestSuite;
    result: scenario01.ScenarioResult;
  }>;
}

/**
 * Главная функция запуска тестов
 */
export async function runTests(options: TestRunOptions = {}): Promise<TestRunResult> {
  const {
    scenarios = [],
    category,
    stopOnError = false,
    cleanupAfter = true,
    verbose = true,
    mongoUri
  } = options;
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                  ║');
  console.log('║          LGDX BUSINESS LOGIC TEST SUITE                          ║');
  console.log('║                                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  const startTime = Date.now();
  
  // Connect to database
  console.log('🔌 Connecting to test database...');
  await connectTestDB(mongoUri);
  console.log('✅ Connected\n');
  
  // Filter test suites
  let suitesToRun = TEST_SUITES;
  
  if (scenarios.length > 0) {
    suitesToRun = TEST_SUITES.filter(suite => scenarios.includes(suite.id));
  }
  
  if (category) {
    suitesToRun = suitesToRun.filter(suite => suite.category === category);
  }
  
  console.log(`📋 Running ${suitesToRun.length} test scenario(s)...\n`);
  
  const results: TestRunResult['results'] = [];
  let passed = 0;
  let failed = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  
  // Run each test suite
  for (const suite of suitesToRun) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Running: ${suite.name}`);
    console.log(`Description: ${suite.description}`);
    console.log(`Category: ${suite.category}`);
    console.log('='.repeat(70));
    
    try {
      const result = await suite.run();
      results.push({ suite, result });
      
      if (result.success) {
        passed++;
        console.log(`\n✅ ${suite.name} PASSED`);
      } else {
        failed++;
        console.log(`\n❌ ${suite.name} FAILED`);
        
        if (stopOnError) {
          console.log('\n⚠️  Stopping test run due to error (stopOnError = true)');
          break;
        }
      }
      
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      
    } catch (error) {
      failed++;
      console.error(`\n❌ ${suite.name} CRASHED:`, error);
      
      results.push({
        suite,
        result: {
          success: false,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: [],
          duration: 0,
          steps: []
        }
      });
      
      if (stopOnError) {
        console.log('\n⚠️  Stopping test run due to error');
        break;
      }
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // ========== FINAL REPORT ==========
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                      FINAL TEST REPORT                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  console.log(`📊 Summary:`);
  console.log(`   Total Tests: ${results.length}`);
  console.log(`   Passed: ${passed} ✅`);
  console.log(`   Failed: ${failed} ❌`);
  console.log(`   Total Errors: ${totalErrors}`);
  console.log(`   Total Warnings: ${totalWarnings}`);
  console.log(`   Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log('\n');
  
  // Detailed results
  console.log('📋 Detailed Results:\n');
  results.forEach(({ suite, result }) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${suite.id}. ${suite.name}`);
    console.log(`   Steps: ${result.steps.length}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Warnings: ${result.warnings.length}`);
    console.log(`   Duration: ${result.duration}ms`);
    
    if (result.errors.length > 0 && verbose) {
      console.log(`   Errors:`);
      result.errors.forEach(err => console.log(`     - ${err}`));
    }
    
    if (result.warnings.length > 0 && verbose) {
      console.log(`   Warnings:`);
      result.warnings.forEach(warn => console.log(`     - ${warn}`));
    }
    
    console.log('');
  });
  
  // Issues detected
  if (totalErrors > 0) {
    console.log('🚨 Issues Detected:\n');
    results.forEach(({ suite, result }) => {
      if (result.errors.length > 0) {
        console.log(`   ${suite.name}:`);
        result.errors.forEach(err => console.log(`     ❌ ${err}`));
      }
    });
    console.log('');
  }
  
  // Warnings
  if (totalWarnings > 0) {
    console.log('⚠️  Warnings:\n');
    results.forEach(({ suite, result }) => {
      if (result.warnings.length > 0) {
        console.log(`   ${suite.name}:`);
        result.warnings.forEach(warn => console.log(`     ⚠️  ${warn}`));
      }
    });
    console.log('');
  }
  
  // Cleanup
  if (cleanupAfter) {
    console.log('🧹 Cleaning up test data...');
    await cleanupTestData();
    console.log('✅ Cleanup completed\n');
  }
  
  // Disconnect
  console.log('🔌 Disconnecting from database...');
  await disconnectTestDB();
  console.log('✅ Disconnected\n');
  
  // Final status
  const allPassed = failed === 0;
  if (allPassed) {
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ ALL TESTS PASSED ✅                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  } else {
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    ❌ SOME TESTS FAILED ❌                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  }
  
  return {
    totalTests: results.length,
    passed,
    failed,
    totalErrors,
    totalWarnings,
    totalDuration,
    results
  };
}

/**
 * Generate HTML report
 */
export async function generateHtmlReport(runResult: TestRunResult, outputPath: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>LGDX Business Logic Test Report</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .test-result {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .passed { border-left: 5px solid #4caf50; }
    .failed { border-left: 5px solid #f44336; }
    .error { color: #f44336; padding: 5px 0; }
    .warning { color: #ff9800; padding: 5px 0; }
    .stat { display: inline-block; margin-right: 30px; }
    .stat-value { font-size: 24px; font-weight: bold; }
    .step { padding: 5px 0; }
    .step.success { color: #4caf50; }
    .step.failed { color: #f44336; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 LGDX Business Logic Test Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
  
  <div class="summary">
    <h2>📊 Summary</h2>
    <div class="stat">
      <div class="stat-value" style="color: ${runResult.passed > 0 ? '#4caf50' : '#666'}">${runResult.passed}</div>
      <div>Passed</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color: ${runResult.failed > 0 ? '#f44336' : '#666'}">${runResult.failed}</div>
      <div>Failed</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color: ${runResult.totalErrors > 0 ? '#f44336' : '#666'}">${runResult.totalErrors}</div>
      <div>Errors</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color: ${runResult.totalWarnings > 0 ? '#ff9800' : '#666'}">${runResult.totalWarnings}</div>
      <div>Warnings</div>
    </div>
    <div class="stat">
      <div class="stat-value">${(runResult.totalDuration / 1000).toFixed(2)}s</div>
      <div>Duration</div>
    </div>
  </div>
  
  ${runResult.results.map(({ suite, result }) => `
    <div class="test-result ${result.success ? 'passed' : 'failed'}">
      <h3>${result.success ? '✅' : '❌'} ${suite.id}. ${suite.name}</h3>
      <p><strong>Category:</strong> ${suite.category}</p>
      <p><strong>Description:</strong> ${suite.description}</p>
      <p><strong>Duration:</strong> ${result.duration}ms</p>
      
      ${result.steps.length > 0 ? `
        <h4>Steps (${result.steps.length}):</h4>
        <ul>
          ${result.steps.map(step => `
            <li class="step ${step.success ? 'success' : 'failed'}">
              ${step.success ? '✅' : '❌'} ${step.step}: ${step.message}
            </li>
          `).join('')}
        </ul>
      ` : ''}
      
      ${result.errors.length > 0 ? `
        <h4>Errors (${result.errors.length}):</h4>
        <ul>
          ${result.errors.map(err => `<li class="error">❌ ${err}</li>`).join('')}
        </ul>
      ` : ''}
      
      ${result.warnings.length > 0 ? `
        <h4>Warnings (${result.warnings.length}):</h4>
        <ul>
          ${result.warnings.map(warn => `<li class="warning">⚠️  ${warn}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('')}
  
  <div class="summary">
    <h3>🎯 Conclusion</h3>
    <p>
      ${runResult.failed === 0 ? 
        '<strong style="color: #4caf50;">✅ All tests passed! Business logic is working as expected.</strong>' :
        `<strong style="color: #f44336;">❌ ${runResult.failed} test(s) failed. Please review the errors above.</strong>`
      }
    </p>
    <p>Total execution time: ${(runResult.totalDuration / 1000).toFixed(2)} seconds</p>
  </div>
</body>
</html>
  `;
  
  await fs.writeFile(outputPath, html, 'utf-8');
  console.log(`📄 HTML report saved to: ${outputPath}`);
}

/**
 * Generate JSON report
 */
export async function generateJsonReport(runResult: TestRunResult, outputPath: string): Promise<void> {
  const json = JSON.stringify(runResult, null, 2);
  await fs.writeFile(outputPath, json, 'utf-8');
  console.log(`📄 JSON report saved to: ${outputPath}`);
}

/**
 * CLI Entry Point
 */
export async function main() {
  const args = process.argv.slice(2);
  
  // Parse CLI arguments
  const options: TestRunOptions = {
    scenarios: [],
    stopOnError: args.includes('--stop-on-error'),
    cleanupAfter: !args.includes('--no-cleanup'),
    verbose: !args.includes('--quiet'),
    mongoUri: args.find(arg => arg.startsWith('--mongo='))?.split('=')[1]
  };
  
  // Parse scenario IDs
  const scenarioArg = args.find(arg => arg.startsWith('--scenarios='));
  if (scenarioArg) {
    options.scenarios = scenarioArg.split('=')[1].split(',');
  }
  
  // Parse category
  const categoryArg = args.find(arg => arg.startsWith('--category='));
  if (categoryArg) {
    options.category = categoryArg.split('=')[1];
  }
  
  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
LGDX Business Logic Test Runner

Usage:
  ts-node testRunner.ts [options]

Options:
  --scenarios=01,02,03    Run specific scenarios (comma-separated IDs)
  --category=core         Run scenarios from specific category
  --stop-on-error         Stop on first error
  --no-cleanup            Don't cleanup test data after run
  --quiet                 Less verbose output
  --mongo=<uri>           Custom MongoDB URI
  --report-html           Generate HTML report
  --report-json           Generate JSON report
  --list                  List all available scenarios
  -h, --help              Show this help

Categories:
  - core: Core deal functionality
  - alternative: Alternative product scenarios
  - cancellation: Deal cancellation scenarios
  - payment: Payment and invoice scenarios
  - sync: Product sync scenarios

Examples:
  # Run all tests
  ts-node testRunner.ts
  
  # Run specific scenarios
  ts-node testRunner.ts --scenarios=01,03
  
  # Run all alternative product tests
  ts-node testRunner.ts --category=alternative
  
  # Run with custom DB and generate report
  ts-node testRunner.ts --mongo=mongodb://localhost:27017/test --report-html
    `);
    process.exit(0);
  }
  
  // List scenarios
  if (args.includes('--list')) {
    console.log('\n📋 Available Test Scenarios:\n');
    TEST_SUITES.forEach(suite => {
      console.log(`  ${suite.id}. ${suite.name}`);
      console.log(`     Category: ${suite.category}`);
      console.log(`     Description: ${suite.description}\n`);
    });
    process.exit(0);
  }
  
  // Run tests
  const result = await runTests(options);
  
  // Generate reports if requested
  if (args.includes('--report-html')) {
    const reportPath = path.join(process.cwd(), 'test-report.html');
    await generateHtmlReport(result, reportPath);
  }
  
  if (args.includes('--report-json')) {
    const reportPath = path.join(process.cwd(), 'test-report.json');
    await generateJsonReport(result, reportPath);
  }
  
  // Exit with appropriate code
  process.exit(result.failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

