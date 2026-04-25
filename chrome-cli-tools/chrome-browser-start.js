#!/usr/bin/env node
/**
 * chrome-browser-start - Запуск Chrome с отладочным портом (изолированный профиль).
 *
 * Использование:
 *   chrome-browser-start
 *   chrome-browser-start --port 9223
 *   chrome-browser-start --headless
 *
 * Профиль автоматизации: %TEMP%\chrome-automation-profile
 * Этот профиль отделён от вашего основного браузера с учётной записью.
 *
 * При повторном запуске подключается к уже запущенному Chrome, не создавая новый.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

function findChrome() {
  for (const chromePath of CHROME_PATHS) {
    if (!chromePath) continue;
    try {
      if (fs.existsSync(chromePath)) return chromePath;
    } catch (e) {}
  }
  return null;
}

async function checkPort(port) {
  try {
    const response = await fetch(`http://localhost:${port}/json/version`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const port = portIndex !== -1 && args[portIndex + 1] ? args[portIndex + 1] : '9222';
  const headless = args.includes('--headless');

  const userDataDir = path.join(process.env.TEMP || '', 'chrome-automation-profile');

  const chromePath = findChrome();
  if (!chromePath) {
    console.error('[chrome-browser-start] ОШИБКА: Chrome не найден!');
    console.error('[chrome-browser-start] Укажите путь: setx CHROME_PATH "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"');
    console.error('');
    console.error('[chrome-browser-start] Стандартные пути проверены:');
    for (const p of CHROME_PATHS) {
      if (p) console.error(`  ${p} — ${fs.existsSync(p) ? 'найден' : 'не найден'}`);
    }
    process.exit(1);
  }

  // Проверяем, не запущен ли уже Chrome на этом порту
  const alreadyRunning = await checkPort(port);
  if (alreadyRunning) {
    console.error(`[chrome-browser-start] Chrome уже запущен на порту ${port}.`);
    console.error('[chrome-browser-start] Используйте: chrome-tab <URL>  или  chrome-eval <URL> --same-tab ...');
    console.error('[chrome-browser-start] Профиль автоматизации:', userDataDir);
    process.exit(0);
  }

  // Проверяем, не занят ли порт другим процессом (не проверяем — только пробуем запустить)
  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-blink-features=AutomationControlled',
    '--no-default-browser-check',
  ];
  if (headless) chromeArgs.push('--headless=new');

  console.error(`[chrome-browser-start] Запуск Chrome с портом ${port}...`);
  console.error(`[chrome-browser-start] Путь: ${chromePath}`);
  console.error(`[chrome-browser-start] Профиль автоматизации: ${userDataDir}`);
  console.error(`[chrome-browser-start] Ваш основной браузер не будет затронут`);

  const chrome = spawn(chromePath, chromeArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  chrome.unref();

  // Ждём запуска
  console.error('[chrome-browser-start] Ожидание запуска...');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const running = await checkPort(port);
    if (running) {
      console.error('[chrome-browser-start] Браузер запущен успешно!');
      console.error(`[chrome-browser-start] Порт: ${port}`);
      console.error(`[chrome-browser-start] Профиль: ${userDataDir}`);
      console.error('');
      console.error('[chrome-browser-start] Примеры использования:');
      console.error('  chrome-tab http://localhost:5176');
      console.error('  chrome-eval http://localhost:5176 --same-tab "document.title"');
      console.error('  chrome-text http://localhost:5176 --same-tab "body"');
      console.error('');
      console.error('[chrome-browser-start] Для остановки закройте окно Chrome.');
      process.exit(0);
    }
  }

  // Не удалось запустить
  console.error('[chrome-browser-start] ОШИБКА: Chrome не запустился за отведённое время.');
  console.error('[chrome-browser-start] Попробуйте запустить вручную:');
  console.error(`  "${chromePath}" --remote-debugging-port=${port} --user-data-dir="${userDataDir}" --no-first-run`);
  process.exit(1);
}

main();
