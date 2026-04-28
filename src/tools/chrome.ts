import { mkdir } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
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
    if (args.url) {
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: args.timeout ?? 30000 })
    }
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
    if (args.url) {
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: args.timeout ?? 30000 })
    }
    await sleep(2000)
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
  const sameTab = args.sameTab ?? true
  if (args.headless !== undefined) {
    await chromeManager.ensureMode(args.headless)
  }
  const page = await chromeManager.getPage(sameTab)

  try {
    switch (args.action) {
      case 'open': {
        if (!args.url) return { success: false, output: '', error: 'URL is required for open action' }
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout })
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
          await page.goBack({ waitUntil: 'load', timeout })
          return { success: true, output: `Navigated back to: ${page.url()}` }
        }
        if (args.forward) {
          await page.goForward({ waitUntil: 'load', timeout })
          return { success: true, output: `Navigated forward to: ${page.url()}` }
        }
        if (args.refresh ?? true) {
          await page.reload({ waitUntil: 'load', timeout })
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

// ─── Browser Test structured result ──────────────────────────────────────────

export interface BrowserTestStep {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  details: string;
}

export interface BrowserTestResult {
  timestamp: string;
  mode: 'headless' | 'headed';
  steps: BrowserTestStep[];
  summary: { passed: number; failed: number; skipped: number };
  stoppedEarly: boolean;
  stoppedReason?: string;
}

let lastBrowserTestResult: BrowserTestResult | null = null

export function getLastBrowserTestResult (): BrowserTestResult | null {
  return lastBrowserTestResult
}

export interface BrowserTestOptions {
  headless?: boolean;
  signal?: AbortSignal;
}

/**
 * Start a temporary HTTP server serving the browser test page.
 * Returns the server and the URL.
 */
async function startTestServer (): Promise<{ server: Server; url: string }> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Browser Test Page</title></head>
<body>
  <h1 id="test-title">Browser Test</h1>
  <p id="test-paragraph">Hello, world!</p>
  <button id="test-button" onclick="document.getElementById('test-output').textContent='clicked'">Click Me</button>
  <input id="test-input" type="text" placeholder="Type here">
  <label><input type="checkbox" id="test-checkbox" checked> Checkbox</label>
  <label><input type="radio" name="test-radio" id="radio-1" checked> Radio 1</label>
  <label><input type="radio" name="test-radio" id="radio-2"> Radio 2</label>
  <div id="test-output"></div>
  <script>
    console.log('Browser test page loaded');
    console.error('Test error message');
    localStorage.setItem('test-key', 'test-value');
    sessionStorage.setItem('session-key', 'session-value');
    document.cookie = 'test-cookie=chocolate-chip; path=/';
  </script>
</body>
</html>`

  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('Failed to get server address'))
        return
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` })
    })
    server.unref()
    server.on('error', reject)
  })
}

/**
 * Run a controlled browser test on a local HTTP page.
 *
 * @param options - Optional: headless mode, abort signal
 * @returns Markdown report string
 *
 * Features:
 * - All steps use sameTab: true on a single page via local HTTP server
 * - Each step has a timeout (30s max)
 * - A single step failure does NOT abort the entire test
 * - Supports --headless and --headed modes
 * - Supports abort via AbortSignal
 * - Always produces a final structured report
 * - Saves structured result for /last-browser-test
 */
