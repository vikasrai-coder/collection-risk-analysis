# QUICK IMPLEMENTATION GUIDE
## Code Generation with GitHub Copilot, VS Code, Blackbox

---

## TOOL-SPECIFIC INSTRUCTIONS

### GitHub Copilot in VS Code

#### Setup
```bash
# 1. Install Copilot extension
# 2. Sign in with GitHub account
# 3. Create new project
npm init -y
npm install express postgresql cors dotenv bcryptjs jsonwebtoken

# 4. Create project structure
mkdir -p src/{routes,controllers,models,middleware,utils}
touch src/index.js src/.env
```

#### Using Copilot
```javascript
// In src/index.js, start typing and Copilot will suggest:
// Copilot prompt: "Create Express server with authentication middleware"

const express = require('express');
const app = express();

// Press Tab to accept Copilot's suggestions
app.use(express.json());
app.use(cors());

// For Risk Score calculation:
// Copilot prompt: "Implement calculateRiskScore function based on 4-component model"
// Copilot will generate the function from the master prompt context
```

**Copilot Commands**:
```
Ctrl+K Ctrl+E  → Ask Copilot to explain code
Ctrl+Shift+A   → Open Copilot Chat
/explain       → Explain implementation
/tests         → Generate test cases
/docs          → Generate documentation
```

---

### Blackbox (blackbox.ai)

