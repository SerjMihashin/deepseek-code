import { EventEmitter } from 'node:events'
import { type Browser, type Page, type LaunchOptions, launch } from 'puppeteer'

export interface ChromeRuntimeState {
  connected: boolean;
  headless: boolean;
  debugPort: number;
  currentUrl?: string;
}

class ChromeManager extends EventEmitter {
  private browser: Browser | null = null
  private currentPage: Page | null = null
  private debugPort = 9222
  private headlessMode = false

  getState (): ChromeRuntimeState {
    return {
      connected: this.isConnected(),
      headless: this.headlessMode,
      debugPort: this.debugPort,
      currentUrl: this.currentPage && !this.currentPage.isClosed()
        ? this.currentPage.url()
        : undefined,
    }
  }

  async getBrowser (): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser
    }
    return this.launch()
  }

  async launch (options?: LaunchOptions): Promise<Browser> {
    if (this.browser?.connected) {
      await this.close()
    }

    const launchOptions: LaunchOptions = {
      headless: this.headlessMode,
      args: [
        `--remote-debugging-port=${this.debugPort}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-popup-blocking',
      ],
      ...options,
    }

    this.browser = await launch(launchOptions)
    this.currentPage = null
    this.emitState()

    this.browser.on('disconnected', () => {
      this.browser = null
      this.currentPage = null
      this.emitState()
    })

    return this.browser
  }

  async getPage (sameTab = false): Promise<Page> {
    const browser = await this.getBrowser()

    if (sameTab && this.currentPage && !this.currentPage.isClosed()) {
      this.emitState()
      return this.currentPage
    }

    const pages = await browser.pages()
    const blankPage = pages.find(
      p => p.url() === 'about:blank' && !p.isClosed()
    )
    const page = blankPage ?? (await browser.newPage())

    page.setDefaultNavigationTimeout(30000)
    page.setDefaultTimeout(15000)

    this.currentPage = page
    this.emitState()
    return page
  }

  async close (): Promise<void> {
    if (this.browser?.connected) {
      try {
        await this.browser.close()
      } catch {
        // Ignore close errors during shutdown.
      }
    }
    this.browser = null
    this.currentPage = null
    this.emitState()
  }

  isConnected (): boolean {
    return this.browser !== null && this.browser.connected
  }

  setDebugPort (port: number): void {
    this.debugPort = port
    this.emitState()
  }

  setHeadlessMode (headless: boolean): void {
    this.headlessMode = headless
    this.emitState()
  }

  async navigate (url: string, sameTab = false): Promise<void> {
    const page = await this.getPage(sameTab)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    this.currentPage = page
    this.emitState()
  }

  private emitState (): void {
    this.emit('connectionChange', this.isConnected())
    this.emit('stateChange', this.getState())
  }
}

export const chromeManager = new ChromeManager()
