# EXECUTIVE SUMMARY & REFERENCE GUIDE
## Collection Risk Analysis System

---

## WHAT YOU'RE BUILDING

A **production-grade, full-stack web application** that:

1. **Ingests Payment Default Data** via CSV uploads
2. **Analyzes Defaults Per Customer** (cumulative amounts, days overdue)
3. **Calculates Risk Scores** (0-100 scale, 4-component model)
4. **Estimates Payment Probability** (0-100%, market-standard adjusted)
5. **Detects & Skips Duplicates** (one-time uploads, idempotent)
6. **Provides Complete Visibility** (dashboards, reports, analytics)
7. **Maintains Audit Trails** (compliance, security, traceability)

---

## KEY METRICS YOU'LL CALCULATE

### Per Customer
```
Total Default Value:      Sum of all failed payments
Total Overdue Days:       Cumulative days past due
Default Frequency:        Defaults per month
Default Severity:         Largest single default amount
Settlement Rate:          % of defaults that were recovered

Risk Score:               0-100 (composite metric)
Payment Probability:      0-100% (likelihood to pay next time)
Risk Level:               LOW / MEDIUM / HIGH / CRITICAL
```

### Portfolio-Wide
```
Total Portfolio Value:    All outstanding loans
Total Current Defaults:   Active defaults this month
At-Risk Customers:        Count of HIGH/CRITICAL risk
Average Risk Score:       Portfolio risk level
Collection Success Rate:  % of collections that succeed
Average Recovery Time:    Days to recover from default
```

---

## FORMULA REFERENCE

### Risk Score (0-100 Scale)

```
RISK_SCORE = Component1 + Component2 + Component3 + Component4

Component1 (0-40 points): Default Amount Impact
  Ratio = Cumulative_Default_Value / Total_Expected_Value
  Score = Min(40, Ratio × 100)
  
Component2 (0-30 points): Days Overdue Severity
  If Avg_Days > 90:  Score = 30
  If Avg_Days > 60:  Score = 22
  If Avg_Days > 30:  Score = 15
  If Avg_Days > 15:  Score = 8
  Else:              Score = 0
  
Component3 (0-20 points): Default Frequency
  Frequency = Default_Count / Months_Active
  Score = Min(20, Frequency × 5)
  
Component4 (0-10 points): Recency Penalty
  If Days_Since_Default < 7:   Score = 10
  If Days_Since_Default < 30:  Score = 7
  If Days_Since_Default < 90:  Score = 3
  Else:                        Score = 0

FINAL = Min(100, Sum(Components))

Risk Level Classification:
  0-20:    LOW RISK (Green)
  21-50:   MEDIUM RISK (Yellow)
  51-75:   HIGH RISK (Orange)
  76-100:  CRITICAL RISK (Red)
```

### Payment Probability (0-100%)

```
PROBABILITY = (Base + Adjustments) × Category_Multiplier

Base = 0.85 (85% - Market Standard Baseline)

Adjustments:
  Default_Rate_Impact = -0.30 × (Default_Count / Months_Active)
  
  Days_Impact:
    If Days > 180:  -0.25
    If Days > 90:   -0.15
    If Days > 30:   -0.08
    Else:           0
    
  Recovery_Bonus:
    If Settled% > 80%:  +0.10
    If Settled% > 50%:  +0.05
    Else:               0
    
Category_Multiplier:
  Dairy:              0.88
  Food_Beverage:      0.82
  Healthcare:         0.90
  Retail:             0.78
  Manufacturing:      0.85
  Default:            0.80

FINAL = Max(0.01, Min(0.99, Probability))

Confidence Levels:
  80-100%:  VERY LIKELY TO PAY
  60-79%:   LIKELY TO PAY
  40-59%:   MODERATE RISK
  20-39%:   UNLIKELY TO PAY
  0-19%:    HIGH DEFAULT RISK
```

---

