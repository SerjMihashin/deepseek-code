import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer as netCreateServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Browser, type Page, type LaunchOptions, launch } from 'puppeteer'

export interface ChromeRuntimeState {
  connected: boolean;
  headless: boolean;
  debugPort: number;
  managedProcessPid?: number;
  currentUrl?: string;
}

/**
 * Check if a TCP port is in use (IPv4 only).
 * Returns true if the port is already occupied.
 */
function isPortInUse (port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = netCreateServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => {
      server.close()
      resolve(false)
    })
    server.listen(port, '127.0.0.1')
  })
}

class ChromeManager extends EventEmitter {
  private browser: Browser | null = null
  private currentPage: Page | null = null
  private debugPort = 9222
  private headlessMode = false
  private userDataDir: string | null = null

  getState (): ChromeRuntimeState {
    return {
      connected: this.isConnected(),
      headless: this.headlessMode,
      debugPort: this.debugPort,
      managedProcessPid: this.browser?.process()?.pid,
      currentUrl: this.currentPage && !this.currentPage.isClosed()
        ? this.currentPage.url()
        : undefined,
    }
  }

  /**
   * Ensure the browser is running in the desired mode.
   * If the mode differs or browser is not connected, fully close and re-launch.
   * Each launch gets a fresh userDataDir to avoid profile contamination.
   */
  async ensureMode (desiredHeadless: boolean): Promise<void> {
    // If already running in the correct mode, nothing to do
    if (this.browser?.connected && this.headlessMode === desiredHeadless) {
      return
    }

    // Check debug port before launching
    const portInUse = await isPortInUse(this.debugPort)
    if (portInUse && !this.browser?.connected) {
      throw new Error(
        `Порт ${this.debugPort} уже занят другим процессом Chrome. ` +
        'Закройте все процессы Chrome вручную или укажите другой порт через port=<номер>.'
      )
    }

    this.headlessMode = desiredHeadless
    await this.close()
    await this.launch()
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

    // Create a fresh temporary user data directory for each managed launch
    // This prevents profile contamination between headed/headless sessions
    const tmpDir = mkdtempSync(join(tmpdir(), 'deepseek-code-chrome-'))
    this.userDataDir = tmpDir

    const launchOptions: LaunchOptions = {
      headless: this.headlessMode,
      defaultViewport: this.headlessMode ? { width: 1280, height: 900 } : null,
      args: [
        `--remote-debugging-port=${this.debugPort}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-popup-blocking',
        '--start-maximized',
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
        // Kill the browser process first to ensure it's fully terminated
        const proc = this.browser.process()
        if (proc) {
          proc.kill('SIGKILL')
        }
        await this.browser.close()
      } catch {
        // Ignore close errors during shutdown.
      }
    }
    this.browser = null
    this.currentPage = null

    // Clean up the temporary user data directory
    if (this.userDataDir && existsSync(this.userDataDir)) {
      try {
        rmSync(this.userDataDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
      this.userDataDir = null
    }

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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    this.currentPage = page
    this.emitState()
  }

  private emitState (): void {
    this.emit('connectionChange', this.isConnected())
    this.emit('stateChange', this.getState())
  }
}

export const chromeManager = new ChromeManager()
