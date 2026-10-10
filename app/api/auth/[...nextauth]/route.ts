import { handlers } from '@/auth'
import type { NextRequest } from 'next/server'
import { timeOperation } from '@/lib/performance-timing'

export const runtime = 'nodejs'
export const GET = (request: NextRequest) => timeOperation('authentication',()=>handlers.GET(request))
export const POST = (request: NextRequest) => timeOperation('authentication',()=>handlers.POST(request))
