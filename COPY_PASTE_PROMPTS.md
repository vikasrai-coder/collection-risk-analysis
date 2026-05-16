# COPY-PASTE READY PROMPTS FOR CODE GENERATORS
## GitHub Copilot | VS Code | Blackbox | ChatGPT | Claude

---

## FOR GITHUB COPILOT IN VS CODE

### Prompt Set 1: Backend Setup
```
// Copilot: Create a complete Express.js server with:
// - JWT authentication (register, login, refresh token)
// - PostgreSQL connection pool
// - Error handling middleware
// - CORS configuration
// - Environment variable management

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// [Copilot will generate the complete setup]
```

### Prompt Set 2: Risk Score Implementation
```javascript
// Implement calculateRiskScore based on:
// Component 1 (0-40): Default Amount Ratio
// Component 2 (0-30): Average Overdue Days (>90=30pts, >60=22pts, >30=15pts, >15=8pts)
// Component 3 (0-20): Default Frequency per month
// Component 4 (0-10): Recency penalty (<7days=10pts, <30days=7pts, <90days=3pts)
// Total: Sum all components, max 100

function calculateRiskScore(customerMetrics) {
  // [Copilot generates the function]
}
```

### Prompt Set 3: CSV Upload Handler
```javascript
// Create an Express route POST /api/upload/csv that:
// - Accepts CSV file upload (max 50MB)
// - Validates against schema (required: loanId, customerId, amount, collectionDate, status)
// - Detects duplicates using SHA256(loanId|customerId|collectionDate)
// - Inserts new records, skips duplicates, updates changed records
// - Returns summary: newRecords, duplicateRecords, updatedRecords, failedRecords

app.post('/api/upload/csv', authenticateToken, uploadHandler);
```

### Prompt Set 4: Risk Dashboard API
```javascript
// Create GET /api/dashboard/summary that returns:
// {
//   totalPortfolioValue: number,
//   totalDefaults: number,
//   activeCustomers: number,
//   atRiskCustomers: number,
//   avgRiskScore: number (0-100),
//   avgPaymentProbability: number (0-1),
//   riskDistribution: { low: %, medium: %, high: %, critical: % }
// }

app.get('/api/dashboard/summary', authenticateToken, dashboardHandler);
```

---

## FOR BLACKBOX (blackbox.ai)

### Prompt 1: Full Node.js Backend
```
COPY AND PASTE INTO BLACKBOX:

Based on the Collection Risk Analysis system, generate a complete 
Node.js Express backend with:

Technology Stack:
- Framework: Express.js
- Database: PostgreSQL
- Authentication: JWT with bcrypt password hashing
- File Processing: csv-parser with streams
- Validation: Joi or express-validator

Features to implement:
1. User authentication (register, login, logout, refresh token)
2. CSV file upload with validation and deduplication
3. Risk score calculation (4-component model)
4. Payment probability calculation (market-standard baseline 85%)
5. Customer default tracking and aggregation
6. Portfolio-level dashboard APIs
7. Audit logging for all operations
8. Error handling and input validation

Return the complete backend code structure with:
- Server setup
- Database schema (SQL)
- Model definitions
- Route handlers
- Middleware
- Configuration files
```

### Prompt 2: React Dashboard Frontend
```
COPY AND PASTE INTO BLACKBOX:

Generate a React dashboard component that displays:

1. Customer Risk Assessment View:
   - Risk Score (0-100) with color coding (Green/Yellow/Orange/Red)
   - Payment Probability (%) with confidence level
   - Default Amount and Days Overdue metrics
   - Default history table with sorting/filtering
   - Trend charts (line chart for amounts, bar chart for frequency)

2. Portfolio Summary Dashboard:
   - KPI cards (Total Portfolio Value, Total Defaults, Active Customers)
   - Risk distribution pie chart (Low/Medium/High/Critical)
   - Category-wise analysis
   - Top 10 at-risk customers table
   - Performance metrics

3. UI Framework: React with Tailwind CSS or Material-UI
4. Charting Library: Recharts or Chart.js
5. Features:
   - Real-time data fetching
   - Responsive design (mobile, tablet, desktop)
   - Color-coded risk indicators
   - Exportable reports (PDF, Excel)
   - User authentication integration

Generate the complete React component code with state management and API integration.
```

