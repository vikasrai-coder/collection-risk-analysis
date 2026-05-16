# MASTER PROMPT: Collection Risk Analysis & Probability Engine
## For GitHub Copilot, VS Code, Blackbox, OpenAI CodeInterpreter

---

## SYSTEM OVERVIEW
Build a **Production-Grade Collection Risk Assessment Platform** that analyzes customer payment defaults, calculates cumulative default values, tracks days overdue, and generates payment probability scores based on market standards.

**Platform**: Full-stack web application with secure authentication, persistent data storage, and real-time analytics dashboard.

---

## 1. CORE FUNCTIONALITY REQUIREMENTS

### 1.1 User Authentication & Authorization
- **Login System**: Email/Password-based authentication with JWT tokens
- **Session Management**: Token expiration (24hrs), refresh token rotation
- **Role-Based Access Control**: Admin, Collection Manager, Analyst, Viewer
- **Password Security**: bcrypt hashing, minimum 12 characters, complexity rules
- **Account Types**: 
  - Admin: Full system access + user management
  - Collection Manager: Upload files, view all customer data, manage collections
  - Analyst: View-only analytics and reports
  - Viewer: Limited dashboard view

### 1.2 File Upload & Storage System
**Upload Mechanism**:
- Accept CSV files (Collections data) with validation
- Max file size: 50MB per upload
- Supported format: RFC 4180 CSV standard
- Real-time file processing with progress indicator

**Storage Architecture**:
```
Database Schema:
├── Users (id, email, passwordHash, role, createdAt, lastLogin)
├── UploadSessions (id, userId, fileName, uploadDate, recordCount, status)
├── Collections (id, externalRefId, customerId, userId, loanId)
│   ├── Amount Data (amount, principalAmount, interestAmount, penaltyAmount)
│   ├── Dates (collectionDate, lastCollectionDate, overDueDays)
│   ├── Status (status, isSettled, comment)
│   ├── Customer Info (customerName, supplierName, category)
│   └── Metadata (createdAt, updatedAt, uploadSessionId)
├── CustomerDefaults (customerId, totalDefaultAmount, totalDefaultDays)
├── DefaultHistory (id, customerId, collectionDate, defaultAmount)
└── RiskScores (customerId, riskScore, paymentProbability, category, lastUpdated)
```

**Duplicate Handling Logic**:
```
ON UPLOAD:
1. Parse incoming CSV file
2. FOR each record:
   a. Generate unique key: HASH(loanId + customerId + collectionDate)
   b. Query database for existing record
   c. IF exists AND unchanged: SKIP (log skipped count)
   d. IF exists AND changed: UPDATE (log updated count)
   e. IF new: INSERT (log new count)
3. Provide upload summary:
   - New records added: X
   - Duplicates skipped: Y
   - Records updated: Z
   - Processing time: T seconds
   - Data validation errors: N
```

---

## 2. COLLECTION RISK ANALYSIS ENGINE

### 2.1 Default Payment Analysis
**Track per Customer**:
- Total number of bounced/failed payment attempts
- Total accumulated default amount (sum of all failed payment amounts)
- Total days of default (cumulative overDueDays from all records)
- Last default date
- Default frequency (defaults per month)
- Default severity (max default amount in single transaction)

**Calculation Formula**:
```
CUMULATIVE_DEFAULT_VALUE = SUM(amount) WHERE status='Bounced'
CUMULATIVE_DEFAULT_DAYS = SUM(overDueDays) WHERE status='Bounced'
AVERAGE_DEFAULT_AMOUNT = CUMULATIVE_DEFAULT_VALUE / COUNT(defaults)
DEFAULT_FREQUENCY = COUNT(defaults) / months_active
DEFAULT_RECENCY = DAYS_SINCE(lastDefaultDate)
```

### 2.2 Risk Score Calculation (0-100 Scale)

