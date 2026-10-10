import { z } from 'zod'
export const workspaceSearchInput = z.object({ query: z.string().trim().min(2).max(80) })
export type SearchItem = { id: string; title: string; description: string; href: string }
export type SearchGroup = { label: string; items: SearchItem[]; count: number; href: string }
