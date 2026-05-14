/**
 * Coerce ExcelJS cell data to a plain string for file import.
 * Hyperlink cells use value { text, hyperlink }; String() of that object becomes "[object Object]".
 * Streaming may set cell.hyperlink to metadata and move display text to cell.text while value is undefined.
 */
export function excelValueToImportString(
  value: unknown,
  cell?: ExcelCellLike | null,
): string {
  const fromCellStringLink = (raw: string | null | undefined): string => {
    if (raw == null) return "";
    const t = raw.trim();
    if (t && /^https?:\/\//i.test(t)) return t;
    return t;
  };

  if (cell) {
    const h = cell.hyperlink;
    if (typeof h === "string" && h.trim()) {
      const s = fromCellStringLink(h);
      if (s) return s;
    } else if (h && typeof h === "object" && h !== null && "target" in h) {
      const t = (h as { target?: string }).target;
      if (typeof t === "string" && t.trim()) return t.trim();
    }
  }

  if (value === null || value === undefined) {
    if (cell && cell.text !== undefined && cell.text !== null) {
      return String(cell.text).trim();
    }
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown> & { richText?: { text: string }[] };

    if (Array.isArray(o.richText)) {
      return o.richText.map((p) => p.text).join("").trim();
    }

    if (typeof o.hyperlink === "string" && o.hyperlink.trim()) {
      return o.hyperlink.trim();
    }

    if (o.text && o.hyperlink) {
      return String(o.hyperlink).trim();
    }

    if (o.formula !== undefined || o.sharedFormula !== undefined) {
      if ("result" in o && o.result !== undefined) {
        return excelValueToImportString(o.result, null);
      }
    }

    if (typeof o.text === "string" && o.text.trim() && !o.hyperlink) {
      return o.text.trim();
    }
  }

  return String(value).trim();
}

export type ExcelCellLike = {
  value?: unknown;
  text?: string | number;
  /** ExcelJS may use string URL, OOXML rel with `target`, or stream metadata `{ ref, rId }`. */
  hyperlink?: unknown;
};
