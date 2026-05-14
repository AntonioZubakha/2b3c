/**
 * Helper Functions for Business Logic Testing
 * Вспомогательные функции для создания и управления тестовыми сценариями
 */

import mongoose, { Types } from 'mongoose';
import Deal from '../../../models/Deal';
import Product from '../../../models/Product';
import User from '../../../models/User';
import Company from '../../../models/Company';
import Counter from '../../../models/Counter';
import { IDeal, IProduct, IUser, ICompany } from '../../../types';

// ========== DATABASE SETUP ==========

/**
 * Подключение к тестовой базе данных
 */
export async function connectTestDB(mongoUri?: string): Promise<void> {
  const uri = mongoUri || process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'Set MONGODB_URI_TEST or MONGODB_URI (see server/.env.test — gitignored) or pass mongoUri to connectTestDB().'
    );
  }
  
  if (mongoose.connection.readyState === 0) {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri);
    console.log('✅ Connected to test database');
    console.log(`📍 Using DB: ${mongoose.connection.name}`);
  }
}

/**
 * Отключение от базы данных
 */
export async function disconnectTestDB(): Promise<void> {
  await mongoose.connection.close();
  console.log('✅ Disconnected from test database');
}

/**
 * Очистка тестовых данных из базы
 */
export async function cleanupTestData(): Promise<void> {
  console.log('🧹 Cleaning up test data...');
  
  // Удаляем только тестовые данные (по email/name паттернам)
  await Deal.deleteMany({ dealNumber: /^TEST-/ });
  await Product.deleteMany({ certificateNumber: /^TEST-CERT-/ });
  await User.deleteMany({ email: /@test\.com$/ });
  await Company.deleteMany({ name: /^Test / });
  
  console.log('✅ Test data cleaned');
}

/**
 * Полная очистка БД (ОСТОРОЖНО!)
 */
export async function fullCleanup(): Promise<void> {
  console.log('⚠️  FULL DATABASE CLEANUP...');
  
  await Deal.deleteMany({});
  await Product.deleteMany({});
  await User.deleteMany({});
  await Company.deleteMany({});
  await Counter.deleteMany({});
  
  console.log('✅ Full cleanup completed');
}

// ========== DATA INSERTION ==========

/**
 * Вставка тестовых компаний
 */
export async function insertTestCompanies(companies: any[]): Promise<ICompany[]> {
  const inserted = await Company.insertMany(companies);
  console.log(`✅ Inserted ${inserted.length} test companies`);
  return inserted as ICompany[];
}

/**
 * Вставка тестовых пользователей
 */
export async function insertTestUsers(users: any[]): Promise<IUser[]> {
  const inserted = await User.insertMany(users);
  console.log(`✅ Inserted ${inserted.length} test users`);
  return inserted as IUser[];
}

/**
 * Вставка тестовых продуктов
 */
export async function insertTestProducts(products: any[]): Promise<IProduct[]> {
  const inserted = await Product.insertMany(products);
  console.log(`✅ Inserted ${inserted.length} test products`);
  return inserted as IProduct[];
}

/**
 * Инициализация Counter для deal numbers
 */
export async function initializeDealCounter(startValue: number = 1000): Promise<void> {
  // Counter использует name field, не _id
  await Counter.deleteMany({ name: 'deal' });
  await Counter.create({ name: 'deal', value: startValue, prefix: '', suffix: '' });
  
  await Counter.deleteMany({ name: 'sellerDealNumber' });
  await Counter.create({ name: 'sellerDealNumber', value: 100000, prefix: '', suffix: '' });
  
  console.log(`✅ Initialized deal counters (deal: ${startValue}, sellerDealNumber: 100000)`);
}

// ========== DEAL HELPERS ==========

/**
 * Создать тестовую сделку buyer-to-lgdeal
 */
