import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import { config } from '../config/environment';
import User from '../models/User';
import Company from '../models/Company';
import { userService } from '../services/userService';
import { emailService } from '../services/emailService';
import { smsService } from '../services/smsService';
import { logger } from '../utils/logger';

// Connect to MongoDB
const getMongoUri = () => {
  if (process.env.MONGODB_URI_FILE) {
    try {
      return require('fs').readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim();
    } catch (e) {
      logger.error('[TestScript] Failed to read MONGODB_URI_FILE:', { error: e });
    }
  }
  return process.env.MONGODB_URI;
};

async function connectDB() {
  const mongoURI = getMongoUri();
  await mongoose.connect(mongoURI);
  logger.info('✅ Connected to MongoDB');
}

interface TestUser {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  companyName: string;
  isLgdeal?: boolean;
}

const testUsers: TestUser[] = [
  {
    firstName: 'Test',
    lastName: 'User1',
    email: 'test1@example.com',
    phone: '+1234567890',
    password: 'TestPassword123!',
    companyName: 'Test Company 1'
  },
  {
    firstName: 'Test',
    lastName: 'User2',
    email: 'test2@example.com',
    phone: '+1234567891',
    password: 'TestPassword123!',
    companyName: 'LGDeal INC',
    isLgdeal: true
  }
];

// Test results storage
interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function addResult(test: string, passed: boolean, message: string, details?: any) {
  results.push({ test, passed, message, details });
  const status = passed ? '✅' : '❌';
  logger.info(`${status} ${test}: ${message}`);
  if (details && !passed) {
    logger.info('   Details:', JSON.stringify(details, null, 2));
  }
}

// Clean up test data
async function cleanupTestData() {
  logger.info('\n🧹 Cleaning up test data...');
  
  try {
    // Delete test users
    const testEmails = testUsers.map(u => u.email);
    const deletedUsers = await User.deleteMany({ email: { $in: testEmails } });
    logger.info(`   Deleted ${deletedUsers.deletedCount} test users`);
    
    // Delete test companies
    const testCompanies = [...new Set(testUsers.map(u => u.companyName))];
    const deletedCompanies = await Company.deleteMany({ name: { $in: testCompanies } });
    logger.info(`   Deleted ${deletedCompanies.deletedCount} test companies`);
    
  } catch (error) {
    logger.error('   Error during cleanup:', { error });
  }
}

// Test 1: Service Availability
async function testServiceAvailability() {
  logger.info('\n📋 Testing Service Availability...');
  
  addResult(
    'Email Service',
    emailService.isAvailable(),
    emailService.isAvailable() ? 'Available' : 'Not available'
  );
  
  addResult(
    'SMS Service',
    smsService.isAvailable(),
    smsService.isAvailable() ? 'Available' : 'Not available'
  );
  
  // Test environment config
  addResult(
    'Environment Config',
    !!config,
    config ? 'Loaded successfully' : 'Failed to load'
  );
}

// Test 2: Password Validation
async function testPasswordValidation() {
  logger.info('\n🔐 Testing Password Validation...');
  
  const weakPasswords = ['123', 'password', 'abc', '12345'];
  const strongPasswords = ['TestPassword123!', 'MySecurePass2024@', 'ComplexP@ss1'];
  
  // Test weak passwords
  for (const password of weakPasswords) {
    const validation = userService.validatePassword(password);
    addResult(
      `Weak Password Rejection (${password})`,
      !validation.isValid,
      validation.isValid ? 'FAILED: Weak password accepted' : 'Correctly rejected',
      validation.errors
    );
  }
  
  // Test strong passwords
  for (const password of strongPasswords) {
    const validation = userService.validatePassword(password);
    addResult(
      `Strong Password Acceptance (${password})`,
      validation.isValid,
      validation.isValid ? 'Correctly accepted' : 'FAILED: Strong password rejected',
      validation.errors
    );
  }
}

// Test 3: Email Validation
async function testEmailValidation() {
  logger.info('\n📧 Testing Email Validation...');
  
  const invalidEmails = ['invalid-email', 'test@', '@example.com', 'test@.com'];
  const validEmails = ['test@example.com', 'user.name@domain.co.uk', 'test+tag@example.org'];
  
  // Email validation is done through Zod schema, let's test registration with invalid emails
  for (const email of invalidEmails) {
    try {
      await userService.registerUser({
        firstName: 'Test',
        lastName: 'User',
        email,
        phone: '+1234567899',
        password: 'TestPassword123!',
        companyName: 'Test Company'
      });
      addResult(
        `Invalid Email Rejection (${email})`,
        false,
        'FAILED: Invalid email was accepted'
      );
    } catch (error: any) {
      addResult(
        `Invalid Email Rejection (${email})`,
        true,
        'Correctly rejected',
        error.message
      );
    }
  }
}

