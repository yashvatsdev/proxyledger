import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ requireUser: vi.fn(), create: vi.fn(), change: vi.fn(), createSubject: vi.fn(), rateLimit: vi.fn(), friends: vi.fn(), subjects: vi.fn(), historyChoices: vi.fn(), revalidate: vi.fn() }))
vi.mock('../lib/auth-session', () => ({ requireUser: mock.requireUser }))
vi.mock('../lib/db', () => ({ getPrisma: () => ({}) }))
vi.mock('../lib/favors-service', () => ({ FavorError: class extends Error {}, createFavorsService: () => mock }))
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }))
import { recordFavor, resolveFavor, addSubject, favorChoices, historyChoices } from '../app/dashboard/transactions/actions'
const input = { friendId: 'friend', direction: 'provided', subjectId: 'subject', attendanceDate: '2020-01-01', submissionKey: '11111111-1111-4111-8111-111111111111' }
beforeEach(() => { vi.resetAllMocks(); mock.requireUser.mockResolvedValue({ id: 'session-actor' }); mock.create.mockResolvedValue('favor') })
it.each([() => recordFavor(input), () => resolveFavor({ id: 'favor', operation: 'confirm' }), () => addSubject({ name: 'Math' }), () => favorChoices({}), () => historyChoices({ kind: 'friend' })])('authenticates every action before touching the database', async action => {
  mock.requireUser.mockRejectedValue(new Error('unauthenticated'))
  await expect(action()).rejects.toThrow('unauthenticated')
  expect(mock.rateLimit).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled()
})
it('derives create identity from the session and strips forged actor, state and performer fields', async () => {
  expect(await recordFavor({ ...input, actorId: 'outsider', providerId: 'outsider', createdById: 'outsider', status: 'CONFIRMED' })).toEqual({ ok: true, data: 'favor' })
  expect(mock.create).toHaveBeenCalledWith('session-actor', { ...input, note: '' })
  expect(mock.rateLimit).toHaveBeenCalledWith('session-actor', 'create')
  expect(mock.revalidate).toHaveBeenCalledWith('/dashboard', 'layout')
})
it.each(['confirm', 'reject', 'cancel'])('uses session identity and validates %s before mutation', async operation => {
  await resolveFavor({ id: 'favor', operation, actorId: 'outsider' })
  expect(mock.change).toHaveBeenCalledWith('session-actor', { id: 'favor', operation })
})
it('rejects invalid input before service or rate-limit access', async () => {
  expect((await recordFavor({ ...input, attendanceDate: '2099-01-01' })).ok).toBe(false)
  expect((await resolveFavor({ id: 'favor', operation: 'delete' })).ok).toBe(false)
  expect((await addSubject({ name: '' })).ok).toBe(false)
  expect(mock.rateLimit).not.toHaveBeenCalled()
})
it('does not expose raw database errors', async () => {
  mock.create.mockRejectedValue(new Error('postgres credentials and private tokens'))
  const result = await recordFavor(input)
  expect(JSON.stringify(result)).not.toContain('credentials')
  expect(mock.revalidate).not.toHaveBeenCalled()
})
it('subjects and filter choices use only the session owner', async () => {
  await addSubject({ name: 'Math', ownerId: 'forged' })
  await historyChoices({ kind: 'subject', query: 'math', actorId: 'forged' })
  expect(mock.createSubject).toHaveBeenCalledWith('session-actor', { name: 'Math' })
  expect(mock.historyChoices).toHaveBeenCalledWith('session-actor', 'subject', { kind: 'subject', query: 'math', page: 1 })
})
