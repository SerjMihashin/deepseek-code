import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { ConsoleMessage, HTTPRequest, Page } from 'puppeteer'
import type { Tool, ToolParameter, ToolResult } from './types.js'
import { chromeManager } from './chrome-manager.js'

export type ChromeAction =
  | 'open'
  | 'click'
  | 'fill'
  | 'eval'
  | 'text'
  | 'html'
  | 'console'
  | 'network'
  | 'state'
  | 'shot'
  | 'nav'
  | 'wait'
  | 'scroll'
  | 'locator'
  | 'cookies'
  | 'storage'
  | 'quiz'

export interface ChromeToolArgs {
  action: ChromeAction;
  url?: string;
  selector?: string;
  text?: string;
  code?: string;
  output?: string;
  timeout?: number;
  sameTab?: boolean;
  hidden?: boolean;
  error?: boolean;
  all?: boolean;
  api?: boolean;
  local?: boolean;
  session?: boolean;
  clear?: boolean;
  full?: boolean;
  back?: boolean;
  forward?: boolean;
  refresh?: boolean;
  top?: boolean;
  bottom?: boolean;
  name?: string;
  attr?: string;
  count?: boolean;
  port?: number;
  headless?: boolean;
  quizStrategy?: 'first' | 'random';
}

async function waitForElement (
  page: Page,
  selector: string,
  timeout = 10000
): Promise<void> {
  await page.waitForSelector(selector, {
    visible: true,
    timeout,
  })
}

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

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function resolveArtifactPath (output?: string): Promise<string> {
  const artifactDir = join(process.cwd(), '.deepseek-code', 'artifacts', 'browser')
  const targetPath = output
    ? (isAbsolute(output) ? output : join(process.cwd(), output))
    : join(artifactDir, `chrome-shot-${Date.now()}.png`)

  await mkdir(dirname(targetPath), { recursive: true })
  return targetPath
}

async function navigateIfNeeded (
  args: ChromeToolArgs,
  page: Page
): Promise<void> {
  if (args.url) {
    await chromeManager.navigate(args.url, args.sameTab ?? false)
    return
  }

  if (page.url() === 'about:blank') {
    throw new Error('URL is required when no page is open yet')
  }
}

async function collectConsoleMessages (
  page: Page,
  args: ChromeToolArgs
): Promise<ToolResult> {
  const logs: string[] = []
  const errors: string[] = []

  const handleConsole = (msg: ConsoleMessage): void => {
    const text = msg.text()
    if (msg.type() === 'error') {
      errors.push(text)
    } else {
      logs.push(text)
    }
  }

  page.on('console', handleConsole)

  try {
    await navigateIfNeeded(args, page)
    await sleep(2000)
  } finally {
    page.off('console', handleConsole)
  }

  if (args.error ?? false) {
    return {
      success: true,
      output: errors.length > 0
        ? `Console errors:\n${errors.join('\n')}`
        : 'No console errors found',
    }
  }

  const parts: string[] = []
  if ((args.all ?? false) || logs.length > 0) {
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

async function collectNetworkRequests (
  page: Page,
  args: ChromeToolArgs
): Promise<ToolResult> {
  const requests: Array<{ url: string; method: string; type: string }> = []

  const handleRequest = (req: HTTPRequest): void => {
    requests.push({
      url: req.url(),
      method: req.method(),
      type: req.resourceType(),
    })
  }

  page.on('request', handleRequest)

  try {
    await navigateIfNeeded(args, page)
    await sleep(3000)
  } finally {
    page.off('request', handleRequest)
  }

  const filtered = (args.api ?? false)
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

async function executeAction (args: ChromeToolArgs): Promise<ToolResult> {
  const timeout = args.timeout ?? 10000
  const sameTab = args.sameTab ?? false
  if (args.headless !== undefined) {
    chromeManager.setHeadlessMode(args.headless)
  }
  const page = await chromeManager.getPage(sameTab)

  try {
    switch (args.action) {
      case 'open': {
        if (!args.url) return { success: false, output: '', error: 'URL is required for open action' }
        await page.goto(args.url, { waitUntil: 'networkidle2', timeout: 30000 })
        return { success: true, output: `Opened: ${page.url()}` }
      }

      case 'click': {
        if (!args.selector) return { success: false, output: '', error: 'Selector is required for click action' }
        await navigateIfNeeded(args, page)
        await waitForElement(page, args.selector, timeout)
        await page.click(args.selector)
        await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => {})
        return { success: true, output: `Clicked: ${args.selector}` }
      }

      case 'fill': {
        if (!args.selector || args.text === undefined) {
          return { success: false, output: '', error: 'Selector and text are required for fill action' }
        }
        await navigateIfNeeded(args, page)
        await waitForElement(page, args.selector, timeout)
        await page.click(args.selector)
        await page.keyboard.down('Control')
        await page.keyboard.press('a')
        await page.keyboard.up('Control')
        await page.keyboard.press('Backspace')
        await page.type(args.selector, args.text, { delay: 10 })
        return { success: true, output: `Filled "${args.text}" into: ${args.selector}` }
      }

      case 'eval': {
        if (!args.code) return { success: false, output: '', error: 'Code is required for eval action' }
        await navigateIfNeeded(args, page)
        const result = await page.evaluate(args.code)
        return { success: true, output: formatEvalResult(result) }
      }

      case 'text': {
        await navigateIfNeeded(args, page)
        if (args.selector) {
          const el = await page.$(args.selector)
          if (!el) return { success: false, output: '', error: `Element not found: ${args.selector}` }
          const textContent = await page.evaluate(elm => elm.textContent ?? '', el)
          return { success: true, output: textContent.trim() }
        }
        const textContent = await page.evaluate(() => document.body?.innerText ?? '')
        return { success: true, output: textContent.trim() }
      }

      case 'html': {
        await navigateIfNeeded(args, page)
        return { success: true, output: await page.content() }
      }

      case 'console':
        return collectConsoleMessages(page, args)

      case 'network':
        return collectNetworkRequests(page, args)

      case 'state': {
        return {
          success: true,
          output: JSON.stringify(chromeManager.getState(), null, 2),
        }
      }

      case 'shot': {
        await navigateIfNeeded(args, page)
        const shotPath = await resolveArtifactPath(args.output)
        await page.screenshot({
          path: shotPath,
          fullPage: args.full ?? false,
        })
        return {
          success: true,
          output: `Screenshot saved: ${shotPath}\nPage: ${page.url()}`,
        }
      }

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

      case 'wait': {
        if (!args.selector) return { success: false, output: '', error: 'Selector is required for wait action' }
        await navigateIfNeeded(args, page)
        if (args.hidden ?? false) {
          await page.waitForSelector(args.selector, { hidden: true, timeout })
          return { success: true, output: `Element hidden: ${args.selector}` }
        }
        await page.waitForSelector(args.selector, { visible: true, timeout })
        return { success: true, output: `Element visible: ${args.selector}` }
      }

      case 'scroll': {
        await navigateIfNeeded(args, page)
        if (args.top) {
          await page.evaluate(() => window.scrollTo(0, 0))
          return { success: true, output: 'Scrolled to top' }
        }
        if (args.selector) {
          await page.evaluate((selector: string) => {
            const el = document.querySelector(selector)
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, args.selector)
          return { success: true, output: `Scrolled to element: ${args.selector}` }
        }
        if (args.bottom) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await sleep(500)
          return { success: true, output: 'Scrolled to bottom' }
        }
        return { success: true, output: 'No scroll target specified' }
      }

      case 'locator': {
        if (!args.selector) return { success: false, output: '', error: 'Selector is required for locator action' }
        await navigateIfNeeded(args, page)

        const elements = await page.$$(args.selector)
        if (args.count ?? false) {
          return { success: true, output: `Found ${elements.length} elements matching: ${args.selector}` }
        }

        const results: string[] = []
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i]
          const tagName = await page.evaluate(node => node.tagName.toLowerCase(), el)
          const elText = await page.evaluate(node => (node as HTMLElement).innerText?.slice(0, 100) ?? '', el)
          const elAttrs = await page.evaluate(node => {
            const attrs: Record<string, string> = {}
            for (const attr of node.attributes) {
              attrs[attr.name] = attr.value
            }
            return attrs
          }, el)

          if (args.text && !elText.toLowerCase().includes(args.text.toLowerCase())) continue
          if (args.attr && elAttrs[args.attr] === undefined) continue

          const attrStr = Object.entries(elAttrs)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ')

          results.push(
            `[${i}] <${tagName}${attrStr ? ` ${attrStr}` : ''}>${elText ? `\n    Text: ${elText.trim().slice(0, 200)}` : ''}`
          )
        }

        if (results.length === 0) {
          return { success: true, output: `No elements found matching: ${args.selector}` }
        }

        return {
          success: true,
          output: `Elements (${results.length}):\n${results.join('\n')}`,
        }
      }

      case 'cookies': {
        await navigateIfNeeded(args, page)

        if (args.clear ?? false) {
          const client = await page.target().createCDPSession()
          await client.send('Network.clearBrowserCookies')
          return { success: true, output: 'Cookies cleared' }
        }

        const cookies = await page.cookies()
        if (args.name) {
          const cookie = cookies.find(cookie => cookie.name === args.name)
          if (!cookie) return { success: false, output: '', error: `Cookie not found: ${args.name}` }
          return { success: true, output: JSON.stringify(cookie, null, 2) }
        }

        if (cookies.length === 0) {
          return { success: true, output: 'No cookies found' }
        }

        const lines = cookies.map(
          cookie => `${cookie.name}=${cookie.value} (domain: ${cookie.domain}, path: ${cookie.path})`
        )

        return {
          success: true,
          output: `Cookies (${cookies.length}):\n${lines.join('\n')}`,
        }
      }

      case 'storage': {
        await navigateIfNeeded(args, page)
        const result: Record<string, string> = {}
        const readLocal = args.local ?? !args.session

        if (readLocal) {
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
            .map(([key, value]) => `${key}:\n${value}`)
            .join('\n\n'),
        }
      }

      case 'quiz': {
        if (!args.url) return { success: false, output: '', error: 'URL is required for quiz action' }
        await chromeManager.navigate(args.url, sameTab)

        const strategy = args.quizStrategy ?? 'first'
        let answered = 0
        const questions = await page.$$(
          '[class*="question"], [class*="quiz"], [class*="test"]'
        )

        for (const question of questions) {
          const options = await question.$$(
            'input[type="radio"], input[type="checkbox"], [class*="option"], [class*="answer"], li, button'
          )

          if (options.length === 0) continue

          let targetIndex = 0
          if (strategy === 'random') {
            targetIndex = Math.floor(Math.random() * options.length)
          }

          try {
            await options[targetIndex].click()
            answered++
            await sleep(300)
          } catch {
            // Best-effort flow for generic quizzes.
          }
        }

        return {
          success: true,
          output: `Quiz completed: ${answered} questions answered (strategy: ${strategy})`,
        }
      }

      default:
        return { success: false, output: '', error: `Unknown action: ${args.action}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: '', error: `Chrome ${args.action} failed: ${message}` }
  }
}

const chromeParameters: ToolParameter[] = [
  {
    name: 'action',
    type: 'string',
    description: 'Browser action: open, click, fill, eval, text, html, console, network, state, shot, nav, wait, scroll, locator, cookies, storage, quiz',
    required: true,
  },
  {
    name: 'url',
    type: 'string',
    description: 'Target page URL for opening or navigation',
    required: false,
  },
  {
    name: 'selector',
    type: 'string',
    description: 'CSS selector for click, fill, text, wait, scroll, or locator',
    required: false,
  },
  {
    name: 'text',
    type: 'string',
    description: 'Text to fill into an input or text filter for locator',
    required: false,
  },
  {
    name: 'code',
    type: 'string',
    description: 'JavaScript expression or code to evaluate on the page',
    required: false,
  },
  {
    name: 'output',
    type: 'string',
    description: 'Screenshot output path for shot action',
    required: false,
  },
  {
    name: 'timeout',
    type: 'number',
    description: 'Timeout in milliseconds for wait-like actions',
    required: false,
  },
  {
    name: 'sameTab',
    type: 'boolean',
    description: 'Reuse the current tab for multi-step browser flows',
    required: false,
  },
  {
    name: 'hidden',
    type: 'boolean',
    description: 'Wait for the selector to become hidden instead of visible',
    required: false,
  },
  {
    name: 'error',
    type: 'boolean',
    description: 'Show only console errors',
    required: false,
  },
  {
    name: 'all',
    type: 'boolean',
    description: 'Show all console messages',
    required: false,
  },
  {
    name: 'api',
    type: 'boolean',
    description: 'Show only XHR/fetch network requests',
    required: false,
  },
  {
    name: 'local',
    type: 'boolean',
    description: 'Read localStorage',
    required: false,
  },
  {
    name: 'session',
    type: 'boolean',
    description: 'Read sessionStorage',
    required: false,
  },
  {
    name: 'clear',
    type: 'boolean',
    description: 'Clear cookies',
    required: false,
  },
  {
    name: 'full',
    type: 'boolean',
    description: 'Take a full-page screenshot',
    required: false,
  },
  {
    name: 'back',
    type: 'boolean',
    description: 'Navigate back in history',
    required: false,
  },
  {
    name: 'forward',
    type: 'boolean',
    description: 'Navigate forward in history',
    required: false,
  },
  {
    name: 'refresh',
    type: 'boolean',
    description: 'Reload the current page',
    required: false,
  },
  {
    name: 'top',
    type: 'boolean',
    description: 'Scroll to top',
    required: false,
  },
  {
    name: 'bottom',
    type: 'boolean',
    description: 'Scroll to bottom',
    required: false,
  },
  {
    name: 'name',
    type: 'string',
    description: 'Cookie name to inspect',
    required: false,
  },
  {
    name: 'attr',
    type: 'string',
    description: 'Attribute filter for locator',
    required: false,
  },
  {
    name: 'count',
    type: 'boolean',
    description: 'Return only the count of matching elements',
    required: false,
  },
  {
    name: 'port',
    type: 'number',
    description: 'Override Chrome remote debugging port',
    required: false,
  },
  {
    name: 'headless',
    type: 'boolean',
    description: 'Run the browser in headless mode for automation or CI',
    required: false,
  },
  {
    name: 'quizStrategy',
    type: 'string',
    description: 'Quiz answer strategy: first or random',
    required: false,
  },
]

export const chromeTool: Tool = {
  name: 'chrome',
  description: `Control a real browser through a native Chrome runtime.
Use it for UI validation, rendered DOM inspection, console and network debugging,
screenshots, and multi-step browser workflows when terminal tools are not enough.

Examples:
- { "action": "open", "url": "https://example.com" }
- { "action": "text", "url": "https://example.com", "selector": "h1" }
- { "action": "click", "url": "https://example.com", "selector": ".submit-btn" }
- { "action": "fill", "url": "https://example.com/login", "selector": "#email", "text": "user@example.com" }
- { "action": "eval", "url": "https://example.com", "code": "document.title" }
- { "action": "network", "url": "https://example.com", "api": true }
- { "action": "state" }
- { "action": "shot", "url": "https://example.com", "output": "screenshot.png", "full": true }
- Use "sameTab": true for multi-step flows in one tab.
- Use "headless": true for automation or CI-safe browser execution.`,
  parameters: chromeParameters,
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const typedArgs = args as unknown as ChromeToolArgs

    if (!typedArgs.action) {
      return { success: false, output: '', error: 'Action is required' }
    }

    if (typedArgs.port) {
      chromeManager.setDebugPort(typedArgs.port)
    }

    return executeAction(typedArgs)
  },
}
