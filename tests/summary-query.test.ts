import { expect, it, vi } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { createFriendsService } from '../lib/friends-service'
import { createFavorsService } from '../lib/favors-service'
it('consolidates circle counts and reuses the request-scoped unread value',async()=>{
  const raw=vi.fn().mockResolvedValue([{accepted:BigInt(2),incoming:BigInt(1),outgoing:BigInt(3)}])
  const count=vi.fn()
  const db={ $queryRaw:raw, notification:{count},friendship:{findMany:vi.fn().mockResolvedValue([])}} as unknown as PrismaClient
  expect(await createFriendsService(db).summary('verified-actor',4)).toEqual({accepted:2,incoming:1,outgoing:3,unread:4,preview:[]})
  expect(raw).toHaveBeenCalledTimes(1)
  expect(count).not.toHaveBeenCalled()
  expect(raw.mock.calls[0][0].values).toContain('verified-actor')
})
it('consolidates favor counts without fetching the optional recent list',async()=>{
  const raw=vi.fn().mockResolvedValue([{confirmed:BigInt(2),pending:BigInt(3),awaiting:BigInt(1)}])
  const find=vi.fn().mockResolvedValue([])
  const db={$queryRaw:raw,favor:{findMany:find}} as unknown as PrismaClient
  expect(await createFavorsService(db).summary('verified-actor',false)).toEqual({confirmed:2,pending:3,awaiting:1,recent:[],recentConfirmed:[]})
  expect(raw).toHaveBeenCalledTimes(1)
  expect(find).toHaveBeenCalledTimes(1)
})
