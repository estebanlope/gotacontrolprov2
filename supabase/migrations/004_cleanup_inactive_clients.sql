-- Migration 004: Cleanup Inactive Clients
-- Purpose: Automatically delete clients without active loans for 6+ months
-- Features: RPC function to identify and delete inactive clients

-- ============================================================
-- STEP 1: Modify payments foreign key to CASCADE
-- ============================================================
-- This allows deletion of loans even if they have payments
ALTER TABLE payments DROP CONSTRAINT payments_loan_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE;

-- ============================================================
-- STEP 2: RPC Function - cleanup_inactive_clients
-- ============================================================
-- Deletes clients whose most recent loan was 6+ months ago
-- Parameters:
--   p_team_id: Team to cleanup (for multi-tenancy safety)
--   p_months: Threshold months (default 6)
-- Returns: JSON with count of deleted clients

CREATE OR REPLACE FUNCTION cleanup_inactive_clients(
  p_team_id UUID,
  p_months INTEGER DEFAULT 6
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT := 0;
  v_six_months_ago TIMESTAMPTZ;
  v_clients_to_delete UUID[];
BEGIN
  -- Calculate cutoff date
  v_six_months_ago := NOW() - (p_months || ' months')::INTERVAL;

  -- Find clients whose most recent loan is older than threshold
  -- OR clients with no loans at all
  SELECT ARRAY_AGG(c.id)
  INTO v_clients_to_delete
  FROM clients c
  LEFT JOIN loans l ON c.id = l.client_id
  WHERE c.team_id = p_team_id
  GROUP BY c.id
  HAVING MAX(l.created_at) < v_six_months_ago
     OR MAX(l.created_at) IS NULL;

  -- Delete clients and cascade
  IF v_clients_to_delete IS NOT NULL AND ARRAY_LENGTH(v_clients_to_delete, 1) > 0 THEN
    DELETE FROM clients WHERE id = ANY(v_clients_to_delete);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Inactive clients cleanup completed',
    'threshold_months', p_months,
    'cutoff_date', v_six_months_ago,
    'clients_deleted', v_deleted_count,
    'team_id', p_team_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'clients_deleted', 0
  );
END;
$$;

-- ============================================================
-- STEP 3: RPC Function - get_inactive_clients_report
-- ============================================================
-- Preview which clients would be deleted without actually deleting
-- Useful for auditing before cleanup

CREATE OR REPLACE FUNCTION get_inactive_clients_report(
  p_team_id UUID,
  p_months INTEGER DEFAULT 6
)
RETURNS TABLE(
  client_id UUID,
  client_name TEXT,
  last_loan_date TIMESTAMPTZ,
  months_inactive NUMERIC,
  loan_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_six_months_ago TIMESTAMPTZ;
BEGIN
  v_six_months_ago := NOW() - (p_months || ' months')::INTERVAL;

  RETURN QUERY
  SELECT
    c.id,
    c.full_name,
    MAX(l.created_at) as last_loan_date,
    ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(l.created_at))) / 2592000, 1) as months_inactive,
    COUNT(l.id)::INT as loan_count
  FROM clients c
  LEFT JOIN loans l ON c.id = l.client_id
  WHERE c.team_id = p_team_id
  GROUP BY c.id, c.full_name
  HAVING MAX(l.created_at) < v_six_months_ago
     OR MAX(l.created_at) IS NULL
  ORDER BY MAX(l.created_at) ASC;
END;
$$;

-- ============================================================
-- STEP 4: Grant execute privileges
-- ============================================================
GRANT EXECUTE ON FUNCTION cleanup_inactive_clients(UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_inactive_clients_report(UUID, INTEGER) TO anon;