export async function browserTest (options?: BrowserTestOptions): Promise<string> {
  const desiredHeadless = options?.headless ?? false // default: headed (visible)
  const signal = options?.signal
  const requestedMode = desiredHeadless ? 'headless' : 'headed'

  const steps: BrowserTestStep[] = []

  // Ensure browser is in the correct mode — closes and re-launches if needed
  let initFailed = false
  let actualHeadless = desiredHeadless
  try {
    await chromeManager.ensureMode(desiredHeadless)
    const state = chromeManager.getState()
    actualHeadless = state.headless
  } catch (err) {
    // If we can't even ensure the mode, add a step for it
    initFailed = true
    steps.push({
      name: 'browser init',
      status: 'failed',
      durationMs: 0,
      details: `Не удалось запустить Chrome: ${String(err)}. Проверьте, не занят ли порт 9222 другим процессом Chrome.`,
    })
    return buildBrowserTestReport(steps, requestedMode, actualHeadless, signal?.aborted ?? false, undefined, initFailed)
  }

  // Start temporary HTTP server
  let server: Server | null = null
  let testUrl: string | null = null
  let serverError: string | null = null

  try {
    const result = await startTestServer()
    server = result.server
    testUrl = result.url
  } catch (err) {
    serverError = String(err)
  }

  if (!testUrl) {
    // Fall back to data: URL for basic tests, skip storage/network
    const dataUrl = `data:text/html,<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Browser Test Page</title></head>
<body>
  <h1 id="test-title">Browser Test</h1>
  <p id="test-paragraph">Hello, world!</p>
  <button id="test-button" onclick="document.getElementById('test-output').textContent='clicked'">Click Me</button>
  <input id="test-input" type="text" placeholder="Type here">
  <label><input type="checkbox" id="test-checkbox" checked> Checkbox</label>
  <label><input type="radio" name="test-radio" id="radio-1" checked> Radio 1</label>
  <label><input type="radio" name="test-radio" id="radio-2"> Radio 2</label>
  <div id="test-output"></div>
  <script>
    console.log('Browser test page loaded');
    console.error('Test error message');
  </script>
</body>
</html>`

    const baseArgs: Partial<ChromeToolArgs> = { url: dataUrl, sameTab: true, timeout: 30000 }

    async function runDataStep (name: string, action: ChromeAction, extraArgs: Partial<ChromeToolArgs>): Promise<void> {
      if (signal?.aborted) {
        steps.push({ name, status: 'skipped', durationMs: 0, details: 'тест отменён' })
        return
      }
      const start = Date.now()
      try {
        const result = await Promise.race<ToolResult>([
          executeAction({ ...baseArgs, ...extraArgs, action } as ChromeToolArgs),
          new Promise<ToolResult>((_resolve, _reject) =>
            setTimeout(() => _reject(new Error('timeout 30s')), 30000)
          ),
        ])
        steps.push({ name, status: result.success ? 'passed' : 'failed', durationMs: Date.now() - start, details: result.success ? (result.output || '').slice(0, 200) : (result.error || 'unknown error') })
      } catch (err) {
        steps.push({ name, status: 'failed', durationMs: Date.now() - start, details: String(err) })
      }
    }

    await runDataStep('open', 'open', {})
    await runDataStep('html', 'html', {})
    await runDataStep('eval', 'eval', { code: 'document.title' })
    await runDataStep('fill', 'fill', { selector: '#test-input', text: 'test input value' })
    await runDataStep('click (button)', 'click', { selector: '#test-button' })
    await runDataStep('text (after click)', 'text', { selector: '#test-output' })
    await runDataStep('click (checkbox)', 'click', { selector: '#test-checkbox' })
    await runDataStep('click (radio)', 'click', { selector: '#radio-2' })
    await runDataStep('console', 'console', {})
    steps.push({ name: 'storage (local)', status: 'skipped', durationMs: 0, details: `HTTP-сервер не удалось поднять: ${serverError}. Storage недоступен на data: URL` })
    steps.push({ name: 'storage (session)', status: 'skipped', durationMs: 0, details: `HTTP-сервер не удалось поднять: ${serverError}. Storage недоступен на data: URL` })
    steps.push({ name: 'cookies', status: 'skipped', durationMs: 0, details: `HTTP-сервер не удалось поднять: ${serverError}. Cookies недоступны на data: URL` })
    await runDataStep('screenshot', 'shot', {})
    steps.push({ name: 'network', status: 'skipped', durationMs: 0, details: `HTTP-сервер не удалось поднять: ${serverError}. Network/fetch не проверен` })
    return buildBrowserTestReport(steps, requestedMode, actualHeadless, signal?.aborted ?? false, serverError)
  } else {
    // Full test with HTTP server
    const baseArgs: Partial<ChromeToolArgs> = { url: testUrl, sameTab: true, timeout: 30000 }

    async function runStep (name: string, action: ChromeAction, extraArgs: Partial<ChromeToolArgs>): Promise<void> {
      if (signal?.aborted) {
        steps.push({ name, status: 'skipped', durationMs: 0, details: 'тест отменён' })
        return
      }
      const start = Date.now()
      try {
        const result = await Promise.race<ToolResult>([
          executeAction({ ...baseArgs, ...extraArgs, action } as ChromeToolArgs),
          new Promise<ToolResult>((_resolve, _reject) =>
            setTimeout(() => _reject(new Error('timeout 30s')), 30000)
          ),
        ])
        steps.push({ name, status: result.success ? 'passed' : 'failed', durationMs: Date.now() - start, details: result.success ? (result.output || '').slice(0, 200) : (result.error || 'unknown error') })
      } catch (err) {
        steps.push({ name, status: 'failed', durationMs: Date.now() - start, details: String(err) })
      }
    }

    // 1. open
    await runStep('open', 'open', {})

    // 2. html — read full DOM
    await runStep('html', 'html', {})

    // 3. eval
    await runStep('eval', 'eval', { code: 'document.title' })

    // 4. fill
    await runStep('fill', 'fill', { selector: '#test-input', text: 'test input value' })

    // 5. click button
    await runStep('click (button)', 'click', { selector: '#test-button' })

    // 6. text — read result after click
    await runStep('text (after click)', 'text', { selector: '#test-output' })

    // 7. click checkbox
    await runStep('click (checkbox)', 'click', { selector: '#test-checkbox' })

    // 8. click radio
    await runStep('click (radio)', 'click', { selector: '#radio-2' })

    // 9. console
    await runStep('console', 'console', {})

    // 10. storage (localStorage)
    await runStep('storage (local)', 'storage', { local: true })

    // 11. storage (sessionStorage)
    await runStep('storage (session)', 'storage', { session: true })

    // 12. cookies
    await runStep('cookies', 'cookies', {})

    // 13. screenshot
    await runStep('screenshot', 'shot', {})

    // 14. network
    await runStep('network', 'network', { api: true })

    // Close the HTTP server
    server!.close()
  }

  return buildBrowserTestReport(steps, requestedMode, actualHeadless, signal?.aborted ?? false, serverError)
}

