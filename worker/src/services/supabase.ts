import { Env } from '../types';
import { AppError } from '../utils/errors';

const headers = (env: Env) => ({
  'apikey': env.SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
});

/** Get user's remaining credits. Returns 0 if no row exists. */
export async function getCredits(userId: string, env: Env): Promise<number> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${userId}&select=credits`,
    { headers: headers(env) }
  );

  if (!res.ok) {
    throw new AppError('Failed to check credits', 500, 'CREDITS_ERROR');
  }

  const rows = await res.json() as Array<{ credits: number }>;
  return rows.length > 0 ? rows[0].credits : 0;
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