## DATABASE SCHEMA (SIMPLIFIED)

```sql
┌─────────────────────────────────────────────┐
│               Collections                    │
├─────────────────────────────────────────────┤
│ id (PK)                                     │
│ loanId (UNIQUE) ← Use for deduplication    │
│ customerId (FK) → customer_defaults         │
│ amount                                      │
│ collectionDate                              │
│ overDueDays                                 │
│ status (Bounced, Success, Settled)          │
│ isSettled (boolean)                         │
│ uploadSessionId (FK) → upload_sessions      │
│ createdAt, updatedAt                        │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│         Customer_Defaults                    │
├─────────────────────────────────────────────┤
│ customerId (PK)                             │
│ totalDefaultValue (SUM of amounts)          │
│ totalDefaultDays (SUM of overDueDays)       │
│ defaultCount (COUNT of records)             │
│ settledCount (COUNT where isSettled=true)   │
│ monthsActive                                │
│ lastDefaultDate                             │
│ updatedAt                                   │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│           Risk_Scores                        │
├─────────────────────────────────────────────┤
│ customerId (PK/FK)                          │
│ riskScore (0-100)                           │
│ paymentProbability (0-1)                    │
│ riskLevel (LOW/MEDIUM/HIGH/CRITICAL)        │
│ calculatedAt (last update)                  │
└─────────────────────────────────────────────┘
```

---

## DATA FLOW DIAGRAM

```
┌──────────────┐
│  CSV File    │
│  Upload      │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│  1. File Validation      │
│  - Size, Format, Encoding│
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  2. Parse CSV            │
│  - Streaming for large   │
│  - Row-by-row            │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  3. Schema Validation    │
│  - Required fields       │
│  - Data types            │
│  - Ranges, formats       │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  4. Deduplication Check  │
│  - Generate SHA256 key   │
│  - Query database        │
│  - Action: SKIP/INSERT   │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  5. Insert/Update        │
│  - Collections table     │
│  - Maintain audit log    │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  6. Aggregate Metrics    │
│  - Total defaults        │
│  - Total days            │
│  - Settlement rate       │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  7. Calculate Metrics    │
│  - Risk Score (4-factor) │
│  - Probability (5-factor)│
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  8. Update Dashboards    │
│  - Customer view         │
│  - Portfolio view        │
│  - Reports               │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  9. Notifications        │
│  - Alert at-risk         │
│  - Summary report        │
└──────────────────────────┘
```

---

## API ENDPOINTS QUICK REFERENCE

### Authentication
```
POST /api/auth/login               - Login with email/password → JWT token
POST /api/auth/logout              - Logout (invalidate token)
POST /api/auth/refresh             - Refresh expired JWT token
```

### File Management
```
POST /api/upload/csv               - Upload collection CSV file
GET  /api/upload/status/:id        - Check upload progress
GET  /api/upload/history           - List all uploads
```

### Customer Data
```
GET  /api/customers                - List all customers (with filters)
GET  /api/customers/:id            - Customer detail + risk assessment
GET  /api/customers/:id/defaults   - Default history for customer
GET  /api/customers/:id/trends     - 12-month trend data
```

### Dashboard & Analytics
```
GET  /api/dashboard/summary        - Portfolio KPIs (totals, counts)
GET  /api/dashboard/risk-dist      - Risk distribution (pie chart data)
GET  /api/dashboard/top-risks      - Top 10 at-risk customers
GET  /api/dashboard/category       - Analysis by category
GET  /api/reports/risk             - Full risk assessment report
GET  /api/reports/export/:format   - Export as PDF/Excel/CSV
```

---

## TECHNOLOGY STACK (RECOMMENDED)

### Backend
```
Runtime:        Node.js 18+ OR Python 3.10+
Framework:      Express.js OR FastAPI
Database:       PostgreSQL 13+
Caching:        Redis 6+
Authentication: JWT + bcryptjs
File Upload:    multer (Node) OR FastAPI Upload
CSV Processing: csv-parser (Node) OR pandas (Python)
Validation:     joi (Node) OR pydantic (Python)
Logging:        winston (Node) OR python logging
```

