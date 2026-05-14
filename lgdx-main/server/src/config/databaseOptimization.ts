import mongoose from 'mongoose';
import { logger } from '../utils/logger';

// Оптимизация индексов для производительности
export const optimizeDatabaseIndexes = async (): Promise<void> => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      logger.warn('[DatabaseOptimization] Database not connected, skipping index optimization');
      return;
    }

    logger.info('[DatabaseOptimization] Starting database index optimization...');

    // Индексы для коллекции Product
    const productCollection = db.collection('products');
    
    // Составной индекс для поиска продуктов (самый частый запрос)
    await productCollection.createIndex(
      { 
        shape: 1, 
        carat: 1, 
        color: 1, 
        clarity: 1,
        marketPrice: 1,
        isActive: 1
      },
      { 
        name: 'marketplace_search_compound',
        background: true 
      }
    );

    // Индекс для поиска по тексту
    await productCollection.createIndex(
      { 
        name: 'text',
        description: 'text',
        certificateNumber: 'text'
      },
      { 
        name: 'product_text_search',
        background: true,
        weights: {
          name: 10,
          certificateNumber: 5,
          description: 1
        }
      }
    );

    // Индекс для фильтрации по цене
    await productCollection.createIndex(
      { 
        marketPrice: 1,
        isActive: 1
      },
      { 
        name: 'price_filter',
        background: true 
      }
    );

    // Индекс для фильтрации по компании
    await productCollection.createIndex(
      { 
        company: 1,
        isActive: 1
      },
      { 
        name: 'company_filter',
        background: true 
      }
    );

    // Индекс для поиска альтернативных продуктов
    await productCollection.createIndex(
      { 
        shape: 1,
        carat: 1,
        color: 1,
        clarity: 1,
        isActive: 1
      },
      { 
        name: 'alternatives_search',
        background: true 
      }
    );

    // Индексы для коллекции User
    const userCollection = db.collection('users');
    
    // Индекс для поиска пользователей по email
    await userCollection.createIndex(
      { email: 1 },
      { 
        name: 'email_unique',
        unique: true,
        background: true 
      }
    );

    // Индекс для поиска пользователей по компании
    await userCollection.createIndex(
      { company: 1, isActive: 1 },
      { 
        name: 'company_users',
        background: true 
      }
    );

    // Индексы для коллекции Deal
    const dealCollection = db.collection('deals');
    
    // Индекс для поиска сделок пользователя
    await dealCollection.createIndex(
      { 
        buyerId: 1,
        status: 1,
        createdAt: -1
      },
      { 
        name: 'user_deals',
        background: true 
      }
    );

    // Индекс для поиска сделок по продукту
    await dealCollection.createIndex(
      { 
        productId: 1,
        status: 1
      },
      { 
        name: 'product_deals',
        background: true 
      }
    );

    // Индекс для поиска активных сделок
    await dealCollection.createIndex(
      { 
        status: 1,
        stage: 1,
        updatedAt: -1
      },
      { 
        name: 'active_deals',
        background: true 
      }
    );

    // Индексы для коллекции ChatSession
    const chatSessionCollection = db.collection('chatsessions');
    
    // Индекс для поиска активных чатов
    await chatSessionCollection.createIndex(
      { 
        status: 1,
        createdAt: -1
      },
      { 
        name: 'active_chats',
        background: true 
      }
    );

    // Индекс для поиска чатов пользователя
    await chatSessionCollection.createIndex(
      { 
        userId: 1,
        status: 1
      },
      { 
        name: 'user_chats',
        background: true 
      }
    );

    // Индексы для коллекции ChatMessage
    const chatMessageCollection = db.collection('chatmessages');
    
    // Индекс для поиска сообщений по сессии
    await chatMessageCollection.createIndex(
      { 
        sessionId: 1,
        createdAt: -1
      },
      { 
        name: 'session_messages',
        background: true 
      }
    );

    logger.info('[DatabaseOptimization] Database index optimization completed successfully');
  } catch (error) {
    logger.error('[DatabaseOptimization] Error optimizing database indexes:', { error });
  }
};

// Оптимизация настроек MongoDB
export const optimizeMongoDBSettings = (): void => {
  try {
    // Настройки для производительности
    mongoose.set('bufferCommands', false);
    
    // Настройки для отладки (только в development)
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', (collectionName, method, query, doc) => {
        logger.debug(`[MongoDB] ${collectionName}.${method}(${JSON.stringify(query)})`);
      });
    }

    logger.info('[DatabaseOptimization] MongoDB settings optimized');
  } catch (error) {
    logger.error('[DatabaseOptimization] Error optimizing MongoDB settings:', { error });
  }
};

// Функция для анализа производительности запросов
export const analyzeQueryPerformance = async (): Promise<void> => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      logger.warn('[DatabaseOptimization] Database not connected, skipping query analysis');
      return;
    }

    // Получаем статистику по индексам
    const productStats = await db.collection('products').stats();
    const userStats = await db.collection('users').stats();
    const dealStats = await db.collection('deals').stats();

    logger.info('[DatabaseOptimization] Collection statistics:', {
      products: {
        count: productStats.count,
        size: productStats.size,
        avgObjSize: productStats.avgObjSize,
        indexes: productStats.nindexes
      },
      users: {
        count: userStats.count,
        size: userStats.size,
        avgObjSize: userStats.avgObjSize,
        indexes: userStats.nindexes
      },
      deals: {
        count: dealStats.count,
        size: dealStats.size,
        avgObjSize: dealStats.avgObjSize,
        indexes: dealStats.nindexes
      }
    });

    // Получаем информацию об индексах
    const productIndexes = await db.collection('products').listIndexes().toArray();
    logger.info('[DatabaseOptimization] Product indexes:', productIndexes.map(idx => idx.name));

  } catch (error) {
    logger.error('[DatabaseOptimization] Error analyzing query performance:', { error });
  }
};
