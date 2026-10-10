'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { reportOperationalFailure } from '@/lib/operational-log'
import { createSettlementsService, SettlementError } from '@/lib/settlements-service'
import { proposeSettlementInput, resolveSettlementInput } from '@/lib/settlement-types'
import type { ActionResult } from '@/lib/friend-types'

function failure(error: unknown) {
  if (!(error instanceof SettlementError)) reportOperationalFailure('settlement-action-failed')
  return { ok: false as const, error: error instanceof SettlementError ? error.message : 'Unable to complete this settlement. Please refresh and try again.' }
}
export async function proposeSettlement(input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser()
  const parsed = proposeSettlementInput.safeParse(input)
  if (!parsed.success) return { ok:false,error:'Choose a valid person, positive whole amount, direction and note.' }
  try {
    const service = createSettlementsService(getPrisma())
    await service.rateLimit(user.id,'create')
    const id = await service.propose(user.id,parsed.data)
    revalidatePath('/dashboard','layout')
    return { ok:true,data:id }
  } catch(error) { return failure(error) }
}
export async function resolveSettlement(input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = resolveSettlementInput.safeParse(input)
  if (!parsed.success) return { ok:false,error:'Invalid settlement action.' }
  try {
    const service = createSettlementsService(getPrisma())
    await service.rateLimit(user.id,'change')
    await service.change(user.id,parsed.data)
    revalidatePath('/dashboard','layout')
    return { ok:true,data:null }
  } catch(error) { return failure(error) }
}
