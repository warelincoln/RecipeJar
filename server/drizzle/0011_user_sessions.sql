-- WS-7b: User session tracking table
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "device_info" text,
  "ip_address" text,
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_sessions_user_id"
  ON "user_sessions" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_user_sessions_last_seen"
  ON "user_sessions" ("last_seen_at");

-- RLS
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sessions_select_own"
  ON "user_sessions"
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
