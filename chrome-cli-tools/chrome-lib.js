/**
 * Базовая библиотека для работы с Google Chrome через Puppeteer.
 *
 * Использование:
 * const { launchBrowser, connectToBrowser, findChrome } = require('./chrome-lib');
 *
 * Настройка:
 * - Укажите путь к Chrome в chromePath
 * - Или задайте переменную окружения CHROME_PATH
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

/**
 * Пути к Google Chrome (проверяются по порядку).
 */
const CHROME_PATHS = [
  // Путь из переменной окружения
  process.env.CHROME_PATH,

  // Стандартные пути Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',

  // Путь пользователя
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),

  // Другие возможные пути
  'C:\\Users\\Public\\Google\\Chrome\\Application\\chrome.exe',
];

/**
 * Поиск установленного Google Chrome.
 * @returns {string|null} Путь к chrome.exe или null
 */
function findChrome() {
  for (const chromePath of CHROME_PATHS) {
    if (!chromePath) continue;

    try {
      if (fs.existsSync(chromePath)) {
        console.error(`[chrome-lib] Chrome найден: ${chromePath}`);
        return chromePath;
      }
    } catch (e) {
      // Игнорируем ошибки проверки пути
    }
  }

  console.error('[chrome-lib] Chrome не найден в стандартных путях');
  console.error('[chrome-lib] Укажите путь в переменной окружения CHROME_PATH');
  return null;
}

/**
 * Запуск браузера.
 * @param {Object} options - Опции
 * @param {boolean} options.headless - Режим без интерфейса
 * @param {number} options.timeout - Таймаут в мс
 * @returns {Promise<{browser: Object, chromePath: string}>}
 */
async function launchBrowser(options = {}) {
  const {
    headless = false,
    timeout = 30000,
    args = []
  } = options;

  const chromePath = findChrome();

  if (!chromePath) {
    throw new Error(
      'Google Chrome не найден. Укажите путь в переменной окружения CHROME_PATH\n' +
      'Пример: setx CHROME_PATH "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'
    );
  }

  const defaultArgs = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
  ];

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: headless,
    timeout: timeout,
    args: [...defaultArgs, ...args],
  });

  return { browser, chromePath };
}

/**
 * Подключение к существующему браузеру через DevTools Protocol.
 * @param {Object} options - Опции
 * @param {number} options.port - Порт отладки (по умолчанию 9222)
 * @param {number} options.timeout - Таймаут подключения в мс
 * @returns {Promise<{browser: Object, disconnect: Function}>}
 */
async function connectToBrowser(options = {}) {
  const {
    port = 9222,
    timeout = 30000
  } = options;

  const debugUrl = `http://localhost:${port}`;

  console.error(`[chrome-lib] Подключение к Chrome на порту ${port}...`);

  // Проверяем, доступен ли браузер
  try {
    const response = await fetch(`${debugUrl}/json/version`, {
      signal: AbortSignal.timeout(timeout)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const versionInfo = await response.json();
    console.error(`[chrome-lib] Chrome версия: ${versionInfo['Browser'] || 'unknown'}`);
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.name === 'TimeoutError' || error.message.includes('fetch failed')) {
      throw new Error(
        `Не удалось подключиться к Chrome на порту ${port}.\n` +
        `Убедитесь, что браузер запущен через: chrome-browser-start`
      );
    }
    throw error;
  }

  // Подключаемся через Puppeteer
  const browser = await puppeteer.connect({
    browserURL: debugUrl,
    defaultViewport: null,
  });

  console.error(`[chrome-lib] Подключено успешно`);

  // Функция отключения (не закрывает браузер)
  const disconnect = async () => {
    await browser.disconnect();
    console.error('[chrome-lib] Отключено от браузера');
  };

  return { browser, disconnect };
}

/**
 * Получение данных страницы.
 * @param {Object} page - Puppeteer page
 * @param {string} selector - CSS селектор
 * @returns {Promise<{text: string, html: string, attributes: Object}>}
 */
async function getPageData(page, selector = 'body') {
  const data = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) {
      return { error: `Element not found: ${sel}` };
    }
    
    return {
      text: element.textContent,
      html: element.outerHTML,
      innerHTML: element.innerHTML,
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
    };
  }, selector);
  
  return data;
}

