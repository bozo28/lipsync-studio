import { Env, AuthUser } from '../types';
import { AppError } from '../utils/errors';

export async function handleDeleteAccount(
  request: Request,
  user: AuthUser,
  env: Env
): Promise<Response> {
  // Delete user credits
  await fetch(`${env.SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${user.userId}`, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  // Delete user usage logs
  await fetch(`${env.SUPABASE_URL}/rest/v1/usage_logs?user_id=eq.${user.userId}`, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  // Delete user from Supabase Auth (admin API)
  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.userId}`, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!authRes.ok) {
    throw new AppError('Failed to delete account', 500, 'DELETE_FAILED');
  }

  return Response.json({ success: true, message: 'Account deleted' });
}
