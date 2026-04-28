#!/usr/bin/env node

import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { CliOptions } from './interactive.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
const pkgPath = join(__dirname, '..', '..', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }

const program = new Command()

program
  .name('deepseek-code')
  .description('AI-powered CLI agent for software development')
  .version(pkg.version)
  .argument('[query...]', 'Optional query to run in non-interactive mode')
  .option('-p, --prompt <text>', 'Run a single prompt and exit (non-interactive)')
  .option('-i, --prompt-interactive <text>', 'Run a prompt then continue in interactive mode')
  .option('-m, --model <model>', 'Model to use (e.g. deepseek-chat)')
  .option('-t, --turbo', 'Enable Turbo mode (auto-approve all actions)')
  .option('--approval-mode <mode>', 'Set approval mode: plan, default, auto-edit, turbo')
  .option('--debug', 'Enable debug logging')
  .option('-c, --continue', 'Continue last session')
  .option('-r, --resume [sessionId]', 'Resume a specific session')
  .option('--json', 'JSON output mode (for CI/CD integration)')
  .option('--headless', 'Headless mode (no TUI, pipe-friendly)')
  .option('--theme <name>', 'Set color theme')
  .option('--lang <code>', 'Set language (en, ru, zh)')
  .helpOption(false) // Disable built-in --help, we handle it ourselves

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals()
  if (opts.debug) {
    process.env.DEEPSEEK_CODE_DEBUG = '1'
  }
})

program.action(async (query: string[] | undefined, opts: Record<string, unknown>) => {
  const options: CliOptions = {
    query: query?.join(' ') ?? undefined,
    prompt: opts.prompt as string | undefined,
    promptInteractive: opts.promptInteractive as string | undefined,
    model: opts.model as string | undefined,
    turbo: !!opts.turbo,
    approvalMode: opts.approvalMode as string | undefined,
    debug: !!opts.debug,
    continue_: !!opts.continue,
    resume: opts.resume as string | undefined,
    json: !!opts.json,
    headless: !!opts.headless,
    theme: opts.theme as string | undefined,
    lang: opts.lang as string | undefined,
  }

  // Headless/JSON mode for CI/CD
  if (options.headless || options.json) {
    const { headlessMode } = await import('./headless.js')
    const prompt = options.prompt ?? options.query
    if (prompt) {
      const result = await headlessMode(prompt, options)
      if (options.json) {
        console.log(JSON.stringify(result))
      } else {
        console.log(result.response)
      }
      process.exit(result.exitCode ?? 0)
    }
    return
  }

  const { startInteractiveSession } = await import('./interactive.js')
  await startInteractiveSession(options)
})

export async function run (args: string[]): Promise<void> {
  // Handle --help and --version before loading Ink
  if (args.includes('--help') || args.includes('-h')) {
    program.outputHelp()
    return
  }
  if (args.includes('--version') || args.includes('-V')) {
    console.log(pkg.version)
    return
  }
  // Handle --help passed via commander's parse
  // Commander may intercept --help before action, but we also handle it here
  await program.parseAsync(args, { from: 'user' })
}

// Always run when this module is loaded
run(process.argv).catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
