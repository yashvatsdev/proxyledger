import 'server-only'
import { cache } from 'react'
import { getPrisma } from './db'
import { createFriendsService } from './friends-service'

// Deduplicate layout/page reads within one render, never between users or requests.
export const getCircleUnread = cache((actor: string) => getPrisma().notification.count({ where: { userId: actor, readAt: null } }))
export const getCircleSummary = cache(async (actor: string) => createFriendsService(getPrisma()).summary(actor,await getCircleUnread(actor)))
