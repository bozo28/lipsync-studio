import { Env } from '../types';
import { AppError } from '../utils/errors';

const KIE_API_BASE = 'https://api.kie.ai/api/v1';

interface KieCreateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

interface KieRecordResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    model: string;
    state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
    resultJson?: string; // JSON string: {"resultUrls": [...]}
    failCode?: string;
    failMsg?: string;
    costTime?: number;
  };
}

export interface TaskStatusResult {
  status: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  resultUrl?: string;
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

  const res = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.KIE_AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: {
        prompt: prompt,
        image_input: [`data:image/jpeg;base64,${base64Data}`],
        resolution: '1K',
        output_format: 'jpg',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Kie AI create task error:', res.status, text);
    if (res.status === 402) {
      throw new AppError('AI service: insufficient credits', 502, 'AI_NO_CREDITS');
    }
    throw new AppError('AI service error', 502, 'AI_SERVICE_ERROR');
  }

  const data = await res.json() as KieCreateResponse;
  if (data.code !== 200 || !data.data?.taskId) {
    throw new AppError(data.msg || 'AI service returned no task ID', 502, 'AI_NO_TASK_ID');
  }

  return data.data.taskId;
}

/** Check task status */
export async function getTaskStatus(
  taskId: string,
  env: Env
): Promise<TaskStatusResult> {
  const res = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`, {
    headers: {
      'Authorization': `Bearer ${env.KIE_AI_API_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Kie AI status error:', res.status, text);
    throw new AppError('AI service status check failed', 502, 'AI_STATUS_ERROR');
  }

  const data = await res.json() as KieRecordResponse;

  const result: TaskStatusResult = {
    status: data.data.state,
  };

  if (data.data.state === 'success' && data.data.resultJson) {
    try {
      const parsed = JSON.parse(data.data.resultJson) as { resultUrls?: string[] };
      if (parsed.resultUrls && parsed.resultUrls.length > 0) {
        result.resultUrl = parsed.resultUrls[0];
      }
    } catch (e) {
      console.error('Failed to parse resultJson:', e);
    }
  }

  if (data.data.state === 'fail') {
    result.error = data.data.failMsg || 'AI processing failed';
  }

  return result;
}
