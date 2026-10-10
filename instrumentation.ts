export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.PERFORMANCE_TIMING === '1') {
    const { registerHttpTiming } = await import('./lib/http-performance')
    registerHttpTiming()
  }
}
