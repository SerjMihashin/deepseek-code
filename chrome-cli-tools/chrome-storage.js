#!/usr/bin/env node
/**
 * chrome-storage - Получить localStorage/sessionStorage.
 *
 * Использование:
 *   chrome-storage https://example.com
 *   chrome-storage https://example.com --local
 *   chrome-storage https://example.com --session --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 *   --local       Только localStorage
 *   --session     Только sessionStorage
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const local = cleanArgs.includes('--local');
  const session = cleanArgs.includes('--session');

  if (!url) {
    console.error('Использование: chrome-storage <URL> [--same-tab] [--local] [--session]');
    console.error('Пример: chrome-storage https://example.com');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-storage] Открываю: ${url}`);
    if (sameTab) console.error('[chrome-storage] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    const storage = {};

    if (!session) {
      storage.localStorage = await page.evaluate(() => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          data[key] = localStorage.getItem(key);
        }
        return data;
      });
    }

    if (!local) {
      storage.sessionStorage = await page.evaluate(() => {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          data[key] = sessionStorage.getItem(key);
        }
        return data;
      });
    }

    console.log(JSON.stringify(storage, null, 2));

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-storage] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-storage] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-storage] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
