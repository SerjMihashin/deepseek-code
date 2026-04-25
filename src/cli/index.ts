#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startInteractiveSession } from './interactive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const pkgPath = join(__dirname, '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };

const program = new Command();

program
  .name('deepseek-code')
  .description('AI-powered CLI agent for software development')
  .version(pkg.version)
  .argument('[query...]', 'Optional query to run in non-interactive mode')
  .option('-p, --prompt <text>', 'Run a single prompt and exit (non-interactive)')
  .option('-i, --prompt-interactive <text>', 'Run a prompt then continue in interactive mode')
  .option('-m, --model <model>', 'Model to use (e.g. deepseek-chat)')
  .option('-y, --yolo', 'Enable YOLO mode (auto-approve all actions)')
  .option('--approval-mode <mode>', 'Set approval mode: plan, default, auto-edit, yolo')
  .option('--debug', 'Enable debug logging')
  .option('-c, --continue', 'Continue last session')
  .option('-r, --resume [sessionId]', 'Resume a specific session')
  .option('-v, --version', 'Show version')
  .option('-h, --help', 'Show help');

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.debug) {
    process.env.DEEPSEEK_CODE_DEBUG = '1';
  }
});

program.action(async (query: string[] | undefined, opts: Record<string, unknown>) => {
  const options = {
    query: query?.join(' ') ?? undefined,
    prompt: opts.prompt as string | undefined,
    promptInteractive: opts.promptInteractive as string | undefined,
    model: opts.model as string | undefined,
    yolo: !!opts.yolo,
    approvalMode: opts.approvalMode as string | undefined,
    debug: !!opts.debug,
    continue_: !!opts.continue,
    resume: opts.resume as string | undefined,
  };

  await startInteractiveSession(options);
});

export async function run(args: string[]): Promise<void> {
  await program.parseAsync(args, { from: 'user' });
}

// Allow running directly
const isMainModule = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].endsWith('cli.js') ||
  process.argv[1].endsWith('deepseek-code')
);

if (isMainModule) {
  run(process.argv).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
