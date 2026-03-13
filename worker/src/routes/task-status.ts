import { Env, AuthUser, TaskResult } from '../types';
import { getTaskStatus } from '../services/kie-ai';
import { AppError } from '../utils/errors';

export async function handleTaskStatus(
  request: Request,
  user: AuthUser,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) {
    throw new AppError('Missing taskId parameter', 400, 'MISSING_TASK_ID');
  }

  const status = await getTaskStatus(taskId, env);

  const result: TaskResult = {
    status: status.status,
    taskId: taskId,
  };

  if (status.status === 'completed' && status.output?.image_url) {
    result.resultUrl = status.output.image_url;
  }

  if (status.status === 'failed') {
    result.error = status.error || 'AI processing failed';
  }

  return Response.json(result);
}
