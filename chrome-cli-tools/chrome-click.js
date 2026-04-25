#!/usr/bin/env node
/**
 * chrome-click - Клик по элементу на странице.
 *
 * Использование:
 *   chrome-click https://example.com "button.submit"
 *   chrome-click https://example.com "#myButton" --same-tab
 *   chrome-click https://example.com ".nav > li:first-child" --visible
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 *
 * Флаги:
 *   --same-tab    Переиспользовать существующую вкладку (не создавать новую)
 *   --visible     Ждать видимости элемента перед кликом
 *   --text <txt>  Найти кнопку по тексту (альтернатива селектору)
 */

const { connectToBrowser, getOrCreateTab, parseSameTabFlag } = require('./chrome-lib');

async function main() {
  let args = process.argv.slice(2);
  const { args: cleanArgs, sameTab } = parseSameTabFlag(args);
  const url = cleanArgs[0];
  const selector = cleanArgs[1];
  const visibleFlag = cleanArgs.includes('--visible');
  const textFlagIdx = cleanArgs.indexOf('--text');
  const textFilter = textFlagIdx !== -1 ? cleanArgs[textFlagIdx + 1] : null;

  if (!url || !selector) {
    console.error('Использование: chrome-click <URL> <selector> [--same-tab] [--visible] [--text "text"]');
    console.error('Пример: chrome-click https://example.com "button.submit"');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-click] Открываю: ${url}`);
    console.error(`[chrome-click] Селектор: ${selector}`);
    if (sameTab) console.error('[chrome-click] Режим: --same-tab (переиспользование вкладки)');

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const { page } = await getOrCreateTab(browser, url, { sameTab });

    if (visibleFlag) {
      await page.waitForSelector(selector, { visible: true });
    }

    // Если указан --text, ищем кнопку по тексту внутри селектора
    if (textFilter) {
      const clicked = await page.evaluate((sel, text) => {
        const btns = Array.from(document.querySelectorAll(sel));
        const btn = btns.find(b => b.innerText.includes(text));
        if (btn) { btn.click(); return true; }
        return false;
      }, selector, textFilter);
      if (!clicked) {
        console.error(`[chrome-click] Элемент с текстом "${textFilter}" не найден`);
        process.exit(1);
      }
    } else {
      await page.click(selector);
    }

    console.error('[chrome-click] Клик выполнен');

    // Ждём немного для возможных переходов
    await new Promise(r => setTimeout(r, 1000));

    const currentUrl = page.url();
    console.log(currentUrl);

    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-click] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-click] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-click] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