#### Getting Started
1. Go to [blackbox.ai](https://www.blackbox.ai)
2. Select language: Node.js, Python, React, etc.
3. Paste master prompt in chat

#### Example Prompts for Blackbox
```
PROMPT 1:
"Based on the Collection Risk Analysis Master Prompt, 
generate a complete Node.js Express backend with:
- User authentication with JWT
- CSV file upload endpoint
- Collections database schema
- Risk score calculation function
Use PostgreSQL for database."

PROMPT 2:
"Generate React component dashboard showing:
- Customer risk scores (0-100)
- Payment probability percentage
- Risk level colors (Red, Orange, Yellow, Green)
- Default history table
- Include Recharts for visualization"

PROMPT 3:
"Create the duplicate detection algorithm that:
1. Generates composite keys from loanId + customerId + collectionDate
2. Checks database for existing records
3. Returns action (SKIP, INSERT, UPDATE)
4. Logs all operations for audit trail"
```

#### Copypaste Workflow
```
1. Copy master prompt → Blackbox chat
2. Add specific request: "Generate [component] in [language]"
3. Paste code directly into your IDE
4. Run Blackbox tests: /test command
```

---

### VS Code Extensions (Alternative to Copilot)

#### Extensions Recommended
```
- GitHub Copilot
- Tabnine
- CodeWhisperer (AWS)
- Intellicode (Microsoft)
- ChatGPT (unofficial)
```

#### Workflow
```
1. Install extension
2. Open master prompt in split view (Ctrl+K Ctrl+O)
3. Code in main editor
4. Extension provides suggestions inline
5. Accept suggestions with Tab
```

---

## QUICK START CODE EXAMPLES

### Example 1: Risk Score Calculation (Node.js)

```javascript
// risk-calculator.js
const calculateRiskScore = (customer) => {
  // From Master Prompt Section 2.2
  
  // Component 1: Default Amount Impact (0-40 points)
  const totalExpectedValue = customer.totalLoanAmount || 100000;
  const defaultAmountRatio = customer.cumulativeDefaultValue / totalExpectedValue;
  const amountScore = Math.min(40, defaultAmountRatio * 100);
  
  // Component 2: Days Overdue Impact (0-30 points)
  let daysScore = 0;
  const avgOverdueDays = customer.cumulativeDefaultDays / customer.defaultCount || 0;
  
  if (avgOverdueDays > 90) daysScore = 30;
  else if (avgOverdueDays > 60) daysScore = 22;
  else if (avgOverdueDays > 30) daysScore = 15;
  else if (avgOverdueDays > 15) daysScore = 8;
  
  // Component 3: Default Frequency (0-20 points)
  const defaultFrequency = customer.defaultCount / Math.max(customer.monthsActive, 1);
  const frequencyScore = Math.min(20, defaultFrequency * 5);
  
  // Component 4: Recency Penalty (0-10 points)
  const daysSinceLastDefault = Math.floor(
    (Date.now() - new Date(customer.lastDefaultDate)) / (1000 * 60 * 60 * 24)
  );
  
  let recencyScore = 0;
  if (daysSinceLastDefault < 7) recencyScore = 10;
  else if (daysSinceLastDefault < 30) recencyScore = 7;
  else if (daysSinceLastDefault < 90) recencyScore = 3;
  
  const totalRiskScore = Math.min(100, amountScore + daysScore + frequencyScore + recencyScore);
  
  // Determine risk level
  let riskLevel = 'LOW';
  if (totalRiskScore > 75) riskLevel = 'CRITICAL';
  else if (totalRiskScore > 50) riskLevel = 'HIGH';
  else if (totalRiskScore > 20) riskLevel = 'MEDIUM';
  
  return {
    riskScore: parseFloat(totalRiskScore.toFixed(2)),
    riskLevel,
    components: {
      amountScore: parseFloat(amountScore.toFixed(2)),
      daysScore: parseFloat(daysScore.toFixed(2)),
      frequencyScore: parseFloat(frequencyScore.toFixed(2)),
      recencyScore: parseFloat(recencyScore.toFixed(2))
    }
  };
};

module.exports = { calculateRiskScore };
```

### Example 2: Payment Probability Calculation (Node.js)

```javascript
// payment-probability.js
const calculatePaymentProbability = (customer) => {
  // From Master Prompt Section 2.3
  
  const baselineProbability = 0.85; // 85% market standard
  
  // Impact from default rate
  const defaultRate = customer.defaultCount / Math.max(customer.monthsActive, 1);
  const defaultRateImpact = -0.30 * defaultRate;
  
  // Impact from cumulative default days
  let daysImpact = 0;
  if (customer.cumulativeDefaultDays > 180) daysImpact = -0.25;
  else if (customer.cumulativeDefaultDays > 90) daysImpact = -0.15;
  else if (customer.cumulativeDefaultDays > 30) daysImpact = -0.08;
  
  // Recovery bonus
  const settledPercentage = customer.settledCount / Math.max(customer.defaultCount, 1);
  let recoveryBonus = 0;
  if (settledPercentage > 0.8) recoveryBonus = 0.10;
  else if (settledPercentage > 0.5) recoveryBonus = 0.05;
  
  // Category risk multiplier
  const categoryMultipliers = {
    'dairy': 0.88,
    'food_and_beverages': 0.82,
    'healthcare': 0.90,
    'retail': 0.78,
    'manufacturing': 0.85,
    'default': 0.80
  };
  const categoryMultiplier = categoryMultipliers[customer.category] || 0.80;
  
  // Calculate final probability
  let paymentProbability = baselineProbability
    + defaultRateImpact
    + daysImpact
    + recoveryBonus;
  
  paymentProbability *= categoryMultiplier;
  paymentProbability = Math.max(0.01, Math.min(0.99, paymentProbability));
  
  // Determine confidence level
  let confidenceLevel = 'MODERATE RISK';
  if (paymentProbability >= 0.80) confidenceLevel = 'VERY LIKELY';
  else if (paymentProbability >= 0.60) confidenceLevel = 'LIKELY';
  else if (paymentProbability >= 0.40) confidenceLevel = 'MODERATE RISK';
  else if (paymentProbability >= 0.20) confidenceLevel = 'UNLIKELY';
  else confidenceLevel = 'HIGH DEFAULT RISK';
  
  return {
    paymentProbability: parseFloat(paymentProbability.toFixed(4)),
    confidencePercentage: parseInt(paymentProbability * 100),
    confidenceLevel,
    factors: {
      defaultRateImpact,
      daysImpact,
      recoveryBonus,
      categoryMultiplier
    }
  };
};

module.exports = { calculatePaymentProbability };
```

### Example 3: CSV Upload & Duplicate Detection (Node.js)

```javascript
// csv-processor.js
const crypto = require('crypto');
const csv = require('csv-parser');
const fs = require('fs');

const generateRecordKey = (record) => {
  // Create deterministic hash from unique fields
  const key = `${record.loanId}|${record.customerId}|${record.collectionDate}`;
  return crypto.createHash('sha256').update(key).digest('hex');
};

const processUploadedCSV = async (filePath, db, uploadSessionId) => {
  const results = {
    newRecords: 0,
    duplicateRecords: 0,
    updatedRecords: 0,
    failedRecords: 0,
    errors: []
  };
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', async (row) => {
        try {
          const hashedKey = generateRecordKey(row);
          
          // Check for existing record
          const existing = await db.query(
            'SELECT id, amount, status FROM collections WHERE compositeKey = ?',
            [hashedKey]
          );
          
          if (existing.length === 0) {
            // New record - INSERT
            await db.query(
              `INSERT INTO collections 
               (compositeKey, externalRefId, customerId, amount, collectionDate, status, uploadSessionId)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [hashedKey, row.externalRefId, row.userId, row.amount, row.collectionDate, row.status, uploadSessionId]
            );
            results.newRecords++;
          } else if (existing[0].amount === parseFloat(row.amount) && 
                     existing[0].status === row.status) {
            // Duplicate - SKIP
            results.duplicateRecords++;
          } else {
            // Changed record - UPDATE
            await db.query(
              `UPDATE collections SET amount = ?, status = ?, updatedAt = NOW() WHERE id = ?`,
              [row.amount, row.status, existing[0].id]
            );
            results.updatedRecords++;
          }
        } catch (error) {
          results.failedRecords++;
          results.errors.push({ row: row.loanId, error: error.message });
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', reject);
  });
};

