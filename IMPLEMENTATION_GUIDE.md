# Collection Risk Analysis System - Complete Implementation

A production-grade full-stack application for analyzing payment defaults, calculating risk scores, and managing collection portfolios.

## 🚀 System Overview

This system helps supply chain finance companies:
- Analyze payment defaults per customer
- Calculate risk scores (0-100) using a 4-component model
- Estimate payment probability (0-100%) with market-standard baseline
- Handle CSV uploads with automatic deduplication
- Provide executive dashboards with complete visibility

## 📁 Project Structure

```
collection-risk/
├── backend/                          # Node.js Express API
│   ├── src/
│   │   ├── index.js                 # Main server entry
│   │   ├── routes/
│   │   │   ├── auth.js              # Authentication endpoints
│   │   │   ├── upload.js            # CSV upload handler
│   │   │   ├── customer.js          # Customer data endpoints
│   │   │   └── dashboard.js         # Dashboard analytics
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT authentication
│   │   │   ├── errorHandler.js      # Error handling
│   │   │   └── requestLogger.js     # Request logging
│   │   └── utils/
│   │       ├── database.js          # DB connection & queries
│   │       ├── riskCalculator.js    # Risk score algorithm
│   │       ├── probabilityCalculator.js # Probability algorithm
│   │       └── csvProcessor.js      # CSV parsing & deduplication
│   ├── db/
│   │   ├── schema.js                # Database schema definitions
│   │   └── migrate.js               # Migration runner
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── frontend/                         # React UI
│   ├── src/
│   │   ├── App.jsx                  # Main app component
│   │   ├── main.jsx                 # React entry point
│   │   ├── api.js                   # API client
│   │   ├── pages/
│   │   │   ├── Login.jsx            # Login page
│   │   │   └── Dashboard.jsx        # Main dashboard
│   │   └── components/
│   │       ├── DashboardSummary.jsx # KPI cards
│   │       ├── RiskDistributionChart.jsx # Risk pie chart
│   │       ├── TopAtRiskTable.jsx   # Top customers table
│   │       ├── CustomerRiskCard.jsx # Customer detail card
│   │       └── FileUpload.jsx       # CSV upload widget
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── README.md
│
└── [Documentation files in root]
```

## 🔧 Setup Instructions

### Prerequisites
- Node.js 18+ 
- PostgreSQL 13+
- npm or yarn

### Backend Setup

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env
# Edit .env with your database credentials:
# DATABASE_URL=postgresql://user:password@localhost:5432/collection_risk

# 3. Run database migrations
npm run migrate

# 4. Start server
npm start
# Server runs on http://localhost:3000

# For development with auto-reload:
npm run dev
```

### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env
# Edit .env if backend is on different host

# 3. Start development server
npm run dev
# Frontend runs on http://localhost:3001
```

## 📊 Core Algorithms

### Risk Score Calculation (0-100 Scale)

**4-Component Model:**

1. **Default Amount Impact (0-40 points)**
   - Ratio: Cumulative Default Value / Expected Value
   - Formula: min(40, ratio × 100)

2. **Days Overdue Severity (0-30 points)**
   - Avg Days > 90: 30 points
   - Avg Days > 60: 22 points
   - Avg Days > 30: 15 points
   - Avg Days > 15: 8 points
   - Otherwise: 0 points

3. **Default Frequency (0-20 points)**
   - Frequency = Default Count / Months Active
   - Score = min(20, frequency × 5)

4. **Recency Penalty (0-10 points)**
   - Days Since Last Default < 7: 10 points
   - Days Since Last Default < 30: 7 points
   - Days Since Last Default < 90: 3 points
   - Otherwise: 0 points

**Risk Levels:**
- 0-20: LOW RISK (Green)
- 21-50: MEDIUM RISK (Yellow)
- 51-75: HIGH RISK (Orange)
- 76-100: CRITICAL RISK (Red)

### Payment Probability Calculation (0-100%)

**Base Model:** 85% market-standard baseline

**Adjustment Factors:**

1. **Default Rate Impact:** -30% per monthly default
2. **Days Overdue Impact:** 
   - > 180 days: -25%
   - > 90 days: -15%
   - > 30 days: -8%
3. **Recovery Bonus:**
   - Settlement Rate > 80%: +10%
   - Settlement Rate > 50%: +5%
4. **Category Risk Multiplier:**
   - Dairy: 0.88
   - Food & Beverage: 0.82
   - Healthcare: 0.90
   - Retail: 0.78
   - Manufacturing: 0.85

**Confidence Levels:**
- 80-100%: VERY LIKELY TO PAY (Green)
- 60-79%: LIKELY TO PAY (Yellow)
- 40-59%: MODERATE RISK (Orange)
- 20-39%: UNLIKELY TO PAY (Red)
- 0-19%: HIGH DEFAULT RISK (Dark Red)

## 📡 API Endpoints

### Authentication
```
POST /api/auth/register           Register new user
POST /api/auth/login              Login with credentials
POST /api/auth/refresh            Refresh access token
POST /api/auth/logout             Logout session
```

### File Upload
```
POST /api/upload/csv              Upload collection CSV
GET  /api/upload/status/:id       Get upload progress
GET  /api/upload/history          List upload history
```

### Customer Data
```
GET  /api/customers               List all customers
GET  /api/customers/:id           Get customer detail + risk
GET  /api/customers/:id/defaults  Get default history
GET  /api/customers/:id/trends    Get 12-month trends
POST /api/customers/batch-update  Batch update records
```