/**
 * Build the markdown report from collected steps.
 * Extracted so it can be called both from the normal flow and from early-exit on browser init failure.
 */
function buildBrowserTestReport (
  steps: BrowserTestStep[],
  requestedMode: string,
  actualHeadless: boolean,
  stoppedEarly: boolean,
  serverError?: string | null,
  initFailed?: boolean
): string {
  const actualMode = initFailed ? 'не запущен' : (actualHeadless ? 'headless' : 'headed')
  const modeMatch = !initFailed && requestedMode === actualMode
  const stoppedReason = stoppedEarly ? 'тест отменён пользователем' : undefined

  // Build summary
  const passed = steps.filter(s => s.status === 'passed').length
  const failed = steps.filter(s => s.status === 'failed').length
  const skipped = steps.filter(s => s.status === 'skipped').length

  // Save structured result
  lastBrowserTestResult = {
    timestamp: new Date().toISOString(),
    mode: initFailed ? 'headless' : actualMode as 'headless' | 'headed',
    steps,
    summary: { passed, failed, skipped },
    stoppedEarly,
    stoppedReason,
  }

  // Get PID for the report
  const state = chromeManager.getState()
  const pid = initFailed ? undefined : state.managedProcessPid

  // Build markdown report
  const lines: string[] = [
    '## 🧪 Browser Test Report',
    '',
    '> **Verified** — все результаты подтверждены реальными chrome tool calls.',
    `> **Запрошенный режим:** ${requestedMode}`,
    `> **Фактический режим:** ${actualMode}`,
    `> **PID процесса:** ${pid ?? '—'}`,
    '',
  ]

  if (initFailed) {
    lines.push('> ❌ **Chrome не удалось запустить.** Browser test не выполнялся.')
    lines.push('')
  } else if (!modeMatch) {
    lines.push(`> ❌ **Режимы не совпадают.** Запрошен ${requestedMode}, но Chrome работает в ${actualMode}. Browser test считается failed.`)
    lines.push('')
  }

  if (stoppedEarly) {
    lines.push('> ⚠️ **Тест остановлен досрочно.** Причина: отмена пользователем.')
    lines.push(`> Проверено шагов: ${steps.filter(s => s.status !== 'skipped').length} / ${steps.length}`)
    lines.push('')
  }

  if (serverError) {
    lines.push(`> ⚠️ **HTTP-сервер не поднят:** ${serverError}. Storage/cookies/network пропущены.`)
    lines.push('')
  }

  lines.push('| Шаг | Статус | Длительность | Детали |')
  lines.push('|------|--------|-------------|--------|')

  for (const step of steps) {
    const icon = step.status === 'passed' ? '✅' : step.status === 'failed' ? '❌' : '⏭️'
    const dur = step.durationMs > 0 ? `${step.durationMs}ms` : '—'
    // Escape pipes for markdown table — each step is one row
    let detail = step.details.replace(/\|/g, '\\|')
    if (detail.length > 100) {
      detail = detail.slice(0, 100) + '…'
    }
    lines.push(`| ${icon} ${step.name} | ${step.status} | ${dur} | ${detail} |`)
  }

  lines.push('')
  lines.push(`**Итого:** ${passed} passed, ${failed} failed, ${skipped} skipped`)

  // ✅ What works
  const working = steps.filter(s => s.status === 'passed').map(s => s.name)
  if (working.length > 0) {
    lines.push('')
    lines.push('### ✅ Что работает')
    for (const name of working) {
      lines.push(`- **${name}**`)
    }
  }

  // ❌ What fails
  const failing = steps.filter(s => s.status === 'failed')
  if (failing.length > 0) {
    lines.push('')
    lines.push('### ❌ Что не работает')
    for (const step of failing) {
      lines.push(`- **${step.name}**: ${step.details}`)
    }
  }

  // 🔧 What to fix
  if (failing.length > 0) {
    lines.push('')
    lines.push('### 🔧 Что доработать')
    for (const step of failing) {
      lines.push(`- Исправить \`${step.name}\`: ${step.details}`)
    }
  }

  // ⏭️ What is skipped
  const skippedSteps = steps.filter(s => s.status === 'skipped')
  if (skippedSteps.length > 0) {
    lines.push('')
    lines.push('### ⏭️ Что пропущено')
    for (const step of skippedSteps) {
      lines.push(`- **${step.name}**: ${step.details}`)
    }
  }

  return lines.join('\n')
}