### Frontend
```
Framework:      React 18+
State:          Redux Toolkit OR Zustand
UI Components:  Material-UI OR TailwindCSS
Charts:         Recharts OR Chart.js
Tables:         React-Table OR AG-Grid
HTTP:           axios OR fetch
Auth:           JWT in HTTP-only cookies
```

### DevOps & Deployment
```
Containerization: Docker
Orchestration:    Docker-Compose OR Kubernetes
CI/CD:            GitHub Actions OR GitLab CI
Code Quality:     ESLint, Prettier, SonarQube
Testing:          Jest, React Testing Library
Monitoring:       Sentry, DataDog, New Relic
CDN:              AWS CloudFront OR Cloudflare
```

---

## IMPLEMENTATION TIMELINE

| Phase | Duration | Key Activities |
|-------|----------|---|
| Setup | 1-2 days | Project structure, database setup, environment config |
| Backend Core | 3-4 days | Authentication, CSV processing, risk calculation |
| Database | 1-2 days | Schema, migrations, indexes, sample data |
| Frontend | 3-4 days | Dashboard components, charts, styling |
| Integration | 2-3 days | Connect frontend to backend, test APIs |
| Testing | 2-3 days | Unit tests, integration tests, security tests |
| Documentation | 1-2 days | API docs, user guides, deployment guide |
| Deployment | 1-2 days | Docker setup, production configuration, go-live |
| **TOTAL** | **14-21 days** | **2-3 weeks for production-ready system** |

---

## SECURITY CHECKLIST

- [ ] Password hashing with bcrypt (min 12 characters)
- [ ] JWT tokens with 24-hour expiration
- [ ] HTTP-only, Secure cookies for tokens
- [ ] CORS properly configured
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS protection (input/output sanitization)
- [ ] CSRF tokens for form submissions
- [ ] Rate limiting (100 req/min per user)
- [ ] Input validation on all endpoints
- [ ] Output encoding/escaping
- [ ] HTTPS/TLS 1.3 in production
- [ ] Audit logging for sensitive operations
- [ ] Password reset secure flow
- [ ] Multi-factor authentication (2FA)
- [ ] Data encryption at rest (AES-256)
- [ ] Secrets management (.env, vault)
- [ ] Dependency vulnerability scanning
- [ ] Regular security audits

---

## CODE GENERATION TOOL COMPARISON

| Tool | Best For | Speed | Quality | Cost |
|------|----------|-------|---------|------|
| **GitHub Copilot** | Function completion, patterns | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $10/mo |
| **Blackbox** | Full features, complete files | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Free+ |
| **ChatGPT Plus** | Architecture, design, explanation | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $20/mo |
| **Claude (API)** | Complex logic, reasoning | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Variable |
| **VS Code Extensions** | Inline suggestions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Free-Paid |

**Recommended Approach**: Use GitHub Copilot + Blackbox for fastest delivery

---

## PERFORMANCE TARGETS

After deployment, ensure:

```
File Upload Performance:
  - CSV with 100K records:     < 10 seconds
  - CSV with 1M records:       < 60 seconds
  - Real-time progress updates: Yes

Query Performance:
  - Customer detail page:      < 500ms
  - Dashboard summary:         < 1000ms
  - Risk report generation:    < 5000ms
  - Export PDF (10K records):  < 15000ms

Concurrency:
  - Concurrent users:          100+
  - Concurrent uploads:        5+
  - Simultaneous API calls:    1000+/second

Database:
  - Index size:                < 5GB for 10M records
  - Backup size:               < 20GB for 10M records
  - Query response:            < 100ms for indexed queries

Caching:
  - Risk scores cache TTL:     24 hours
  - Customer list cache TTL:   1 hour
  - Dashboard KPI cache TTL:   30 minutes
```