// Test 4: User Registration Flow
async function testUserRegistration() {
  logger.info('\n👤 Testing User Registration Flow...');
  
  for (const testUser of testUsers) {
    try {
      const result = await userService.registerUser(testUser);
      
      addResult(
        `Registration (${testUser.email})`,
        !!result.token && !!result.user,
        result.token ? 'Success' : 'Failed',
        { userId: result.user.id, companyName: testUser.companyName }
      );
      
      // Check if user was created in database
      const dbUser = await User.findById(result.user.id);
      addResult(
        `Database User Creation (${testUser.email})`,
        !!dbUser,
        dbUser ? 'User found in database' : 'User not found in database'
      );
      
      // Check email verification status
      if (testUser.isLgdeal) {
        addResult(
          `LGDEAL User Auto-Verification (${testUser.email})`,
          dbUser?.emailVerified === true && dbUser?.phoneVerified === true,
          dbUser?.emailVerified && dbUser?.phoneVerified ? 'Auto-verified' : 'Not auto-verified'
        );
      } else {
        addResult(
          `Regular User Verification Status (${testUser.email})`,
          dbUser?.emailVerified === false && dbUser?.phoneVerified === false,
          dbUser?.emailVerified === false && dbUser?.phoneVerified === false ? 'Correctly unverified' : 'Verification status wrong'
        );
      }
      
      // Check company creation/association
      const company = await Company.findOne({ name: testUser.companyName });
      addResult(
        `Company Creation/Association (${testUser.companyName})`,
        !!company,
        company ? 'Company found' : 'Company not found'
      );
      
      if (company) {
        const userInCompany = company.users?.find(u => u.user.toString() === result.user.id);
        addResult(
          `User-Company Association (${testUser.email})`,
          !!userInCompany,
          userInCompany ? 'User associated with company' : 'User not associated with company'
        );
      }
      
    } catch (error: any) {
      addResult(
        `Registration (${testUser.email})`,
        false,
        'Registration failed',
        error.message
      );
    }
  }
}

// Test 5: Duplicate Registration
async function testDuplicateRegistration() {
  logger.info('\n🔄 Testing Duplicate Registration Prevention...');
  
  const duplicateUser = testUsers[0];
  
  try {
    // Try to register the same user again
    await userService.registerUser(duplicateUser);
    addResult(
      'Duplicate Email Prevention',
      false,
      'FAILED: Duplicate email was accepted'
    );
  } catch (error: any) {
    addResult(
      'Duplicate Email Prevention',
      true,
      'Correctly rejected duplicate email',
      error.message
    );
  }
  
  try {
    // Try to register with same phone
    await userService.registerUser({
      ...duplicateUser,
      email: 'different@example.com',
      phone: duplicateUser.phone
    });
    addResult(
      'Duplicate Phone Prevention',
      false,
      'FAILED: Duplicate phone was accepted'
    );
  } catch (error: any) {
    addResult(
      'Duplicate Phone Prevention',
      true,
      'Correctly rejected duplicate phone',
      error.message
    );
  }
}

// Test 6: Email Verification Flow
async function testEmailVerificationFlow() {
  logger.info('\n📬 Testing Email Verification Flow...');
  
  const testUser = await User.findOne({ email: testUsers[0].email });
  if (!testUser) {
    addResult(
      'Email Verification Setup',
      false,
      'Test user not found for email verification test'
    );
    return;
  }
  
  // Check verification token exists
  addResult(
    'Email Verification Token Creation',
    !!testUser.emailVerificationToken,
    testUser.emailVerificationToken ? 'Token created' : 'No token found'
  );
  
  if (testUser.emailVerificationToken) {
    // Test email verification
    try {
      const verifiedUser = await userService.verifyEmail(testUser.emailVerificationToken);
      addResult(
        'Email Verification Process',
        verifiedUser.emailVerified === true,
        verifiedUser.emailVerified ? 'Email verified successfully' : 'Email verification failed'
      );
      
      // Check token cleanup
      const updatedUser = await User.findById(testUser._id);
      addResult(
        'Email Verification Token Cleanup',
        !updatedUser?.emailVerificationToken,
        !updatedUser?.emailVerificationToken ? 'Token cleaned up' : 'Token not cleaned up'
      );
      
    } catch (error: any) {
      addResult(
        'Email Verification Process',
        false,
        'Email verification failed',
        error.message
      );
    }
    
    // Test expired token
    try {
      await userService.verifyEmail('invalid-token');
      addResult(
        'Invalid Token Handling',
        false,
        'FAILED: Invalid token was accepted'
      );
    } catch (error: any) {
      addResult(
        'Invalid Token Handling',
        true,
        'Correctly rejected invalid token',
        error.message
      );
    }
  }
}

