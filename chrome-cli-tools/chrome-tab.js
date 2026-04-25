#!/usr/bin/env node
/**
 * chrome-tab - Открыть URL в новой вкладке существующего Chrome.
 * 
 * Использование:
 *   chrome-tab https://example.com
 *   chrome-tab https://site1.com https://site2.com https://site3.com
 * 
 * Требование: Браузер должен быть запущен через chrome-browser-start
 */

const puppeteer = require('puppeteer-core');

const DEBUG_PORT = 9222;
const DEBUG_URL = `http://localhost:${DEBUG_PORT}`;

async function main() {
  const urls = process.argv.slice(2);
  
  if (!urls.length) {
    console.error('Использование: chrome-tab <URL> [URL2] [URL3] ...');
    console.error('Пример: chrome-tab https://example.com https://google.com');
    process.exit(1);
  }
  
  try {
    console.error(`[chrome-tab] Подключение к Chrome на порту ${DEBUG_PORT}...`);
    
    // Подключаемся к существующему браузеру через DevTools Protocol
    const browser = await puppeteer.connect({
      browserURL: DEBUG_URL,
      defaultViewport: null,
    });
    
    console.error(`[chrome-tab] Подключено. Открыто вкладок: ${urls.length}`);
    
    // Открываем каждую ссылку в новой вкладке
    for (const url of urls) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.error(`[chrome-tab] Открыто: ${url}`);
    }
    
    // Не закрываем браузер, просто отключаемся
    await browser.disconnect();
    
    console.error('[chrome-tab] Готово! Вкладки открыты.');
    
  } catch (error) {
    if (error.message.includes('ECONNREFUSED')) {
      console.error('[chrome-tab] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-tab] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-tab] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
