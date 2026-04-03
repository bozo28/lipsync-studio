export interface Env {
  KIE_AI_API_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  SUPABASE_URL: string;
  ALLOWED_ORIGINS: string;
  PADDLE_API_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  RATE_LIMIT: KVNamespace;
}

export interface AuthUser {
  userId: string;
  email: string;
}

export interface ApplyRequest {
  image: string;       // base64 data URL
  lipColor: string;    // HEX color e.g. #C2185B
  colorCode: string;   // e.g. R01 or CUSTOM
  category: string;    // e.g. red, pink, custom
}

export interface TaskResult {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  taskId?: string;
  resultUrl?: string;
  creditsRemaining?: number;
  error?: string;
}
