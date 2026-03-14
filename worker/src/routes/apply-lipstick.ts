import { Env, AuthUser, ApplyRequest, TaskResult } from '../types';
import { validateApplyRequest } from '../utils/validate';
import { checkRateLimit } from '../middleware/rate-limit';
import { deductCredit, refundCredit } from '../services/supabase';
import { logUsage } from '../services/supabase';
import { createTask } from '../services/kie-ai';
import { AppError } from '../utils/errors';

export async function handleApplyLipstick(
  request: Request,
  user: AuthUser,
  env: Env
): Promise<Response> {
  // Rate limit check
  await checkRateLimit(user.userId, env);

  // Parse and validate body
  const body = await request.json() as ApplyRequest;
  validateApplyRequest(body);

  // Deduct credit (atomic - throws if insufficient)
  const creditsRemaining = await deductCredit(user.userId, env);

  // Create AI task
  let taskId: string;
  try {
    taskId = await createTask(body.image, body.lipColor, env);
  } catch (error) {
    // Refund credit on AI failure
    console.error('AI task creation failed:', error);
    await refundCredit(user.userId, env);
    throw new AppError('Failed to start AI processing', 502, 'AI_TASK_FAILED');
  }

  // Log usage (fire-and-forget)
  logUsage(user.userId, taskId, body.colorCode, body.category, 'pending', env);

  const result: TaskResult = {
    status: 'pending',
    taskId: taskId,
    creditsRemaining: creditsRemaining,
  };

  return Response.json(result, { status: 202 });
}
