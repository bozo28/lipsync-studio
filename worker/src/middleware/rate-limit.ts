import { Env } from '../types';
import { AppError } from '../utils/errors';

const MAX_REQUESTS = 10; // per window
const WINDOW_SECONDS = 60; // 1 minute

export async function checkRateLimit(userId: string, env: Env): Promise<void> {
  const key = `rl:${userId}`;
  const stored = await env.RATE_LIMIT.get(key);

  if (stored) {
    const count = parseInt(stored, 10);
    if (count >= MAX_REQUESTS) {
      throw new AppError(
        'Rate limit exceeded. Please wait a minute.',
        429,
        'RATE_LIMITED'
      );
    }
    // Increment (keep same TTL by re-putting with remaining expiration)
    await env.RATE_LIMIT.put(key, String(count + 1), {
      expirationTtl: WINDOW_SECONDS,
    });
  } else {
    await env.RATE_LIMIT.put(key, '1', {
      expirationTtl: WINDOW_SECONDS,
    });
  }
}
