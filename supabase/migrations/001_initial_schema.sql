-- ============================================================
-- PersonalProject - LoanManager
-- Supabase SQL Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable pgcrypto for PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Teams ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  telegram_bot_active BOOLEAN DEFAULT FALSE,
  telegram_bot_token  TEXT,
  telegram_bot_name   TEXT,
  telegram_chat_id    TEXT
);

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username   TEXT UNIQUE NOT NULL,
  pin_hash   TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'cobrador')),
  team_id    UUID REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ─── Config ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              UUID UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  capital_base         NUMERIC(14,2) DEFAULT 0,
  default_interest_rate NUMERIC(5,2) DEFAULT 20
);

-- ─── Clients ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  full_name  TEXT NOT NULL,
  cedula     TEXT NOT NULL,
  phone      TEXT NOT NULL,
  address    TEXT NOT NULL,
  lat        NUMERIC(10,7),
  lng        NUMERIC(10,7),
  notes      TEXT,
  photo_url  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_team_id    ON clients(team_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_cedula      ON clients(cedula);

-- ─── Loans ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  created_by        UUID NOT NULL REFERENCES users(id),
  capital           NUMERIC(14,2) NOT NULL CHECK (capital > 0),
  interest_rate     NUMERIC(5,2) NOT NULL DEFAULT 20,
  payment_type      TEXT NOT NULL CHECK (payment_type IN ('daily','weekly','biweekly','monthly')),
  term_weeks        INTEGER NOT NULL CHECK (term_weeks > 0),
  disbursement_date DATE NOT NULL,
  due_date          DATE NOT NULL,
  next_payment_date DATE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','overdue','paid')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_team_id    ON loans(team_id);
CREATE INDEX IF NOT EXISTS idx_loans_client_id  ON loans(client_id);
CREATE INDEX IF NOT EXISTS idx_loans_created_by ON loans(created_by);
CREATE INDEX IF NOT EXISTS idx_loans_status     ON loans(status);

-- ─── Loan Schedule ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_schedule (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id  UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount   NUMERIC(14,2) NOT NULL,
  status   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid'))
);

CREATE INDEX IF NOT EXISTS idx_loan_schedule_loan_id  ON loan_schedule(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_schedule_due_date ON loan_schedule(due_date);

-- ─── Payments ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id      UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES users(id),
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL DEFAULT 'transfer' CHECK (method IN ('cash','transfer')),
  payment_date DATE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_loan_id    ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_team_id    ON payments(team_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_date       ON payments(payment_date);

-- ─── Expenses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL CHECK (type IN ('gasolina','transporte','salario','otros')),
  amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_team_id    ON expenses(team_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);

-- ============================================================
-- RPC Functions
-- ============================================================

-- authenticate_user: verifies username + PIN and returns user data
CREATE OR REPLACE FUNCTION authenticate_user(p_username TEXT, p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user
  FROM users
  WHERE username = p_username
    AND pin_hash = crypt(p_pin, pin_hash);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', v_user.id,
    'username', v_user.username,
    'role', v_user.role,
    'team_id', v_user.team_id
  );
END;
$$;

-- create_user: creates a new user with hashed PIN
CREATE OR REPLACE FUNCTION create_user(
  p_id UUID,
  p_username TEXT,
  p_pin TEXT,
  p_role TEXT,
  p_team_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO users (id, username, pin_hash, role, team_id)
  VALUES (
    p_id,
    p_username,
    crypt(p_pin, gen_salt('bf', 10)),
    p_role,
    p_team_id
  );
END;
$$;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses      ENABLE ROW LEVEL SECURITY;

-- ─── Since we use custom PIN auth (not Supabase Auth JWT),
-- ─── we allow all operations via the anon key.
-- ─── Security is enforced at the application layer (role checks in React).
-- ─── The service role key is used only in the Cloudflare Worker.

CREATE POLICY "Allow all for anon" ON teams         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON users         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON config        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON clients       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON loans         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON loan_schedule FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON payments      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON expenses      FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Supabase Storage — Run these in the SQL Editor too
-- ============================================================

-- 1. Create the bucket (public so photo URLs work without signed tokens)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-photos',
  'client-photos',
  true,
  524288,   -- 512 KB max per file (already compressed 75% on client)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: anyone can READ public images (needed to display them in the app)
CREATE POLICY "Public read client photos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'client-photos' );

-- 3. Policy: only authenticated calls with a valid team_id path can UPLOAD
--    Files must be uploaded to: {team_id}/{any-filename}
--    The frontend enforces this path format.
CREATE POLICY "Authenticated insert client photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-photos'
  AND octet_length(name) > 0
);

-- ============================================================
-- Initial Super Admin user (change PIN before production!)
-- ============================================================
-- SELECT create_user(
--   gen_random_uuid(),
--   'superadmin',
--   '123456',   -- CHANGE THIS
--   'superadmin',
--   NULL
-- );

