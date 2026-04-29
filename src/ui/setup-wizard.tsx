import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js'
import { DEEPSEEK_MODELS } from '../config/defaults.js'
import { saveConfig } from '../config/loader.js'
import { DeepSeekAPI } from '../api/index.js'
import { i18n, type Locale } from '../core/i18n.js'
import { themeManager } from '../core/themes.js'
import type { ChatMessage } from '../api/index.js'
import { MatrixRain } from './matrix-rain.js'

// Logo — DEEPSEEK in ASCII art
const D = [
  '██████╗ ',
  '██╔══██╗',
  '██║  ██║',
  '██║  ██║',
  '██████╔╝',
  '╚═════╝ ',
]
const E = [
  '███████╗',
  '██╔════╝',
  '█████╗  ',
  '██╔══╝  ',
  '███████╗',
  '╚══════╝',
]
const P = [
  '██████╗ ',
  '██╔══██╗',
  '██████╔╝',
  '██╔═══╝ ',
  '██║     ',
  '╚═╝     ',
]
const S = [
  '███████╗',
  '██╔════╝',
  '███████╗',
  '╚════██║',
  '███████║',
  '╚══════╝',
]
const K = [
  '██╗  ██╗',
  '██║ ██╔╝',
  '█████╔╝ ',
  '██╔═██╗ ',
  '██║  ██╗',
  '╚═╝  ╚═╝',
]

const logoLines = [0, 1, 2, 3, 4, 5].map(i =>
  D[i] + E[i] + E[i] + P[i] + S[i] + E[i] + E[i] + K[i]
)

export function Logo () {
  return (
    <Box flexDirection='column' alignItems='center'>
      {logoLines.map((line, i) => (
        <Text key={i} bold color='blue'>{line}</Text>
      ))}
    </Box>
  )
}

// ─── Setup Steps ─────────────────────────────────────────────────────────────

interface LangStepProps {
  cursor: number;
  langOptions: Locale[];
  langLabels: Record<string, string>;
}

function LangStep ({ cursor, langOptions, langLabels }: LangStepProps) {
  return (
    <Box flexDirection='column' marginLeft={2}>
      <Text bold>{i18n.t('selectLanguage')}</Text>
      {langOptions.map((lang, i) => (
        <Text key={lang} color={cursor === i ? 'cyan' : undefined}>
          {cursor === i ? '> ' : '  '}{langLabels[lang] ?? lang}
        </Text>
      ))}
    </Box>
  )
}

interface ApiKeyStepProps {
  apiKeyError: string;
}

function ApiKeyStep ({ apiKeyError }: ApiKeyStepProps) {
  const colors = themeManager.getColors()
  return (
    <Box flexDirection='column' marginLeft={2}>
      <Text bold>{i18n.t('setupApiKey')}</Text>
      <Text color={colors.textMuted}>{i18n.t('apiKeyHint')}</Text>
      {apiKeyError && <Text color={colors.error}>{apiKeyError}</Text>}
    </Box>
  )
}

interface ThemeStepProps {
  cursor: number;
}

