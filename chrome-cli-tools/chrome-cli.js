#!/usr/bin/env node
/**
 * chrome-cli - Единый CLI интерфейс для Chrome CLI Tools.
 *
 * Использование:
 *   chrome <command> <url> [options]
 *
 * Команды:
 *   open <url>              Открыть URL в браузере
 *   click <url> <selector>  Клик по элементу (auto-wait)
 *   fill <url> <sel> <txt>  Ввод текста в поле (auto-wait)
 *   eval <url> "<code>"     Выполнить JavaScript
 *   text <url> [selector]   Получить текст
 *   html <url>              Получить HTML
 *   console <url>           Логи консоли
 *   network <url>           Сетевые запросы
 *   storage <url>           Local/Session storage
 *   cookies <url>           Cookies
 *   shot <url>              Скриншот
 *   nav <url>               Навигация (back/forward/refresh)
 *   wait <url> <selector>   Ожидание элемента
 *   scroll <url>            Прокрутка страницы
 *   locator <url> <sel>     Поиск элементов (Locator API)
 *
 * Примеры:
 *   chrome open https://example.com
 *   chrome text https://example.com h1
 *   chrome click https://example.com ".button" --visible
 *   chrome fill https://example.com "#email" "test@example.com"
 *   chrome eval https://example.com "document.title"
 *   chrome shot https://example.com --output screen.png --full
 *   chrome console https://example.com --error
 *   chrome network https://example.com --api
 *
 * Флаги (для всех команд):
 *   --same-tab    Переиспользовать существующую вкладку (не создавать новую)
 */

const path = require('path');
const {
  connectToBrowser,
  getOrCreateTab,
  clickElement,
  fillInput,
  scrollToElement,
  scrollPage,
  waitForSelector,
  evaluateJs,
  getPageText,
  getPageHtml,
  getConsoleLogs,
  getNetworkRequests,
  getStorage,
  getCookies,
  takeScreenshot,
  navigatePage,
  findLocators,
} = require('./chrome-lib');

// Парсинг аргументов
const args = process.argv.slice(2);
const command = args[0];
const url = args[1];
const selectorOrCode = args[2];
const textValue = args[3];

// Флаги
const sameTab = args.includes('--same-tab');
const flags = {
  sameTab,
  visible: args.includes('--visible'),
  hidden: args.includes('--hidden'),
  error: args.includes('--error'),
  all: args.includes('--all'),
  api: args.includes('--api'),
  images: args.includes('--images'),
  local: args.includes('--local'),
  session: args.includes('--session'),
  clear: args.includes('--clear'),
  full: args.includes('--full'),
  top: args.includes('--top'),
  bottom: args.includes('--bottom'),
  back: args.includes('--back'),
  forward: args.includes('--forward'),
  refresh: args.includes('--refresh'),
  hard: args.includes('--hard'),
};

// Получение значения флага с аргументом
function getFlagValue(flagName) {
  const index = args.indexOf(flagName);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return null;
}

// Вывод справки
function printHelp() {
  console.error(`
Chrome CLI Tools - Единый интерфейс

Использование:
  chrome <command> <url> [options]

Команды:
  open <url>                    Открыть URL в браузере
  click <url> <selector>        Клик по элементу (auto-wait)
  fill <url> <sel> <text>       Ввод текста в поле (auto-wait)
  eval <url> "<js-code>"        Выполнить JavaScript
  text <url> [selector]         Получить текст (по умолчанию body)
  html <url>                    Получить HTML страницы
  console <url>                 Логи консоли
  network <url>                 Сетевые запросы
  storage <url>                 Local/Session storage
  cookies <url>                 Cookies
  shot <url>                    Сделать скриншот
  nav <url>                     Навигация (back/forward/refresh)
  wait <url> <selector>         Ожидание элемента
  scroll <url> [selector]       Прокрутка страницы
  locator <url> <selector>      Поиск элементов с фильтрами

Флаги:
  --same-tab                   Переиспользовать существующую вкладку
  --visible                     Ждать видимости элемента
  --hidden                      Ждать исчезновения элемента
  --error                       Только ошибки
  --all                         Все сообщения
  --api                         Только API запросы
  --images                      Только изображения
  --local                       Только localStorage
  --session                     Только sessionStorage
  --clear                       Очистить (cookies)
  --full                        Полная страница (скриншот)
  --top                         Прокрутка вверх
  --bottom                      Прокрутка вниз
  --back                        Назад в истории
  --forward                     Вперёд в истории
  --refresh                     Обновить страницу
  --output <path>               Путь для скриншота
  --timeout <ms>                Таймаут в миллисекундах
  --name <name>                 Имя cookie
  --port <port>                 Порт отладки (по умолчанию 9222)
  --text <text>                 Фильтр по тексту (locator)
  --attr <name>                 Фильтр по атрибуту (locator)
  --count                       Только количество (locator)

Примеры:
  chrome open https://example.com
  chrome text https://example.com h1
  chrome click https://example.com ".button"
  chrome fill https://example.com "#email" "test@example.com"
  chrome eval https://example.com "document.title"
  chrome shot https://example.com --output screen.png --full
  chrome console https://example.com --error
  chrome network https://example.com --api
  chrome storage https://example.com --local
  chrome cookies https://example.com --name session
  chrome nav https://example.com --refresh
  chrome wait https://example.com ".loader" --timeout 10000
  chrome scroll https://example.com --bottom
  chrome locator https://example.com "a" --text "More" --count
`);
}

