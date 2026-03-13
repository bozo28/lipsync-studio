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

  const kieResult = await getTaskStatus(taskId, env);

  // Map Kie AI states to our frontend states
  let frontendStatus: TaskResult['status'];
  if (kieResult.status === 'success') {
    frontendStatus = 'completed';
  } else if (kieResult.status === 'fail') {
    frontendStatus = 'failed';
  } else if (kieResult.status === 'generating') {
    frontendStatus = 'processing';
  } else {
    frontendStatus = 'pending'; // waiting, queuing
  }

  const result: TaskResult = {
    status: frontendStatus,
    taskId: taskId,
  };

  if (frontendStatus === 'completed' && kieResult.resultUrl) {
    result.resultUrl = kieResult.resultUrl;
  }

  if (frontendStatus === 'failed') {
    result.error = kieResult.error || 'AI processing failed';
  }

  return Response.json(result);
}
