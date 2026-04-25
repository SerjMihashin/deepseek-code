import type { Tool, ToolParameter, ToolResult } from './types.js'
import { chromeManager } from './chrome-manager.js'

/**
 * Допустимые действия Chrome Tool.
 */
export type ChromeAction =
  | 'open'
  | 'click'
  | 'fill'
  | 'eval'
  | 'text'
  | 'html'
  | 'console'
  | 'network'
  | 'shot'
  | 'nav'
  | 'wait'
  | 'scroll'
  | 'locator'
  | 'cookies'
  | 'storage'
  | 'quiz'

/**
 * Параметры для Chrome Tool.
 */
export interface ChromeToolArgs {
  /** Действие */
  action: ChromeAction;
  /** URL страницы (обязателен для большинства действий) */
  url?: string;
  /** CSS-селектор (click, fill, text, wait, scroll, locator) */
  selector?: string;
  /** Текст для ввода (fill) или фильтр (locator --text) */
  text?: string;
  /** JavaScript-код для выполнения (eval) */
  code?: string;
  /** Путь для сохранения скриншота (shot) */
  output?: string;
  /** Таймаут в мс (wait, locator) */
  timeout?: number;
  /** Флаг: переиспользовать текущую вкладку */
  sameTab?: boolean;
  /** Фильтр: только ошибки (console) */
  error?: boolean;
  /** Фильтр: все сообщения (console) */
  all?: boolean;
  /** Фильтр: только API запросы (network) */
  api?: boolean;
  /** Фильтр: localStorage (storage) */
  local?: boolean;
  /** Фильтр: sessionStorage (storage) */
  session?: boolean;
  /** Фильтр: очистить cookies */
  clear?: boolean;
  /** Скриншот всей страницы (shot) */
  full?: boolean;
  /** Навигация: назад (nav) */
  back?: boolean;
  /** Навигация: вперёд (nav) */
  forward?: boolean;
  /** Навигация: обновить (nav) */
  refresh?: boolean;
  /** Прокрутка: вверх (scroll) */
  top?: boolean;
  /** Прокрутка: вниз (scroll) */
  bottom?: boolean;
  /** Имя cookie (cookies) */
  name?: string;
  /** Фильтр по атрибуту (locator) */
  attr?: string;
  /** Только количество (locator) */
  count?: boolean;
  /** Порт отладки */
  port?: number;
  /** Стратегия для quiz */
  quizStrategy?: 'first' | 'random';
}

// ---- Вспомогательные функции ----

/**
 * Ожидание элемента с auto-wait.
 */
async function waitForElement (
  page: import('puppeteer').Page,
  selector: string,
  timeout = 10000
): Promise<void> {
  await page.waitForSelector(selector, {
    visible: true,
    timeout,
  })
}

/**
 * Форматирует результат выполнения JS для вывода.
 */
function formatEvalResult (result: unknown): string {
  if (result === null || result === undefined) return 'undefined'
  if (typeof result === 'string') return result
  if (typeof result === 'object') {
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }
  return String(result)
}

// ---- Реализация действий ----

