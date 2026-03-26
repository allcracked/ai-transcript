export const FALLBACK_MODEL = 'gemini-2.5-flash';

/**
 * Returns true for transient errors that are worth retrying:
 * network failures, rate limits (429), and service unavailable (500/503).
 */
export function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('service unavailable') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('fetch failed')
  ) {
    return true;
  }
  return false;
}
