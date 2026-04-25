#!/usr/bin/env node
/**
 * chrome-html - Извлечь HTML со страницы.
 *
 * Использование:
 *   chrome-html https://example.com
 *   chrome-html https://example.com --same-tab
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

  if (!url) {
    console.error('Использование: chrome-html <URL> [--same-tab]');
    console.error('Пример: chrome-html https://example.com');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-html] Открываю: ${url}`);
    if (sameTab) console.error('[chrome-html] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });
    const html = await page.content();
    console.log(html);

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-html] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-html] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-html] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