async function executeAction (
  args: ChromeToolArgs
): Promise<ToolResult> {
  const { action, url, selector, text, code, output, timeout = 10000, sameTab = false } = args
  const page = await chromeManager.getPage(sameTab)

  try {
    switch (action) {
      // ---- open ----
      case 'open': {
        if (!url) return { success: false, output: '', error: 'URL is required for open action' }
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
        return { success: true, output: `Opened: ${page.url()}` }
      }

      // ---- click ----
      case 'click': {
        if (!selector) return { success: false, output: '', error: 'Selector is required for click action' }
        if (url) await chromeManager.navigate(url, sameTab)
        await waitForElement(page, selector, timeout)
        await page.click(selector)
        await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => {})
        return { success: true, output: `Clicked: ${selector}` }
      }

      // ---- fill ----
      case 'fill': {
        if (!selector || !text) { return { success: false, output: '', error: 'Selector and text are required for fill action' } }
        if (url) await chromeManager.navigate(url, sameTab)
        await waitForElement(page, selector, timeout)
        await page.click(selector)
        await page.keyboard.down('Control')
        await page.keyboard.press('a')
        await page.keyboard.up('Control')
        await page.keyboard.press('Backspace')
        await page.type(selector, text, { delay: 10 })
        return { success: true, output: `Filled "${text}" into: ${selector}` }
      }

      // ---- eval ----
      case 'eval': {
        if (!code) return { success: false, output: '', error: 'Code is required for eval action' }
        if (url) await chromeManager.navigate(url, sameTab)
        const result = await page.evaluate(code)
        return { success: true, output: formatEvalResult(result) }
      }

      // ---- text ----
      case 'text': {
        if (url) await chromeManager.navigate(url, sameTab)
        let textContent: string
        if (selector) {
          const el = await page.$(selector)
          if (!el) return { success: false, output: '', error: `Element not found: ${selector}` }
          textContent = await page.evaluate(el => el.textContent ?? '', el)
        } else {
          textContent = await page.evaluate(() => document.body?.innerText ?? '')
        }
        return { success: true, output: textContent.trim() }
      }

      // ---- html ----
      case 'html': {
        if (url) await chromeManager.navigate(url, sameTab)
        const html = await page.content()
        return { success: true, output: html }
      }

      // ---- console ----
      case 'console': {
        if (url) await chromeManager.navigate(url, sameTab)
        const logs: string[] = []
        const errors: string[] = []

        page.on('console', msg => {
          const text = msg.text()
          if (msg.type() === 'error') {
            errors.push(text)
          } else {
            logs.push(text)
          }
        })

        // Даём время на сбор консольных сообщений
        await new Promise(resolve => setTimeout(resolve, 2000))

        const isErrorOnly = args.error ?? false
        const showAll = args.all ?? false

        if (isErrorOnly) {
          return {
            success: true,
            output: errors.length > 0
              ? `Console errors:\n${errors.join('\n')}`
              : 'No console errors found',
          }
        }

        const parts: string[] = []
        if (showAll || logs.length > 0) {
          parts.push(`Console logs (${logs.length}):\n${logs.join('\n')}`)
        }
        if (errors.length > 0) {
          parts.push(`Console errors (${errors.length}):\n${errors.join('\n')}`)
        }

        return {
          success: true,
          output: parts.length > 0 ? parts.join('\n\n') : 'No console messages',
        }
      }

      // ---- network ----
      case 'network': {
        if (url) await chromeManager.navigate(url, sameTab)
        const requests: Array<{ url: string; method: string; type: string }> = []

        page.on('request', req => {
          requests.push({
            url: req.url(),
            method: req.method(),
            type: req.resourceType(),
          })
        })

        // Даём время на сбор запросов
        await new Promise(resolve => setTimeout(resolve, 3000))

        const isApiOnly = args.api ?? false
        const filtered = isApiOnly
          ? requests.filter(r => r.type === 'xhr' || r.type === 'fetch')
          : requests

        if (filtered.length === 0) {
          return { success: true, output: 'No network requests captured' }
        }

        const lines = filtered.map(
          (r, i) => `${i + 1}. [${r.method}] ${r.type}: ${r.url}`
        )
        return {
          success: true,
          output: `Network requests (${filtered.length}):\n${lines.join('\n')}`,
        }
      }

      // ---- shot ----
      case 'shot': {
        if (url) await chromeManager.navigate(url, sameTab)
        const shotPath = output ?? `chrome-shot-${Date.now()}.png`
        const isFull = args.full ?? false

        if (isFull) {
          await page.screenshot({ path: shotPath, fullPage: true })
        } else {
          await page.screenshot({ path: shotPath })
        }

        return { success: true, output: `Screenshot saved: ${shotPath}` }
      }

      // ---- nav ----
      case 'nav': {
        if (args.back) {
          await page.goBack({ waitUntil: 'networkidle2' })
          return { success: true, output: `Navigated back to: ${page.url()}` }
        }
        if (args.forward) {
          await page.goForward({ waitUntil: 'networkidle2' })
          return { success: true, output: `Navigated forward to: ${page.url()}` }
        }
        if (args.refresh ?? true) {
          await page.reload({ waitUntil: 'networkidle2' })
          return { success: true, output: `Page refreshed: ${page.url()}` }
        }
        return { success: true, output: `Current URL: ${page.url()}` }
      }

      // ---- wait ----
      case 'wait': {
        if (!selector) return { success: false, output: '', error: 'Selector is required for wait action' }
        if (url) await chromeManager.navigate(url, sameTab)

        const isVisible = !(args as unknown as Record<string, unknown>).hidden // по умолчанию ждём видимости
        if (isVisible) {
          await page.waitForSelector(selector, { visible: true, timeout })
          return { success: true, output: `Element visible: ${selector}` }
        } else {
          await page.waitForSelector(selector, { hidden: true, timeout })
          return { success: true, output: `Element hidden: ${selector}` }
        }
      }

      // ---- scroll ----
      case 'scroll': {
        if (url) await chromeManager.navigate(url, sameTab)

        if (args.bottom ?? true) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await new Promise(resolve => setTimeout(resolve, 500))
          return { success: true, output: 'Scrolled to bottom' }
        }
        if (args.top) {
          await page.evaluate(() => window.scrollTo(0, 0))
          return { success: true, output: 'Scrolled to top' }
        }
        if (selector) {
          await page.evaluate((sel: string) => {
            const el = document.querySelector(sel)
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, selector)
          return { success: true, output: `Scrolled to element: ${selector}` }
        }
        return { success: true, output: 'No scroll target specified' }
      }

      // ---- locator ----
      case 'locator': {
        if (!selector) return { success: false, output: '', error: 'Selector is required for locator action' }
        if (url) await chromeManager.navigate(url, sameTab)

        const elements = await page.$$(selector)

        if (args.count ?? false) {
          return { success: true, output: `Found ${elements.length} elements matching: ${selector}` }
        }

        const results: string[] = []
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i]
          const tagName = await page.evaluate(e => e.tagName.toLowerCase(), el)
          const elText = await page.evaluate(e => (e as HTMLElement).innerText?.slice(0, 100) ?? '', el)
          const elAttrs = await page.evaluate(e => {
            const attrs: Record<string, string> = {}
            for (const attr of e.attributes) {
              attrs[attr.name] = attr.value
            }
            return attrs
          }, el)

          // Фильтр по тексту
          if (args.text && !elText.toLowerCase().includes(args.text.toLowerCase())) continue
          // Фильтр по атрибуту
          if (args.attr && elAttrs[args.attr] === undefined) continue

          const attrStr = Object.entries(elAttrs)
            .map(([k, v]) => `${k}="${v}"`)
            .join(' ')

          results.push(
            `[${i}] <${tagName}${attrStr ? ' ' + attrStr : ''}>${elText ? '\n    Text: ' + elText.trim().slice(0, 200) : ''}`
          )
        }

        if (results.length === 0) {
          return { success: true, output: `No elements found matching: ${selector}` }
        }

        return {
          success: true,
          output: `Elements (${results.length}):\n${results.join('\n')}`,
        }
      }

      // ---- cookies ----
      case 'cookies': {
        if (url) await chromeManager.navigate(url, sameTab)

        if (args.clear ?? false) {
          const client = await page.target().createCDPSession()
          await client.send('Network.clearBrowserCookies')
          return { success: true, output: 'Cookies cleared' }
        }

        const cookies = await page.cookies()

        if (args.name) {
          const cookie = cookies.find(c => c.name === args.name)
          if (!cookie) return { success: false, output: '', error: `Cookie not found: ${args.name}` }
          return { success: true, output: JSON.stringify(cookie, null, 2) }
        }

        if (cookies.length === 0) {
          return { success: true, output: 'No cookies found' }
        }

        const lines = cookies.map(
          c => `${c.name}=${c.value} (domain: ${c.domain}, path: ${c.path})`
        )
        return {
          success: true,
          output: `Cookies (${cookies.length}):\n${lines.join('\n')}`,
        }
      }

      // ---- storage ----
      case 'storage': {
        if (url) await chromeManager.navigate(url, sameTab)

        const result: Record<string, string> = {}

        if (args.local ?? true) {
          const localData = await page.evaluate(() => {
            const data: Record<string, string> = {}
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key) data[key] = localStorage.getItem(key) ?? ''
            }
            return data
          })
          result.localStorage = JSON.stringify(localData, null, 2)
        }

        if (args.session) {
          const sessionData = await page.evaluate(() => {
            const data: Record<string, string> = {}
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i)
              if (key) data[key] = sessionStorage.getItem(key) ?? ''
            }
            return data
          })
          result.sessionStorage = JSON.stringify(sessionData, null, 2)
        }

        return {
          success: true,
          output: Object.entries(result)
            .map(([key, val]) => `${key}:\n${val}`)
            .join('\n\n'),
        }
      }

      // ---- quiz ----
      case 'quiz': {
        if (!url) return { success: false, output: '', error: 'URL is required for quiz action' }
        await chromeManager.navigate(url, sameTab)

        const strategy = args.quizStrategy ?? 'first'
        let answered = 0

        // Проходим по вопросам на странице
        const questions = await page.$$(
          '[class*="question"], [class*="quiz"], [class*="test"]'
        )

        for (const _q of questions) {
          const options = await _q.$$(
            'input[type="radio"], input[type="checkbox"], [class*="option"], [class*="answer"], li, button'
          )

          if (options.length === 0) continue

          let targetIndex = 0
          if (strategy === 'random') {
            targetIndex = Math.floor(Math.random() * options.length)
          }

          const option = options[targetIndex]
          try {
            await option.click()
            answered++
            await new Promise(resolve => setTimeout(resolve, 300))
          } catch {
            // Пропускаем, если не удалось кликнуть
          }
        }

        return {
          success: true,
          output: `Quiz completed: ${answered} questions answered (strategy: ${strategy})`,
        }
      }

      default:
        return {
          success: false,
          output: '',
          error: `Unknown action: ${action}`,
        }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: '', error: `Chrome ${action} failed: ${message}` }
  }
}

