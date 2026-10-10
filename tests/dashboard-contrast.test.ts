import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
function token(name: string) {
  const match = css.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6})`, 'i'))
  if (!match) throw new Error(`Missing palette token ${name}`)
  return match[1].match(/../g)!.map(channel => parseInt(channel, 16))
}
function luminance(rgb: number[]) {
  return rgb.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((value, channel, index) => value + channel * [.2126, .7152, .0722][index], 0)
}
function contrast(first: number[], second: number[]) {
  const a = luminance(first), b = luminance(second)
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
}
it('keeps all dashboard text and state colors above AA normal-text contrast', () => {
  for (const text of ['foreground', 'secondary-text', 'primary', 'negative']) {
    for (const surface of ['background', 'surface', 'card']) expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5)
  }
  expect(contrast(token('primary-foreground'), token('primary'))).toBeGreaterThanOrEqual(4.5)
})
it('keeps focus rings and composite form borders above non-text contrast', () => {
  for (const surface of ['surface', 'card']) {
    const background = token(surface)
    const border = token('secondary-text').map((channel, index) => channel * .6 + background[index] * .4)
    expect(contrast(border, background)).toBeGreaterThanOrEqual(3)
    expect(contrast(token('ring'), background)).toBeGreaterThanOrEqual(3)
  }
})
