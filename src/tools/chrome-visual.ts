import type { Page } from 'puppeteer'

/**
 * Visual automation layer for the chrome tool (port of the user's
 * chrome-cli-tools visual layer). Makes agent browsing visible in headed mode:
 *   - neon frame around the page;
 *   - glowing cursor that glides to the click target;
 *   - click ripple;
 *   - typing indicator;
 *   - mini-HUD with the current action text.
 *
 * Everything is injected with pointer-events:none and max z-index, so it never
 * intercepts clicks or affects layout. Pure CSS animations, no dependencies.
 * Visuals are best-effort: every entry point swallows its own errors — a page
 * with a strict CSP must not break the real action.
 */

const FRAME_ID = '__dsc_frame'
const CURSOR_ID = '__dsc_cursor'
const HUD_ID = '__dsc_hud'
const STYLE_ID = '__dsc_style'

const DEFAULT_COLOR = '#00f0ff'
const DEFAULT_HUD = '🤖 DeepSeek Code — agent in control'
/** Cursor glide duration; matches the CSS transition below. */
const CURSOR_MOVE_MS = 380

const installedPages = new WeakSet<Page>()

/**
 * Self-contained bootstrap executed in the page context (and re-executed on
 * every navigation via evaluateOnNewDocument). Installs the style, frame,
 * cursor, HUD and an event bridge that mirrors real mouse/keyboard events into
 * cursor movement, ripples and the typing indicator. Идентификаторы инлайнятся:
 * функция сериализуется и выполняется в странице без внешних ссылок.
 */
function visualBootstrap (color: string, hudText: string): void {
  var FRAME = '__dsc_frame'; var CURSOR = '__dsc_cursor'; var HUD = '__dsc_hud'; var STYLE = '__dsc_style'
  function install (): void {
    if (!document.documentElement) return
    // Mount on <html>, not <body>: SPA frameworks rebuild body children and
    // would wipe the overlay; on documentElement it survives.
    var root = document.documentElement
    if (!document.getElementById(STYLE)) {
      var st = document.createElement('style')
      st.id = STYLE
      st.textContent =
        '#' + FRAME + '{position:fixed;inset:0;pointer-events:none;z-index:2147483646;' +
        'border:3px solid ' + color + ';border-radius:6px;' +
        'box-shadow:inset 0 0 18px ' + color + ',0 0 18px ' + color + ';' +
        'animation:__dsc_glow 1.8s ease-in-out infinite,__dsc_spectrum 6s linear infinite;}' +
        '@keyframes __dsc_glow{0%,100%{opacity:.55}50%{opacity:1}}' +
        '@keyframes __dsc_spectrum{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}' +
        '#' + CURSOR + '{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;' +
        'margin:-2px 0 0 -2px;transform:translate(28px,72px);' +
        'transition:transform .35s cubic-bezier(.22,1,.36,1);transform-origin:3px 3px;' +
        'will-change:transform;opacity:1;visibility:visible;filter:drop-shadow(0 0 5px ' + color + ');' +
        'animation:__dsc_cspectrum 6s linear infinite;}' +
        '#' + CURSOR + '.__dsc_pressed svg{transform:scale(.82);transform-origin:3px 3px}' +
        '#' + CURSOR + '.__dsc_typing::after{content:"";position:absolute;left:19px;top:17px;' +
        'width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 8px ' + color + ';' +
        'animation:__dsc_typing .7s ease-in-out infinite}' +
        '@keyframes __dsc_typing{0%,100%{opacity:.25;transform:scale(.75)}50%{opacity:1;transform:scale(1.2)}}' +
        '@keyframes __dsc_cspectrum{0%{filter:drop-shadow(0 0 5px ' + color + ') hue-rotate(0deg)}' +
        '100%{filter:drop-shadow(0 0 5px ' + color + ') hue-rotate(360deg)}}' +
        '#' + HUD + '{position:fixed;left:12px;bottom:12px;pointer-events:none;z-index:2147483647;' +
        'font:600 12px/1.4 system-ui,-apple-system,sans-serif;color:#fff;background:rgba(0,0,0,.72);' +
        'padding:6px 10px;border-radius:6px;border:1px solid ' + color + ';box-shadow:0 0 10px ' + color + ';' +
        'max-width:60vw;opacity:1;transition:opacity .25s;}' +
        '.__dsc_ripple{position:fixed;pointer-events:none;z-index:2147483645;width:16px;height:16px;' +
        'margin:-8px 0 0 -8px;border-radius:50%;border:2px solid ' + color + ';box-shadow:0 0 8px ' + color + ';' +
        'animation:__dsc_ripple .6s ease-out forwards;}' +
        '@keyframes __dsc_ripple{0%{transform:scale(1);opacity:.9}100%{transform:scale(4);opacity:0}}'
      ;(document.head || document.documentElement).appendChild(st)
    }
    if (!document.getElementById(FRAME)) {
      var f = document.createElement('div'); f.id = FRAME; root.appendChild(f)
    }
    if (!document.getElementById(CURSOR)) {
      var c = document.createElement('div'); c.id = CURSOR
      // createElementNS instead of innerHTML — survives Trusted Types (YouTube).
      var NS = 'http://www.w3.org/2000/svg'
      var svg = document.createElementNS(NS, 'svg')
      svg.setAttribute('width', '24'); svg.setAttribute('height', '24'); svg.setAttribute('viewBox', '0 0 24 24')
      var path = document.createElementNS(NS, 'path')
      path.setAttribute('d', 'M3 3 L3 18 L7.5 14 L10.5 21 L13.5 19.7 L10.5 13 L17 13 Z')
      path.setAttribute('fill', color); path.setAttribute('stroke', '#ffffff'); path.setAttribute('stroke-width', '1.2')
      svg.appendChild(path); c.appendChild(svg)
      root.appendChild(c)
    }
    if (!document.getElementById(HUD)) {
      var h = document.createElement('div'); h.id = HUD
      h.textContent = hudText || ''
      root.appendChild(h)
    }
    var w = window as unknown as Record<string, unknown>
    if (!w.__dsc_event_bridge) {
      w.__dsc_event_bridge = true
      var typingTimer: ReturnType<typeof setTimeout> | null = null
      function pointFor (event: MouseEvent): { x: number; y: number } {
        if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY }
        var target = event.target && (event.target as Node).nodeType === 1 ? event.target as Element : null
        if (!target) return { x: 28, y: 72 }
        var rect = target.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
      function moveToEvent (event: MouseEvent, animate: boolean): { x: number; y: number } | null {
        var cursor = document.getElementById(CURSOR)
        if (!cursor) return null
        var point = pointFor(event)
        // While the tool drives the cursor (highlight), the bridge must not
        // fight it — two writers on transform cause jitter.
        if (w.__dsc_controlled_until && Date.now() < (w.__dsc_controlled_until as number)) return point
        cursor.style.transition = animate ? 'transform .38s cubic-bezier(.22,1,.36,1)' : 'none'
        cursor.style.transform = 'translate(' + point.x + 'px,' + point.y + 'px)'
        return point
      }
      function rippleAt (point: { x: number; y: number } | null): void {
        if (!point) return
        var ripple = document.createElement('div')
        ripple.className = '__dsc_ripple'
        ripple.style.left = point.x + 'px'
        ripple.style.top = point.y + 'px'
        ;(document.body || document.documentElement).appendChild(ripple)
        setTimeout(function () { ripple.remove() }, 650)
      }
      document.addEventListener('mousemove', function (event) { moveToEvent(event, false) }, true)
      document.addEventListener('mousedown', function (event) {
        var cursor = document.getElementById(CURSOR)
        if (cursor) cursor.classList.add('__dsc_pressed')
        rippleAt(moveToEvent(event, false))
      }, true)
      document.addEventListener('mouseup', function () {
        var cursor = document.getElementById(CURSOR)
        if (cursor) cursor.classList.remove('__dsc_pressed')
      }, true)
      document.addEventListener('click', function (event) {
        var pressedCursor = document.getElementById(CURSOR)
        if (pressedCursor) {
          pressedCursor.classList.add('__dsc_pressed')
          setTimeout(function () {
            var c2 = document.getElementById(CURSOR)
            if (c2) c2.classList.remove('__dsc_pressed')
          }, 140)
        }
        rippleAt(moveToEvent(event, true))
      }, true)
      document.addEventListener('keydown', function () {
        var typingCursor = document.getElementById(CURSOR)
        if (!typingCursor) return
        typingCursor.classList.add('__dsc_typing')
        if (typingTimer) clearTimeout(typingTimer)
        typingTimer = setTimeout(function () {
          var c3 = document.getElementById(CURSOR)
          if (c3) c3.classList.remove('__dsc_typing')
        }, 260)
      }, true)
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install)
  } else {
    install()
  }
}