module.exports = { processUploadedCSV, generateRecordKey };
```

### Example 4: React Dashboard Component

```jsx
// CustomerRiskDashboard.jsx
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CustomerRiskDashboard = ({ customerId }) => {
  const [customer, setCustomer] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch customer data and risk scores
    fetchCustomerData(customerId);
  }, [customerId]);
  
  const fetchCustomerData = async () => {
    try {
      const response = await fetch(`/api/customers/${customerId}`);
      const data = await response.json();
      setCustomer(data);
      setRiskData(data.riskAssessment);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch customer data:', error);
    }
  };
  
  const getRiskColor = (score) => {
    if (score > 75) return '#d32f2f'; // Critical - Red
    if (score > 50) return '#f57c00'; // High - Orange
    if (score > 20) return '#fbc02d'; // Medium - Yellow
    return '#388e3c'; // Low - Green
  };
  
  const getConfidenceColor = (probability) => {
    if (probability > 0.80) return '#388e3c'; // Green - Very Likely
    if (probability > 0.60) return '#fbc02d'; // Yellow - Likely
    if (probability > 0.40) return '#f57c00'; // Orange - Moderate
    if (probability > 0.20) return '#d32f2f'; // Red - Unlikely
    return '#1a1a1a'; // Black - High Risk
  };
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div className="dashboard-container" style={{ padding: '20px', backgroundColor: '#f5f5f5' }}>
      <h1>{customer.customerName}</h1>
      <div className="grid-2">
        {/* Risk Score Card */}
        <div className="card" style={{ backgroundColor: getRiskColor(riskData.riskScore), color: 'white' }}>
          <h3>Risk Score</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold' }}>
            {riskData.riskScore.toFixed(0)}/100
          </div>
          <p>{riskData.riskLevel}</p>
        </div>
        
        {/* Payment Probability Card */}
        <div className="card" style={{ backgroundColor: getConfidenceColor(riskData.paymentProbability), color: 'white' }}>
          <h3>Payment Probability</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold' }}>
            {(riskData.paymentProbability * 100).toFixed(0)}%
          </div>
          <p>{riskData.confidenceLevel}</p>
        </div>
      </div>
      
      {/* Financial Summary */}
      <div className="card">
        <h3>Financial Summary</h3>
        <div className="grid-4">
          <div>
            <p>Total Default Value</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold' }}>
              ₹{customer.totalDefaultValue?.toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p>Total Overdue Days</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {customer.totalDefaultDays} days
            </p>
          </div>
          <div>
            <p>Default Frequency</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {customer.defaultFrequency?.toFixed(2)}/month
            </p>
          </div>
          <div>
            <p>Settlement Rate</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {((customer.settledCount / customer.defaultCount) * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
      
      {/* Default Trend Chart */}
      <div className="card">
        <h3>Default Amount Trend (Last 12 Months)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={customer.defaultTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="amount" stroke="#f57c00" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Default History Table */}
      <div className="card">
        <h3>Recent Default History</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#e0e0e0' }}>
              <th style={{ padding: '10px', textAlign: 'left' }}>Collection Date</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Loan ID</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Days Overdue</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {customer.defaultHistory?.map((record) => (
              <tr key={record.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '10px' }}>{new Date(record.collectionDate).toLocaleDateString()}</td>
                <td style={{ padding: '10px' }}>{record.loanId}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>₹{record.amount.toLocaleString('en-IN')}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>{record.overDueDays}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ 
                    padding: '4px 8px', 
                    backgroundColor: record.status === 'Bounced' ? '#ffcdd2' : '#c8e6c9',
                    borderRadius: '4px'
                  }}>
                    {record.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerRiskDashboard;
```

---

## QUICK COMMANDS FOR CODE GENERATORS

### GitHub Copilot
```
@copilot /explain Explain the risk score calculation formula
@copilot /doc Generate JSDoc documentation for calculateRiskScore
@copilot /tests Generate unit tests for payment probability function
@copilot /fix Fix the risk calculation bug
```

### Blackbox
```
/test          Run test suite
/explain       Explain code segment
/refactor      Optimize code performance
/document      Auto-generate documentation
/fix           Identify and fix bugs
```

### ChatGPT/Claude
```
"Generate Unit Tests for the calculateRiskScore function in Jest format"
"Create an API endpoint for /api/customers/:id with proper error handling"
"Generate a Python FastAPI version of the CSV processor"
"Create database migration scripts for PostgreSQL"
```

---

## TESTING EXAMPLES

### Unit Test Example (Jest)
```javascript
// risk-calculator.test.js
const { calculateRiskScore } = require('./risk-calculator');

describe('Risk Score Calculation', () => {
  test('should return low risk for clean customer', () => {
    const customer = {
      cumulativeDefaultValue: 100,
      totalLoanAmount: 100000,
      cumulativeDefaultDays: 5,
      defaultCount: 1,
      monthsActive: 12,
      lastDefaultDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) // 180 days ago
    };
    
    const result = calculateRiskScore(customer);
    expect(result.riskScore).toBeLessThan(20);
    expect(result.riskLevel).toBe('LOW');
  });
  
  test('should return critical risk for multiple defaults', () => {
    const customer = {
      cumulativeDefaultValue: 500000,
      totalLoanAmount: 100000,
      cumulativeDefaultDays: 365,
      defaultCount: 12,
      monthsActive: 12,
      lastDefaultDate: new Date() // Today
    };
    
    const result = calculateRiskScore(customer);
    expect(result.riskScore).toBeGreaterThan(75);
    expect(result.riskLevel).toBe('CRITICAL');
  });
});
```

---

## INTEGRATION WITH CODE EDITORS

### VS Code Settings (.vscode/settings.json)
```json
{
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true
    }
  },
  "github.copilot.enable": {
    "*": true,
    "plaintext": true
  },
  "github.copilot.advanced": {
    "listTopKCompletionDetails": 3
  }
}
```

### VS Code Extensions (package.json equivalent)
```json
{
  "devDependencies": {
    "eslint": "^8.0.0",
    "prettier": "^2.8.0",
    "jest": "^29.0.0",
    "@testing-library/react": "^13.0.0",
    "express": "^4.18.0",
    "postgresql": "^0.20.0",
    "csv-parser": "^3.0.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0"
  }
}
```

---

## DEPLOYMENT QUICK START

### Docker Setup
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3000
CMD ["npm", "start"]
```

### docker-compose.yml
```yaml
version: '3.9'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:password@postgres:5432/collections_db
      - JWT_SECRET=your-secret-key
    depends_on:
      - postgres
  
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: collections_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

---

## TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Risk score calculation incorrect | Verify all 4 components (amount, days, frequency, recency) |
| Duplicate records not detected | Check compositeKey generation matches data format |
| CSV upload fails | Validate CSV encoding (UTF-8), date format (ISO 8601) |
| Risk score takes time to calculate | Implement Redis caching, background jobs with Bull Queue |
| Dashboard slow | Add database indexes on customerId, collectionDate |
| Out of memory with large CSV | Use streaming parser instead of loading entire file |

---

**Next Step**: Select your preferred code generation tool and start with Section 1 (Core Functionality) of the master prompt!
