import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPrisma } from '../lib/db'
import { createFavorsService } from '../lib/favors-service'
import { createFriendsService } from '../lib/friends-service'
import { calculateBilateralBalance } from '../lib/ledger'

describe.skipIf(process.env.RUN_FAVORS_DB_TESTS !== '1')('PostgreSQL favor integration', () => {
  const db = getPrisma()
  const service = createFavorsService(db)
  const friends = createFriendsService(db)
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  const [a, b, outsider] = ids
  let subject: string, otherSubject: string, connection: string
  async function clear() {
    await db.notification.deleteMany({ where: { userId: { in: ids } } })
    await db.favor.deleteMany({ where: { providerId: { in: ids } } })
    await db.subject.deleteMany({ where: { ownerId: { in: ids } } })
    await db.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { recipientId: { in: ids } }] } })
    await db.rateLimitBucket.deleteMany({ where: { key: { in: ids.flatMap(id => ['favor-create', 'favor-change', 'favor-subject', 'favor-choices', 'mutation'].map(scope => `${scope}:${id}`)) } } })
  }
  beforeAll(async () => {
    for (const [index, id] of ids.entries()) await db.user.create({ data: { id, name: `Phase4Test ${index}`, email: `${id}@example.invalid` } })
  }, 20000)
  beforeEach(async () => {
    await clear()
    subject = (await service.createSubject(a, { name: 'Mathematics' })).id
    otherSubject = (await service.createSubject(b, { name: 'Private Physics' })).id
    connection = (await db.friendship.create({ data: { requesterId: a, recipientId: b, status: 'ACCEPTED', connectedAt: new Date() } })).id
  }, 20000)
  afterAll(async () => { await clear(); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect() }, 20000)
  const input = (overrides: Record<string, unknown> = {}) => ({ friendId: b, direction: 'provided', subjectId: subject, attendanceDate: '2020-01-02', note: 'Attendance proxy', submissionKey: randomUUID(), ...overrides })

  it('creates a pending performer-submitted favor and one linked notification', async () => {
    const id = await service.create(a, input())
    expect(await db.favor.findUnique({ where: { id } })).toMatchObject({ providerId: a, beneficiaryId: b, createdById: a, status: 'PENDING', confirmedAt: null, resolvedAt: null })
    expect(await db.notification.count({ where: { favorId: id, userId: b, type: 'FAVOR_REQUEST_RECEIVED' } })).toBe(1)
    expect((await friends.notifications(b)).rows[0].href).toBe(`/dashboard/transactions/${id}`)
    expect((await friends.summary(b)).unread).toBe(1)
    expect((await service.summary(b)).awaiting).toBe(1)
    expect((await service.summary(a)).confirmed).toBe(0)
  })
  it('supports receiver submissions without swapping the confirmation participant', async () => {
    const id = await service.create(a, input({ direction: 'received' }))
    expect(await db.favor.findUnique({ where: { id } })).toMatchObject({ providerId: b, beneficiaryId: a, createdById: a })
    await expect(service.change(a, { id, operation: 'confirm' })).rejects.toThrow()
    await service.change(b, { id, operation: 'confirm' })
    expect((await service.detail(b, id))?.status).toBe('CONFIRMED')
  })
  it('rejects self favors, missing friends and non-friends', async () => {
    await expect(service.create(a, input({ friendId: a }))).rejects.toThrow('yourself')
    await expect(service.create(a, input({ friendId: outsider }))).rejects.toThrow('friendship')
    await expect(service.create(a, input({ friendId: 'missing-user' }))).rejects.toThrow('friendship')
    await expect(service.create(a, input({ friendId: '' }))).rejects.toThrow()
  })
  it('rejects subjects owned by another user and nonexistent subjects', async () => {
    await expect(service.create(a, input({ subjectId: otherSubject }))).rejects.toThrow('own subjects')
    await expect(service.create(a, input({ subjectId: 'missing-subject' }))).rejects.toThrow('own subjects')
    expect(await db.favor.count({ where: { providerId: a } })).toBe(0)
  })
  it('rejects invalid dates, future dates, direction and oversized notes', async () => {
    for (const overrides of [{ attendanceDate: '2020-02-30' }, { attendanceDate: '2099-01-01' }, { direction: 'credit' }, { note: 'x'.repeat(2001) }]) await expect(service.create(a, input(overrides))).rejects.toThrow()
  })
  it('returns the same row for retries without another notification', async () => {
    const value = input()
    const id = await service.create(a, value)
    expect(await service.create(a, value)).toBe(id)
    await expect(service.create(a, { ...value, note: 'Changed claim' })).rejects.toThrow('already used')
    expect(await db.favor.count({ where: { createdById: a } })).toBe(1)
    expect(await db.notification.count({ where: { favorId: id } })).toBe(1)
  })
  it('deduplicates concurrent retries transactionally', async () => {
    const value = input()
    const results = await Promise.all([service.create(a, value), service.create(a, value)])
    expect(new Set(results).size).toBe(1)
    expect(await db.notification.count({ where: { favorId: results[0] } })).toBe(1)
  })
  it('ignores forged identity, status and timestamps in create payload', async () => {
    const id = await service.create(a, input({ providerId: outsider, beneficiaryId: outsider, createdById: outsider, status: 'CONFIRMED', confirmedAt: new Date() }))
    expect(await db.favor.findUnique({ where: { id } })).toMatchObject({ providerId: a, beneficiaryId: b, createdById: a, status: 'PENDING', confirmedAt: null })
  })
  it('allows only the non-submitter to confirm once, stores timestamps and notifies atomically', async () => {
    const id = await service.create(a, input())
    await expect(service.change(a, { id, operation: 'confirm' })).rejects.toThrow()
    await expect(service.change(outsider, { id, operation: 'confirm' })).rejects.toThrow()
    await service.change(b, { id, operation: 'confirm' })
    await expect(service.change(b, { id, operation: 'confirm' })).rejects.toThrow()
    const row = await service.detail(a, id)
    expect(row?.status).toBe('CONFIRMED'); expect(row?.confirmedAt).not.toBeNull(); expect(row?.resolvedAt).not.toBeNull()
    expect(await db.notification.count({ where: { favorId: id, type: 'FAVOR_CONFIRMED', userId: a } })).toBe(1)
    expect((await friends.summary(b)).unread).toBe(0)
    expect((await service.summary(a)).confirmed).toBe(1)
    expect((await service.summary(b)).pending).toBe(0)
  })
  it('allows exactly one concurrent confirmation', async () => {
    const id = await service.create(a, input())
    const outcomes = await Promise.allSettled([service.change(b, { id, operation: 'confirm' }), service.change(b, { id, operation: 'confirm' })])
    expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1)
    expect(await db.notification.count({ where: { favorId: id, type: 'FAVOR_CONFIRMED' } })).toBe(1)
  })
  it('rejects a claim only by its reviewer and retains the audit record', async () => {
    const id = await service.create(a, input())
    await expect(service.change(a, { id, operation: 'reject' })).rejects.toThrow()
    await expect(service.change(outsider, { id, operation: 'reject' })).rejects.toThrow()
    await service.change(b, { id, operation: 'reject' })
    await expect(service.change(b, { id, operation: 'reject' })).rejects.toThrow()
    const row = await service.detail(a, id)
    expect(row).toMatchObject({ status: 'REJECTED', confirmedAt: null }); expect(row?.resolvedAt).not.toBeNull()
    expect(await db.notification.count({ where: { favorId: id, userId: a, type: 'FAVOR_REJECTED' } })).toBe(1)
  })
  it('cancels only pending submitter records and notifies the other participant', async () => {
    const id = await service.create(a, input())
    await expect(service.change(b, { id, operation: 'cancel' })).rejects.toThrow()
    await expect(service.change(outsider, { id, operation: 'cancel' })).rejects.toThrow()
    await service.change(a, { id, operation: 'cancel' })
    await expect(service.change(a, { id, operation: 'cancel' })).rejects.toThrow()
    expect(await service.detail(b, id)).toMatchObject({ status: 'CANCELED', confirmedAt: null })
    expect((await service.summary(b)).awaiting).toBe(0)
    expect(await db.notification.count({ where: { favorId: id, userId: b, type: 'FAVOR_CANCELED' } })).toBe(1)
  })
  it.each(['confirm', 'reject', 'cancel'] as const)('blocks %s after confirmation', async operation => {
    const id = await service.create(a, input())
    await service.change(b, { id, operation: 'confirm' })
    await expect(service.change(operation === 'cancel' ? a : b, { id, operation })).rejects.toThrow()
  })
  it('has a single winner when confirmation races cancellation or rejection', async () => {
    for (const opponent of ['cancel', 'reject'] as const) {
      const id = await service.create(a, input())
      const result = await Promise.allSettled([service.change(b, { id, operation: 'confirm' }), service.change(opponent === 'cancel' ? a : b, { id, operation: opponent })])
      expect(result.filter(row => row.status === 'fulfilled')).toHaveLength(1)
      expect(await db.notification.count({ where: { favorId: id, type: { in: ['FAVOR_CONFIRMED', 'FAVOR_CANCELED', 'FAVOR_REJECTED'] } } })).toBe(1)
    }
  })
  it('keeps pending claims resolvable after removal but blocks new ones', async () => {
    const id = await service.create(a, input())
    await friends.change(a, 'remove', connection)
    await expect(service.create(a, input())).rejects.toThrow('friendship')
    await service.change(b, { id, operation: 'confirm' })
    expect(await service.detail(b, id)).toMatchObject({ status: 'CONFIRMED' })
    expect((await service.friends(a)).rows).toHaveLength(0)
  })
  it('keeps a single consistent outcome when removal races creation', async () => {
    const result = await Promise.allSettled([service.create(a, input()), friends.change(a, 'remove', connection)])
    expect(result[1].status).toBe('fulfilled')
    expect((await db.friendship.findUnique({ where: { id: connection } }))?.status).toBe('REJECTED')
    await expect(service.create(a, input())).rejects.toThrow()
    if (result[0].status === 'fulfilled') expect(await service.detail(a, result[0].value)).not.toBeNull()
  })
  it('hides unrelated history/details and returns only selected public fields', async () => {
    const id = await service.create(a, input())
    expect(await service.detail(outsider, id)).toBeNull()
    expect((await service.list(outsider)).count).toBe(0)
    const row = await service.detail(b, id)
    expect(Object.keys(row!.provider).sort()).toEqual(['id', 'image', 'name'])
    expect(JSON.stringify(row)).not.toContain('@example.invalid')
  })
  it('filters status, friend, subject, date range and literal search on the server', async () => {
    const first = await service.create(a, input())
    await service.change(b, { id: first, operation: 'confirm' })
    const pending = await service.create(b, input({ friendId: a, subjectId: otherSubject, direction: 'received', attendanceDate: '2020-02-01' }))
    expect((await service.list(a, { status: 'awaiting' })).rows.map(row => row.id)).toEqual([pending])
    expect((await service.list(a, { status: 'confirmed', friend: b, subject, from: '2020-01-02', to: '2020-01-02', q: 'mathe' })).count).toBe(1)
    expect((await service.list(a, { status: 'pending' })).count).toBe(1)
    expect((await service.list(a, { friend: outsider })).count).toBe(0)
    expect((await service.list(a, { q: '%' })).count).toBe(0)
    await service.change(b, { id: pending, operation: 'cancel' })
    expect((await service.list(a, { status: 'closed' })).count).toBe(1)
    expect((await service.list(a, { q: 'Phase4Test 1' })).count).toBe(2)
  })
  it('paginates history without overlaps and bounds filter choices to participant history', async () => {
    for (let index = 0; index < 21; index++) await service.create(a, input({ note: String(index) }))
    const first = await service.list(a)
    const second = await service.list(a, { page: 2 })
    expect(first.rows).toHaveLength(20); expect(second.rows).toHaveLength(1)
    expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(21)
    expect(first.count).toBe(21)
    expect((await service.historyChoices(a, 'subject')).rows.map(row => row.id)).toEqual([subject])
    expect((await service.historyChoices(outsider, 'friend')).rows).toHaveLength(0)
  }, 20000)
  it('keeps subjects private, prevents duplicate case variants and preserves historical references', async () => {
    await expect(service.createSubject(a, { name: ' mathematics ' })).rejects.toThrow('already have')
    expect((await service.subjects(a)).rows.map(row => row.id)).toEqual([subject])
    expect((await service.subjects(outsider)).rows).toHaveLength(0)
    const id = await service.create(a, input())
    expect((await service.detail(b, id))?.subject?.name).toBe('Mathematics')
    await expect(db.subject.delete({ where: { id: subject } })).rejects.toThrow()
    expect((await service.detail(a, id))?.subject?.id).toBe(subject)
  })
  it('serializes concurrent case-insensitive subject creation', async () => {
    const results = await Promise.allSettled([service.createSubject(a, { name: 'Networks' }), service.createSubject(a, { name: 'NETWORKS' })])
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1)
    expect(await db.subject.count({ where: { ownerId: a, name: { equals: 'networks', mode: 'insensitive' } } })).toBe(1)
  })
  it('applies shared database rate limits', async () => {
    for (let index = 0; index < 20; index++) await service.rateLimit(a, 'create')
    await expect(service.rateLimit(a, 'create')).rejects.toThrow('Too many')
    await service.rateLimit(b, 'create')
  })
  it('allows only notification owners to mark records read without confirming a favor', async () => {
    const id = await service.create(a, input())
    const notification = await db.notification.findFirstOrThrow({ where: { favorId: id } })
    await expect(friends.markRead(a, notification.id)).rejects.toThrow()
    await friends.markRead(b, notification.id)
    expect((await service.detail(b, id))?.status).toBe('PENDING')
    expect((await service.summary(b)).awaiting).toBe(1)
  })
  it('counts one unit per confirmed favor globally across subjects and ignores all other states', async () => {
    const first = await service.create(a, input())
    const reverse = await service.create(b, input({ friendId: a, subjectId: otherSubject }))
    const rejected = await service.create(a, input())
    const canceled = await service.create(a, input())
    await service.create(a, input())
    await service.change(b, { id: first, operation: 'confirm' })
    let rows = await db.favor.findMany({ where: { createdById: { in: [a, b] } } })
    expect(calculateBilateralBalance(a, b, rows)).toBe(1)
    expect(calculateBilateralBalance(b, a, rows)).toBe(-1)
    await service.change(a, { id: reverse, operation: 'confirm' })
    await service.change(b, { id: rejected, operation: 'reject' })
    await service.change(a, { id: canceled, operation: 'cancel' })
    rows = await db.favor.findMany({ where: { createdById: { in: [a, b] } } })
    expect(calculateBilateralBalance(a, b, rows)).toBe(0)
    expect(calculateBilateralBalance(b, a, rows)).toBe(0)
    await friends.change(a, 'remove', connection)
    expect((await service.list(a, { status: 'confirmed' })).count).toBe(2)
    expect((await service.detail(b, first))?.status).toBe('CONFIRMED')
  })
  it('prevents direct database changes to confirmed content and terminal status', async () => {
    const id = await service.create(a, input())
    await service.change(b, { id, operation: 'confirm' })
    await expect(db.favor.update({ where: { id }, data: { note: 'Tampered' } })).rejects.toThrow()
    await expect(db.favor.update({ where: { id }, data: { status: 'CANCELED', confirmedAt: null } })).rejects.toThrow()
  })
})
