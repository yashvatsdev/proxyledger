import 'server-only'

// Closed vocabulary only: never accept error objects, URLs, inputs or user IDs.
export type OperationalEvent = 'database-connection-failed' | 'friend-action-failed' | 'notification-action-failed' | 'favor-action-failed' | 'settlement-action-failed' | 'search-action-failed'
export function reportOperationalFailure(event: OperationalEvent) {
  console.error(`[operations] ${event}`)
}