**Risk Scoring Model**:
```javascript
calculateRiskScore(customer) {
  // Component 1: Default Amount Impact (0-40 points)
  defaultAmountRatio = cumulativeDefaultValue / totalExpectedValue;
  amountScore = Math.min(40, defaultAmountRatio * 100);
  
  // Component 2: Days Overdue Impact (0-30 points)
  avgOverdueDays = cumulativeDefaultDays / defaultCount;
  if (avgOverdueDays > 90) daysScore = 30;
  else if (avgOverdueDays > 60) daysScore = 22;
  else if (avgOverdueDays > 30) daysScore = 15;
  else if (avgOverdueDays > 15) daysScore = 8;
  else daysScore = 0;
  
  // Component 3: Default Frequency (0-20 points)
  defaultFrequency = defaultCount / monthsActive;
  frequencyScore = Math.min(20, defaultFrequency * 5);
  
  // Component 4: Recency Penalty (0-10 points)
  daysSinceLastDefault = DAYS_SINCE(lastDefaultDate);
  if (daysSinceLastDefault < 7) recencyScore = 10;
  else if (daysSinceLastDefault < 30) recencyScore = 7;
  else if (daysSinceLastDefault < 90) recencyScore = 3;
  else recencyScore = 0;
  
  TOTAL_RISK_SCORE = amountScore + daysScore + frequencyScore + recencyScore;
  
  return Math.min(100, TOTAL_RISK_SCORE);
}

RISK_LEVELS:
- 0-20:   LOW RISK (Green)
- 21-50:  MEDIUM RISK (Yellow)
- 51-75:  HIGH RISK (Orange)
- 76-100: CRITICAL RISK (Red)
```

### 2.3 Payment Probability Estimation (Market Standard Model)

**Industry-Aligned Payment Probability**:
```javascript
calculatePaymentProbability(customer) {
  baselineProbability = 0.85; // 85% baseline market standard
  
  // Adjust based on default behavior
  defaultRateImpact = -0.30 * (defaultCount / monthsActive);
  
  // Adjust based on cumulative default days
  if (cumulativeDefaultDays > 180) daysImpact = -0.25;
  else if (cumulativeDefaultDays > 90) daysImpact = -0.15;
  else if (cumulativeDefaultDays > 30) daysImpact = -0.08;
  else daysImpact = 0;
  
  // Adjust based on recovery history
  if (settledPercentage > 0.8) recoveryBonus = +0.10;
  else if (settledPercentage > 0.5) recoveryBonus = +0.05;
  else recoveryBonus = 0;
  
  // Adjust based on category risk profile
  categoryRiskMultiplier = {
    'dairy': 0.88,
    'food_and_beverages': 0.82,
    'healthcare': 0.90,
    'retail': 0.78,
    'manufacturing': 0.85,
    'default': 0.80
  };
  
  paymentProbability = baselineProbability
    + defaultRateImpact
    + daysImpact
    + recoveryBonus;
  
  paymentProbability *= categoryRiskMultiplier[customer.category] || 0.85;
  
  return Math.max(0.01, Math.min(0.99, paymentProbability));
}

PROBABILITY_INDICATORS:
- 0.80-1.00: VERY LIKELY TO PAY (89-100% confidence)
- 0.60-0.79: LIKELY TO PAY (75-88% confidence)
- 0.40-0.59: MODERATE RISK (40-74% confidence)
- 0.20-0.39: UNLIKELY TO PAY (20-39% confidence)
- 0.00-0.19: HIGH DEFAULT RISK (<20% confidence)
```

---

## 3. DATA PROCESSING PIPELINE

### 3.1 CSV Ingestion & Validation
```javascript
validateAndIngestCSV(file) {
  // Step 1: File validation
  - Check MIME type (text/csv)
  - Verify file size < 50MB
  - Check for encoding (UTF-8)
  
  // Step 2: Parse CSV
  - Use streaming parser for large files
  - Handle quoted fields with commas
  - Track line numbers for error reporting
  
  // Step 3: Schema validation
  Required fields: [
    'externalRefId', 'userId', 'amount', 'overDueDays',
    'collectionDate', 'status', 'isSettled'
  ]
  
  - Validate data types (numeric, date, boolean)
  - Check date formats (ISO 8601 or DD-MM-YYYY)
  - Validate numeric ranges (amounts > 0)
  - Trim whitespace
  
  // Step 4: Deduplication
  - Generate composite key per record
  - Check database for existing records
  - Flag new vs. duplicate
  
  // Step 5: Data enrichment
  - Calculate days since collection attempt
  - Categorize bounce reasons
  - Parse customer category
  - Calculate derived metrics
}
```

### 3.2 Real-Time Analytics Updates
```
ON SUCCESSFUL UPLOAD:
1. Recalculate risk scores for affected customers
2. Update payment probability estimates
3. Refresh aggregate dashboards
4. Generate upload report with metrics
5. Send notifications to relevant users
6. Archive raw upload file for audit trail
7. Log all transactions in audit table
```

---

## 4. DASHBOARD & REPORTING

