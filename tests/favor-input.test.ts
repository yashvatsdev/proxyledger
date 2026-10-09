import { describe, expect, it } from 'vitest'
import { createFavorInput, favorFilters, subjectInput, attendanceDate, todayAttendance, favorDirection, type FavorRecord } from '../lib/favor-types'
import { calculateBilateralBalance } from '../lib/ledger'

describe('favor inputs and semantics', () => {
  it('uses valid canonical calendar dates independent of browser timezone', () => {
    expect(attendanceDate.parse('2020-02-29')).toBe('2020-02-29')
    expect(attendanceDate.parse(todayAttendance())).toBe(todayAttendance())
    for (const date of ['2020-02-30', '2020-1-2', '2020-01-01T00:00:00Z', '2099-01-01', '1899-01-01']) expect(attendanceDate.safeParse(date).success).toBe(false)
  })
  it('requires a friend, subject, explicit direction and idempotency key', () => {
    expect(createFavorInput.safeParse({}).success).toBe(false)
    expect(createFavorInput.safeParse({ friendId: 'b', subjectId: 's', direction: 'provided', attendanceDate: '2020-01-01', submissionKey: 'not-a-uuid' }).success).toBe(false)
  })
  it('bounds subjects, notes, queries and pagination', () => {
    for (const name of ['', '   ', 'x'.repeat(101), 'Math\u0000']) expect(subjectInput.safeParse({ name }).success).toBe(false)
    expect(subjectInput.parse({ name: '  Physics ' })).toEqual({ name: 'Physics' })
    expect(favorFilters.safeParse({ q: 'x'.repeat(81) }).success).toBe(false)
    expect(favorFilters.safeParse({ page: 1001 }).success).toBe(false)
    expect(favorFilters.safeParse({ from: '2020-02-01', to: '2020-01-01' }).success).toBe(false)
  })
  it('describes the same favor correctly from both participants', () => {
    const row = { provider: { id: 'a', name: 'Yash' }, beneficiary: { id: 'b', name: 'Rahul' } } as FavorRecord
    expect(favorDirection(row, 'a')).toBe('You helped Rahul')
    expect(favorDirection(row, 'b')).toBe('Yash helped you')
  })
  it('canceled, rejected, pending and reversed records have no ledger effect', () => {
    expect(calculateBilateralBalance('a', 'b', ['CANCELED', 'REJECTED', 'PENDING', 'REVERSED'].map(status => ({ providerId: 'a', beneficiaryId: 'b', status: status as 'CANCELED' | 'REJECTED' | 'PENDING' | 'REVERSED' })))).toBe(0)
  })
})
