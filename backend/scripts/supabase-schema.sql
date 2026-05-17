CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'user',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS upload_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      file_name TEXT,
      upload_type TEXT,
      total_rows INTEGER DEFAULT 0,
      processed_rows INTEGER DEFAULT 0,
      created_rows INTEGER DEFAULT 0,
      updated_rows INTEGER DEFAULT 0,
      skipped_rows INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      uploaded_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS collections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_ref_id TEXT,
      customer_id TEXT NOT NULL,
      loan_id TEXT NOT NULL,
      customer_name TEXT,
      supplier_name TEXT,
      amount NUMERIC(15,2) NOT NULL,
      principal_amount NUMERIC(15,2),
      interest_amount NUMERIC(15,2),
      penalty_amount NUMERIC(15,2),
      collection_date DATE NOT NULL,
      last_collection_date DATE,
      overdue_days INTEGER,
      status TEXT DEFAULT 'Bounced',
      bounce_reason TEXT,
      category TEXT,
      is_settled BOOLEAN DEFAULT false,
      upload_session_id UUID,
      lender TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(loan_id, customer_id, collection_date)
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      customer_id TEXT PRIMARY KEY,
      mobile TEXT,
      anchor_name TEXT,
      alternate_mobile TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customer_followups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id TEXT NOT NULL,
      loan_id TEXT,
      remark TEXT,
      call_status TEXT,
      followup_date DATE,
      is_reminder_enabled BOOLEAN DEFAULT true,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS risk_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id TEXT NOT NULL,
      loan_id TEXT,
      risk_score INTEGER,
      payment_probability INTEGER,
      calculated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name TEXT,
      record_id UUID,
      action TEXT,
      changed_by UUID,
      changed_at TIMESTAMPTZ DEFAULT NOW(),
      old_data JSONB,
      new_data JSONB
    );

    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );