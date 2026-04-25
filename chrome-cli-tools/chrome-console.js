#!/usr/bin/env node
/**
 * chrome-console - Получить логи консоли браузера.
 *
 * Использование:
 *   chrome-console https://example.com
 *   chrome-console https://example.com --error
 *   chrome-console https://example.com --same-tab --error
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 *   --error       Только ошибки
 *   --all         Все сообщения (включая debug)
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const errorOnly = cleanArgs.includes('--error');
  const all = cleanArgs.includes('--all');

  if (!url) {
    console.error('Использование: chrome-console <URL> [--same-tab] [--error] [--all]');
    console.error('Пример: chrome-console https://example.com --error');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-console] Открываю: ${url}`);
    if (sameTab) console.error('[chrome-console] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    const messages = [];

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (errorOnly && type !== 'error') return;
      if (!all && type === 'debug') return;
      messages.push({ type, text });
    });

    page.on('pageerror', (err) => {
      messages.push({ type: 'pageerror', text: err.message });
    });

    // Ждём сбора сообщений
    await new Promise(r => setTimeout(r, 2000));

    console.log(JSON.stringify(messages, null, 2));

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-console] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-console] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-console] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
