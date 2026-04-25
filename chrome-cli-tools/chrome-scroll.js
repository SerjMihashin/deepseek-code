#!/usr/bin/env node
/**
 * chrome-scroll - Прокрутка страницы.
 *
 * Использование:
 *   chrome-scroll https://example.com top
 *   chrome-scroll https://example.com bottom
 *   chrome-scroll https://example.com "#section" --same-tab
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
  const target = cleanArgs[1];

  if (!url || !target) {
    console.error('Использование: chrome-scroll <URL> <top|bottom|selector> [--same-tab]');
    console.error('Пример: chrome-scroll https://example.com bottom');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-scroll] Открываю: ${url}`);
    console.error(`[chrome-scroll] Цель: ${target}`);
    if (sameTab) console.error('[chrome-scroll] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    if (target === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (target === 'bottom') {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else {
      await page.waitForSelector(target);
      await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ behavior: 'smooth', block: 'center' }), target);
    }

    console.error('[chrome-scroll] Прокрутка выполнена');

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-scroll] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-scroll] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-scroll] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
