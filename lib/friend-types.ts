import { z } from 'zod'

export const entityId = z.string().trim().min(1).max(128)
export const searchInput = z.object({
  query: z.string().trim().min(3).max(80).refine((query) => query.includes('@') ? z.email().safeParse(query).success : !/[\\%_]/.test(query), 'Use a name prefix without wildcards or a complete email address'),
  page: z.number().int().min(1).max(5).default(1),
})
export const mutationInput = z.object({ id: entityId, operation: z.enum(['send', 'accept', 'reject', 'cancel', 'remove']) })
export type FriendOperation = z.infer<typeof mutationInput>['operation']
export type PublicPerson = { id: string; name: string | null; image: string | null }
export type FriendCard = { id: string; person: PublicPerson & { email: string | null }; status: string; connectedAt: string | null; createdAt: string }
export type CircleSummary = { accepted: number; incoming: number; outgoing: number; unread: number; preview: FriendCard[] }
export type SearchPerson = PublicPerson & { relationship: 'none' | 'accepted' | 'incoming' | 'outgoing'; friendshipId: string | null }
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }
export type FriendTab = 'all' | 'incoming' | 'sent'
