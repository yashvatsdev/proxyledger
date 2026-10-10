'use server'

import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createWorkspaceSearch, WorkspaceSearchError } from '@/lib/search-service'
import { workspaceSearchInput, type SearchGroup } from '@/lib/search-types'
import type { ActionResult } from '@/lib/friend-types'

export async function searchWorkspace(input: unknown): Promise<ActionResult<SearchGroup[]>> {
  const user = await requireUser()
  const parsed = workspaceSearchInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter between 2 and 80 characters.' }
  try { return { ok: true, data: await createWorkspaceSearch(getPrisma())(user.id, parsed.data) } }
  catch (error) { return { ok: false, error: error instanceof WorkspaceSearchError ? error.message : 'Search is unavailable. Please try again.' } }
}