// Test 7: Phone Verification Flow
async function testPhoneVerificationFlow() {
  logger.info('\n📱 Testing Phone Verification Flow...');
  
  const testUser = await User.findOne({ email: testUsers[0].email });
  if (!testUser) {
    addResult(
      'Phone Verification Setup',
      false,
      'Test user not found for phone verification test'
    );
    return;
  }
  
  // Send verification code
  try {
    const result = await userService.sendPhoneVerificationCode(testUser.phone!);
    addResult(
      'SMS Sending',
      result.success,
      result.message,
      { code: result.code }
    );
    
    if (result.success && result.code) {
      // Test phone verification with correct code
      try {
        const verifiedUser = await userService.verifyPhone(testUser.phone!, result.code);
        addResult(
          'Phone Verification Process',
          verifiedUser.phoneVerified === true,
          verifiedUser.phoneVerified ? 'Phone verified successfully' : 'Phone verification failed'
        );
      } catch (error: any) {
        addResult(
          'Phone Verification Process',
          false,
          'Phone verification failed',
          error.message
        );
      }
      
      // Test invalid code
      try {
        await userService.verifyPhone(testUser.phone!, '000000');
        addResult(
          'Invalid Code Handling',
          false,
          'FAILED: Invalid code was accepted'
        );
      } catch (error: any) {
        addResult(
          'Invalid Code Handling',
          true,
          'Correctly rejected invalid code',
          error.message
        );
      }
    }
  } catch (error: any) {
    addResult(
      'SMS Sending',
      false,
      'SMS sending failed',
      error.message
    );
  }
}

// Test 8: User Status and Activation
async function testUserStatusFlow() {
  logger.info('\n👥 Testing User Status and Activation Flow...');
  
  const regularUser = await User.findOne({ email: testUsers[0].email });
  const lgdealUser = await User.findOne({ email: testUsers[1].email });
  
  if (regularUser) {
    addResult(
      'Regular User Initial Status',
      regularUser.isActive === true, // Should be active after email verification
      regularUser.isActive ? 'Active after verification' : 'Not active after verification'
    );
  }
  
  if (lgdealUser) {
    addResult(
      'LGDEAL User Initial Status',
      lgdealUser.isActive === true,
      lgdealUser.isActive ? 'Auto-activated' : 'Not auto-activated'
    );
  }
}

// Test 9: Company Flow
async function testCompanyFlow() {
  logger.info('\n🏢 Testing Company Creation and Association Flow...');
  
  // Check unique companies
  const uniqueCompanies = [...new Set(testUsers.map(u => u.companyName))];
  const companies = await Company.find({ name: { $in: uniqueCompanies } });
  
  addResult(
    'Company Creation Count',
    companies.length === uniqueCompanies.length,
    `Created ${companies.length} companies (expected ${uniqueCompanies.length})`
  );
  
  // Check LGDEAL company status
  const lgdealCompany = companies.find(c => c.name === 'LGDeal INC');
  if (lgdealCompany) {
    addResult(
      'LGDEAL Company Status',
      lgdealCompany.status === 'active',
      lgdealCompany.status === 'active' ? 'Auto-activated' : `Status: ${lgdealCompany.status}`
    );
  }
  
  // Check regular company status
  const regularCompany = companies.find(c => c.name === 'Test Company 1');
  if (regularCompany) {
    addResult(
      'Regular Company Status',
      regularCompany.status === 'pending_review',
      regularCompany.status === 'pending_review' ? 'Pending review' : `Status: ${regularCompany.status}`
    );
  }
}

// Test 10: Login Flow
async function testLoginFlow() {
  logger.info('\n🔑 Testing Login Flow...');
  
  for (const testUser of testUsers) {
    try {
      const result = await userService.loginUser({
        login: testUser.email,
        password: testUser.password
      });
      
      addResult(
        `Login (${testUser.email})`,
        !!result.token && !!result.user,
        result.token ? 'Login successful' : 'Login failed'
      );
      
      // Test wrong password
      try {
        await userService.loginUser({
          login: testUser.email,
          password: 'wrongpassword'
        });
        addResult(
          `Wrong Password Rejection (${testUser.email})`,
          false,
          'FAILED: Wrong password was accepted'
        );
      } catch (error: any) {
        addResult(
          `Wrong Password Rejection (${testUser.email})`,
          true,
          'Correctly rejected wrong password'
        );
      }
      
    } catch (error: any) {
      addResult(
        `Login (${testUser.email})`,
        false,
        'Login failed',
        error.message
      );
    }
  }
}

// Main test runner
async function runTests() {
  logger.info('🧪 Starting Registration Flow Tests');
  logger.info('=====================================');
  
  try {
    await connectDB();
    
    // Cleanup before tests
    await cleanupTestData();
    
    // Run all tests
    await testServiceAvailability();
    await testPasswordValidation();
    await testEmailValidation();
    await testUserRegistration();
    await testDuplicateRegistration();
    await testEmailVerificationFlow();
    await testPhoneVerificationFlow();
    await testUserStatusFlow();
    await testCompanyFlow();
    await testLoginFlow();
    
    // Summary
    logger.info('\n📊 Test Summary');
    logger.info('================');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;
    
    logger.info(`Total Tests: ${total}`);
    logger.info(`✅ Passed: ${passed}`);
    logger.info(`❌ Failed: ${failed}`);
    logger.info(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      logger.info('\n❌ Failed Tests:');
      results.filter(r => !r.passed).forEach(r => {
        logger.info(`   - ${r.test}: ${r.message}`);
      });
    }
    
    // Cleanup after tests
    await cleanupTestData();
    
  } catch (error) {
    logger.error('❌ Test execution failed:', { error });
  } finally {
    await mongoose.disconnect();
    logger.info('\n✅ Disconnected from MongoDB');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch((e) => logger.error('Test runner error:', { error: e }));
}

export { runTests }; 