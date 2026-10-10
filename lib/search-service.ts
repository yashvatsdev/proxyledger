import 'server-only'
import type { PrismaClient } from '@/generated/prisma/client'
import { entityId } from './friend-types'
import { createFavorsService } from './favors-service'
import { createLedgerService } from './ledger-service'
import { favorDirection } from './favor-types'
import { balanceExplanation } from './settlement-types'
import { workspaceSearchInput, type SearchGroup } from './search-types'
import { consumeRateLimit } from './rate-limit'

export class WorkspaceSearchError extends Error {}
export function createWorkspaceSearch(db: PrismaClient) {
  return async (actor: string, input: unknown): Promise<SearchGroup[]> => {
    entityId.parse(actor)
    const { query } = workspaceSearchInput.parse(input)
    if (!await consumeRateLimit(db, actor, 'workspace-search', 60, 60000)) throw new WorkspaceSearchError('Too many searches. Please try again in a minute.')
    const favors = createFavorsService(db)
    const [people, subjects, transactions] = await Promise.all([
      createLedgerService(db).list(actor, { q: query, sort: 'name' }),
      favors.subjects(actor, { query }),
      favors.list(actor, { q: query }),
    ])
    const q = encodeURIComponent(query)
    return [
      { label: 'Friends & shared ledgers', count: people.count, href: `/dashboard/balances?q=${q}`, items: people.rows.slice(0, 4).map(row => ({ id: row.person.id, title: row.person.name || 'Your friend', description: balanceExplanation(row.balance, row.person.name), href: `/dashboard/balances/${row.person.id}` })) },
      { label: 'Your subjects', count: subjects.count, href: `/dashboard/subjects?q=${q}`, items: subjects.rows.slice(0, 4).map(row => ({ id: row.id, title: row.name, description: `${row._count.favors} recorded favors`, href: `/dashboard/transactions?subject=${row.id}` })) },
      { label: 'Transactions', count: transactions.count, href: `/dashboard/transactions?q=${q}`, items: transactions.rows.slice(0, 4).map(row => ({ id: row.id, title: favorDirection(row, actor), description: `${row.subject?.name || 'Subject not recorded'} · ${row.status.toLowerCase()}`, href: `/dashboard/transactions/${row.id}` })) },
    ]
  }
}
