# Quick Start Guide - Running the System

## Step 1: Backend Setup (5 minutes)

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Setup database
# Make sure PostgreSQL is running, then:
npm run migrate

# Start backend server
npm start
# ✓ Server running on http://localhost:3000
```

## Step 2: Frontend Setup (3 minutes)

```bash
# In a NEW terminal window, navigate to frontend
cd frontend

# Install dependencies
npm install

# Start frontend
npm run dev
# ✓ Frontend running on http://localhost:3001
```

## Step 3: Create Account & Login (2 minutes)

1. Open http://localhost:3001
2. Register with email & password (min 12 characters)
3. Login with credentials
4. You'll see the empty dashboard

## Step 4: Upload Sample Data (2 minutes)

1. Download or use the provided CSV file: `Overall-Bounced-Collections15-05-2026.csv`
2. On dashboard, click "Choose File" and select your CSV
3. Click "Upload CSV"
4. Wait for processing (shows summary of records)
5. Dashboard automatically refreshes with new data

## Step 5: Explore Dashboard (3 minutes)

✓ **KPI Cards** - Portfolio overview (total value, defaults, customers, risk score)
✓ **Risk Distribution** - Pie chart of LOW/MEDIUM/HIGH/CRITICAL customers
✓ **Top At-Risk Customers** - Table of riskiest customers to contact
✓ **Upload Widget** - Keep uploading more collections data

## Key Features to Try

### View Customer Details
```bash
curl -X GET http://localhost:3000/api/customers/CUSTOMER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Dashboard Summary
```bash
curl -X GET http://localhost:3000/api/dashboard/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check Risk Distribution
```bash
curl -X GET http://localhost:3000/api/dashboard/risk-distribution \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Sample CSV Format

Your CSV should have these columns:
```
loanId,customerId,amount,collectionDate,status
LOAN001,CUST001,50000,2026-05-15,Bounced
LOAN002,CUST002,75000,2026-05-14,Success
LOAN003,CUST001,45000,2026-05-10,Bounced
```

## Troubleshooting

### "Cannot find module" errors
```bash
# In both backend and frontend directories:
npm install
```

### "Database connection refused"
```bash
# Make sure PostgreSQL is running
# Check DATABASE_URL in backend/.env
# Verify credentials match your PostgreSQL setup
```

### Port already in use
```bash
# Backend (3000) or Frontend (3001) might be in use
# Kill process or change PORT in .env files
```

### CSV upload fails
- File must be UTF-8 encoded CSV
- Max size 50MB
- Date format must be YYYY-MM-DD
- Required fields: loanId, customerId, amount, collectionDate, status

## What Happens When You Upload CSV

1. **Validation** - Checks file format, encoding, size
2. **Parsing** - Reads CSV row by row
3. **Schema Check** - Validates required fields and data types
4. **Deduplication** - Generates SHA256 hash for duplicate detection
5. **Database Insert** - Stores new records, skips duplicates
6. **Aggregation** - Calculates customer metrics (totals, counts)
7. **Risk Calculation** - Computes risk scores & probabilities
8. **Dashboard Update** - Refreshes all analytics

## Next Steps

- [ ] Upload your real collection data
- [ ] Explore risk scores for your customers
- [ ] Identify top at-risk customers for collections
- [ ] Monitor payment probability trends
- [ ] Export reports for stakeholders
- [ ] Set up automated daily uploads
- [ ] Configure alerts for critical risk customers

## Support

For detailed documentation, see:
- [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) - Full system guide
- [MASTER_PROMPT_CollectionRiskAnalysis.md](MASTER_PROMPT_CollectionRiskAnalysis.md) - System specifications
- [REFERENCE_GUIDE.md](REFERENCE_GUIDE.md) - Algorithm reference

---

**Ready to go!** Your Collection Risk Analysis system is now running.
