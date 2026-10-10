import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ requireUser: vi.fn(), db: vi.fn(), search: vi.fn() }))
vi.mock('../lib/auth-session', () => ({ requireUser: mock.requireUser }))
vi.mock('../lib/db', () => ({ getPrisma: mock.db }))
vi.mock('../lib/search-service', () => ({ createWorkspaceSearch: () => mock.search, WorkspaceSearchError: class extends Error {} }))
import { searchWorkspace } from '../app/dashboard/search/actions'
import { WorkspaceSearchError } from '../lib/search-service'

beforeEach(() => { vi.resetAllMocks(); mock.requireUser.mockResolvedValue({ id: 'verified-actor' }); mock.search.mockResolvedValue([]) })
it('authenticates before parsing input or opening a database connection', async () => {
  mock.requireUser.mockRejectedValue(new Error('unauthorized'))
  await expect(searchWorkspace(null)).rejects.toThrow('unauthorized')
  expect(mock.db).not.toHaveBeenCalled()
  expect(mock.search).not.toHaveBeenCalled()
})
it('uses session identity and discards supplied identities and pagination', async () => {
  expect(await searchWorkspace({ query: '  Math  ', actorId: 'forged', ownerId: 'forged', page: 999 })).toEqual({ ok: true, data: [] })
  expect(mock.search).toHaveBeenCalledWith('verified-actor', { query: 'Math' })
})
it.each([null, {}, { query: 'x' }, { query: ' '.repeat(10) }, { query: 'x'.repeat(81) }])('rejects invalid search input without querying for %j', async input => {
  expect((await searchWorkspace(input)).ok).toBe(false)
  expect(mock.db).not.toHaveBeenCalled()
})
it('returns useful rate feedback and hides unexpected database errors', async () => {
  mock.search.mockRejectedValueOnce(new WorkspaceSearchError('Too many searches. Please try again in a minute.'))
  expect(await searchWorkspace({ query: 'math' })).toMatchObject({ ok: false, error: 'Too many searches. Please try again in a minute.' })
  mock.search.mockRejectedValueOnce(new Error('private database token'))
  expect(await searchWorkspace({ query: 'math' })).toEqual({ ok: false, error: 'Search is unavailable. Please try again.' })
})
