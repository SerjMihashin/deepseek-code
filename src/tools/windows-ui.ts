import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import type { Tool, ToolResult } from './types.js'

/**
 * `windows_ui` — Windows desktop automation through UI Automation (UIA).
 *
 * The model has no vision, but UIA exposes every accessible desktop app
 * (Win32/WPF/WinForms/UWP — Explorer, Photoshop, VS Code, ...) as a TEXT tree
 * of named elements with invokable patterns. That makes desktop apps operable
 * the same way the DOM makes the browser operable for us.
 *
 * Each action runs a self-contained Windows PowerShell 5.1 script that loads
 * the UIAutomationClient assemblies. No extra dependencies are required.
 */

const MAX_TREE_NODES = 400
const DEFAULT_TIMEOUT_MS = 45_000

/** PowerShell single-quoted string escaping. */
function psq (value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Escape plain text for SendKeys (its specials: +^%~(){}[]). */
export function escapeSendKeysText (value: string): string {
  return value.replace(/([+^%~(){}[\]])/g, '{$1}')
}

const UIA_PRELUDE = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

function Get-DscControlType($el) {
  $el.Current.ControlType.ProgrammaticName -replace '^ControlType\\.', ''
}

function Get-DscWindows {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
}

function Find-DscWindow([string]$Title) {
  foreach ($w in Get-DscWindows) {
    if ($w.Current.Name -like ('*' + $Title + '*')) { return $w }
  }
  return $null
}

function Find-DscElements($win, [string]$Name, [string]$Type, [int]$Max = 2000) {
  $list = New-Object System.Collections.Generic.List[object]
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) {
    if ($list.Count -ge $Max) { break }
    $c = $e.Current
    $t = Get-DscControlType $e
    if ($Type -and ($t -ne $Type)) { continue }
    if ($Name -and ($c.Name -notlike ('*' + $Name + '*')) -and ($c.AutomationId -notlike ('*' + $Name + '*'))) { continue }
    [void]$list.Add($e)
  }
  return ,$list
}

function Format-DscElement($el, [int]$Index = -1) {
  $c = $el.Current
  $t = Get-DscControlType $el
  $name = $c.Name
  if ($name -and $name.Length -gt 80) { $name = $name.Substring(0, 77) + '...' }
  $extra = ''
  if ($c.AutomationId) { $extra += (' id=' + $c.AutomationId) }
  if (-not $c.IsEnabled) { $extra += ' [disabled]' }
  if ($c.IsOffscreen) { $extra += ' [offscreen]' }
  $prefix = ''
  if ($Index -ge 0) { $prefix = ('[' + $Index + '] ') }
  return ($prefix + $t + ' "' + $name + '"' + $extra)
}
`

function buildWindowLookup (windowTitle: string): string {
  return `
$win = Find-DscWindow ${psq(windowTitle)}
if (-not $win) {
  Write-Output ('ERROR: no top-level window matches ' + ${psq(windowTitle)} + '. Use action=list_windows to see what is open.')
  exit 1
}
`
}

function buildElementLookup (name: string, controlType: string, index: number): string {
  return `
