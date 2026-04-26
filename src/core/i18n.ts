export type Locale = 'en' | 'ru' | 'zh'

interface LocaleStrings {
  // Welcome / Status
  welcome: string;
  welcomeSubtitle: string;
  welcomeHint: string;
  selectLanguage: string;
  langHint: string;
  navigate: string;
  switchSection: string;
  themePreview: string;
  next: string;
  noApiKey: string;
  setupApiKey: string;
  enterApiKey: string;
  apiKeyHint: string;
  typeKeyAndEnter: string;
  apiKeyPlaceholder: string;
  apiKeySet: string;
  apiKeyInvalid: string;
  setupSettings: string;
  selectTheme: string;
  selectMode: string;
  modePlan: string;
  modeDefault: string;
  modeAutoEdit: string;
  modeYolo: string;
  finishSetup: string;
  ready: string;
  processing: string;
  error: string;

  // Labels
  you: string;
  assistant: string;
  system: string;
  deepseek: string;

  // Commands help
  helpCommands: string;
  helpMemory: string;
  helpAdvanced: string;
  helpReview: string;
  helpSettings: string;

  // Memory
  memorySaved: string;
  memoryRemoved: string;
  memoryEmpty: string;
  memoryList: string;

  // Checkpoint
  checkpointCreated: string;
  checkpointNone: string;
  checkpointRestored: string;
  checkpointFailed: string;

  // Misc
  usage: string;
  yes: string;
  no: string;
  cancel: string;
  confirm: string;

  // Theme descriptions
  themeDefault: string;
  themeLight: string;
  themeDracula: string;
  themeNord: string;
  themeSolarized: string;
  themeMatrix: string;

  // Agent errors
  agentEmptyResponse: string;
}

const EN: LocaleStrings = {
  welcome: 'DeepSeek Code',
  welcomeSubtitle: 'AI-powered CLI agent for software development',
  welcomeHint: 'Tab: cycle approval mode | /help: show commands',
  selectLanguage: 'Select language / Выберите язык / 选择语言',
  langHint: 'to navigate, Enter to confirm',
  navigate: 'navigate',
  switchSection: 'switch section',
  themePreview: 'Preview',
  next: 'next step',
  noApiKey: '⚠ API key not configured',
  setupApiKey: 'API Key Setup',
  enterApiKey: 'Enter your DeepSeek API key:',
  apiKeyHint: 'Get your key at https://platform.deepseek.com/api_keys',
  typeKeyAndEnter: 'Type your key in the input below and press Enter',
  apiKeyPlaceholder: 'sk-...',
  apiKeySet: '✓ API key saved! You can now use DeepSeek Code.',
  apiKeyInvalid: '✗ Invalid API key format. Key should start with "sk-".',
  setupSettings: 'Settings',
  selectTheme: 'Select theme:',
  selectMode: 'Select approval mode:',
  modePlan: 'Plan — review all actions before execution',
  modeDefault: 'Default — automatic with user confirmation',
  modeAutoEdit: 'Auto-Edit — automatic edits with approval',
  modeYolo: 'YOLO — fully automatic, no confirmation',
  finishSetup: 'to finish setup',
  ready: 'Ready',
  processing: 'Processing...',
  error: 'Error',

  you: 'You',
  assistant: 'DeepSeek',
  system: 'System',
  deepseek: 'DeepSeek',

  helpCommands: 'Available commands',
  helpMemory: 'Memory commands',
  helpAdvanced: 'Advanced commands',
  helpReview: 'Review commands',
  helpSettings: 'Settings',

  memorySaved: 'Saved to memory',
  memoryRemoved: 'Removed memories',
  memoryEmpty: 'No memories saved yet',
  memoryList: 'Saved Memories',

  checkpointCreated: 'Checkpoint created',
  checkpointNone: 'No checkpoints found',
  checkpointRestored: 'Restored checkpoint',
  checkpointFailed: 'Could not restore checkpoint',

  usage: 'Usage',
  yes: 'Yes',
  no: 'No',
  cancel: 'Cancel',
  confirm: 'Confirm',

  themeDefault: 'Default dark theme',
  themeLight: 'Light theme',
  themeDracula: 'Dracula theme',
  themeNord: 'Nord theme',
  themeSolarized: 'Solarized dark theme',
  themeMatrix: 'The Matrix — green code rain',

  agentEmptyResponse: 'The model returned an empty response. Please try again.',
}

