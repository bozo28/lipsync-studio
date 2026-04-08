import { Env } from '../types';
import { AppError } from '../utils/errors';

const KIE_API_BASE = 'https://api.kie.ai/api';
const KIE_UPLOAD_BASE = 'https://kieai.redpandaai.co/api';

interface KieUploadResponse {
  success: boolean;
  code: number;
  msg: string;
  data?: {
    fileName: string;
    filePath: string;
    downloadUrl: string;
    fileSize: number;
    mimeType: string;
  };
}

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
    resultJson?: string;
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

/** Upload base64 image to Kie AI and get a URL */
async function uploadImage(base64Data: string, env: Env): Promise<string> {
  const res = await fetch(`${KIE_UPLOAD_BASE}/file-base64-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.KIE_AI_API_KEY}`,
    },
    body: JSON.stringify({
      base64Data: base64Data,
      uploadPath: 'lipsync',
      fileName: `photo-${Date.now()}.jpg`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Kie AI upload error:', res.status, text);
    throw new AppError('Image upload failed', 502, 'AI_UPLOAD_ERROR');
  }

  const data = await res.json() as KieUploadResponse;
  if (!data.success || !data.data?.downloadUrl) {
    console.error('Kie AI upload response:', JSON.stringify(data));
    throw new AppError(data.msg || 'Image upload failed', 502, 'AI_UPLOAD_ERROR');
  }

  return data.data.downloadUrl;
}

/** Create an AI lipstick application task */
export async function createTask(
  imageBase64: string,
  lipColor: string,
  env: Env
): Promise<string> {
  // Step 1: Upload image to get a URL
  const imageUrl = await uploadImage(imageBase64, env);
  console.log('[KIE AI] uploaded image url:', imageUrl, 'color:', lipColor);

  const prompt = `Edit this photo: change the lip color to ${lipColor}. Apply the ${lipColor} lipstick fully and opaquely on both upper and lower lips with a glossy satin finish. STRICT CONSTRAINTS: The lipstick must stay precisely within the natural lip boundaries and must NOT extend beyond the lip edges onto the surrounding skin. Do NOT alter the shape, size, structure, or anatomy of the mouth, lips, or teeth. Preserve the person's exact identity, facial features, skin tone, and character — the same person must be clearly recognizable. The rest of the photo (face, hair, background, lighting, pose) must stay exactly the same.`;

  // Step 2: Create task with image URL
  const res = await fetch(`${KIE_API_BASE}/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.KIE_AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: {
        prompt: prompt,
        image_input: [imageUrl],
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
    console.error('Kie AI create response:', JSON.stringify(data));
    throw new AppError(data.msg || 'AI service returned no task ID', 502, 'AI_NO_TASK_ID');
  }

  return data.data.taskId;
}

/** Check task status */
export async function getTaskStatus(
  taskId: string,
  env: Env
): Promise<TaskStatusResult> {
  const res = await fetch(`${KIE_API_BASE}/v1/jobs/recordInfo?taskId=${taskId}`, {
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

  // Debug: log full response when state is success or fail
  if (data.data.state === 'success' || data.data.state === 'fail') {
    console.log('[KIE AI RESPONSE]', JSON.stringify(data));
  }

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
