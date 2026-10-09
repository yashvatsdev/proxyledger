import { z } from 'zod'
import { entityId, type PublicPerson } from './friend-types'

// Attendance is a calendar date, stored as UTC midnight. The product's college
// calendar uses Asia/Kolkata; timestamps remain real instants.
export function todayAttendance() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}
export const attendanceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= todayAttendance()
}, 'Choose a valid date on or before today.')
export const createFavorInput = z.object({
  friendId: entityId, direction: z.enum(['provided', 'received']), subjectId: entityId,
  attendanceDate, note: z.string().trim().max(2000).default(''), submissionKey: z.uuid(),
})
export const changeFavorInput = z.object({ id: entityId, operation: z.enum(['confirm', 'reject', 'cancel']) })
export const subjectInput = z.object({ name: z.string().trim().min(1).max(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Use a plain subject name.') })
export const choiceInput = z.object({ query: z.string().trim().max(80).default(''), page: z.number().int().min(1).max(1000).default(1) })
export const favorFilters = z.object({
  status: z.enum(['all', 'pending', 'awaiting', 'confirmed', 'closed']).default('all'),
  q: z.string().trim().max(80).default(''), friend: entityId.optional(), subject: entityId.optional(),
  from: attendanceDate.optional(), to: attendanceDate.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
}).refine(value => !value.from || !value.to || value.from <= value.to, 'The end date must follow the start date.')
export type FavorFilters = z.infer<typeof favorFilters>
export type FavorRecord = {
  id: string; provider: PublicPerson; beneficiary: PublicPerson; createdBy: PublicPerson
  subject: { id: string; name: string } | null; status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELED' | 'REVERSED'
  note: string | null; attendanceDate: string; createdAt: string; updatedAt: string; confirmedAt: string | null; resolvedAt: string | null
}
export type FavorSummary = { confirmed: number; pending: number; awaiting: number; recent: FavorRecord[]; recentConfirmed: FavorRecord[] }
export function favorDirection(row: FavorRecord, actor: string) {
  return row.provider.id === actor ? `You helped ${row.beneficiary.name || 'your friend'}` : `${row.provider.name || 'Your friend'} helped you`
}
export function attendanceLabel(date: string) { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) }
