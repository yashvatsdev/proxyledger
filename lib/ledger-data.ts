import 'server-only'
import { cache } from 'react'
import { getPrisma } from './db'
import { createLedgerService } from './ledger-service'
import { timeOperation } from './performance-timing'
export const getLedgerOverview = cache((actor: string, circleIds: string[] = []) => timeOperation('business-logic',()=>createLedgerService(getPrisma()).overview(actor,circleIds)))
export const getLedgerTotals = cache((actor: string) => createLedgerService(getPrisma()).totals(actor))
