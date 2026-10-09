import { expect,it } from 'vitest'
import { proposeSettlementInput,balanceFilters,balanceExplanation,signedUnits } from '../lib/settlement-types'
import { calculateBilateralBalance,settlementDelta,settlementParties } from '../lib/ledger'

it('turns positive proposed amounts into signed requester deltas in both directions',()=>{
  expect(settlementDelta(4,2,'owes-me')).toBe(-2)
  expect(settlementDelta(-4,2,'i-owe')).toBe(2)
  expect(settlementParties('a','b',-2)).toEqual({debtorId:'b',creditorId:'a'})
  expect(settlementParties('b','a',2)).toEqual({debtorId:'b',creditorId:'a'})
})
it('never reduces debt below zero or accepts stale direction',()=>{
  for(const balance of [-5,-1,1,5])for(let amount=1;amount<=Math.abs(balance);amount++){
    const after=balance+settlementDelta(balance,amount,balance>0?'owes-me':'i-owe')
    expect(Math.abs(after)).toBeLessThan(Math.abs(balance));expect(after===0||Math.sign(after)===Math.sign(balance)).toBe(true)
  }
  for(const [balance,amount,direction]of [[0,1,'owes-me'],[1,2,'owes-me'],[-1,1,'owes-me'],[1,1,'i-owe']]as const)expect(()=>settlementDelta(balance,amount,direction)).toThrow()
})
it('rejects non-integer, nonpositive, excessive and unsafe units',()=>{
  for(const amount of [0,-1,0.5,NaN,Infinity,2147483648])expect(()=>settlementDelta(4,amount,'owes-me')).toThrow()
  expect(()=>settlementDelta(Number.MAX_SAFE_INTEGER+1,1,'owes-me')).toThrow()
  expect(proposeSettlementInput.safeParse({}).success).toBe(false)
  expect(balanceFilters.safeParse({page:1001}).success).toBe(false)
  expect(balanceFilters.safeParse({q:'x'.repeat(81)}).success).toBe(false)
})
it('ignores rejected and canceled settlements and keeps participant symmetry',()=>{
  const rows=[{requesterId:'a',recipientId:'b',signedAmount:-2,status:'CANCELED' as const},{requesterId:'a',recipientId:'b',signedAmount:-2,status:'REJECTED' as const}]
  expect(calculateBilateralBalance('a','b',[],rows)).toBe(0)
  const favors=[{providerId:'a',beneficiaryId:'b',status:'CONFIRMED' as const},{providerId:'a',beneficiaryId:'b',status:'CONFIRMED' as const}]
  const settlement=[{requesterId:'b',recipientId:'a',signedAmount:1,status:'CONFIRMED' as const}]
  expect(calculateBilateralBalance('a','b',favors,settlement)).toBe(1)
  expect(calculateBilateralBalance('b','a',favors,settlement)).toBe(-1)
})
it('explains sign semantics in text, including neutral balances',()=>{
  expect(balanceExplanation(3,'Rahul')).toBe('Rahul owes you 3 proxies.')
  expect(balanceExplanation(-1,'Rahul')).toBe('You owe Rahul 1 proxy.')
  expect(balanceExplanation(0,'Rahul')).toBe('You’re even with Rahul.')
  expect(signedUnits(3)).toBe('+3')
})
