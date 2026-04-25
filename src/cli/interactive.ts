import { render } from 'ink';
import React from 'react';
import { App } from '../ui/app.js';
import { loadConfig } from '../config/loader.js';

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
}

export async function startInteractiveSession(options: SessionOptions): Promise<void> {
  const config = await loadConfig();

  const { waitUntilExit } = render(
    React.createElement(App, {
      config,
      options,
    }),
  );

  await waitUntilExit();
}