### 4.1 Customer-Level View
**Display per Customer**:
```
Customer Profile:
├── Basic Info: Name, ID, Category, Supplier, Contact
├── Financial Summary:
│   ├── Total Default Value: ₹X,XXX
│   ├── Total Overdue Days: X days
│   ├── Default Frequency: X defaults/month
│   ├── Average Default Amount: ₹X,XXX
│   └── Settlement Rate: X%
├── Risk Assessment:
│   ├── Risk Score: 65/100 [HIGH RISK - Orange]
│   ├── Payment Probability: 42% [MODERATE RISK]
│   ├── Risk Category: [HIGH, MEDIUM, LOW]
│   └── Recommendation: [ACTION REQUIRED / MONITOR / SAFE]
├── Default History (Table):
│   - Collection Date | Loan ID | Amount | Days Overdue | Status | Bounce Reason
├── Trend Charts:
│   - Default Amount Over Time (Line Chart)
│   - Cumulative Days Overdue (Area Chart)
│   - Default Frequency Trend (Bar Chart)
└── Action Items:
    - Last Default: X days ago
    - Next Review: X date
    - Assigned To: Manager Name
    - Priority Level: [CRITICAL / HIGH / MEDIUM / LOW]
```

### 4.2 Portfolio-Level Dashboard
```
Executive Summary:
├── KPIs
│   ├── Total Portfolio Value: ₹X,XXX,XXX
│   ├── Total Defaults (Current Month): ₹X,XXX
│   ├── Active Customers: X
│   ├── At-Risk Customers: X
│   ├── Average Portfolio Risk Score: XX/100
│   └── Average Payment Probability: XX%
├── Risk Distribution (Pie Chart)
│   - Low Risk: X% (Green)
│   - Medium Risk: X% (Yellow)
│   - High Risk: X% (Orange)
│   - Critical Risk: X% (Red)
├── Category Analysis
│   - Risk Score by Category (Bar Chart)
│   - Default Amount by Category (Horizontal Bar)
│   - Recovery Rate by Category (Line Chart)
├── Time Series Analytics
│   - Default Trends (Last 12 Months)
│   - Default Amount Trend
│   - Payment Probability Trend
├── Top 10 At-Risk Customers (Table)
│   - Customer | Risk Score | Probability | Default Amount | Days Overdue | Action
└── Performance Metrics
    - Collection Success Rate: X%
    - Average Recovery Time: X days
    - Default Prevention Rate: X%
```

### 4.3 Reports & Exports
- **Collection Report**: Detailed defaults by date range, customer, category
- **Risk Report**: Risk assessment with recommendations
- **Compliance Report**: Audit trail, data quality metrics
- **Performance Report**: Collection effectiveness metrics
- **Export Formats**: PDF, Excel, CSV with charts and tables

---

## 5. TECHNICAL ARCHITECTURE

### 5.1 Backend Stack (Recommended)
```
Framework: Node.js + Express.js OR Python + FastAPI
Database: PostgreSQL (primary) + Redis (caching)
Authentication: JWT + OAuth2.0
File Processing: Node.js streams OR Pandas
ML/Analytics: Python scikit-learn OR TensorFlow
Deployment: Docker + Kubernetes / AWS Lambda
Message Queue: Redis Queue / RabbitMQ for async jobs
```

### 5.2 Frontend Stack
```
Framework: React.js OR Vue.js 3
State Management: Redux Toolkit / Vuex
Charting: Recharts / Chart.js / D3.js
Data Tables: React-Table / AG-Grid
Authentication: JWT stored in secure HTTPOnly cookies
UI Framework: Material-UI / TailwindCSS / Bootstrap
```

### 5.3 Database Schema (PostgreSQL)
```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'analyst', 'viewer'),
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lastLogin TIMESTAMP,
  loginAttempts INT DEFAULT 0,
  lockedUntil TIMESTAMP
);

-- Collections Data
CREATE TABLE collections (
  id UUID PRIMARY KEY,
  externalRefId VARCHAR(255),
  customerId VARCHAR(255) NOT NULL,
  userId VARCHAR(255),
  loanId VARCHAR(255) UNIQUE,
  amount DECIMAL(12,2) NOT NULL,
  principalAmount DECIMAL(12,2),
  interestAmount DECIMAL(12,2),
  penaltyAmount DECIMAL(12,2),
  collectionDate DATE NOT NULL,
  lastCollectionDate DATE,
  overDueDays INT DEFAULT 0,
  status ENUM('Bounced', 'Success', 'Pending', 'Settled'),
  isSettled BOOLEAN DEFAULT false,
  comment TEXT,
  category VARCHAR(100),
  supplierName VARCHAR(255),
  bounceReason VARCHAR(500),
  uploadSessionId UUID REFERENCES upload_sessions(id),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(loanId, collectionDate),
  INDEX(customerId),
  INDEX(collectionDate),
  INDEX(status)
);

-- Customer Default Summary
CREATE TABLE customer_defaults (
  customerId VARCHAR(255) PRIMARY KEY,
  customerName VARCHAR(255),
  category VARCHAR(100),
  totalDefaultValue DECIMAL(14,2) DEFAULT 0,
  totalDefaultDays INT DEFAULT 0,
  defaultCount INT DEFAULT 0,
  lastDefaultDate DATE,
  settledCount INT DEFAULT 0,
  monthsActive INT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk Scores
CREATE TABLE risk_scores (
  id UUID PRIMARY KEY,
  customerId VARCHAR(255) REFERENCES customer_defaults(customerId),
  riskScore DECIMAL(5,2) NOT NULL,
  paymentProbability DECIMAL(5,4) NOT NULL,
  riskLevel ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
  recommendation VARCHAR(255),
  calculatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  validUntil TIMESTAMP,
  UNIQUE(customerId),
  INDEX(riskScore),
  INDEX(paymentProbability)
);

-- Upload Sessions
CREATE TABLE upload_sessions (
  id UUID PRIMARY KEY,
  userId UUID REFERENCES users(id),
  fileName VARCHAR(255),
  uploadDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recordCount INT,
  newRecords INT DEFAULT 0,
  duplicateRecords INT DEFAULT 0,
  updatedRecords INT DEFAULT 0,
  failedRecords INT DEFAULT 0,
  status ENUM('PROCESSING', 'SUCCESS', 'FAILED', 'PARTIAL'),
  errorMessage TEXT,
  processingTimeMs INT
);
```

---

## 6. KEY FEATURES IMPLEMENTATION

### 6.1 Duplicate Detection Algorithm
```javascript
generateRecordKey(record) {
  // Create deterministic hash from unique identifying fields
  const key = `${record.loanId}|${record.customerId}|${formatDate(record.collectionDate)}`;
  return SHA256(key);
}

async checkDuplicate(hashedKey) {
  const existing = await db.query(
    'SELECT id, amount, status FROM collections WHERE compositeKey = ?',
    [hashedKey]
  );
  
  if (existing.length === 0) return { isDuplicate: false, action: 'INSERT' };
  
  if (existing[0].amount === incomingRecord.amount &&
      existing[0].status === incomingRecord.status) {
    return { isDuplicate: true, action: 'SKIP' };
  }
  
  return { isDuplicate: true, action: 'UPDATE', existingId: existing[0].id };
}
```

### 6.2 Real-Time Risk Recalculation
```javascript
async onUploadComplete(uploadSessionId) {
  // Get all affected customers
  const affectedCustomers = await db.query(`
    SELECT DISTINCT customerId FROM collections 
    WHERE uploadSessionId = ?
  `, [uploadSessionId]);
  
  // Recalculate metrics for each customer
  for (const customer of affectedCustomers) {
    await recalculateCustomerMetrics(customer.customerId);
    await updateRiskScore(customer.customerId);
    await updatePaymentProbability(customer.customerId);
  }
  
  // Update dashboard aggregates
  await refreshPortfolioMetrics();
  
  // Send notifications
  await notifyUsers(affectedCustomers);
}
```

### 6.3 Audit & Compliance Logging
```javascript
async auditLog(action, userId, details) {
  // Log every action for compliance
  await db.insert('audit_logs', {
    id: generateUUID(),
    action,
    userId,
    details: JSON.stringify(details),
    ipAddress: getClientIP(),
    userAgent: getUserAgent(),
    timestamp: new Date(),
    recordCount: details.affectedRecords?.length || 0
  });
}
```

---

## 7. API ENDPOINTS

### Authentication
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh-token
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

### File Management
```
POST   /api/upload/csv                    - Upload collection CSV
GET    /api/upload/status/:sessionId      - Get upload progress
GET    /api/upload/history                - List all uploads
GET    /api/upload/download/:sessionId    - Download upload report
```

### Customer Data
```
GET    /api/customers                     - List all customers with filters
GET    /api/customers/:customerId         - Get customer detail + risk
POST   /api/customers/batch-update        - Update multiple records
GET    /api/customers/:customerId/defaults - Get default history
GET    /api/customers/:customerId/trends  - Get historical trends
```

### Analytics & Reporting
```
GET    /api/dashboard/summary             - Portfolio KPIs
GET    /api/dashboard/risk-distribution   - Risk level breakdown
GET    /api/dashboard/category-analysis   - Analysis by category
GET    /api/dashboard/top-at-risk         - Top 10 customers
GET    /api/reports/risk                  - Generate risk report
GET    /api/reports/collection            - Generate collection report
GET    /api/reports/export/:format        - Export as PDF/Excel/CSV
```

---

## 8. SECURITY REQUIREMENTS

- **Data Encryption**: AES-256 for sensitive fields at rest, TLS 1.3 in transit
- **Authentication**: Multi-factor authentication (2FA) for admin accounts
- **Access Control**: Row-level security (users see only assigned customers)
- **Input Validation**: Strict schema validation on all inputs
- **SQL Injection Prevention**: Parameterized queries, ORM usage
- **Rate Limiting**: 100 requests/minute per user
- **Session Management**: HTTP-only cookies, 24-hour expiration
- **Audit Trail**: Complete logging of all data access and modifications
- **GDPR Compliance**: Data retention policies, user data export/deletion
- **PCI-DSS**: If handling payment data (tokenization required)

---

## 9. DEPLOYMENT CHECKLIST

- [ ] Database migrations and schema setup
- [ ] Environment configuration (.env files)
- [ ] SSL/TLS certificates
- [ ] JWT secret key generation
- [ ] Database backup automation
- [ ] Logging and monitoring setup
- [ ] Error tracking (Sentry)
- [ ] Performance monitoring (New Relic / DataDog)
- [ ] Load testing (k6 / JMeter)
- [ ] Security scanning (OWASP, SonarQube)
- [ ] Documentation generation
- [ ] User onboarding workflow
- [ ] Support contact configuration

---

## 10. TESTING STRATEGY

### Unit Tests
- Risk calculation algorithms
- Probability estimation functions
- Duplicate detection logic
- Data validation functions

### Integration Tests
- CSV upload end-to-end
- Database operations
- API endpoints
- Authentication flow

### Performance Tests
- CSV ingestion with 1M+ records
- Dashboard query performance (< 2s)
- Concurrent user load (100+ users)
- File upload bandwidth optimization

### Security Tests
- SQL injection attempts
- XSS vulnerability scanning
- Authentication bypass attempts
- Unauthorized data access attempts

---

## 11. SAMPLE DATA MAPPING

**Input CSV Fields → Database Fields**:
```
externalRefId          → externalRefId
nachRefId              → [skip]
amount                 → amount
interestAmount         → interestAmount
overdueIntAmt          → overdueInterestAmount
penalAmount            → penaltyAmount
principalAmount        → principalAmount
userId                 → customerId
name                   → customerName
supplierName           → supplierName
collectionDate         → collectionDate
overDueDays            → overDueDays
status                 → status (map 'Bounced' to failure)
comment                → bounceReason
category               → category
isSettled              → isSettled (boolean)
loanId                 → loanId (unique identifier)
```

---

## 12. USAGE INSTRUCTIONS FOR CODE GENERATION

**For GitHub Copilot / VS Code**:
1. Create new project: `npm init -y` or `python -m venv`
2. Open this prompt in your code editor
3. Use Copilot with: "Implement [section number] based on the master prompt"
4. Example: "@copilot Implement the Risk Score Calculation (Section 2.2)"

**For Blackbox**:
1. Copy this entire prompt
2. Paste into Blackbox chat
3. Request: "Generate full implementation of Collection Risk System"
4. Specify: "Generate in [Node.js/Python/React]"

**For ChatGPT/Claude API**:
1. Create system prompt: "You are an expert full-stack developer..."
2. Feed this master prompt as context
3. Request: "Implement [feature] following this architecture"

---

## 13. SUCCESS METRICS

After deployment, track:
- **System Performance**: Upload processing < 10s for 100K records
- **Data Quality**: 99.9% accuracy in risk calculations
- **User Adoption**: 80%+ of collection managers using system
- **Risk Detection**: Early identification of 90%+ of defaults
- **ROI**: X% reduction in collection losses within 6 months

---

**Last Updated**: May 2026
**Version**: 1.0
**Status**: Production-Ready
