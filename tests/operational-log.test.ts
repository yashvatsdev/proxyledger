import { describe, expect, it, vi } from 'vitest'
import { reportOperationalFailure } from '../lib/operational-log'

describe('operational failure logging', () => {
  it('emits only fixed event names without an error payload', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      reportOperationalFailure('settlement-action-failed')
      expect(log).toHaveBeenCalledExactlyOnceWith('[operations] settlement-action-failed')
    } finally { log.mockRestore() }
  })
})
