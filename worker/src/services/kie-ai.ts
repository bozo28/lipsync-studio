import { Env } from '../types';
import { AppError } from '../utils/errors';

const KIE_API_BASE = 'https://api.kie.ai/api';

interface KieTaskResponse {
  task_id: string;
  status: string;
}

interface KieStatusResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output?: {
    image_url?: string;
  };
  error?: string;
}

/** Create an AI lipstick application task */
export async function createTask(
  imageBase64: string,
  lipColor: string,
  env: Env
): Promise<string> {
  // Strip data URL prefix to get raw base64
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const prompt = `Apply lipstick color ${lipColor} to the lips in this photo. Keep the rest of the face and image exactly the same. Only change the lip color to ${lipColor}. Make it look natural and realistic.`;

  const res = await fetch(`${KIE_API_BASE}/nano-banana-2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.KIE_AI_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: prompt,
      image_input: [base64Data],
      resolution: '1k',
      output_format: 'jpeg',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Kie AI create task error:', res.status, text);
    throw new AppError('AI service error', 502, 'AI_SERVICE_ERROR');
  }

  const data = await res.json() as KieTaskResponse;
  if (!data.task_id) {
    throw new AppError('AI service returned no task ID', 502, 'AI_NO_TASK_ID');
  }

  return data.task_id;
}

/** Check task status */
export async function getTaskStatus(
  taskId: string,
  env: Env
): Promise<KieStatusResponse> {
  const res = await fetch(`${KIE_API_BASE}/task/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${env.KIE_AI_API_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Kie AI status error:', res.status, text);
    throw new AppError('AI service status check failed', 502, 'AI_STATUS_ERROR');
  }

  return await res.json() as KieStatusResponse;
}