### Prompt 3: Database Schema and Migrations
```
COPY AND PASTE INTO BLACKBOX:

Generate complete PostgreSQL database schema for Collection Risk System:

Tables needed:
1. users (id, email, passwordHash, role, isActive, createdAt, lastLogin)
2. collections (id, externalRefId, customerId, loanId, amount, collectionDate, status, overDueDays, isSettled)
3. customer_defaults (customerId, totalDefaultValue, totalDefaultDays, defaultCount, settledCount, monthsActive)
4. risk_scores (customerId, riskScore, paymentProbability, riskLevel, calculatedAt)
5. upload_sessions (id, userId, fileName, recordCount, newRecords, duplicateRecords, status)
6. audit_logs (id, action, userId, details, timestamp)

Requirements:
- Create indexes on frequently queried columns (customerId, collectionDate, status)
- Add foreign key relationships
- Include UNIQUE constraints for preventing duplicates
- Add triggers for automatic timestamp updates
- Generate migration files for version control

Return:
- SQL CREATE TABLE statements
- Index definitions
- Database migration scripts (Flyway or Knex.js format)
- Sample data for testing
```

### Prompt 4: Risk Calculation Algorithms
```
COPY AND PASTE INTO BLACKBOX:

Implement both risk algorithms as standalone functions:

1. calculateRiskScore(customer):
   Input: Customer object with defaultCount, cumulativeDefaultValue, etc.
   Output: riskScore (0-100), riskLevel (LOW/MEDIUM/HIGH/CRITICAL)
   Formula: 4-component model as specified
   
2. calculatePaymentProbability(customer):
   Input: Customer object with default history and category
   Output: paymentProbability (0-1), confidenceLevel string
   Formula: Market-standard baseline 85%, adjusted by 4 factors
   
3. detectDuplicate(newRecord, database):
   Input: New CSV record and database connection
   Output: Action (INSERT/SKIP/UPDATE), existingId if update
   Logic: Generate SHA256 hash of (loanId|customerId|collectionDate)
   
4. aggregateCustomerMetrics(customerId, database):
   Input: Customer ID and database connection
   Output: Aggregated metrics (totalDefaults, totalDays, etc.)
   
Generate in JavaScript/Node.js with proper error handling and logging.
```

---

## FOR CHATGPT / OPENAI

### Prompt 1: Complete System Architecture
```
I need you to design and generate a complete production-grade 
collection risk analysis system. 

Context: Analyzing payment defaults for supply chain finance with CSV data upload.

Requirements:
1. Analyze payment defaults based on customer bounce patterns
2. Calculate cumulative default value and days overdue
3. Generate risk scores (0-100) using 4-component model
4. Estimate payment probability using market-standard baseline (85%)
5. Handle CSV uploads with duplicate detection
6. Persistent storage with one-time uploads (skip if exists)
7. Complete visibility dashboard for all data

Technology Stack:
- Backend: Node.js + Express
- Database: PostgreSQL
- Frontend: React
- Authentication: JWT

Please generate:
1. System architecture diagram (text-based)
2. Database schema with all tables and relationships
3. Core algorithm implementations (risk score, payment probability)
4. API endpoints list with request/response examples
5. React components for dashboard
6. Authentication middleware
7. CSV processing pipeline

Make it production-ready with error handling, logging, and security best practices.
```

### Prompt 2: Risk Score Deep Dive
```
Create a comprehensive risk score calculation function with:

Inputs:
- Customer default history
- Total amount defaulted
- Days overdue (cumulative)
- Frequency of defaults
- Last default date
- Category (dairy, food, healthcare, etc.)
- Settlement history

Output:
- Risk Score (0-100 scale)
- Risk Level (LOW, MEDIUM, HIGH, CRITICAL)
- Component breakdown (what caused the score)
- Recommendation for action

Model:
Component 1 - Default Amount (0-40 points): Ratio of default amount to expected value
Component 2 - Days Overdue (0-30 points): Severity based on average days
Component 3 - Frequency (0-20 points): How often they default per month
Component 4 - Recency (0-10 points): Penalty if recent default

Generate in both JavaScript and Python versions.
Include unit tests for edge cases.
```

