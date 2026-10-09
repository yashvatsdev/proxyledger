'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFavorsService, FavorError } from '@/lib/favors-service'
import { createFavorInput, changeFavorInput, subjectInput, choiceInput } from '@/lib/favor-types'
import type { ActionResult } from '@/lib/friend-types'
import { z } from 'zod'

function failure(error: unknown) { return { ok: false as const, error: error instanceof FavorError ? error.message : 'Unable to complete this action. Please try again.' } }
export async function recordFavor(input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser()
  const value = createFavorInput.safeParse(input)
  if (!value.success) return { ok: false, error: 'Check the friend, direction, subject, date and note.' }
  try {
    const service = createFavorsService(getPrisma())
    await service.rateLimit(user.id, 'create')
    const id = await service.create(user.id, value.data)
    revalidatePath('/dashboard', 'layout')
    return { ok: true, data: id }
  } catch (error) { return failure(error) }
}
export async function resolveFavor(input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const value = changeFavorInput.safeParse(input)
  if (!value.success) return { ok: false, error: 'Invalid favor action.' }
  try {
    const service = createFavorsService(getPrisma())
    await service.rateLimit(user.id, 'change')
    await service.change(user.id, value.data)
    revalidatePath('/dashboard', 'layout')
    return { ok: true, data: null }
  } catch (error) { return failure(error) }
}
export async function addSubject(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const user = await requireUser()
  const value = subjectInput.safeParse(input)
  if (!value.success) return { ok: false, error: 'Enter a subject name of 1–100 characters.' }
  try {
    const service = createFavorsService(getPrisma())
    await service.rateLimit(user.id, 'subject')
    const subject = await service.createSubject(user.id, value.data)
    revalidatePath('/dashboard', 'layout')
    return { ok: true, data: subject }
  } catch (error) { return failure(error) }
}
export async function favorChoices(input: unknown) {
  const user = await requireUser()
  const value = z.object({ friends: choiceInput.default({ query: '', page: 1 }), subjects: choiceInput.default({ query: '', page: 1 }) }).safeParse(input)
  if (!value.success) return { ok: false as const, error: 'Use a shorter search and a valid page.' }
  try {
    const service = createFavorsService(getPrisma())
    await service.rateLimit(user.id, 'choices')
    const [friends, subjects] = await Promise.all([service.friends(user.id, value.data.friends), service.subjects(user.id, value.data.subjects)])
    return { ok: true as const, data: { friends, subjects } }
  } catch (error) { return failure(error) }
}
export async function historyChoices(input: unknown) {
  const user = await requireUser()
  const parsed = choiceInput.extend({ kind: z.enum(['friend', 'subject']) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Invalid filter search.' }
  try {
    const service = createFavorsService(getPrisma())
    await service.rateLimit(user.id, 'choices')
    return { ok: true as const, data: await service.historyChoices(user.id, parsed.data.kind, parsed.data) }
  } catch (error) { return failure(error) }
}
