import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ExtensionManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  author?: string;
  license?: string;
  /** Tools this extension provides */
  provides?: string[];
  /** Hooks this extension registers */
  hooks?: string[];
  /** Commands this extension adds */
  commands?: string[];
  /** Dependencies on other extensions */
  dependencies?: string[];
}

export interface ExtensionAPI {
  /** Register a tool */
  registerTool: (name: string, handler: (...args: unknown[]) => unknown) => void;
  /** Register a command */
  registerCommand: (name: string, handler: (...args: string[]) => void) => void;
  /** Get config value */
  getConfig: (key: string) => unknown;
  /** Log to console */
  log: (...args: unknown[]) => void;
  /** Access core services */
  services: {
    memory: typeof import('./memory.js');
    mcp: typeof import('./mcp.js').mcpManager;
    hooks: typeof import('./hooks.js').hooksManager;
    skills: typeof import('./skills.js').skillsManager;
  };
}

/**
 * Simple extension/plugin system.
 * Extensions are loaded from:
 * 1. Project: .deepseek-code/extensions/<name>/
 * 2. User: ~/.deepseek-code/extensions/<name>/
 * 3. Bundled: src/extensions/<name>/
 *
 * Each extension has a package.json manifest and a main JS/TS file.
 */
export class ExtensionManager {
  private extensions: Map<string, ExtensionManifest> = new Map()
  private loaded = new Set<string>()

  async discover (): Promise<ExtensionManifest[]> {
    const all: ExtensionManifest[] = []
    const locations = [
      join(process.cwd(), '.deepseek-code', 'extensions'),
      join(homedir(), '.deepseek-code', 'extensions'),
    ]

    for (const baseDir of locations) {
      if (!existsSync(baseDir)) continue
      try {
        const entries = await readdir(baseDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const manifestPath = join(baseDir, entry.name, 'package.json')
            if (existsSync(manifestPath)) {
              try {
                const content = await readFile(manifestPath, 'utf-8')
                const manifest = JSON.parse(content) as ExtensionManifest
                manifest.name = entry.name
                this.extensions.set(entry.name, manifest)
                all.push(manifest)
              } catch { /* ignore */ }
            }
          }
        }
      } catch { /* ignore */ }
    }

    return all
  }

  async loadExtension (name: string): Promise<boolean> {
    if (this.loaded.has(name)) return true

    const manifest = this.extensions.get(name)
    if (!manifest) return false

    // Check dependencies
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (!this.loaded.has(dep)) {
          const loaded = await this.loadExtension(dep)
          if (!loaded) {
            console.error(`Extension "${name}" depends on "${dep}" which could not be loaded`)
            return false
          }
        }
      }
    }

    this.loaded.add(name)
    return true
  }

  async loadAll (): Promise<void> {
    await this.discover()
    for (const name of this.extensions.keys()) {
      await this.loadExtension(name)
    }
  }

  getExtension (name: string): ExtensionManifest | undefined {
    return this.extensions.get(name)
  }

  listExtensions (): ExtensionManifest[] {
    return Array.from(this.extensions.values())
  }
}

// Singleton
export const extensionManager = new ExtensionManager()
