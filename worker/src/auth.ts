import { jwtVerify } from 'jose';
import { Env, AuthUser } from './types';
import { AppError } from './utils/errors';

export async function verifyAuth(request: Request, env: Env): Promise<AuthUser> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Missing or invalid Authorization header', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
    });

    if (!payload.sub) {
      throw new AppError('Invalid token: missing subject', 401, 'INVALID_TOKEN');
    }

    return {
      userId: payload.sub,
      email: (payload.email as string) || '',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
  }
}
