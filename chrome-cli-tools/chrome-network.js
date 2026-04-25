#!/usr/bin/env node
/**
 * chrome-network - Получить сетевые запросы.
 *
 * Использование:
 *   chrome-network https://example.com
 *   chrome-network https://example.com --api
 *   chrome-network https://example.com --images --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 *   --api         Только XHR/Fetch запросы
 *   --images      Только изображения
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const api = cleanArgs.includes('--api');
  const images = cleanArgs.includes('--images');

  if (!url) {
    console.error('Использование: chrome-network <URL> [--same-tab] [--api] [--images]');
    console.error('Пример: chrome-network https://example.com --api');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-network] Открываю: ${url}`);
    if (sameTab) console.error('[chrome-network] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    const requests = [];

    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const reqUrl = request.url();

      if (api && resourceType !== 'xhr' && resourceType !== 'fetch') return;
      if (images && resourceType !== 'image') return;

      requests.push({
        direction: 'request',
        method: request.method(),
        url: reqUrl,
        type: resourceType,
      });
    });

    page.on('response', (response) => {
      const req = response.request();
      const resourceType = req.resourceType();
      const reqUrl = req.url();

      if (api && resourceType !== 'xhr' && resourceType !== 'fetch') return;
      if (images && resourceType !== 'image') return;

      requests.push({
        direction: 'response',
        status: response.status(),
        url: reqUrl,
        type: resourceType,
      });
    });

    page.on('requestfailed', (request) => {
      requests.push({
        direction: 'failed',
        url: request.url(),
        type: request.resourceType(),
        error: request.failure()?.errorText,
      });
    });

    await new Promise(r => setTimeout(r, 2000));

    console.log(JSON.stringify(requests, null, 2));

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-network] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-network] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-network] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
