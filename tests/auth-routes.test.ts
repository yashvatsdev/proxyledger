import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), requireUser: vi.fn(), redirect: vi.fn() }))
vi.mock('../lib/auth-session', () => ({ getSession: mocks.session, requireUser: mocks.requireUser }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../app/login/login-card', () => ({ default: () => null }))
vi.mock('../app/dashboard/dashboard-client', () => ({ default: () => null }))
vi.mock('../app/dashboard/friends/friends-view', () => ({ default: () => null }))
vi.mock('../app/dashboard/notifications/notifications-view', () => ({ default: () => null }))
import LoginPage from '../app/login/page'
import DashboardPage from '../app/dashboard/page'
import DashboardLayout from '../app/dashboard/layout'
import FriendsPage from '../app/dashboard/friends/page'
import FriendProfile from '../app/dashboard/friends/[id]/page'
import NotificationsPage from '../app/dashboard/notifications/page'
import TransactionsPage from '../app/dashboard/transactions/page'
import TransactionDetails from '../app/dashboard/transactions/[id]/page'
import SubjectsPage from '../app/dashboard/subjects/page'
import BalancesPage from '../app/dashboard/balances/page'
import FriendLedger from '../app/dashboard/balances/[friendId]/page'
import SettlementsPage from '../app/dashboard/settlements/page'
import SettlementDetails from '../app/dashboard/settlements/[id]/page'
import SettingsPage from '../app/dashboard/settings/page'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.redirect.mockImplementation(() => { throw new Error('redirect') })
})

it('authorizes account settings before displaying profile information', async () => {
  mocks.requireUser.mockRejectedValue(new Error('unauthorized'))
  await expect(SettingsPage()).rejects.toThrow('unauthorized')
  expect(mocks.requireUser).toHaveBeenCalledOnce()
})

it('redirects an authenticated visitor away from login', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'verified-user' } })
  await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect')
  expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
})

it('authorizes the dashboard page before rendering user data', async () => {
  mocks.requireUser.mockRejectedValue(new Error('unauthorized'))
  await expect(DashboardPage()).rejects.toThrow('unauthorized')
  expect(mocks.requireUser).toHaveBeenCalledOnce()
})

it('guards the whole dashboard subtree on the server', async () => {
  mocks.requireUser.mockRejectedValue(new Error('unauthorized'))
  await expect(DashboardLayout({ children: null })).rejects.toThrow('unauthorized')
  expect(mocks.requireUser).toHaveBeenCalledOnce()
})

it('guards friendship lists, profiles and notifications before reading data', async () => {
  mocks.requireUser.mockRejectedValue(new Error('unauthorized'))
  await expect(FriendsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('unauthorized')
  await expect(FriendProfile({ params: Promise.resolve({ id: 'forged-user' }) })).rejects.toThrow('unauthorized')
  await expect(NotificationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('unauthorized')
})
it('guards favor history, details and private subjects before reading data', async () => {
  mocks.requireUser.mockRejectedValue(new Error('unauthorized'))
  await expect(TransactionsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('unauthorized')
  await expect(TransactionDetails({ params: Promise.resolve({ id: 'forged-favor' }) })).rejects.toThrow('unauthorized')
  await expect(SubjectsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('unauthorized')
})
it('authorizes balance, ledger and settlement routes before reading any data',async()=>{
  mocks.requireUser.mockRejectedValue(new Error('unauthorized'))
  await expect(BalancesPage({searchParams:Promise.resolve({})})).rejects.toThrow('unauthorized')
  await expect(FriendLedger({params:Promise.resolve({friendId:'forged-user'}),searchParams:Promise.resolve({})})).rejects.toThrow('unauthorized')
  await expect(SettlementsPage({searchParams:Promise.resolve({})})).rejects.toThrow('unauthorized')
  await expect(SettlementDetails({params:Promise.resolve({id:'forged-settlement'})})).rejects.toThrow('unauthorized')
})
