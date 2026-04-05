import { Env } from '../types';
import { addCredits } from '../services/supabase';

const PACKAGE_CREDITS: Record<string, number> = {
  starter: 20,
  basic: 42,
  pro: 66,
  ultra: 157,
};

/** Verify Paddle webhook signature using the API key */
async function verifyPaddleSignature(
  rawBody: string,
  signature: string | null,
  env: Env
): Promise<boolean> {
  if (!signature) return false;

  // Paddle v2 signature format: ts=TIMESTAMP;h1=HASH
  const parts: Record<string, string> = {};
  for (const part of signature.split(';')) {
    const [key, val] = part.split('=');
    if (key && val) parts[key] = val;
  }

  const ts = parts['ts'];
  const h1 = parts['h1'];
  if (!ts || !h1) return false;

  // Reject requests older than 5 minutes (replay attack protection)
  const timestamp = parseInt(ts, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  // Build signed payload: timestamp + ":" + raw body
  const signedPayload = `${ts}:${rawBody}`;

  // HMAC-SHA256 with the Paddle webhook secret
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.PADDLE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Timing-safe comparison
  const a = encoder.encode(computed);
  const b = encoder.encode(h1);
  if (a.byteLength !== b.byteLength) return false;
  const keyBuf = crypto.getRandomValues(new Uint8Array(32));
  const macKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign('HMAC', macKey, a),
    crypto.subtle.sign('HMAC', macKey, b),
  ]);
  return new Uint8Array(macA).every((v, i) => v === new Uint8Array(macB)[i]);
}

interface PaddleEvent {
  event_type: string;
  data: {
    id: string;
    status: string;
    custom_data?: {
      userId?: string;
      package?: string;
      credits?: string;
    };
    items?: Array<{
      price: { id: string };
      quantity: number;
    }>;
  };
}

export async function handlePaddleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('Paddle-Signature');

  // Verify signature
  const valid = await verifyPaddleSignature(rawBody, signature, env);
  if (!valid) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event: PaddleEvent = JSON.parse(rawBody);

  // Only process completed transactions
  if (event.event_type !== 'transaction.completed') {
    return Response.json({ received: true });
  }

  const { custom_data } = event.data;
  if (!custom_data?.userId || !custom_data?.credits) {
    return Response.json({ error: 'Missing custom data' }, { status: 400 });
  }

  const transactionId = event.data.id;
  const userId = custom_data.userId;
  const pkg = custom_data.package || 'unknown';

  // Only allow known packages — ignore custom_data credits, use server-side values
  if (!(pkg in PACKAGE_CREDITS)) {
    return Response.json({ error: 'Unknown package' }, { status: 400 });
  }

  // Idempotency: check if this transaction was already processed
  const idempotencyKey = `paddle:${transactionId}`;
  const already = await env.RATE_LIMIT.get(idempotencyKey);
  if (already) {
    return Response.json({ success: true, duplicate: true });
  }

  const serverCredits = PACKAGE_CREDITS[pkg];

  // Add credits to user using server-side amount (not client-provided)
  await addCredits(userId, serverCredits, env);

  // Mark transaction as processed (keep for 7 days)
  await env.RATE_LIMIT.put(idempotencyKey, '1', { expirationTtl: 604800 });

  return Response.json({ success: true });
}
