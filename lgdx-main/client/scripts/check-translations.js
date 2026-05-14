/**
 * Скрипт для проверки полноты переводов
 * Проверяет, что все ключи из английского (en) присутствуют во всех других языках
 * 
 * Использование: node scripts/check-translations.js
 */

const fs = require('fs');
const path = require('path');

// Путь к директории с переводами
const localesDir = path.join(__dirname, '../src/i18n/locales');

/**
 * Рекурсивно извлекает все ключи из объекта переводов
 * Поддерживает вложенные объекты
 */
function extractKeys(obj, prefix = '') {
  const keys = [];
  
  if (!obj || typeof obj !== 'object') {
    return keys;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Рекурсивно обрабатываем вложенные объекты
      keys.push(...extractKeys(value, fullKey));
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      // Это конечное значение - добавляем ключ
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * Парсит объект переводов из файла, используя eval для безопасного выполнения
 * ВАЖНО: Это работает только для файлов, которые мы контролируем
 */
function parseTranslationObject(content, locale) {
  try {
    // Находим объект переводов для данного языка
    const localeRegex = new RegExp(`const ${locale}: TranslationDictionary = \\{([\\s\\S]*?)\\n\\};`, 'm');
    const match = content.match(localeRegex);
    
    if (!match) {
      return null;
    }
    
    // Извлекаем содержимое объекта
    let objContent = match[1];
    
    // Убираем комментарии
    objContent = objContent.replace(/\/\*[\s\S]*?\*\//g, '');
    objContent = objContent.replace(/\/\/.*/g, '');
    
    // Создаем временный объект для парсинга
    // Используем более безопасный подход - парсим структуру вручную
    const translations = {};
    
    // Парсим ключи и значения
    const keyValueRegex = /([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/g;
    const sections = [];
    let sectionMatch;
    
    while ((sectionMatch = keyValueRegex.exec(objContent)) !== null) {
      const sectionName = sectionMatch[1];
      const startPos = sectionMatch.index + sectionMatch[0].length;
      
      // Находим закрывающую скобку для этой секции
      let depth = 1;
      let pos = startPos;
      let endPos = -1;
      
      while (pos < objContent.length && depth > 0) {
        if (objContent[pos] === '{') depth++;
        if (objContent[pos] === '}') depth--;
        pos++;
      }
      
      if (depth === 0) {
        endPos = pos - 1;
        sections.push({
          name: sectionName,
          content: objContent.substring(startPos, endPos)
        });
      }
    }
    
    // Для каждой секции извлекаем ключи
    const allKeys = [];
    sections.forEach(section => {
      const keys = extractKeysFromSection(section.content, section.name);
      allKeys.push(...keys);
    });
    
    return allKeys;
  } catch (error) {
    console.error(`Ошибка при парсинге переводов для ${locale}:`, error.message);
    return null;
  }
}

/**
 * Извлекает ключи из секции
 */
function extractKeysFromSection(content, sectionPrefix) {
  const keys = [];
  
  // Ищем все ключи в формате key: 'value' или key: {
  const keyPattern = /([a-zA-Z_][a-zA-Z0-9_]*):\s*(?:'[^']*'|"[^"]*"|`[^`]*`|\{)/g;
  let match;
  
  while ((match = keyPattern.exec(content)) !== null) {
    const key = match[1];
    const fullKey = `${sectionPrefix}.${key}`;
    
    // Проверяем, является ли это объектом или значением
    const afterColon = content.substring(match.index + match[0].length).trim();
    if (afterColon.startsWith('{')) {
      // Это вложенный объект - рекурсивно обрабатываем
      const nestedStart = match.index + match[0].length;
      let depth = 1;
      let pos = nestedStart + 1;
      
      while (pos < content.length && depth > 0) {
        if (content[pos] === '{') depth++;
        if (content[pos] === '}') depth--;
        pos++;
      }
      
      if (depth === 0) {
        const nestedContent = content.substring(nestedStart + 1, pos - 1);
        const nestedKeys = extractKeysFromSection(nestedContent, fullKey);
        keys.push(...nestedKeys);
      }
    } else {
      // Это простое значение
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * Более простой и надежный подход - используем регулярные выражения для поиска всех ключей
 */
function extractKeysSimple(content, locale) {
  const keys = [];
  
  // Находим начало объекта переводов
  const localeRegex = new RegExp(`const ${locale}: TranslationDictionary = \\{([\\s\\S]*?)\\n\\};`, 'm');
  const match = content.match(localeRegex);
  
  if (!match) {
    return keys;
  }
  
  const objContent = match[1];
  
  // Извлекаем все ключи в формате key: (с учетом вложенности)
  // Используем более точный паттерн
  const keyPattern = /([a-zA-Z_][a-zA-Z0-9_]*):\s*(?:'[^']*'|"[^"]*"|`[^`]*`|\{)/g;
  const keyMatches = [];
  let keyMatch;
  
  while ((keyMatch = keyPattern.exec(objContent)) !== null) {
    const key = keyMatch[1];
    const position = keyMatch.index;
    
    // Определяем уровень вложенности
    const beforeKey = objContent.substring(0, position);
    const openBraces = (beforeKey.match(/\{/g) || []).length;
    const closeBraces = (beforeKey.match(/\}/g) || []).length;
    const depth = openBraces - closeBraces;
    
    // Строим путь к ключу
    const path = [];
    let currentPos = 0;
    let currentDepth = 0;
    const braceStack = [];
    
    for (let i = 0; i < position; i++) {
      if (objContent[i] === '{') {
        currentDepth++;
        // Находим предыдущий ключ на этом уровне
        const prevKeyMatch = objContent.substring(currentPos, i).match(/([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/);
        if (prevKeyMatch) {
          braceStack.push({
            key: prevKeyMatch[1],
            depth: currentDepth - 1
          });
        }
        currentPos = i + 1;
      } else if (objContent[i] === '}') {
        currentDepth--;
        // Удаляем закрытые секции из стека
        while (braceStack.length > 0 && braceStack[braceStack.length - 1].depth >= currentDepth) {
          braceStack.pop();
        }
        currentPos = i + 1;
      }
    }
    
    // Строим полный путь
    const fullPath = [...braceStack.map(s => s.key), key].join('.');
    keys.push(fullPath);
  }
  
  return keys;
}

/**
 * Читает файл переводов для языка
 */
function readLocaleFile(locale) {
  const filePath = path.join(localesDir, `${locale}.ts`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Улучшенный метод - используем более простой подход с регулярными выражениями
 */
function extractAllKeys(locale) {
  const keys = new Set();
  
  // Читаем файл переводов
  const content = readLocaleFile(locale);
  if (!content) {
    return [];
  }
  
  // Находим объект переводов
  const localeRegex = new RegExp(`const ${locale}: TranslationDictionary = \\{([\\s\\S]*?)\\n\\};`, 'm');
  const match = content.match(localeRegex);
  
  if (!match) {
    return [];
  }
  
  const objContent = match[1];
  
  // Ищем все паттерны вида: sectionName: { ... key: 'value' ... }
  // Разбиваем на секции
  const sections = [];
  const sectionRegex = /([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/g;
  let sectionMatch;
  
  while ((sectionMatch = sectionRegex.exec(objContent)) !== null) {
    const sectionName = sectionMatch[1];
    const startPos = sectionMatch.index + sectionMatch[0].length - 1; // Позиция после {
    
    // Находим закрывающую скобку
    let depth = 1;
    let pos = startPos + 1;
    
    while (pos < objContent.length && depth > 0) {
      if (objContent[pos] === '{') depth++;
      if (objContent[pos] === '}') depth--;
      pos++;
    }
    
    if (depth === 0) {
      const sectionContent = objContent.substring(startPos + 1, pos - 1);
      sections.push({ name: sectionName, content: sectionContent });
    }
  }
  
  // Для каждой секции извлекаем ключи
  sections.forEach(section => {
    // Ключи верхнего уровня
    keys.add(section.name);
    
    // Ищем вложенные ключи
    const keyRegex = /([a-zA-Z_][a-zA-Z0-9_]*):\s*(?:'[^']*'|"[^"]*"|`[^`]*`)/g;
    let keyMatch;
    
    while ((keyMatch = keyRegex.exec(section.content)) !== null) {
      const key = keyMatch[1];
      keys.add(`${section.name}.${key}`);
      
      // Проверяем, есть ли вложенные объекты
      const afterColon = section.content.substring(keyMatch.index + keyMatch[0].length).trim();
      if (afterColon.startsWith('{')) {
        // Это вложенный объект - рекурсивно обрабатываем
        const nestedKeys = extractNestedKeys(afterColon, `${section.name}.${key}`);
        nestedKeys.forEach(k => keys.add(k));
      }
    }
  });
  
  return Array.from(keys).sort();
}

/**
 * Извлекает вложенные ключи
 */
function extractNestedKeys(content, prefix) {
  const keys = [];
  let depth = 0;
  let startPos = 0;
  
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) startPos = i + 1;
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        const nestedContent = content.substring(startPos, i);
        const keyRegex = /([a-zA-Z_][a-zA-Z0-9_]*):\s*(?:'[^']*'|"[^"]*"|`[^`]*`)/g;
        let keyMatch;
        
        while ((keyMatch = keyRegex.exec(nestedContent)) !== null) {
          keys.push(`${prefix}.${keyMatch[1]}`);
        }
        break;
      }
    }
  }
  
  return keys;
}

/**
 * Основная функция проверки
 */
function checkTranslations() {
  const locales = ['en', 'hi', 'zh', 'ja', 'fr', 'de'];
  
  console.log('🔍 Проверка полноты переводов...\n');
  
  // Извлекаем ключи из английского языка (эталон)
  const enKeys = extractAllKeys('en');
  
  console.log(`✅ Английский (en): ${enKeys.length} ключей найдено\n`);
  
  // Проверяем другие языки
  const issues = [];
  const allIssues = [];
  
  for (const locale of locales.slice(1)) {
    const localeKeys = extractAllKeys(locale);
    const missingKeys = enKeys.filter(key => !localeKeys.includes(key));
    const extraKeys = localeKeys.filter(key => !enKeys.includes(key));
    
    console.log(`📋 ${locale.toUpperCase()}:`);
    console.log(`   Всего ключей: ${localeKeys.length}`);
    console.log(`   Ожидается: ${enKeys.length}`);
    
    if (missingKeys.length > 0) {
      console.log(`   ⚠️  Отсутствующие ключи: ${missingKeys.length}`);
      issues.push({
        locale,
        type: 'missing',
        keys: missingKeys
      });
      
      allIssues.push(...missingKeys.map(key => ({ locale, key })));
      
      // Показываем первые 10 отсутствующих ключей
      missingKeys.slice(0, 10).forEach(key => {
        console.log(`      - ${key}`);
      });
      if (missingKeys.length > 10) {
        console.log(`      ... и еще ${missingKeys.length - 10} ключей`);
      }
    } else {
      console.log(`   ✅ Все ключи присутствуют`);
    }
    
    if (extraKeys.length > 0) {
      console.log(`   ℹ️  Дополнительные ключи (не в en): ${extraKeys.length}`);
      if (extraKeys.length <= 5) {
        extraKeys.forEach(key => {
          console.log(`      + ${key}`);
        });
      }
    }
    
    console.log('');
  }
  
  // Итоговый отчет
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ИТОГОВЫЙ ОТЧЕТ\n');
  
  if (issues.length === 0) {
    console.log('✅ Все переводы полные! Нет отсутствующих ключей.');
  } else {
    console.log(`⚠️  Найдено проблем: ${issues.length} языков с отсутствующими ключами`);
    console.log(`   Всего отсутствующих ключей: ${allIssues.length}`);
    console.log('\nРекомендация: Заполните недостающие переводы.');
  }
  
  // Сохраняем отчет в файл
  if (allIssues.length > 0) {
    const reportPath = path.join(__dirname, '../MISSING_TRANSLATIONS.md');
    let report = '# Отсутствующие переводы\n\n';
    report += `Дата проверки: ${new Date().toISOString()}\n\n`;
    
    issues.forEach(issue => {
      report += `## ${issue.locale.toUpperCase()}\n\n`;
      report += `Отсутствует ${issue.keys.length} ключей:\n\n`;
      issue.keys.forEach(key => {
        report += `- \`${key}\`\n`;
      });
      report += '\n';
    });
    
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`\n📄 Детальный отчет сохранен в: ${reportPath}`);
  }
  
  return issues;
}

// Запуск проверки
if (require.main === module) {
  try {
    const issues = checkTranslations();
    process.exit(issues.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Ошибка при проверке переводов:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { checkTranslations };
