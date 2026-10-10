import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('../lib/auth-session', () => ({ requireUser: async () => ({ id: 'actor', name: 'Avery User', email: 'avery@example.invalid', image: null }) }))
vi.mock('../app/login/actions', () => ({ logout: async () => null }))
vi.mock('../app/dashboard/search/actions', () => ({ searchWorkspace: vi.fn() }))
import SettingsPage from '../app/dashboard/settings/page'
import UserAvatar from '../components/user-avatar'
import WorkspaceSearch from '../components/workspace-search'
import DashboardLoading from '../app/dashboard/loading'

it('renders supported account information and real destinations without fake save controls', async () => {
  const html = renderToStaticMarkup(await SettingsPage())
  expect(html).toContain('Avery User')
  expect(html).toContain('avery@example.invalid')
  expect(html).toContain('Sign out')
  expect(html).toContain('href="/dashboard/notifications"')
  expect(html).not.toContain('Save changes')
})
it('provides profile initials with a readable avatar name', () => {
  const html = renderToStaticMarkup(createElement(UserAvatar, { user: { name: 'Avery User', email: null, image: null } }))
  expect(html).toContain('aria-label="Avery User"')
  expect(html).toContain('AU')
})
it('labels the search trigger and announces loading without displaying placeholder metrics', () => {
  const search = renderToStaticMarkup(createElement(WorkspaceSearch))
  expect(search).toContain('aria-label="Search your workspace"')
  const loading = renderToStaticMarkup(createElement(DashboardLoading))
  expect(loading).toContain('aria-busy="true"')
  expect(loading).toContain('Loading your workspace')
  expect(loading).not.toContain('Owed to you')
})
