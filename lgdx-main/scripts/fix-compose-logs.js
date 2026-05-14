const fs = require('fs');
const path = require('path');

const files = [
  'e:/LGDX/docker-compose.prod.secure.final.yml',
  'e:/LGDX/docker-compose.prod.local.yml'
];

files.forEach(f => {
  if (!fs.existsSync(f)) {
    console.log(`Skipping ${f} - not found`);
    return;
  }
  
  let content = fs.readFileSync(f, 'utf8');
  
  // Добавляем x-logging блок в начало, если его нет
  if (!content.includes('x-logging:')) {
    content = content.replace(/^services:/m, 'x-logging: &default-logging\n  driver: json-file\n  options:\n    max-size: "20m"\n    max-file: "5"\n\nservices:');
  }
  
  // Аккуратно добавляем logging: *default-logging ко всем сервисам, если его там нет
  // Мы ищем строку с параметром image: (так как он есть почти у всех сервисов) и 4 пробелами отступа
  const lines = content.split('\n');
  const newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    newLines.push(lines[i]);
    // Если это строка image: с 4 пробелами (уровень сервиса)
    if (lines[i].startsWith('    image:')) {
      // Проверяем, есть ли уже logging
      let hasLogging = false;
      // Смотрим следующие 15 строк (в рамках этого же сервиса) на предмет logging
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (lines[j].startsWith('  ') && !lines[j].startsWith('    ')) break; // Начался следующий сервис
        if (lines[j].trim().startsWith('logging:')) {
          hasLogging = true;
          break;
        }
      }
      
      if (!hasLogging) {
        newLines.push('    logging: *default-logging');
      }
    }
  }
  
  fs.writeFileSync(f, newLines.join('\n'));
  console.log(`Successfully updated ${f}`);
});
