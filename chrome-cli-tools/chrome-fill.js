#!/usr/bin/env node
/**
 * chrome-fill - Ввод текста в поле формы.
 *
 * Использование:
 *   chrome-fill https://example.com "#username" "myuser"
 *   chrome-fill https://example.com "input[name='email']" "test@example.com" --same-tab
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку
 *   --clear       Очистить поле перед вводом
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const selector = cleanArgs[1];
  const text = cleanArgs[2];
  const clearFlag = cleanArgs.includes('--clear');

  if (!url || !selector || text === undefined) {
    console.error('Использование: chrome-fill <URL> <selector> <text> [--same-tab] [--clear]');
    console.error('Пример: chrome-fill https://example.com "#username" "myuser"');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-fill] Открываю: ${url}`);
    console.error(`[chrome-fill] Селектор: ${selector}`);
    console.error(`[chrome-fill] Текст: "${text}"`);
    if (sameTab) console.error('[chrome-fill] Режим: --same-tab');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    if (clearFlag) {
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
    }

    await page.type(selector, text);

    console.error('[chrome-fill] Текст введён');

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-fill] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-fill] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-fill] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
