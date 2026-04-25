import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  muted: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  userBubble: string;
  assistantBubble: string;
  systemBubble: string;
}

export interface Theme {
  name: string;
  description: string;
  colors: ThemeColors;
  /** Ink-compatible color mode: 'ansi' | 'rgb' */
  colorMode: 'ansi' | 'rgb';
}

const DEFAULT_THEME: Theme = {
  name: 'default',
  description: 'Default dark theme',
  colorMode: 'ansi',
  colors: {
    primary: 'green',
    secondary: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'cyan',
    muted: 'gray',
    background: 'black',
    surface: '#1a1a2e',
    border: 'gray',
    text: 'white',
    textMuted: 'gray',
    userBubble: 'green',
    assistantBubble: 'blue',
    systemBubble: 'yellow',
  },
}

const LIGHT_THEME: Theme = {
  name: 'light',
  description: 'Light theme',
  colorMode: 'ansi',
  colors: {
    primary: '#0066cc',
    secondary: '#6c63ff',
    success: '#28a745',
    warning: '#ffc107',
    error: '#dc3545',
    info: '#17a2b8',
    muted: '#6c757d',
    background: 'white',
    surface: '#f8f9fa',
    border: '#dee2e6',
    text: '#212529',
    textMuted: '#6c757d',
    userBubble: '#0066cc',
    assistantBubble: '#6c63ff',
    systemBubble: '#ffc107',
  },
}

const DRACULA_THEME: Theme = {
  name: 'dracula',
  description: 'Dracula theme',
  colorMode: 'rgb',
  colors: {
    primary: '#bd93f9',
    secondary: '#ff79c6',
    success: '#50fa7b',
    warning: '#f1fa8c',
    error: '#ff5555',
    info: '#8be9fd',
    muted: '#6272a4',
    background: '#282a36',
    surface: '#44475a',
    border: '#6272a4',
    text: '#f8f8f2',
    textMuted: '#6272a4',
    userBubble: '#bd93f9',
    assistantBubble: '#ff79c6',
    systemBubble: '#f1fa8c',
  },
}

const NORD_THEME: Theme = {
  name: 'nord',
  description: 'Nord theme',
  colorMode: 'ansi',
  colors: {
    primary: '#88c0d0',
    secondary: '#81a1c1',
    success: '#a3be8c',
    warning: '#ebcb8b',
    error: '#bf616a',
    info: '#b48ead',
    muted: '#4c566a',
    background: '#2e3440',
    surface: '#3b4252',
    border: '#4c566a',
    text: '#eceff4',
    textMuted: '#4c566a',
    userBubble: '#88c0d0',
    assistantBubble: '#81a1c1',
    systemBubble: '#ebcb8b',
  },
}

const SOLARIZED_THEME: Theme = {
  name: 'solarized',
  description: 'Solarized dark theme',
  colorMode: 'ansi',
  colors: {
    primary: '#268bd2',
    secondary: '#6c71c4',
    success: '#859900',
    warning: '#b58900',
    error: '#dc322f',
    info: '#2aa198',
    muted: '#657b83',
    background: '#002b36',
    surface: '#073642',
    border: '#586e75',
    text: '#839496',
    textMuted: '#657b83',
    userBubble: '#268bd2',
    assistantBubble: '#6c71c4',
    systemBubble: '#b58900',
  },
}

const BUILT_IN_THEMES: Record<string, Theme> = {
  default: DEFAULT_THEME,
  light: LIGHT_THEME,
  dracula: DRACULA_THEME,
  nord: NORD_THEME,
  solarized: SOLARIZED_THEME,
}

export class ThemeManager {
  private currentTheme: Theme = DEFAULT_THEME
  private customThemes: Map<string, Theme> = new Map()

  get theme (): Theme {
    return this.currentTheme
  }

  setTheme (name: string): boolean {
    if (BUILT_IN_THEMES[name]) {
      this.currentTheme = BUILT_IN_THEMES[name]
      return true
    }
    if (this.customThemes.has(name)) {
      this.currentTheme = this.customThemes.get(name)!
      return true
    }
    return false
  }

  listThemes (): Theme[] {
    return [...Object.values(BUILT_IN_THEMES), ...Array.from(this.customThemes.values())]
  }

  async loadCustomThemes (): Promise<void> {
    const themesDir = join(homedir(), '.deepseek-code', 'themes')
    if (!existsSync(themesDir)) return

    try {
      const files = await (await import('node:fs/promises')).readdir(themesDir)
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const content = await readFile(join(themesDir, file), 'utf-8')
          const theme = JSON.parse(content) as Theme
          this.customThemes.set(theme.name, theme)
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  getColors (): ThemeColors {
    return this.currentTheme.colors
  }
}

// Singleton
export const themeManager = new ThemeManager()