/**
 * Извлечение __NEXT_DATA__ со страницы.
 * @param {Object} page - Puppeteer page
 * @returns {Promise<Object|null>}
 */
async function getNextData(page) {
  const data = await page.evaluate(() => {
    const script = document.querySelector('script#__NEXT_DATA__');
    if (!script) {
      return null;
    }
    
    try {
      return JSON.parse(script.textContent);
    } catch (e) {
      return { error: e.message };
    }
  });
  
  return data;
}

/**
 * Скачивание файлов.
 * @param {Object} page - Puppeteer page
 * @param {string} downloadPath - Путь для сохранения
 */
async function setupDownload(page, downloadPath) {
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });
}

// ============================================================
// Функции для единого CLI (chrome-cli.js)
// ============================================================

/**
 * Клик по элементу (с auto-wait).
 * @param {Object} page - Puppeteer page
 * @param {string} selector - CSS селектор
 * @param {Object} options - Опции { visible: boolean, timeout: number }
 */
async function clickElement(page, selector, options = {}) {
  const { visible = true, timeout = 30000 } = options; // visible по умолчанию true (Auto-wait)

  // Auto-wait: ждём видимости и стабильности
  await page.waitForSelector(selector, { visible: true, timeout });
  
  // Дополнительная проверка стабильности (как в Playwright)
  await page.evaluate((sel) => {
    return new Promise((resolve) => {
      const el = document.querySelector(sel);
      if (!el) return resolve();
      
      // Ждём, пока элемент не станет стабильным (не анимируется)
      let lastRect = el.getBoundingClientRect();
      let stableCount = 0;
      
      const check = () => {
        const rect = el.getBoundingClientRect();
        if (rect.x === lastRect.x && rect.y === lastRect.y && rect.width === lastRect.width && rect.height === lastRect.height) {
          stableCount++;
          if (stableCount >= 2) return resolve();
        } else {
          stableCount = 0;
          lastRect = rect;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }, selector);

  await page.click(selector);
  return { success: true, selector };
}

/**
 * Ввод текста в поле (с auto-wait).
 * @param {Object} page - Puppeteer page
 * @param {string} selector - CSS селектор
 * @param {string} text - Текст для ввода
 * @param {Object} options - Опции { clear: boolean, timeout: number }
 */
async function fillInput(page, selector, text, options = {}) {
  const { clear = false, timeout = 30000 } = options;

  // Auto-wait: ждём видимости и возможности ввода
  await page.waitForSelector(selector, { visible: true, timeout });
  
  // Проверяем, что элемент доступен для ввода
  await page.evaluate((sel) => {
    return new Promise((resolve) => {
      const el = document.querySelector(sel);
      if (!el) return resolve();
      
      // Ждём, пока элемент не станет интерактивным
      const check = () => {
        const style = window.getComputedStyle(el);
        const isDisabled = el.disabled || el.readOnly;
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        
        if (!isDisabled && isVisible) return resolve();
        setTimeout(check, 100);
      };
      check();
    });
  }, selector);

  if (clear) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
  }

  await page.type(selector, text);
  return { success: true, selector, text };
}

/**
 * Прокрутка к элементу (с auto-wait).
 * @param {Object} page - Puppeteer page
 * @param {string} selector - CSS селектор
 * @param {Object} options - Опции { timeout: number }
 */
async function scrollToElement(page, selector, options = {}) {
  const { timeout = 30000 } = options;
  
  // Auto-wait: ждём появления
  await page.waitForSelector(selector, { timeout });
  
  await page.evaluate((sel) => {
    document.querySelector(sel).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, selector);
  return { success: true, selector };
}

/**
 * Прокрутка вверх/вниз.
 * @param {Object} page - Puppeteer page
 * @param {string} direction - 'top' | 'bottom'
 */
async function scrollPage(page, direction) {
  if (direction === 'top') {
    await page.evaluate(() => window.scrollTo(0, 0));
  } else if (direction === 'bottom') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
  return { success: true, direction };
}

/**
 * Ожидание элемента.
 * @param {Object} page - Puppeteer page
 * @param {string} selector - CSS селектор
 * @param {Object} options - Опции { visible: boolean, hidden: boolean, timeout: number }
 */
async function waitForSelector(page, selector, options = {}) {
  const { visible = false, hidden = false, timeout = 30000 } = options;
  
  const startTime = Date.now();
  
  if (hidden) {
    await page.waitForSelector(selector, { state: 'hidden', timeout });
  } else if (visible) {
    await page.waitForSelector(selector, { visible: true, timeout });
  } else {
    await page.waitForSelector(selector, { timeout });
  }
  
  const waitTime = Date.now() - startTime;
  return { success: true, selector, waitTime };
}

/**
 * Выполнение JavaScript.
 * @param {Object} page - Puppeteer page
 * @param {string} jsCode - JS код для выполнения
 */
async function evaluateJs(page, jsCode) {
  const result = await page.evaluate(jsCode);
  return { result };
}

/**
 * Получение текста страницы.
 * @param {Object} page - Puppeteer page
 * @param {string} selector - CSS селектор (по умолчанию 'body')
 */
async function getPageText(page, selector = 'body') {
  const data = await getPageData(page, selector);
  if (data.error) {
    throw new Error(data.error);
  }
  return { text: data.text, selector };
}

/**
 * Получение HTML страницы.
 * @param {Object} page - Puppeteer page
 */
async function getPageHtml(page) {
  const html = await page.content();
  return { html };
}

/**
 * Получение логов консоли.
 * @param {Object} page - Puppeteer page
 * @param {Object} options - Опции { error: boolean, all: boolean }
 */
async function getConsoleLogs(page, options = {}) {
  const { error = false, all = false } = options;
  const messages = [];
  
  return new Promise((resolve) => {
    const handleMessage = (msg) => {
      const type = msg.type();
      const text = msg.text();
      
      if (error && type !== 'error') return;
      if (!all && type === 'debug') return;
      
      messages.push({ type, text });
    };
    
    page.on('console', handleMessage);
    page.on('pageerror', (err) => {
      messages.push({ type: 'pageerror', text: err.message });
    });
    
    // Ждём сбора сообщений
    setTimeout(() => {
      resolve({ messages });
    }, 2000);
  });
}

/**
 * Получение сетевых запросов.
 * @param {Object} page - Puppeteer page
 * @param {Object} options - Опции { api: boolean, images: boolean }
 */
async function getNetworkRequests(page, options = {}) {
  const { api = false, images = false } = options;
  const requests = [];
  
  return new Promise((resolve) => {
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      
      if (api && resourceType !== 'xhr' && resourceType !== 'fetch') return;
      if (images && resourceType !== 'image') return;
      
      requests.push({
        direction: 'request',
        method: request.method(),
        url,
        type: resourceType,
      });
    });
    
    page.on('response', (response) => {
      const request = response.request();
      const resourceType = request.resourceType();
      const url = request.url();
      
      if (api && resourceType !== 'xhr' && resourceType !== 'fetch') return;
      if (images && resourceType !== 'image') return;
      
      requests.push({
        direction: 'response',
        status: response.status(),
        url,
        type: resourceType,
      });
    });
    
    page.on('requestfailed', (request) => {
      requests.push({
        direction: 'failed',
        url: request.url(),
        type: request.resourceType(),
        error: request.failure()?.errorText,
      });
    });
    
    // Ждём сбора запросов
    setTimeout(() => {
      resolve({ requests });
    }, 2000);
  });
}

/**
 * Получение storage (localStorage/sessionStorage).
 * @param {Object} page - Puppeteer page
 * @param {Object} options - Опции { local: boolean, session: boolean }
 */
async function getStorage(page, options = {}) {
  const { local = false, session = false } = options;
  const storage = {};
  
  if (!session) {
    storage.localStorage = await page.evaluate(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      return data;
    });
  }
  
  if (!local) {
    storage.sessionStorage = await page.evaluate(() => {
      const data = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        data[key] = sessionStorage.getItem(key);
      }
      return data;
    });
  }
  
  return storage;
}