const RU: LocaleStrings = {
  welcome: 'DeepSeek Code',
  welcomeSubtitle: 'AI-агент для разработки в терминале',
  welcomeHint: 'Tab: режимы разрешений | /help: команды',
  selectLanguage: 'Выберите язык',
  langHint: 'для навигации, Enter для выбора',
  navigate: 'навигация',
  switchSection: 'переключить секцию',
  themePreview: 'Предпросмотр',
  next: 'далее',
  noApiKey: '⚠ API-ключ не настроен',
  setupApiKey: 'Настройка API-ключа',
  enterApiKey: 'Введите ваш DeepSeek API-ключ:',
  apiKeyHint: 'Получить ключ: https://platform.deepseek.com/api_keys',
  typeKeyAndEnter: 'Напечатайте ключ в поле ниже и нажмите Enter',
  apiKeyPlaceholder: 'sk-...',
  apiKeySet: '✓ API-ключ сохранён! Теперь вы можете использовать DeepSeek Code.',
  apiKeyInvalid: '✗ Неверный формат ключа. Ключ должен начинаться с "sk-".',
  setupSettings: 'Настройки',
  selectTheme: 'Выберите тему:',
  selectMode: 'Выберите режим разрешений:',
  modePlan: 'Plan — просмотр всех действий перед выполнением',
  modeDefault: 'Default — авто с подтверждением',
  modeAutoEdit: 'Auto-Edit — авто-правки с подтверждением',
  modeYolo: 'YOLO — полностью авто, без подтверждений',
  finishSetup: 'для завершения настройки',
  ready: 'Готов',
  processing: 'Обработка...',
  error: 'Ошибка',

  you: 'Вы',
  assistant: 'DeepSeek',
  system: 'Система',
  deepseek: 'DeepSeek',

  helpCommands: 'Доступные команды',
  helpMemory: 'Команды памяти',
  helpAdvanced: 'Расширенные команды',
  helpReview: 'Команды ревью',
  helpSettings: 'Настройки',

  memorySaved: 'Сохранено в память',
  memoryRemoved: 'Удалено из памяти',
  memoryEmpty: 'Память пуста',
  memoryList: 'Сохранённые воспоминания',

  checkpointCreated: 'Сохранён чекпоинт',
  checkpointNone: 'Чекпоинты не найдены',
  checkpointRestored: 'Чекпоинт восстановлен',
  checkpointFailed: 'Не удалось восстановить чекпоинт',

  usage: 'Использование',
  yes: 'Да',
  no: 'Нет',
  cancel: 'Отмена',
  confirm: 'Подтвердить',

  themeDefault: 'Тёмная тема по умолчанию',
  themeLight: 'Светлая тема',
  themeDracula: 'Тема Дракулы',
  themeNord: 'Тема Nord',
  themeSolarized: 'Тема Solarized',
  themeMatrix: 'Матрица — зелёный дождь из кода',

  agentEmptyResponse: 'Модель вернула пустой ответ. Попробуйте ещё раз.',
}

const ZH: LocaleStrings = {
  welcome: 'DeepSeek Code',
  welcomeSubtitle: 'AI 驱动的命令行开发代理',
  welcomeHint: 'Tab: 切换审批模式 | /help: 显示命令',
  selectLanguage: '选择语言',
  langHint: '导航，Enter 确认',
  navigate: '导航',
  switchSection: '切换区域',
  themePreview: '预览',
  next: '下一步',
  noApiKey: '⚠ 未配置 API 密钥',
  setupApiKey: 'API 密钥设置',
  enterApiKey: '输入您的 DeepSeek API 密钥:',
  apiKeyHint: '获取密钥: https://platform.deepseek.com/api_keys',
  typeKeyAndEnter: '在下方输入框中输入密钥并按 Enter',
  apiKeyPlaceholder: 'sk-...',
  apiKeySet: '✓ API 密钥已保存！您现在可以使用 DeepSeek Code。',
  apiKeyInvalid: '✗ 密钥格式无效。密钥应以 "sk-" 开头。',
  setupSettings: '设置',
  selectTheme: '选择主题:',
  selectMode: '选择审批模式:',
  modePlan: 'Plan — 执行前审查所有操作',
  modeDefault: 'Default — 自动执行，用户确认',
  modeAutoEdit: 'Auto-Edit — 自动编辑，需要批准',
  modeYolo: 'YOLO — 完全自动，无需确认',
  finishSetup: '完成设置',
  ready: '就绪',
  processing: '处理中...',
  error: '错误',

  you: '你',
  assistant: 'DeepSeek',
  system: '系统',
  deepseek: 'DeepSeek',

  helpCommands: '可用命令',
  helpMemory: '记忆命令',
  helpAdvanced: '高级命令',
  helpReview: '审查命令',
  helpSettings: '设置',

  memorySaved: '已保存到记忆',
  memoryRemoved: '已删除记忆',
  memoryEmpty: '暂无记忆',
  memoryList: '已保存的记忆',

  checkpointCreated: '已创建检查点',
  checkpointNone: '未找到检查点',
  checkpointRestored: '已恢复检查点',
  checkpointFailed: '无法恢复检查点',

  usage: '用法',
  yes: '是',
  no: '否',
  cancel: '取消',
  confirm: '确认',

  themeDefault: '默认深色主题',
  themeLight: '亮色主题',
  themeDracula: '德古拉主题',
  themeNord: 'Nord 主题',
  themeSolarized: 'Solarized 深色主题',
  themeMatrix: '黑客帝国 — 绿色代码雨',

  agentEmptyResponse: '模型返回了空响应，请重试。',
}

const LOCALES: Record<Locale, LocaleStrings> = {
  en: EN,
  ru: RU,
  zh: ZH,
}

export class I18n {
  private locale: Locale = 'en'
  private strings: LocaleStrings = EN

  setLocale (locale: Locale): void {
    this.locale = locale
    this.strings = LOCALES[locale] ?? EN
  }

  getLocale (): Locale {
    return this.locale
  }

  t (key: keyof LocaleStrings): string {
    return this.strings[key] ?? EN[key] ?? key
  }

  /**
   * Auto-detect locale from system settings
   */
  detectLocale (): Locale {
    const lang = process.env.LANG ?? process.env.LC_ALL ?? 'en_US'
    if (lang.startsWith('ru')) return 'ru'
    if (lang.startsWith('zh')) return 'zh'
    return 'en'
  }

  listLocales (): Array<{ code: Locale; name: string }> {
    return [
      { code: 'en', name: 'English' },
      { code: 'ru', name: 'Русский' },
      { code: 'zh', name: '中文' },
    ]
  }
}

// Singleton
export const i18n = new I18n()
