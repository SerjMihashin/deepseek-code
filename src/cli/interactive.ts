import { render } from 'ink';
import React from 'react';
import { App } from '../ui/app.js';
import { loadConfig } from '../config/loader.js';
import { themeManager } from '../core/themes.js';
import { i18n } from '../core/i18n.js';

export interface SessionOptions {
  query?: string;
  prompt?: string;
  promptInteractive?: string;
  model?: string;
  yolo?: boolean;
  approvalMode?: string;
  debug?: boolean;
  continue_?: boolean;
  resume?: string;
  json?: boolean;
  headless?: boolean;
  theme?: string;
  lang?: string;
}

export async function startInteractiveSession(options: SessionOptions): Promise<void> {
  const config = await loadConfig();

  // Apply CLI theme/lang overrides
  if (options.theme) {
    themeManager.setTheme(options.theme);
  }
  if (options.lang) {
    i18n.setLocale(options.lang as 'en' | 'ru' | 'zh');
  }

  const { waitUntilExit } = render(
    React.createElement(App, {
      config,
      options,
    }),
  );

  await waitUntilExit();
}