// Основная функция
async function main() {
  // Проверка команды
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  // Проверка URL для команд, которые требуют URL
  const commandsRequireUrl = [
    'open', 'click', 'fill', 'eval', 'text', 'html',
    'console', 'network', 'storage', 'cookies', 'shot',
    'nav', 'wait', 'scroll'
  ];

  if (commandsRequireUrl.includes(command) && !url) {
    console.error(`Ошибка: Для команды "${command}" требуется URL`);
    console.error(`Пример: chrome ${command} https://example.com ...`);
    process.exit(1);
  }

  // Получение порта
  const port = parseInt(getFlagValue('--port') || '9222', 10);

  let browser;
  let disconnect;
  let page;

  try {
    // Подключение к браузеру
    const connection = await connectToBrowser({ port });
    browser = connection.browser;
    disconnect = connection.disconnect;

    // Создание/переиспользование страницы
    const { page: currentPage } = await getOrCreateTab(browser, url, { sameTab, timeout: 60000 });
    page = currentPage;

    // Выполнение команды
    switch (command) {
      case 'open': {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.error('[chrome-cli] Страница открыта. Браузер остаётся открытым.');
        console.error('[chrome-cli] Нажмите Ctrl+C для выхода.');
        
        // Оставляем браузер открытым
        process.on('SIGINT', async () => {
          await disconnect();
          process.exit(0);
        });
        return; // Не закрываем
      }

      case 'click': {
        if (!selectorOrCode) {
          console.error('Ошибка: Требуется селектор');
          console.error(`Пример: chrome click ${url} ".button"`);
          process.exit(1);
        }
        const result = await clickElement(page, selectorOrCode, { visible: flags.visible });
        await new Promise(r => setTimeout(r, 1000)); // Ждём перехода
        console.log(page.url());
        break;
      }

      case 'fill': {
        if (!selectorOrCode || textValue === undefined) {
          console.error('Ошибка: Требуется селектор и текст');
          console.error(`Пример: chrome fill ${url} "#email" "test@example.com"`);
          process.exit(1);
        }
        await fillInput(page, selectorOrCode, textValue, { clear: flags.clear });
        console.error('[chrome-cli] Текст введён');
        break;
      }

      case 'eval': {
        // Убираем флаги из JS-кода
        const jsArgs = args.slice(2).filter(a => !a.startsWith('--'));
        const jsCode = jsArgs.join(' ');
        if (!jsCode) {
          console.error('Ошибка: Требуется JavaScript код');
          console.error(`Пример: chrome eval ${url} "document.title"`);
          process.exit(1);
        }
        const result = await evaluateJs(page, jsCode);
        if (typeof result.result === 'object') {
          console.log(JSON.stringify(result.result, null, 2));
        } else {
          console.log(result.result);
        }
        break;
      }

      case 'text': {
        const selector = selectorOrCode || 'body';
        const result = await getPageText(page, selector);
        console.log(result.text);
        break;
      }

      case 'html': {
        const result = await getPageHtml(page);
        console.log(result.html);
        break;
      }

      case 'console': {
        const result = await getConsoleLogs(page, { error: flags.error, all: flags.all });
        console.error('[chrome-cli] Логи консоли:');
        console.log(JSON.stringify(result.messages, null, 2));
        break;
      }

      case 'network': {
        const result = await getNetworkRequests(page, { api: flags.api, images: flags.images });
        console.error('[chrome-cli] Сетевые запросы:');
        console.log(JSON.stringify(result.requests, null, 2));
        break;
      }

      case 'storage': {
        const result = await getStorage(page, { local: flags.local, session: flags.session });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'cookies': {
        const name = getFlagValue('--name');
        const result = await getCookies(page, { name, clear: flags.clear });
        if (result.cleared) {
          console.error('[chrome-cli] Cookies очищены');
          console.log('Cookies cleared');
        } else {
          console.error(`[chrome-cli] Найдено cookies: ${result.cookies.length}`);
          console.log(JSON.stringify(result.cookies, null, 2));
        }
        break;
      }

      case 'shot': {
        const output = getFlagValue('--output') || path.join(process.env.USERPROFILE || '', 'Desktop', `screenshot-${Date.now()}.png`);
        const outputPath = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
        const result = await takeScreenshot(page, { output: outputPath, full: flags.full });
        console.error(`[chrome-cli] Скриншот сохранён: ${result.path}`);
        console.log(result.path);
        break;
      }

      case 'nav': {
        let action = null;
        if (flags.back) action = 'back';
        else if (flags.forward) action = 'forward';
        else if (flags.refresh || flags.hard) action = 'refresh';

        if (!action) {
          console.error('Ошибка: Требуется --back, --forward, --refresh или --hard');
          console.error(`Пример: chrome nav ${url} --refresh`);
          process.exit(1);
        }

        const result = await navigatePage(page, action);
        console.error(`[chrome-cli] Новый URL: ${result.url}`);
        console.log(result.url);
        break;
      }

      case 'wait': {
        if (!selectorOrCode) {
          console.error('Ошибка: Требуется селектор');
          console.error(`Пример: chrome wait ${url} ".loader"`);
          process.exit(1);
        }
        const timeout = parseInt(getFlagValue('--timeout') || '30000', 10);
        const result = await waitForSelector(page, selectorOrCode, {
          visible: flags.visible,
          hidden: flags.hidden,
          timeout,
        });
        console.log(`Element appeared in ${result.waitTime}ms`);
        break;
      }

      case 'scroll': {
        if (flags.top) {
          await scrollPage(page, 'top');
          console.error('[chrome-cli] Прокрутка вверх');
        } else if (flags.bottom) {
          await scrollPage(page, 'bottom');
          console.error('[chrome-cli] Прокрутка вниз');
        } else if (selectorOrCode) {
          await scrollToElement(page, selectorOrCode);
          console.error('[chrome-cli] Прокрутка к элементу');
        } else {
          console.error('Ошибка: Требуется селектор или --top/--bottom');
          console.error(`Пример: chrome scroll ${url} "#section"`);
          process.exit(1);
        }
        const pos = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
        console.log(`Scroll position: x=${pos.x}, y=${pos.y}`);
        break;
      }

      case 'locator': {
        if (!selectorOrCode) {
          console.error('Ошибка: Требуется селектор');
          console.error(`Пример: chrome locator ${url} ".item"`);
          process.exit(1);
        }
        const textFilter = getFlagValue('--text');
        const attrFilter = getFlagValue('--attr');
        const timeout = parseInt(getFlagValue('--timeout') || '30000', 10);
        
        const result = await findLocators(page, selectorOrCode, {
          text: textFilter,
          attr: attrFilter,
          count: flags.count,
          timeout,
        });
        
        if (flags.count) {
          console.log(`Found: ${result.count} element(s)`);
        } else {
          console.error(`[chrome-cli] Найдено элементов: ${result.count}`);
          console.log(JSON.stringify(result.elements, null, 2));
        }
        break;
      }

      default:
        console.error(`Неизвестная команда: ${command}`);
        console.error('Используйте chrome --help для справки');
        process.exit(1);
    }

    // Отключение от браузера
    await disconnect();

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-cli] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-cli] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-cli] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
