import { beforeEach,expect,it,vi } from 'vitest'
const mock=vi.hoisted(()=>({requireUser:vi.fn(),rateLimit:vi.fn(),propose:vi.fn(),change:vi.fn(),revalidate:vi.fn()}))
vi.mock('../lib/auth-session',()=>({requireUser:mock.requireUser}))
vi.mock('../lib/db',()=>({getPrisma:()=>({})}))
vi.mock('../lib/settlements-service',()=>({SettlementError:class extends Error{},createSettlementsService:()=>mock}))
vi.mock('next/cache',()=>({revalidatePath:mock.revalidate}))
import { proposeSettlement,resolveSettlement } from '../app/dashboard/settlements/actions'
const input={friendId:'friend',amount:2,direction:'owes-me',submissionKey:'11111111-1111-4111-8111-111111111111'}
beforeEach(()=>{vi.resetAllMocks();mock.requireUser.mockResolvedValue({id:'session-actor'});mock.propose.mockResolvedValue('settlement')})
it.each([()=>proposeSettlement(input),()=>resolveSettlement({id:'settlement',operation:'confirm'})])('authenticates before any validation or database access',async action=>{
  mock.requireUser.mockRejectedValue(new Error('unauthenticated'))
  await expect(action()).rejects.toThrow('unauthenticated');expect(mock.rateLimit).not.toHaveBeenCalled()
})
it('derives the actor from the session and strips forged ledger identities, state and signed balance',async()=>{
  expect(await proposeSettlement({...input,actorId:'outsider',requesterId:'outsider',debtorId:'outsider',creditorId:'outsider',signedAmount:99,status:'CONFIRMED',balance:99})).toEqual({ok:true,data:'settlement'})
  expect(mock.propose).toHaveBeenCalledWith('session-actor',{...input,note:''})
  expect(mock.rateLimit).toHaveBeenCalledWith('session-actor','create')
  expect(mock.revalidate).toHaveBeenCalledWith('/dashboard','layout')
})
it.each(['confirm','reject','cancel'])('passes only a validated %s and session identity',async operation=>{
  await resolveSettlement({id:'settlement',operation,actorId:'outsider'});expect(mock.change).toHaveBeenCalledWith('session-actor',{id:'settlement',operation})
})
it('rejects invalid amounts and operations without touching the database',async()=>{
  for(const amount of [0,-1,1.5])expect((await proposeSettlement({...input,amount})).ok).toBe(false)
  expect((await resolveSettlement({id:'settlement',operation:'delete'})).ok).toBe(false)
  expect(mock.rateLimit).not.toHaveBeenCalled()
})
it('suppresses sensitive backend errors and does not invalidate on failure',async()=>{
  mock.propose.mockRejectedValue(new Error('secret database credentials'))
  expect(JSON.stringify(await proposeSettlement(input))).not.toContain('credentials');expect(mock.revalidate).not.toHaveBeenCalled()
})
