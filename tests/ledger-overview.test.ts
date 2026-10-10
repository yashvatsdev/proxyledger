import { expect, it, vi } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { createLedgerService } from '../lib/ledger-service'

const zero = {owedToMe:0,iOwe:0,owesMeCount:0,iOweCount:0,settledCount:0,outstandingCount:0,relationshipCount:0,pendingSettlements:0,incomingSettlements:0}
it('uses one statement and no acquisition of read transactions for the overview',async()=>{
  const raw=vi.fn().mockResolvedValue([{summary:zero,preview:[],recent:[],circle:[]}])
  const transaction=vi.fn()
  const result=await createLedgerService({$queryRaw:raw,$transaction:transaction} as unknown as PrismaClient).overview('actor',['friend'])
  expect(result).toEqual({summary:zero,preview:[],recent:[],circleBalances:{}})
  expect(raw).toHaveBeenCalledTimes(1)
  expect(transaction).not.toHaveBeenCalled()
  const sql=raw.mock.calls[0][0]
  expect(sql.text).not.toContain("'actor'")
  expect(sql.values).toContain('actor')
  expect(sql.values).toContain('friend')
})
it('keeps safe integer checks and bounded target lists',async()=>{
  const raw=vi.fn().mockResolvedValue([{summary:{...zero,owedToMe:Number.MAX_SAFE_INTEGER+1},preview:[],recent:[],circle:[]}])
  const service=createLedgerService({$queryRaw:raw} as unknown as PrismaClient)
  await expect(service.overview('actor')).rejects.toThrow('safe integer')
  await expect(service.overview('actor',Array(21).fill('friend'))).rejects.toThrow('Too many')
})
