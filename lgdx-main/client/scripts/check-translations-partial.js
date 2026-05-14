/**
 * Скрипт для проверки полноты переводов (по частям)
 * Проверяет наличие всех ключей из английского (en) в других языках
 * 
 * Использование: node scripts/check-translations-partial.js [locale]
 * Пример: node scripts/check-translations-partial.js hi
 */

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/i18n/locales');

/**
 * Извлекает все ключи из объекта переводов (рекурсивно)
 */
function extractAllKeys(obj, prefix = '', keys = []) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      extractAllKeys(value, fullKey, keys);
    } else {
      keys.push(fullKey);
    }
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
 * Получает все секции из файла переводов
 */
function getSections(content) {
  if (!content) return [];
  
  const match = content.match(/const \w+: TranslationDictionary = \{([\s\S]*?)\n\};/m);
  if (!match) return [];
  
  const sections = [];
  const sectionPattern = /^\s+([a-zA-Z][a-zA-Z0-9]*):\s*\{/gm;
  let sectionMatch;
  
  while ((sectionMatch = sectionPattern.exec(match[1])) !== null) {
    sections.push(sectionMatch[1]);
  }
  
  return sections;
}

/**
 * Проверяет один язык
 */
function checkLocale(locale) {
  console.log(`\n🔍 Проверка языка: ${locale.toUpperCase()}\n`);
  
  // Читаем английский файл (эталон)
  const enContent = readLocaleFile('en');
  if (!enContent) {
    console.log(`❌ Английский файл (en.ts) не найден!`);
    return;
  }
  
  // Получаем секции из английского
  const enSections = getSections(enContent);
  console.log(`📋 Найдено секций в английском: ${enSections.length}`);
  console.log(`   Секции: ${enSections.join(', ')}\n`);
  
  // Читаем файл целевого языка
  const localeContent = readLocaleFile(locale);
  if (!localeContent) {
    console.log(`❌ Файл ${locale}.ts не найден!`);
    return;
  }
  
  // Получаем секции из целевого языка
  const localeSections = getSections(localeContent);
  console.log(`📋 Найдено секций в ${locale}: ${localeSections.length}`);
  console.log(`   Секции: ${localeSections.join(', ')}\n`);
  
  // Проверяем отсутствующие секции
  const missingSections = enSections.filter(s => !localeSections.includes(s));
  const extraSections = localeSections.filter(s => !enSections.includes(s));
  
  if (missingSections.length > 0) {
    console.log(`⚠️  Отсутствующие секции (${missingSections.length}):`);
    missingSections.forEach(s => console.log(`   - ${s}`));
  } else {
    console.log(`✅ Все секции присутствуют!`);
  }
  
  if (extraSections.length > 0) {
    console.log(`\nℹ️  Дополнительные секции (${extraSections.length}):`);
    extraSections.forEach(s => console.log(`   - ${s}`));
  }
  
  return {
    locale,
    totalSections: enSections.length,
    foundSections: localeSections.length,
    missingSections,
    extraSections,
    isComplete: missingSections.length === 0
  };
}

// Главная функция
function main() {
  const locale = process.argv[2];
  
  if (!locale) {
    console.log('Использование: node check-translations-partial.js [locale]');
    console.log('Пример: node check-translations-partial.js hi');
    console.log('\nДоступные языки: en, hi, zh, ja, fr, de');
    process.exit(1);
  }
  
  const result = checkLocale(locale);
  
  if (result) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Результат: ${result.isComplete ? '✅ Полный' : '⚠️  Неполный'}`);
    console.log(`   Секций: ${result.foundSections}/${result.totalSections}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkLocale };

