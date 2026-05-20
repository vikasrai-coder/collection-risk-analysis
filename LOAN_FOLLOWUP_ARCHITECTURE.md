# Production-Grade Loan Follow-up Platform Architecture

## TABLE OF CONTENTS
1. [Root Cause Analysis](#root-cause-analysis)
2. [Database Architecture](#database-architecture)
3. [SQL Schema](#sql-schema)
4. [Upload/Import Logic](#uploadimport-logic)
5. [Best Practices](#best-practices)
6. [Implementation Examples](#implementation-examples)

---

## ROOT CAUSE ANALYSIS

### Why Closed Loans Are Reappearing

**Problem 1: Missing Loan Status Isolation**
- Current: System likely stores only the latest bounce record per user
- Issue: When a loan is closed, the next day's upload still contains that user's ID, causing a re-entry
- Root Cause: No separate "Loan Status" table to track CLOSED vs ACTIVE state
- Solution: Separate loan lifecycle from bounce event records

**Problem 2: Improper Primary Key Design**
- Current: Likely using `userId` as primary key
- Issue: Multiple loans per user → Unique constraint failures or data overwrites
- Root Cause: No unique constraint on (userId + loanId)
- Solution: Use composite keys and proper foreign key relationships

**Problem 3: Lack of Idempotency**
- Current: Each upload processes records individually
- Issue: Same bounce event uploaded twice creates duplicates
- Root Cause: No deduplication on (loanId, collectionDate, bounceReason)
- Solution: Use unique constraints and upsert logic

**Problem 4: No Timeline/History Preservation**
- Current: Remarks overwritten, not accumulated
- Issue: Previous follow-up notes disappear
- Root Cause: Updating single record instead of appending to history
- Solution: Separate history table with immutable audit trail

**Problem 5: Broken User-Loan Mapping**
- Current: User properties updated with each bounce record
- Issue: User gets updated multiple times, losing relationship context
- Root Cause: Merging user data with transaction data
- Solution: Normalize users, loans, and transactions into separate tables

**Problem 6: No Explicit Closed Loan State**
- Current: Payment marking doesn't prevent future entries
- Issue: Closed loan can reappear in next upload
- Root Cause: No state machine (ACTIVE → CLOSED → REOPENED)
- Solution: Explicit loan_status column with check constraints

---

## DATABASE ARCHITECTURE

### Core Design Principles

```
┌─────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE DIAGRAM                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [Daily Bounce CSV]                                           │
│         ↓                                                     │
│  [Validation Layer] ← Check duplicates, format, data types   │
│         ↓                                                     │
│  [Deduplication] ← (loanId, collectionDate, bounceReason)   │
│         ↓                                                     │
│  [Upsert Transaction] ← Wrapped in DB transaction            │
│         ↓                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         DATABASE LAYER                               │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ • users (immutable)                                  │    │
│  │ • loans (lifecycle management)                       │    │
│  │ • bounced_collections (immutable events)             │    │
│  │ • follow_up_actions (mutable state)                  │    │
│  │ • audit_log (immutable history)                      │    │
│  │ • upload_batches (idempotency tracking)              │    │
│  └─────────────────────────────────────────────────────┘    │
│         ↓                                                     │
│  [Query Layer] ← Show only ACTIVE/PENDING loans              │
│         ↓                                                     │
│  [Dashboard/Portal] ← User sees correct state                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

**Immutable Event Model:**
- Bounce records are immutable (append-only)
- Each daily upload is a new event, never overwrites old ones
- Auditing becomes automatic

**Loan Lifecycle States:**
```
ACTIVE
  ↓
PENDING_PAYMENT (user contacted for collection)
  ↓
PARTIALLY_PAID (partial payment received)
  ↓
PAID (full payment received)
  ↓
CLOSED (no more follow-up)
  
↓ (if customer disputes or wants to repay remaining)
  
REOPENED (explicitly reopened, back to ACTIVE)
```

**Upload Batch Tracking:**
- Each CSV upload gets a batch_id
- Track: which records were in which batch
- Prevents re-processing same batch twice
- Enables reconciliation

---

## SQL SCHEMA

### 1. USERS TABLE (Immutable Customer Data)

```sql
CREATE TABLE users (
  user_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  gst_number VARCHAR(50),
  pan_number VARCHAR(50),
  state VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_batch_id UUID NOT NULL REFERENCES upload_batches(batch_id),
  
  CONSTRAINT user_valid_id CHECK (LENGTH(user_id) > 0)
);

CREATE INDEX idx_users_created_at ON users(created_at);
```

### 2. LOANS TABLE (Core Loan Records)

```sql
CREATE TABLE loans (
  loan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(50) NOT NULL REFERENCES users(user_id),
  external_ref_id VARCHAR(255),
  invoice_id VARCHAR(100),
  invoice_number VARCHAR(100),
  lender VARCHAR(255) NOT NULL,
  anchor_partner VARCHAR(255),
  
  -- Loan Amount Breakdown
  principal_amount DECIMAL(12,2) NOT NULL,
  interest_amount DECIMAL(12,2),
  overdue_interest_amount DECIMAL(12,2) DEFAULT 0,
  penalty_amount DECIMAL(12,2) DEFAULT 0,
  processing_fee_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  
  -- Interest Details
  interest_rate DECIMAL(5,2),
  interest_days INT,
  overdue_days INT DEFAULT 0,
  
  -- Payment Tracking
  paid_principal_amount DECIMAL(12,2) DEFAULT 0,
  paid_interest_amount DECIMAL(12,2) DEFAULT 0,
  paid_penalty_amount DECIMAL(12,2) DEFAULT 0,
  paid_overdue_interest_amount DECIMAL(12,2) DEFAULT 0,
  pending_principal_amount DECIMAL(12,2),
  
  -- Loan Status
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE', 'PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REOPENED'
  )),
  
  -- Classification
  collection_type VARCHAR(50),
  category VARCHAR(100),
  instalment_no INT,
  is_settled BOOLEAN DEFAULT FALSE,
  is_sub_plan BOOLEAN DEFAULT FALSE,
  retailer_id VARCHAR(100),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  closure_reason VARCHAR(255),
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by_batch_id UUID NOT NULL REFERENCES upload_batches(batch_id),
  
  -- Constraints
  CONSTRAINT loan_valid_amount CHECK (total_amount >= 0),
  CONSTRAINT loan_payment_valid CHECK (pending_principal_amount >= 0),
  CONSTRAINT loan_closed_requires_reason CHECK (
    (status IN ('CLOSED', 'REOPENED') AND closure_reason IS NOT NULL) OR
    status NOT IN ('CLOSED', 'REOPENED')
  )
);

CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_created_at ON loans(created_at);
CREATE INDEX idx_loans_external_ref ON loans(external_ref_id);
CREATE UNIQUE INDEX idx_loans_external_ref_unique ON loans(external_ref_id) 
  WHERE external_ref_id IS NOT NULL;
```

### 3. BOUNCED_COLLECTIONS TABLE (Immutable Event Log)

```sql
CREATE TABLE bounced_collections (
  bounce_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(loan_id),
  user_id VARCHAR(50) NOT NULL REFERENCES users(user_id),
  
  -- Bounce Details
  collection_date TIMESTAMP NOT NULL,
  bounce_reason VARCHAR(500),
  bounce_code VARCHAR(50),
  utr VARCHAR(100),
  bank_utr VARCHAR(100),
  
  -- Amount Attempted
  amount_attempted DECIMAL(12,2) NOT NULL,
  
  -- Collection Metadata
  collection_method VARCHAR(100),
  pg_name VARCHAR(100),
  pg_payment_id VARCHAR(255),
  pg_order_id VARCHAR(255),
  sponsor_bank VARCHAR(100),
  
  -- Status
  bounce_status VARCHAR(50) DEFAULT 'BOUNCED' CHECK (bounce_status IN (
    'BOUNCED', 'PROCESSING', 'SUCCESS', 'FAILED'
  )),
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  batch_id UUID NOT NULL REFERENCES upload_batches(batch_id),
  
  CONSTRAINT bounce_amount_valid CHECK (amount_attempted > 0)
);

-- CRITICAL: Prevents duplicate bounce records in same day
CREATE UNIQUE INDEX idx_bounced_deduplication ON bounced_collections(
  loan_id, collection_date, bounce_reason, amount_attempted, batch_id
);

CREATE INDEX idx_bounced_loan_id ON bounced_collections(loan_id);
CREATE INDEX idx_bounced_user_id ON bounced_collections(user_id);
CREATE INDEX idx_bounced_date ON bounced_collections(collection_date);
CREATE INDEX idx_bounced_batch_id ON bounced_collections(batch_id);
```

### 4. FOLLOW_UP_ACTIONS TABLE (Mutable State)

```sql
CREATE TABLE follow_up_actions (
  followup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(loan_id),
  user_id VARCHAR(50) NOT NULL REFERENCES users(user_id),
  
  -- Follow-up Status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'IN_PROGRESS', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED',
    'PARTIAL_PAYMENT', 'CLOSED', 'UNABLE_TO_CONTACT'
  )),
  
  -- Assignment
  assigned_to_agent VARCHAR(255),
  assigned_at TIMESTAMP,
  
  -- Last Action
  last_followup_date TIMESTAMP,
  last_followup_channel VARCHAR(50), -- EMAIL, PHONE, SMS, VISIT
  last_contact_status VARCHAR(50), -- CONTACTED, NOT_REACHABLE, AGREED, REFUSED
  
  -- Next Schedule
  next_followup_date TIMESTAMP,
  reminder_queue_count INT DEFAULT 0,
  
  -- Outcome Tracking
  outcome VARCHAR(255),
  outcome_date TIMESTAMP,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255),
  
  CONSTRAINT next_followup_valid CHECK (next_followup_date > CURRENT_TIMESTAMP)
);

CREATE INDEX idx_followup_loan_id ON follow_up_actions(loan_id);
CREATE INDEX idx_followup_user_id ON follow_up_actions(user_id);
CREATE INDEX idx_followup_status ON follow_up_actions(status);
CREATE INDEX idx_followup_assigned_to ON follow_up_actions(assigned_to_agent);
CREATE INDEX idx_followup_next_date ON follow_up_actions(next_followup_date);
```

### 5. FOLLOW_UP_HISTORY TABLE (Immutable Audit Trail)

```sql
CREATE TABLE follow_up_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id UUID NOT NULL REFERENCES follow_up_actions(followup_id),
  loan_id UUID NOT NULL REFERENCES loans(loan_id),
  user_id VARCHAR(50) NOT NULL REFERENCES users(user_id),
  
  -- Action Details
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
    'CREATED', 'CONTACTED', 'STATUS_CHANGED', 'COMMENT_ADDED', 
    'PAYMENT_RECORDED', 'REASSIGNED', 'CLOSED'
  )),
  
  -- Content
  remarks TEXT,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  action_channel VARCHAR(50), -- EMAIL, PHONE, SMS, IN_PERSON, SYSTEM
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL, -- Agent or SYSTEM
  created_by_batch_id UUID REFERENCES upload_batches(batch_id),
  
  CONSTRAINT history_valid_status CHECK (
    (action_type = 'STATUS_CHANGED' AND old_status IS NOT NULL AND new_status IS NOT NULL) OR
    action_type != 'STATUS_CHANGED'
  )
);

CREATE INDEX idx_history_followup_id ON follow_up_history(followup_id);
CREATE INDEX idx_history_loan_id ON follow_up_history(loan_id);
CREATE INDEX idx_history_created_at ON follow_up_history(created_at);
CREATE INDEX idx_history_user_id ON follow_up_history(user_id);
```

### 6. UPLOAD_BATCHES TABLE (Idempotency & Audit)

```sql
CREATE TABLE upload_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Upload Details
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by VARCHAR(255) NOT NULL,
  file_name VARCHAR(500),
  file_hash VARCHAR(255) NOT NULL UNIQUE, -- SHA256 of file
  
  -- Processing Status
  status VARCHAR(50) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN (
    'PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK'
  )),
  
  -- Metrics
  total_records INT,
  new_records INT DEFAULT 0,
  updated_records INT DEFAULT 0,
  duplicate_records INT DEFAULT 0,
  failed_records INT DEFAULT 0,
  
  -- Error Tracking
  error_message TEXT,
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  
  -- Rollback Info
  can_rollback BOOLEAN DEFAULT TRUE,
  rollback_reason VARCHAR(255),
  
  CONSTRAINT batch_metrics_valid CHECK (
    (new_records + updated_records + duplicate_records + failed_records) <= total_records
  )
);

CREATE INDEX idx_upload_batches_date ON upload_batches(upload_date);
CREATE INDEX idx_upload_batches_status ON upload_batches(status);
```

### 7. LOAN_STATUS_CHANGES TABLE (State Machine Audit)

```sql
CREATE TABLE loan_status_changes (
  change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(loan_id),
  user_id VARCHAR(50) NOT NULL REFERENCES users(user_id),
  
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  
  -- Reason
  change_reason VARCHAR(255),
  triggered_by VARCHAR(255), -- AGENT_ACTION, PAYMENT_RECEIVED, SYSTEM, BATCH_IMPORT
  triggered_by_batch_id UUID REFERENCES upload_batches(batch_id),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_valid BOOLEAN DEFAULT TRUE,
  
  CONSTRAINT valid_status_transition CHECK (from_status != to_status)
);

CREATE INDEX idx_loan_status_loan_id ON loan_status_changes(loan_id);
CREATE INDEX idx_loan_status_date ON loan_status_changes(created_at);
```

### 8. DATA QUALITY TABLE (Validation)

```sql
CREATE TABLE upload_data_quality (
  quality_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES upload_batches(batch_id),
  
  -- Issues Found
  duplicate_count INT DEFAULT 0,
  missing_user_id INT DEFAULT 0,
  missing_loan_id INT DEFAULT 0,
  invalid_amounts INT DEFAULT 0,
  invalid_dates INT DEFAULT 0,
  missing_lender INT DEFAULT 0,
  
  -- Quality Score
  quality_score DECIMAL(3,2), -- 0-1.0
  
  -- Detailed Report
  issues_json JSONB, -- Detailed issues per record
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quality_batch_id ON upload_data_quality(batch_id);
```

---

## UPLOAD/IMPORT LOGIC

### High-Level Import Flow

```
1. RECEIVE & VALIDATE
   ├─ Check file format (CSV)
   ├─ Validate data types
   ├─ Check required fields
   └─ Return errors before DB touch

2. CALCULATE FILE HASH
   ├─ SHA256(file_content)
   ├─ Check if already uploaded
   └─ Prevent duplicate uploads

3. DEDUPLICATION PHASE
   ├─ Remove exact duplicates within file
   ├─ Flag suspicious duplicates (same loan, different amounts)
   └─ Log all deduplication decisions

4. DATABASE TRANSACTION
   ├─ Create upload_batch record
   ├─ LOCK tables (pessimistic locking)
   ├─ For each record:
   │   ├─ Validate against existing data
   │   ├─ Check loan status (don't process if CLOSED)
   │   ├─ Upsert bounce record (dedup on unique key)
   │   ├─ Update loan if needed
   │   └─ Create history entry
   ├─ Update batch metrics
   └─ UNLOCK & COMMIT

5. POST-PROCESSING
   ├─ Generate quality report
   ├─ Send notifications to agents
   └─ Log metrics
```

### PostgreSQL Implementation

```sql
-- Helper Function: Calculate File Hash
CREATE OR REPLACE FUNCTION calculate_file_hash(file_content TEXT)
RETURNS VARCHAR AS $$
BEGIN
  RETURN encode(digest(file_content, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper Function: Check if File Already Uploaded
CREATE OR REPLACE FUNCTION check_duplicate_upload(file_hash VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  count INT;
BEGIN
  SELECT COUNT(*) INTO count FROM upload_batches 
  WHERE file_hash = $1 AND status IN ('COMPLETED', 'PROCESSING');
  RETURN count > 0;
END;
$$ LANGUAGE plpgsql;

-- Main Import Function
CREATE OR REPLACE FUNCTION import_bounce_data(
  p_batch_data JSONB,
  p_uploaded_by VARCHAR,
  p_file_name VARCHAR,
  p_file_hash VARCHAR
)
RETURNS TABLE (
  batch_id UUID,
  status VARCHAR,
  new_records INT,
  updated_records INT,
  duplicate_records INT,
  failed_records INT,
  error_message TEXT
) AS $$
DECLARE
  v_batch_id UUID;
  v_new_count INT := 0;
  v_updated_count INT := 0;
  v_duplicate_count INT := 0;
  v_failed_count INT := 0;
  v_error TEXT := NULL;
  v_record JSONB;
  v_user_id VARCHAR;
  v_loan_id UUID;
  v_existing_loan_id UUID;
  v_bounce_id UUID;
  v_loan_status VARCHAR;
BEGIN
  -- Check for duplicate upload
  IF check_duplicate_upload(p_file_hash) THEN
    RETURN QUERY SELECT 
      gen_random_uuid()::UUID,
      'FAILED'::VARCHAR,
      0::INT,
      0::INT,
      0::INT,
      0::INT,
      'Duplicate file upload detected (same file_hash). Already processed.'::TEXT;
    RETURN;
  END IF;

  -- Create upload batch
  INSERT INTO upload_batches (uploaded_by, file_name, file_hash, total_records, status)
  VALUES (p_uploaded_by, p_file_name, p_file_hash, jsonb_array_length(p_batch_data), 'PROCESSING')
  RETURNING upload_batches.batch_id INTO v_batch_id;

  BEGIN
    -- Process each record
    FOR v_record IN SELECT jsonb_array_elements(p_batch_data)
    LOOP
      BEGIN
        v_user_id := v_record ->> 'userId';
        
        -- VALIDATION
        IF v_user_id IS NULL OR LENGTH(TRIM(v_user_id)) = 0 THEN
          v_failed_count := v_failed_count + 1;
          CONTINUE;
        END IF;

        -- Ensure user exists (upsert)
        INSERT INTO users (user_id, name, created_by_batch_id)
        VALUES (
          v_user_id,
          v_record ->> 'name',
          v_batch_id
        )
        ON CONFLICT (user_id) DO NOTHING;

        -- Get or create loan
        SELECT loan_id INTO v_existing_loan_id
        FROM loans
        WHERE external_ref_id = (v_record ->> 'externalRefId')
        LIMIT 1;

        IF v_existing_loan_id IS NULL THEN
          -- Create new loan
          INSERT INTO loans (
            user_id,
            external_ref_id,
            invoice_id,
            lender,
            principal_amount,
            interest_amount,
            total_amount,
            interest_rate,
            status,
            created_by_batch_id
          ) VALUES (
            v_user_id,
            v_record ->> 'externalRefId',
            v_record ->> 'invoiceId',
            v_record ->> 'lender',
            (v_record ->> 'principalAmount')::DECIMAL,
            (v_record ->> 'interestAmount')::DECIMAL,
            (v_record ->> 'amount')::DECIMAL,
            (v_record ->> 'interestRate')::DECIMAL,
            'ACTIVE',
            v_batch_id
          )
          RETURNING loan_id INTO v_loan_id;
          
          v_new_count := v_new_count + 1;

          -- Create initial follow-up action
          INSERT INTO follow_up_actions (loan_id, user_id, status)
          VALUES (v_loan_id, v_user_id, 'PENDING');

        ELSE
          v_loan_id := v_existing_loan_id;
          
          -- Check if loan is CLOSED - DO NOT PROCESS
          SELECT status INTO v_loan_status FROM loans WHERE loan_id = v_loan_id;
          
          IF v_loan_status IN ('CLOSED', 'PAID') THEN
            -- Closed loans should not reappear in bounce data
            -- Skip processing but log the attempt
            INSERT INTO follow_up_history (
              followup_id, loan_id, user_id, action_type, 
              remarks, created_by, created_by_batch_id
            ) SELECT 
              followup_id, loan_id, user_id,
              'COMMENT_ADDED', 
              'Bounce record skipped - loan already closed',
              'SYSTEM',
              v_batch_id
            FROM follow_up_actions WHERE loan_id = v_loan_id LIMIT 1;
            
            v_duplicate_count := v_duplicate_count + 1;
            CONTINUE;
          END IF;

          v_updated_count := v_updated_count + 1;
        END IF;

        -- Upsert bounce collection record (deduplication on unique key)
        INSERT INTO bounced_collections (
          loan_id,
          user_id,
          collection_date,
          bounce_reason,
          bounce_code,
          amount_attempted,
          collection_method,
          pg_name,
          batch_id
        ) VALUES (
          v_loan_id,
          v_user_id,
          (v_record ->> 'collectionDate')::TIMESTAMP,
          v_record ->> 'comment',
          v_record ->> 'bounceCode',
          (v_record ->> 'amount')::DECIMAL,
          v_record ->> 'collectionMethod',
          v_record ->> 'pgName',
          v_batch_id
        )
        ON CONFLICT ON CONSTRAINT idx_bounced_deduplication DO NOTHING;

        -- Update follow-up action status
        UPDATE follow_up_actions
        SET 
          status = CASE 
            WHEN status = 'PENDING' THEN 'IN_PROGRESS'
            ELSE status
          END,
          last_followup_date = CURRENT_TIMESTAMP
        WHERE loan_id = v_loan_id;

        -- Create history entry
        INSERT INTO follow_up_history (
          followup_id, loan_id, user_id, action_type,
          remarks, created_by, created_by_batch_id
        ) SELECT 
          followup_id, v_loan_id, v_user_id,
          'COMMENT_ADDED',
          'Bounce: ' || COALESCE(v_record ->> 'comment', 'Transaction failed'),
          'SYSTEM',
          v_batch_id
        FROM follow_up_actions WHERE loan_id = v_loan_id LIMIT 1;

      EXCEPTION WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        v_error := COALESCE(v_error || ', ', '') || SQLERRM;
        CONTINUE;
      END;
    END LOOP;

    -- Update batch metrics
    UPDATE upload_batches SET
      new_records = v_new_count,
      updated_records = v_updated_count,
      duplicate_records = v_duplicate_count,
      failed_records = v_failed_count,
      status = CASE WHEN v_failed_count > 0 THEN 'COMPLETED_WITH_ERRORS' ELSE 'COMPLETED' END,
      processing_completed_at = CURRENT_TIMESTAMP,
      error_message = v_error
    WHERE batch_id = v_batch_id;

    RETURN QUERY SELECT 
      v_batch_id,
      'COMPLETED'::VARCHAR,
      v_new_count::INT,
      v_updated_count::INT,
      v_duplicate_count::INT,
      v_failed_count::INT,
      v_error::TEXT;

  EXCEPTION WHEN OTHERS THEN
    UPDATE upload_batches SET
      status = 'FAILED',
      error_message = SQLERRM,
      processing_completed_at = CURRENT_TIMESTAMP
    WHERE batch_id = v_batch_id;

    RETURN QUERY SELECT 
      v_batch_id,
      'FAILED'::VARCHAR,
      0::INT,
      0::INT,
      0::INT,
      0::INT,
      SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql;
```

---

## BEST PRACTICES

### 1. IDEMPOTENT IMPORTS (Same Upload = Same Result)

```sql
-- Before accepting upload, calculate hash
SELECT file_hash, status FROM upload_batches 
WHERE file_hash = 'abc123def456'
AND status = 'COMPLETED';
-- If exists: reject with "Already processed"

-- Within transaction, all operations are:
-- - INSERT ... ON CONFLICT DO NOTHING
-- - UPDATE ... WHERE conditions are immutable
```

### 2. PREVENTING CLOSED LOANS FROM REOPENING

```sql
-- Query for follow-up display
SELECT l.loan_id, l.user_id, l.principal_amount, l.status, fa.status
FROM loans l
LEFT JOIN follow_up_actions fa ON l.loan_id = fa.loan_id
WHERE l.status != 'CLOSED'  -- <-- CRITICAL
  AND l.status != 'PAID'
  AND fa.status IN ('PENDING', 'IN_PROGRESS')
ORDER BY fa.next_followup_date ASC;

-- When closing a loan
BEGIN TRANSACTION;
  UPDATE loans SET status = 'CLOSED', closed_at = NOW() 
  WHERE loan_id = $1 AND status != 'CLOSED';
  
  INSERT INTO loan_status_changes 
  (loan_id, user_id, from_status, to_status, change_reason, triggered_by)
  SELECT loan_id, user_id, status, 'CLOSED', 'Payment received', 'AGENT_ACTION'
  WHERE loan_id = $1;
COMMIT;
```

### 3. MAINTAINING IMMUTABLE HISTORY

```sql
-- Never UPDATE follow_up_history
-- Always INSERT new records

-- When agent adds remark:
INSERT INTO follow_up_history (
  followup_id, loan_id, user_id, action_type,
  remarks, created_by
) VALUES ($1, $2, $3, 'COMMENT_ADDED', $4, current_user);

-- Query history (always in order)
SELECT * FROM follow_up_history 
WHERE followup_id = $1 
ORDER BY created_at ASC;
```

### 4. HANDLING PARTIAL PAYMENTS

```sql
-- Update function
CREATE OR REPLACE FUNCTION record_partial_payment(
  p_loan_id UUID,
  p_amount DECIMAL,
  p_payment_date TIMESTAMP
)
RETURNS TABLE (loan_id UUID, new_status VARCHAR, remaining_amount DECIMAL) AS $$
BEGIN
  UPDATE loans SET
    paid_principal_amount = paid_principal_amount + p_amount,
    pending_principal_amount = pending_principal_amount - p_amount,
    status = CASE
      WHEN (pending_principal_amount - p_amount) <= 0 THEN 'PAID'
      ELSE 'PARTIALLY_PAID'
    END,
    last_updated_at = CURRENT_TIMESTAMP
  WHERE loan_id = p_loan_id;

  INSERT INTO follow_up_history (
    followup_id, loan_id, user_id, action_type, remarks, created_by
  ) SELECT 
    followup_id, loan_id, user_id, 'PAYMENT_RECORDED',
    'Payment of ' || p_amount || ' received on ' || p_payment_date,
    'AGENT_ACTION'
  FROM follow_up_actions WHERE loan_id = p_loan_id;

  RETURN QUERY SELECT 
    loan_id, status, pending_principal_amount 
  FROM loans WHERE loan_id = p_loan_id;
END;
$$ LANGUAGE plpgsql;
```

### 5. REOPENING CLOSED LOANS (Explicit)

```sql
CREATE OR REPLACE FUNCTION reopen_loan(
  p_loan_id UUID,
  p_reason VARCHAR
)
RETURNS VARCHAR AS $$
DECLARE
  v_current_status VARCHAR;
BEGIN
  SELECT status INTO v_current_status FROM loans WHERE loan_id = p_loan_id;
  
  IF v_current_status NOT IN ('CLOSED', 'PAID') THEN
    RAISE EXCEPTION 'Can only reopen CLOSED or PAID loans';
  END IF;

  UPDATE loans SET 
    status = 'REOPENED',
    closed_at = NULL
  WHERE loan_id = p_loan_id;

  INSERT INTO loan_status_changes 
  (loan_id, from_status, to_status, change_reason, triggered_by, user_id)
  SELECT loan_id, v_current_status, 'REOPENED', p_reason, 'MANUAL_OVERRIDE', user_id
  FROM loans WHERE loan_id = p_loan_id;

  RETURN 'Loan reopened successfully';
END;
$$ LANGUAGE plpgsql;
```

### 6. TRANSACTION-SAFE UPDATES

```sql
-- Always use BEGIN/COMMIT
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- Lock the loan row
  SELECT * FROM loans WHERE loan_id = $1 FOR UPDATE;
  
  -- Lock related follow-up action
  SELECT * FROM follow_up_actions WHERE loan_id = $1 FOR UPDATE;
  
  -- Do all updates
  UPDATE loans SET status = 'PAID' WHERE loan_id = $1;
  UPDATE follow_up_actions SET status = 'CLOSED' WHERE loan_id = $1;
  
  INSERT INTO follow_up_history (...) VALUES (...);
  
COMMIT;
```

### 7. DATA VALIDATION RULES

```sql
-- Application-level validation before DB
function validateBounceRecord(record):
  - required: userId, loanId, amount, collectionDate
  - amount > 0
  - collectionDate <= TODAY
  - bounceReason not empty
  - lender not empty
  
  return errors if any

-- Database-level constraints
ALTER TABLE loans ADD CONSTRAINT check_amounts CHECK (
  pending_principal_amount >= 0 
  AND paid_principal_amount >= 0
  AND paid_principal_amount + pending_principal_amount = principal_amount
);
```

---

## IMPLEMENTATION EXAMPLES

### Node.js/Express Implementation

```javascript
const { Pool } = require('pg');
const crypto = require('crypto');
const csv = require('csv-parse');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

class BounceImportService {
  /**
   * Calculate file hash for deduplication
   */
  static calculateFileHash(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return crypto
      .createHash('sha256')
      .update(fileContent)
      .digest('hex');
  }

  /**
   * Validate CSV structure and data quality
   */
  static async validateCsvFile(filePath) {
    const errors = [];
    const records = [];

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv.parse({ columns: true }))
        .on('data', (row) => {
          const recordErrors = this.validateRecord(row);
          if (recordErrors.length > 0) {
            errors.push({ record: row, errors: recordErrors });
          } else {
            records.push(row);
          }
        })
        .on('end', () => {
          resolve({ records, errors, isValid: errors.length === 0 });
        })
        .on('error', reject);
    });
  }

  /**
   * Validate individual record
   */
  static validateRecord(record) {
    const errors = [];

    if (!record.userId || record.userId.trim() === '') {
      errors.push('Missing or empty userId');
    }
    if (!record.loanId || record.loanId.trim() === '') {
      errors.push('Missing or empty loanId');
    }
    if (!record.amount || parseFloat(record.amount) <= 0) {
      errors.push('Invalid amount');
    }
    if (!record.collectionDate) {
      errors.push('Missing collectionDate');
    }
    if (!record.lender || record.lender.trim() === '') {
      errors.push('Missing lender');
    }

    return errors;
  }

  /**
   * Deduplicate records within the batch
   */
  static deduplicateRecords(records) {
    const seen = new Set();
    const deduplicated = [];
    const duplicates = [];

    for (const record of records) {
      const key = `${record.loanId}|${record.collectionDate}|${record.bounceReason || ''}|${record.amount}`;
      if (seen.has(key)) {
        duplicates.push(record);
      } else {
        seen.add(key);
        deduplicated.push(record);
      }
    }

    return { deduplicated, duplicates };
  }

  /**
   * Check if file already uploaded
   */
  static async checkDuplicateUpload(fileHash) {
    const result = await pool.query(
      'SELECT batch_id FROM upload_batches WHERE file_hash = $1 AND status = $2',
      [fileHash, 'COMPLETED']
    );
    return result.rows.length > 0;
  }

  /**
   * Main import function
   */
  static async importBounceData(filePath, uploadedBy, fileName) {
    const client = await pool.connect();
    let batchId;
    const fileHash = this.calculateFileHash(filePath);

    try {
      // Check for duplicate upload
      const isDuplicate = await this.checkDuplicateUpload(fileHash);
      if (isDuplicate) {
        return {
          success: false,
          error: 'This file has already been uploaded',
          fileHash,
        };
      }

      // Validate CSV
      const validation = await this.validateCsvFile(filePath);
      if (!validation.isValid) {
        return {
          success: false,
          error: 'CSV validation failed',
          details: validation.errors,
        };
      }

      // Deduplicate within batch
      const { deduplicated, duplicates } = this.deduplicateRecords(
        validation.records
      );

      // Prepare data for SQL function
      const batchData = deduplicated.map((record) => ({
        userId: record.userId.trim(),
        name: record.name || '',
        externalRefId: record.externalRefId || '',
        invoiceId: record.invoiceId || '',
        lender: record.lender.trim(),
        principalAmount: parseFloat(record.principalAmount),
        interestAmount: parseFloat(record.interestAmount || 0),
        amount: parseFloat(record.amount),
        interestRate: parseFloat(record.interestRate || 0),
        collectionDate: record.collectionDate,
        comment: record.comment || '',
        bounceCode: record.bounceCode || '',
        collectionMethod: record.collectionMethod || '',
        pgName: record.pgName || '',
      }));

      // Begin transaction
      await client.query('BEGIN');

      // Call import function
      const result = await client.query(
        'SELECT * FROM import_bounce_data($1, $2, $3, $4)',
        [JSON.stringify(batchData), uploadedBy, fileName, fileHash]
      );

      await client.query('COMMIT');

      const importResult = result.rows[0];
      batchId = importResult.batch_id;

      return {
        success: true,
        batchId,
        newRecords: importResult.new_records,
        updatedRecords: importResult.updated_records,
        duplicateRecords: importResult.duplicate_records,
        duplicatesWithinBatch: duplicates.length,
        failedRecords: importResult.failed_records,
        errorMessage: importResult.error_message,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Import error:', error);
      return {
        success: false,
        error: error.message,
        batchId,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get loans for follow-up (active only)
   */
  static async getFollowUpLoans(filters = {}) {
    let query = `
      SELECT 
        l.loan_id,
        l.user_id,
        u.name,
        u.phone,
        l.principal_amount,
        l.pending_principal_amount,
        l.status as loan_status,
        fa.status as followup_status,
        fa.assigned_to_agent,
        fa.next_followup_date,
        bc.bounce_reason,
        COUNT(bc.bounce_id) as bounce_count
      FROM loans l
      JOIN users u ON l.user_id = u.user_id
      LEFT JOIN follow_up_actions fa ON l.loan_id = fa.loan_id
      LEFT JOIN bounced_collections bc ON l.loan_id = bc.loan_id
      WHERE l.status NOT IN ('CLOSED', 'PAID')
        AND fa.status IN ('PENDING', 'IN_PROGRESS')
    `;

    const params = [];

    if (filters.agentId) {
      query += ` AND fa.assigned_to_agent = $${params.length + 1}`;
      params.push(filters.agentId);
    }

    if (filters.userId) {
      query += ` AND l.user_id = $${params.length + 1}`;
      params.push(filters.userId);
    }

    query += ` GROUP BY l.loan_id, u.user_id, fa.followup_id ORDER BY fa.next_followup_date ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Close a loan
   */
  static async closeLoan(loanId, reason) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const loanResult = await client.query(
        'SELECT user_id, status FROM loans WHERE loan_id = $1 FOR UPDATE',
        [loanId]
      );

      if (loanResult.rows.length === 0) {
        throw new Error('Loan not found');
      }

      const { user_id: userId, status } = loanResult.rows[0];

      if (status === 'CLOSED') {
        throw new Error('Loan already closed');
      }

      // Update loan status
      await client.query(
        'UPDATE loans SET status = $1, closed_at = NOW() WHERE loan_id = $2',
        ['CLOSED', loanId]
      );

      // Update follow-up action
      const followupResult = await client.query(
        'SELECT followup_id FROM follow_up_actions WHERE loan_id = $1',
        [loanId]
      );

      if (followupResult.rows.length > 0) {
        const followupId = followupResult.rows[0].followup_id;
        await client.query(
          'UPDATE follow_up_actions SET status = $1 WHERE followup_id = $2',
          ['CLOSED', followupId]
        );

        // Add history entry
        await client.query(
          `INSERT INTO follow_up_history 
           (followup_id, loan_id, user_id, action_type, remarks, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [followupId, loanId, userId, 'CLOSED', reason, 'AGENT_ACTION']
        );
      }

      // Record status change
      await client.query(
        `INSERT INTO loan_status_changes 
         (loan_id, user_id, from_status, to_status, change_reason, triggered_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [loanId, userId, status, 'CLOSED', reason, 'AGENT_ACTION']
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record payment
   */
  static async recordPayment(loanId, amount, paymentDate = new Date()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE loans 
         SET paid_principal_amount = paid_principal_amount + $1,
             pending_principal_amount = pending_principal_amount - $1,
             status = CASE 
               WHEN (pending_principal_amount - $1) <= 0 THEN 'PAID'
               ELSE 'PARTIALLY_PAID'
             END,
             last_updated_at = NOW()
         WHERE loan_id = $2
         RETURNING loan_id, status, pending_principal_amount`,
        [amount, loanId]
      );

      if (result.rows.length === 0) {
        throw new Error('Loan not found');
      }

      const { status, pending_principal_amount } = result.rows[0];

      // Get user for history
      const userResult = await client.query(
        'SELECT user_id FROM loans WHERE loan_id = $1',
        [loanId]
      );
      const userId = userResult.rows[0].user_id;

      // Get followup_id
      const followupResult = await client.query(
        'SELECT followup_id FROM follow_up_actions WHERE loan_id = $1',
        [loanId]
      );

      if (followupResult.rows.length > 0) {
        const followupId = followupResult.rows[0].followup_id;

        // Add history entry
        await client.query(
          `INSERT INTO follow_up_history 
           (followup_id, loan_id, user_id, action_type, remarks, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            followupId,
            loanId,
            userId,
            'PAYMENT_RECORDED',
            `Payment of ₹${amount} received on ${paymentDate.toISOString().split('T')[0]}`,
            'AGENT_ACTION',
          ]
        );
      }

      await client.query('COMMIT');
      return { success: true, newStatus: status, pendingAmount: pending_principal_amount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = BounceImportService;
```

### Express Route Example

```javascript
const express = require('express');
const multer = require('multer');
const BounceImportService = require('./services/BounceImportService');

const router = express.Router();
const upload = multer({ dest: '/tmp/uploads' });

// Upload bounce data
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await BounceImportService.importBounceData(
      req.file.path,
      req.user.id,
      req.file.originalname
    );

    if (result.success) {
      res.json({
        success: true,
        batchId: result.batchId,
        summary: {
          newRecords: result.newRecords,
          updatedRecords: result.updatedRecords,
          duplicateRecords: result.duplicateRecords + result.duplicatesWithinBatch,
          failedRecords: result.failedRecords,
        },
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get follow-up loans
router.get('/followups', async (req, res) => {
  try {
    const loans = await BounceImportService.getFollowUpLoans({
      agentId: req.query.agentId,
      userId: req.query.userId,
    });
    res.json(loans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close a loan
router.post('/loans/:loanId/close', async (req, res) => {
  try {
    const result = await BounceImportService.closeLoan(
      req.params.loanId,
      req.body.reason
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Record payment
router.post('/loans/:loanId/payment', async (req, res) => {
  try {
    const result = await BounceImportService.recordPayment(
      req.params.loanId,
      req.body.amount,
      new Date(req.body.paymentDate)
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
```

---

## TESTING CHECKLIST

- [ ] Upload same file twice → 2nd upload rejected
- [ ] Upload with duplicate records within file → Deduped
- [ ] Close loan, then upload bounce for same loan → Bounce skipped
- [ ] Reopen closed loan → System allows, shows in follow-up
- [ ] Partial payment → Status changes to PARTIALLY_PAID
- [ ] Full payment → Status changes to PAID, no more follow-ups
- [ ] Agent adds remark → Previous remarks visible in history
- [ ] Multiple loans per user → All tracked separately
- [ ] Database down during import → Transaction rolls back
- [ ] Query for follow-ups → Only shows non-closed loans

---

## DEPLOYMENT CHECKLIST

- [ ] Create all tables and functions
- [ ] Create indexes (especially dedup key)
- [ ] Set up backup strategy (daily backups, 30-day retention)
- [ ] Monitor batch_id usage (for audit trail)
- [ ] Alert on failed uploads
- [ ] Monitor query performance (explain analyze)
- [ ] Set up CDC (Change Data Capture) if you need external sync
- [ ] Document rollback procedures
- [ ] Train team on system behavior