// ─── Real Site Smoke Test ─────────────────────────────────────────────────────

const DEFAULT_REAL_SITES = ['example.com', 'wikipedia.org', 'github.com']
const MAX_REAL_CALLS = 20

export interface BrowserRealTestOptions {
  sites?: string[]
  headless?: boolean
  signal?: AbortSignal
}

interface RealSiteStep {
  action: string
  status: 'passed' | 'failed' | 'skipped' | 'blocked'
  detail: string
}

interface RealSiteResult {
  site: string
  steps: RealSiteStep[]
  blocked: boolean
  skipReason?: string
}

export async function browserRealTest (options?: BrowserRealTestOptions): Promise<string> {
  const desiredHeadless = options?.headless ?? false
  const signal = options?.signal

  const rawSites = options?.sites && options.sites.length > 0
    ? options.sites
    : DEFAULT_REAL_SITES

  const sites = rawSites.map(s => {
    const t = s.trim().toLowerCase()
    return t.startsWith('http://') || t.startsWith('https://') ? t : `https://${t}`
  })

  let chromeCalls = 0
  const results: RealSiteResult[] = []

  try {
    await chromeManager.ensureMode(desiredHeadless)
  } catch (err) {
    return `## /browser-real-test\n\n❌ Chrome не удалось запустить: ${String(err)}`
  }

  for (const url of sites) {
    if (signal?.aborted) {
      results.push({ site: url, steps: [{ action: 'all', status: 'skipped', detail: 'aborted' }], blocked: false, skipReason: 'aborted' })
      continue
    }
    if (chromeCalls >= MAX_REAL_CALLS) {
      results.push({ site: url, steps: [{ action: 'all', status: 'skipped', detail: `call limit ${MAX_REAL_CALLS} reached` }], blocked: false, skipReason: 'limit' })
      continue
    }

    const siteResult: RealSiteResult = { site: url, steps: [], blocked: false }
    results.push(siteResult)

    async function siteAction (args: ChromeToolArgs): Promise<ToolResult> {
      chromeCalls++
      try {
        return await Promise.race<ToolResult>([
          executeAction(args),
          new Promise<ToolResult>((_resolve, reject) => setTimeout(() => reject(new Error('timeout 15s')), 15000)),
        ])
      } catch (err) {
        return { success: false, output: '', error: String(err) }
      }
    }

    // 1: open
    if (chromeCalls >= MAX_REAL_CALLS) { siteResult.steps.push({ action: 'open', status: 'skipped', detail: 'call limit' }); continue }
    const openR = await siteAction({ action: 'open', url, sameTab: true, timeout: 15000 } as ChromeToolArgs)
    siteResult.steps.push({ action: 'open', status: openR.success ? 'passed' : 'failed', detail: openR.success ? '' : (openR.error ?? 'failed').slice(0, 120) })
    if (!openR.success) continue

    // 2: title via eval (no html action)
    if (chromeCalls >= MAX_REAL_CALLS) { siteResult.steps.push({ action: 'title', status: 'skipped', detail: 'call limit' }); continue }
    const titleR = await siteAction({ action: 'eval', sameTab: true, code: 'document.title', timeout: 10000 } as ChromeToolArgs)
    siteResult.steps.push({ action: 'title', status: titleR.success ? 'passed' : 'failed', detail: titleR.success ? (titleR.output || '').slice(0, 80) : (titleR.error ?? '').slice(0, 80) })

    // 3: cookie/captcha/consent wall check
    if (chromeCalls >= MAX_REAL_CALLS) { siteResult.steps.push({ action: 'cookie-check', status: 'skipped', detail: 'call limit' }); continue }
    const wallCode = '!!document.querySelector(\'[id*="cookie"],[class*="cookie"],[id*="consent"],[class*="consent"],[id*="captcha"],[class*="captcha"],[id*="gdpr"],[class*="gdpr"]\')'
    const wallR = await siteAction({ action: 'eval', sameTab: true, code: wallCode, timeout: 10000 } as ChromeToolArgs)
    const hasWall = wallR.success && wallR.output.trim() === 'true'
    siteResult.steps.push({ action: 'cookie-check', status: hasWall ? 'blocked' : 'passed', detail: hasWall ? 'cookie/captcha/consent wall detected — skipped' : 'clear' })
    if (hasWall) { siteResult.blocked = true; continue }

    // 4: screenshot
    if (chromeCalls >= MAX_REAL_CALLS) { siteResult.steps.push({ action: 'screenshot', status: 'skipped', detail: 'call limit' }); continue }
    const shotR = await siteAction({ action: 'shot', sameTab: true, timeout: 10000 } as ChromeToolArgs)
    siteResult.steps.push({ action: 'screenshot', status: shotR.success ? 'passed' : 'failed', detail: shotR.success ? 'ok' : (shotR.error ?? '').slice(0, 80) })

    // 5: console errors
    if (chromeCalls >= MAX_REAL_CALLS) { siteResult.steps.push({ action: 'console', status: 'skipped', detail: 'call limit' }); continue }
    const consoleR = await siteAction({ action: 'console', sameTab: true, timeout: 10000 } as ChromeToolArgs)
    siteResult.steps.push({ action: 'console', status: consoleR.success ? 'passed' : 'failed', detail: consoleR.success ? (consoleR.output || 'no errors').slice(0, 120) : (consoleR.error ?? '').slice(0, 80) })
  }

  return buildRealTestReport(results, chromeCalls, sites.length)
}

