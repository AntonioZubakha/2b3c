/**
 * Глобальная настройка для Jest тестов
 */

import mongoose from 'mongoose';

export default async function globalSetup() {
  // Подключение к тестовой базе данных
  const mongoUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/lgdx_ftp_test';
  
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to test MongoDB');
    
    // Очистка тестовой базы данных перед запуском тестов
    await mongoose.connection.db?.dropDatabase();
    console.log('Test database cleared');
    
  } catch (error) {
    console.error('Failed to setup test database:', error);
    process.exit(1);
  }
}