/**
 * Получение cookies.
 * @param {Object} page - Puppeteer page
 * @param {Object} options - Опции { name: string, clear: boolean }
 */
async function getCookies(page, options = {}) {
  const { name = null, clear = false } = options;
  
  if (clear) {
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    return { cleared: true };
  }
  
  let cookies = await page.cookies();
  
  if (name) {
    cookies = cookies.filter(c => c.name === name);
  }
  
  return { cookies };
}

/**
 * Скриншот страницы.
 * @param {Object} page - Puppeteer page
 * @param {Object} options - Опции { output: string, full: boolean }
 */
async function takeScreenshot(page, options = {}) {
  const { output = null, full = false } = options;
  
  await page.setViewport({ width: 1920, height: 1080 });
  
  const screenshotOptions = {
    path: output,
    fullPage: full,
  };
  
  await page.screenshot(screenshotOptions);
  
  return { path: output };
}

/**
 * Навигация (back/forward/refresh).
 * @param {Object} page - Puppeteer page
 * @param {string} action - 'back' | 'forward' | 'refresh'
 */
async function navigatePage(page, action) {
  if (action === 'back') {
    await page.goBack({ waitUntil: 'networkidle2' });
  } else if (action === 'forward') {
    await page.goForward({ waitUntil: 'networkidle2' });
  } else if (action === 'refresh') {
    await page.reload({ waitUntil: 'networkidle2' });
  }

  return { success: true, action, url: page.url() };
}

