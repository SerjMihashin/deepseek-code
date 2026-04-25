#!/usr/bin/env node
/**
 * chrome-cookies - Получить/очистить cookies.
 *
 * Использование:
 *   chrome-cookies https://example.com
 *   chrome-cookies https://example.com --name "session"
 *   chrome-cookies https://example.com --clear --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 *   --name <n>    Фильтр по имени cookie
 *   --clear       Очистить все cookies
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const nameFlagIdx = cleanArgs.indexOf('--name');
  const name = nameFlagIdx !== -1 ? cleanArgs[nameFlagIdx + 1] : null;
  const clear = cleanArgs.includes('--clear');

  if (!url) {
    console.error('Использование: chrome-cookies <URL> [--same-tab] [--name <n>] [--clear]');
    console.error('Пример: chrome-cookies https://example.com');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-cookies] Открываю: ${url}`);
    if (sameTab) console.error('[chrome-cookies] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    if (clear) {
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      console.log(JSON.stringify({ cleared: true }));
    } else {
      let cookies = await page.cookies();
      if (name) {
        cookies = cookies.filter(c => c.name === name);
      }
      console.log(JSON.stringify(cookies, null, 2));
    }

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-cookies] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-cookies] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-cookies] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
