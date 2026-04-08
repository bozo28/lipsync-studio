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
  const allowed = ['tempfile.redpandaai.co', 'tempfile.aiquickdraw.com', 'aiquickdraw.com', 'cdn.kie.ai', 'api.kie.ai'];
  const parsed = new URL(imageUrl);
  if (!allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
    throw new AppError('URL not allowed', 403, 'URL_NOT_ALLOWED');
  }

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new AppError('Failed to fetch image', 502, 'PROXY_ERROR');
  }

  // Verify upstream returned an actual image (defense against accidental HTML/JSON proxying)
  const upstreamType = res.headers.get('Content-Type') || '';
  if (!upstreamType.startsWith('image/')) {
    throw new AppError('Upstream resource is not an image', 502, 'NOT_AN_IMAGE');
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': upstreamType,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