/**
 * Locator API - поиск элементов с фильтрами (как в Playwright).
 * @param {Object} page - Puppeteer page
 * @param {string} selector - CSS селектор
 * @param {Object} options - Опции { text: string, attr: string, count: boolean, timeout: number }
 */
async function findLocators(page, selector, options = {}) {
  const { text = null, attr = null, count = false, timeout = 30000 } = options;

  // Ждём появления элементов
  await page.waitForSelector(selector, { timeout });

  const result = await page.evaluate((sel, filterText, filterAttr) => {
    const elements = Array.from(document.querySelectorAll(sel));
    
    // Фильтр по тексту
    let filtered = elements;
    if (filterText) {
      filtered = elements.filter(el => 
        el.textContent.toLowerCase().includes(filterText.toLowerCase())
      );
    }
    
    // Фильтр по атрибуту
    if (filterAttr) {
      filtered = filtered.filter(el => el.hasAttribute(filterAttr));
    }

    // Возвращаем информацию об элементах
    return filtered.map((el, i) => ({
      index: i,
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().slice(0, 100) || '',
      attributes: Array.from(el.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
    }));
  }, selector, text, attr);

  if (count) {
    return { count: result.length, elements: result };
  }

  return { elements: result, count: result.length };
}

/**
 * Поиск существующей вкладки по URL или создание новой.
 * Позволяет переиспользовать одну вкладку между вызовами скриптов (--same-tab).
 *
 * @param {Object} browser - Puppeteer Browser
 * @param {string} url - URL для поиска/открытия
 * @param {Object} options - Опции
 * @param {boolean} options.sameTab - Использовать существующую вкладку (true) или создавать новую (false)
 * @param {number} options.timeout - Таймаут загрузки страницы в мс
 * @returns {Promise<{page: Object, reused: boolean}>}
 */
async function getOrCreateTab(browser, url, options = {}) {
  const { sameTab = false, timeout = 30000 } = options;

  if (!sameTab) {
    // Старое поведение — всегда новая вкладка
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    return { page, reused: false };
  }

  // Режим переиспользования — ищем вкладку с таким URL
  const pages = await browser.pages();

  // Ищем среди всех вкладок ту, чей URL совпадает (или является предком)
  for (const p of pages) {
    const pageUrl = p.url();
    if (pageUrl && url.startsWith(pageUrl.replace(/\/$/, ''))) {
      // Уже открыта — просто переключаемся
      await p.bringToFront();
      // Если страница уже загружена, не ждём networkidle2
      return { page: p, reused: true };
    }
  }

  // Не нашли — создаём новую
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout });
  return { page, reused: false };
}

/**
 * Извлечение флага --same-tab из аргументов командной строки.
 * @param {string[]} args - process.argv.slice(2)
 * @returns {{ args: string[], sameTab: boolean }}
 */
function parseSameTabFlag(args) {
  const idx = args.indexOf('--same-tab');
  if (idx !== -1) {
    args.splice(idx, 1);
    return { args, sameTab: true };
  }
  return { args, sameTab: false };
}

module.exports = {
  launchBrowser,
  connectToBrowser,
  findChrome,
  getPageData,
  getNextData,
  setupDownload,
  getOrCreateTab,
  parseSameTabFlag,
  CHROME_PATHS,
  // Функции для CLI
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
};
