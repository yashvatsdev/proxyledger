import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const origin = process.env.RELEASE_TEST_ORIGIN ?? 'http://localhost:3108'
const target = new URL(origin)
assert(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname), 'Local browser verification only')
const directory = '.phase7-artifacts/ui-polish'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
const results = { animation: [], widths: [], errors: [], incomplete: [] }
try {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', error => results.errors.push(error.message))
  await page.addInitScript(() => {
    window.heroSamples = []
    const started = performance.now()
    function sample() {
      const cta = document.querySelector('.hero-actions')
      const description = document.querySelector('.hero-content > p')
      if (cta && description) {
        const style = getComputedStyle(cta)
        window.heroSamples.push({ t: performance.now() - started, opacity: Number(style.opacity), description: Number(getComputedStyle(description).opacity), hydrated: cta.style.animationName === 'none', transform: style.transform, layoutTop: cta.offsetTop, height: cta.offsetHeight })
      }
      if (performance.now() - started < 5000) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  const samples = await page.evaluate(() => window.heroSamples)
  await writeFile(`${directory}/hero-samples.json`, JSON.stringify(samples, null, 2))
  assert(samples.some(s => s.hydrated && s.description > .1 && s.opacity === 0), 'Description enters while CTAs remain hidden')
  assert(samples.some(s => s.hydrated && s.opacity > .05 && s.opacity < .95 && s.transform !== 'none'), 'CTAs fade and move through intermediate frames')
  assert.equal(new Set(samples.map(s => `${s.layoutTop}:${s.height}`)).size, 1, 'CTA layout stays reserved throughout entrance')
  assert.equal(await page.locator('.hero-actions').evaluate(el => Number(getComputedStyle(el).opacity)), 1)
  assert.equal(await page.locator('.hero-actions a').count(), 2)
  assert.equal(await page.locator('.hero-actions a').first().getAttribute('href'), '/dashboard')
  results.animation.push('Normal motion: delayed CTA fade and transform observed after description entrance')
  await page.getByRole('link', { name: 'See how it works', exact: true }).click()
  await page.waitForTimeout(1200)
  assert.equal(new URL(page.url()).hash, '#how-it-works')
  assert((await page.locator('#how-it-works').boundingBox()).y < 100)
  await page.goto(`${origin}/login`)
  await page.goBack({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3200)
  assert.equal(await page.locator('.hero-actions').evaluate(el => Number(getComputedStyle(el).opacity)), 1)
  results.animation.push('CTA destinations and back navigation passed')
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('.hero-actions')?.style.animationName === 'none')
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  assert.equal(await page.locator('.hero-actions').evaluate(el => Number(getComputedStyle(el).opacity)), 1)
  results.animation.push('Persisted pageshow restores hero visibility')
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(100)
  assert.equal(await page.locator('.hero-actions').evaluate(el => Number(getComputedStyle(el).opacity)), 1)
  results.animation.push('Reduced-motion preference change reveals CTAs')
  const noJS = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'no-preference' })
  const staticPage = await noJS.newPage()
  await staticPage.goto(origin)
  await staticPage.waitForTimeout(2100)
  assert.equal(await staticPage.locator('.hero-actions').evaluate(el => Number(getComputedStyle(el).opacity)), 1)
  assert.equal(await staticPage.locator('.hero-actions a').count(), 2)
  results.animation.push('JavaScript-disabled fallback leaves both CTAs visible')
  await noJS.close()
  const stalled = await browser.newContext({ reducedMotion: 'no-preference' })
  const stalledPage = await stalled.newPage()
  await stalledPage.addInitScript(() => {
    // Simulate an animation scheduler that never delivers another frame.
    window.requestAnimationFrame = () => 1
    window.cancelAnimationFrame = () => {}
  })
  await stalledPage.goto(origin, { waitUntil: 'domcontentloaded' })
  await stalledPage.waitForTimeout(4500)
  assert.equal(await stalledPage.locator('.hero-actions').evaluate(el => Number(getComputedStyle(el).opacity)), 1)
  results.animation.push('Stalled animation scheduler: watchdog restores CTA visibility')
  await stalled.close()
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(origin, { waitUntil: 'networkidle' })
    const dimensions = await page.evaluate(() => {
      const actions = document.querySelector('.hero-actions').getBoundingClientRect()
      const description = document.querySelector('.hero-content > p').getBoundingClientRect()
      return { overflow: document.documentElement.scrollWidth - innerWidth, gap: actions.top - description.bottom, centered: Math.abs((actions.left + actions.right) / 2 - innerWidth / 2) }
    })
    assert(dimensions.overflow <= 1, `Landing overflow at ${width}`)
    assert(dimensions.gap >= 27 && dimensions.gap <= 37, `CTA spacing at ${width}`)
    assert(dimensions.centered <= 1, `CTA alignment at ${width}`)
    await page.evaluate(() => window.scrollBy(0, 700))
    await page.waitForTimeout(120)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    assert.equal(axe.violations.length, 0, `Landing axe at ${width}: ${axe.violations.map(v => v.id)}`)
    results.incomplete.push({ width, rules: axe.incomplete.map(rule => rule.id) })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${directory}/landing-${width}.png`, fullPage: true })
    results.widths.push({ width, ...dimensions })
  }
  assert.deepEqual(results.errors, [], 'No hydration/browser exceptions')
  console.log(JSON.stringify(results, null, 2))
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