/**
 * Install the persistent visual layer on a page: runs now AND on every future
 * navigation. Idempotent and best-effort. No-op in headless mode (nobody sees it).
 */
export async function installPersistentVisuals (page: Page, options: { headless?: boolean; color?: string; hud?: string } = {}): Promise<void> {
  if (options.headless) return
  const color = options.color ?? DEFAULT_COLOR
  const hud = options.hud ?? DEFAULT_HUD
  try {
    if (!installedPages.has(page)) {
      await page.evaluateOnNewDocument(visualBootstrap, color, hud)
      installedPages.add(page)
    }
    await page.evaluate(visualBootstrap, color, hud)
  } catch { /* visuals are never critical */ }
}

/** Set the HUD text (empty string hides it). */
export async function setHud (page: Page, text: string): Promise<void> {
  try {
    await page.evaluate((t: string, hudId: string) => {
      const h = document.getElementById(hudId)
      if (!h) return
      h.textContent = t || ''
      ;(h as HTMLElement).style.opacity = t ? '1' : '0'
    }, text, HUD_ID)
  } catch { /* visuals are never critical */ }
}

/**
 * Glide the glowing cursor to the center of `selector` (and update the HUD),
 * then wait for the animation so the click lands AFTER the cursor arrives —
 * the human-like "aim, then press" feel. Best-effort.
 */
export async function highlightAction (page: Page, selector: string, label?: string): Promise<void> {
  try {
    if (label) await setHud(page, label)
    const found = await page.evaluate((sel: string, cursorId: string) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const w = window as unknown as Record<string, unknown>
      w.__dsc_controlled_until = Date.now() + 460
      const c = document.getElementById(cursorId)
      if (c) {
        ;(c as HTMLElement).style.transition = 'transform .35s cubic-bezier(.22,1,.36,1)'
        ;(c as HTMLElement).style.transform = 'translate(' + x + 'px,' + y + 'px)'
      }
      return true
    }, selector, CURSOR_ID)
    if (found) await new Promise(resolve => setTimeout(resolve, CURSOR_MOVE_MS))
  } catch { /* visuals are never critical */ }
}

export { FRAME_ID, CURSOR_ID, HUD_ID, STYLE_ID, CURSOR_MOVE_MS }
