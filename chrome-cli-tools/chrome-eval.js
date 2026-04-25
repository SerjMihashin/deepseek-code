#!/usr/bin/env node
/**
 * chrome-eval - Выполнить JavaScript код на странице.
 *
 * Использование:
 *   chrome-eval https://example.com "document.title"
 *   chrome-eval https://example.com "document.querySelector('h1').innerText"
 *   chrome-eval https://example.com --same-tab "document.title"
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку (не создавать новую)
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const jsCode = cleanArgs.slice(1).join(' ');

  if (!url || !jsCode) {
    console.error('Использование: chrome-eval <URL> "<js-code>" [--same-tab]');
    console.error('Пример: chrome-eval https://example.com "document.title"');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-eval] Открываю: ${url}`);
    console.error(`[chrome-eval] Код: ${jsCode}`);
    if (sameTab) console.error('[chrome-eval] Режим: --same-tab (переиспользование вкладки)');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    // Выполняем JS код на странице
    const result = await page.evaluate(jsCode);

    console.error('[chrome-eval] Результат:');

    // Вывод результата
    if (typeof result === 'object') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result);
    }

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-eval] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-eval] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-eval] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
