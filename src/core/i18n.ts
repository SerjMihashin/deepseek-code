import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Locale = 'en' | 'ru' | 'zh';

interface LocaleStrings {
  // Welcome / Status
  welcome: string;
  welcomeSubtitle: string;
  welcomeHint: string;
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
}

const EN: LocaleStrings = {
  welcome: 'DeepSeek Code',
  welcomeSubtitle: 'AI-powered CLI agent for software development',
  welcomeHint: 'Tab: cycle approval mode | /help: show commands',
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
};

const RU: LocaleStrings = {
  welcome: 'DeepSeek Code',
  welcomeSubtitle: 'AI-агент для разработки в терминале',
  welcomeHint: 'Tab: режимы разрешений | /help: команды',
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
};

const ZH: LocaleStrings = {
  welcome: 'DeepSeek Code',
  welcomeSubtitle: 'AI 驱动的命令行开发代理',
  welcomeHint: 'Tab: 切换审批模式 | /help: 显示命令',
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
};

const LOCALES: Record<Locale, LocaleStrings> = {
  en: EN,
  ru: RU,
  zh: ZH,
};

export class I18n {
  private locale: Locale = 'en';
  private strings: LocaleStrings = EN;

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.strings = LOCALES[locale] ?? EN;
  }

  getLocale(): Locale {
    return this.locale;
  }

  t(key: keyof LocaleStrings): string {
    return this.strings[key] ?? EN[key] ?? key;
  }

  /**
   * Auto-detect locale from system settings
   */
  detectLocale(): Locale {
    const lang = process.env.LANG ?? process.env.LC_ALL ?? 'en_US';
    if (lang.startsWith('ru')) return 'ru';
    if (lang.startsWith('zh')) return 'zh';
    return 'en';
  }

  listLocales(): Array<{ code: Locale; name: string }> {
    return [
      { code: 'en', name: 'English' },
      { code: 'ru', name: 'Русский' },
      { code: 'zh', name: '中文' },
    ];
  }
}

// Singleton
export const i18n = new I18n();