function buildRealTestReport (results: RealSiteResult[], totalCalls: number, totalSites: number): string {
  const ACTIONS = ['open', 'title', 'cookie-check', 'screenshot', 'console']
  const allSteps = results.flatMap(r => r.steps)
  const passed = allSteps.filter(s => s.status === 'passed').length
  const failed = allSteps.filter(s => s.status === 'failed').length
  const skipped = allSteps.filter(s => s.status === 'skipped').length
  const blocked = allSteps.filter(s => s.status === 'blocked').length
  const partial = results.some(r => r.skipReason === 'limit')

  const lines: string[] = [
    '## /browser-real-test Results',
    '',
    `**Sites:** ${results.length}/${totalSites} | **Calls:** ${totalCalls}/${MAX_REAL_CALLS} | **Passed:** ${passed} | **Failed:** ${failed} | **Skipped:** ${skipped} | **Blocked:** ${blocked}`,
    '> Token safety: OK — no full HTML reads, call limit enforced',
    '',
  ]

  if (partial) {
    lines.push(`> ⚠️ Partial Report: reached limit of ${MAX_REAL_CALLS} calls. Some sites were skipped.`)
    lines.push('')
  }

  lines.push(`| Site | ${ACTIONS.join(' | ')} | Notes |`)
  lines.push(`|------|${ACTIONS.map(() => '------').join('|')}|-------|`)

  for (const r of results) {
    const cells = ACTIONS.map(action => {
      const step = r.steps.find(s => s.action === action)
      if (!step) return '⏭️'
      if (step.status === 'passed') return '✅'
      if (step.status === 'failed') return '❌'
      if (step.status === 'blocked') return '🚫'
      return '⏭️'
    })
    const domain = r.site.replace(/^https?:\/\//, '')
    const notes = r.blocked
      ? 'cookie/consent wall'
      : r.skipReason === 'limit'
        ? 'call limit'
        : r.skipReason === 'aborted'
          ? 'aborted'
          : '—'
    lines.push(`| ${domain} | ${cells.join(' | ')} | ${notes} |`)
  }

  const failedSteps = results.flatMap(r =>
    r.steps.filter(s => s.status === 'failed').map(s => ({ site: r.site, ...s }))
  )
  if (failedSteps.length > 0) {
    lines.push('')
    lines.push('### Failed Actions')
    lines.push('| Site | Action | Reason | Blocker |')
    lines.push('|------|--------|--------|---------|')
    for (const s of failedSteps) {
      const domain = s.site.replace(/^https?:\/\//, '')
      lines.push(`| ${domain} | ${s.action} | ${s.detail.replace(/\|/g, '\\|')} | ${s.action === 'open' ? 'yes' : 'no'} |`)
    }
  }

  lines.push('')
  lines.push(`**Что доработать:** ${failedSteps.length === 0 ? 'нет проблем' : failedSteps.map(s => s.action).join(', ')}`)

  return lines.join('\n')
}

export const chromeTool: Tool = {
  name: 'chrome',
  description: `Control a real browser through a native Chrome runtime.
Use it for UI validation, rendered DOM inspection, console and network debugging,
screenshots, and multi-step browser workflows when terminal tools are not enough.
If the task mentions localhost pages, forms, browser bugs, screenshots, rendered state,
console output, or network requests, this is the primary tool.

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
