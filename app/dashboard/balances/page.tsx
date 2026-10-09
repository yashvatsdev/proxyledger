import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createLedgerService } from '@/lib/ledger-service'
import { balanceFilters } from '@/lib/settlement-types'
import BalancesView from './balances-view'

export default async function BalancesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const user=await requireUser()
  const params=await searchParams
  const parsed=balanceFilters.safeParse(Object.fromEntries(Object.entries(params).filter(([,value])=>typeof value==='string'&&value!=='')))
  const filters=parsed.success?parsed.data:balanceFilters.parse({})
  const service=createLedgerService(getPrisma())
  const [result,summary]=await Promise.all([service.list(user.id,filters),service.totals(user.id)])
  return <BalancesView filters={filters} result={result} summary={summary} invalid={!parsed.success}/>
}