### Prompt 3: Payment Probability Estimation
```
Generate a payment probability estimation model for supply chain finance:

Base Model:
- Baseline: 85% payment probability (market standard)
- Adjustments based on customer behavior

Adjustment Factors:
1. Default Rate Impact: -30% per monthly default frequency
2. Days Overdue Impact: -25% if >180 days, -15% if >90, -8% if >30
3. Recovery Bonus: +10% if settled >80%, +5% if settled >50%
4. Category Risk Multiplier: 
   - Dairy: 0.88
   - Food & Beverage: 0.82
   - Healthcare: 0.90
   - Retail: 0.78
   - Manufacturing: 0.85

Output:
- Payment probability (0-1.0)
- Confidence percentage (0-100%)
- Confidence level (VERY LIKELY / LIKELY / MODERATE / UNLIKELY / HIGH RISK)

Generate in JavaScript with proper validation.
Include examples with different customer profiles.
```

### Prompt 4: CSV Processing & Deduplication
```
Create a CSV file processing pipeline that:

Input:
- CSV file with collection data
- Required fields: externalRefId, userId, amount, collectionDate, status, overDueDays, isSettled
- Max size: 50MB
- Format: RFC 4180 CSV

Processing Steps:
1. Validate file (size, encoding, format)
2. Parse CSV using streaming (for large files)
3. Validate each record against schema
4. Generate composite key from: loanId + customerId + collectionDate (SHA256)
5. Check database for existing records
6. For each record:
   - If new: INSERT
   - If duplicate (same amount and status): SKIP
   - If changed (different amount or status): UPDATE
7. Provide summary report

Output:
- JSON summary: newRecords, duplicateSkipped, updated, failed
- Error logs for validation failures
- Processing time
- Record count statistics

Generate in Node.js with error handling and logging.
```

---

## FOR CLAUDE (claude.ai or API)

### Prompt 1: Enterprise Architecture
```
Design a production-grade Collection Risk Analysis system for supply chain finance.

The system must:
1. Accept CSV uploads of bounced payment collections
2. Analyze payment defaults per customer
3. Calculate risk scores (0-100) using a 4-component model
4. Estimate payment probability (0-100%) based on market standards
5. Store data persistently with duplicate handling
6. Provide executive dashboards with complete visibility
7. Support role-based access control
8. Maintain complete audit trails

CSV Data Sample:
- Fields: externalRefId, customerId, name, amount, collectionDate, overDueDays, status, isSettled
- Status values: "Bounced", "Success", "Settled"
- Frequency: Multiple uploads per month
- Volume: 100K+ records

Requirements:
- Professional, maintainable code
- Security-first design (JWT auth, input validation, rate limiting)
- Performance optimized (caching, indexing, pagination)
- Scalable architecture (handles 10M+ records)
- Comprehensive error handling
- Complete documentation

Please provide:
1. System architecture (with diagram)
2. Database schema (PostgreSQL)
3. Core algorithms (risk calculation, probability estimation)
4. API specification
5. Frontend components (React)
6. Deployment instructions (Docker)
7. Testing strategy
```

### Prompt 2: Risk Scoring Model
```
I need to build a risk scoring model for payment defaults in supply chain finance.

Current Data:
- Multiple failed payment attempts per customer
- Amount of each default
- Days overdue for each attempt
- Category information (dairy, healthcare, food, etc.)
- Settlement history

Requirements:
1. Create a 4-component risk scoring model (0-100 scale):
   - Component 1 (0-40): Default amount ratio
   - Component 2 (0-30): Days overdue severity
   - Component 3 (0-20): Default frequency
   - Component 4 (0-10): Recency penalty

2. Create payment probability estimation (0-100%):
   - Market baseline: 85%
   - Adjust based on default behavior and category
   - Consider recovery history

3. Provide:
   - Mathematical formulas
   - Implementation (Node.js and Python)
   - Interpretation guidelines
   - Validation test cases
   - Edge case handling

4. Include scoring examples:
   - Clean customer (score: ~5)
   - Risky customer (score: ~65)
   - Critical customer (score: ~90)
```

---

## FOR VS CODE INLINE

### Quick Inline Commands

**For Function Generation**:
```javascript
// Copilot: Implement the risk calculation with detailed comments
// showing the 4 components and final score

const calculateRiskScore = (customer) => {
  // [Start typing and Copilot will complete]
};
```

**For Component Creation**:
```jsx
// Create a React component that shows customer risk card
// with risk score, probability, and recommendation

function CustomerRiskCard({ customer, riskScore, probability }) {
  // [Copilot generates the JSX]
}
```

