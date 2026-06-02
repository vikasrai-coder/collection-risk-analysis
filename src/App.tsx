import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  ActivitySquare,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  MessageCircle,
  Pencil,
  Phone,
  PhoneCall,
  Search,
  Upload,
  Users,
  Lock,
  LogOut,
  Plus,
  Key,
  Mail,
  X,
  Menu,
  Calendar,
  FileText,
  ArrowLeft,
  History,
} from "lucide-react";

type Page = "dashboard" | "followup" | "records" | "upload" | "users" | "reminders";

type RemarkEntry = {
  id: string;
  text: string;
  timestamp: string;
  addedBy: string;
  invoiceNumber?: string;
  partialPaymentAmount?: number;
  remainingAmount?: number;
};

type CollectionRecord = {
  id: string;
  userId: string;
  loanId: string;
  customerName: string;
  lender: string;
  anchor: string;
  mobile: string;
  alternateNumber: string;
  category: string;
  status: string;
  loanAmount: number;
  defaultAmount: number;
  collectionDate: string;
  riskScore: number;
  paymentProbability: number;
  callStatus: string;
  remark: string;
  remarkHistory?: RemarkEntry[];
  partialPaymentSettled?: number;
  pendingAmount?: number;
  followUpDate: string;
  followUpTime?: string;
  reminderEnabled: boolean;
  updatedAt: string;
  updatedBy?: string;
  manuallyEditedFields?: string[];
  pendingDays?: number;
  defaultDays?: number;
};

type UploadHistory = {
  id: string;
  type: "collection" | "customer";
  fileName: string;
  fileSize?: number;
  lastModified?: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  completedAt: string;
  message?: string;
};

type InteractionHistoryItem = {
  id: string;
  loanId: string;
  userId: string;
  customerName: string;
  callStatus: string;
  remark: string;
  followUpDate: string;
  followUpTime?: string;
  updatedAt: string;
  updatedBy: string;
};

type TelegramSettings = {
  isEnabled: boolean;
  botToken: string;
  chatId: string;
  agentName: string;
};

type Draft = {
  customerName: string;
  lender?: string;
  mobile: string;
  alternateNumber: string;
  anchor: string;
  callStatus: string;
  remark: string;
  followUpDate: string;
  followUpTime?: string;
  reminderEnabled: boolean;
  partialPaymentAmount?: number;
  invoiceNumber?: string;
};

type FollowupGroup = {
  groupKey: string;
  sourceIds: string[];
  userId: string;
  customerName: string;
  lender: string;
  anchor: string;
  mobile: string;
  alternateNumber: string;
  callStatus: string;
  remark: string;
  followUpDate: string;
  followUpTime?: string;
  reminderEnabled: boolean;
  totalLoanAmount: number;
  totalDefaultAmount: number;
  loanCount: number;
  updatedAt: string;
  pendingDays?: number;
  defaultDays?: number;
};

const STORAGE_KEY = "collection-risk-records-v1";
const HISTORY_KEY = "collection-risk-upload-history-v1";
const DB_NAME = "collection-risk-db";
const DB_VERSION = 1;
const RECORDS_STORE = "app_state";
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://localhost:3000");
const lenderWhitelist = [
  "Muthoot Fincorp Limited",
  "Zeal Holdings Private Limited",
  "ORA Finance Private Limited",
];

const callStatuses = [
  "Pending",
  "No Answer",
  "Call Back Later",
  "Promise To Pay",
  "Partial Payment",
  "Payment Done",
  "Switched Off",
  "Wrong Number",
  "Dispute",
];

function getWhatsAppLink(phone: string) {
  if (!phone) return "";
  const cleanPhone = phone.replace(/\D/g, "");
  // If it already starts with a country code (like 91) and is at least 11 digits, don't prefix it with 91.
  const phoneWithCountry = cleanPhone.startsWith("91") && cleanPhone.length > 10 ? cleanPhone : `91${cleanPhone}`;
  
  // Check if user agent is mobile
  const isMobile = typeof window !== 'undefined' && 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
  if (isMobile) {
    return `whatsapp://send?phone=${phoneWithCountry}`;
  }
  return `https://web.whatsapp.com/send?phone=${phoneWithCountry}`;
}

const seedRecords: CollectionRecord[] = [
  {
    id: "seed-1",
    userId: "USR-1001",
    loanId: "LN-20411",
    customerName: "Aarav Retail",
    lender: "Muthoot Fincorp Limited",
    anchor: "Riya Singh",
    mobile: "9876543210",
    alternateNumber: "",
    category: "Retail",
    status: "Overdue",
    loanAmount: 125000,
    defaultAmount: 32000,
    collectionDate: "2026-05-14",
    riskScore: 74,
    paymentProbability: 31,
    callStatus: "Pending",
    remark: "",
    followUpDate: "2026-05-18",
    reminderEnabled: true,
    updatedAt: "",
    pendingAmount: 32000,
    partialPaymentSettled: 0,
    remarkHistory: [],
  },
  {
    id: "seed-2",
    userId: "USR-1002",
    loanId: "LN-20412",
    customerName: "Nexa Traders",
    lender: "Zeal Holdings Private Limited",
    anchor: "Amit Gupta",
    mobile: "9988776655",
    alternateNumber: "9988776600",
    category: "Wholesale",
    status: "Bounce",
    loanAmount: 220000,
    defaultAmount: 54000,
    collectionDate: "2026-05-13",
    riskScore: 82,
    paymentProbability: 24,
    callStatus: "Promise To Pay",
    remark: "Will confirm on Monday.",
    followUpDate: "2026-05-19",
    reminderEnabled: true,
    updatedAt: "",
    pendingAmount: 54000,
    partialPaymentSettled: 0,
    remarkHistory: [],
  },
  {
    id: "seed-3",
    userId: "USR-1003",
    loanId: "LN-20413",
    customerName: "Ora Foods",
    lender: "ORA Finance Private Limited",
    anchor: "",
    mobile: "9123456780",
    alternateNumber: "",
    category: "Food",
    status: "Overdue",
    loanAmount: 95000,
    defaultAmount: 18000,
    collectionDate: "2026-05-15",
    riskScore: 58,
    paymentProbability: 48,
    callStatus: "Pending",
    remark: "",
    followUpDate: "",
    reminderEnabled: false,
    updatedAt: "",
    pendingAmount: 18000,
    partialPaymentSettled: 0,
    remarkHistory: [],
  },
];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueFromRow(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const [key, raw] of entries) {
    const normalizedKey = normalizeHeader(key);
    if (aliases.some((alias) => normalizedKey === normalizeHeader(alias))) {
      return String(raw ?? "").trim();
    }
  }
  return "";
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[0-9.]+e\+[0-9]+$/i.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return Math.round(asNumber).toString();
    }
  }
  return trimmed.replace(/[^0-9]/g, "");
}

function getBaseLoanId(loanId: string): string {
  if (!loanId) return "";
  const parts = loanId.split("-");
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`.trim();
  }
  return loanId.trim();
}

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isAllowedLender(lender: string) {
  if (!lender || !lender.trim()) return true;
  return lenderWhitelist.includes(normalizedText(lender));
}

function restrictToAllowedLenders(records: CollectionRecord[]) {
  return records.filter((record) => !record.lender || isAllowedLender(record.lender));
}

function makeLoanKey(row: Record<string, unknown>) {
  // 1. Explicit loanId column (may be empty in many sheets)
  const direct = valueFromRow(row, ["loanId", "loan_id"]);
  if (direct) return getBaseLoanId(direct);

  // 2. invoiceId — the stable, unique loan identifier in the bounce sheet
  //    (e.g. "IN-1006"). Each invoice = one loan. Use alone, NOT joined with
  //    referenceId which is a per-attempt key and changes every bounce event.
  const invoiceId = valueFromRow(row, ["invoiceId", "invoice_id"]);
  if (invoiceId) return getBaseLoanId(invoiceId);

  // 3. invoiceNumber as next best stable reference
  const invoiceNumber = valueFromRow(row, ["invoiceNumber", "invoice_number"]);
  if (invoiceNumber) return getBaseLoanId(invoiceNumber);

  // 4. externalRefId — present in some sheets as the lender's loan reference
  const externalRefId = valueFromRow(row, ["externalRefId", "external_ref_id"]);
  if (externalRefId) return getBaseLoanId(externalRefId);

  // 5. referenceId — payment attempt key; only use if nothing stable is found
  const referenceId = valueFromRow(row, ["referenceId", "reference_id"]);
  if (referenceId) return getBaseLoanId(referenceId);

  // 6. UTR / txn reference
  const txnRef = valueFromRow(row, ["utr", "txnRef", "txn_ref", "bankUTR", "pgPaymentId"]);
  if (txnRef) return getBaseLoanId(txnRef);

  // 7. uuid from source system
  const uuid = valueFromRow(row, ["uuid"]);
  if (uuid) return getBaseLoanId(uuid);

  // 8. Last resort: stable fields only — no dates
  const userId = valueFromRow(row, ["userId", "user_id", "customer_id", "customerId"]);
  const lender = valueFromRow(row, ["lender", "lenderName", "nbfc"]);
  const instalmentNo = valueFromRow(row, ["instalmentNo", "installmentNo"]);
  const amount = valueFromRow(row, ["principalAmount", "principal_amount", "pendingPrincipalAmount", "loanAmount", "loan_amount"]);
  return getBaseLoanId([userId, lender, instalmentNo, amount].filter(Boolean).join("-")) || `generated-${slug()}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTimeFromIso(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(dateVal: string, timeVal?: string) {
  if (!dateVal) return "-";
  const date = new Date(dateVal);
  const formattedDate = Number.isNaN(date.getTime())
    ? dateVal
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);

  if (timeVal) {
    const parts = timeVal.split(":");
    const h = parseInt(parts[0], 10);
    if (!isNaN(h)) {
      const ampm = h >= 12 ? "PM" : "AM";
      const displayHour = h % 12 || 12;
      const displayMin = parts[1] || "00";
      return `${formattedDate} at ${displayHour}:${displayMin} ${ampm}`;
    }
    return `${formattedDate} at ${timeVal}`;
  }
  return formattedDate;
}

function slug() {
  return Math.random().toString(36).slice(2, 10);
}

function computeRiskScore(loanAmount: number, defaultAmount: number, status: string) {
  const ratio = loanAmount > 0 ? defaultAmount / loanAmount : 0;
  let score = Math.round(Math.min(95, ratio * 120));
  if (/bounce|overdue|dpd|late/i.test(status)) score += 18;
  if (/closed|paid|current/i.test(status)) score -= 20;
  return Math.max(5, Math.min(95, score));
}

function calculatePendingDays(collectionDateStr: string | undefined | null): number {
  if (!collectionDateStr) return 0;
  try {
    const dateStr = collectionDateStr.substring(0, 10);
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 0;
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month
    const day = parseInt(parts[2], 10);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
    
    const recordDate = new Date(Date.UTC(year, month, day));
    
    const options = {
      timeZone: "Asia/Kolkata",
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const dateParts = formatter.formatToParts(new Date());
    
    const partMap: Record<string, string> = {};
    for (const part of dateParts) {
      partMap[part.type] = part.value;
    }
    
    const todayYear = parseInt(partMap.year, 10);
    const todayMonth = parseInt(partMap.month, 10) - 1;
    const todayDay = parseInt(partMap.day, 10);
    
    const todayDate = new Date(Date.UTC(todayYear, todayMonth, todayDay));
    
    const diffTime = todayDate.getTime() - recordDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  } catch (e) {
    return 0;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cleanupAndResetStaleRecords(records: CollectionRecord[]): CollectionRecord[] {
  if (!Array.isArray(records)) return [];

  // Get current Indian Standard Time (IST) components
  const options = {
    timeZone: "Asia/Kolkata",
    year: "numeric" as const,
    month: "2-digit" as const,
    day: "2-digit" as const,
    hour: "2-digit" as const,
    minute: "2-digit" as const,
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(new Date());
  
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  
  const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`; // "YYYY-MM-DD"
  const currentTimeStr = `${partMap.hour}:${partMap.minute}`; // "HH:MM"

  return records.map(rec => {
    // 1. Check if reminder has passed
    let reminderPassed = false;
    if (rec.followUpDate) {
      if (rec.followUpDate < todayStr) {
        reminderPassed = true;
      } else if (rec.followUpDate === todayStr) {
        if (rec.followUpTime && currentTimeStr >= rec.followUpTime) {
          reminderPassed = true;
        }
      }
    }

    // 2. Calculate pending days (only for active defaults)
    const isResolved =
      rec.callStatus === "Payment Done" ||
      rec.status === "Closed" ||
      rec.status === "Payment Clear";
    const pDays = isResolved ? 0 : calculatePendingDays(rec.collectionDate);

    // Copy record to update it, ensuring new fields are initialized
    const updatedRec = {
      ...rec,
      reminderEnabled: reminderPassed ? false : rec.reminderEnabled,
      pendingAmount: rec.pendingAmount ?? rec.defaultAmount,
      partialPaymentSettled: rec.partialPaymentSettled ?? 0,
      remarkHistory: rec.remarkHistory ?? [],
      updatedBy: rec.updatedBy,
      pendingDays: pDays,
      defaultDays: pDays,
    };

    return updatedRec;
  });
}

function getTodayIstString(): string {
  const options = {
    timeZone: "Asia/Kolkata",
    year: "numeric" as const,
    month: "2-digit" as const,
    day: "2-digit" as const,
  };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(new Date());
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function isDateTodayIst(dateString: string | undefined | null): boolean {
  if (!dateString) return false;
  const todayStr = getTodayIstString();
  try {
    const uDate = new Date(dateString);
    const options = {
      timeZone: "Asia/Kolkata",
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const uParts = formatter.formatToParts(uDate);
    const uMap: Record<string, string> = {};
    for (const p of uParts) {
      uMap[p.type] = p.value;
    }
    const recordDateIst = `${uMap.year}-${uMap.month}-${uMap.day}`;
    return recordDateIst === todayStr;
  } catch (e) {
    return dateString.slice(0, 10) === todayStr;
  }
}

function openCollectionRiskDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        db.createObjectStore(RECORDS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readPersistedRecords() {
  try {
    const db = await openCollectionRiskDb();
    return await new Promise<CollectionRecord[]>((resolve, reject) => {
      const tx = db.transaction(RECORDS_STORE, "readonly");
      const store = tx.objectStore(RECORDS_STORE);
      const request = store.get(STORAGE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as CollectionRecord[] | undefined;
        resolve(result && result.length ? restrictToAllowedLenders(result) : seedRecords);
      };
    });
  } catch {
    return restrictToAllowedLenders(loadRecords());
  }
}

async function persistRecords(records: CollectionRecord[]) {
  const db = await openCollectionRiskDb();
  return await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECORDS_STORE, "readwrite");
    const store = tx.objectStore(RECORDS_STORE);
    const request = store.put(records, STORAGE_KEY);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getAuthHeader() {
  const token = localStorage.getItem("collection-risk-token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function fetchBackendState() {
  const response = await fetch(`${API_BASE_URL}/api/state`, {
    headers: getAuthHeader()
  });
  if (!response.ok) {
    throw new Error(`Backend sync failed: ${response.status}`);
  }
  return response.json();
}

async function pushBackendState(
  records: CollectionRecord[],
  history: UploadHistory[],
  interaction_logs: InteractionHistoryItem[],
  telegram_settings: TelegramSettings
) {
  const finalRecords = cleanupAndResetStaleRecords(records);
  const response = await fetch(`${API_BASE_URL}/api/state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify({ records: finalRecords, history, interaction_logs: collapseSheetImportLogs(interaction_logs), telegram_settings }),
  });

  if (!response.ok) {
    throw new Error(`Backend save failed: ${response.status}`);
  }
}

function isLocked(record: CollectionRecord) {
  return record.callStatus === "Payment Done";
}

function appendRemarkToHistory(
  record: CollectionRecord,
  newRemark: string,
  callStatus: string,
  addedBy: string,
  invoiceNumber?: string,
  partialPaymentAmount?: number,
  createdAt = new Date().toISOString()
): { updatedRecord: CollectionRecord; remarkEntry: RemarkEntry } {
  const timestamp = createdAt;
  const remarkId = Math.random().toString(36).substring(2, 9);

  // Calculate remaining amount if partial payment
  const currentPending = record.pendingAmount ?? record.defaultAmount;
  const remainingAmount = partialPaymentAmount ? currentPending - partialPaymentAmount : undefined;

  // Format partial payment remark with invoice number and amount
  let formattedRemark = newRemark;
  if (callStatus === "Partial Payment" && partialPaymentAmount) {
    const invoiceStr = invoiceNumber ? ` [Invoice: ${invoiceNumber}]` : "";
    formattedRemark = `Partial Payment: ₹${partialPaymentAmount.toLocaleString("en-IN")}${invoiceStr} | Pending: ₹${(remainingAmount || 0).toLocaleString("en-IN")}. ${newRemark}`;
  }

  const remarkEntry: RemarkEntry = {
    id: remarkId,
    text: formattedRemark,
    timestamp,
    addedBy,
    invoiceNumber,
    partialPaymentAmount,
    remainingAmount,
  };

  const remarkHistory = [...(record.remarkHistory || []), remarkEntry];

  const updatedRecord: CollectionRecord = {
    ...record,
    remark: formattedRemark,
    remarkHistory,
    callStatus,
    followUpDate: callStatus === "Payment Done" ? "" : record.followUpDate,
    followUpTime: callStatus === "Payment Done" ? "" : record.followUpTime || "",
    reminderEnabled: callStatus === "Payment Done" ? false : record.reminderEnabled,
    updatedAt: timestamp,
    updatedBy: addedBy,
    partialPaymentSettled: partialPaymentAmount
      ? (record.partialPaymentSettled || 0) + partialPaymentAmount
      : record.partialPaymentSettled,
    pendingAmount: remainingAmount ?? record.pendingAmount,
  };

  return { updatedRecord, remarkEntry };
}

function mergeInteractionLogs(prev: InteractionHistoryItem[], newLogs: InteractionHistoryItem[]): InteractionHistoryItem[] {
  // Always append new logs without overwriting existing entries.
  // Each agent action and sheet-import is a distinct chronological event.
  const existingIds = new Set(prev.map((l) => l.id));
  const toAdd = newLogs.filter((l) => !existingIds.has(l.id));
  return collapseSheetImportLogs([...toAdd, ...prev]);
}

function addUniqueRemark(remarks: string[], remark: string, updatedAt?: string) {
  const trimmed = normalizedText(remark);
  if (!trimmed) return;

  const alreadyTimestamped = /^\[[^\]]+\]\s/.test(trimmed);
  const timelineRemark = alreadyTimestamped
    ? trimmed
    : `[${formatDateTimeFromIso(updatedAt || new Date().toISOString())}] ${trimmed}`;

  if (!remarks.includes(timelineRemark)) {
    remarks.push(timelineRemark);
  }
}

function collapseSheetImportLogs(logs: InteractionHistoryItem[]): InteractionHistoryItem[] {
  if (!Array.isArray(logs)) return [];

  const grouped = new Map<string, InteractionHistoryItem & { remarks: string[] }>();
  const passthrough: InteractionHistoryItem[] = [];

  logs.forEach((log) => {
    if (!log?.id?.startsWith("sheet-import-") || !log.userId) {
      passthrough.push(log);
      return;
    }

    const importDate = (log.updatedAt || "").slice(0, 10);
    const key = `${log.userId}|${log.updatedBy || "System Import"}|${importDate}`;
    const existing = grouped.get(key);
    if (existing) {
      addUniqueRemark(existing.remarks, log.remark || "", log.updatedAt);
      if ((existing.callStatus === "Pending" || !existing.callStatus) && log.callStatus) {
        existing.callStatus = log.callStatus;
      }
      if (!existing.followUpDate && log.followUpDate) {
        existing.followUpDate = log.followUpDate;
        existing.followUpTime = log.followUpTime || "";
      }
      if (new Date(log.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime()) {
        existing.updatedAt = log.updatedAt;
      }
      return;
    }

    const remarks: string[] = [];
    addUniqueRemark(remarks, log.remark || "", log.updatedAt);
    grouped.set(key, {
      ...log,
      id: log.id.startsWith("sheet-import-user-") ? log.id : `sheet-import-user-${log.userId}-${importDate || slug()}`,
      remarks,
    });
  });

  const collapsed = Array.from(grouped.values()).map(({ remarks, ...log }) => ({
    ...log,
    remark: remarks.join("\n"),
  }));

  return [...passthrough, ...collapsed].sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
  );
}

function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedRecords;
  try {
    const parsed = JSON.parse(raw) as CollectionRecord[];
    return parsed.length ? restrictToAllowedLenders(parsed) : seedRecords;
  } catch {
    return seedRecords;
  }
}

function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [] as UploadHistory[];
  try {
    return JSON.parse(raw) as UploadHistory[];
  } catch {
    return [];
  }
}

