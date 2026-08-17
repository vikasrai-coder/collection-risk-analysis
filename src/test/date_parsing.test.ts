import { describe, it, expect } from "vitest";

function parseCollectionDate(collectionDateStr: string | number | undefined | null): Date | null {
  if (collectionDateStr === undefined || collectionDateStr === null || collectionDateStr === "") return null;
  try {
    const cleanStr = String(collectionDateStr).trim();
    if (!cleanStr) return null;

    if (/^\d+(\.\d+)?$/.test(cleanStr)) {
      const num = parseFloat(cleanStr);
      if (num > 1000000000000) {
        const d = new Date(num);
        if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }
      if (num > 1000000000) {
        const d = new Date(num * 1000);
        if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }
      if (num > 20000 && num < 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const millisPerDay = 86400000;
        const d = new Date(excelEpoch.getTime() + Math.floor(num) * millisPerDay);
        if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }
    }

    if (/[a-zA-Z]/.test(cleanStr) || cleanStr.includes("T")) {
      const parsed = new Date(cleanStr);
      if (!isNaN(parsed.getTime())) {
        return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
      }
    }

    const numbers = cleanStr.match(/\d+/g);
    if (numbers && numbers.length >= 3) {
      let year = 0, month = 0, day = 0;
      const val0 = parseInt(numbers[0], 10);
      const val1 = parseInt(numbers[1], 10);
      const val2 = parseInt(numbers[2], 10);

      if (val0 > 1000) {
        year = val0;
        month = val1 - 1;
        day = val2;
      } else if (val2 > 1000) {
        year = val2;
        if (val0 > 12) {
          day = val0;
          month = val1 - 1;
        } else if (val1 > 12) {
          day = val1;
          month = val0 - 1;
        } else {
          day = val0;
          month = val1 - 1;
        }
      } else {
        if (val0 > 50) {
          year = 1900 + val0;
          month = val1 - 1;
          day = val2;
        } else if (val2 < 100) {
          year = 2000 + val2;
          day = val0;
          month = val1 - 1;
        }
      }

      if (year > 0 && month >= 0 && month < 12 && day > 0 && day <= 31) {
        return new Date(Date.UTC(year, month, day));
      }
    }

    const fallback = new Date(cleanStr);
    if (!isNaN(fallback.getTime())) {
      return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
    }
  } catch (e) {}
  return null;
}

describe("parseCollectionDate", () => {
  it("should parse YYYY-MM-DD correctly", () => {
    const res = parseCollectionDate("2026-05-14");
    expect(res).not.toBeNull();
    expect(res?.getUTCFullYear()).toBe(2026);
    expect(res?.getUTCMonth()).toBe(4);
    expect(res?.getUTCDate()).toBe(14);
  });

  it("should parse DD/MM/YYYY correctly", () => {
    const res = parseCollectionDate("14/05/2026");
    expect(res).not.toBeNull();
    expect(res?.getUTCFullYear()).toBe(2026);
    expect(res?.getUTCMonth()).toBe(4);
    expect(res?.getUTCDate()).toBe(14);
  });

  it("should parse Excel serial numbers correctly", () => {
    const res = parseCollectionDate(46156);
    expect(res).not.toBeNull();
    expect(res?.getUTCFullYear()).toBe(2026);
  });

  it("should parse numeric string timestamp", () => {
    const res = parseCollectionDate("1778716800000");
    expect(res).not.toBeNull();
    expect(res?.getUTCFullYear()).toBe(2026);
  });

  it("should return null for empty/invalid inputs", () => {
    expect(parseCollectionDate("")).toBeNull();
    expect(parseCollectionDate(null)).toBeNull();
    expect(parseCollectionDate(undefined)).toBeNull();
  });
});
