#!/usr/bin/env node
/**
 * chrome-shot - Скриншот страницы.
 *
 * Использование:
 *   chrome-shot https://example.com
 *   chrome-shot https://example.com --output screenshot.png
 *   chrome-shot https://example.com --full --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 *   --output <p>  Путь для сохранения скриншота
 *   --full        Полная страница (full page)
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const outputFlagIdx = cleanArgs.indexOf('--output');
  const output = outputFlagIdx !== -1 ? cleanArgs[outputFlagIdx + 1] : null;
  const full = cleanArgs.includes('--full');

  if (!url) {
    console.error('Использование: chrome-shot <URL> [--same-tab] [--output <path>] [--full]');
    console.error('Пример: chrome-shot https://example.com');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-shot] Открываю: ${url}`);
    if (sameTab) console.error('[chrome-shot] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    await page.setViewport({ width: 1920, height: 1080 });

    const screenshotOptions = {};
    if (output) screenshotOptions.path = output;
    if (full) screenshotOptions.fullPage = true;

    await page.screenshot(screenshotOptions);

    if (output) {
      console.error(`[chrome-shot] Скриншот сохранён: ${output}`);
    }
    console.log(output || 'screenshot taken');

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-shot] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-shot] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-shot] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
