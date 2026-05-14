/**
 * Глобальная очистка после Jest тестов
 */

import mongoose from 'mongoose';

export default async function globalTeardown() {
  try {
    // Очистка тестовой базы данных
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.db?.dropDatabase();
      await mongoose.connection.close();
      console.log('Test database cleaned up and disconnected');
    }
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
}
