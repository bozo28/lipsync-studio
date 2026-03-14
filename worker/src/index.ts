import { Env } from './types';
import { verifyAuth } from './auth';
import { handleOptions, corsify } from './middleware/cors';
import { handleApplyLipstick } from './routes/apply-lipstick';
import { handleTaskStatus } from './routes/task-status';
import { handleProxyImage } from './routes/proxy-image';
import { errorResponse } from './utils/errors';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    try {
      const url = new URL(request.url);
      let response: Response;

      // Health check (no auth needed)
      if (url.pathname === '/health' && request.method === 'GET') {
        response = Response.json({ status: 'ok' });
        return corsify(response, request, env);
      }

      // All other routes require auth
      const user = await verifyAuth(request, env);

      if (url.pathname === '/api/apply' && request.method === 'POST') {
        response = await handleApplyLipstick(request, user, env);
      } else if (url.pathname === '/api/task' && request.method === 'GET') {
        response = await handleTaskStatus(request, user, env);
      } else if (url.pathname === '/api/image' && request.method === 'GET') {
        response = await handleProxyImage(request, user, env);
      } else {
        response = Response.json(
          { error: 'Not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      return corsify(response, request, env);
    } catch (error) {
      const response = errorResponse(error);
      return corsify(response, request, env);
    }
  },
};
