#!/usr/bin/env node
/**
 * chrome-wait - Ожидание элемента на странице.
 *
 * Использование:
 *   chrome-wait https://example.com ".loaded"
 *   chrome-wait https://example.com "#content" --visible
 *   chrome-wait https://example.com ".spinner" --hidden --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 *   --visible     Ждать видимости элемента
 *   --hidden      Ждать скрытия элемента
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const selector = cleanArgs[1];
  const visible = cleanArgs.includes('--visible');
  const hidden = cleanArgs.includes('--hidden');

  if (!url || !selector) {
    console.error('Использование: chrome-wait <URL> <selector> [--same-tab] [--visible] [--hidden]');
    console.error('Пример: chrome-wait https://example.com ".loaded" --visible');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-wait] Открываю: ${url}`);
    console.error(`[chrome-wait] Селектор: ${selector}`);
    if (sameTab) console.error('[chrome-wait] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    if (hidden) {
      await page.waitForSelector(selector, { state: 'hidden', timeout: 30000 });
    } else if (visible) {
      await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    } else {
      await page.waitForSelector(selector, { timeout: 30000 });
    }

    console.error('[chrome-wait] Элемент найден');

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-wait] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-wait] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-wait] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
