#!/usr/bin/env node
/**
 * chrome-nav - Навигация (назад/вперёд/обновить).
 *
 * Использование:
 *   chrome-nav https://example.com back
 *   chrome-nav https://example.com forward
 *   chrome-nav https://example.com refresh --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const action = cleanArgs[1];

  if (!url || !action) {
    console.error('Использование: chrome-nav <URL> <back|forward|refresh> [--same-tab]');
    console.error('Пример: chrome-nav https://example.com back');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-nav] Открываю: ${url}`);
    console.error(`[chrome-nav] Действие: ${action}`);
    if (sameTab) console.error('[chrome-nav] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    if (action === 'back') {
      await page.goBack({ waitUntil: 'networkidle2' });
    } else if (action === 'forward') {
      await page.goForward({ waitUntil: 'networkidle2' });
    } else if (action === 'refresh') {
      await page.reload({ waitUntil: 'networkidle2' });
    }

    console.log(page.url());

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-nav] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-nav] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-nav] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
