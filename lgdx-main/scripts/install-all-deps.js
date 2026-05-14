#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, total, message) {
  log(`[${step}/${total}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function checkDirectory(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function checkPackageJson(dirPath) {
  return fs.existsSync(path.join(dirPath, 'package.json'));
}

function runNpmInstall(dirPath, options = {}) {
  const { legacyPeerDeps = false, step = 1, total = 1 } = options;
  
  if (!checkDirectory(dirPath)) {
    logError(`Директория не найдена: ${dirPath}`);
    return false;
  }
  
  if (!checkPackageJson(dirPath)) {
    logWarning(`package.json не найден в: ${dirPath}`);
    return false;
  }
  
  const dirName = path.basename(dirPath);
  logStep(step, total, `Устанавливаем зависимости в ${dirName}...`);
  
  try {
    const command = legacyPeerDeps 
      ? 'npm install --legacy-peer-deps' 
      : 'npm install';
    
    log(`   Команда: ${command}`, 'blue');
    
    execSync(command, {
      cwd: dirPath,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    logSuccess(`Зависимости установлены в ${dirName}`);
    return true;
  } catch (error) {
    logError(`Ошибка установки зависимостей в ${dirName}: ${error.message}`);
    return false;
  }
}

function main() {
  log('🚀 УНИВЕРСАЛЬНЫЙ УСТАНОВЩИК ЗАВИСИМОСТЕЙ LGDX', 'bright');
  log('', 'reset');
  
  // Получаем корневую директорию проекта
  const rootDir = path.resolve(__dirname, '..');
  const currentDir = process.cwd();
  
  // Проверяем, что мы в правильной директории
  if (!checkDirectory(path.join(rootDir, 'client')) || 
      !checkDirectory(path.join(rootDir, 'server'))) {
    logError('Скрипт должен запускаться из корня проекта LGDX');
    logError(`Текущая директория: ${currentDir}`);
    logError(`Ожидаемая структура: ${rootDir}/client, ${rootDir}/server`);
    process.exit(1);
  }
  
  const installSteps = [
    {
      path: path.join(rootDir, 'client'),
      name: 'Client',
      legacyPeerDeps: true,
      description: 'React клиент (--legacy-peer-deps)'
    },
    {
      path: path.join(rootDir, 'server'),
      name: 'Server',
      legacyPeerDeps: false,
      description: 'Node.js сервер'
    },
    {
      path: path.join(rootDir, 'mobile'),
      name: 'Mobile',
      legacyPeerDeps: false,
      description: 'React Native (Expo) приложение'
    },
    {
      path: path.join(rootDir, 'api-product-sync-service'),
      name: 'API Sync Service',
      legacyPeerDeps: false,
      description: 'API синхронизации продуктов'
    },
    {
      path: path.join(rootDir, 'file-product-import-service'),
      name: 'File Import Service',
      legacyPeerDeps: false,
      description: 'Сервис импорта файлов'
    },
    {
      path: path.join(rootDir, 'market-price-calculator-service'),
      name: 'Market Price Calculator',
      legacyPeerDeps: false,
      description: 'Сервис расчета маркетпрайс'
    },
    {
      path: path.join(rootDir, 'analytics-service'),
      name: 'Analytics Service',
      legacyPeerDeps: false,
      description: 'Сервис аналитики'
    },
    {
      path: path.join(rootDir, 'backup-service'),
      name: 'Backup Service',
      legacyPeerDeps: false,
      description: 'Сервис резервного копирования'
    },
    {
      path: path.join(rootDir, 'ftp-product-sync-service'),
      name: 'FTP Sync Service',
      legacyPeerDeps: false,
      description: 'Сервис синхронизации по FTP'
    },
    {
      path: path.join(rootDir, 'scripts'),
      name: 'Scripts',
      legacyPeerDeps: false,
      description: 'Утилиты и скрипты'
    }
  ];
  
  let successCount = 0;
  let totalSteps = installSteps.length;
  
  log(`📋 Найдено ${totalSteps} директорий для установки зависимостей:`, 'bright');
  installSteps.forEach((step, index) => {
    log(`   ${index + 1}. ${step.name} - ${step.description}`, 'blue');
  });
  log('', 'reset');
  
  // Устанавливаем зависимости по порядку
  for (let i = 0; i < installSteps.length; i++) {
    const step = installSteps[i];
    
    if (runNpmInstall(step.path, {
      legacyPeerDeps: step.legacyPeerDeps,
      step: i + 1,
      total: totalSteps
    })) {
      successCount++;
    }
    
    log('', 'reset');
  }
  
  // Итоговый отчет
  log('📊 ИТОГОВЫЙ ОТЧЕТ:', 'bright');
  log(`✅ Успешно установлено: ${successCount}/${totalSteps}`, 'green');
  
  if (successCount < totalSteps) {
    log(`❌ Ошибок: ${totalSteps - successCount}`, 'red');
    logWarning('Некоторые зависимости не были установлены. Проверьте ошибки выше.');
    process.exit(1);
  } else {
    log('🎉 ВСЕ ЗАВИСИМОСТИ УСПЕШНО УСТАНОВЛЕНЫ!', 'bright');
    log('', 'reset');
    log('📝 Следующие шаги:', 'cyan');
    log('   1. Запустите development окружение: npm run dev', 'blue');
    log('   2. Или запустите production: npm run prod', 'blue');
    log('   3. Проверьте документацию в info/README.md', 'blue');
  }
}

// Обработка ошибок
process.on('uncaughtException', (error) => {
  logError(`Критическая ошибка: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Необработанное отклонение промиса: ${reason}`);
  process.exit(1);
});

// Запуск скрипта
if (require.main === module) {
  main();
}

module.exports = { runNpmInstall, checkDirectory, checkPackageJson }; 