**For API Route**:
```javascript
// Create POST endpoint for CSV upload that:
// - validates file, parses CSV, detects duplicates
// - returns upload summary

app.post('/api/upload/csv', (req, res) => {
  // [Copilot generates the handler]
});
```

---

## BEST PRACTICES FOR EACH TOOL

### GitHub Copilot
- ✅ Great for: Function completion, boilerplate, common patterns
- ✅ Provide context by opening related files in your IDE
- ✅ Use `/explain` command to understand generated code
- ⚠️ Always review critical logic (algorithms, security, data handling)
- ⚠️ Test thoroughly before using in production

### Blackbox
- ✅ Great for: Full file generation, complete features, multiple files at once
- ✅ Specify exact requirements in the prompt
- ✅ Request specific file formats and technologies
- ⚠️ May need refinement for edge cases
- ⚠️ Test generated code with the included /test command

### ChatGPT/Claude
- ✅ Great for: Explanation, architecture design, strategic decisions
- ✅ Ask for both high-level and detailed implementations
- ✅ Request examples and test cases
- ⚠️ May require multiple follow-up prompts
- ⚠️ Code quality varies - review and refactor as needed

### VS Code Extensions
- ✅ Great for: Inline suggestions, instant completions, quick edits
- ✅ Multiple extensions available (Copilot, Tabnine, Intellicode)
- ✅ Context-aware suggestions based on your code
- ⚠️ Works best with clear variable names and existing code patterns

---

## QUALITY CHECKLIST FOR GENERATED CODE

After generating code with any tool, verify:

```
[ ] Code is syntactically correct
[ ] All required imports/dependencies are included
[ ] Error handling is implemented (try-catch, validation)
[ ] Security checks (input validation, SQL injection prevention)
[ ] Proper logging for debugging
[ ] Comments explain complex logic
[ ] Variable names are clear and descriptive
[ ] Functions have reasonable length (< 50 lines ideally)
[ ] Edge cases are handled
[ ] Performance is optimized (no N+1 queries, proper indexing)
[ ] Tests are included
[ ] Documentation is present
[ ] Follows project's code style and conventions
```

---

## TROUBLESHOOTING GENERATED CODE

| Issue | Solution |
|-------|----------|
| "Copilot won't accept my context" | Make sure files are open in editor tabs |
| "Generated code has syntax errors" | Request fixes with /fix command or rephrase |
| "Code is too generic" | Provide more specific requirements with examples |
| "Dependency versions don't match" | Specify exact versions in requirements |
| "Algorithm logic seems wrong" | Ask for explanation with /explain, then request revision |
| "Generated code is incomplete" | Continue typing to trigger more suggestions |

---

## RECOMMENDED WORKFLOW

### For Building the Complete System:

1. **Setup (5 minutes)**
   - Use Blackbox: "Generate Node.js project structure"
   - Use Copilot: Complete package.json and environment setup

2. **Database (15 minutes)**
   - Use Blackbox: "Generate PostgreSQL schema and migrations"
   - Use Copilot: Create database connection pool

3. **Authentication (20 minutes)**
   - Use Copilot: "Create JWT authentication middleware"
   - Use Blackbox: "Generate register and login endpoints"

4. **Core Algorithms (30 minutes)**
   - Use Blackbox: "Generate risk calculation functions"
   - Use Copilot: Generate payment probability function
   - Use ChatGPT: Verify algorithm correctness

5. **CSV Processing (25 minutes)**
   - Use Blackbox: "Generate CSV upload handler with deduplication"
   - Use Copilot: Add validation and error handling

6. **APIs (30 minutes)**
   - Use Copilot: Generate API endpoints for dashboard data
   - Use Blackbox: Generate bulk endpoints

7. **Frontend (45 minutes)**
   - Use Blackbox: "Generate React dashboard components"
   - Use Copilot: Add styling and interactivity

8. **Testing (30 minutes)**
   - Use ChatGPT: Request unit test cases
   - Use Copilot: Generate test implementations

9. **Documentation (20 minutes)**
   - Use Blackbox: /doc command to generate API docs
   - Use Copilot: Add code comments and README

**Total estimated time: 3-4 hours to working system**

---

**Choose your code generation tool and start with any prompt above!**
**Estimated time to production: 1-2 weeks with proper testing and refinement**
