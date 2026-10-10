import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
import { getTestPrisma } from './helpers/test-database'
import { createLedgerService } from '../lib/ledger-service'
import { createSettlementsService } from '../lib/settlements-service'
import { createFavorsService } from '../lib/favors-service'
import { createFriendsService } from '../lib/friends-service'
import { calculateBilateralBalance } from '../lib/ledger'
import { lockLedgerPair } from '../lib/ledger-lock'
import { createWorkspaceSearch } from '../lib/search-service'
import { consumeRateLimit } from '../lib/rate-limit'

describe.skipIf(process.env.RUN_LEDGER_DB_TESTS!=='1')('PostgreSQL global ledger and settlement integration',()=>{
  const db=getTestPrisma(process.env.RUN_LEDGER_DB_TESTS==='1'),ledger=createLedgerService(db),settlements=createSettlementsService(db),favors=createFavorsService(db),friends=createFriendsService(db)
  const ids=[randomUUID(),randomUUID(),randomUUID(),randomUUID()]
  const [a,b,c,outsider]=ids
  it('shares a strict atomic rate limit across concurrent service instances', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit(db, a, 'workspace-search', 4, 60000)))
    expect(results.filter(Boolean)).toHaveLength(4)
    expect((await db.rateLimitBucket.findUniqueOrThrow({ where: { key: `workspace-search:${a}` } })).count).toBe(5)
    expect(await consumeRateLimit(db, b, 'workspace-search', 4, 60000)).toBe(true)
  })
  it('uses the database clock for rate-limit windows despite an application clock mismatch', async () => {
    const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0)
    try { expect(await consumeRateLimit(db, a, 'workspace-search', 4, 60000)).toBe(true) } finally { clock.mockRestore() }
    const bucket = await db.rateLimitBucket.findUniqueOrThrow({ where: { key: `workspace-search:${a}` } })
    expect(bucket.expiresAt.getTime()).toBeGreaterThanOrEqual(now.getTime() + 59000)
    expect(bucket.expiresAt.getTime()).toBeLessThan(now.getTime() + 70000)
    expect(await consumeRateLimit(db, a, 'workspace-search', 4, 60000)).toBe(true)
  })
  let subjectA:string,subjectB:string,connection:string
  async function clear(){
    await db.notification.deleteMany({where:{userId:{in:ids}}})
    await db.settlement.deleteMany({where:{requesterId:{in:ids}}})
    await db.favor.deleteMany({where:{providerId:{in:ids}}})
    await db.subject.deleteMany({where:{ownerId:{in:ids}}})
    await db.friendship.deleteMany({where:{OR:[{requesterId:{in:ids}},{recipientId:{in:ids}}]}})
    await db.rateLimitBucket.deleteMany({where:{key:{in:ids.flatMap(id=>['workspace-search','settlement-create','settlement-change','favor-create','favor-change','favor-subject','favor-choices','mutation'].map(scope=>`${scope}:${id}`))}}})
  }
  beforeAll(async()=>{for(const[index,id]of ids.entries())await db.user.create({data:{id,name:`Phase5Test ${index}`,email:`${id}@example.invalid`}})},20000)
  beforeEach(async()=>{
    await clear()
    subjectA=(await db.subject.create({data:{ownerId:a,name:'Mathematics'}})).id
    subjectB=(await db.subject.create({data:{ownerId:b,name:'Physics'}})).id
    connection=(await db.friendship.create({data:{requesterId:a,recipientId:b,status:'ACCEPTED',connectedAt:new Date()}})).id
    await db.friendship.create({data:{requesterId:a,recipientId:c,status:'ACCEPTED',connectedAt:new Date()}})
  },20000)
  afterAll(async()=>{await clear();await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect()},20000)
  async function seed(count=4,provider=a,beneficiary=b,subject=subjectA){
    const confirmedAt=new Date('2020-01-02T12:00:00Z')
    // Isolated confirmed fixtures exercise the actual view/guards. Production
    // confirmation and its shared pair lock are separately tested below.
    await db.favor.createMany({data:Array.from({length:count},()=>({id:randomUUID(),providerId:provider,beneficiaryId:beneficiary,createdById:provider,subjectId:subject,status:'CONFIRMED',occurredAt:confirmedAt,confirmedAt}))})
  }
  const input=(overrides:Record<string,unknown>={})=>({friendId:b,amount:2,direction:'owes-me',note:'Agreed reduction',submissionKey:randomUUID(),...overrides})
  async function pendingFavor(provider=a,beneficiary=b,subject=subjectA){return favors.create(provider,{friendId:beneficiary,direction:'provided',subjectId:subject,attendanceDate:'2020-01-01',submissionKey:randomUUID()})}
  async function assertPair(expected:number){expect((await ledger.pair(a,b))?.balance).toBe(expected);expect((await ledger.pair(b,a))?.balance).toBe(expected===0?0:-expected)}

  it('searches only owned subjects, participants’ transactions and visible relationships', async () => {
    await seed(1,b,a,subjectB)
    const search=createWorkspaceSearch(db)
    const physics=await search(a,{query:'Physics'})
    expect(physics.find(group=>group.label==='Your subjects')?.count).toBe(0)
    expect(physics.find(group=>group.label==='Transactions')?.count).toBe(1)
    expect((await search(outsider,{query:'Physics'})).every(group=>group.count===0)).toBe(true)
    const users=await search(a,{query:'Phase5Test'})
    expect(users[0].items.map(item=>item.id).sort()).toEqual([b,c].sort())
    expect(JSON.stringify(users)).not.toContain('@example.invalid')
    expect(JSON.stringify(users)).not.toContain(outsider)
    await db.subject.create({data:{ownerId:outsider,name:'PrivateSubjectNeedle'}})
    expect((await search(a,{query:'PrivateSubjectNeedle'})).every(group=>group.count===0)).toBe(true)
  },15000)
  it('bounds search previews while retaining counts and literal wildcard semantics', async () => {
    await db.subject.createMany({data:Array.from({length:7},(_,index)=>({ownerId:a,name:`BoundedNeedle ${index}`}))})
    const search=createWorkspaceSearch(db)
    const subjects=(await search(a,{query:'BoundedNeedle'}))[1]
    expect(subjects.count).toBe(7);expect(subjects.items).toHaveLength(4)
    expect(subjects.href).toBe('/dashboard/subjects?q=BoundedNeedle')
    expect((await search(a,{query:'%_'})).every(group=>group.count===0)).toBe(true)
  })
  it('keeps shared historical ledgers searchable after removal without revealing unrelated users', async () => {
    await seed(1)
    await friends.change(a,'remove',connection)
    const results=await createWorkspaceSearch(db)(a,{query:'Phase5Test 1'})
    expect(results[0].items.map(item=>item.id)).toEqual([b])
    expect(results[0].items[0].href).toBe(`/dashboard/balances/${b}`)
  })
  it('enforces persisted per-user search limits without blocking another user', async () => {
    await db.rateLimitBucket.create({data:{key:`workspace-search:${a}`,count:60,expiresAt:new Date(Date.now()+60000)}})
    await expect(createWorkspaceSearch(db)(a,{query:'Math'})).rejects.toThrow('Too many searches')
    expect((await createWorkspaceSearch(db)(b,{query:'Physics'}))[1].count).toBe(1)
  })

  it('returns zero for accepted friends with no favors and hides unrelated profiles',async()=>{
    await assertPair(0)
    expect((await ledger.totals(a)).settledCount).toBe(2)
    expect(await ledger.pair(outsider,a)).toBeNull()
    expect((await ledger.list(outsider)).rows).toEqual([])
    expect((await ledger.entries(outsider,b)).count).toBe(0)
  })
  it('counts each confirmed favor once, globally across subjects, with opposite views',async()=>{
    const forward=await pendingFavor();await favors.change(b,{id:forward,operation:'confirm'});await assertPair(1)
    const reverse=await pendingFavor(b,a,subjectB);await favors.change(a,{id:reverse,operation:'confirm'});await assertPair(0)
    await seed(3);await assertPair(3)
    const rows=await db.favor.findMany({where:{OR:[{providerId:a,beneficiaryId:b},{providerId:b,beneficiaryId:a}]}})
    expect(calculateBilateralBalance(a,b,rows)).toBe(3)
  },15000)
  it('ignores pending, rejected, canceled and reversed favor records',async()=>{
    await seed(1)
    await pendingFavor()
    const rejected=await pendingFavor();await favors.change(b,{id:rejected,operation:'reject'})
    const canceled=await pendingFavor();await favors.change(a,{id:canceled,operation:'cancel'})
    await db.favor.create({data:{providerId:a,beneficiaryId:b,createdById:a,status:'REVERSED',occurredAt:new Date(),confirmedAt:new Date()}})
    await assertPair(1)
  },15000)
  it('aggregates dashboard totals and relationship counts without netting different friends',async()=>{
    await seed(4);await seed(2,c,a)
    expect(await ledger.totals(a)).toMatchObject({owedToMe:4,iOwe:2,owesMeCount:1,iOweCount:1,outstandingCount:2,settledCount:0,relationshipCount:2})
    const overview=await ledger.overview(a,[b,c])
    expect(overview.preview).toHaveLength(2)
    expect(overview.summary).toEqual(await ledger.totals(a))
    expect(overview.preview).toEqual((await ledger.list(a,{sort:'recent'})).rows.slice(0,4))
    expect(overview.recent).toEqual((await ledger.entries(a)).rows.slice(0,5))
    expect(overview.circleBalances).toEqual(Object.fromEntries((await ledger.balancesFor(a,[b,c])).map(row=>[row.person.id,row.balance])))
    const outsider=await ledger.overview(ids[3])
    expect(outsider.recent).toEqual([])
    expect(outsider.summary.relationshipCount).toBe(0)
    const id=await settlements.propose(a,input());await settlements.change(b,{id,operation:'confirm'})
    expect(await ledger.totals(a)).toMatchObject({owedToMe:2,iOwe:2})
  })
  it('creates creditor requests with a negative requester adjustment and no pending balance change',async()=>{
    await seed()
    const id=await settlements.propose(a,input())
    expect(await settlements.detail(a,id)).toMatchObject({amount:2,signedAmount:-2,status:'PENDING',debtor:{id:b},creditor:{id:a},requester:{id:a},recipient:{id:b},confirmedAt:null})
    await assertPair(4)
    expect(await ledger.totals(b)).toMatchObject({pendingSettlements:1,incomingSettlements:1})
    const notification=(await friends.notifications(b)).rows.find(row=>row.settlementId===id)
    expect(notification?.href).toBe(`/dashboard/settlements/${id}`)
    expect(await db.notification.count({where:{settlementId:id,userId:b,type:'SETTLEMENT_REQUEST_RECEIVED'}})).toBe(1)
  })
  it('lets the debtor propose a positive requester adjustment and the creditor confirm',async()=>{
    await seed()
    const id=await settlements.propose(b,input({friendId:a,direction:'i-owe'}))
    expect((await settlements.detail(a,id))?.signedAmount).toBe(2)
    await settlements.change(a,{id,operation:'confirm'});await assertPair(2)
  })
  it('applies partial and full settlements and keeps every original favor unchanged',async()=>{
    await seed()
    const before=await db.favor.findMany({where:{providerId:a},orderBy:{id:'asc'}})
    const partial=await settlements.propose(a,input());await settlements.change(b,{id:partial,operation:'confirm'});await assertPair(2)
    const full=await settlements.propose(b,input({friendId:a,direction:'i-owe'}));await settlements.change(a,{id:full,operation:'confirm'});await assertPair(0)
    expect(await db.favor.findMany({where:{providerId:a},orderBy:{id:'asc'}})).toEqual(before)
    expect(await ledger.totals(a)).toMatchObject({outstandingCount:0,settledCount:2})
  },15000)
  it.each([0,-1,1.5,NaN,Infinity,2147483648])('rejects invalid amount %s',async amount=>{
    await seed();await expect(settlements.propose(a,input({amount}))).rejects.toThrow()
    expect(await db.settlement.count({where:{requesterId:a}})).toBe(0)
  })
  it('rejects excessive, reversed, self and unrelated proposals',async()=>{
    await seed(1)
    await expect(settlements.propose(a,input())).rejects.toThrow('debt changed')
    await expect(settlements.propose(a,input({amount:1,direction:'i-owe'}))).rejects.toThrow()
    await expect(settlements.propose(a,input({friendId:a}))).rejects.toThrow('yourself')
    await expect(settlements.propose(a,input({friendId:outsider}))).rejects.toThrow()
    await expect(settlements.propose(a,input({friendId:'missing'}))).rejects.toThrow()
  })
  it('derives requester, recipient, state and signed amount despite forged fields',async()=>{
    await seed()
    const id=await settlements.propose(a,input({requesterId:outsider,recipientId:outsider,debtorId:a,creditorId:outsider,signedAmount:200,status:'CONFIRMED'}))
    expect(await db.settlement.findUnique({where:{id}})).toMatchObject({requesterId:a,recipientId:b,signedAmount:-2,status:'PENDING'})
  })
  it('deduplicates sequential and concurrent creation retries and notifications',async()=>{
    await seed();const value=input()
    const results=await Promise.all([settlements.propose(a,value),settlements.propose(a,value)])
    expect(new Set(results).size).toBe(1);expect(await settlements.propose(a,value)).toBe(results[0])
    await expect(settlements.propose(a,{...value,amount:1})).rejects.toThrow('already used')
    expect(await db.settlement.count({where:{requesterId:a}})).toBe(1)
    expect(await db.notification.count({where:{settlementId:results[0]}})).toBe(1)
  })
  it('replays a completed creation key safely even after full settlement',async()=>{
    await seed(2);const value=input();const id=await settlements.propose(a,value)
    await settlements.change(b,{id,operation:'confirm'})
    expect(await settlements.propose(a,value)).toBe(id);await assertPair(0)
  })
  it('only lets the non-submitting participant confirm once, with persisted timestamps',async()=>{
    await seed();const id=await settlements.propose(a,input())
    await expect(settlements.change(a,{id,operation:'confirm'})).rejects.toThrow()
    await expect(settlements.change(outsider,{id,operation:'confirm'})).rejects.toThrow()
    await settlements.change(b,{id,operation:'confirm'})
    await expect(settlements.change(b,{id,operation:'confirm'})).rejects.toThrow()
    const row=await settlements.detail(a,id);expect(row?.confirmedAt).not.toBeNull();expect(row?.resolvedAt).not.toBeNull()
    expect(await db.notification.count({where:{settlementId:id,userId:a,type:'SETTLEMENT_CONFIRMED'}})).toBe(1)
    expect((await friends.summary(b)).unread).toBe(0);await assertPair(2)
  })
  it('confirms the same request exactly once under simultaneous attempts',async()=>{
    await seed();const id=await settlements.propose(a,input())
    const outcomes=await Promise.allSettled([settlements.change(b,{id,operation:'confirm'}),settlements.change(b,{id,operation:'confirm'})])
    expect(outcomes.filter(row=>row.status==='fulfilled')).toHaveLength(1);await assertPair(2)
    expect(await db.notification.count({where:{settlementId:id,type:'SETTLEMENT_CONFIRMED'}})).toBe(1)
  })
  it('prevents competing two-unit confirmations from overspending three units',async()=>{
    await seed(3)
    const first=await settlements.propose(a,input())
    const second=await settlements.propose(b,input({friendId:a,direction:'i-owe'}))
    const outcomes=await Promise.allSettled([settlements.change(b,{id:first,operation:'confirm'}),settlements.change(a,{id:second,operation:'confirm'})])
    expect(outcomes.filter(row=>row.status==='fulfilled')).toHaveLength(1);await assertPair(1)
    expect(await db.settlement.count({where:{requesterId:{in:ids},status:'CONFIRMED'}})).toBe(1)
    expect(await db.settlement.count({where:{requesterId:{in:ids},status:'PENDING'}})).toBe(1)
  },15000)
  it('allows simultaneous reductions when their combined amount fits exactly',async()=>{
    await seed(4);const first=await settlements.propose(a,input());const second=await settlements.propose(a,input())
    await Promise.all([settlements.change(b,{id:first,operation:'confirm'}),settlements.change(b,{id:second,operation:'confirm'})]);await assertPair(0)
  })
  it('enforces the same over-settlement protection for direct concurrent database updates',async()=>{
    await seed(3);const first=await settlements.propose(a,input());const second=await settlements.propose(a,input())
    const now=new Date()
    const outcomes=await Promise.allSettled([first,second].map(id=>db.settlement.update({where:{id},data:{status:'CONFIRMED',confirmedAt:now,resolvedAt:now}})))
    expect(outcomes.filter(row=>row.status==='fulfilled')).toHaveLength(1);await assertPair(1)
  })
  it('rejects a stale request after an opposite favor reduces the available debt',async()=>{
    await seed(2);const id=await settlements.propose(a,input())
    const reverse=await pendingFavor(b,a,subjectB);await favors.change(a,{id:reverse,operation:'confirm'})
    await expect(settlements.change(b,{id,operation:'confirm'})).rejects.toThrow('debt changed')
    await assertPair(1);expect((await settlements.detail(a,id))?.status).toBe('PENDING')
  })
  it('rejects stale settlement direction after new favors reverse who owes whom',async()=>{
    await seed(1);const id=await settlements.propose(a,input({amount:1}));await seed(2,b,a,subjectB)
    await expect(settlements.change(b,{id,operation:'confirm'})).rejects.toThrow('debt changed');await assertPair(-1)
  })
  it('serializes real favor confirmation with settlement confirmation on the same pair',async()=>{
    await seed(2);const id=await settlements.propose(a,input());const reverse=await pendingFavor(b,a,subjectB)
    const outcomes=await Promise.allSettled([settlements.change(b,{id,operation:'confirm'}),favors.change(a,{id:reverse,operation:'confirm'})])
    expect(outcomes[1].status).toBe('fulfilled')
    const settled=(await settlements.detail(a,id))?.status==='CONFIRMED'
    await assertPair(settled?-1:1)
    // -1 is valid only if the settlement fully reduced the debt FIRST and a
    // later confirmed attendance favor then created new opposite debt.
  },15000)
  it('holds the pair lock before a competing favor mutation can commit',async()=>{
    const id=await pendingFavor()
    let release!:()=>void,locked!:()=>void
    const ready=new Promise<void>(resolve=>{locked=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
    const holder=db.$transaction(async tx=>{await lockLedgerPair(tx,a,b);locked();await gate},{timeout:15000})
    await ready
    let completed=false
    const contender=favors.change(b,{id,operation:'confirm'}).then(()=>{completed=true})
    try { await new Promise(resolve=>setTimeout(resolve,150));expect(completed).toBe(false) } finally { release() }
    await holder;await contender;await assertPair(1)
  })
  it('supports authorized rejection and retains zero-effect audit rows',async()=>{
    await seed();const id=await settlements.propose(a,input())
    await expect(settlements.change(a,{id,operation:'reject'})).rejects.toThrow()
    await expect(settlements.change(outsider,{id,operation:'reject'})).rejects.toThrow()
    await settlements.change(b,{id,operation:'reject'})
    await expect(settlements.change(b,{id,operation:'confirm'})).rejects.toThrow()
    expect(await settlements.detail(a,id)).toMatchObject({status:'REJECTED',confirmedAt:null})
    expect(await db.notification.count({where:{settlementId:id,userId:a,type:'SETTLEMENT_REJECTED'}})).toBe(1);await assertPair(4)
  })
  it('only permits submitter cancellation while pending and preserves the request',async()=>{
    await seed();const id=await settlements.propose(a,input())
    await expect(settlements.change(b,{id,operation:'cancel'})).rejects.toThrow()
    await expect(settlements.change(outsider,{id,operation:'cancel'})).rejects.toThrow()
    await settlements.change(a,{id,operation:'cancel'})
    await expect(settlements.change(b,{id,operation:'confirm'})).rejects.toThrow()
    expect(await settlements.detail(b,id)).toMatchObject({status:'CANCELED',confirmedAt:null})
    expect(await db.notification.count({where:{settlementId:id,userId:b,type:'SETTLEMENT_CANCELED'}})).toBe(1);await assertPair(4)
  })
  it('has one terminal transition when confirm races reject or cancel',async()=>{
    await seed()
    for(const operation of ['reject','cancel']as const){const id=await settlements.propose(a,input({amount:1}));const result=await Promise.allSettled([settlements.change(b,{id,operation:'confirm'}),settlements.change(operation==='cancel'?a:b,{id,operation})]);expect(result.filter(row=>row.status==='fulfilled')).toHaveLength(1)}
  },15000)
  it('blocks all terminal-state transitions and direct confirmed-content tampering',async()=>{
    await seed();const id=await settlements.propose(a,input());await settlements.change(b,{id,operation:'confirm'})
    for(const operation of ['confirm','reject','cancel']as const)await expect(settlements.change(operation==='cancel'?a:b,{id,operation})).rejects.toThrow()
    await expect(db.settlement.update({where:{id},data:{signedAmount:-1}})).rejects.toThrow()
    await expect(db.settlement.update({where:{id},data:{status:'CANCELED',confirmedAt:null}})).rejects.toThrow()
  })
  it('keeps balances, profiles and settlement lifecycle available after friendship removal',async()=>{
    await seed();const id=await settlements.propose(a,input());await friends.change(a,'remove',connection)
    expect((await ledger.pair(a,b))?.connected).toBe(false)
    await settlements.change(b,{id,operation:'confirm'});await assertPair(2)
    const next=await settlements.propose(b,input({friendId:a,direction:'i-owe'}));await settlements.change(a,{id:next,operation:'confirm'});await assertPair(0)
    expect((await ledger.entries(a,b)).count).toBe(6)
    await expect(pendingFavor()).rejects.toThrow('friendship')
  },15000)
  it('does not expose private settlement/history fields to unrelated users',async()=>{
    await seed();const id=await settlements.propose(a,input())
    expect(await settlements.detail(outsider,id)).toBeNull();expect((await settlements.list(outsider)).count).toBe(0)
    expect(JSON.stringify(await settlements.detail(b,id))).not.toContain('@example.invalid')
    expect(Object.keys((await ledger.pair(a,b))!.person).sort()).toEqual(['id','image','name'])
  })
  it('filters balances and sorting server-side and reads the profile totals correctly',async()=>{
    await seed(4);await seed(2,c,a)
    expect((await ledger.list(a,{tab:'owes-me'})).rows.map(row=>row.person.id)).toEqual([b])
    expect((await ledger.list(a,{tab:'i-owe'})).rows.map(row=>row.person.id)).toEqual([c])
    expect((await ledger.list(a,{sort:'owed'})).rows[0].balance).toBe(4)
    expect((await ledger.list(a,{sort:'owe'})).rows[0].balance).toBe(-2)
    expect((await ledger.list(a,{q:'%'})).count).toBe(0)
    expect((await ledger.list(a,{q:'Phase5Test 1'})).count).toBe(1)
    expect((await ledger.balancesFor(a,[b,c])).map(row=>row.balance).sort((x,y)=>x-y)).toEqual([-2,4])
    expect((await ledger.pair(a,b))?.favors).toBe(4)
  })
  it('builds stable paginated timelines with correct per-event signed running balances',async()=>{
    await seed(21);const request=await settlements.propose(a,input());await settlements.change(b,{id:request,operation:'confirm'})
    const first=await ledger.entries(a,b),second=await ledger.entries(a,b,2)
    expect(first.rows).toHaveLength(20);expect(second.rows).toHaveLength(2);expect(first.count).toBe(22)
    expect(new Set([...first.rows,...second.rows].map(row=>`${row.kind}:${row.id}`)).size).toBe(22)
    expect((await ledger.entries(a,b)).rows.map(row=>row.id)).toEqual(first.rows.map(row=>row.id))
    expect(first.rows[0]).toMatchObject({id:request,kind:'settlement',delta:-2,resultingBalance:19})
    expect((await ledger.entries(b,a)).rows[0]).toMatchObject({delta:2,resultingBalance:-19})
    const chronological=[...first.rows,...second.rows].reverse();let running=0
    for(const row of chronological){running+=row.delta;expect(row.resultingBalance).toBe(running)}
  })
  it('paginates settlement inbox and separates incoming/outgoing and closed requests',async()=>{
    await seed(2)
    for(let index=0;index<21;index++)await settlements.propose(a,input({amount:1}))
    const incoming=await settlements.list(b,{tab:'incoming'}),outgoing=await settlements.list(a,{tab:'outgoing',page:2})
    expect(incoming.count).toBe(21);expect(incoming.rows).toHaveLength(20);expect(outgoing.rows).toHaveLength(1)
    expect((await settlements.list(a,{tab:'incoming'})).count).toBe(0)
    await settlements.change(a,{id:incoming.rows[0].id,operation:'cancel'})
    expect((await settlements.list(a,{tab:'closed'})).count).toBe(1)
  },20000)
  it('paginates balances without loading the entire relationship list into the client',async()=>{
    for(let index=0;index<21;index++){
      const id=randomUUID();ids.push(id)
      await db.user.create({data:{id,name:`Phase5Test extra ${index}`,email:`${id}@example.invalid`}})
      await db.friendship.create({data:{requesterId:a,recipientId:id,status:'ACCEPTED',connectedAt:new Date()}})
    }
    const first=await ledger.list(a,{sort:'name'}),second=await ledger.list(a,{sort:'name',page:2})
    expect(first.rows).toHaveLength(20);expect(second.rows).toHaveLength(3);expect(first.count).toBe(23)
    expect(new Set([...first.rows,...second.rows].map(row=>row.person.id)).size).toBe(23)
    expect((await ledger.totals(a)).settledCount).toBe(23)
  },20000)
  it('only allows notification owners to mark read and never confirms on notification read',async()=>{
    await seed();const id=await settlements.propose(a,input());const notice=await db.notification.findFirstOrThrow({where:{settlementId:id}})
    await expect(friends.markRead(a,notice.id)).rejects.toThrow();await friends.markRead(b,notice.id)
    expect((await settlements.detail(b,id))?.status).toBe('PENDING');await assertPair(4)
  })
  it('rate limits settlement proposals atomically across concurrent calls',async()=>{
    const result=await Promise.allSettled(Array.from({length:21},()=>settlements.rateLimit(a,'create')))
    expect(result.filter(row=>row.status==='fulfilled')).toHaveLength(20);await settlements.rateLimit(b,'create')
  })
})
