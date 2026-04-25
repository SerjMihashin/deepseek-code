#!/usr/bin/env node
/**
 * chrome-data - Извлечь __NEXT_DATA__ со страницы (для Next.js сайтов).
 * 
 * Использование:
 *   chrome-data https://quicktickets.ru/naryan-mar-dk-arktika
 *   chrome-data https://example.com --pretty
 */

const { launchBrowser, getNextData } = require('./chrome-lib');

async function main() {
  const url = process.argv[2];
  const pretty = process.argv.includes('--pretty');
  
  if (!url) {
    console.error('Использование: chrome-data <URL> [--pretty]');
    console.error('Пример: chrome-data https://quicktickets.ru/naryan-mar-dk-arktika');
    process.exit(1);
  }
  
  try {
    console.error(`[chrome-data] Открываю: ${url}`);
    
    const { browser } = await launchBrowser({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    const data = await getNextData(page);
    
    if (!data) {
      console.error('[chrome-data] __NEXT_DATA__ не найден');
      process.exit(1);
    }
    
    if (data.error) {
      console.error('[chrome-data] Ошибка JSON:', data.error);
      process.exit(1);
    }
    
    if (pretty) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(JSON.stringify(data));
    }
    
    await browser.close();
    
  } catch (error) {
    console.error('[chrome-data] Ошибка:', error.message);
    process.exit(1);
  }
}

main();
