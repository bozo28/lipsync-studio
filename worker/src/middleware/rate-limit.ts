import { Env } from '../types';
import { AppError } from '../utils/errors';

const MAX_REQUESTS = 10; // per window
const WINDOW_SECONDS = 60; // 1 minute

export async function checkRateLimit(userId: string, env: Env): Promise<void> {
  const key = `rl:${userId}`;
  const stored = await env.RATE_LIMIT.get(key);

  if (stored) {
    let data: { c: number; ttl: number };
    try {
      const parsed = JSON.parse(stored);
      // Handle legacy format (plain integer string) by treating it as a fresh window
      if (typeof parsed === 'number') {
        data = { c: parsed, ttl: Math.floor(Date.now() / 1000) + WINDOW_SECONDS };
      } else if (parsed && typeof parsed.c === 'number' && typeof parsed.ttl === 'number') {
        data = parsed;
      } else {
        data = { c: 1, ttl: Math.floor(Date.now() / 1000) + WINDOW_SECONDS };
      }
    } catch {
      data = { c: 1, ttl: Math.floor(Date.now() / 1000) + WINDOW_SECONDS };
    }
    const count = data.c;
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
