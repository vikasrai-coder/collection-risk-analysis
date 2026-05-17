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
} from "lucide-react";

type Page = "dashboard" | "followup" | "records" | "upload";

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
  followUpDate: string;
  reminderEnabled: boolean;
  updatedAt: string;
};

type UploadHistory = {
  id: string;
  type: "collection" | "customer";
  fileName: string;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  completedAt: string;
  message?: string;
};

type Draft = {
  customerName: string;
  mobile: string;
  alternateNumber: string;
  anchor: string;
  callStatus: string;
  remark: string;
  followUpDate: string;
  reminderEnabled: boolean;
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
  reminderEnabled: boolean;
  totalLoanAmount: number;
  totalDefaultAmount: number;
  loanCount: number;
  updatedAt: string;
};

const STORAGE_KEY = "collection-risk-records-v1";
const HISTORY_KEY = "collection-risk-upload-history-v1";
const DB_NAME = "collection-risk-db";
const DB_VERSION = 1;
const RECORDS_STORE = "app_state";
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:3000");
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
  "Refused To Pay",
];

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

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isAllowedLender(lender: string) {
  return lenderWhitelist.includes(normalizedText(lender));
}

function restrictToAllowedLenders(records: CollectionRecord[]) {
  return records.filter((record) => !record.lender || isAllowedLender(record.lender));
}

