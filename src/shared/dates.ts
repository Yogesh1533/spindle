/**
 * Date and time formatting for daily notes.
 *
 * These live in `shared/` rather than in the Electron main process so they
 * can be unit-tested without pulling in Electron, and so the renderer can
 * show a preview of the file name a setting will produce.
 */

/**
 * Format a date using the tokens Obsidian supports in daily note settings.
 * Supports YYYY, YY, MMMM, MMM, MM, M, DD, D, WW, dddd and ddd.
 */
export function formatDate(date: Date, format: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')

  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: date.toLocaleString('en-US', { month: 'long' }),
    MMM: date.toLocaleString('en-US', { month: 'short' }),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
    dddd: date.toLocaleString('en-US', { weekday: 'long' }),
    ddd: date.toLocaleString('en-US', { weekday: 'short' }),
    WW: String(isoWeek(date)),
  }

  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|WW/g, (token) => tokens[token] ?? token)
}

/**
 * Format a time of day.
 *
 * The date tokens above cover the day; daily-note templates also want the
 * clock, so HH, H, hh, h, mm and ss live here.
 */
export function formatTime(date: Date, format: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')

  const tokens: Record<string, string> = {
    HH: pad(date.getHours()),
    H: String(date.getHours()),
    hh: pad(date.getHours() % 12 === 0 ? 12 : date.getHours() % 12),
    h: String(date.getHours() % 12 === 0 ? 12 : date.getHours() % 12),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  }

  // The order matters: the longer tokens have to be tried first, or "H"
  // would match the "H" in "HH" and leave "H:mm" behind.
  return format.replace(/HH|H|hh|h|mm|ss/g, (token) => tokens[token] ?? token)
}

/** ISO-8601 week number. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Expand template tokens in a daily-note template.
 *   {{date}} / {{date:YYYY-MM-DD}}   the date
 *   {{title}}                       the file name without extension
 *   {{time}} / {{time:HH:mm}}       the time
 */
export function applyTemplateTokens(template: string, date: Date, title: string): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (full, body: string) => {
    // Only the first colon separates the token from its argument: a time
    // format like "HH:mm" contains colons of its own.
    const colon = body.indexOf(':')
    const key = (colon === -1 ? body : body.slice(0, colon)).trim()
    const arg = colon === -1 ? undefined : body.slice(colon + 1).trim()

    switch (key) {
      case 'date':
        return formatDate(date, arg ?? 'YYYY-MM-DD')
      case 'title':
        return title
      case 'time':
        return formatTime(date, arg ?? 'HH:mm')
      default:
        return full
    }
  })
}
