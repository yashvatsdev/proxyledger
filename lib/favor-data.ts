import 'server-only'
import { cache } from 'react'
import { getPrisma } from './db'
import { createFavorsService } from './favors-service'
export const getFavorSummary = cache((actor: string) => createFavorsService(getPrisma()).summary(actor, false))
