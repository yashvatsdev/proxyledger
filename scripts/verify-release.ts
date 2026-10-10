import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { getTestPrisma, testDatabaseUrl } from '../tests/helpers/test-database'
import { createLedgerService } from '../lib/ledger-service'

// Test-only session provisioning; the application has no test login endpoint.
// Restrict both server and fixture DB to loopback, in addition to isolation checks.
async function main() {
const origin = process.env.RELEASE_TEST_ORIGIN ?? 'http://localhost:3108'
const target = new URL(origin)
assert(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:', 'Use an isolated localhost server')
assert(['localhost', '127.0.0.1'].includes(new URL(testDatabaseUrl()).hostname), 'Browser fixtures require a disposable localhost database')
const db = getTestPrisma()
await mkdir('.phase7-artifacts', { recursive: true })
const ids = [randomUUID(), randomUUID()]
const tokens = ids.map(() => randomBytes(32).toString('hex'))
const names = ['Release Alice', 'Release Bob']
const browser = await chromium.launch()
const contexts = await Promise.all(ids.map(() => browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })))
const pages = await Promise.all(contexts.map(context => context.newPage()))
const [a, b] = pages
const ledger = createLedgerService(db)
const results: Record<string, unknown> = { origin, oauth: 'Not exercised: database-backed test sessions provisioned locally', matrix: [], accessibility: [], workflow: [], browserErrors: [] }
const workflow = results.workflow as string[]
const matrix = results.matrix as unknown[]
const accessibility = results.accessibility as unknown[]
for (const page of pages) page.on('pageerror', error => (results.browserErrors as string[]).push(error.name))
async function goto(page: Page, path: string) {
  const started = performance.now()
  const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
  assert.equal(response?.status(), 200, `HTTP status for ${path}`)
  await page.locator('h1').first().waitFor()
  return Math.round(performance.now() - started)
}
async function poll<T>(read: () => Promise<T>, predicate: (value: T) => boolean) {
  for (let retry = 0; retry < 50; retry++) {
    const value = await read()
    if (predicate(value)) return value
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Expected database transition did not complete')
}
async function pair(expected: number) {
  assert.equal((await ledger.pair(ids[0], ids[1]))?.balance, expected)
  assert.equal((await ledger.pair(ids[1], ids[0]))?.balance, expected === 0 ? 0 : -expected)
}
try {
  for (const [index, id] of ids.entries()) {
    await db.user.create({ data: { id, name: names[index], email: `${id}@example.invalid` } })
    await db.account.create({ data: { userId: id, provider: 'google', type: 'oidc', providerAccountId: `local-fixture-${id}` } })
    await db.session.create({ data: { userId: id, sessionToken: tokens[index], expires: new Date(Date.now() + 86400000) } })
    await contexts[index].addCookies([{ name: 'authjs.session-token', value: tokens[index], url: origin, httpOnly: true, sameSite: 'Lax' }])
  }
  await goto(a, '/dashboard/friends')
  // Fails closed if the local server points at a different database.
  assert(await a.getByText(names[0], { exact: true }).count() > 0, 'Server must use the same isolated fixture database')
  await a.getByRole('button', { name: 'Add Friend', exact: true }).click()
  await a.getByRole('textbox', { name: 'Search registered users' }).fill(names[1])
  await a.getByRole('button', { name: 'Invite', exact: true }).click()
  const friendship = await poll(() => db.friendship.findFirst({ where: { requesterId: ids[0], recipientId: ids[1] } }), row => row?.status === 'PENDING')
  assert(friendship)
  await a.getByRole('dialog').press('Escape')
  await goto(b, '/dashboard/friends?tab=incoming')
  await b.getByRole('button', { name: 'Accept', exact: true }).click()
  await poll(() => db.friendship.findUnique({ where: { id: friendship.id } }), row => row?.status === 'ACCEPTED')
  await pair(0)
  await goto(a, `/dashboard/friends/${ids[1]}`)
  workflow.push('UI invitation search/send/accept and initial zero balances')

  await goto(a, '/dashboard/friends')
  await a.getByRole('button', { name: 'Add Friend', exact: true }).click()
  await contexts[0].setOffline(true)
  await a.getByRole('textbox', { name: 'Search registered users' }).fill('Release')
  await a.getByText('Search could not connect. Please try again.', { exact: true }).waitFor()
  await contexts[0].setOffline(false)
  await a.getByRole('textbox', { name: 'Search registered users' }).fill(names[1])
  await a.getByText('Already friends', { exact: true }).waitFor()
  await a.getByRole('dialog').press('Escape')
  workflow.push('Offline search exposes safe retry feedback and recovers after reconnecting')

  await goto(a, '/dashboard/transactions')
  await a.getByRole('button', { name: 'Record a favor' }).first().click()
  const dialog = a.getByRole('dialog')
  await dialog.locator('.favor-choice').filter({ hasText: names[1] }).click()
  await a.setViewportSize({ width: 320, height: 700 })
  const bounds = await dialog.boundingBox()
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 321, 'Favor dialog must fit the mobile viewport')
  await a.screenshot({ path: '.phase7-artifacts/320-record-favor-dialog.png', fullPage: true })
  const formAudit = await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  assert.equal(formAudit.violations.length, 0, 'Favor form accessibility violation')
  for (let key = 0; key < 20; key++) {
    await a.keyboard.press('Tab')
    const focus = await dialog.evaluate(node => ({ inside: node.contains(document.activeElement), documentFocused: document.hasFocus(), element: document.activeElement?.tagName }))
    // Native Chromium modal navigation may visit browser chrome between cycles.
    assert(focus.inside || !focus.documentFocused, `Modal focus reached a background element: ${focus.element}`)
  }
  await dialog.getByRole('textbox', { name: 'New subject', exact: true }).fill('Release Mathematics')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await dialog.getByText('Selected: Release Mathematics', { exact: true }).waitFor()
  await a.setViewportSize({ width: 1440, height: 900 })
  await dialog.getByRole('button', { name: 'Send for confirmation' }).click()
  const favor = await poll(() => db.favor.findFirst({ where: { createdById: ids[0] } }), row => row?.status === 'PENDING')
  assert(favor)
  await pair(0)
  await goto(b, `/dashboard/transactions/${favor.id}`)
  await b.getByRole('button', { name: 'Confirm', exact: true }).click()
  await b.getByRole('dialog').getByRole('button', { name: 'Confirm favor', exact: true }).click()
  await poll(() => db.favor.findUnique({ where: { id: favor.id } }), row => row?.status === 'CONFIRMED')
  await pair(1)
  workflow.push('UI subject creation, favor recording/confirmation; pending zero, confirmed +1/-1')

  await goto(a, `/dashboard/balances/${ids[1]}`)
  await a.getByRole('button', { name: 'Settle', exact: true }).click()
  const amount = a.getByRole('dialog').getByRole('spinbutton')
  await amount.fill('2')
  assert(await a.getByRole('dialog').getByRole('button', { name: 'Send settlement request' }).isDisabled(), 'Over-debt submission must be disabled')
  await amount.fill('1')
  await a.getByRole('dialog').getByRole('button', { name: 'Send settlement request' }).click()
  const settlement = await poll(() => db.settlement.findFirst({ where: { requesterId: ids[0] } }), row => row?.status === 'PENDING')
  assert(settlement)
  await pair(1)
  await goto(b, `/dashboard/settlements/${settlement.id}`)
  await b.getByRole('button', { name: 'Confirm', exact: true }).click()
  await b.getByRole('dialog').getByRole('button', { name: 'Confirm settlement', exact: true }).click()
  await poll(() => db.settlement.findUnique({ where: { id: settlement.id } }), row => row?.status === 'CONFIRMED')
  await pair(0)
  assert.equal(await db.favor.count({ where: { id: favor.id, status: 'CONFIRMED' } }), 1)
  assert.equal(await db.settlement.count({ where: { id: settlement.id, status: 'CONFIRMED' } }), 1)
  for (const id of ids) assert(await db.notification.count({ where: { userId: id } }) > 0)
  workflow.push('UI settlement request/confirmation; pending unchanged, confirmed 0/0; history and notifications preserved')
  await goto(a, '/dashboard/notifications')
  const markRead = a.getByRole('button', { name: 'Mark as read', exact: true }).first()
  if (await markRead.count()) {
    const before = await db.notification.count({ where: { userId: ids[0], readAt: null } })
    await markRead.click()
    await poll(() => db.notification.count({ where: { userId: ids[0], readAt: null } }), count => count === before - 1)
    workflow.push('UI notification read acknowledgment')
  }
  const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440]
  const routes = ['/', '/dashboard', '/dashboard/friends', '/dashboard/transactions', '/dashboard/subjects', '/dashboard/balances', '/dashboard/notifications', '/dashboard/settings']
  for (const width of widths) {
    await a.setViewportSize({ width, height: 900 })
    for (const path of routes) {
      const navigationMs = await goto(a, path)
      if (path === '/') {
        const height = await a.evaluate(() => document.documentElement.scrollHeight)
        for (let y = 0; y < height; y += 700) {
          await a.evaluate(scrollY => window.scrollTo(0, scrollY), y)
          await a.waitForTimeout(120)
        }
        await a.evaluate(() => window.scrollTo(0, 0))
        await a.waitForTimeout(300)
      }
      const sizes = await a.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }))
      const overflow = Math.max(sizes.body, sizes.document) - sizes.viewport
      matrix.push({ width, path, overflow, navigationMs, pass: overflow <= 1 })
      const audit = await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      accessibility.push({ width, path, violations: audit.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, targets: v.nodes.map(n => n.target) })), incomplete: audit.incomplete.map(v => v.id), incompleteTargets: audit.incomplete.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })) })
      if (width === 320 || width === 1440) await a.screenshot({ path: `.phase7-artifacts/${width}-${path.replaceAll('/', '_') || 'landing'}.png`, fullPage: true })
    }
    console.log(`Verified ${width}px routes`)
  }
  // Keyboard focus restoration and mobile navigation are exercised in real DOM.
  await a.setViewportSize({ width: 390, height: 900 })
  await goto(a, '/dashboard')
  const navigation = a.getByRole('button', { name: 'Open navigation', exact: true })
  await navigation.click()
  assert(await a.getByRole('dialog').isVisible())
  await a.getByRole('dialog').press('Escape')
  assert(await navigation.evaluate(node => node === document.activeElement))
  workflow.push('Mobile navigation dialog Escape and trigger focus restoration under reduced motion')
  for (const [index, page] of pages.entries()) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await goto(page, '/dashboard/settings')
    await page.getByRole('button', { name: 'Open account menu', exact: true }).click()
    await page.locator('.profile-menu').getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.waitForURL(`${origin}/`)
    assert.equal(await db.session.count({ where: { sessionToken: tokens[index] } }), 0)
    await page.goto(`${origin}/dashboard`)
    await page.waitForURL(`${origin}/login`)
  }
  workflow.push('Both UI sign-outs delete database sessions and protected dashboard redirects to login')
  assert(matrix.every(row => (row as { pass: boolean }).pass), 'Responsive overflow detected; inspect report')
  assert(accessibility.every(row => (row as { violations: unknown[] }).violations.length === 0), 'Accessibility violations detected; inspect report')
  assert.equal((results.browserErrors as unknown[]).length, 0, 'Browser runtime errors detected')
  results.completed = true
} catch (error) {
  await a.screenshot({ path: '.phase7-artifacts/failure.png', fullPage: true })
  await writeFile('.phase7-artifacts/failure.txt', await a.locator('body').innerText())
  throw error
} finally {
  await mkdir('.phase7-artifacts', { recursive: true })
  await writeFile('.phase7-artifacts/release-results.json', JSON.stringify(results, null, 2))
  await browser.close()
  // Only this invocation's UUID fixture records in the isolated test database.
  await db.notification.deleteMany({ where: { userId: { in: ids } } })
  await db.settlement.deleteMany({ where: { requesterId: { in: ids } } })
  await db.favor.deleteMany({ where: { createdById: { in: ids } } })
  await db.subject.deleteMany({ where: { ownerId: { in: ids } } })
  await db.friendship.deleteMany({ where: { requesterId: { in: ids } } })
  await db.session.deleteMany({ where: { userId: { in: ids } } })
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.rateLimitBucket.deleteMany({ where: { OR: ids.map(id => ({ key: { endsWith: `:${id}` } })) } })
  await db.$disconnect()
}
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Release verification failed'); process.exitCode = 1 })