function isSeedOnly(records: CollectionRecord[]) {
  return records.length > 0 && records.every((record) => record.id.startsWith("seed-"));
}

function makeFollowupGroupKey(record: CollectionRecord) {
  return `${record.userId}__${record.lender}`;
}

function App() {
  // Authentication states
  const [user, setUser] = useState<{ id: string; email: string; role: "admin" | "manager" } | null>(() => {
    const stored = localStorage.getItem("collection-risk-user");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("collection-risk-token"));

  // Login states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // Cron running states
  const [cronRunLoading, setCronRunLoading] = useState(false);
  const [cronRunSuccess, setCronRunSuccess] = useState("");
  const [cronRunError, setCronRunError] = useState("");

  // User management states (Admin only)
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"manager" | "admin">("manager");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [usersList, setUsersList] = useState<Array<{ id: string; email: string; role: string; is_active: boolean; created_at: string }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Reset Password states
  const [resettingUser, setResettingUser] = useState<string | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // App core states
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [mobileShowDashboardDetails, setMobileShowDashboardDetails] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPaymentDoneList, setShowPaymentDoneList] = useState(false);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [search, setSearch] = useState("");
  const [lenderFilter, setLenderFilter] = useState("All");
  const [anchorFilter, setAnchorFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [editingId, setEditingId] = useState<string>("");
  const [editingGroups, setEditingGroups] = useState<Record<string, boolean>>({});
  const [followupEditMode, setFollowupEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [lastUploadMessage, setLastUploadMessage] = useState("");
  const [recordsReady, setRecordsReady] = useState(false);
  const syncTimerRef = useRef<number | null>(null);
  const draftsRef = useRef<Record<string, Draft>>({});

  // New States for chronological log, telegram setup, and selected user view
  const [interactionLogs, setInteractionLogs] = useState<InteractionHistoryItem[]>([]);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
    isEnabled: false,
    botToken: "",
    chatId: "",
    agentName: "",
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Telegram testing states
  const [telegramTestMessage, setTelegramTestMessage] = useState("");
  const [telegramTestSuccess, setTelegramTestSuccess] = useState("");
  const [telegramTestError, setTelegramTestError] = useState("");
  const [telegramTestLoading, setTelegramTestLoading] = useState(false);
  const [telegramSaveSuccess, setTelegramSaveSuccess] = useState("");

  // Agent Performance Dashboard state
  const [selectedPerformanceAgent, setSelectedPerformanceAgent] = useState<string>("All Agents");

  const handleLogout = () => {
    localStorage.removeItem("collection-risk-token");
    localStorage.removeItem("collection-risk-user");
    setToken(null);
    setUser(null);
    setActivePage("dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginEmail || !loginPassword) {
      setLoginError("Please enter both email and password.");
      return;
    }
    setLoginLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to log in");
      }
      localStorage.setItem("collection-risk-token", data.token);
      localStorage.setItem("collection-risk-user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setLoginEmail("");
      setLoginPassword("");
      
      // Fetch fresh backend state after logging in
      const state = await fetchBackendState();
      if (Array.isArray(state.records) && state.records.length) {
        setRecords(cleanupAndResetStaleRecords(restrictToAllowedLenders(state.records)));
      }
      if (Array.isArray(state.history) && state.history.length) {
        setUploadHistory(state.history);
      }
      if (Array.isArray(state.interaction_logs)) {
        setInteractionLogs(collapseSheetImportLogs(state.interaction_logs));
      }
      if (state.telegram_settings) {
        setTelegramSettings(state.telegram_settings);
      }
    } catch (err: any) {
      setLoginError(err.message || "Something went wrong. Please check your credentials.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess("");
    if (!forgotEmail) {
      setForgotError("Please enter your email address.");
      return;
    }
    setForgotLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to process request");
      }
      setForgotSuccess("A temporary password has been successfully dispatched to your email!");
      // Pre-fill login email for user convenience
      setLoginEmail(forgotEmail);
      setForgotEmail("");
    } catch (err: any) {
      setForgotError(err.message || "Something went wrong. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const refreshStateFromServer = async () => {
    try {
      const state = await fetchBackendState();
      if (Array.isArray(state.records)) {
        setRecords(cleanupAndResetStaleRecords(restrictToAllowedLenders(state.records)));
      }
      if (Array.isArray(state.history)) {
        setUploadHistory(state.history);
      }
      if (Array.isArray(state.interaction_logs)) {
        setInteractionLogs(collapseSheetImportLogs(state.interaction_logs));
      }
      if (state.telegram_settings) {
        setTelegramSettings(state.telegram_settings);
      }
    } catch (err) {
      console.error("Failed to refresh state from server:", err);
    }
  };

  useEffect(() => {
    if (!token) return;
    
    // Poll the backend state every 30 seconds for live scheduler/telegram dispatches
    const interval = setInterval(() => {
      refreshStateFromServer();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [token]);

  const handleRunCron = async () => {
    setCronRunSuccess("");
    setCronRunError("");
    setCronRunLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/reminders/cron-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ force: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to trigger reminder check");
      }
      const stats = data.stats || {};
      if (!stats.isEnabled) {
        setCronRunError("Telegram reminders are currently disabled. Enable them in settings.");
      } else {
        setCronRunSuccess(
          `🔔 Check complete! Evaluated ${stats.checkedCount} pending reminder(s). Dispatched ${stats.dispatchedCount} Telegram alert(s).`
        );
        // Refresh local memory from server immediately
        await refreshStateFromServer();
      }
    } catch (err: any) {
      setCronRunError(err.message || "Something went wrong running reminder check.");
    } finally {
      setCronRunLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    if (!newEmail || !newPassword) {
      setCreateError("Email and password are required.");
      return;
    }
    setCreateLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to create user");
      }
      setCreateSuccess(`User created successfully: ${newEmail}`);
      setNewEmail("");
      setNewPassword("");
      setNewRole("manager");
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create user.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");
    if (!resettingUser || !resetPasswordVal) {
      setResetError("Email and new password are required.");
      return;
    }
    setResetLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ email: resettingUser, password: resetPasswordVal }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to reset password");
      }
      setResetSuccess(`Password updated successfully for ${resettingUser}`);
      setResetPasswordVal("");
      setTimeout(() => {
        setResettingUser(null);
        setResetSuccess("");
      }, 3000);
    } catch (err: any) {
      setResetError(err.message || "Failed to reset password.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSaveTelegramSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramSaveSuccess("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/telegram-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader()
        },
        body: JSON.stringify({
          telegram_settings: telegramSettings
        }),
      });
      if (!response.ok) throw new Error("Failed to save Telegram settings to database.");
      setTelegramSaveSuccess("Telegram Alert settings saved successfully!");
      setTimeout(() => setTelegramSaveSuccess(""), 3000);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to save Telegram settings.");
    }
  };

  const handleSendTelegramTest = async () => {
    setTelegramTestSuccess("");
    setTelegramTestError("");
    if (!telegramSettings.botToken || !telegramSettings.chatId) {
      setTelegramTestError("Please provide Bot Token and Chat ID first.");
      return;
    }
    setTelegramTestLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/reminders/send-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader()
        },
        body: JSON.stringify({
          botToken: telegramSettings.botToken,
          chatId: telegramSettings.chatId,
          message: telegramTestMessage || undefined
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to dispatch Telegram message");
      setTelegramTestSuccess("🔔 Success! Telegram test notification dispatched.");
      setTelegramTestMessage("");
    } catch (err: any) {
      setTelegramTestError(err.message || "Failed to dispatch Telegram notification.");
    } finally {
      setTelegramTestLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!token || user?.role !== "admin") return;
    setUsersLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsersList(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (activePage === "users" && user?.role === "admin") {
      fetchUsers();
    }
  }, [activePage, user]);

  useEffect(() => {
    let active = true;

    async function initApp() {
      try {
        const state = await fetchBackendState();
        if (!active) return;

        if (Array.isArray(state.records) && state.records.length) {
          setRecords(cleanupAndResetStaleRecords(restrictToAllowedLenders(state.records)));
        } else {
          const localRecs = await readPersistedRecords().catch(() => loadRecords());
          if (active) setRecords(cleanupAndResetStaleRecords(localRecs));
        }

        if (Array.isArray(state.history) && state.history.length) {
          setUploadHistory(state.history);
        } else {
          setUploadHistory(loadHistory());
        }

        if (Array.isArray(state.interaction_logs)) {
          setInteractionLogs(collapseSheetImportLogs(state.interaction_logs));
        }

        if (state.telegram_settings) {
          setTelegramSettings(state.telegram_settings);
        }

        // Silent background check to trigger any due Telegram alerts
        fetch(`${API_BASE_URL}/api/reminders/cron-check`).catch(() => {});
      } catch (err) {
        console.warn("Backend state unavailable, using local persistence:", err);
        if (!active) return;

        const localRecs = await readPersistedRecords().catch(() => loadRecords());
        if (active) {
          setRecords(cleanupAndResetStaleRecords(localRecs));
          setUploadHistory(loadHistory());
        }
      } finally {
        if (active) {
          setRecordsReady(true);
        }
      }
    }

    initApp();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!recordsReady) return;
    persistRecords(records).catch(() => {
      setLastUploadMessage("Record storage failed in browser. Data is loaded for this session only.");
    });
  }, [records, recordsReady]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(uploadHistory));
  }, [uploadHistory]);

  useEffect(() => {
    if (!recordsReady) return;
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      pushBackendState(records, uploadHistory, interactionLogs, telegramSettings).catch(() => {});
    }, 700);
  }, [records, uploadHistory, interactionLogs, telegramSettings, recordsReady]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const lenders = useMemo(
    () => ["All", ...new Set(records.map((record) => record.lender).filter(Boolean))],
    [records],
  );

  const anchors = useMemo(
    () => ["All", ...new Set(records.map((record) => record.anchor).filter(Boolean))],
    [records],
  );

  const filteredRecords = useMemo(() => {
    return restrictToAllowedLenders(records).filter((record) => {
      const matchesSearch =
        !search ||
        [
          record.userId,
          record.loanId,
          record.customerName,
          record.mobile,
          record.alternateNumber,
          record.anchor,
          record.lender,
          record.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchesLender = lenderFilter === "All" || record.lender === lenderFilter;
      const matchesAnchor = anchorFilter === "All" || record.anchor === anchorFilter;
      
      let matchesStatus = true;
      if (statusFilter === "Active") {
        matchesStatus =
          record.callStatus !== "Payment Done" &&
          record.status !== "Closed" &&
          record.status !== "Payment Clear";
      } else if (statusFilter !== "All") {
        matchesStatus = record.callStatus === statusFilter;
      }

      return matchesSearch && matchesLender && matchesAnchor && matchesStatus;
    });
  }, [records, search, lenderFilter, anchorFilter, statusFilter]);

  const topCustomers = useMemo(() => {
    const groups = new Map<
      string,
      {
        userId: string;
        customerName: string;
        lender: string;
        anchor: string;
        mobile: string;
        alternateNumber: string;
        recordCount: number;
        loanCount: number;
        totalLoanAmount: number;
        totalDefaultAmount: number;
        avgRisk: number;
      }
    >();

    for (const record of filteredRecords) {
      const key = record.userId || record.loanId;
      const existing = groups.get(key);
      if (existing) {
        existing.recordCount += 1;
        existing.loanCount += record.loanId ? 1 : 0;
        existing.totalLoanAmount += record.loanAmount;
        existing.totalDefaultAmount += record.defaultAmount;
        existing.avgRisk += Number(record.riskScore || 0);
      } else {
        groups.set(key, {
          userId: record.userId,
          customerName: record.customerName,
          lender: record.lender,
          anchor: record.anchor,
          mobile: record.mobile,
          alternateNumber: record.alternateNumber,
          recordCount: 1,
          loanCount: record.loanId ? 1 : 0,
          totalLoanAmount: record.loanAmount,
          totalDefaultAmount: record.defaultAmount,
          avgRisk: Number(record.riskScore || 0),
        });
      }
    }

    return Array.from(groups.values())
      .map((item) => ({ ...item, avgRisk: Math.round(item.avgRisk / item.recordCount) }))
      .sort((a, b) => b.totalDefaultAmount - a.totalDefaultAmount)
      .slice(0, 10);
  }, [filteredRecords]);

  const summary = useMemo(() => {
    const totalLoanAmount = filteredRecords.reduce((sum, record) => sum + record.loanAmount, 0);
    const totalDefaultAmount = filteredRecords.reduce((sum, record) => sum + record.defaultAmount, 0);
    // Count ALL payment-done records (not just today's) so the tab shows cumulative closures
    const paymentDoneCount = records.filter(
      (record) => record.callStatus === "Payment Done" || record.status === "Closed" || record.status === "Payment Clear"
    ).length;
    const remindersCount = filteredRecords.filter((record) => record.reminderEnabled && record.followUpDate).length;
    const avgRisk = filteredRecords.length
      ? Math.round(filteredRecords.reduce((sum, record) => sum + Number(record.riskScore || 0), 0) / filteredRecords.length)
      : 0;

    return {
      totalLoanAmount,
      totalDefaultAmount,
      paymentDoneCount,
      remindersCount,
      avgRisk,
      customers: new Set(filteredRecords.map((record) => record.userId)).size,
    };
  }, [filteredRecords, records]);

  const dailyHandledRecords = useMemo(() => {
    return filteredRecords.filter((record) => isDateTodayIst(record.updatedAt));
  }, [filteredRecords]);

  const dailyHandledAmount = useMemo(() => {
    return dailyHandledRecords.reduce((sum, record) => sum + (record.defaultAmount || 0), 0);
  }, [dailyHandledRecords]);

  const distinctAgents = useMemo(() => {
    const agents = new Set<string>();
    
    // 1. Gather from registered user accounts in the UI state
    if (usersList && Array.isArray(usersList)) {
      usersList.forEach(u => {
        if (u.email) agents.add(u.email.toLowerCase().trim());
      });
    }
    
    // 2. Gather from actual interaction logs to capture any active loggers
    if (interactionLogs && Array.isArray(interactionLogs)) {
      interactionLogs.forEach(log => {
        if (log.updatedBy) agents.add(log.updatedBy.toLowerCase().trim());
      });
    }
    
    // 3. Add all system-seeded admin and manager accounts
    const systemAgents = [
      "vikas.rai@kredmint.com",
      "admin@kredmint.com",
      "vikas.raiexp@gmail.com",
      "gurudutt@kredmint.com",
      "praveen.chauhan@kredmint.com",
      "ritik@kredmint.com"
    ];
    systemAgents.forEach(email => agents.add(email.toLowerCase().trim()));
    
    // 4. Ensure current logged-in user is present
    if (user?.email) {
      agents.add(user.email.toLowerCase().trim());
    }
    
    return Array.from(agents);
  }, [interactionLogs, usersList, user]);

  const agentClosureStats = useMemo(() => {
    const agentLogs = selectedPerformanceAgent === "All Agents"
      ? interactionLogs
      : interactionLogs.filter(log => log.updatedBy === selectedPerformanceAgent);

    const touchedLoanIds = new Set(agentLogs.map(log => log.loanId));
    const agentRecords = records.filter(r => touchedLoanIds.has(r.loanId));

    const closedCases = agentLogs.filter(log => log.callStatus === "Payment Done");
    const uniqueClosedLoanIds = new Set(closedCases.map(c => c.loanId));
    const uniqueClosedRecords = records.filter(r => uniqueClosedLoanIds.has(r.loanId));

    const totalAssignedCount = agentRecords.length;
    const totalClosedCount = uniqueClosedRecords.length;
    
    const totalCollectedAmount = uniqueClosedRecords.reduce((sum, r) => sum + r.defaultAmount, 0);
    
    const remainingRecords = agentRecords.filter(r => !uniqueClosedLoanIds.has(r.loanId));
    const pendingExposureAmount = remainingRecords.reduce((sum, r) => sum + r.defaultAmount, 0);

    const totalFollowupsMade = agentLogs.length;

    const efficiencyRate = totalAssignedCount > 0
      ? Math.round((totalClosedCount / totalAssignedCount) * 100)
      : 0;

    return {
      totalAssignedCount,
      totalClosedCount,
      totalCollectedAmount,
      pendingExposureAmount,
      totalFollowupsMade,
      efficiencyRate
    };
  }, [selectedPerformanceAgent, interactionLogs, records]);

  const selectedUserRecord = useMemo(() => {
    if (!selectedUserId) return null;
    const userRecords = records.filter((r) => r.userId === selectedUserId || r.loanId === selectedUserId);
    if (userRecords.length === 0) return null;
    return [...userRecords].sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
    )[0];
  }, [selectedUserId, records]);

  const selectedUserGroupData = useMemo(() => {
    if (!selectedUserId || !selectedUserRecord) return null;
    const groupRecords = records.filter(
      (r) => r.userId === selectedUserRecord.userId && r.lender === selectedUserRecord.lender
    );
    const totalDefaultAmount = groupRecords.reduce((sum, r) => sum + (r.defaultAmount || 0), 0);
    const totalLoanAmount = groupRecords.reduce((sum, r) => sum + (r.loanAmount || 0), 0);
    const loanCount = groupRecords.length;
    return {
      totalDefaultAmount,
      totalLoanAmount,
      loanCount,
    };
  }, [selectedUserId, selectedUserRecord, records]);

  const statusBreakdown = useMemo(() => {
    const source = new Map<string, number>();
    for (const record of filteredRecords) {
      const label = record.callStatus || "Pending";
      source.set(label, (source.get(label) || 0) + 1);
    }
    return Array.from(source.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRecords]);

  const lenderBreakdown = useMemo(() => {
    const source = new Map<string, number>();
    for (const record of filteredRecords) {
      source.set(record.lender || "Unknown", (source.get(record.lender || "Unknown") || 0) + 1);
    }
    return Array.from(source.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRecords]);

  const reminderQueue = useMemo(() => {
    // Get current Indian Standard Time (IST) components
    const options = {
      timeZone: "Asia/Kolkata",
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(new Date());
    const partMap: any = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }
    const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    const currentTimeStr = `${partMap.hour}:${partMap.minute}`;

    return filteredRecords
      .filter((record) => {
        // Must have reminder enabled and a follow up date set
        if (!record.reminderEnabled || !record.followUpDate) return false;
        // Must not be resolved
        if (record.callStatus === "Payment Done" || record.status === "Closed" || record.status === "Payment Clear") return false;
        
        // Reminder must not have passed
        const isFutureDate = record.followUpDate > todayStr;
        const isTodayFutureTime = record.followUpDate === todayStr && (!record.followUpTime || record.followUpTime > currentTimeStr);
        return isFutureDate || isTodayFutureTime;
      })
      .sort((a, b) => (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999"));
  }, [filteredRecords]);

  const activeRemindersCount = useMemo(() => {
    // Get current Indian Standard Time (IST) components
    const options = {
      timeZone: "Asia/Kolkata",
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(new Date());
    const partMap: any = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }
    const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    const currentTimeStr = `${partMap.hour}:${partMap.minute}`;

    return filteredRecords.filter(record => {
      if (!record.reminderEnabled || !record.followUpDate) return false;
      if (record.callStatus === "Payment Done" || record.status === "Closed" || record.status === "Payment Clear") return false;
      
      const isFutureDate = record.followUpDate > todayStr;
      const isTodayFutureTime = record.followUpDate === todayStr && (!record.followUpTime || record.followUpTime > currentTimeStr);
      return isFutureDate || isTodayFutureTime;
    }).length;
  }, [filteredRecords]);

  const riskBands = useMemo(() => {
    const bands = [
      { label: "High", count: 0, color: "bg-rose-500" },
      { label: "Medium", count: 0, color: "bg-amber-500" },
      { label: "Low", count: 0, color: "bg-emerald-500" },
    ];

    for (const record of filteredRecords) {
      if (record.riskScore >= 75) bands[0].count += 1;
      else if (record.riskScore >= 45) bands[1].count += 1;
      else bands[2].count += 1;
    }

    return bands;
  }, [filteredRecords]);

  const lenderExposure = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of filteredRecords) {
      map.set(record.lender, (map.get(record.lender) || 0) + record.defaultAmount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRecords]);

  const followupGroups = useMemo(() => {
    const groups = new Map<string, FollowupGroup>();
    const todayStr = getTodayIstString();

    for (const record of filteredRecords) {
      if (record.callStatus === "Payment Done" || record.status === "Closed" || record.status === "Payment Clear") {
        continue;
      }

      // Check if this record was updated today (in IST)
      const isUpdatedToday = isDateTodayIst(record.updatedAt);

      const displayCallStatus = isUpdatedToday ? (record.callStatus || "Pending") : "Pending";
      const displayRemark = isUpdatedToday ? (record.remark || "") : "";

      // For followUpDate/time, show if updated today or if there's a future scheduled reminder
      const hasFutureReminder = record.followUpDate && record.followUpDate >= todayStr;
      const displayFollowUpDate = (isUpdatedToday || hasFutureReminder) ? record.followUpDate : "";
      const displayFollowUpTime = (isUpdatedToday || hasFutureReminder) ? (record.followUpTime || "") : "";

      const groupKey = makeFollowupGroupKey(record);
      const existing = groups.get(groupKey);
      if (existing) {
        existing.sourceIds.push(record.id);
        existing.totalLoanAmount += record.loanAmount;
        existing.totalDefaultAmount += record.defaultAmount;
        existing.loanCount += 1;
        
        // Track the maximum default age/pending days for this group
        if (record.pendingDays !== undefined && (existing.pendingDays === undefined || record.pendingDays > existing.pendingDays)) {
          existing.pendingDays = record.pendingDays;
          existing.defaultDays = record.defaultDays;
        }

        // Accumulate unique remarks if updated today
        if (displayRemark) {
          const trimmedRemark = displayRemark.trim();
          if (trimmedRemark) {
            const currentRemarks = existing.remark
              ? existing.remark.split("; ").map((r) => r.trim()).filter(Boolean)
              : [];
            if (!currentRemarks.includes(trimmedRemark)) {
              existing.remark = existing.remark
                ? `${existing.remark}; ${trimmedRemark}`
                : trimmedRemark;
            }
          }
        }

        
        if (!existing.followUpDate && displayFollowUpDate) {
          existing.followUpDate = displayFollowUpDate;
          existing.followUpTime = displayFollowUpTime;
        }
        if (!existing.mobile && record.mobile) existing.mobile = record.mobile;
        if (!existing.alternateNumber && record.alternateNumber) existing.alternateNumber = record.alternateNumber;
        if (!existing.anchor && record.anchor) existing.anchor = record.anchor;
        if (!existing.customerName && record.customerName) existing.customerName = record.customerName;
        if (record.updatedAt > existing.updatedAt) {
          existing.updatedAt = record.updatedAt;
          existing.callStatus = displayCallStatus;
        }
      } else {
        groups.set(groupKey, {
          groupKey,
          sourceIds: [record.id],
          userId: record.userId,
          customerName: record.customerName,
          lender: record.lender,
          anchor: record.anchor,
          mobile: record.mobile,
          alternateNumber: record.alternateNumber,
          callStatus: displayCallStatus,
          remark: displayRemark,
          followUpDate: displayFollowUpDate,
          followUpTime: displayFollowUpTime,
          reminderEnabled: record.reminderEnabled,
          totalLoanAmount: record.loanAmount,
          totalDefaultAmount: record.defaultAmount,
          loanCount: 1,
          updatedAt: record.updatedAt,
          pendingDays: record.pendingDays,
          defaultDays: record.defaultDays,
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.totalDefaultAmount - a.totalDefaultAmount);
  }, [filteredRecords]);

  function getGroupDraft(group: FollowupGroup): Draft {
    return (
      drafts[group.groupKey] || {
        customerName: group.customerName,
        lender: group.lender,
        mobile: group.mobile,
        alternateNumber: group.alternateNumber,
        anchor: group.anchor,
        callStatus: group.callStatus || "Pending",
        remark: group.remark,
        followUpDate: group.followUpDate,
        followUpTime: group.followUpTime || "",
        reminderEnabled: group.reminderEnabled !== undefined && group.reminderEnabled !== null ? group.reminderEnabled : !!group.followUpDate,
      }
    );
  }

  function pushHistory(entry: Omit<UploadHistory, "id" | "completedAt">) {
    setUploadHistory((current) => [
      {
        ...entry,
        id: slug(),
        completedAt: new Date().toISOString(),
      },
      ...current,
    ]);
  }

  function parseCollectionFile(file: File) {
    // Idempotency: warn if same file is processed again, but allow re-processing to support schema updates
    const isDuplicate = uploadHistory.some(
      (h) => h.fileName === file.name && h.fileSize === file.size && h.lastModified === file.lastModified
    );

    if (isDuplicate) {
      setLastUploadMessage(`Re-processing previously uploaded file: ${file.name}...`);
    }


    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: ({ data }) => {
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let archived = 0;
        let matchedWithoutLoanId = 0;
        const current = records;
        const baseRecords = isSeedOnly(current) ? [] : current;
        const byLoanId = new Map(baseRecords.map((record) => [getBaseLoanId(record.loanId) || record.id, { ...record }]));
        const nextByLoanId = new Map(byLoanId);
        const newLogs: InteractionHistoryItem[] = [];
        const sheetImportLogs = new Map<
          string,
          {
            loanId: string;
            userId: string;
            customerName: string;
            callStatus: string;
            remarks: string[];
            followUpDate: string;
            followUpTime: string;
            updatedAt: string;
            updatedBy: string;
          }
        >();
        const uploadTimestamp = new Date().toISOString();
        const addSheetImportLog = (log: Omit<InteractionHistoryItem, "id" | "remark"> & { remark: string }) => {
          const key = log.userId;
          const existing = sheetImportLogs.get(key);
          if (existing) {
            addUniqueRemark(existing.remarks, log.remark, log.updatedAt);
            if ((existing.callStatus === "Pending" || !existing.callStatus) && log.callStatus) {
              existing.callStatus = log.callStatus;
            }
            if (!existing.followUpDate && log.followUpDate) {
              existing.followUpDate = log.followUpDate;
              existing.followUpTime = log.followUpTime || "";
            }
            if (!existing.customerName && log.customerName) existing.customerName = log.customerName;
            return;
          }

          const remarks: string[] = [];
          addUniqueRemark(remarks, log.remark, log.updatedAt);
          sheetImportLogs.set(key, {
            loanId: log.loanId,
            userId: log.userId,
            customerName: log.customerName,
            callStatus: log.callStatus || "Pending",
            remarks,
            followUpDate: log.followUpDate,
            followUpTime: log.followUpTime || "",
            updatedAt: log.updatedAt,
            updatedBy: log.updatedBy,
          });
        };
        // Track every loanId actually present in this upload
        const uploadedLoanIds = new Set<string>();

        for (const row of data) {
          const userId = valueFromRow(row, ["userId", "user_id", "customer_id", "customerId"]);
          const loanId = makeLoanKey(row);
          const lender = normalizedText(valueFromRow(row, ["lender", "lenderName", "nbfc"]));

          if (!userId || !isAllowedLender(lender)) {
            skipped += 1;
            continue;
          }

          // Mark this loanId as present in today's upload
          uploadedLoanIds.add(loanId);

          const customerName = normalizedText(valueFromRow(row, ["customerName", "customer", "name", "merchant", "merchantName"]));
          const anchor = normalizedText(valueFromRow(row, ["anchor", "anchorName", "anchorPerson"]));
          const mobile = normalizePhone(valueFromRow(row, ["mobile", "phone", "contact", "mobileNumber"]));
          const alternateNumber = normalizePhone(valueFromRow(row, ["alternateNumber", "alternateMobile", "alternate_mobile", "altMobile"]));
          const category = normalizedText(valueFromRow(row, ["category", "segment", "industry"]));
          const status = valueFromRow(row, ["status", "collectionStatus", "loanStatus"]) || "Pending";
          const loanAmount = parseAmount(
            valueFromRow(row, ["loanAmount", "loan_amount", "pendingPrincipalAmount", "principalAmount", "amount", "principal"]),
          );
          const defaultAmount = parseAmount(
            valueFromRow(row, ["defaultAmount", "default_amount", "overdueAmt", "overdue", "outstanding", "dueAmount", "amount"]),
          );
          const collectionDate =
            valueFromRow(row, ["collectionDateStr", "utrDateStr", "collectionDate", "date", "transactionDate"]) ||
            valueFromRow(row, ["lastCollectionDate"]);
          const riskScore = computeRiskScore(loanAmount, defaultAmount, status);
          const paymentProbability = Math.max(5, 100 - riskScore);

          const csvCallStatus = valueFromRow(row, ["callStatus", "call_status", "callStatusStr", "followUpStatus", "callstatus"]);
          const csvRemark = valueFromRow(row, ["remark", "remarks", "comment", "comments", "agentRemark", "agentRemarks", "remarks_comment", "remark_comment"]);
          const csvFollowUpDate = valueFromRow(row, ["followUpDate", "follow_up_date", "nextActionDate", "nextCallDate", "followupdate"]);

          const existing = nextByLoanId.get(loanId);

          if (existing) {
            // Status Isolation: If record is already resolved, preserve it completely (don't touch payment done records)
            if (
              existing.callStatus === "Payment Done" ||
              existing.status === "Closed" ||
              existing.status === "Payment Clear"
            ) {
              // Keep the record in nextByLoanId but don't modify it
              uploadedLoanIds.add(loanId); // prevent auto-archive of payment-done records
              skipped += 1;
              continue;
            }

            if (!valueFromRow(row, ["loanId", "loan_id"])) matchedWithoutLoanId += 1;

            const isNewRemark = !!csvRemark && existing.remark !== csvRemark;
            const isNewStatus = (!existing.callStatus || existing.callStatus === "Pending") && csvCallStatus && csvCallStatus !== "Pending";

            const updatedRec = {
              ...existing,
              userId,
              loanId,
              // FIELD PROTECTION: existing non-empty agent-edited values are NEVER overwritten by CSV.
              // CSV data only fills in blank/missing fields. This covers both manuallyEditedFields
              // and any value the agent set that wasn't explicitly flagged.
              customerName: (existing.customerName && existing.customerName.trim())
                ? existing.customerName
                : (customerName || ""),
              lender: (existing.lender && existing.lender.trim())
                ? existing.lender
                : (lender || ""),
              anchor: (existing.anchor && existing.anchor.trim())
                ? existing.anchor
                : (anchor || ""),
              mobile: (existing.mobile && existing.mobile.trim())
                ? existing.mobile
                : (mobile || ""),
              alternateNumber: (existing.alternateNumber && existing.alternateNumber.trim())
                ? existing.alternateNumber
                : (alternateNumber || ""),
              category: category || existing.category,
              status,
              loanAmount,
              defaultAmount,
              collectionDate,
              riskScore,
              paymentProbability,
              // Keep call details user-driven; never overwrite agent-set values with sheet values
              callStatus: existing.callStatus || csvCallStatus || "Pending",
              // IMPORTANT: always preserve the agent's remark; never reset it from the sheet
              remark: existing.remark,
              remarkHistory: existing.remarkHistory,
              followUpDate: existing.followUpDate || csvFollowUpDate || "",
              reminderEnabled: existing.reminderEnabled ?? !!csvFollowUpDate,
              // Preserve the existing updatedAt so the record is NOT seen as "updated today" by the daily followup view
              updatedAt: existing.updatedAt,
              pendingAmount: existing.pendingAmount ?? existing.defaultAmount,
              partialPaymentSettled: existing.partialPaymentSettled,
            };
            
            nextByLoanId.set(loanId, updatedRec);
            updated += 1;

            // Only log if the CSV sheet brought in new remarks/status not previously present
            if (isNewRemark || isNewStatus) {
              addSheetImportLog({
                loanId: loanId,
                userId: userId,
                customerName: updatedRec.customerName,
                callStatus: updatedRec.callStatus,
                remark: csvRemark || "",
                followUpDate: updatedRec.followUpDate,
                followUpTime: updatedRec.followUpTime || "",
                updatedAt: uploadTimestamp,
                updatedBy: "System Import",
              });
            }
          } else {
            const finalCallStatus = csvCallStatus || "Pending";
            const finalRemark = csvRemark || "";
            const finalFollowUpDate = csvFollowUpDate || "";
            const timestamp = new Date().toISOString();

            const newRec = {
              id: slug(),
              userId,
              loanId,
              customerName,
              lender,
              anchor,
              mobile,
              alternateNumber,
              category,
              status,
              loanAmount,
              defaultAmount,
              collectionDate,
              riskScore,
              paymentProbability,
              callStatus: finalCallStatus,
              remark: finalRemark,
              followUpDate: finalFollowUpDate,
              reminderEnabled: !!finalFollowUpDate,
              updatedAt: timestamp,
              pendingAmount: defaultAmount,
              partialPaymentSettled: 0,
              remarkHistory: [],
            };
            nextByLoanId.set(loanId, newRec);
            created += 1;

            if (finalRemark || finalCallStatus !== "Pending") {
              addSheetImportLog({
                loanId: loanId,
                userId: userId,
                customerName: customerName,
                callStatus: finalCallStatus,
                remark: finalRemark,
                followUpDate: finalFollowUpDate,
                followUpTime: "",
                updatedAt: timestamp,
                updatedBy: user?.email || "System Import",
              });
            }
          }
        }

        sheetImportLogs.forEach((log) => {
          newLogs.push({
            id: `sheet-import-user-${log.userId}-${Date.now()}-${slug()}`,
            loanId: log.loanId,
            userId: log.userId,
            customerName: log.customerName,
            callStatus: log.callStatus,
            remark: log.remarks.join("\n"),
            followUpDate: log.followUpDate,
            followUpTime: log.followUpTime,
            updatedAt: log.updatedAt,
            updatedBy: log.updatedBy,
          });
        });

        // Auto-archive: any existing active record NOT in today's upload is considered paid/resolved
        // (lender removed them from the collection sheet = they no longer need follow-up)
        if (uploadedLoanIds.size > 0) {
          const archiveTimestamp = new Date().toISOString();
          for (const [key, rec] of nextByLoanId) {
            if (uploadedLoanIds.has(key)) continue; // still active in today's upload
            // Skip already-resolved records
            if (
              rec.callStatus === "Payment Done" ||
              rec.status === "Closed" ||
              rec.status === "Payment Clear"
            ) continue;

            const archivedRec = {
              ...rec,
              callStatus: "Payment Done",
              status: "Closed",
              remark: rec.remark
                ? `${rec.remark} | Auto-Archived: not in daily upload`
                : "Payment Done (Auto-Archived)",
              followUpDate: "",
              followUpTime: "",
              reminderEnabled: false,
              updatedAt: archiveTimestamp,
              pendingAmount: rec.pendingAmount ?? rec.defaultAmount,
            };
            nextByLoanId.set(key, archivedRec);
            archived += 1;

            newLogs.push({
              id: `auto-archive-${key}-${Date.now()}-${slug()}`,
              loanId: rec.loanId,
              userId: rec.userId,
              customerName: rec.customerName,
              callStatus: "Payment Done",
              remark: "Auto-Archived: not present in daily upload (customer likely settled)",
              followUpDate: "",
              followUpTime: "",
              updatedAt: archiveTimestamp,
              updatedBy: "System (Auto-Archive)",
            });
          }
        }

        setRecords(restrictToAllowedLenders(Array.from(nextByLoanId.values())));
        if (newLogs.length) {
          setInteractionLogs((prev) => mergeInteractionLogs(prev, newLogs));
        }

        const message =
          created || updated || archived
            ? `${created} new, ${updated} updated, ${archived} auto-archived, ${skipped} skipped${matchedWithoutLoanId ? `, ${matchedWithoutLoanId} matched without loanId` : ""}`
            : `No usable rows found. Check that the CSV has userId and collection columns.`;
        setLastUploadMessage(message);
        pushHistory({
          type: "collection",
          fileName: file.name,
          fileSize: file.size,
          lastModified: file.lastModified,
          processed: data.length,
          created,
          updated,
          skipped,
          message:
            matchedWithoutLoanId > 0
              ? `Matched ${matchedWithoutLoanId} records by fallback key`
              : undefined,
        });
      },
      error: (error) => {
        const message = `Upload failed: ${error.message}`;
        setLastUploadMessage(message);
        pushHistory({
          type: "collection",
          fileName: file.name,
          processed: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          message,
        });
      },
    });
  }

  function parseCustomerFile(file: File) {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: ({ data }) => {
        let updated = 0;
        let skipped = 0;
        const profilesByUserId = new Map<string, Record<string, unknown>>();

        for (const row of data) {
          const userId = valueFromRow(row, ["userId", "user_id", "customer_id", "customerId"]);
          if (userId) profilesByUserId.set(userId, row);
        }

        const nextRecords = records.map((record) => {
          const profile = profilesByUserId.get(record.userId);

          if (!profile) return record;

          const anchor = normalizedText(valueFromRow(profile, ["anchor", "anchorName", "anchorPerson"]));
          const mobile = normalizePhone(valueFromRow(profile, ["mobile", "phone", "mobileNumber"]));
          const alternateNumber = normalizePhone(valueFromRow(profile, ["alternateNumber", "alternateMobile", "alternate_mobile", "altMobile"]));
          const customerName = normalizedText(valueFromRow(profile, ["customerName", "customer", "name", "merchant", "merchantName"]));

          // FIELD PROTECTION: existing non-empty values are NEVER overwritten by customer CSV.
          // Only blank/missing fields get filled in.
          updated += 1;
          return {
            ...record,
            anchor: (record.anchor && record.anchor.trim())
              ? record.anchor
              : (anchor || ""),
            mobile: (record.mobile && record.mobile.trim())
              ? record.mobile
              : (mobile || ""),
            alternateNumber: (record.alternateNumber && record.alternateNumber.trim())
              ? record.alternateNumber
              : (alternateNumber || ""),
            customerName: (record.customerName && record.customerName.trim())
              ? record.customerName
              : (customerName || ""),
          };
        });

        setRecords(nextRecords);

        if (!data.length) skipped = 1;
        skipped += Math.max(0, data.length - profilesByUserId.size);
        const message = `${updated} profile rows mapped, ${skipped} skipped`;
        setLastUploadMessage(message);

        pushHistory({
          type: "customer",
          fileName: file.name,
          processed: data.length,
          created: 0,
          updated,
          skipped,
          message,
        });
      },
      error: (error) => {
        const message = `Customer upload failed: ${error.message}`;
        setLastUploadMessage(message);
        pushHistory({
          type: "customer",
          fileName: file.name,
          processed: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          message,
        });
      },
    });
  }

  function startEdit(record: CollectionRecord) {
    setEditingId(record.id);
    setDrafts((current) => ({
      ...current,
      [record.id]: {
        customerName: record.customerName,
        lender: record.lender,
        mobile: record.mobile,
        alternateNumber: record.alternateNumber,
        anchor: record.anchor,
        callStatus: record.callStatus || "Pending",
        remark: record.remark,
        followUpDate: record.followUpDate,
        followUpTime: record.followUpTime || "",
        reminderEnabled: record.reminderEnabled,
      },
    }));
  }

  function saveDraft(recordId: string) {
    const draft = drafts[recordId];
    if (!draft) return;

    const record = records.find((item) => item.id === recordId);
    if (!record || isLocked(record)) return;

    const paymentDone = draft.callStatus === "Payment Done";

    const editedFields = [...(record.manuallyEditedFields || [])];
    if (draft.customerName !== record.customerName && !editedFields.includes("customerName")) editedFields.push("customerName");
    if (draft.lender && draft.lender !== record.lender && !editedFields.includes("lender")) editedFields.push("lender");
    if (draft.mobile !== record.mobile && !editedFields.includes("mobile")) editedFields.push("mobile");
    if (draft.alternateNumber !== record.alternateNumber && !editedFields.includes("alternateNumber")) editedFields.push("alternateNumber");
    if (draft.anchor !== record.anchor && !editedFields.includes("anchor")) editedFields.push("anchor");

    const baseRecord = {
      ...record,
      customerName: draft.customerName,
      lender: draft.lender || record.lender,
      mobile: draft.mobile,
      alternateNumber: draft.alternateNumber,
      anchor: draft.anchor,
      manuallyEditedFields: editedFields,
    };
    const newRemark = (paymentDone ? "Payment Done" : draft.remark).trim();
    const finalRecord = newRemark
      ? appendRemarkToHistory(
          baseRecord,
          newRemark,
          draft.callStatus,
          user?.email || "Agent",
          draft.invoiceNumber,
          draft.partialPaymentAmount,
        ).updatedRecord
      : {
          ...baseRecord,
          callStatus: draft.callStatus,
          followUpDate: paymentDone ? "" : draft.followUpDate,
          followUpTime: paymentDone ? "" : draft.followUpTime || "",
          reminderEnabled: paymentDone ? false : draft.reminderEnabled,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || "Agent",
        };

    setRecords((current) => current.map((item) => (item.id === recordId ? finalRecord : item)));
    setInteractionLogs((prev) => mergeInteractionLogs(prev, [{
      id: `${finalRecord.id}-${finalRecord.updatedAt}-${slug()}`,
      loanId: finalRecord.loanId,
      userId: finalRecord.userId,
      customerName: finalRecord.customerName,
      callStatus: finalRecord.callStatus,
      remark: finalRecord.remark,
      followUpDate: finalRecord.followUpDate,
      followUpTime: finalRecord.followUpTime || "",
      updatedAt: finalRecord.updatedAt,
      updatedBy: user?.email || "Agent",
    }]));

    setEditingId("");
  }

  function saveFollowupGroup(groupKey: string, sourceIds: string[]) {
    const draft = draftsRef.current[groupKey];
    if (!draft) return;

    const timestamp = new Date().toISOString();
    const agent = user?.email || "Agent";
    const updatedRecords: CollectionRecord[] = [];

    const nextRecords = records.map((record) => {
      if (!sourceIds.includes(record.id) || isLocked(record)) return record;

      const paymentDone = draft.callStatus === "Payment Done";

      const editedFields = [...(record.manuallyEditedFields || [])];
      if (draft.customerName !== record.customerName && !editedFields.includes("customerName")) editedFields.push("customerName");
      if (draft.lender && draft.lender !== record.lender && !editedFields.includes("lender")) editedFields.push("lender");
      if (draft.mobile !== record.mobile && !editedFields.includes("mobile")) editedFields.push("mobile");
      if (draft.alternateNumber !== record.alternateNumber && !editedFields.includes("alternateNumber")) editedFields.push("alternateNumber");
      if (draft.anchor !== record.anchor && !editedFields.includes("anchor")) editedFields.push("anchor");

      const baseRecord = {
        ...record,
        customerName: draft.customerName,
        lender: draft.lender || record.lender,
        mobile: draft.mobile,
        alternateNumber: draft.alternateNumber,
        anchor: draft.anchor,
        manuallyEditedFields: editedFields,
      };
      const newRemark = (paymentDone ? "Payment Done" : draft.remark).trim();
      const updated = newRemark
        ? appendRemarkToHistory(
            baseRecord,
            newRemark,
            draft.callStatus,
            agent,
            draft.invoiceNumber,
            draft.partialPaymentAmount,
            timestamp,
          ).updatedRecord
        : {
            ...baseRecord,
            callStatus: draft.callStatus,
            followUpDate: paymentDone ? "" : draft.followUpDate,
            followUpTime: paymentDone ? "" : draft.followUpTime || "",
            reminderEnabled: paymentDone ? false : !!draft.reminderEnabled,
            updatedAt: timestamp,
            updatedBy: agent,
          };

      updatedRecords.push(updated);
      return updated;
    });

    if (!updatedRecords.length) return;

    setRecords(nextRecords);

    const primaryRecord = updatedRecords[0];
    setInteractionLogs((prev) => mergeInteractionLogs(prev, [{
      id: `${groupKey}-${timestamp}-${slug()}`,
      loanId: primaryRecord.loanId,
      userId: primaryRecord.userId,
      customerName: primaryRecord.customerName,
      callStatus: primaryRecord.callStatus,
      remark: primaryRecord.remark,
      followUpDate: primaryRecord.followUpDate,
      followUpTime: primaryRecord.followUpTime || "",
      updatedAt: timestamp,
      updatedBy: agent,
    }]));
  }

  function beginFollowupEdit(group: FollowupGroup) {
    setEditingGroups((current) => ({ ...current, [group.groupKey]: true }));
    setDrafts((current) => ({
      ...current,
      [group.groupKey]: getGroupDraft(group),
    }));
  }

  function cancelFollowupEdit(groupKey: string) {
    setEditingGroups((current) => ({ ...current, [groupKey]: false }));
  }

  function toggleFollowupEditMode() {
    setFollowupEditMode((current) => {
      const next = !current;
      if (!next) {
        setEditingGroups({});
      } else {
        const nextEditing: Record<string, boolean> = {};
        const nextDrafts: Record<string, Draft> = {};
        for (const group of followupGroups) {
          nextEditing[group.groupKey] = true;
          nextDrafts[group.groupKey] = getGroupDraft(group);
        }
        setEditingGroups(nextEditing);
        setDrafts((currentDrafts) => ({ ...currentDrafts, ...nextDrafts }));
      }
      return next;
    });
  }

  function updateFollowupDraft(group: FollowupGroup, patch: Partial<Draft>) {
    const next = {
      ...getGroupDraft(group),
      ...patch,
    };
    if (next.callStatus === "Payment Done") {
      next.remark = "Payment Done";
      next.followUpDate = "";
      next.reminderEnabled = false;
    } else if (patch.followUpDate !== undefined && patch.followUpDate) {
      next.reminderEnabled = true;
    }

    setDrafts((current) => ({
      ...current,
      [group.groupKey]: next,
    }));
  }

  function submitFollowupEdit(group: FollowupGroup) {
    saveFollowupGroup(group.groupKey, group.sourceIds);
    if (!followupEditMode) {
      setEditingGroups((current) => ({ ...current, [group.groupKey]: false }));
    }
  }

  const navItems: Array<{ key: Page; label: string; icon: typeof LayoutDashboard }> = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "followup", label: "Daily Follow-up", icon: PhoneCall },
    { key: "reminders", label: "Reminders", icon: BellRing },
    { key: "records", label: "Records", icon: FileSpreadsheet },
    { key: "upload", label: "Upload", icon: Upload },
    ...(user?.role === "admin" ? [{ key: "users" as Page, label: "Users", icon: Users }] : []),
  ];

  if (!token || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 relative overflow-hidden text-slate-100">
        {/* Animated background highlights */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px]" />
        
        <div className="w-full max-w-md space-y-8 relative z-10">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400 text-slate-950 shadow-2xl shadow-cyan-400/20">
              <Database className="h-8 w-8 animate-pulse" />
            </div>
            <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
              {loginMode === "login" ? "Collection Risk Console" : "Reset Password"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {loginMode === "login" 
                ? "Please sign in to access portfolio controls" 
                : "Enter your email to receive a temporary login password"}
            </p>
          </div>

          <div className="rounded-3xl bg-slate-900/60 border border-white/10 p-8 shadow-2xl backdrop-blur-xl">
            {loginMode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-6">
                {loginError && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-center gap-2">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}
                
                {forgotSuccess && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{forgotSuccess}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-cyan-400" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@kredmint.com"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:bg-white/10 focus:ring-1 focus:ring-cyan-400"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <Key className="h-4 w-4 text-cyan-400" />
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMode("forgot");
                        setForgotError("");
                        setForgotSuccess("");
                      }}
                      className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition outline-none cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:bg-white/10 focus:ring-1 focus:ring-cyan-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full rounded-2xl bg-cyan-400 py-3.5 font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-300 hover:shadow-cyan-400/30 active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-500 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loginLoading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Sign In
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-6">
                {forgotError && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-center gap-2">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>{forgotError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-cyan-400" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@kredmint.com"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:bg-white/10 focus:ring-1 focus:ring-cyan-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full rounded-2xl bg-cyan-400 py-3.5 font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-300 hover:shadow-cyan-400/30 active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-500 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {forgotLoading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  ) : (
                    <>
                      <Key className="h-4 w-4" />
                      Send Reset Instructions
                    </>
                  )}
                </button>

                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode("login");
                      setForgotError("");
                    }}
                    className="text-sm font-semibold text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5 mx-auto outline-none cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
          
          <div className="text-center text-xs text-slate-500">
            Powered by Supabase Security Protocol • Dual Synchronized DB
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Drawer Content */}
          <div className="relative flex w-full max-w-xs flex-col bg-slate-950 text-white p-6 shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 shadow-md">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Collection Risk</p>
                  <h1 className="text-base font-bold">Ops Console</h1>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActivePage(item.key);
                      if (item.key === "dashboard") {
                        setMobileShowDashboardDetails(true);
                      } else {
                        setMobileShowDashboardDetails(false);
                      }
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                      isActive
                        ? "bg-cyan-400 text-slate-950 font-bold shadow-lg"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                    <span className="text-sm font-medium flex-1">{item.label}</span>
                    {item.key === "reminders" && activeRemindersCount > 0 && (
                      <span className={`inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full px-1.5 text-xs font-bold transition-all ${
                        isActive ? "bg-slate-900 text-cyan-400" : "bg-cyan-400 text-slate-950 animate-pulse"
                      }`}>
                        {activeRemindersCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-white/10 pt-5 mt-auto">
              <div className="rounded-xl bg-white/5 p-3.5 text-xs text-slate-300">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Logged in as</p>
                <p className="mt-1 font-semibold truncate" title={user.email}>{user.email}</p>
                <p className="text-[10px] text-cyan-400 capitalize mt-0.5">{user.role}</p>
                <button
                  onClick={handleLogout}
                  className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-white lg:flex">
          <div className="border-b border-white/10 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Collection Risk</p>
                <h1 className="text-xl font-bold tracking-tight">Ops Console</h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-4 py-5">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  setActivePage(item.key);
                  setMobileShowDashboardDetails(false);
                }}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                  activePage === item.key
                    ? "bg-cyan-400 text-slate-950 shadow-lg"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium flex-1">{item.label}</span>
                {item.key === "reminders" && activeRemindersCount > 0 && (
                  <span className={`inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full px-1.5 text-xs font-bold transition-all ${
                    activePage === "reminders" ? "bg-slate-900 text-cyan-400" : "bg-cyan-400 text-slate-950 animate-pulse"
                  }`}>
                    {activeRemindersCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="border-t border-white/10 px-5 py-4">
            <div className="mb-4 rounded-2xl bg-white/5 p-3.5 text-sm text-slate-200">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Logged in as</p>
              <p className="mt-1 font-semibold truncate" title={user.email}>{user.email}</p>
              <p className="text-xs text-cyan-400 capitalize mt-0.5">{user.role}</p>
              <button
                onClick={handleLogout}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-xs font-semibold text-white transition hover:bg-rose-600 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
              <div className="flex items-center gap-3">
                {/* Mobile Menu Toggle Button */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition lg:hidden cursor-pointer"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Collection Risk</p>
                  <h2 className="text-2xl font-bold tracking-tight">
                    {navItems.find((item) => item.key === activePage)?.label}
                  </h2>
                </div>
              </div>

              <div className={`flex flex-wrap items-center gap-3 ${
                activePage === "dashboard" && !mobileShowDashboardDetails
                  ? "hidden lg:flex"
                  : "flex"
              }`}>
                <div className="relative min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search user, lender, anchor, mobile"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white"
                  />
                </div>

                <select
                  value={lenderFilter}
                  onChange={(event) => setLenderFilter(event.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none"
                >
                  {lenders.map((lender) => (
                    <option key={lender} value={lender}>
                      {lender}
                    </option>
                  ))}
                </select>

                <select
                  value={anchorFilter}
                  onChange={(event) => setAnchorFilter(event.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none"
                >
                  {anchors.map((anchor) => (
                    <option key={anchor} value={anchor}>
                      {anchor}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none"
                >
                  <option value="Active">Active only</option>
                  <option value="All">All status (inc. Closed)</option>
                  {callStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </header>

            <div className="space-y-6 px-5 py-6 md:px-8">
            {lastUploadMessage && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {lastUploadMessage}
              </div>
            )}
            {activePage === "dashboard" && (
              <>
                {/* Responsive Quick Navigation Hub */}
                {!mobileShowDashboardDetails ? (
                  <div className="block lg:hidden mb-6">
                    <div className="bg-slate-900 text-white rounded-3xl border border-white/10 p-6 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-[-20%] right-[-20%] w-[40%] h-[40%] rounded-full bg-cyan-500/10 blur-[80px]" />
                      <h3 className="text-base font-bold tracking-tight text-white mb-1 flex items-center gap-2">
                        <LayoutDashboard className="h-4.5 w-4.5 text-cyan-400" />
                        Quick Navigation Hub
                      </h3>
                      <p className="text-[11px] text-slate-400 mb-5">Tap any section to redirect instantly</p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {navItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.key}
                              onClick={() => {
                                if (item.key === "dashboard") {
                                  setMobileShowDashboardDetails(true);
                                } else {
                                  setActivePage(item.key);
                                }
                                setMobileMenuOpen(false);
                              }}
                              className="group flex flex-col items-start p-4 rounded-2xl border bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition cursor-pointer text-left"
                            >
                              <div className="p-2.5 rounded-xl mb-3 bg-white/10 text-white group-hover:bg-cyan-400 group-hover:text-slate-950 transition-all duration-300">
                                <Icon className="h-5 w-5" />
                              </div>
                              <span className="text-sm font-semibold tracking-tight leading-none text-white">{item.label}</span>
                              <span className="text-[10px] text-slate-400 mt-1 font-medium group-hover:text-slate-300">Go to section →</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Dashboard Details Wrapper: Hides everything except the Hub on mobile unless showDetails is true */}
                <div className={`space-y-6 ${!mobileShowDashboardDetails ? "hidden lg:block" : "block"}`}>
                  {mobileShowDashboardDetails && (
                    <button
                      onClick={() => setMobileShowDashboardDetails(false)}
                      className="flex items-center gap-2 text-xs font-bold text-cyan-700 hover:text-cyan-800 bg-cyan-50 px-4 py-2.5 rounded-2xl border border-cyan-100 mb-2 transition active:scale-[0.98] cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back to Navigation Hub</span>
                    </button>
                  )}

                  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard icon={Database} label="Total Loan Amount" value={formatCurrency(summary.totalLoanAmount)} />
                  <MetricCard icon={ArrowUpRight} label="Default Amount" value={formatCurrency(summary.totalDefaultAmount)} />
                  <MetricCard icon={Users} label="Customers" value={String(summary.customers)} />
                  <MetricCard icon={ActivitySquare} label="Avg Risk Score" value={`${summary.avgRisk}`} />
                  <MetricCard icon={BellRing} label="Reminders" value={String(summary.remindersCount)} />
                </section>

                {/* Agent Performance & Closure Efficiency Analytics Suite */}
                <Panel title="📈 Agent Performance & Case Closure Analytics">
                  <div className="space-y-6">
                    {/* Agent Selection Filter */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Select Collection Agent</div>
                      </div>
                      <div className="w-full max-w-xs">
                        <select
                          value={selectedPerformanceAgent}
                          onChange={(e) => setSelectedPerformanceAgent(e.target.value)}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none shadow-sm focus:border-cyan-500 transition"
                        >
                          <option value="All Agents">All Agents (Total Suite)</option>
                          {distinctAgents.map((ag) => (
                            <option key={ag} value={ag}>{ag}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Performance Metrics Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      
                      {/* Case Closure Rate Circular Progress */}
                      <div className="flex items-center gap-4 bg-slate-50 border border-slate-200/60 rounded-2xl p-5">
                        <div className="relative flex items-center justify-center h-16 w-16">
                          <svg className="w-16 h-16 transform -rotate-90">
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              stroke="currentColor"
                              strokeWidth="5"
                              fill="transparent"
                              className="text-slate-200"
                            />
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              stroke="currentColor"
                              strokeWidth="5"
                              fill="transparent"
                              strokeDasharray={2 * Math.PI * 26}
                              strokeDashoffset={2 * Math.PI * 26 * (1 - agentClosureStats.efficiencyRate / 100)}
                              className="text-cyan-600 transition-all duration-500"
                            />
                          </svg>
                          <span className="absolute text-sm font-bold text-slate-900">{agentClosureStats.efficiencyRate}%</span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closure Rate (Efficiency)</div>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">{agentClosureStats.totalClosedCount} / {agentClosureStats.totalAssignedCount} cases</div>
                        </div>
                      </div>

                      {/* Revenue Collected */}
                      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collected Revenue</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 tracking-tight">
                          {formatCurrency(agentClosureStats.totalCollectedAmount)}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">From resolved "Payment Done" cases</div>
                      </div>

                      {/* Pending Exposure */}
                      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Exposure</div>
                        <div className="text-2xl font-black text-rose-600 mt-1 tracking-tight">
                          {formatCurrency(agentClosureStats.pendingExposureAmount)}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">Assigned remaining to collect</div>
                      </div>

                      {/* Total Logged Follow-ups */}
                      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Follow-ups</div>
                        <div className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
                          {agentClosureStats.totalFollowupsMade}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">Logged interaction events</div>
                      </div>

                    </div>

                    {/* Progress details */}
                    <div className="mt-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-500 uppercase mb-2">
                        <span>Recovery Progress Bar</span>
                        <span>{agentClosureStats.efficiencyRate}% closed</span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                          style={{ width: `${agentClosureStats.efficiencyRate}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-400 mt-2 font-medium">
                        <span>Resolved Target: {agentClosureStats.totalClosedCount}</span>
                        <span>Total Assigned: {agentClosureStats.totalAssignedCount}</span>
                      </div>
                    </div>

                  </div>
                </Panel>

                <section className="grid gap-6 xl:grid-cols-2">
                  <Panel title="Default by Lender" subtitle="">
                    <div className="mb-5 grid gap-3 md:grid-cols-3">
                      {lenderExposure.map(([label, value]) => {
                        const percent = Math.round((value / (summary.totalDefaultAmount || 1)) * 100);
                        return (
                          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                            <div className="mt-3 text-xl font-bold tracking-tight">{formatCurrency(value)}</div>
                            <div className="mt-2 h-2 rounded-full bg-slate-200">
                              <div className="h-2 rounded-full bg-slate-950" style={{ width: `${Math.max(8, percent)}%` }} />
                            </div>
                            <div className="mt-2 text-xs text-slate-500">{percent}% share</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="space-y-4">
                      {lenderExposure.map(([label, value]) => (
                        <BarRow
                          key={label}
                          label={label}
                          value={value}
                          max={lenderExposure[0]?.[1] || 1}
                          formatter={formatCurrency}
                        />
                      ))}
                    </div>
                  </Panel>

                  <Panel title="Risk Mix" subtitle="">
                    <div className="mb-6 flex h-5 overflow-hidden rounded-full bg-slate-100">
                      {riskBands.map((band) => (
                        <div
                          key={band.label}
                          className={band.color}
                          style={{ width: `${Math.max(6, Math.round((band.count / (filteredRecords.length || 1)) * 100))}%` }}
                        />
                      ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {riskBands.map((band) => (
                        <div key={band.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center gap-2">
                            <span className={`h-3 w-3 rounded-full ${band.color}`} />
                            <span className="text-sm font-medium">{band.label}</span>
                          </div>
                          <div className="mt-4 text-3xl font-bold tracking-tight">{band.count}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {Math.round((band.count / (filteredRecords.length || 1)) * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
                  <Panel title="Call Status" subtitle="">
                    <div className="space-y-3">
                      {statusBreakdown.map(([label, count]) => (
                        <BarRow key={label} label={label} value={count} max={filteredRecords.length || 1} />
                      ))}
                    </div>
                  </Panel>

                  <Panel title="Top 10" subtitle="">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-slate-500">
                          <tr>
                            <th className="pb-3 font-medium">User</th>
                            <th className="pb-3 font-medium">Customer</th>
                            <th className="pb-3 font-medium">Lender</th>
                            <th className="pb-3 font-medium">Loans</th>
                            <th className="pb-3 font-medium">Default</th>
                            <th className="pb-3 font-medium">Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topCustomers.map((customer) => (
                            <tr key={customer.userId} className="border-t border-slate-100">
                              <td className="py-3 font-semibold">
                                <button
                                  onClick={() => setSelectedUserId(customer.userId)}
                                  className="text-cyan-600 hover:text-cyan-700 hover:underline transition font-semibold"
                                >
                                  {customer.userId}
                                </button>
                              </td>
                              <td className="py-3">{customer.customerName || "-"}</td>
                              <td className="py-3">{customer.lender || "-"}</td>
                              <td className="py-3">{customer.loanCount}</td>
                              <td className="py-3">{formatCurrency(customer.totalDefaultAmount)}</td>
                              <td className="py-3">{customer.avgRisk}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </section>
                </div>
              </>
            )}

            {activePage === "followup" && (
              <>
                <section className="hidden md:grid gap-4 md:grid-cols-4">
                  <MetricCard
                    icon={PhoneCall}
                    label="Handled Today"
                    value={`${formatCurrency(dailyHandledAmount)} / ${dailyHandledRecords.length} ${dailyHandledRecords.length === 1 ? "loan" : "loans"}`}
                  />
                  <button
                    onClick={() => setShowPaymentDoneList((v) => !v)}
                    className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm text-left hover:bg-emerald-100 transition active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-emerald-700">Payment Done</p>
                      <div className="rounded-2xl bg-emerald-100 p-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      </div>
                    </div>
                    <p className="mt-4 text-2xl font-bold tracking-tight text-emerald-800">{summary.paymentDoneCount}</p>
                    <p className="text-xs text-emerald-600 mt-1">Click to view all closures</p>
                  </button>
                  <MetricCard icon={Clock3} label="Pending Queue" value={String(filteredRecords.filter((record) => record.callStatus !== "Payment Done" && record.status !== "Closed" && record.status !== "Payment Clear").length)} />
                  <MetricCard icon={BellRing} label="Reminder Queue" value={String(reminderQueue.length)} />
                </section>

                {/* Payment Done List Panel */}
                {showPaymentDoneList && (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <h3 className="text-base font-bold text-emerald-800">Payment Done — All Closed Cases</h3>
                        <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{summary.paymentDoneCount} records</span>
                      </div>
                      <button
                        onClick={() => setShowPaymentDoneList(false)}
                        className="rounded-full p-1.5 text-emerald-600 hover:bg-emerald-100 transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-slate-500">
                          <tr>
                            <th className="pb-3 font-medium">User</th>
                            <th className="pb-3 font-medium">Customer</th>
                            <th className="pb-3 font-medium">Lender</th>
                            <th className="pb-3 font-medium">Default</th>
                            <th className="pb-3 font-medium">Closed On</th>
                            <th className="pb-3 font-medium">Timeline</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records
                            .filter((r) => r.callStatus === "Payment Done" || r.status === "Closed" || r.status === "Payment Clear")
                            .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
                            .map((record) => (
                              <tr key={record.id} className="border-t border-emerald-100 hover:bg-emerald-50/50 transition">
                                <td className="py-3 font-semibold">
                                  <button
                                    onClick={() => setSelectedUserId(record.userId)}
                                    className="text-cyan-600 hover:text-cyan-700 hover:underline transition font-semibold"
                                  >
                                    {record.userId}
                                  </button>
                                </td>
                                <td className="py-3">{record.customerName || "-"}</td>
                                <td className="py-3 text-xs text-slate-500">{record.lender || "-"}</td>
                                <td className="py-3 font-semibold text-emerald-700">{formatCurrency(record.defaultAmount)}</td>
                                <td className="py-3 text-xs text-slate-500">{formatDate(record.updatedAt)}</td>
                                <td className="py-3">
                                  <button
                                    onClick={() => setSelectedUserId(record.userId)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 transition"
                                  >
                                    <History className="h-3 w-3" />
                                    View Timeline
                                  </button>
                                </td>
                              </tr>
                            ))}
                          {summary.paymentDoneCount === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400">No payment done records yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <Panel title="Daily Follow-up" subtitle="">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={followupEditMode}
                        onChange={toggleFollowupEditMode}
                      />
                      Edit mode
                    </label>
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="pb-3 font-medium">User</th>
                          <th className="pb-3 font-medium">Customer</th>
                          <th className="pb-3 font-medium">Lender</th>
                          <th className="pb-3 font-medium">Anchor</th>
                          <th className="pb-3 font-medium">Contact</th>
                          <th className="pb-3 font-medium">Amount</th>
                          <th className="pb-3 font-medium">Remarks</th>
                          <th className="pb-3 font-medium">Follow-up</th>
                          <th className="pb-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {followupGroups.map((group) => {
                          const draft = getGroupDraft(group);
                          const editing = followupEditMode || !!editingGroups[group.groupKey];
                          const locked = group.sourceIds.every((id) => {
                            const record = records.find((item) => item.id === id);
                            return record ? isLocked(record) : false;
                          });

                          return (
                            <tr
                              key={group.groupKey}
                              className={`border-t border-slate-100 align-top ${
                                draft.callStatus === "Payment Done" ? "bg-emerald-50" : ""
                              }`}
                            >
                              <td className="py-3 font-semibold">
                                <button
                                  onClick={() => setSelectedUserId(group.userId)}
                                  className="text-cyan-600 hover:text-cyan-700 hover:underline transition font-semibold"
                                >
                                  {group.userId}
                                </button>
                              </td>
                              <td className="py-3">
                                {editing ? (
                                  <input
                                    type="text"
                                    value={draft.customerName || ""}
                                    onChange={(e) => updateFollowupDraft(group, { customerName: e.target.value })}
                                    className="w-32 rounded-xl border border-slate-200 px-2 py-1 text-sm outline-none focus:border-cyan-400"
                                  />
                                ) : (
                                  group.customerName || "-"
                                )}
                              </td>
                              <td className="py-3">
                                {editing ? (
                                  <input
                                    type="text"
                                    value={draft.lender || ""}
                                    onChange={(e) => updateFollowupDraft(group, { lender: e.target.value })}
                                    className="w-32 rounded-xl border border-slate-200 px-2 py-1 text-sm outline-none focus:border-cyan-400"
                                  />
                                ) : (
                                  group.lender || "-"
                                )}
                              </td>
                              <td className="py-3">
                                {editing ? (
                                  <input
                                    type="text"
                                    value={draft.anchor || ""}
                                    onChange={(e) => updateFollowupDraft(group, { anchor: e.target.value })}
                                    className="w-32 rounded-xl border border-slate-200 px-2 py-1 text-sm outline-none focus:border-cyan-400"
                                  />
                                ) : (
                                  group.anchor || "-"
                                )}
                              </td>
                              <td className="py-3">
                                {editing ? (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      value={draft.mobile || ""}
                                      onChange={(e) => updateFollowupDraft(group, { mobile: e.target.value })}
                                      placeholder="Primary Mobile"
                                      className="w-32 rounded-xl border border-slate-200 px-2 py-1 text-xs outline-none focus:border-cyan-400 block"
                                    />
                                    <input
                                      type="text"
                                      value={draft.alternateNumber || ""}
                                      onChange={(e) => updateFollowupDraft(group, { alternateNumber: e.target.value })}
                                      placeholder="Alt Mobile"
                                      className="w-32 rounded-xl border border-slate-200 px-2 py-1 text-xs outline-none focus:border-cyan-400 block"
                                    />
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {group.mobile ? (
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-900">{group.mobile}</span>
                                        <div className="flex gap-1">
                                          <a
                                            href={`tel:${group.mobile}`}
                                            className="rounded-lg border border-slate-200 p-1 text-slate-700 hover:bg-slate-50 transition"
                                            title="Call Primary"
                                          >
                                            <Phone className="h-3.5 w-3.5" />
                                          </a>
                                          <a
                                            href={getWhatsAppLink(group.mobile)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-lg border border-slate-200 p-1 text-emerald-700 hover:bg-emerald-50 transition"
                                            title="WhatsApp Primary"
                                          >
                                            <MessageCircle className="h-3.5 w-3.5" />
                                          </a>
                                          <a
                                            href={`https://console.kredmint.in/merchant/dashboard/?userId=${group.userId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded-lg border border-slate-200 p-1 text-cyan-600 hover:bg-cyan-50 transition"
                                            title="Kredmint Console"
                                          >
                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                          </a>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                    {group.alternateNumber ? (
                                      <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5">
                                        <span className="text-xs text-slate-500">{group.alternateNumber}</span>
                                        <div className="flex gap-1">
                                          <a
                                            href={`tel:${group.alternateNumber}`}
                                            className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 transition"
                                            title="Call Alternate"
                                          >
                                            <Phone className="h-3.5 w-3.5" />
                                          </a>
                                          <a
                                            href={getWhatsAppLink(group.alternateNumber)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-lg border border-slate-200 p-1 text-emerald-600 hover:bg-emerald-50 transition"
                                            title="WhatsApp Alternate"
                                          >
                                            <MessageCircle className="h-3.5 w-3.5" />
                                          </a>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </td>
                              <td className="py-3">
                                <div className="font-semibold">{formatCurrency(group.totalDefaultAmount)}</div>
                                {group.pendingDays !== undefined && group.pendingDays > 0 && (
                                  <div className="text-xs text-rose-600 font-semibold whitespace-nowrap mt-0.5">
                                    {group.pendingDays} days pending
                                  </div>
                                )}
                                <div className="text-xs text-slate-500">
                                  {formatCurrency(group.totalLoanAmount)} / {group.loanCount} loans
                                </div>
                              </td>
                              <td className="py-3">
                                {editing ? (
                                  <textarea
                                    value={draft.remark || ""}
                                    disabled={locked || draft.callStatus === "Payment Done"}
                                    onChange={(event) => updateFollowupDraft(group, { remark: event.target.value })}
                                    className="min-h-20 w-52 rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                                    placeholder="Remarks"
                                  />
                                ) : (
                                  <div>
                                    <StatusPill value={group.callStatus || "Pending"} />
                                    {/* Remarks are only shown in the timeline (click user ID), not here */}
                                  </div>
                                )}
                              </td>
                              <td className="py-3">
                                {editing ? (
                                  <div className="space-y-2">
                                    <select
                                      value={draft.callStatus || "Pending"}
                                      disabled={locked}
                                      onChange={(event) => updateFollowupDraft(group, { callStatus: event.target.value })}
                                      className="w-40 rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                                    >
                                      {callStatuses.map((status) => (
                                        <option key={status} value={status}>
                                          {status}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="date"
                                      disabled={locked || draft.callStatus === "Payment Done"}
                                      value={draft.followUpDate || ""}
                                      onChange={(event) => updateFollowupDraft(group, { followUpDate: event.target.value })}
                                      className="w-40 rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100 block"
                                    />
                                    <input
                                      type="time"
                                      disabled={locked || draft.callStatus === "Payment Done"}
                                      value={draft.followUpTime || ""}
                                      onChange={(event) => updateFollowupDraft(group, { followUpTime: event.target.value })}
                                      className="w-40 rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100 block mt-1.5"
                                    />
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                      <input
                                        type="checkbox"
                                        disabled={locked || draft.callStatus === "Payment Done"}
                                        checked={draft.reminderEnabled || false}
                                        onChange={(event) => updateFollowupDraft(group, { reminderEnabled: event.target.checked })}
                                      />
                                      Reminder on
                                    </label>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-semibold text-slate-800">{formatDateTime(group.followUpDate, group.followUpTime)}</div>
                                    <div className="text-xs text-slate-500">{group.reminderEnabled ? "Reminder active" : "Reminder off"}</div>
                                  </div>
                                )}
                              </td>
                              <td className="py-3">
                                {editing ? (
                                  <div className="flex flex-col gap-2">
                                    <button
                                      onClick={() => submitFollowupEdit(group)}
                                      disabled={locked}
                                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm text-white disabled:bg-slate-300"
                                    >
                                      Save
                                    </button>
                                    {!followupEditMode ? (
                                      <button
                                        onClick={() => cancelFollowupEdit(group.groupKey)}
                                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                      >
                                        Cancel
                                      </button>
                                    ) : null}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => beginFollowupEdit(group)}
                                    disabled={locked}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm disabled:bg-slate-100"
                                  >
                                    <Pencil className="h-4 w-4" />
                                    {locked ? "Locked" : "Edit"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-4 md:hidden">
                    {followupGroups.map((group) => {
                      const draft = getGroupDraft(group);
                      const editing = followupEditMode || !!editingGroups[group.groupKey];
                      const locked = group.sourceIds.every((id) => {
                        const record = records.find((item) => item.id === id);
                        return record ? isLocked(record) : false;
                      });

                      return (
                        <div
                          key={group.groupKey}
                          className={`relative overflow-hidden rounded-3xl border-2 bg-white p-5 transition-all duration-300 shadow-md ${
                            draft.callStatus === "Payment Done"
                              ? "border-emerald-500 bg-gradient-to-br from-emerald-50/40 via-white to-white"
                              : draft.callStatus === "Promise To Pay"
                              ? "border-amber-300"
                              : "border-slate-200/80"
                          }`}
                        >
                          {/* Card Header Segment */}
                          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr text-xs font-bold text-white shadow-sm ${
                                draft.callStatus === "Payment Done" ? "from-emerald-400 to-teal-500" : "from-cyan-500 to-blue-600"
                              }`}>
                                {(group.customerName || group.userId || "U").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block leading-none mb-1">Customer / ID</span>
                                <div className="text-sm font-black text-slate-900 leading-tight">{group.customerName || "-"}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="text-xs font-semibold text-slate-500">{group.userId}</div>
                                  {group.pendingDays !== undefined && group.pendingDays > 0 && (
                                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md whitespace-nowrap leading-none">
                                      {group.pendingDays}d pending
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {!editing && !followupEditMode ? (
                              <button
                                onClick={() => beginFollowupEdit(group)}
                                disabled={locked}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition disabled:opacity-50"
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                {locked ? "Locked" : "Edit"}
                              </button>
                            ) : null}
                          </div>

                          {/* Lender & Anchor Segment */}
                          <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Lender</span>
                              <span className="font-semibold text-slate-800">{group.lender}</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Anchor Partner</span>
                              <span className="font-semibold text-slate-800">{group.anchor || "-"}</span>
                            </div>
                          </div>

                          {/* Financial Exposure Segment */}
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Default</span>
                              <span className="mt-1 block text-base font-black text-slate-900 leading-none">{formatCurrency(group.totalDefaultAmount)}</span>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Loans</span>
                              <span className="mt-1 block text-base font-black text-slate-900 leading-none">{group.loanCount}</span>
                            </div>
                          </div>

                          {/* Direct Action Contacts Segment */}
                          <div className="mt-4 space-y-2.5 rounded-2xl bg-slate-50/50 p-3.5 border border-slate-100/80">
                            {group.mobile ? (
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">Primary Contact</span>
                                  <span className="text-sm font-bold text-slate-800">{group.mobile}</span>
                                </div>
                                <div className="flex gap-2">
                                  <a
                                    href={`tel:${group.mobile}`}
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 transition shadow-sm"
                                    title="Call Primary"
                                  >
                                    <Phone className="h-4 w-4" />
                                  </a>
                                  <a
                                    href={getWhatsAppLink(group.mobile)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 active:scale-95 transition shadow-sm"
                                    title="WhatsApp Primary"
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </a>
                                  <a
                                    href={`https://console.kredmint.in/merchant/dashboard/?userId=${group.userId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-cyan-200 text-cyan-600 hover:bg-cyan-50 active:scale-95 transition shadow-sm"
                                    title="Kredmint Console"
                                  >
                                    <ArrowUpRight className="h-4 w-4" />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400 italic">No primary number listed</div>
                            )}

                            {group.alternateNumber ? (
                              <div className="flex items-center justify-between gap-2 border-t border-slate-200/60 pt-2.5">
                                <div>
                                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">Alternate Contact</span>
                                  <span className="text-xs font-semibold text-slate-600">{group.alternateNumber}</span>
                                </div>
                                <div className="flex gap-2">
                                  <a
                                    href={`tel:${group.alternateNumber}`}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 active:scale-95 transition shadow-sm"
                                    title="Call Alternate"
                                  >
                                    <Phone className="h-3.5 w-3.5" />
                                  </a>
                                  <a
                                    href={getWhatsAppLink(group.alternateNumber)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-emerald-600 hover:bg-emerald-50 active:scale-95 transition shadow-sm"
                                    title="WhatsApp Alternate"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {/* Remarks / Action Editing Form Segment */}
                          {editing ? (
                            <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer Name</label>
                                  <input
                                    type="text"
                                    value={draft.customerName || ""}
                                    onChange={(e) => updateFollowupDraft(group, { customerName: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-cyan-400 focus:bg-white transition"
                                    placeholder="Customer Name"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Anchor Partner</label>
                                  <input
                                    type="text"
                                    value={draft.anchor || ""}
                                    onChange={(e) => updateFollowupDraft(group, { anchor: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-cyan-400 focus:bg-white transition"
                                    placeholder="Anchor Partner"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1 col-span-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Lender</label>
                                  <input
                                    type="text"
                                    value={draft.lender || ""}
                                    onChange={(e) => updateFollowupDraft(group, { lender: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-cyan-400 focus:bg-white transition"
                                    placeholder="Lender"
                                  />
                                </div>
                                <div className="space-y-1 col-span-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Primary Mobile</label>
                                  <input
                                    type="text"
                                    value={draft.mobile || ""}
                                    onChange={(e) => updateFollowupDraft(group, { mobile: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-cyan-400 focus:bg-white transition"
                                    placeholder="Primary Mobile"
                                  />
                                </div>
                                <div className="space-y-1 col-span-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Alternate Mobile</label>
                                  <input
                                    type="text"
                                    value={draft.alternateNumber || ""}
                                    onChange={(e) => updateFollowupDraft(group, { alternateNumber: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-cyan-400 focus:bg-white transition"
                                    placeholder="Alt Mobile"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Call Status</label>
                                <select
                                  value={draft.callStatus || "Pending"}
                                  disabled={locked}
                                  onChange={(event) => updateFollowupDraft(group, { callStatus: event.target.value })}
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs focus:border-cyan-400 focus:bg-white transition"
                                >
                                  {callStatuses.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Remarks / Notes</label>
                                <textarea
                                  value={draft.remark || ""}
                                  disabled={locked || draft.callStatus === "Payment Done"}
                                  onChange={(event) => updateFollowupDraft(group, { remark: event.target.value })}
                                  className="min-h-16 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:border-cyan-400 focus:bg-white transition disabled:bg-slate-100"
                                  placeholder="Add call remarks here..."
                                />
                              </div>

                              {/* Partial Payment Fields */}
                              {draft.callStatus === "Partial Payment" && (
                                <div className="grid grid-cols-2 gap-3 bg-amber-50/30 border border-amber-200/40 rounded-xl p-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Invoice Number</label>
                                    <input
                                      type="text"
                                      value={draft.invoiceNumber || ""}
                                      disabled={locked}
                                      onChange={(event) => updateFollowupDraft(group, { invoiceNumber: event.target.value })}
                                      className="h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-xs outline-none focus:border-amber-400 focus:bg-amber-50/50 transition disabled:bg-slate-100"
                                      placeholder="Invoice #"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Amount Paid (₹)</label>
                                    <input
                                      type="number"
                                      value={draft.partialPaymentAmount || ""}
                                      disabled={locked}
                                      onChange={(event) => updateFollowupDraft(group, { partialPaymentAmount: event.target.value ? Number(event.target.value) : undefined })}
                                      className="h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-xs outline-none focus:border-amber-400 focus:bg-amber-50/50 transition disabled:bg-slate-100"
                                      placeholder="Amount"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Side-by-Side Date and Time Picker */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Reminder Date</label>
                                  <input
                                    type="date"
                                    disabled={locked || draft.callStatus === "Payment Done"}
                                    value={draft.followUpDate || ""}
                                    onChange={(event) => updateFollowupDraft(group, { followUpDate: event.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs disabled:bg-slate-100"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Reminder Time</label>
                                  <input
                                    type="time"
                                    disabled={locked || draft.callStatus === "Payment Done"}
                                    value={draft.followUpTime || ""}
                                    onChange={(event) => updateFollowupDraft(group, { followUpTime: event.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs disabled:bg-slate-100"
                                  />
                                </div>
                              </div>

                              <label className="flex items-center gap-2 text-xs text-slate-600 font-semibold select-none">
                                <input
                                  type="checkbox"
                                  disabled={locked || draft.callStatus === "Payment Done"}
                                  checked={draft.reminderEnabled || false}
                                  onChange={(event) => updateFollowupDraft(group, { reminderEnabled: event.target.checked })}
                                  className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                />
                                <span>Toggle Automated Alert</span>
                              </label>

                              <div className="flex gap-3 pt-2">
                                <button
                                  onClick={() => submitFollowupEdit(group)}
                                  disabled={locked}
                                  className="flex-1 rounded-xl bg-slate-900 hover:bg-slate-950 text-white font-bold py-2.5 text-xs transition active:scale-95 disabled:bg-slate-300"
                                >
                                  Save
                                </button>
                                {!followupEditMode ? (
                                  <button
                                    onClick={() => cancelFollowupEdit(group.groupKey)}
                                    className="flex-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 text-xs transition active:scale-95"
                                  >
                                    Cancel
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Status</span>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  group.callStatus === "Payment Done" ? "bg-emerald-100 text-emerald-800" :
                                  group.callStatus === "Promise To Pay" ? "bg-amber-100 text-amber-800" :
                                  group.callStatus === "Call Back Later" ? "bg-sky-100 text-sky-800" :
                                  group.callStatus === "Wrong Number" || group.callStatus === "Switched Off" ? "bg-rose-100 text-rose-800" :
                                  "bg-slate-100 text-slate-800"
                                }`}>
                                  {group.callStatus || "Pending"}
                                </span>
                              </div>

                              {/* Remarks are NOT shown in daily follow-up view; they live in the timeline (click User ID) */}
                              <div className="rounded-2xl bg-slate-50/50 p-2.5 border border-slate-100 text-xs text-slate-500 italic">
                                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">Remarks</span>
                                <button
                                  onClick={() => setSelectedUserId(group.userId)}
                                  className="text-cyan-600 hover:underline font-semibold not-italic"
                                >
                                  View in Timeline →
                                </button>
                              </div>

                              {group.followUpDate && (
                                <div className="flex items-center gap-2.5 rounded-2xl bg-cyan-50/50 p-3 border border-cyan-100/50 text-xs text-slate-700">
                                  <Clock3 className="h-4 w-4 text-cyan-600 shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-cyan-600 block">Scheduled Callback</span>
                                    <span className="font-bold text-slate-800">{formatDateTime(group.followUpDate, group.followUpTime)}</span>
                                  </div>
                                  {group.reminderEnabled && (
                                    <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                                      Alert Active
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </>
            )}

            {activePage === "records" && (
              <>
                <Panel title="Top 10 Customers" subtitle="">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="pb-3 font-medium">User</th>
                          <th className="pb-3 font-medium">Customer</th>
                          <th className="pb-3 font-medium">Mobile</th>
                          <th className="pb-3 font-medium">Anchor</th>
                          <th className="pb-3 font-medium">Loan Sum</th>
                          <th className="pb-3 font-medium">Default Sum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCustomers.map((customer) => (
                          <tr key={customer.userId} className="border-t border-slate-100">
                            <td className="py-3 font-semibold">
                              <button
                                onClick={() => setSelectedUserId(customer.userId)}
                                className="text-cyan-600 hover:text-cyan-700 hover:underline transition font-semibold"
                              >
                                {customer.userId}
                              </button>
                            </td>
                            <td className="py-3">{customer.customerName || "-"}</td>
                            <td className="py-3">
                              <div className="space-y-1">
                                {customer.mobile ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900">{customer.mobile}</span>
                                    <div className="flex gap-1">
                                      <a
                                        href={`tel:${customer.mobile}`}
                                        className="rounded border border-slate-200 p-0.5 text-slate-700 hover:bg-slate-50 transition"
                                        title="Call Primary"
                                      >
                                        <Phone className="h-3 w-3" />
                                      </a>
                                      <a
                                        href={getWhatsAppLink(customer.mobile)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded border border-slate-200 p-0.5 text-emerald-700 hover:bg-emerald-50 transition"
                                        title="WhatsApp Primary"
                                      >
                                        <MessageCircle className="h-3 w-3" />
                                      </a>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                                {customer.alternateNumber ? (
                                  <div className="flex items-center gap-2 border-t border-slate-100 pt-1 mt-0.5">
                                    <span className="text-xs text-slate-500">{customer.alternateNumber}</span>
                                    <div className="flex gap-1">
                                      <a
                                        href={`tel:${customer.alternateNumber}`}
                                        className="rounded border border-slate-200 p-0.5 text-slate-500 hover:bg-slate-50 transition"
                                        title="Call Alternate"
                                      >
                                        <Phone className="h-3 w-3" />
                                      </a>
                                      <a
                                        href={getWhatsAppLink(customer.alternateNumber)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded border border-slate-200 p-0.5 text-emerald-600 hover:bg-emerald-50 transition"
                                        title="WhatsApp Alternate"
                                      >
                                        <MessageCircle className="h-3 w-3" />
                                      </a>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="py-3">{customer.anchor || "-"}</td>
                            <td className="py-3">{formatCurrency(customer.totalLoanAmount)}</td>
                            <td className="py-3">{formatCurrency(customer.totalDefaultAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                <Panel title="All Records" subtitle="">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="pb-3 font-medium">User</th>
                          <th className="pb-3 font-medium">Loan</th>
                          <th className="pb-3 font-medium">Customer</th>
                          <th className="pb-3 font-medium">Lender</th>
                          <th className="pb-3 font-medium">Anchor</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Default</th>
                          <th className="pb-3 font-medium">Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecords.map((record) => (
                          <tr key={record.id} className="border-t border-slate-100">
                            <td className="py-3 font-semibold">
                              <button
                                onClick={() => setSelectedUserId(record.userId)}
                                className="text-cyan-600 hover:text-cyan-700 hover:underline transition font-semibold"
                              >
                                {record.userId}
                              </button>
                            </td>
                            <td className="py-3">
                              <button
                                onClick={() => setSelectedUserId(record.loanId)}
                                className="text-cyan-600 hover:text-cyan-700 hover:underline transition font-semibold"
                              >
                                {record.loanId}
                              </button>
                            </td>
                            <td className="py-3">{record.customerName || "-"}</td>
                            <td className="py-3">{record.lender || "-"}</td>
                            <td className="py-3">{record.anchor || "-"}</td>
                            <td className="py-3">
                              <StatusPill value={record.callStatus || record.status || "Pending"} />
                            </td>
                            <td className="py-3">
                              <div>{formatCurrency(record.defaultAmount)}</div>
                              {record.pendingDays !== undefined && record.pendingDays > 0 && (
                                <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md mt-0.5 whitespace-nowrap">
                                  {record.pendingDays} days
                                </span>
                              )}
                            </td>
                            <td className="py-3">{record.riskScore}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            )}

            {activePage === "upload" && (
              <>
            <section className="grid gap-6 xl:grid-cols-2">
                  <Panel title="Upload Collection Data" subtitle="">
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center hover:border-cyan-400 hover:bg-cyan-50">
                      <Upload className="mb-3 h-8 w-8 text-slate-500" />
                      <span className="font-semibold">Choose collection CSV</span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) parseCollectionFile(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </Panel>

                  <Panel title="Upload Customer Data" subtitle="">
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center hover:border-cyan-400 hover:bg-cyan-50">
                      <Users className="mb-3 h-8 w-8 text-slate-500" />
                      <span className="font-semibold">Choose customer CSV</span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) parseCustomerFile(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </Panel>
                </section>

                <Panel title="Upload History" subtitle="">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="pb-3 font-medium">Type</th>
                          <th className="pb-3 font-medium">File</th>
                          <th className="pb-3 font-medium">Processed</th>
                          <th className="pb-3 font-medium">Created</th>
                          <th className="pb-3 font-medium">Updated</th>
                          <th className="pb-3 font-medium">Skipped</th>
                          <th className="pb-3 font-medium">Completed At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadHistory.map((entry) => (
                          <tr key={entry.id} className="border-t border-slate-100">
                            <td className="py-3 capitalize">{entry.type}</td>
                            <td className="py-3">{entry.fileName}</td>
                            <td className="py-3">{entry.processed}</td>
                            <td className="py-3">{entry.created}</td>
                            <td className="py-3">{entry.updated}</td>
                            <td className="py-3">{entry.skipped}</td>
                            <td className="py-3">
                              <div>{formatDate(entry.completedAt)}</div>
                              <div className="text-xs text-slate-500">{entry.message || ""}</div>
                            </td>
                          </tr>
                        ))}
                        {!uploadHistory.length && (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-500">
                              No uploads yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            )}

            {activePage === "reminders" && (
              <div className="space-y-6">
                {/* Premium Banner */}
                <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
                  <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px]" />
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-400">
                        Operational Control
                      </span>
                      <h2 className="mt-2 text-2xl font-bold">🔔 Reminders & Automated Alerts</h2>
                      <p className="text-sm text-slate-400 mt-1">
                        Monitor active queues and manage Telegram notifications dispatched during operational hours (10:00 AM - 6:00 PM IST).
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-cyan-400">
                        <BellRing className="h-5 w-5 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Background Checker</p>
                        <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                          Active (1m precision)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {user?.role === "admin" ? (
                  <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      <Panel title="⚙️ Telegram Reminders Configuration" subtitle="Configure automated alert updates for collection agents">
                        <form onSubmit={handleSaveTelegramSettings} className="space-y-4">
                          {telegramSaveSuccess && (
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 animate-pulse">
                              {telegramSaveSuccess}
                            </div>
                          )}
                          
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                                Telegram Bot Token
                              </label>
                              <input
                                type="password"
                                value={telegramSettings.botToken}
                                onChange={(e) => setTelegramSettings(prev => ({ ...prev, botToken: e.target.value }))}
                                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400 focus:bg-white transition"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                                Agent Chat ID
                              </label>
                              <input
                                type="text"
                                value={telegramSettings.chatId}
                                onChange={(e) => setTelegramSettings(prev => ({ ...prev, chatId: e.target.value }))}
                                placeholder="-100123456789 or 98765432"
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400 focus:bg-white transition"
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2 items-center">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                                Agent Reference Name
                              </label>
                              <input
                                type="text"
                                value={telegramSettings.agentName}
                                onChange={(e) => setTelegramSettings(prev => ({ ...prev, agentName: e.target.value }))}
                                placeholder="Vikas Rai"
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400 focus:bg-white transition"
                              />
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                              <input
                                type="checkbox"
                                id="telegram-alerts-enabled"
                                checked={telegramSettings.isEnabled}
                                onChange={(e) => setTelegramSettings(prev => ({ ...prev, isEnabled: e.target.checked }))}
                                className="h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                              />
                              <label htmlFor="telegram-alerts-enabled" className="text-sm font-semibold text-slate-700 select-none cursor-pointer">
                                Enable Automated Operational Hour alerts (10 AM - 6 PM)
                              </label>
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="rounded-2xl bg-cyan-600 px-6 py-2.5 font-semibold text-white shadow-lg transition hover:bg-cyan-700"
                          >
                            Save Settings
                          </button>
                        </form>
                      </Panel>
                    </div>

                    <div className="lg:col-span-1">
                      <Panel title="🧪 Testing & Instant Scan" subtitle="Send test alerts or manually execute the check engine">
                        <div className="space-y-4">
                          {telegramTestSuccess && (
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                              {telegramTestSuccess}
                            </div>
                          )}
                          {telegramTestError && (
                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
                              {telegramTestError}
                            </div>
                          )}

                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                              Custom Test Message
                            </label>
                            <textarea
                              value={telegramTestMessage}
                              onChange={(e) => setTelegramTestMessage(e.target.value)}
                              placeholder="Type a test alert message..."
                              className="w-full h-20 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-cyan-400 focus:bg-white transition resize-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleSendTelegramTest}
                            disabled={telegramTestLoading}
                            className="w-full rounded-2xl bg-slate-950 py-3 font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:bg-slate-300"
                          >
                            {telegramTestLoading ? "Sending Notification..." : "Dispatch Test Alert Now"}
                          </button>

                          <div className="border-t border-slate-100 mt-4 pt-4 space-y-3">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                              Active Reminder Operations
                            </label>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Manually scan and trigger pending customer follow-up alerts immediately, bypassing the local hour constraints.
                            </p>
                            
                            {cronRunSuccess && (
                              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-600 leading-normal">
                                {cronRunSuccess}
                              </div>
                            )}
                            {cronRunError && (
                              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-500 leading-normal">
                                {cronRunError}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={handleRunCron}
                              disabled={cronRunLoading}
                              className="w-full rounded-2xl bg-cyan-600 py-3 font-semibold text-white shadow-lg transition hover:bg-cyan-700 disabled:bg-slate-300"
                            >
                              {cronRunLoading ? "Running Verification..." : "Run Active Reminders Check"}
                            </button>
                          </div>
                        </div>
                      </Panel>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-600">
                    <p className="font-semibold">Reminders & Notification parameters are managed by Administrative Operators.</p>
                    <p className="text-xs text-slate-400 mt-1">Automatic alert dispatches execute continuously between 10:00 AM - 6:00 PM IST.</p>
                  </div>
                )}

                {/* Reminders Queue Section */}
                <Panel title="📋 Active Reminders Queue" subtitle="List of all upcoming scheduled follow-up alerts containing active reminder flags">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="pb-3 font-medium">Customer Details</th>
                          <th className="pb-3 font-medium">Lender & Anchor</th>
                          <th className="pb-3 font-medium">Contact</th>
                          <th className="pb-3 font-medium text-center">Date & Time</th>
                          <th className="pb-3 font-medium">Status / Action Type</th>
                          <th className="pb-3 font-medium">Latest Remark</th>
                          <th className="pb-3 font-medium text-center">Alert Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecords.filter(r => r.reminderEnabled && r.callStatus !== 'Payment Done').map((record) => (
                          <tr key={record.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition">
                            <td className="py-4">
                              <button
                                onClick={() => setSelectedUserId(record.userId)}
                                className="text-left font-bold text-slate-900 hover:text-cyan-600 transition"
                              >
                                {record.customerName}
                              </button>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">{record.userId}</div>
                            </td>
                            <td className="py-4">
                              <div className="font-semibold text-slate-800">{record.lender}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{record.anchorName}</div>
                            </td>
                            <td className="py-4 font-mono text-xs">{record.mobile || "N/A"}</td>
                            <td className="py-4 text-center">
                              <div className="font-semibold text-slate-900">{record.followUpDate || "Today"}</div>
                              <div className="text-[11px] text-cyan-600 font-bold mt-0.5">{record.followUpTime || "N/A"}</div>
                            </td>
                            <td className="py-4">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                record.callStatus === 'Promise To Pay' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {record.callStatus || "Call Back Later"}
                              </span>
                            </td>
                            <td className="py-4 max-w-xs truncate text-xs text-slate-500" title={record.remark}>
                              {record.remark || "N/A"}
                            </td>
                            <td className="py-4 text-center">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 border border-cyan-200 px-2.5 py-0.5 text-xs font-semibold text-cyan-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                                Active Reminder
                              </span>
                            </td>
                          </tr>
                        ))}
                        {filteredRecords.filter(r => r.reminderEnabled && r.callStatus !== 'Payment Done').length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl">
                              <BellRing className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                              <p className="font-medium">No active reminder alerts pending in the scheduler queue.</p>
                              <p className="text-xs text-slate-400 mt-1">Reminders are set automatically when selecting status in the Daily Follow-up page.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                {/* Dispatched Alerts & Reminder History Section */}
                <Panel title="📜 Dispatched & Scheduled Alerts History" subtitle="Audit log of all follow-up alerts dispatched to Telegram or scheduled by agents">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="pb-3 font-medium">Timestamp</th>
                          <th className="pb-3 font-medium">Customer Details</th>
                          <th className="pb-3 font-medium">Contact</th>
                          <th className="pb-3 font-medium text-center">Scheduled Date & Time</th>
                          <th className="pb-3 font-medium">Event Type</th>
                          <th className="pb-3 font-medium">Remark / Details</th>
                          <th className="pb-3 font-medium">Operator</th>
                        </tr>
                      </thead>
                      <tbody>
                        {interactionLogs && Array.isArray(interactionLogs) && interactionLogs
                          .filter(log => {
                            if (!log) return false;
                            const remark = log.remark || "";
                            const followUpDate = log.followUpDate || "";
                            const callStatus = log.callStatus || "";
                            const updatedBy = log.updatedBy || "";
                            
                            return (
                              updatedBy === "System (Telegram Alert)" || 
                              remark.includes("🔔") ||
                              remark.includes("Telegram Alert") ||
                              (followUpDate && remark.toLowerCase().includes("reminder")) ||
                              (followUpDate && callStatus !== "Payment Done" && callStatus !== "Pending")
                            );
                          })
                          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                          .map((log) => {
                            const remark = log.remark || "";
                            const updatedBy = log.updatedBy || "";
                            const isDispatched = updatedBy === "System (Telegram Alert)" || remark.includes("Telegram Alert") || remark.includes("🔔");
                            return (
                              <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition">
                                <td className="py-4 text-xs text-slate-500 font-mono">
                                  {new Date(log.updatedAt).toLocaleString('en-IN', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </td>
                                <td className="py-4">
                                  <button
                                    onClick={() => setSelectedUserId(log.userId)}
                                    className="text-left font-bold text-slate-900 hover:text-cyan-600 transition"
                                  >
                                    {log.customerName}
                                  </button>
                                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">{log.userId}</div>
                                </td>
                                <td className="py-4 font-mono text-xs">{log.mobile || "N/A"}</td>
                                <td className="py-4 text-center">
                                  <div className="font-semibold text-slate-900">{log.followUpDate || "N/A"}</div>
                                  <div className="text-[11px] text-cyan-600 font-bold mt-0.5">{log.followUpTime || "N/A"}</div>
                                </td>
                                <td className="py-4">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                    isDispatched 
                                      ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' 
                                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  }`}>
                                    {isDispatched ? (
                                      <>
                                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                                        Dispatched Alert
                                      </>
                                    ) : (
                                      <>
                                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                        Scheduled Alert
                                      </>
                                    )}
                                  </span>
                                </td>
                                <td className="py-4 max-w-xs whitespace-pre-line text-xs text-slate-500" title={remark}>
                                  {remark || "N/A"}
                                </td>
                                <td className="py-4 text-xs text-slate-600 font-medium">
                                  {updatedBy}
                                </td>
                              </tr>
                            );
                          })}
                        {(!interactionLogs || !Array.isArray(interactionLogs) || interactionLogs.filter(log => {
                          if (!log) return false;
                          const remark = log.remark || "";
                          const followUpDate = log.followUpDate || "";
                          const callStatus = log.callStatus || "";
                          const updatedBy = log.updatedBy || "";
                          return (
                            updatedBy === "System (Telegram Alert)" || 
                            remark.includes("🔔") ||
                            remark.includes("Telegram Alert") ||
                            (followUpDate && remark.toLowerCase().includes("reminder")) ||
                            (followUpDate && callStatus !== "Payment Done" && callStatus !== "Pending")
                          );
                        }).length === 0) && (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl">
                              <History className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                              <p className="font-medium">No alerts history recorded yet.</p>
                              <p className="text-xs text-slate-400 mt-1">Dispatched Telegram notification logs and scheduled update history will appear here.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            )}

            {activePage === "users" && user?.role === "admin" && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-1">
                    <Panel title="Create New Operator" subtitle="Register a new admin or manager">
                      <form onSubmit={handleCreateUser} className="space-y-4">
                        {createError && (
                          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
                            {createError}
                          </div>
                        )}
                        {createSuccess && (
                          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                            {createSuccess}
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            Email Address
                          </label>
                          <input
                            type="email"
                            required
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="user@kredmint.com"
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400 focus:bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            Password
                          </label>
                          <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min 6 characters"
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400 focus:bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            Role
                          </label>
                          <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value as any)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none"
                          >
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>

                        <button
                          type="submit"
                          disabled={createLoading}
                          className="w-full rounded-2xl bg-slate-950 py-3 font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:bg-slate-300"
                        >
                          {createLoading ? "Creating..." : "Create User"}
                        </button>
                      </form>
                    </Panel>
                  </div>

                  <div className="lg:col-span-2">
                    <Panel title="Operator Registry" subtitle="All registered system accounts">
                      {usersLoading ? (
                        <div className="py-8 text-center text-slate-500">Loading operators...</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="text-left text-slate-500">
                              <tr>
                                <th className="pb-3 font-medium">Email</th>
                                <th className="pb-3 font-medium">Role</th>
                                <th className="pb-3 font-medium">Status</th>
                                <th className="pb-3 font-medium">Created At</th>
                                <th className="pb-3 font-medium text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {usersList.map((usr) => (
                                <tr key={usr.id} className="border-t border-slate-100">
                                  <td className="py-3 font-semibold">{usr.email}</td>
                                  <td className="py-3">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      usr.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                    }`}>
                                      {usr.role}
                                    </span>
                                  </td>
                                  <td className="py-3">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      usr.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                                    }`}>
                                      {usr.is_active ? 'Active' : 'Suspended'}
                                    </span>
                                  </td>
                                  <td className="py-3 text-slate-500">{formatDate(usr.created_at)}</td>
                                  <td className="py-3 text-right">
                                    <button
                                      onClick={() => {
                                        setResettingUser(usr.email);
                                        setResetPasswordVal("");
                                        setResetError("");
                                        setResetSuccess("");
                                      }}
                                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                    >
                                      Reset PW
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </Panel>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Chronological History Timeline Drawer */}
            {selectedUserId && (
              <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 animate-fade-in">
                    {/* Backdrop Click Dismiss */}
                    <div className="absolute inset-0" onClick={() => setSelectedUserId(null)} />
                    
                    <div className="relative w-full max-w-4xl bg-slate-50 h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 overflow-hidden animate-lift-in">
                      
                      {/* Drawer Header */}
                      <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 bg-white">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 shadow-sm border border-cyan-100">
                            <Users className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-cyan-100/80 px-2.5 py-0.5 text-xs font-bold text-cyan-800 border border-cyan-200">
                                Case File
                              </span>
                              <span className="text-xs text-slate-500 font-mono font-medium">ID: {selectedUserId}</span>
                              <a
                                href={`https://console.kredmint.in/merchant/dashboard/?userId=${selectedUserRecord?.userId || selectedUserId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 border border-slate-200 transition shadow-sm"
                                title="Open in Kredmint Console"
                              >
                                <span>Console</span>
                                <ArrowUpRight className="h-2.5 w-2.5" />
                              </a>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mt-1">
                              {selectedUserRecord?.customerName || "Interaction History"}
                            </h3>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedUserId(null)}
                          className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition border border-transparent hover:border-slate-200"
                          title="Close panel"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Main Scrollable Split Body */}
                      <div className="flex-1 overflow-y-auto p-6 md:grid md:grid-cols-12 md:gap-6 space-y-6 md:space-y-0">
                        
                        {/* LEFT COLUMN: Active Follow-up Tracker (5 cols) */}
                        <div className="md:col-span-5 space-y-6">
                          
                          {/* Section Title */}
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Follow-up Tracker</h4>
                          </div>

                          {/* Primary Status Card */}
                          {selectedUserRecord && (
                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Status</span>
                                <StatusPill value={selectedUserRecord.callStatus || selectedUserRecord.status || "Pending"} />
                              </div>

                              <div className="pt-2 border-t border-slate-100">
                                <div className="text-xs text-slate-400 font-medium">Default Balance</div>
                                <div className="text-2xl font-black text-rose-600 tracking-tight mt-0.5">
                                  {formatCurrency(selectedUserGroupData ? selectedUserGroupData.totalDefaultAmount : selectedUserRecord.defaultAmount)}
                                </div>
                                {selectedUserRecord.pendingDays !== undefined && selectedUserRecord.pendingDays > 0 && (
                                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 border border-rose-100 text-rose-700 mt-1.5 mb-1">
                                    <Clock3 className="h-3.5 w-3.5 text-rose-600 animate-pulse" />
                                    <span>{selectedUserRecord.pendingDays} days in default</span>
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  Total Loan: {selectedUserGroupData
                                    ? `${formatCurrency(selectedUserGroupData.totalLoanAmount)} / ${selectedUserGroupData.loanCount} ${selectedUserGroupData.loanCount === 1 ? 'loan' : 'loans'}`
                                    : formatCurrency(selectedUserRecord.loanAmount)}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                                <div>
                                  <div className="text-slate-400 font-medium">Lender</div>
                                  <div className="font-semibold text-slate-800 mt-0.5 truncate" title={selectedUserRecord.lender}>
                                    {selectedUserRecord.lender || "-"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400 font-medium">Anchor Partner</div>
                                  <div className="font-semibold text-slate-800 mt-0.5 truncate" title={selectedUserRecord.anchor}>
                                    {selectedUserRecord.anchor || "-"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Contact quick actions */}
                          {selectedUserRecord && (selectedUserRecord.mobile || selectedUserRecord.alternateNumber) && (
                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Channels</div>
                              
                              <div className="space-y-3">
                                {selectedUserRecord.mobile && (
                                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 border border-slate-100">
                                    <div>
                                      <div className="text-[10px] font-bold text-slate-400 uppercase">Primary Mobile</div>
                                      <div className="text-sm font-semibold text-slate-900 mt-0.5">{selectedUserRecord.mobile}</div>
                                    </div>
                                    <div className="flex gap-2">
                                      <a
                                        href={`tel:${selectedUserRecord.mobile}`}
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 hover:text-cyan-600 transition"
                                        title="Voice Call"
                                      >
                                        <Phone className="h-4 w-4" />
                                      </a>
                                      <a
                                        href={getWhatsAppLink(selectedUserRecord.mobile)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition"
                                        title="WhatsApp Chat"
                                      >
                                        <MessageCircle className="h-4 w-4" />
                                      </a>
                                    </div>
                                  </div>
                                )}

                                {selectedUserRecord.alternateNumber && (
                                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 border border-slate-100">
                                    <div>
                                      <div className="text-[10px] font-bold text-slate-400 uppercase">Alternate Mobile</div>
                                      <div className="text-sm font-semibold text-slate-600 mt-0.5">{selectedUserRecord.alternateNumber}</div>
                                    </div>
                                    <div className="flex gap-2">
                                      <a
                                        href={`tel:${selectedUserRecord.alternateNumber}`}
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-cyan-600 transition"
                                        title="Voice Call"
                                      >
                                        <Phone className="h-4 w-4" />
                                      </a>
                                      <a
                                        href={getWhatsAppLink(selectedUserRecord.alternateNumber)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition"
                                        title="WhatsApp Chat"
                                      >
                                        <MessageCircle className="h-4 w-4" />
                                      </a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Reminder & Next Schedule Card */}
                          {selectedUserRecord && (
                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Schedule & Reminders</div>
                              
                              <div className="flex items-start gap-3">
                                <div className="rounded-xl bg-amber-50 p-2 border border-amber-100 text-amber-600">
                                  <Calendar className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                  <div className="text-xs text-slate-400 font-medium">Next Callback Date</div>
                                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                                    {selectedUserRecord.followUpDate ? formatDate(selectedUserRecord.followUpDate) : "No callback scheduled"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                <span className="text-xs font-medium text-slate-500">Telegram Notification alerts</span>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  selectedUserRecord.reminderEnabled
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${selectedUserRecord.reminderEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                                  {selectedUserRecord.reminderEnabled ? "Enabled" : "Disabled"}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Kredmint Console Redirection Card */}
                          {selectedUserRecord && (
                            <div className="rounded-3xl border border-cyan-200 bg-gradient-to-tr from-cyan-50/50 to-blue-50/20 p-5 shadow-sm space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-cyan-800 uppercase tracking-wider">Console Integration</span>
                                <span className="inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-0.5 text-[10px] font-bold text-cyan-800 border border-cyan-200">
                                  Live Dashboard
                                </span>
                              </div>
                              
                              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                Access the live Kredmint console for this merchant to manage their risk limits, active loans, and credit profile.
                              </p>

                              <a
                                href={`https://console.kredmint.in/merchant/dashboard/?userId=${selectedUserRecord.userId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full rounded-2xl bg-cyan-600 hover:bg-cyan-700 hover:shadow-cyan-600/20 hover:shadow-lg py-3 text-sm font-bold text-white shadow-md active:scale-[0.98] transition-all duration-200"
                              >
                                <span>Go to Kredmint Console</span>
                                <ArrowUpRight className="h-4 w-4" />
                              </a>
                            </div>
                          )}

                          {/* Active/Current Remark Card */}
                          {selectedUserRecord?.remark && (
                            <div className="rounded-3xl border border-slate-200 bg-amber-50/40 p-5 shadow-sm space-y-2 border-dashed">
                              <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5" />
                                Active Remark Note
                              </div>
                              <p className="text-sm text-slate-700 font-medium italic">
                                "{selectedUserRecord.remark}"
                              </p>
                              <div className="text-[10px] text-slate-400 mt-2 font-medium">
                                Last updated: {formatDateTimeFromIso(selectedUserRecord.updatedAt)}
                              </div>
                            </div>
                          )}

                        </div>

                        {/* RIGHT COLUMN: Remark history (7 cols) */}
                        <div className="md:col-span-7 space-y-6 border-t md:border-t-0 md:border-l md:border-slate-200/80 md:pl-6 pt-6 md:pt-0">
                          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                              <History className="h-4 w-4" />
                              Remark History Timeline
                            </div>

                            {!selectedUserRecord?.remarkHistory || selectedUserRecord.remarkHistory.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-72 text-slate-400 text-center px-4">
                                <div className="rounded-full bg-slate-50 p-4 border border-slate-100 text-slate-300">
                                  <History className="h-8 w-8 stroke-1" />
                                </div>
                                <p className="mt-4 text-sm font-semibold text-slate-700">No remarks added yet</p>
                              </div>
                            ) : (
                              <div className="relative mt-8 border-l-2 border-slate-200 pl-8 ml-3 space-y-8">
                                {(() => {
                                  const uniqueRemarks = Array.from(
                                    new Map(
                                      (selectedUserRecord.remarkHistory || []).map((entry) => [
                                        `${entry.text}-${entry.addedBy}-${new Date(entry.timestamp).toISOString().slice(0, 16)}`,
                                        entry
                                      ])
                                    ).values()
                                  );
                                  return uniqueRemarks
                                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                    .map((entry, idx) => (
                                      <div key={entry.id} className="relative">
                                        <span className={`absolute -left-[42px] top-1.5 h-5 w-5 rounded-full ${
                                          idx === 0
                                            ? "bg-emerald-500"
                                            : "bg-slate-300"
                                        } ring-4 ring-white`} />
                                        <div className="space-y-3">
                                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <span className="text-sm font-bold text-slate-800">{entry.addedBy || "Agent"}</span>
                                            <span className="text-sm font-medium text-slate-400">{formatDateTimeFromIso(entry.timestamp)}</span>
                                          </div>
                                          {entry.partialPaymentAmount && (
                                            <div className="flex flex-wrap items-center gap-2 text-xs bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                              <span className="font-bold text-amber-800">Partial: ₹{entry.partialPaymentAmount.toLocaleString("en-IN")}</span>
                                              {entry.invoiceNumber && <span className="text-amber-600">| Invoice: {entry.invoiceNumber}</span>}
                                              {entry.remainingAmount !== undefined && <span className="text-amber-700 font-semibold">| Pending: ₹{entry.remainingAmount.toLocaleString("en-IN")}</span>}
                                            </div>
                                          )}
                                          <p className="text-base text-slate-600 leading-relaxed">{entry.text}</p>
                                        </div>
                                      </div>
                                    ));
                                })()}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* Drawer Footer */}
                      <div className="border-t border-slate-200 p-5 bg-white flex justify-end gap-3">
                        <button
                          onClick={() => setSelectedUserId(null)}
                          className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition active:scale-[0.98]"
                        >
                          Close Case File
                        </button>
                      </div>

                    </div>
                  </div>
                )}

                {resettingUser && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Reset Operator Password</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Updating credentials for {resettingUser}</p>
                        </div>
                        <button
                          onClick={() => setResettingUser(null)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <form onSubmit={handleResetPassword} className="space-y-4">
                        {resetError && (
                          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
                            {resetError}
                          </div>
                        )}
                        {resetSuccess && (
                          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                            {resetSuccess}
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            New Password
                          </label>
                          <input
                            type="password"
                            required
                            autoFocus
                            value={resetPasswordVal}
                            onChange={(e) => setResetPasswordVal(e.target.value)}
                            placeholder="Enter at least 6 characters"
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400 focus:bg-white transition"
                          />
                        </div>

                        <div className="flex gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setResettingUser(null)}
                            className="flex-1 rounded-2xl border border-slate-200 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={resetLoading}
                            className="flex-1 rounded-2xl bg-slate-950 py-3 font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:bg-slate-300"
                          >
                            {resetLoading ? "Updating..." : "Update Password"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
          </div>
        </main>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className="rounded-2xl bg-slate-100 p-2">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function BarRow({
  label,
  value,
  max,
  formatter,
}: {
  label: string;
  value: number;
  max: number;
  formatter?: (value: number) => string;
}) {
  const width = Math.max(8, Math.round((value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{formatter ? formatter(value) : value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const styles =
    value === "Payment Done"
      ? "bg-emerald-100 text-emerald-800"
      : value === "Promise To Pay"
        ? "bg-amber-100 text-amber-800"
        : value === "No Answer" || value === "Switched Off"
          ? "bg-slate-100 text-slate-700"
          : value === "Wrong Number" || value === "Dispute"
            ? "bg-rose-100 text-rose-700"
            : "bg-cyan-100 text-cyan-800";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>{value}</span>;
}

export default App;
