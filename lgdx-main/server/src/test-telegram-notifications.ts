#!/usr/bin/env node

/**
 * TypeScript тест Telegram уведомлений о сделках
 * Запуск: npm run test:telegram или npx ts-node src/test-telegram-notifications.ts
 */

import { sendDealChangeNotification } from './utils/telegramBot';

console.log('🧪 Тестирование Telegram уведомлений о сделках...\n');

// Тест 1: Изменение статуса
console.log('📝 Тест 1: Изменение статуса сделки');
sendDealChangeNotification({
    dealNumber: 'TEST-001',
    dealId: '507f1f77bcf86cd799439011',
    oldStatus: 'pending',
    newStatus: 'awaiting_payment',
    changedBy: 'Test User',
    changeType: 'status',
    additionalInfo: 'Тестовое уведомление о смене статуса'
});

// Тест 2: Изменение стадии
console.log('📝 Тест 2: Изменение стадии сделки');
sendDealChangeNotification({
    dealNumber: 'TEST-002',
    dealId: '507f1f77bcf86cd799439012',
    oldStage: 'request',
    newStage: 'payment_delivery',
    changedBy: 'System (Stripe Payment)',
    changeType: 'stage',
    additionalInfo: 'Платеж получен через Stripe'
});

// Тест 3: Изменение и статуса, и стадии
console.log('📝 Тест 3: Изменение статуса и стадии одновременно');
sendDealChangeNotification({
    dealNumber: 'TEST-003',
    dealId: '507f1f77bcf86cd799439013',
    oldStatus: 'awaiting_payment',
    newStatus: 'completed',
    oldStage: 'payment_delivery',
    newStage: 'completed',
    changedBy: 'LGDEAL Admin',
    changeType: 'both',
    additionalInfo: 'Сделка завершена успешно'
});

// Тест 4: Загрузка инвойса
console.log('📝 Тест 4: Загрузка инвойса');
sendDealChangeNotification({
    dealNumber: 'TEST-004',
    dealId: '507f1f77bcf86cd799439014',
    oldStatus: 'awaiting_invoice',
    newStatus: 'invoice_pending',
    changedBy: 'Supplier Company',
    changeType: 'status',
    additionalInfo: 'Invoice: invoice_2024_001.pdf'
});

// Тест 5: Предложение альтернативного продукта
console.log('📝 Тест 5: Предложение альтернативного продукта');
sendDealChangeNotification({
    dealNumber: 'TEST-005',
    dealId: '507f1f77bcf86cd799439015',
    oldStatus: 'pending',
    newStatus: 'alternative_product_proposed',
    changedBy: 'LGDEAL',
    changeType: 'status',
    additionalInfo: 'Alternative product: Round 1.5ct'
});

console.log('\n✅ Все тесты отправлены! Проверьте Telegram канал для получения уведомлений.');
console.log('📱 Канал: TELEGRAM_CHAT_ID (из переменных окружения)');
console.log('🤖 Бот: TELEGRAM_BOT_TOKEN (из переменных окружения)');