### Dashboard & Analytics
```
GET  /api/dashboard/summary       Portfolio KPIs
GET  /api/dashboard/risk-distribution Risk breakdown
GET  /api/dashboard/category-analysis Category analysis
GET  /api/dashboard/top-at-risk   Top 10 customers
GET  /api/dashboard/analytics     Time series data
```

## 📋 CSV Upload Format

**Required Fields:**
- `loanId` - Loan identifier (unique)
- `customerId` - Customer identifier
- `amount` - Transaction amount
- `collectionDate` - Date in ISO 8601 format (YYYY-MM-DD)
- `status` - One of: Bounced, Success, Settled

**Optional Fields:**
- `externalRefId`
- `principalAmount`
- `interestAmount`
- `penaltyAmount`
- `customerName`
- `supplierName`
- `overDueDays`
- `category`
- `isSettled` (true/false)

**Duplicate Detection:**
- Composit key: `loanId|customerId|collectionDate`
- SHA256 hash generated for each record
- Existing records automatically skipped

## 🗄️ Database Schema

### Key Tables

**users** - User accounts and authentication
```sql
id, email, password_hash, role, is_active, created_at, last_login
```

**collections** - Individual collection records
```sql
id, external_ref_id, customer_id, loan_id, amount, collection_date,
overdue_days, status, is_settled, upload_session_id, created_at, updated_at
```

**customer_defaults** - Aggregated customer metrics
```sql
customer_id, total_default_value, total_default_days, default_count,
settled_count, months_active, last_default_date, category
```

**risk_scores** - Pre-calculated risk assessments
```sql
customer_id, risk_score, risk_level, payment_probability,
confidence_level, calculated_at
```

**upload_sessions** - File upload history
```sql
id, user_id, file_name, record_count, new_records, duplicate_records,
status, upload_date, processing_time_ms
```

**audit_logs** - Compliance & security logging
```sql
id, action, user_id, table_name, record_id, details, timestamp
```

## 🔐 Security Features

- ✅ JWT authentication with 24-hour expiration
- ✅ Bcrypt password hashing (10 rounds)
- ✅ HTTP-only secure cookies
- ✅ CORS configuration
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation on all endpoints
- ✅ Rate limiting ready
- ✅ Audit logging for all operations

## 📈 Performance Considerations

**Database Indexes:**
- collections: customer_id, collection_date, status, loan_id
- customer_defaults: category
- risk_scores: customer_id, calculated_at
- upload_sessions: user_id
- audit_logs: timestamp

**Query Performance:**
- Customer list: < 500ms (with pagination)
- Dashboard summary: < 2s
- CSV upload (100K records): < 10s
- Risk calculation: Real-time

**Caching Opportunities:**
- Risk scores: 24-hour TTL
- Dashboard KPIs: 30-minute TTL
- Category analysis: 1-hour TTL

## 🧪 Testing the System

### 1. Create Test User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123"}'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123"}'
```

### 3. Upload Sample CSV
Prepare a CSV file with the required fields and upload via the UI or:
```bash
curl -X POST http://localhost:3000/api/upload/csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@collections.csv"
```

### 4. Get Dashboard Summary
```bash
curl -X GET http://localhost:3000/api/dashboard/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📚 Sample Data

A sample CSV file is provided in the workspace:
`Overall-Bounced-Collections15-05-2026.csv`

Map your fields accordingly and upload to populate the system.

## 🚀 Deployment

### Docker Setup
```bash
# Backend
cd backend
docker build -t collection-risk-backend .
docker run -p 3000:3000 --env-file .env collection-risk-backend

# Frontend
cd frontend
docker build -t collection-risk-frontend .
docker run -p 3001:3001 collection-risk-frontend
```

### Environment Variables

**Backend (.env):**
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/db
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRY=24h
REFRESH_TOKEN_SECRET=your-refresh-secret-key
REFRESH_TOKEN_EXPIRY=7d
MAX_FILE_SIZE=52428800
CORS_ORIGIN=https://your-frontend-domain.com
```

**Frontend (.env):**
```
VITE_API_URL=https://your-backend-domain.com/api
```

## 📞 Support & Troubleshooting

### Common Issues

**Database Connection Error:**
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure database user has CREATE TABLE permissions

**CSV Upload Fails:**
- Validate CSV format (must be UTF-8, RFC 4180)
- Check file size (max 50MB)
- Ensure required fields are present
- Check date format (ISO 8601: YYYY-MM-DD)

**Slow Dashboard:**
- Run database migrations (indexes)
- Check database query performance
- Enable Redis caching
- Implement pagination for large datasets

**Authentication Issues:**
- Verify JWT_SECRET is set
- Check token expiration
- Clear browser cookies
- Verify CORS settings

## 📝 Next Steps

1. **Customize Dashboard:** Add more charts and analytics
2. **Mobile App:** Build React Native version
3. **Alerts:** Implement email/SMS notifications
4. **ML Models:** Add predictive analytics
5. **Integration:** Connect to existing banking systems
6. **Reports:** Generate PDF/Excel exports
7. **Multi-tenancy:** Support multiple organizations

## 📄 License

This system is provided for collection risk analysis and portfolio management.

## 👥 Team

Built with the Collection Risk Analysis Master Prompt specifications.