// ---- Параметры инструмента ----

const chromeParameters: ToolParameter[] = [
  {
    name: 'action',
    type: 'string',
    description: `Действие в браузере. Возможные значения:
- open — открыть URL
- click — клик по элементу (нужен selector)
- fill — ввод текста в поле (нужны selector и text)
- eval — выполнить JavaScript (нужен code)
- text — получить текст страницы или элемента (опционально selector)
- html — получить HTML страницы
- console — прочитать консоль (флаги: error, all)
- network — перехватить сетевые запросы (флаг: api)
- shot — сделать скриншот (флаги: output, full)
- nav — навигация (флаги: back, forward, refresh)
- wait — ожидание элемента (флаг: hidden, timeout)
- scroll — прокрутка (флаги: top, bottom, selector)
- locator — поиск элементов (флаги: text, attr, count)
- cookies — управление cookies (флаги: name, clear)
- storage — localStorage/sessionStorage (флаги: local, session)
- quiz — автоматическое прохождение теста (флаг: quizStrategy)`,
    required: true,
  },
  {
    name: 'url',
    type: 'string',
    description: 'URL страницы для открытия или навигации',
    required: false,
  },
  {
    name: 'selector',
    type: 'string',
    description: 'CSS-селектор элемента (для click, fill, text, wait, scroll, locator)',
    required: false,
  },
  {
    name: 'text',
    type: 'string',
    description: 'Текст для ввода (fill) или фильтр по тексту (locator)',
    required: false,
  },
  {
    name: 'code',
    type: 'string',
    description: 'JavaScript-код для выполнения на странице (eval)',
    required: false,
  },
  {
    name: 'output',
    type: 'string',
    description: 'Путь для сохранения скриншота (shot)',
    required: false,
  },
  {
    name: 'timeout',
    type: 'number',
    description: 'Таймаут в миллисекундах для wait/locator',
    required: false,
  },
  {
    name: 'sameTab',
    type: 'boolean',
    description: 'Переиспользовать текущую вкладку (вместо создания новой)',
    required: false,
  },
  {
    name: 'error',
    type: 'boolean',
    description: 'Показать только ошибки консоли (console)',
    required: false,
  },
  {
    name: 'all',
    type: 'boolean',
    description: 'Показать все сообщения консоли (console)',
    required: false,
  },
  {
    name: 'api',
    type: 'boolean',
    description: 'Показать только XHR/fetch запросы (network)',
    required: false,
  },
  {
    name: 'local',
    type: 'boolean',
    description: 'Показать localStorage (storage)',
    required: false,
  },
  {
    name: 'session',
    type: 'boolean',
    description: 'Показать sessionStorage (storage)',
    required: false,
  },
  {
    name: 'clear',
    type: 'boolean',
    description: 'Очистить cookies (cookies)',
    required: false,
  },
  {
    name: 'full',
    type: 'boolean',
    description: 'Скриншот всей страницы (shot)',
    required: false,
  },
  {
    name: 'back',
    type: 'boolean',
    description: 'Назад по истории (nav)',
    required: false,
  },
  {
    name: 'forward',
    type: 'boolean',
    description: 'Вперёд по истории (nav)',
    required: false,
  },
  {
    name: 'refresh',
    type: 'boolean',
    description: 'Обновить страницу (nav)',
    required: false,
  },
  {
    name: 'top',
    type: 'boolean',
    description: 'Прокрутка вверх (scroll)',
    required: false,
  },
  {
    name: 'bottom',
    type: 'boolean',
    description: 'Прокрутка вниз (scroll)',
    required: false,
  },
  {
    name: 'name',
    type: 'string',
    description: 'Имя cookie для получения (cookies)',
    required: false,
  },
  {
    name: 'attr',
    type: 'string',
    description: 'Фильтр по атрибуту (locator)',
    required: false,
  },
  {
    name: 'count',
    type: 'boolean',
    description: 'Только количество найденных элементов (locator)',
    required: false,
  },
  {
    name: 'port',
    type: 'number',
    description: 'Порт отладки Chrome',
    required: false,
  },
  {
    name: 'quizStrategy',
    type: 'string',
    description: 'Стратегия прохождения теста: "first" (первый вариант) или "random" (случайный)',
    required: false,
  },
]

