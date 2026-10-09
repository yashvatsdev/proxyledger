import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFavorsService } from '@/lib/favors-service'
import { favorFilters } from '@/lib/favor-types'
import TransactionsView from './transactions-view'

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser()
  const params = await searchParams
  const input = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === 'string' && value !== ''))
  const parsed = favorFilters.safeParse(input)
  const filters = parsed.success ? parsed.data : favorFilters.parse({})
  const result = await createFavorsService(getPrisma()).list(user.id, filters)
  return <TransactionsView actor={user.id} result={result} filters={filters} invalid={!parsed.success} />
}