function makeLoanKey(row: Record<string, unknown>) {
  const direct = valueFromRow(row, ["loanId", "loan_id"]);
  if (direct) return direct;

  const fallbacks = [
    valueFromRow(row, ["invoiceId", "invoice_id"]),
    valueFromRow(row, ["invoiceNumber", "invoice_number"]),
    valueFromRow(row, ["referenceId", "reference_id"]),
    valueFromRow(row, ["utr", "txnRef", "txn_ref"]),
    valueFromRow(row, ["uuid"]),
  ].filter(Boolean);

  if (fallbacks.length) return fallbacks.join("-");

  const userId = valueFromRow(row, ["userId", "user_id", "customer_id", "customerId"]);
  const date = valueFromRow(row, ["collectionDate", "date", "transactionDate", "collectionDateStr"]);
  const instalmentNo = valueFromRow(row, ["instalmentNo", "installmentNo"]);
  return [userId, date, instalmentNo].filter(Boolean).join("-") || `generated-${slug()}`;
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

async function fetchBackendState() {
  const response = await fetch(`${API_BASE_URL}/api/state`);
  if (!response.ok) {
    throw new Error(`Backend sync failed: ${response.status}`);
  }
  return response.json();
}

async function pushBackendState(records: CollectionRecord[], history: UploadHistory[]) {
  const response = await fetch(`${API_BASE_URL}/api/state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records, history }),
  });

  if (!response.ok) {
    throw new Error(`Backend save failed: ${response.status}`);
  }
}

function isLocked(record: CollectionRecord) {
  return record.callStatus === "Payment Done" && record.updatedAt.slice(0, 10) === todayIso();
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
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [search, setSearch] = useState("");
  const [lenderFilter, setLenderFilter] = useState("All");
  const [anchorFilter, setAnchorFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [editingId, setEditingId] = useState<string>("");
  const [editingGroups, setEditingGroups] = useState<Record<string, boolean>>({});
  const [followupEditMode, setFollowupEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [lastUploadMessage, setLastUploadMessage] = useState("");
  const [recordsReady, setRecordsReady] = useState(false);
  const syncTimerRef = useRef<number | null>(null);
  const draftsRef = useRef<Record<string, Draft>>({});

  useEffect(() => {
    readPersistedRecords()
      .then(setRecords)
      .catch(() => setRecords(loadRecords()))
      .finally(() => setRecordsReady(true));
    setUploadHistory(loadHistory());
  }, []);

  useEffect(() => {
    fetchBackendState()
      .then((state) => {
        if (Array.isArray(state.records) && state.records.length) {
          setRecords(restrictToAllowedLenders(state.records));
        }
        if (Array.isArray(state.history) && state.history.length) {
          setUploadHistory(state.history);
        }
      })
      .catch(() => {});
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
      pushBackendState(records, uploadHistory).catch(() => {});
    }, 700);
  }, [records, uploadHistory, recordsReady]);

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
      const matchesStatus = statusFilter === "All" || record.callStatus === statusFilter;

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
        existing.avgRisk += record.riskScore;
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
          avgRisk: record.riskScore,
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
    const paymentDoneCount = filteredRecords.filter((record) => record.callStatus === "Payment Done").length;
    const remindersCount = filteredRecords.filter((record) => record.reminderEnabled && record.followUpDate).length;
    const avgRisk = filteredRecords.length
      ? Math.round(filteredRecords.reduce((sum, record) => sum + record.riskScore, 0) / filteredRecords.length)
      : 0;

    return {
      totalLoanAmount,
      totalDefaultAmount,
      paymentDoneCount,
      remindersCount,
      avgRisk,
      customers: new Set(filteredRecords.map((record) => record.userId)).size,
    };
  }, [filteredRecords]);

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

  const reminderQueue = useMemo(
    () =>
      filteredRecords
        .filter((record) => record.followUpDate || record.reminderEnabled)
        .sort((a, b) => (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999")),
    [filteredRecords],
  );

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

    for (const record of filteredRecords) {
      const groupKey = makeFollowupGroupKey(record);
      const existing = groups.get(groupKey);
      if (existing) {
        existing.sourceIds.push(record.id);
        existing.totalLoanAmount += record.loanAmount;
        existing.totalDefaultAmount += record.defaultAmount;
        existing.loanCount += 1;
        if (!existing.remark && record.remark) existing.remark = record.remark;
        if (!existing.followUpDate && record.followUpDate) existing.followUpDate = record.followUpDate;
        if (!existing.mobile && record.mobile) existing.mobile = record.mobile;
        if (!existing.alternateNumber && record.alternateNumber) existing.alternateNumber = record.alternateNumber;
        if (!existing.anchor && record.anchor) existing.anchor = record.anchor;
        if (!existing.customerName && record.customerName) existing.customerName = record.customerName;
        if (record.updatedAt > existing.updatedAt) existing.updatedAt = record.updatedAt;
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
          callStatus: record.callStatus || "Pending",
          remark: record.remark,
          followUpDate: record.followUpDate,
          reminderEnabled: record.reminderEnabled,
          totalLoanAmount: record.loanAmount,
          totalDefaultAmount: record.defaultAmount,
          loanCount: 1,
          updatedAt: record.updatedAt,
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.totalDefaultAmount - a.totalDefaultAmount);
  }, [filteredRecords]);

  function getGroupDraft(group: FollowupGroup): Draft {
    return (
      drafts[group.groupKey] || {
        customerName: group.customerName,
        mobile: group.mobile,
        alternateNumber: group.alternateNumber,
        anchor: group.anchor,
        callStatus: group.callStatus || "Pending",
        remark: group.remark,
        followUpDate: group.followUpDate,
        reminderEnabled: group.reminderEnabled || !!group.followUpDate,
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
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: ({ data }) => {
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let matchedWithoutLoanId = 0;
        const current = records;
        const baseRecords = isSeedOnly(current) ? [] : current;
        const byLoanId = new Map(baseRecords.map((record) => [record.loanId || record.id, { ...record }]));
        const nextByLoanId = new Map(byLoanId);

        for (const row of data) {
          const userId = valueFromRow(row, ["userId", "user_id", "customer_id", "customerId"]);
          const loanId = makeLoanKey(row);
          const lender = normalizedText(valueFromRow(row, ["lender", "lenderName", "nbfc"]));

          if (!userId || !isAllowedLender(lender)) {
            skipped += 1;
            continue;
          }

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

          const existing = nextByLoanId.get(loanId);
          if (existing) {
            if (!valueFromRow(row, ["loanId", "loan_id"])) matchedWithoutLoanId += 1;
            nextByLoanId.set(loanId, {
              ...existing,
              userId,
              loanId,
              customerName: customerName || existing.customerName,
              lender: lender || existing.lender,
              anchor: anchor || existing.anchor,
              mobile: mobile || existing.mobile,
              alternateNumber: alternateNumber || existing.alternateNumber,
              category: category || existing.category,
              status,
              loanAmount,
              defaultAmount,
              collectionDate,
              riskScore,
              paymentProbability,
            });
            updated += 1;
          } else {
            nextByLoanId.set(loanId, {
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
              callStatus: "Pending",
              remark: "",
              followUpDate: "",
              reminderEnabled: false,
              updatedAt: "",
            });
            created += 1;
          }
        }

        setRecords(restrictToAllowedLenders(Array.from(nextByLoanId.values())));

        const message =
          created || updated
            ? `${created} new, ${updated} updated, ${skipped} skipped${matchedWithoutLoanId ? `, ${matchedWithoutLoanId} matched without loanId` : ""}`
            : `No usable rows found. Check that the CSV has userId and collection columns.`;
        setLastUploadMessage(message);
        pushHistory({
          type: "collection",
          fileName: file.name,
          processed: data.length,
          created,
          updated,
          skipped,
          message,
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

          updated += 1;
          return {
            ...record,
            anchor: anchor || "",
            mobile: mobile || record.mobile,
            alternateNumber: alternateNumber || record.alternateNumber,
            customerName: customerName || record.customerName,
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
        mobile: record.mobile,
        alternateNumber: record.alternateNumber,
        anchor: record.anchor,
        callStatus: record.callStatus || "Pending",
        remark: record.remark,
        followUpDate: record.followUpDate,
        reminderEnabled: record.reminderEnabled,
      },
    }));
  }

  function saveDraft(recordId: string) {
    const draft = drafts[recordId];
    if (!draft) return;

    setRecords((current) =>
      current.map((record) => {
        if (record.id !== recordId) return record;
        if (isLocked(record)) return record;

        const paymentDone = draft.callStatus === "Payment Done";

        return {
          ...record,
          customerName: draft.customerName,
          mobile: draft.mobile,
          alternateNumber: draft.alternateNumber,
          anchor: draft.anchor,
          callStatus: draft.callStatus,
          remark: paymentDone ? "Payment Done" : draft.remark,
          followUpDate: paymentDone ? "" : draft.followUpDate,
          reminderEnabled: paymentDone ? false : draft.reminderEnabled,
          updatedAt: new Date().toISOString(),
        };
      }),
    );

    setEditingId("");
  }

  function saveFollowupGroup(groupKey: string, sourceIds: string[]) {
    const draft = draftsRef.current[groupKey];
    if (!draft) return;

    setRecords((current) =>
      current.map((record) => {
        if (!sourceIds.includes(record.id)) return record;
        if (isLocked(record)) return record;

        const paymentDone = draft.callStatus === "Payment Done";
        return {
          ...record,
          customerName: draft.customerName,
          mobile: draft.mobile,
          alternateNumber: draft.alternateNumber,
          anchor: draft.anchor,
          callStatus: draft.callStatus,
          remark: paymentDone ? "Payment Done" : draft.remark,
          followUpDate: paymentDone ? "" : draft.followUpDate,
          reminderEnabled: paymentDone ? false : draft.reminderEnabled || !!draft.followUpDate,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
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
    { key: "records", label: "Records", icon: FileSpreadsheet },
    { key: "upload", label: "Upload", icon: Upload },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
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
                onClick={() => setActivePage(item.key)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                  activePage === item.key
                    ? "bg-cyan-400 text-slate-950 shadow-lg"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="border-t border-white/10 px-5 py-4">
            <p className="text-sm text-slate-400">Lenders</p>
            <div className="mt-3 space-y-2">
              {lenderWhitelist.map((lender) => (
                <div key={lender} className="rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-200">
                  {lender}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Collection Risk</p>
                <h2 className="text-2xl font-bold tracking-tight">
                  {navItems.find((item) => item.key === activePage)?.label}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
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
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard icon={Database} label="Total Loan Amount" value={formatCurrency(summary.totalLoanAmount)} />
                  <MetricCard icon={ArrowUpRight} label="Default Amount" value={formatCurrency(summary.totalDefaultAmount)} />
                  <MetricCard icon={Users} label="Customers" value={String(summary.customers)} />
                  <MetricCard icon={ActivitySquare} label="Avg Risk Score" value={`${summary.avgRisk}`} />
                  <MetricCard icon={BellRing} label="Reminders" value={String(summary.remindersCount)} />
                </section>

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
                              <td className="py-3 font-semibold">{customer.userId}</td>
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
              </>
            )}

            {activePage === "followup" && (
              <>
                <section className="grid gap-4 md:grid-cols-4">
                  <MetricCard icon={PhoneCall} label="Handled Today" value={String(filteredRecords.filter((record) => !!record.updatedAt).length)} />
                  <MetricCard icon={CheckCircle2} label="Payment Done" value={String(summary.paymentDoneCount)} />
                  <MetricCard icon={Clock3} label="Pending Queue" value={String(filteredRecords.filter((record) => record.callStatus !== "Payment Done").length)} />
                  <MetricCard icon={BellRing} label="Reminder Queue" value={String(reminderQueue.length)} />
                </section>

                <Panel title="Daily Follow-up" subtitle="">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none"
                    >
                      <option value="All">All status</option>
                      {callStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
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
                              <td className="py-3 font-semibold">{group.userId}</td>
                              <td className="py-3">{group.customerName || "-"}</td>
                              <td className="py-3">{group.lender}</td>
                              <td className="py-3">{group.anchor || "-"}</td>
                              <td className="py-3">
                                <div className="flex items-start gap-3">
                                  <div>
                                    <div>{group.mobile || "-"}</div>
                                    <div className="text-xs text-slate-500">{group.alternateNumber || ""}</div>
                                  </div>
                                  <div className="flex gap-2">
                                    {group.mobile ? (
                                      <a
                                        href={`tel:${group.mobile}`}
                                        className="rounded-xl border border-slate-200 p-2 text-slate-700"
                                        title="Call"
                                      >
                                        <Phone className="h-4 w-4" />
                                      </a>
                                    ) : null}
                                    {group.mobile ? (
                                      <a
                                        href={`https://wa.me/91${group.mobile}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-xl border border-slate-200 p-2 text-emerald-700"
                                        title="WhatsApp"
                                      >
                                        <MessageCircle className="h-4 w-4" />
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3">
                                <div className="font-semibold">{formatCurrency(group.totalDefaultAmount)}</div>
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
                                    <div className="mt-2 max-w-52 text-xs text-slate-500">{group.remark || "-"}</div>
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
                                      className="rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
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
                                    <div>{formatDate(group.followUpDate)}</div>
                                    <div className="text-xs text-slate-500">{group.reminderEnabled ? "Reminder on" : "Reminder off"}</div>
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
                          className={`rounded-2xl border border-slate-200 bg-white p-4 ${draft.callStatus === "Payment Done" ? "bg-emerald-50" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">{group.userId}</div>
                              <div className="text-sm text-slate-600">{group.customerName || "-"}</div>
                              <div className="mt-1 text-xs text-slate-500">{group.lender}</div>
                              <div className="mt-1 text-xs text-slate-500">{group.anchor || "-"}</div>
                            </div>
                            {!editing && !followupEditMode ? (
                              <button
                                onClick={() => beginFollowupEdit(group)}
                                disabled={locked}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs disabled:bg-slate-100"
                              >
                                {locked ? "Locked" : "Edit"}
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <div className="text-xs text-slate-500">Default</div>
                              <div className="mt-1 font-semibold">{formatCurrency(group.totalDefaultAmount)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <div className="text-xs text-slate-500">Loans</div>
                              <div className="mt-1 font-semibold">{group.loanCount}</div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3">
                            <div>
                              <div className="text-sm">{group.mobile || "-"}</div>
                              <div className="text-xs text-slate-500">{group.alternateNumber || ""}</div>
                            </div>
                            <div className="flex gap-2">
                              {group.mobile ? (
                                <a
                                  href={`tel:${group.mobile}`}
                                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700"
                                >
                                  <Phone className="h-4 w-4" />
                                </a>
                              ) : null}
                              {group.mobile ? (
                                <a
                                  href={`https://wa.me/91${group.mobile}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-xl border border-slate-200 bg-white p-2 text-emerald-700"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              ) : null}
                            </div>
                          </div>

                          {editing ? (
                            <div className="mt-4 space-y-3">
                              <select
                                value={draft.callStatus || "Pending"}
                                disabled={locked}
                                onChange={(event) => updateFollowupDraft(group, { callStatus: event.target.value })}
                                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                              >
                                {callStatuses.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                value={draft.remark || ""}
                                disabled={locked || draft.callStatus === "Payment Done"}
                                onChange={(event) => updateFollowupDraft(group, { remark: event.target.value })}
                                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                                placeholder="Remarks"
                              />
                              <input
                                type="date"
                                disabled={locked || draft.callStatus === "Payment Done"}
                                value={draft.followUpDate || ""}
                                onChange={(event) => updateFollowupDraft(group, { followUpDate: event.target.value })}
                                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-100"
                              />
                              <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input
                                  type="checkbox"
                                  disabled={locked || draft.callStatus === "Payment Done"}
                                  checked={draft.reminderEnabled || false}
                                  onChange={(event) => updateFollowupDraft(group, { reminderEnabled: event.target.checked })}
                                />
                                Reminder on
                              </label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => submitFollowupEdit(group)}
                                  disabled={locked}
                                  className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white disabled:bg-slate-300"
                                >
                                  Save
                                </button>
                                {!followupEditMode ? (
                                  <button
                                    onClick={() => cancelFollowupEdit(group.groupKey)}
                                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm"
                                  >
                                    Cancel
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 space-y-2 text-sm">
                              <StatusPill value={group.callStatus || "Pending"} />
                              <div className="text-slate-600">{group.remark || "-"}</div>
                              <div className="text-slate-500">{formatDate(group.followUpDate)}</div>
                              <div className="text-xs text-slate-500">{group.reminderEnabled ? "Reminder on" : "Reminder off"}</div>
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
                            <td className="py-3 font-semibold">{customer.userId}</td>
                            <td className="py-3">{customer.customerName || "-"}</td>
                            <td className="py-3">
                              <div>{customer.mobile || "-"}</div>
                              <div className="text-xs text-slate-500">{customer.alternateNumber || ""}</div>
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
                            <td className="py-3 font-semibold">{record.userId}</td>
                            <td className="py-3">{record.loanId}</td>
                            <td className="py-3">{record.customerName || "-"}</td>
                            <td className="py-3">{record.lender || "-"}</td>
                            <td className="py-3">{record.anchor || "-"}</td>
                            <td className="py-3">
                              <StatusPill value={record.callStatus || record.status || "Pending"} />
                            </td>
                            <td className="py-3">{formatCurrency(record.defaultAmount)}</td>
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
