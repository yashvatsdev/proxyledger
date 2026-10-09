import { describe, expect, it } from 'vitest'
import { calculateBilateralBalance, favorInputSchema, settlementInputSchema, type LedgerFavor, type LedgerSettlement } from '../lib/ledger'

const favor = (providerId = 'alex', beneficiaryId = 'rahul', status: LedgerFavor['status'] = 'CONFIRMED', subjectId = 'dbms'): LedgerFavor => ({ providerId, beneficiaryId, status, subjectId })
const settlement = (signedAmount: number, requesterId = 'alex', recipientId = 'rahul', status: LedgerSettlement['status'] = 'CONFIRMED'): LedgerSettlement => ({ signedAmount, requesterId, recipientId, status })

describe('bilateral ledger', () => {
  it('is positive when the friend owes the current user', () => expect(calculateBilateralBalance('alex', 'rahul', [favor()])).toBe(1))
  it('is negative when the current user owes the friend', () => expect(calculateBilateralBalance('alex', 'rahul', [favor('rahul', 'alex')])).toBe(-1))
  it('is zero without exchanges or after equal repayment', () => {
    expect(calculateBilateralBalance('alex', 'rahul', [])).toBe(0)
    expect(calculateBilateralBalance('alex', 'rahul', [favor(), favor('rahul', 'alex')])).toBe(0)
  })
  it('counts multiple favors as one unit each', () => expect(calculateBilateralBalance('alex', 'rahul', [favor(), favor(), favor(), favor('rahul', 'alex')])).toBe(2))
  it('allows repayments across subjects and favors without subjects', () => {
    expect(calculateBilateralBalance('alex', 'rahul', [favor(), favor('rahul', 'alex', 'CONFIRMED', 'java')])).toBe(0)
    expect(calculateBilateralBalance('alex', 'rahul', [{ ...favor(), subjectId: null }])).toBe(1)
  })
  it.each(['PENDING', 'REJECTED', 'REVERSED'] as const)('ignores %s favors', (status) => expect(calculateBilateralBalance('alex', 'rahul', [favor('alex', 'rahul', status)])).toBe(0))
  it('applies confirmed settlements in both signed directions', () => {
    expect(calculateBilateralBalance('alex', 'rahul', [favor(), favor()], [settlement(-2)])).toBe(0)
    expect(calculateBilateralBalance('alex', 'rahul', [favor('rahul', 'alex')], [settlement(1)])).toBe(0)
    expect(calculateBilateralBalance('alex', 'rahul', [], [settlement(-3, 'rahul', 'alex')])).toBe(3)
  })
  it('ignores unconfirmed settlements and unrelated participants', () => {
    expect(calculateBilateralBalance('alex', 'rahul', [favor('alex', 'neha')], [settlement(2, 'alex', 'rahul', 'PENDING'), settlement(2, 'alex', 'rahul', 'REJECTED'), settlement(3, 'alex', 'neha')])).toBe(0)
  })
  it('is antisymmetric for the same records', () => {
    const favors = [favor(), favor(), favor('rahul', 'alex')]
    const settlements = [settlement(-2)]
    expect(calculateBilateralBalance('alex', 'rahul', favors, settlements)).toBe(-calculateBilateralBalance('rahul', 'alex', favors, settlements))
  })
  it('rejects invalid identities and settlement amounts', () => {
    expect(() => calculateBilateralBalance('alex', 'alex', [])).toThrow()
    expect(() => calculateBilateralBalance('alex', 'rahul', [favor('alex', 'alex')])).toThrow()
    for (const amount of [0, 0.5, NaN, Infinity, 2147483648]) expect(() => settlementInputSchema.parse(settlement(amount))).toThrow()
    expect(() => settlementInputSchema.parse(settlement(1, 'alex', 'alex'))).toThrow()
  })
  it('requires the favor creator to be a participant', () => {
    const input = { ...favor(), createdById: 'alex', occurredAt: new Date() }
    expect(favorInputSchema.safeParse(input).success).toBe(true)
    expect(favorInputSchema.safeParse({ ...input, createdById: 'neha' }).success).toBe(false)
    expect(favorInputSchema.safeParse({ ...input, beneficiaryId: 'alex' }).success).toBe(false)
  })
})
