import { execSync } from 'node:child_process'
import { platform } from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, unlinkSync, readFileSync } from 'node:fs'

/**
 * Read an image from the system clipboard.
 * Returns a Buffer with the PNG data, or null if no image or unsupported platform.
 */
export async function readClipboardImage (): Promise<Buffer | null> {
  const p = platform()
  const tmpFile = join(tmpdir(), `dsc_paste_${Date.now()}.png`)

  try {
    if (p === 'darwin') {
      execSync(
        `osascript -e 'set theFile to "${tmpFile}"' ` +
        `-e 'set theData to the clipboard as «class PNGf»' ` +
        `-e 'set fileRef to open for access POSIX file theFile with write permission' ` +
        `-e 'write theData to fileRef' ` +
        `-e 'close access fileRef'`,
        { timeout: 3000, stdio: 'ignore' }
      )
    } else if (p === 'linux') {
      execSync(`xclip -selection clipboard -t image/png -o > "${tmpFile}"`, {
        timeout: 3000,
        stdio: 'ignore',
        shell: '/bin/sh',
      })
    } else if (p === 'win32') {
      const ps = [
        'Add-Type -Assembly System.Windows.Forms;',
        '$img = [System.Windows.Forms.Clipboard]::GetImage();',
        'if ($img) {',
        `  $img.Save('${tmpFile.replace(/\\/g, '\\\\')}');`,
        '} else { exit 1 }',
      ].join(' ')
      execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 })
    } else {
      return null
    }

    if (!existsSync(tmpFile)) return null
    const buf = readFileSync(tmpFile)
    unlinkSync(tmpFile)
    return buf.length > 0 ? buf : null
  } catch {
    if (existsSync(tmpFile)) {
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
    }
    return null
  }
}
