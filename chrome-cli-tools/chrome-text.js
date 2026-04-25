#!/usr/bin/env node
/**
 * chrome-text - Извлечь текст со страницы по селектору.
 *
 * Использование:
 *   chrome-text https://example.com
 *   chrome-text https://example.com h1
 *   chrome-text https://example.com .content --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку (не создавать новую)
 */

const { connectToBrowser, getPageData, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const selector = cleanArgs[1] || 'body';

  if (!url) {
    console.error('Использование: chrome-text <URL> [selector] [--same-tab]');
    console.error('Пример: chrome-text https://example.com .content');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-text] Открываю: ${url}`);
    console.error(`[chrome-text] Селектор: ${selector}`);
    if (sameTab) console.error('[chrome-text] Режим: --same-tab (переиспользование вкладки)');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    const data = await getPageData(page, selector);

    if (data.error) {
      console.error('[chrome-text] Ошибка:', data.error);
      process.exit(1);
    }

    console.log(data.text);

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-text] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-text] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-text] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