$els = Find-DscElements $win ${psq(name)} ${psq(controlType)}
if ($els.Count -eq 0) {
  Write-Output ('ERROR: no element matched name~"' + ${psq(name)} + '"' + $(if (${psq(controlType)}) { ' type=' + ${psq(controlType)} } else { '' }) + '. Use action=tree or action=find to inspect the window.')
  exit 1
}
if (${index} -ge $els.Count) {
  Write-Output ('ERROR: index ${index} out of range — only ' + $els.Count + ' elements matched.')
  exit 1
}
$el = $els[${index}]
`
}

function runPowerShell (script: string, timeoutMs: number, signal?: AbortSignal): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )
    let output = ''
    let settled = false
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve({ code, output })
    }
    const onAbort = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { child.kill() } catch { /* already gone */ }
      reject(new Error('windows_ui: aborted'))
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* already gone */ }
      output += `\n[windows_ui timed out after ${timeoutMs}ms]`
      finish(1)
    }, timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr.on('data', (d: Buffer) => { output += d.toString() })
    child.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => finish(code))
  })
}

function buildActionScript (args: Record<string, unknown>): string | { error: string } {
  const action = String(args.action ?? '')
  const windowTitle = typeof args.window === 'string' ? args.window : ''
  const name = typeof args.name === 'string' ? args.name : ''
  const controlType = typeof args.control_type === 'string' ? args.control_type : ''
  const value = typeof args.value === 'string' ? args.value : ''
  const depth = typeof args.depth === 'number' ? Math.min(Math.max(Math.floor(args.depth), 1), 10) : 4
  const index = typeof args.index === 'number' ? Math.max(Math.floor(args.index), 0) : 0

  const KNOWN_ACTIONS = ['list_windows', 'tree', 'find', 'invoke', 'set_value', 'send_keys', 'focus']
  if (!KNOWN_ACTIONS.includes(action)) {
    return { error: `windows_ui: unknown action "${action}". Valid: ${KNOWN_ACTIONS.join(', ')}.` }
  }
  if (action !== 'list_windows' && !windowTitle) {
    return { error: `windows_ui: "window" (title substring) is required for action "${action}".` }
  }

  switch (action) {
    case 'list_windows':
      return `${UIA_PRELUDE}
foreach ($w in Get-DscWindows) {
  $c = $w.Current
  if ($c.Name) {
    Write-Output ('"' + $c.Name + '" | pid=' + $c.ProcessId + ' | ' + (Get-DscControlType $w))
  }
}
Write-Output '(pass a title substring from this list as "window" for other actions)'
`
    case 'tree':
      return `${UIA_PRELUDE}${buildWindowLookup(windowTitle)}
$script:nodeCount = 0
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
function Show-DscTree($el, [string]$indent, [int]$remaining) {
  if ($remaining -lt 0 -or $script:nodeCount -ge ${MAX_TREE_NODES}) { return }
  $script:nodeCount++
  Write-Output ($indent + (Format-DscElement $el))
  if ($remaining -eq 0) { return }
  $child = $walker.GetFirstChild($el)
  while ($null -ne $child) {
    Show-DscTree $child ($indent + '  ') ($remaining - 1)
    if ($script:nodeCount -ge ${MAX_TREE_NODES}) { return }
    $child = $walker.GetNextSibling($child)
  }
}
Show-DscTree $win '' ${depth}
if ($script:nodeCount -ge ${MAX_TREE_NODES}) { Write-Output '... [tree truncated at ${MAX_TREE_NODES} nodes — lower depth or use action=find]' }
`
    case 'find':
      return `${UIA_PRELUDE}${buildWindowLookup(windowTitle)}
$els = Find-DscElements $win ${psq(name)} ${psq(controlType)}
if ($els.Count -eq 0) { Write-Output 'No elements matched.'; exit 0 }
$i = 0
foreach ($e in $els) {
  if ($i -ge 30) { Write-Output ('... and ' + ($els.Count - 30) + ' more matches'); break }
  Write-Output (Format-DscElement $e $i)
  $i++
}
Write-Output '(use "index" to pick one for invoke/set_value)'
`
    case 'invoke':
      if (!name) return { error: 'windows_ui: "name" is required for invoke.' }
      return `${UIA_PRELUDE}${buildWindowLookup(windowTitle)}${buildElementLookup(name, controlType, index)}
$label = Format-DscElement $el
$done = ''
$p = $null
if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) {
  $p.Invoke(); $done = 'Invoke'
} elseif ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) {
  $p.Toggle(); $done = 'Toggle'
} elseif ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) {
  $p.Select(); $done = 'Select'
} elseif ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$p)) {
  if ($p.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Expanded) { $p.Collapse(); $done = 'Collapse' } else { $p.Expand(); $done = 'Expand' }
} else {
  try {
    $el.SetFocus()
    Start-Sleep -Milliseconds 120
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    $done = 'Focus+Enter (no UIA pattern)'
  } catch { }
}
if ($done) { Write-Output ('OK: ' + $done + ' on ' + $label) } else { Write-Output ('ERROR: ' + $label + ' supports no invocable pattern and cannot take focus.'); exit 1 }
`
    case 'set_value':
      if (!name) return { error: 'windows_ui: "name" is required for set_value.' }
      return `${UIA_PRELUDE}${buildWindowLookup(windowTitle)}${buildElementLookup(name, controlType, index)}
