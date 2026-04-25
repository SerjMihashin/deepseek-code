#!/usr/bin/env node
/**
 * chrome-open - Открыть сайт в Google Chrome.
 * 
 * Использование:
 *   chrome-open https://example.com
 *   chrome-open https://quicktickets.ru/naryan-mar-dk-arktika
 */

const { launchBrowser } = require('./chrome-lib');

async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('Использование: chrome-open <URL>');
    console.error('Пример: chrome-open https://example.com');
    process.exit(1);
  }
  
  try {
    console.error(`[chrome-open] Открываю: ${url}`);
    
    const { browser } = await launchBrowser({ headless: false });
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.error('[chrome-open] Страница загружена. Браузер открыт.');
    console.error('[chrome-open] Нажмите Ctrl+C для закрытия');
    
    // Оставляем браузер открытым
    process.on('SIGINT', async () => {
      await browser.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('[chrome-open] Ошибка:', error.message);
    process.exit(1);
  }
}

main();
