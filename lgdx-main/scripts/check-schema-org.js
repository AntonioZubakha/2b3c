#!/usr/bin/env node

/**
 * Скрипт для проверки Schema.org разметки на сайте
 * Использование: node scripts/check-schema-org.js [URL]
 */

const https = require('https');
const http = require('http');

const URL = process.argv[2] || 'https://lgdeal.com';

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function extractJSONLD(html) {
  const jsonldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
  const matches = [];
  let match;
  
  while ((match = jsonldRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      matches.push(json);
    } catch (e) {
      console.warn('⚠️  Ошибка парсинга JSON-LD:', e.message);
    }
  }
  
  return matches;
}

function checkOrganizationSchema(schema) {
  if (schema['@type'] !== 'Organization') {
    return null;
  }
  
  const issues = [];
  const checks = {
    name: schema.name ? '✅' : '❌',
    url: schema.url ? '✅' : '❌',
    logo: schema.logo ? '✅' : '❌',
    description: schema.description ? '✅' : '❌'
  };
  
  // Проверка logo
  if (schema.logo) {
    if (schema.logo['@type'] !== 'ImageObject') {
      issues.push('❌ Logo должен быть типа ImageObject');
    }
    
    if (!schema.logo.url) {
      issues.push('❌ Logo URL не указан');
    } else {
      // Проверка размера
      const width = schema.logo.width;
      const height = schema.logo.height;
      
      if (!width || !height) {
        issues.push('⚠️  Logo размеры не указаны');
      } else if (width < 112 || height < 112) {
        issues.push(`⚠️  Logo слишком маленький: ${width}x${height}px (минимум 112x112px)`);
      } else if (width !== height) {
        issues.push(`⚠️  Logo не квадратный: ${width}x${height}px`);
      } else {
        console.log(`✅ Logo размер: ${width}x${height}px (соответствует требованиям)`);
      }
      
      // Проверка доступности URL
      if (schema.logo.url.startsWith('http')) {
        console.log(`ℹ️  Logo URL: ${schema.logo.url}`);
      }
    }
  } else {
    issues.push('❌ Logo не найден в Organization schema');
  }
  
  return {
    schema,
    checks,
    issues
  };
}

async function main() {
  console.log(`\n🔍 Проверка Schema.org разметки для: ${URL}\n`);
  console.log('=' .repeat(60));
  
  try {
    const html = await fetchHTML(URL);
    const schemas = extractJSONLD(html);
    
    if (schemas.length === 0) {
      console.log('\n⚠️  JSON-LD разметка не найдена в HTML');
      console.log('   Это может быть нормально, если разметка генерируется на клиенте (React SPA)');
      console.log('   Проверьте через браузер DevTools или Google Rich Results Test\n');
      return;
    }
    
    console.log(`\n📊 Найдено JSON-LD блоков: ${schemas.length}\n`);
    
    let organizationFound = false;
    
    schemas.forEach((schema, index) => {
      console.log(`\n📦 Schema ${index + 1}: ${schema['@type'] || 'Unknown'}`);
      
      if (schema['@type'] === 'Organization') {
        organizationFound = true;
        const result = checkOrganizationSchema(schema);
        
        if (result) {
          console.log('\n✅ Organization Schema найден!');
          console.log(`   Name: ${schema.name || 'N/A'}`);
          console.log(`   URL: ${schema.url || 'N/A'}`);
          
          if (result.issues.length > 0) {
            console.log('\n⚠️  Проблемы:');
            result.issues.forEach(issue => console.log(`   ${issue}`));
          } else {
            console.log('\n✅ Все проверки пройдены!');
          }
        }
      }
    });
    
    if (!organizationFound) {
      console.log('\n⚠️  Organization Schema не найден в HTML');
      console.log('   Это может быть нормально, если разметка генерируется на клиенте (React SPA)');
      console.log('   Проверьте через браузер DevTools или Google Rich Results Test');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📝 Рекомендации:');
    console.log('   1. Проверьте через Google Rich Results Test:');
    console.log('      https://search.google.com/test/rich-results');
    console.log('   2. Проверьте через Schema.org Validator:');
    console.log('      https://validator.schema.org/');
    console.log('   3. Для SPA проверьте через браузер DevTools (F12)\n');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

main();

