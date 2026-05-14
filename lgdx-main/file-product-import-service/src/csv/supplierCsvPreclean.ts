/**
 * Streaming CSV preclean for large legacy supplier feeds (REHA-style).
 * Mirrors legacy `clean_csv.py`: drop wide columns, filter rows, rename CustAmount → Price.
 * Single-pass read/write — suitable for 250MB+ inputs without loading the file into RAM.
 */

import { createReadStream, createWriteStream } from "fs";
import csv = require("csv-parser");
import * as path from "path";

const DROP_COLUMNS = new Set([
  "Rapaport",
  "GoodsType",
  "CertComment",
  "KeyToSymbol",
  "MemberComments",
  "Discount",
]);

const ALLOWED_COLOR = new Set(["", "D", "E", "F", "G"]);

const ALLOWED_CLARITY = new Set(["IF", "FL", "VVS1", "VVS2", "VS1", "VS2"]);

const REQUIRED_COLUMNS = ["Image", "Video", "Color", "Clarity", "CustAmount"] as const;

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "").trim();
}

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return /[,"\r\n]/.test(s) ? `"${s}"` : s;
}

function parseSupplierCsvPrecleanCompanyIds(): Set<string> {
  const raw =
    process.env.FILE_IMPORT_SUPPLIER_CSV_PRECLEAN_COMPANY_IDS ||
    process.env.FILE_IMPORT_CSV_PRECLEAN_COMPANY_IDS ||
    "";
  const ids = raw
    .split(/[,;\s]+/)
    .map((s: string) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

let cachedPrecleanCompanyIds: Set<string> | null = null;

export function getSupplierCsvPrecleanCompanyIds(): Set<string> {
  if (!cachedPrecleanCompanyIds) {
    cachedPrecleanCompanyIds = parseSupplierCsvPrecleanCompanyIds();
  }
  return cachedPrecleanCompanyIds;
}

export function shouldApplySupplierCsvPreclean(
  companyId: string,
  originalFileName: string,
): boolean {
  const ext = path.extname(originalFileName).toLowerCase();
  if (ext !== ".csv") return false;
  return getSupplierCsvPrecleanCompanyIds().has(companyId);
}

function cell(row: Record<string, string>, name: string): string {
  const v = row[name];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function rowPassesFilters(row: Record<string, string>): boolean {
  const image = cell(row, "Image");
  const video = cell(row, "Video");
  if (image === "" && video === "") return false;
  const color = cell(row, "Color");
  if (!ALLOWED_COLOR.has(color)) return false;
  const clarity = cell(row, "Clarity");
  if (!ALLOWED_CLARITY.has(clarity)) return false;
  return true;
}

/**
 * Stream `inputPath` UTF-8 CSV to `outputPath` with the same semantics as `clean_csv.py`.
 * Throws if required columns are missing from the header row.
 */
export async function streamSupplierCsvPreclean(
  inputPath: string,
  outputPath: string,
): Promise<{ rowsOut: number }> {
  return new Promise((resolve, reject) => {
    const rs = createReadStream(inputPath, { encoding: "utf8" });
    const ws = createWriteStream(outputPath, { encoding: "utf8" });

    let headerOrder: string[] | null = null;
    let keepNames: string[] | null = null;
    let rowsOut = 0;
    let settled = false;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      try {
        rs.destroy();
      } catch {
        /* */
      }
      try {
        ws.destroy();
      } catch {
        /* */
      }
      reject(err);
    };

    const parser = csv({
      mapHeaders: ({ header }) => stripBom(String(header ?? "")),
    });

    const writeLine = (cells: string[]): boolean => {
      const line = cells.map(escapeCsvField).join(",") + "\n";
      return ws.write(line);
    };

    const resumeParser = (): void => {
      parser.resume();
    };

    const writeOneDataRowThenResume = (row: Record<string, string>): void => {
      if (!keepNames) {
        fail(new Error("CSV preclean: internal state lost"));
        return;
      }
      if (!rowPassesFilters(row)) {
        resumeParser();
        return;
      }
      rowsOut++;
      const outCells = keepNames.map((name) => cell(row, name));
      if (!writeLine(outCells)) {
        ws.once("drain", resumeParser);
        return;
      }
      resumeParser();
    };

    parser.on("data", (row: Record<string, string>) => {
      parser.pause();

      try {
        if (!headerOrder) {
          headerOrder = Object.keys(row);
          const missing = REQUIRED_COLUMNS.filter((n) => !headerOrder!.includes(n));
          if (missing.length > 0) {
            fail(
              new Error(
                `CSV preclean: missing required columns: ${missing.join(", ")}`,
              ),
            );
            return;
          }
          keepNames = [];
          const newHeaderNames: string[] = [];
          for (const col of headerOrder) {
            if (DROP_COLUMNS.has(col)) continue;
            keepNames.push(col);
            newHeaderNames.push(col === "CustAmount" ? "Price" : col);
          }
          if (!writeLine(newHeaderNames)) {
            ws.once("drain", () => writeOneDataRowThenResume(row));
            return;
          }
        }
        writeOneDataRowThenResume(row);
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)));
      }
    });

    parser.on("end", () => {
      if (settled) return;
      if (!headerOrder || !keepNames) {
        fail(new Error("CSV preclean: empty file or no data rows"));
        return;
      }
      ws.end((err?: Error) => {
        if (err) {
          fail(err);
          return;
        }
        settled = true;
        resolve({ rowsOut });
      });
    });

    parser.on("error", (err: unknown) =>
      fail(err instanceof Error ? err : new Error(String(err))),
    );
    rs.on("error", (err: unknown) =>
      fail(err instanceof Error ? err : new Error(String(err))),
    );
    ws.on("error", (err: unknown) =>
      fail(err instanceof Error ? err : new Error(String(err))),
    );

    rs.pipe(parser);
  });
}
