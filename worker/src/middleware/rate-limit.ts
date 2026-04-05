import { Env } from '../types';
import { AppError } from '../utils/errors';

const MAX_REQUESTS = 10; // per window
const WINDOW_SECONDS = 60; // 1 minute

export async function checkRateLimit(userId: string, env: Env): Promise<void> {
  const key = `rl:${userId}`;
  const stored = await env.RATE_LIMIT.get(key);

  if (stored) {
    const data = JSON.parse(stored);
    const count = data.c as number;
    const remaining = Math.max(1, data.ttl - Math.floor(Date.now() / 1000));
    if (count >= MAX_REQUESTS) {
      throw new AppError(
        'Rate limit exceeded. Please wait a minute.',
        429,
        'RATE_LIMITED'
      );
    }
    // Increment but preserve original window expiry
    await env.RATE_LIMIT.put(key, JSON.stringify({ c: count + 1, ttl: data.ttl }), {
      expirationTtl: remaining,
    });
  } else {
    const ttl = Math.floor(Date.now() / 1000) + WINDOW_SECONDS;
    await env.RATE_LIMIT.put(key, JSON.stringify({ c: 1, ttl }), {
      expirationTtl: WINDOW_SECONDS,
    });
  }
}
