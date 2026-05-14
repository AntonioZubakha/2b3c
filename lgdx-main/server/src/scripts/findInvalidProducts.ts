import mongoose from 'mongoose';
import Product from '../models/Product';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const findInvalidProducts = async () => {
  try {
    // Connect to MongoDB
    logger.info('Attempting to connect to MongoDB...');
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/lgdx';
    await mongoose.connect(mongoURI);
    logger.info(`MongoDB Connected: ${mongoose.connection.host}`);
    
    // Поиск продуктов с некорректными значениями веса
    logger.info('Searching for products with invalid carat values...');
    
    // 1. Общее количество продуктов
    const totalProducts = await Product.countDocuments();
    logger.info(`Total products in database: ${totalProducts}`);
    
    // 2. Доступные продукты
    const availableProducts = await Product.countDocuments({ status: 'available' });
    logger.info(`Available products: ${availableProducts}`);
    
    // 3. Продукты с null или undefined значением carat
    const nullCaratProducts = await Product.countDocuments({ 
      carat: null,
      status: 'available'
    });
    logger.info(`Products with null carat value: ${nullCaratProducts}`);
    
    // 4. Продукты с NaN значением carat (не напрямую, т.к. MongoDB не поддерживает поиск NaN)
    // Загружаем все продукты и фильтруем в памяти
    const allProducts = await Product.find({ status: 'available' }).select('_id carat');
    const nanCaratProducts = allProducts.filter(product => product.carat != null && typeof product.carat === 'number' && isNaN(product.carat));
    logger.info(`Products with NaN carat value: ${nanCaratProducts.length}`);
    
    // 5. Продукты с некорректными значениями clarity (не из допустимого списка)
    const validClarities = ['IF', 'VVS1', 'VVS2', 'VS1', 'VS2'];
    const invalidClarityProducts = await Product.countDocuments({
      clarity: { $nin: validClarities },
      status: 'available'
    });
    logger.info(`Products with invalid clarity value: ${invalidClarityProducts}`);
    
    // 6. Продукты с некорректными значениями shape
    const invalidShapeProducts = await Product.find({
      shape: { $nin: [/^round$/i, /^princess$/i, /^emerald$/i, /^oval$/i, /^marquise$/i, /^pear$/i, /^cushion$/i, /^radiant$/i, /^heart$/i, /^asscher$/i] },
      status: 'available'
    }).select('_id shape');
    
    logger.info(`Products with invalid shape value: ${invalidShapeProducts.length}`);
    if (invalidShapeProducts.length > 0) {
      logger.debug('Sample of invalid shapes:');
      const uniqueShapes = [...new Set(invalidShapeProducts.slice(0, 100).map(p => p.shape))];
      logger.debug(uniqueShapes as any);
    }
    
    // 7. Анализ разницы между общим количеством и подсчитанными категориями
    logger.info(`\nAnalysis of category stats:`);
    logger.info(`Total available products: ${availableProducts}`);
    logger.info(`Products in category stats: 232,881`);
    logger.info(`Difference: ${availableProducts - 232881}`);
    
    // 8. Вывод нескольких примеров продуктов с NaN значением carat
    if (nanCaratProducts.length > 0) {
      logger.info('\nSample of products with NaN carat value:');
      const sampleProducts = await Product.find({ 
        _id: { $in: nanCaratProducts.slice(0, 5).map(p => p._id) } 
      });
      
      sampleProducts.forEach((product, index) => {
        logger.debug(`\nProduct ${index + 1}:`);
        logger.debug(`ID: ${product._id}`);
        logger.debug(`Carat: ${product.carat}`);
        logger.debug(`Shape: ${product.shape}`);
        logger.debug(`Clarity: ${product.clarity}`);
        logger.debug(`Status: ${product.status}`);
      });
    }
    
    // Закрываем соединение с MongoDB
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    
  } catch (error) {
    logger.error('Error finding invalid products:', { error });
    await mongoose.connection.close();
    logger.info('MongoDB connection closed due to error');
  }
};

// Запускаем функцию
findInvalidProducts();
