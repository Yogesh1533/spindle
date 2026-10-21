import { describe, expect, it } from 'vitest'
import { applyTemplateTokens, formatDate, formatTime, isoWeek } from '../src/shared/dates.js'

// A fixed local date, so the tests do not depend on the time of day they
// run at. 2026-01-20 was a Tuesday.
const DATE = new Date(2026, 0, 20, 14, 7, 9)

describe('formatDate', () => {
  it('expands the year tokens', () => {
    expect(formatDate(DATE, 'YYYY')).toBe('2026')
    expect(formatDate(DATE, 'YY')).toBe('26')
  })

  it('expands the month tokens', () => {
    expect(formatDate(DATE, 'MM')).toBe('01')
    expect(formatDate(DATE, 'M')).toBe('1')
    expect(formatDate(DATE, 'MMMM')).toBe('January')
    expect(formatDate(DATE, 'MMM')).toBe('Jan')
  })

  it('expands the day tokens', () => {
    expect(formatDate(DATE, 'DD')).toBe('20')
    expect(formatDate(DATE, 'D')).toBe('20')
  })

  it('expands the weekday tokens', () => {
    expect(formatDate(DATE, 'dddd')).toBe('Tuesday')
    expect(formatDate(DATE, 'ddd')).toBe('Tue')
  })

  it('expands the ISO week number', () => {
    expect(formatDate(DATE, 'WW')).toBe(String(isoWeek(DATE)))
    expect(isoWeek(DATE)).toBe(4)
  })

  it('formats a whole date at once', () => {
    expect(formatDate(DATE, 'YYYY-MM-DD')).toBe('2026-01-20')
  })

  it('leaves text it does not know alone', () => {
    expect(formatDate(DATE, 'Notes for today')).toBe('Notes for today')
  })
})

describe('formatTime', () => {
  it('expands the hour tokens', () => {
    expect(formatTime(DATE, 'HH')).toBe('14')
    expect(formatTime(DATE, 'H')).toBe('14')
    expect(formatTime(DATE, 'hh')).toBe('02')
    expect(formatTime(DATE, 'h')).toBe('2')
  })

  it('expands the minute and second tokens', () => {
    expect(formatTime(DATE, 'mm')).toBe('07')
    expect(formatTime(DATE, 'ss')).toBe('09')
  })

  it('formats a whole time at once', () => {
    expect(formatTime(DATE, 'HH:mm')).toBe('14:07')
  })

  it('shows midnight and noon as 12 on the 12-hour clock', () => {
    expect(formatTime(new Date(2026, 0, 20, 0, 30), 'hh:mm')).toBe('12:30')
    expect(formatTime(new Date(2026, 0, 20, 12, 30), 'hh:mm')).toBe('12:30')
  })
})

describe('applyTemplateTokens', () => {
  it('expands {{date}} to the default format', () => {
    expect(applyTemplateTokens('Date: {{date}}', DATE, '2026-01-20')).toBe('Date: 2026-01-20')
  })

  it('expands {{date:FORMAT}} with a custom format', () => {
    expect(applyTemplateTokens('{{date:DD/MM/YYYY}}', DATE, 'x')).toBe('20/01/2026')
  })

  it('expands {{title}} to the file name', () => {
    expect(applyTemplateTokens('# {{title}}', DATE, '2026-01-20')).toBe('# 2026-01-20')
  })

  it('expands {{time}} to the clock', () => {
    expect(applyTemplateTokens('at {{time:HH:mm}}', DATE, 'x')).toBe('at 14:07')
  })

  it('expands several tokens in one template', () => {
    const template = '# {{title}}\n\nDate: {{date}}\nTime: {{time:HH:mm}}\n'
    expect(applyTemplateTokens(template, DATE, '2026-01-20')).toBe(
      '# 2026-01-20\n\nDate: 2026-01-20\nTime: 14:07\n'
    )
  })

  it('leaves an unknown token untouched', () => {
    expect(applyTemplateTokens('{{author}}', DATE, 'x')).toBe('{{author}}')
  })
})
