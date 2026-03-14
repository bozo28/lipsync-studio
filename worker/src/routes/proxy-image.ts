import { Env, AuthUser } from '../types';
import { AppError } from '../utils/errors';

export async function handleProxyImage(
  request: Request,
  user: AuthUser,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    throw new AppError('Missing url parameter', 400, 'MISSING_URL');
  }

  // Only allow proxying from known Kie AI domains
  const allowed = ['tempfile.redpandaai.co', 'cdn.kie.ai', 'api.kie.ai'];
  const parsed = new URL(imageUrl);
  if (!allowed.some(d => parsed.hostname.endsWith(d))) {
    throw new AppError('URL not allowed', 403, 'URL_NOT_ALLOWED');
  }

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new AppError('Failed to fetch image', 502, 'PROXY_ERROR');
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
