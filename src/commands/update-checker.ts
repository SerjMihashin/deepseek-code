import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get } from 'node:https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getCurrentVersion (): string | null {
  try {
    const pkgPath = resolve(__dirname, '../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.version ?? null
  } catch {
    return null
  }
}

export function semverCompare (a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1
  }
  return 0
}

export interface UpdateCheckResult {
  current: string
  latest: string
  hasUpdate: boolean
}

/**
 * Check npm registry for the latest version of @serjm/deepseek-code.
 * Returns null on any error (network, parse, timeout).
 */
export async function checkLatestVersion (): Promise<UpdateCheckResult | null> {
  const current = getCurrentVersion()
  if (!current) return null

  try {
    const latest = await new Promise<string>((resolve, reject) => {
      const url = 'https://registry.npmjs.org/@serjm%2Fdeepseek-code/latest'
      const req = get(url, { timeout: 10000 }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve(json.version)
          } catch {
            reject(new Error('Invalid response from registry'))
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timed out'))
      })
    })

    const cmp = semverCompare(latest, current)
    return {
      current,
      latest,
      hasUpdate: cmp > 0,
    }
  } catch {
    return null
  }
}
