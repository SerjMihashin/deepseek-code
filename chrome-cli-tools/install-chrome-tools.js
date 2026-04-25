#!/usr/bin/env node
/**
 * Скрипт установки Chrome CLI Tools.
 * 
 * Использование:
 *   node install-chrome-tools.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_DIR = path.join(__dirname);
const TARGET_DIR = 'C:\\Scripts';

console.log('=== Установка Chrome CLI Tools ===\n');

// Шаг 1: Создание директории
console.log('[1/5] Создание директории C:\\Scripts\\...');
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log('  ✓ Директория создана');
} else {
  console.log('  ✓ Директория уже существует');
}

// Шаг 2: Копирование файлов
console.log('\n[2/5] Копирование файлов...');
const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.js') || f.endsWith('.bat'));

files.forEach(file => {
  const source = path.join(SOURCE_DIR, file);
  const target = path.join(TARGET_DIR, file);
  fs.copyFileSync(source, target);
  console.log(`  ✓ ${file}`);
});

// Шаг 3: Инициализация npm
console.log('\n[3/5] Инициализация npm...');
try {
  execSync('npm init -y', { cwd: TARGET_DIR, stdio: 'pipe' });
  console.log('  ✓ package.json создан');
} catch (e) {
  console.log('  ⚠ package.json уже существует');
}

// Шаг 4: Установка puppeteer-core
console.log('\n[4/5] Установка puppeteer-core (это может занять несколько минут)...');
try {
  execSync('npm install puppeteer-core', { cwd: TARGET_DIR, stdio: 'inherit' });
  console.log('  ✓ puppeteer-core установлен');
} catch (e) {
  console.error('  ✗ Ошибка установки puppeteer-core');
  console.error('  Попробуйте вручную: cd C:\\Scripts && npm install puppeteer-core');
}

// Шаг 5: Проверка PATH
console.log('\n[5/5] Проверка PATH...');
const userPath = process.env.PATH || '';
if (userPath.includes(TARGET_DIR)) {
  console.log('  ✓ C:\\Scripts\\ уже в PATH');
} else {
  console.log('  ⚠ C:\\Scripts\\ НЕ в PATH');
  console.log('\n  Для добавления выполните в PowerShell (от администратора):');
  console.log('  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")');
  console.log('  [Environment]::SetEnvironmentVariable("Path", "$userPath;C:\\Scripts", "User")');
  console.log('\  Или добавьте вручную через "Система" → "Переменные среды"');
}

console.log('\n=== Установка завершена ===\n');
console.log('Следующие шаги:');
console.log('1. Если PATH не содержит C:\\Scripts\\ — добавьте его (см. выше)');
console.log('2. Перезапустите терминал');
console.log('3. Проверьте: chrome-open https://example.com');
console.log('\nДокументация: C:\\Scripts\\README.md');
