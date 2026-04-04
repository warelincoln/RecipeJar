-- WS-7b: MFA backup/recovery codes table
CREATE TABLE IF NOT EXISTS "mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_mfa_recovery_codes_user_id"
  ON "mfa_recovery_codes" ("user_id");

-- RLS
ALTER TABLE "mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mfa_recovery_codes_select_own"
  ON "mfa_recovery_codes"
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "mfa_recovery_codes_delete_own"
  ON "mfa_recovery_codes"
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