export async function createTestBuyerDeal(params: {
  buyerUserId: Types.ObjectId;
  buyerCompanyId: Types.ObjectId;
  lgdealCompanyId: Types.ObjectId;
  products: Array<{
    productId: Types.ObjectId;
    price: number;
  }>;
  shippingAddress: any;
}): Promise<IDeal> {
  const dealNumber = `TEST-${Date.now()}`;
  const totalAmount = params.products.reduce((sum, p) => sum + p.price, 0);
  
  const deal = await Deal.create({
    dealNumber,
    dealType: 'buyer-to-lgdeal',
    status: 'pending',
    stage: 'request',
    buyerId: params.buyerUserId,
    buyerCompanyId: params.buyerCompanyId,
    sellerId: null,
    sellerCompanyId: params.lgdealCompanyId,
    amount: totalAmount,
    fee: 0,
    products: params.products.map(p => ({
      product: p.productId,
      price: p.price,
      quantity: 1,
      marketPriceAtInitiation: p.price
    })),
    shippingDetails: {
      cost: 0,
      shippingAddress: {
        recipientName: 'Test Recipient',
        addressLine1: params.shippingAddress.address,
        city: params.shippingAddress.city,
        stateProvinceRegion: params.shippingAddress.region,
        postalCode: params.shippingAddress.zipCode,
        country: params.shippingAddress.country
      }
    },
    requestDetails: {
      requestDate: new Date(),
      requestedBy: params.buyerUserId,
      notes: 'Test deal created by automated testing'
    },
    activityLog: [{
      action: 'deal_created',
      performedBy: params.buyerUserId,
      details: 'Test deal created',
      timestamp: new Date()
    }],
    lastActionAt: new Date()
  });
  
  console.log(`✅ Created test buyer deal: ${dealNumber}`);
  return deal;
}

/**
 * Создать тестовую сделку lgdeal-to-seller
 */
export async function createTestSellerDeal(params: {
  lgdealCompanyId: Types.ObjectId;
  sellerUserId: Types.ObjectId;
  sellerCompanyId: Types.ObjectId;
  productId: Types.ObjectId;
  price: number;
  pairedDealId?: Types.ObjectId;
}): Promise<IDeal> {
  const dealNumber = `TEST-SELLER-${Date.now()}`;
  
  // Seller получает 96% от market price (4% комиссия LGDeal INC)
  const sellerAmount = Math.round(params.price * 0.96 * 100) / 100;
  const fee = Math.round(params.price * 0.04 * 100) / 100;
  
  const deal = await Deal.create({
    dealNumber,
    dealType: 'lgdeal-to-seller',
    status: 'pending',
    stage: 'request',
    buyerId: null,
    buyerCompanyId: params.lgdealCompanyId,
    sellerId: params.sellerUserId,
    sellerCompanyId: params.sellerCompanyId,
    amount: sellerAmount,
    fee: fee,
    products: [{
      product: params.productId,
      price: sellerAmount,
      quantity: 1,
      marketPriceAtInitiation: params.price
    }],
    pairedDealId: params.pairedDealId || null,
    shippingDetails: {
      cost: 0,
      shippingAddress: {
        recipientName: 'LGDeal INC',
        addressLine1: '123 Main St',
        city: 'New York',
        stateProvinceRegion: 'NY',
        postalCode: '10001',
        country: 'USA'
      }
    },
    requestDetails: {
      requestDate: new Date(),
      requestedBy: params.lgdealCompanyId,
      notes: 'Test seller deal created by automated testing'
    },
    activityLog: [{
      action: 'deal_created',
      performedBy: params.lgdealCompanyId,
      details: 'Test seller deal created',
      timestamp: new Date()
    }],
    lastActionAt: new Date()
  });
  
  console.log(`✅ Created test seller deal: ${dealNumber}`);
  return deal;
}

// ========== PRODUCT HELPERS ==========

/**
 * Обновить статус продукта
 */
export async function updateProductStatus(
  productId: Types.ObjectId,
  status: string,
  onDeal: boolean = false,
  dealId?: Types.ObjectId
): Promise<void> {
  await Product.updateOne(
    { _id: productId },
    { 
      status, 
      onDeal,
      ...(dealId && { dealId })
    }
  );
  console.log(`✅ Updated product ${productId} status to ${status}`);
}

/**
 * Добавить продукт в корзину пользователя
 */
export async function addProductToCart(
  userId: Types.ObjectId,
  productId: Types.ObjectId
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  
  if (!user.cart) {
    user.cart = { items: [], updatedAt: new Date() };
  }
  
  user.cart.items.push({
    product: productId,
    dateAdded: new Date()
  } as any);
  user.cart.updatedAt = new Date();
  
  await user.save();
  console.log(`✅ Added product ${productId} to user ${userId} cart`);
}

// ========== VERIFICATION HELPERS ==========

/**
 * Проверить состояние сделки
 */