---

## MONITORING & ALERTING

After go-live, monitor:

```
Application Metrics:
  - Error rate (target: < 0.1%)
  - API response time (p95 < 1s)
  - Upload success rate (target: > 99%)
  - Duplicate detection rate (expected: 5-15%)

Business Metrics:
  - Collection success rate (target: > 95%)
  - Default detection accuracy (target: > 99%)
  - Risk score prediction accuracy (target: > 90%)
  - Average recovery time (track trend)

Infrastructure:
  - Server CPU (target: < 70%)
  - Server memory (target: < 80%)
  - Database connections (target: < 80%)
  - Disk space (target: < 80%)
  - Network latency (target: < 50ms)

Security:
  - Failed login attempts (alert: > 5 per hour)
  - Rate limit violations (alert: > 10 per hour)
  - SQL injection attempts (alert: any)
  - Unauthorized API access (alert: any)
```

---

## SUPPORT & TROUBLESHOOTING

### Common Issues

**Risk Score Calculation Wrong**
- Verify all 4 components are calculated correctly
- Check data types (amounts should be numeric)
- Verify date calculations
- Test with known customer profiles

**Slow File Upload**
- Check file size (should be < 50MB)
- Verify streaming implementation
- Check database connection pool
- Monitor disk I/O during upload

**Duplicate Detection Not Working**
- Verify SHA256 key generation matches specification
- Check database composite key uniqueness constraint
- Test with known duplicate data
- Check timestamp precision (milliseconds vs seconds)

**Risk Dashboard Slow**
- Add database indexes on customerId, collectionDate, status
- Implement Redis caching for aggregates
- Use pagination for large tables
- Check query execution plans

**Authentication Issues**
- Verify JWT secret key is set correctly
- Check token expiration settings
- Verify refresh token flow
- Test 2FA flow

---

## NEXT STEPS

### To Get Started:

1. **Read** the Master Prompt (`MASTER_PROMPT_CollectionRiskAnalysis.md`)
2. **Choose** your code generation tool (recommended: GitHub Copilot + Blackbox)
3. **Copy** relevant prompts from `COPY_PASTE_PROMPTS.md`
4. **Generate** code section by section
5. **Review** and test generated code
6. **Deploy** following deployment checklist
7. **Monitor** using monitoring guidelines

### Documents Provided:

```
1. MASTER_PROMPT_CollectionRiskAnalysis.md  (13 sections, comprehensive)
2. QUICK_START_GUIDE.md                      (Code examples, tool-specific)
3. COPY_PASTE_PROMPTS.md                     (Ready-to-use prompts)
4. REFERENCE_GUIDE.md                        (This file)
```

---

## CONTACT & SUPPORT

For questions about:
- **System Architecture**: Refer to Section 5 of Master Prompt
- **Algorithms**: Refer to Section 2 of Master Prompt
- **Database Schema**: Refer to Section 3 of Master Prompt
- **Code Examples**: Refer to Quick Start Guide
- **Prompts for Your Tool**: Refer to Copy-Paste Prompts

---

**Version**: 1.0  
**Last Updated**: May 2026  
**Status**: Production-Ready  
**Estimated Build Time**: 2-3 weeks  
**Estimated Team Size**: 2-3 developers

---

## CHECKLIST FOR LAUNCH

- [ ] All master prompt sections reviewed
- [ ] Technology stack selected and approved
- [ ] Team trained on codebase
- [ ] Database migrations tested
- [ ] API endpoints tested (manual + automated)
- [ ] Security audit completed
- [ ] Performance testing passed
- [ ] Backup & recovery tested
- [ ] Monitoring & alerting configured
- [ ] Documentation complete
- [ ] User onboarding materials ready
- [ ] Support contact configured
- [ ] Go-live checklist reviewed

**Good luck! 🚀**

---
