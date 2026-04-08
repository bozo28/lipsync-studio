import { jwtVerify, createRemoteJWKSet } from 'jose';
import { Env, AuthUser } from './types';
import { AppError } from './utils/errors';

// Cache the JWKS keyset
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyAuth(request: Request, env: Env): Promise<AuthUser> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Missing or invalid Authorization header', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);

  try {
    // Use Supabase JWKS endpoint for ES256 tokens
    if (!jwks) {
      jwks = createRemoteJWKSet(
        new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
      );
    }

    // Pin to ES256 only (Supabase uses ES256) — prevents algorithm confusion attacks
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['ES256'] });

    if (!payload.sub) {
      throw new AppError('Invalid token: missing subject', 401, 'INVALID_TOKEN');
    }

    return {
      userId: payload.sub,
      email: (payload.email as string) || '',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('JWT verify error:', (error as Error).message);
    throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
  }
}