export async function verifyDealState(
  dealId: Types.ObjectId,
  expectedStage: string,
  expectedStatus: string
): Promise<boolean> {
  const deal = await Deal.findById(dealId);
  if (!deal) {
    console.error(`❌ Deal ${dealId} not found`);
    return false;
  }
  
  const stageMatch = deal.stage === expectedStage;
  const statusMatch = deal.status === expectedStatus;
  
  if (stageMatch && statusMatch) {
    console.log(`✅ Deal ${deal.dealNumber} state verified: ${expectedStage}/${expectedStatus}`);
    return true;
  } else {
    console.error(`❌ Deal ${deal.dealNumber} state mismatch:`);
    console.error(`   Expected: ${expectedStage}/${expectedStatus}`);
    console.error(`   Actual: ${deal.stage}/${deal.status}`);
    return false;
  }
}

/**
 * Проверить статус продукта
 */
export async function verifyProductStatus(
  productId: Types.ObjectId,
  expectedStatus: string,
  expectedOnDeal: boolean = false
): Promise<boolean> {
  const product = await Product.findById(productId);
  if (!product) {
    console.error(`❌ Product ${productId} not found`);
    return false;
  }
  
  const statusMatch = product.status === expectedStatus;
  const onDealMatch = product.onDeal === expectedOnDeal;
  
  if (statusMatch && onDealMatch) {
    console.log(`✅ Product ${product.certificateNumber} status verified: ${expectedStatus}, onDeal: ${expectedOnDeal}`);
    return true;
  } else {
    console.error(`❌ Product ${product.certificateNumber} status mismatch:`);
    console.error(`   Expected: ${expectedStatus}, onDeal: ${expectedOnDeal}`);
    console.error(`   Actual: ${product.status}, onDeal: ${product.onDeal}`);
    return false;
  }
}

/**
 * Проверить, что продукт с данным сертификатом имеет статус Sold
 */
export async function verifyCertificateSold(
  certificateNumber: string,
  shouldBeSold: boolean
): Promise<boolean> {
  const product = await Product.findOne({ certificateNumber }).select('status').lean();
  const isSold = product?.status === 'Sold';
  
  if (isSold === shouldBeSold) {
    console.log(`✅ Certificate ${certificateNumber} Sold status verified: ${shouldBeSold}`);
    return true;
  } else {
    console.error(`❌ Certificate ${certificateNumber} Sold status mismatch:`);
    console.error(`   Expected: ${shouldBeSold}`);
    console.error(`   Actual: ${isSold} (status: ${product?.status ?? 'no product'})`);
    return false;
  }
}

// ========== DISPLAY HELPERS ==========

/**
 * Вывести детали сделки для отладки
 */
export async function displayDealDetails(dealId: Types.ObjectId): Promise<void> {
  const deal = await Deal.findById(dealId).populate('buyerId sellerId buyerCompanyId sellerCompanyId products.product');
  
  if (!deal) {
    console.error(`Deal ${dealId} not found`);
    return;
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log(`📋 Deal Details: ${deal.dealNumber}`);
  console.log('═══════════════════════════════════════════');
  console.log(`Type: ${deal.dealType}`);
  console.log(`Stage: ${deal.stage}`);
  console.log(`Status: ${deal.status}`);
  console.log(`Amount: $${deal.amount}`);
  console.log(`Fee: $${deal.fee}`);
  console.log(`Products: ${deal.products.length}`);
  
  if (deal.pairedDealId) {
    console.log(`Paired Deal ID: ${deal.pairedDealId}`);
  }
  
  if (deal.pairedDealIds && deal.pairedDealIds.length > 0) {
    console.log(`Paired Deals (${deal.pairedDealIds.length}): ${deal.pairedDealIds.join(', ')}`);
  }
  
  console.log('\nActivity Log:');
  deal.activityLog.slice(-3).forEach(log => {
    console.log(`  - ${log.action}: ${log.details}`);
  });
  
  console.log('═══════════════════════════════════════════\n');
}

/**
 * Вывести детали продукта для отладки
 */
export async function displayProductDetails(productId: Types.ObjectId): Promise<void> {
  const product = await Product.findById(productId).populate('company');
  
  if (!product) {
    console.error(`Product ${productId} not found`);
    return;
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log(`💎 Product Details: ${product.certificateNumber}`);
  console.log('═══════════════════════════════════════════');
  console.log(`Shape: ${product.shape}`);
  console.log(`Carat: ${product.carat}`);
  console.log(`Color: ${product.color}`);
  console.log(`Clarity: ${product.clarity}`);
  console.log(`Price: $${product.price}`);
  console.log(`Market Price: $${product.marketPrice}`);
  console.log(`Status: ${product.status}`);
  console.log(`On Deal: ${product.onDeal}`);
  if (product.dealId) {
    console.log(`Deal ID: ${product.dealId}`);
  }
  console.log('═══════════════════════════════════════════\n');
}

