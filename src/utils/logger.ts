const DEBUG_ENABLED = () => process.env.DEEPSEEK_CODE_DEBUG === '1';

export function debug(...args: unknown[]): void {
  if (DEBUG_ENABLED()) {
    console.error('[DEBUG]', ...args);
  }
}

export function log(...args: unknown[]): void {
  console.error(...args);
}

export function error(...args: unknown[]): void {
  console.error('[ERROR]', ...args);
}
