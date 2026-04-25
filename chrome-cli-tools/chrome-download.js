#!/usr/bin/env node
/**
 * chrome-download - Скачать файл со страницы.
 * 
 * Использование:
 *   chrome-download https://example.com/file.pdf
 *   chrome-download https://example.com/file.pdf --to C:\Users\...\Desktop
 *   chrome-download https://example.com --selector a[download]
 */

const { launchBrowser, setupDownload } = require('./chrome-lib');
const path = require('path');
const fs = require('fs');

async function main() {
  const args = process.argv.slice(2);
  const url = args.find(a => !a.startsWith('--'));
  const toFlag = args.indexOf('--to');
  const selectorFlag = args.indexOf('--selector');
  
  if (!url) {
    console.error('Использование: chrome-download <URL> [--to <path>] [--selector <sel>]');
    console.error('Пример: chrome-download https://example.com/file.pdf --to Desktop');
    process.exit(1);
  }
  
  let downloadPath = toFlag !== -1 
    ? args[toFlag + 1] 
    : path.join(process.env.USERPROFILE || '', 'Desktop');
  
  if (!path.isAbsolute(downloadPath)) {
    downloadPath = path.join(process.cwd(), downloadPath);
  }
  
  const clickSelector = selectorFlag !== -1 ? args[selectorFlag + 1] : null;
  
  try {
    console.error(`[chrome-download] Открываю: ${url}`);
    console.error(`[chrome-download] Путь загрузки: ${downloadPath}`);
    
    // Создаём директорию если нет
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }
    
    const { browser } = await launchBrowser({ headless: false });
    const page = await browser.newPage();
    
    // Настройка загрузки
    await setupDownload(page, downloadPath);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Если указан селектор - кликаем
    if (clickSelector) {
      console.error(`[chrome-download] Клик по селектору: ${clickSelector}`);
      await page.click(clickSelector);
    } else {
      // Ищем ссылку на скачивание
      const downloadLink = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href$=".pdf"], a[href$=".zip"], a[href$=".doc"], a[download]');
        return links.length > 0 ? links[0].href : null;
      });
      
      if (downloadLink) {
        console.error(`[chrome-download] Найдена ссылка: ${downloadLink}`);
        await page.click(`a[href="${downloadLink}"]`);
      } else {
        console.error('[chrome-download] Ссылка на скачивание не найдена');
      }
    }
    
    // Ожидание завершения загрузки
    console.error('[chrome-download] Ожидание завершения загрузки (10 сек)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await browser.close();
    
    console.error('[chrome-download] Готово');
    
    // Показываем скачанные файлы
    const files = fs.readdirSync(downloadPath);
    console.error('[chrome-download] Файлы в папке:');
    files.forEach(f => console.error(`  - ${f}`));
    
  } catch (error) {
    console.error('[chrome-download] Ошибка:', error.message);
    process.exit(1);
  }
}

main();
