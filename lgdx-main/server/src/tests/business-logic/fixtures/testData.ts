/**
 * Test Data Fixtures for Business Logic Testing
 * Создает чистые тестовые данные для различных сценариев
 */

import { Types } from 'mongoose';
import { IUser, ICompany, IProduct, CompanyRole } from '../../../types';

// Генерируем уникальный suffix для каждого запуска тестов
const testRunId = Date.now().toString().slice(-6);

// ========== TEST COMPANIES ==========

// Генерируем новые _id при каждом запуске теста
export const LGDEAL_COMPANY_ID = new Types.ObjectId();
export const BUYER_COMPANY_ID = new Types.ObjectId();
export const SELLER_COMPANY_A_ID = new Types.ObjectId();
export const SELLER_COMPANY_B_ID = new Types.ObjectId();

export const testCompanies = {
  lgdeal: {
    _id: LGDEAL_COMPANY_ID,
    name: 'Test LGDEAL Company',
    description: 'Test Management Company',
    status: 'active',
    roles: [CompanyRole.BUYER, CompanyRole.SELLER],
    users: [],
    details: {
      phone: '+1234567890',
      email: 'admin@lgdeal.com',
      legalAddress: {
        country: 'USA',
        city: 'New York',
        addressLine1: '123 Main St'
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  buyerCompany: {
    _id: BUYER_COMPANY_ID,
    name: 'Test Buyer Company',
    description: 'Test company for buying diamonds',
    status: 'active',
    roles: [CompanyRole.BUYER],
    users: [],
    details: {
      phone: '+9876543210',
      email: 'buyer@test.com',
      legalAddress: {
        country: 'USA',
        city: 'Los Angeles',
        addressLine1: '456 Buyer Ave'
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  sellerCompanyA: {
    _id: SELLER_COMPANY_A_ID,
    name: 'Test Seller Company A',
    description: 'First test supplier',
    status: 'active',
    roles: [CompanyRole.SELLER],
    users: [],
    details: {
      phone: '+1111111111',
      email: 'sellerA@test.com',
      legalAddress: {
        country: 'India',
        city: 'Mumbai',
        addressLine1: '789 Seller Road'
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  sellerCompanyB: {
    _id: SELLER_COMPANY_B_ID,
    name: 'Test Seller Company B',
    description: 'Second test supplier',
    status: 'active',
    roles: [CompanyRole.SELLER],
    users: [],
    details: {
      phone: '+2222222222',
      email: 'sellerB@test.com',
      legalAddress: {
        country: 'Belgium',
        city: 'Antwerp',
        addressLine1: '321 Diamond St'
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
};

// ========== TEST USERS ==========

export const LGDEAL_SUPERVISOR_ID = new Types.ObjectId();
export const BUYER_USER_ID = new Types.ObjectId();
export const SELLER_A_USER_ID = new Types.ObjectId();
export const SELLER_B_USER_ID = new Types.ObjectId();

export const testUsers = {
  lgdealSupervisor: {
    _id: LGDEAL_SUPERVISOR_ID,
    email: `test.supervisor.${testRunId}@test.com`,
    password: '$2b$10$test.hash.password',
    firstName: 'LGDEAL',
    lastName: 'Supervisor',
    company: LGDEAL_COMPANY_ID,
    role: 'supervisor' as const,
    isActive: true,
    isLgdealSupervisor: true,
    emailVerified: true,
    phoneVerified: true,
    phone: `+1234567${testRunId}`,
    cart: { items: [], updatedAt: new Date() },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  buyerUser: {
    _id: BUYER_USER_ID,
    email: `test.buyer.${testRunId}@test.com`,
    password: '$2b$10$test.hash.password',
    firstName: 'Test',
    lastName: 'Buyer',
    company: BUYER_COMPANY_ID,
    role: 'manager' as const,
    isActive: true,
    isLgdealSupervisor: false,
    emailVerified: true,
    phoneVerified: true,
    phone: `+9876${testRunId}`,
    cart: { items: [], updatedAt: new Date() },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  sellerAUser: {
    _id: SELLER_A_USER_ID,
    email: `test.sellerA.${testRunId}@test.com`,
    password: '$2b$10$test.hash.password',
    firstName: 'Seller',
    lastName: 'Alpha',
    company: SELLER_COMPANY_A_ID,
    role: 'manager' as const,
    isActive: true,
    isLgdealSupervisor: false,
    emailVerified: true,
    phoneVerified: true,
    phone: `+1111${testRunId}`,
    cart: { items: [], updatedAt: new Date() },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  sellerBUser: {
    _id: SELLER_B_USER_ID,
    email: `test.sellerB.${testRunId}@test.com`,
    password: '$2b$10$test.hash.password',
    firstName: 'Seller',
    lastName: 'Beta',
    company: SELLER_COMPANY_B_ID,
    role: 'manager' as const,
    isActive: true,
    isLgdealSupervisor: false,
    emailVerified: true,
    phoneVerified: true,
    phone: `+2222${testRunId}`,
    cart: { items: [], updatedAt: new Date() },
    createdAt: new Date(),
    updatedAt: new Date()
  }
};

// ========== TEST PRODUCTS ==========

export const PRODUCT_1_ID = new Types.ObjectId();
export const PRODUCT_2_ID = new Types.ObjectId();
export const PRODUCT_3_ID = new Types.ObjectId();
export const PRODUCT_ALT_1_ID = new Types.ObjectId();
export const PRODUCT_ALT_2_ID = new Types.ObjectId();

export const testProducts = {
  // Основной продукт от Seller A
  product1: {
    _id: PRODUCT_1_ID,
    id: 'test-product-001',
    sku: 'SKU-001',
    company: SELLER_COMPANY_A_ID,
    companyName: 'Test Seller Company A',
    shape: 'Round',
    carat: 1.00,
    color: 'D',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    certificateInstitute: 'IGI',
    certificateNumber: 'TEST-CERT-001',
    price: 5000,
    marketPrice: 5000,
    marketPricePerCarat: 5000,
    pricePerCarat: 5000,
    status: 'available',
    sold: false,
    onDeal: false,
    measurement1: 6.5,
    measurement2: 6.5,
    measurement3: 4.0,
    tableSize: 57,
    totalDepth: 61.5,
    location: 'Mumbai',
    photo: 'https://example.com/photo1.jpg',
    video: 'https://example.com/video1.mp4',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  // Второй продукт от Seller A
  product2: {
    _id: PRODUCT_2_ID,
    id: 'test-product-002',
    sku: 'SKU-002',
    company: SELLER_COMPANY_A_ID,
    companyName: 'Test Seller Company A',
    shape: 'Princess',
    carat: 1.50,
    color: 'E',
    clarity: 'VVS2',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Very Good',
    fluorescence: 'Faint',
    certificateInstitute: 'GIA',
    certificateNumber: 'TEST-CERT-002',
    price: 8000,
    marketPrice: 8000,
    marketPricePerCarat: 5333,
    pricePerCarat: 5333,
    status: 'available',
    sold: false,
    onDeal: false,
    measurement1: 7.0,
    measurement2: 7.0,
    measurement3: 4.5,
    tableSize: 58,
    totalDepth: 62.0,
    location: 'Mumbai',
    photo: 'https://example.com/photo2.jpg',
    video: 'https://example.com/video2.mp4',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  // Третий продукт от Seller B
  product3: {
    _id: PRODUCT_3_ID,
    id: 'test-product-003',
    sku: 'SKU-003',
    company: SELLER_COMPANY_B_ID,
    companyName: 'Test Seller Company B',
    shape: 'Cushion',
    carat: 2.00,
    color: 'F',
    clarity: 'VS2',
    cut: 'Very Good',
    polish: 'Excellent',
    symmetry: 'Very Good',
    fluorescence: 'None',
    certificateInstitute: 'IGI',
    certificateNumber: 'TEST-CERT-003',
    price: 12000,
    marketPrice: 12000,
    marketPricePerCarat: 6000,
    pricePerCarat: 6000,
    status: 'available',
    sold: false,
    onDeal: false,
    measurement1: 8.0,
    measurement2: 7.5,
    measurement3: 5.0,
    tableSize: 60,
    totalDepth: 63.0,
    location: 'Antwerp',
    photo: 'https://example.com/photo3.jpg',
    video: 'https://example.com/video3.mp4',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  // Альтернативный продукт 1 (похож на product1)
  alternativeProduct1: {
    _id: PRODUCT_ALT_1_ID,
    id: 'test-product-alt-001',
    sku: 'SKU-ALT-001',
    company: SELLER_COMPANY_B_ID,
    companyName: 'Test Seller Company B',
    shape: 'Round',
    carat: 1.01,
    color: 'D',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    certificateInstitute: 'GIA',
    certificateNumber: 'TEST-CERT-ALT-001',
    price: 5200,
    marketPrice: 5200,
    marketPricePerCarat: 5148,
    pricePerCarat: 5148,
    status: 'available',
    sold: false,
    onDeal: false,
    measurement1: 6.5,
    measurement2: 6.5,
    measurement3: 4.0,
    tableSize: 57,
    totalDepth: 61.5,
    location: 'Antwerp',
    photo: 'https://example.com/photo-alt1.jpg',
    video: 'https://example.com/video-alt1.mp4',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  // Альтернативный продукт 2 (похож на product1)
  alternativeProduct2: {
    _id: PRODUCT_ALT_2_ID,
    id: 'test-product-alt-002',
    sku: 'SKU-ALT-002',
    company: SELLER_COMPANY_A_ID,
    companyName: 'Test Seller Company A',
    shape: 'Round',
    carat: 0.99,
    color: 'D',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Very Good',
    fluorescence: 'None',
    certificateInstitute: 'IGI',
    certificateNumber: 'TEST-CERT-ALT-002',
    price: 4900,
    marketPrice: 4900,
    marketPricePerCarat: 4949,
    pricePerCarat: 4949,
    status: 'available',
    sold: false,
    onDeal: false,
    measurement1: 6.4,
    measurement2: 6.4,
    measurement3: 3.9,
    tableSize: 57,
    totalDepth: 61.0,
    location: 'Mumbai',
    photo: 'https://example.com/photo-alt2.jpg',
    video: 'https://example.com/video-alt2.mp4',
    createdAt: new Date(),
    updatedAt: new Date()
  }
};

// ========== HELPER FUNCTIONS ==========

/**
 * Получить все тестовые компании для вставки в БД
 */
export function getAllTestCompanies() {
  return Object.values(testCompanies);
}

/**
 * Получить всех тестовых пользователей для вставки в БД
 */
export function getAllTestUsers() {
  return Object.values(testUsers);
}

/**
 * Получить все тестовые продукты для вставки в БД
 */
export function getAllTestProducts() {
  return Object.values(testProducts);
}

/**
 * Создать shipping address для тестирования
 */
export function createTestShippingAddress() {
  return {
    address: '123 Test Street',
    city: 'Test City',
    region: 'Test Region',
    zipCode: '12345',
    country: 'USA'
  };
}