function ThemeStep ({ cursor }: ThemeStepProps) {
  const colors = themeManager.getColors()
  const themes = themeManager.listThemes()
  return (
    <Box flexDirection='column'>
      <MatrixRain />
      <Box flexDirection='column' marginLeft={2} marginTop={1}>
        <Text bold>{i18n.t('selectTheme')}</Text>
        {themes.map((theme, i) => (
          <Text key={theme.name} color={cursor === i ? colors.primary : colors.textMuted}>
            {cursor === i ? '> ' : '  '}{theme.name}{theme.description ? `  — ${theme.description}` : ''}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

interface ModelStepProps {
  cursor: number;
}

function ModelStep ({ cursor }: ModelStepProps) {
  const colors = themeManager.getColors()
  return (
    <Box flexDirection='column' marginLeft={2}>
      <Text bold>Select model</Text>
      {DEEPSEEK_MODELS.map((model, i) => (
        <Box key={model.id} flexDirection='column'>
          <Text color={cursor === i ? colors.primary : colors.textMuted}>
            {cursor === i ? '> ' : '  '}<Text bold={cursor === i}>{model.label}</Text>
            <Text dimColor>  {model.id}</Text>
          </Text>
          <Text color={cursor === i ? colors.textMuted : colors.textMuted} dimColor>
            {'    '}{model.description}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

interface ModeStepProps {
  cursor: number;
  modeOptions: ApprovalMode[];
}

function ModeStep ({ cursor, modeOptions }: ModeStepProps) {
  return (
    <Box flexDirection='column' marginLeft={2}>
      <Text bold>{i18n.t('selectMode')}</Text>
      {modeOptions.map((mode, i) => (
        <Text key={mode} color={cursor === i ? 'cyan' : undefined}>
          {cursor === i ? '> ' : '  '}{mode}
        </Text>
      ))}
    </Box>
  )
}

// ─── Setup Wizard Hook ───────────────────────────────────────────────────────

export type SetupStep = 'lang' | 'apikey' | 'theme' | 'model' | 'mode' | 'done'

export interface SetupWizardState {
  step: SetupStep;
  apiKeyError: string;
  langCursor: number;
  themeCursor: number;
  modelCursor: number;
  modeCursor: number;
  langOptions: Locale[];
  modeOptions: ApprovalMode[];
}

export interface SetupWizardActions {
  handleApiKeySubmit: (key: string) => Promise<void>;
  finishSetup: () => Promise<void>;
  setLangCursor: (c: number) => void;
  setThemeCursor: (c: number) => void;
  setModelCursor: (c: number) => void;
  setModeCursor: (c: number) => void;
  setStep: (s: SetupStep) => void;
  setApiKeyError: (e: string) => void;
}

export function useSetupWizard (
  config: DeepSeekConfig,
  initialStep: SetupStep = 'lang',
  onSetupComplete: (updatedConfig: DeepSeekConfig) => void,
  onMessage: (msg: ChatMessage) => void
): [SetupWizardState, SetupWizardActions] {
  const [step, setStep] = useState<SetupStep>(initialStep)
  const [apiKeyError, setApiKeyError] = useState('')
  const [langCursor, setLangCursor] = useState(0)
  const [themeCursor, setThemeCursor] = useState(0)
  const [modelCursor, setModelCursor] = useState(0)
  const [modeCursor, setModeCursor] = useState(0)

  const langOptions: Locale[] = ['en', 'ru', 'zh']
  const modeOptions: ApprovalMode[] = ['plan', 'default', 'auto-edit', 'turbo']

  const handleApiKeySubmit = useCallback(async (key: string) => {
    if (!key || key.trim().length === 0) {
      setApiKeyError('API key cannot be empty')
      return
    }
    const testApi = new DeepSeekAPI({ ...config, apiKey: key })
    const result = await testApi.validateKey()
    if (!result.valid) {
      setApiKeyError(result.error || 'Invalid API key')
      return
    }
    await saveConfig({ ...config, apiKey: key })
    setApiKeyError('')
    onMessage({
      role: 'assistant',
      content: '[warn] **Безопасность:** API-ключ хранится локально в `~/.deepseek-code/config.json`. Безопаснее использовать переменную окружения `DEEPSEEK_API_KEY`.',
    })
    setStep('theme')
  }, [config, onMessage])

  const finishSetup = useCallback(async () => {
    const themeName = themeManager.listThemes()[themeCursor]?.name ?? 'default-dark'
    const modelId = DEEPSEEK_MODELS[modelCursor]?.id ?? 'deepseek-chat'
    const mode = modeOptions[modeCursor] ?? 'default'
    await saveConfig({
      ...config,
      language: langOptions[langCursor] ?? 'en',
      theme: themeName,
      model: modelId,
      approvalMode: mode,
    })
    i18n.setLocale(langOptions[langCursor] ?? 'en')
    themeManager.setTheme(themeName)
    onSetupComplete({
      ...config,
      language: langOptions[langCursor] ?? 'en',
      theme: themeName,
      model: modelId,
      approvalMode: mode,
    })
    setStep('done')
  }, [config, langCursor, themeCursor, modelCursor, modeCursor, langOptions, modeOptions, onSetupComplete])

  const state: SetupWizardState = {
    step,
    apiKeyError,
    langCursor,
    themeCursor,
    modelCursor,
    modeCursor,
    langOptions,
    modeOptions,
  }

  const actions: SetupWizardActions = {
    handleApiKeySubmit,
    finishSetup,
    setLangCursor,
    setThemeCursor,
    setModelCursor,
    setModeCursor,
    setStep,
    setApiKeyError,
  }

  return [state, actions]
}

// ─── Setup Wizard Render ─────────────────────────────────────────────────────

export function SetupWizard ({ state }: { state: SetupWizardState }) {
  const { step, apiKeyError, langCursor, themeCursor, modelCursor, modeCursor, langOptions, modeOptions } = state

  const langLabels: Record<string, string> = {
    en: 'English',
    ru: 'Русский',
    zh: '中文',
  }

  return (
    <Box flexDirection='column' flexGrow={1}>
      <Logo />
      <Box marginTop={1}>
        {step === 'lang'
          ? <LangStep cursor={langCursor} langOptions={langOptions} langLabels={langLabels} />
          : step === 'apikey'
            ? <ApiKeyStep apiKeyError={apiKeyError} />
            : step === 'theme'
              ? <ThemeStep cursor={themeCursor} />
              : step === 'model'
                ? <ModelStep cursor={modelCursor} />
                : step === 'mode'
                  ? <ModeStep cursor={modeCursor} modeOptions={modeOptions} />
                  : null}
      </Box>
    </Box>
  )
}