// ---- Tool definition ----

export const chromeTool: Tool = {
  name: 'chrome',
  description: `Control Google Chrome browser via Puppeteer.
Allows opening pages, clicking, filling forms, executing JavaScript,
reading console logs, intercepting network requests, taking screenshots, and more.

Usage examples:
- Open page: { "action": "open", "url": "https://example.com" }
- Get text: { "action": "text", "url": "https://example.com", "selector": "h1" }
- Click button: { "action": "click", "url": "https://example.com", "selector": ".submit-btn" }
- Fill form: { "action": "fill", "url": "https://example.com/login", "selector": "#email", "text": "user@example.com" }
- Execute JS: { "action": "eval", "url": "https://example.com", "code": "document.title" }
- Screenshot: { "action": "shot", "url": "https://example.com", "output": "screenshot.png", "full": true }
- Check console: { "action": "console", "url": "https://example.com", "error": true }
- Intercept API: { "action": "network", "url": "https://example.com", "api": true }
- Find elements: { "action": "locator", "url": "https://example.com", "selector": "a", "text": "Learn more", "count": true }
- Многошаговый сценарий: используйте sameTab: true для работы в одной вкладке

ВАЖНО: При первом вызове Chrome будет запущен в видимом окне.
Для многошаговых сценариев используйте sameTab: true.`,
  parameters: chromeParameters,
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const typedArgs = args as unknown as ChromeToolArgs

    if (!typedArgs.action) {
      return { success: false, output: '', error: 'Action is required' }
    }

    // Устанавливаем порт, если указан
    if (typedArgs.port) {
      chromeManager.setDebugPort(typedArgs.port)
    }

    return executeAction(typedArgs)
  },
}
