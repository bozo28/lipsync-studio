-- =============================================
-- LipSync Studio - Supabase Database Setup
-- Run this in Supabase SQL Editor (Dashboard > SQL)
-- =============================================

-- 1. User Credits Table
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 1,
  credits_expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Usage Logs Table
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  color_code TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Auto-create credits row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, credits)
  VALUES (NEW.id, 1)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_credits();

-- 4. Atomic credit deduction RPC (checks expiry)
CREATE OR REPLACE FUNCTION deduct_credit(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  remaining INTEGER;
BEGIN
  -- First reset expired credits to 0
  UPDATE user_credits
  SET credits = 0, updated_at = now()
  WHERE user_id = p_user_id
    AND credits_expires_at IS NOT NULL
    AND credits_expires_at < now()
    AND credits > 0;

  -- Then deduct
  UPDATE user_credits
  SET credits = credits - 1, updated_at = now()
  WHERE user_id = p_user_id AND credits > 0
  RETURNING credits INTO remaining;

  IF remaining IS NULL THEN
    RAISE EXCEPTION 'insufficient credits';
  END IF;

  RETURN remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4b. Atomic credit addition RPC (for payments and refunds)
CREATE OR REPLACE FUNCTION add_credits(p_user_id UUID, p_amount INTEGER, p_set_expiry BOOLEAN DEFAULT TRUE)
RETURNS VOID AS $$
BEGIN
  UPDATE user_credits
  SET credits = credits + p_amount,
      credits_expires_at = CASE
        WHEN p_set_expiry THEN now() + interval '30 days'
        ELSE credits_expires_at
      END,
      updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, credits, credits_expires_at)
    VALUES (p_user_id, p_amount, CASE WHEN p_set_expiry THEN now() + interval '30 days' ELSE NULL END);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Row Level Security
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own credits
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read their own usage logs
CREATE POLICY "Users can view own logs"
  ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (Worker uses service key)
-- No explicit policy needed - service role bypasses RLS

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at);

-- 7. Updated_at trigger for user_credits
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_credits_updated_at ON user_credits;
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
