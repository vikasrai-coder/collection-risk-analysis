# Collection Risk Analysis System — Developer Integration API Guide

Welcome to the **Collection Risk Analysis External REST API (v1)**. This API allows external solutions, CRMs, mobile applications, and automated workflows to securely integrate with the Collection Risk Analysis platform managed by **Vikas Rai**.

---

## 🔑 Authentication

All API calls must be authenticated using an **API Key** or **Bearer Token** generated in the Admin Console (**API & Keys** menu).

Send your credentials in the HTTP request headers using either method:

### Method 1: `x-api-key` Header (Recommended for Server-to-Server)
```http
x-api-key: vk_live_7a3d8f1e9c4b2a5d6e8f0123456789ab
```

### Method 2: `Authorization: Bearer <Token>` Header
```http
Authorization: Bearer vk_sec_9934bd128e7f6a5c4b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f
```

> ⚠️ **Security Warning**: Keep your Bearer Secret Tokens safe. Do not expose them in public repositories or client-side web application JS bundles.

---

## 🌐 Base URL

| Environment | Base URL |
| :--- | :--- |
| **Production** | `https://collection-risk-analysis.vercel.app` (or your configured custom domain) |
| **Local Development** | `http://localhost:3000` |

---

## 🚀 API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/external/v1/ping` | Health Check & API Key Verification | Yes |
| `GET` | `/api/external/v1/records` | Query & Filter Collection Records | Yes |
| `POST` | `/api/external/v1/records` | Insert / Push New Loan Default Record | Yes |
| `PUT` | `/api/external/v1/records/:id/status` | Update Record Call Status, Remarks & Follow-up | Yes |
| `GET` | `/api/external/v1/analytics` | Retrieve Key Risk Metrics & Summary Stats | Yes |

---

## 📋 Endpoint Details & Code Examples

### 1. Verification & Health Check (`GET /api/external/v1/ping`)

Use this endpoint to verify that your API key is valid and the server is online.

#### Response `200 OK`
```json
{
  "ok": true,
  "status": "online",
  "message": "Collection Risk Analysis API is active and operational.",
  "authenticatedKey": {
    "id": "key_1723001234_a1b2",
    "name": "CRM Integration Key",
    "role": "write"
  },
  "serverTime": "2026-08-07T14:25:00.000Z"
}
```

---

### 2. Get Collection Records (`GET /api/external/v1/records`)

Retrieve collection default records with optional filtering and pagination parameters.

#### Query Parameters
- `search` *(string)*: Search term for customer name, loan ID, mobile number, or anchor.
- `lender` *(string)*: Filter by lender name (e.g. `Muthoot Fincorp Limited`).
- `status` *(string)*: Filter by record status (`Overdue`, `Bounce`, `Payment Clear`, `Closed`).
- `limit` *(number)*: Number of records to return (Default: `100`).
- `offset` *(number)*: Pagination offset (Default: `0`).

#### Response `200 OK`
```json
{
  "ok": true,
  "total": 45,
  "limit": 10,
  "offset": 0,
  "data": [
    {
      "id": "rec_1723001234_x9y8",
      "userId": "USR-1001",
      "loanId": "LN-20411",
      "customerName": "Aarav Retail",
      "lender": "Muthoot Fincorp Limited",
      "anchor": "Riya Singh",
      "mobile": "9876543210",
      "status": "Overdue",
      "loanAmount": 125000,
      "defaultAmount": 32000,
      "pendingAmount": 32000,
      "collectionDate": "2026-05-14",
      "riskScore": 74,
      "callStatus": "Pending",
      "remark": "Follow up scheduled",
      "followUpDate": "2026-05-18"
    }
  ]
}
```

---

### 3. Push New Record (`POST /api/external/v1/records`)

Insert a new collection risk or bounce record into the platform.

#### Request Body (JSON)
```json
{
  "customerName": "Global Enterprises",
  "loanId": "LN-99210",
  "lender": "Muthoot Fincorp Limited",
  "anchor": "Sanjay Sharma",
  "mobile": "9811223344",
  "loanAmount": 150000,
  "defaultAmount": 45000,
  "collectionDate": "2026-08-01",
  "status": "Bounce",
  "callStatus": "Pending",
  "remark": "PDC bounced due to insufficient funds"
}
```

#### Response `201 Created`
```json
{
  "ok": true,
  "message": "Record created successfully",
  "record": {
    "id": "rec_1723005678_a1b2",
    "loanId": "LN-99210",
    "customerName": "Global Enterprises",
    "pendingAmount": 45000,
    "status": "Bounce"
  }
}
```

---

### 4. Update Status & Add Remark (`PUT /api/external/v1/records/:id/status`)

Update call status, add a new remark to history, set follow-up date, or register partial payments for a record by `id` or `loanId`.

#### Request Body (JSON)
```json
{
  "callStatus": "Promise To Pay",
  "remark": "Customer agreed to pay INR 20,000 on Friday.",
  "followUpDate": "2026-08-10",
  "partialPaymentAmount": 10000
}
```

#### Response `200 OK`
```json
{
  "ok": true,
  "message": "Record updated successfully",
  "record": {
    "id": "rec_1723005678_a1b2",
    "loanId": "LN-99210",
    "callStatus": "Promise To Pay",
    "pendingAmount": 35000,
    "partialPaymentSettled": 10000
  }
}
```

---

### 5. Get Analytics Summary (`GET /api/external/v1/analytics`)

Fetch system-wide collection metrics and recovery stats.

#### Response `200 OK`
```json
{
  "ok": true,
  "summary": {
    "totalRecords": 128,
    "totalLoanAmount": 15400000,
    "totalDefaultAmount": 4200000,
    "totalPendingAmount": 2800000,
    "totalSettledAmount": 1400000,
    "paymentDoneCount": 42,
    "promiseToPayCount": 18,
    "pendingCount": 86,
    "recoveryRate": "33.33%"
  },
  "timestamp": "2026-08-07T14:26:00.000Z"
}
```

---

## 💻 Code Snippets

### cURL
```bash
# Get Records
curl -X GET "https://collection-risk-analysis.vercel.app/api/external/v1/records?status=Overdue" \
  -H "x-api-key: YOUR_API_KEY"

# Push New Record
curl -X POST "https://collection-risk-analysis.vercel.app/api/external/v1/records" \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Acme Trade",
    "loanAmount": 100000,
    "defaultAmount": 25000,
    "status": "Overdue"
  }'
```

### JavaScript / Node.js (Fetch)
```javascript
const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://collection-risk-analysis.vercel.app/api/external/v1';

// Fetch collection records
async function getCollectionRecords() {
  const response = await fetch(`${BASE_URL}/records?limit=20`, {
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  console.log('Collection Records:', data);
}

// Update call status
async function updateCallStatus(loanId, callStatus, remark) {
  const response = await fetch(`${BASE_URL}/records/${loanId}/status`, {
    method: 'PUT',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ callStatus, remark })
  });
  const result = await response.json();
  console.log('Update Result:', result);
}
```

### Python (`requests`)
```python
import requests

API_KEY = 'YOUR_API_KEY'
BASE_URL = 'https://collection-risk-analysis.vercel.app/api/external/v1'

headers = {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
}

# Check API health
r = requests.get(f'{BASE_URL}/ping', headers=headers)
print("Health Check:", r.json())

# Fetch analytics summary
r_analytics = requests.get(f'{BASE_URL}/analytics', headers=headers)
print("Analytics:", r_analytics.json())
```

---

## 🆘 Support & Contact

For questions or assistance regarding API integration, please reach out to **Vikas Rai** (`vikas.raiexp@gmail.com`).
