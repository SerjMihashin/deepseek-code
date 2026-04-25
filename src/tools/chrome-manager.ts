import { type Browser, type Page, type LaunchOptions, launch } from 'puppeteer'

/**
 * Singleton-менеджер сессии Chrome.
 * Управляет запуском/остановкой браузера и переиспользованием вкладок.
 */
class ChromeManager {
  private browser: Browser | null = null
  private currentPage: Page | null = null
  private debugPort = 9222

  /**
   * Возвращает запущенный экземпляр браузера.
   * Если браузер не запущен — запускает его.
   */
  async getBrowser (): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser
    }
    return this.launch()
  }

  /**
   * Запускает Chrome с debugging-портом.
   */
  async launch (options?: LaunchOptions): Promise<Browser> {
    if (this.browser?.connected) {
      await this.close()
    }

    const launchOptions: LaunchOptions = {
      headless: false, // Видимый браузер для наглядности
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

    // При закрытии браузера извне — сбросить состояние
    this.browser.on('disconnected', () => {
      this.browser = null
      this.currentPage = null
    })

    return this.browser
  }

  /**
   * Возвращает страницу для работы.
   * Если `sameTab === true` и есть открытая вкладка — переиспользует её.
   * Иначе создаёт новую вкладку.
   */
  async getPage (sameTab = false): Promise<Page> {
    const browser = await this.getBrowser()

    if (sameTab && this.currentPage && !this.currentPage.isClosed()) {
      return this.currentPage
    }

    const pages = await browser.pages()
    // Используем первую вкладку, если она пустая (about:blank)
    const blankPage = pages.find(
      p => p.url() === 'about:blank' && !p.isClosed()
    )
    const page = blankPage ?? (await browser.newPage())

    // Настройка таймаутов
    page.setDefaultNavigationTimeout(30000)
    page.setDefaultTimeout(15000)

    this.currentPage = page
    return page
  }

  /**
   * Закрывает браузер.
   */
  async close (): Promise<void> {
    if (this.browser?.connected) {
      try {
        await this.browser.close()
      } catch {
        // Игнорируем ошибки при закрытии
      }
    }
    this.browser = null
    this.currentPage = null
  }

  /**
   * Проверяет, запущен ли браузер.
   */
  isConnected (): boolean {
    return this.browser !== null && this.browser.connected
  }

  /**
   * Устанавливает порт отладки.
   */
  setDebugPort (port: number): void {
    this.debugPort = port
  }

  /**
   * Переходит на URL в текущей или новой вкладке.
   */
  async navigate (url: string, sameTab = false): Promise<void> {
    const page = await this.getPage(sameTab)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
  }
}

// Singleton
export const chromeManager = new ChromeManager()