$label = Format-DscElement $el
$p = $null
if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
  $p.SetValue(${psq(value)})
  Write-Output ('OK: value set on ' + $label)
} else {
  $el.SetFocus()
  Start-Sleep -Milliseconds 150
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait(${psq(escapeSendKeysText(value))})
  Write-Output ('OK: typed into ' + $label + ' via keyboard (no ValuePattern)')
}
`
    case 'send_keys':
      if (!value) return { error: 'windows_ui: "value" (SendKeys sequence) is required for send_keys.' }
      return `${UIA_PRELUDE}${buildWindowLookup(windowTitle)}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DscWinApi { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'
[void][DscWinApi]::SetForegroundWindow([IntPtr]$win.Current.NativeWindowHandle)
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait(${psq(value)})
Write-Output ('OK: sent keys to "' + $win.Current.Name + '"')
`
    case 'focus':
      return `${UIA_PRELUDE}${buildWindowLookup(windowTitle)}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DscWinApi { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'
[void][DscWinApi]::SetForegroundWindow([IntPtr]$win.Current.NativeWindowHandle)
Write-Output ('OK: focused "' + $win.Current.Name + '"')
`
    default:
      return { error: `windows_ui: unknown action "${action}".` }
  }
}

export const windowsUiTool: Tool = {
  name: 'windows_ui',
  description: 'Control real Windows desktop applications (Explorer, Photoshop, any Win32/WPF/UWP app) through UI Automation — no vision needed: the app UI is exposed as a TEXT tree of named elements. Actions: list_windows (what is open); tree (dump a window\'s UI structure — your "eyes", start here); find (locate elements by name/control type); invoke (click a Button/MenuItem/CheckBox by name); set_value (fill an Edit field); send_keys (keyboard input in SendKeys syntax: {ENTER}, ^o = Ctrl+O, %f = Alt+F, plain text as-is); focus (bring window to front). Typical loop: list_windows -> tree depth 3-5 -> invoke/set_value -> tree again to VERIFY the state changed. Element names are language-dependent (a Russian Windows shows Russian menu names). Windows only.',
  parameters: [
    { name: 'action', type: 'string', required: true, description: 'What to do.', enum: ['list_windows', 'tree', 'find', 'invoke', 'set_value', 'send_keys', 'focus'] },
    { name: 'window', type: 'string', description: 'Top-level window title substring (required for everything except list_windows).' },
    { name: 'name', type: 'string', description: 'Element name or AutomationId substring (for find/invoke/set_value).' },
    { name: 'control_type', type: 'string', description: 'Exact UIA control type filter, e.g. Button, Edit, MenuItem, CheckBox, ListItem, TreeItem, TabItem.' },
    { name: 'value', type: 'string', description: 'Text for set_value, or the SendKeys sequence for send_keys.' },
    { name: 'depth', type: 'number', description: 'Tree depth for action=tree (default 4, max 10).' },
    { name: 'index', type: 'number', description: 'Pick the N-th match (0-based) when several elements share a name — see action=find output.' },
  ],
  async execute (args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    if (platform() !== 'win32') {
      return { success: false, output: '', error: 'windows_ui is only available on Windows.' }
    }
    const script = buildActionScript(args)
    if (typeof script !== 'string') {
      return { success: false, output: '', error: script.error }
    }
    try {
      const { code, output } = await runPowerShell(script, DEFAULT_TIMEOUT_MS, signal)
      const trimmed = output.trim()
      if (code !== 0 || trimmed.startsWith('ERROR:')) {
        return { success: false, output: '', error: trimmed || `windows_ui exited with code ${code}` }
      }
      return { success: true, output: trimmed || '(no output)' }
    } catch (err) {
      return { success: false, output: '', error: (err as Error).message }
    }
  },
}
