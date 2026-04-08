import { Env } from '../types';
import { AppError } from '../utils/errors';

const headers = (env: Env) => ({
  'apikey': env.SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
});

/** Get user's remaining credits. Returns 0 if no row exists or credits expired. */
export async function getCredits(userId: string, env: Env): Promise<number> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${userId}&select=credits,credits_expires_at`,
    { headers: headers(env) }
  );

  if (!res.ok) {
    throw new AppError('Failed to check credits', 500, 'CREDITS_ERROR');
  }

  const rows = await res.json() as Array<{ credits: number; credits_expires_at: string | null }>;
  if (rows.length === 0) return 0;

  const row = rows[0];
  // If credits have expired, return 0
  if (row.credits_expires_at && new Date(row.credits_expires_at) < new Date()) {
    return 0;
  }
  return row.credits;
}

/** Atomically deduct 1 credit via RPC. Returns remaining credits or throws. */
export async function deductCredit(userId: string, env: Env): Promise<number> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/deduct_credit`,
    {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({ p_user_id: userId }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    if (text.includes('insufficient')) {
      throw new AppError('No credits remaining', 402, 'NO_CREDITS');
    }
    throw new AppError('Failed to deduct credit', 500, 'CREDITS_ERROR');
  }

  const remaining = await res.json() as number;
  return remaining;
}

/** Refund 1 credit (on failed AI processing) — atomic via RPC */
export async function refundCredit(userId: string, env: Env): Promise<void> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/add_credits`,
    {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({ p_user_id: userId, p_amount: 1, p_set_expiry: false }),
    }
  );
  if (!res.ok) {
    throw new AppError('Failed to refund credit', 500, 'CREDITS_ERROR');
  }
}

/** Remove credits from a user (on refund/dispute). Floors at 0. Atomic via RPC. */
export async function removeCredits(userId: string, amount: number, env: Env): Promise<void> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/remove_credits`,
    {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
    }
  );
  if (!res.ok) {
    throw new AppError('Failed to remove credits', 500, 'CREDITS_ERROR');
  }
}

/** Add credits to a user (after successful payment). Sets 30-day expiry. Atomic via RPC. */
export async function addCredits(userId: string, amount: number, env: Env): Promise<void> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/add_credits`,
    {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({ p_user_id: userId, p_amount: amount, p_set_expiry: true }),
    }
  );
  if (!res.ok) {
    throw new AppError('Failed to add credits', 500, 'CREDITS_ERROR');
  }
}

/** Log a usage record */
export async function logUsage(
  userId: string,
  taskId: string,
  colorCode: string,
  category: string,
  status: string,
  env: Env
): Promise<void> {
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/usage_logs`,
    {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({
        user_id: userId,
        task_id: taskId,
        color_code: colorCode,
        category: category,
        status: status,
      }),
    }
  );
  // Fire-and-forget, don't throw on failure
}
