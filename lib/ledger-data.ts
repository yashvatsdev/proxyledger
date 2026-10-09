import { cache } from 'react'
import { getPrisma } from './db'
import { createLedgerService } from './ledger-service'
export const getLedgerOverview = cache((actor: string) => createLedgerService(getPrisma()).overview(actor))
export const getLedgerTotals = cache((actor: string) => createLedgerService(getPrisma()).totals(actor))
