import { cache } from 'react'
import { getPrisma } from './db'
import { createFriendsService } from './friends-service'

// Deduplicate layout/page reads within one render, never between users or requests.
export const getCircleSummary = cache((actor: string) => createFriendsService(getPrisma()).summary(actor))
