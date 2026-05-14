/**
 * Maps Diamond Atelier GetStockListCertified rows → Stonee catalog diamond shape.
 * Field names vary by partner API builds — extend `cell()` aliases when the vendor documents columns.
 */

function cell(row: Record<string, unknown>, names: string[]): unknown {
  const keys = Object.keys(row);
  for (const want of names) {
    const hit = keys.find(k => k.toLowerCase() === want.toLowerCase());
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = toStr(v).replace(/,/g, '');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function splitMeasurements(raw: string): { text: string; lxw: number } {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return { text: '—', lxw: 1 };
  const parts = t.split(/[x×]/i).map(s => s.trim()).filter(Boolean).map(Number.parseFloat);
  if (parts.length >= 2 && parts.every(Number.isFinite)) {
    const [a, b] = parts as [number, number];
    const ratio = a >= b ? a / b : b / a;
    return { text: t, lxw: Math.round(ratio * 100) / 100 };
  }
  return { text: t, lxw: 1 };
}

/** Returns Stonee diamond payload or null if row has no usable SKU. */
export function mapAtelierRowToStoneeDiamond(
  row: Record<string, unknown>,
  supplierId: string,
): Record<string, unknown> | null {
  const sku = toStr(
    cell(row, [
      'VPACKET_NO',
      'Vpacket_No',
      'Stock_No',
      'stock_no',
      'StockNo',
      'SKU',
      'Lot_No',
      'Stone_ID',
      'StoneNo',
      'StockID',
      'StockId',
    ]),
  );
  if (!sku) return null;

  const shapeRaw = toStr(cell(row, ['Shape', 'SHAPE', 'Shape_Name', 'SHAPE_NAME', 'CutShape'])) || 'Round';
  const shape = shapeRaw ? shapeRaw.charAt(0) + shapeRaw.slice(1).toLowerCase() : 'Round';

  const carat = toNum(
    cell(row, ['Carat', 'CARAT', 'Carats', 'Carat_Wt', 'Weight', 'Size_carat', 'WGT', 'Cts', 'CT']),
    0,
  );
  if (!(carat > 0)) return null;

  const color = toStr(cell(row, ['Color', 'COLOR', 'Col', 'Colour'])) || 'G';
  const clarity = toStr(
    cell(row, ['Clarity', 'CLARITY', 'Cla', 'Clarity_Name', 'PURITY', 'Purity', 'Pur']),
  ) || 'VS1';

  const cutRaw = toStr(cell(row, ['Cut', 'CUT', 'Cut_Grade', 'CutGrade'])) || 'Excellent';
  const cutNorm = cutRaw.toUpperCase();
  const cut =
    cutNorm === 'ID' || cutNorm === 'IDEAL'
      ? 'Ideal'
      : cutNorm === 'EX' || cutNorm === 'EXCELLENT'
        ? 'Excellent'
        : cutNorm === 'VG' || cutNorm === 'VERY GOOD'
          ? 'Very Good'
          : cutRaw;

  const depthPercentage = toNum(
    cell(row, ['DEPTH_PER', 'Depth_Per', 'Dept_Per', 'Depth%', 'Depth', 'DEPTH']),
    62,
  );
  const tablePercentage = toNum(
    cell(row, ['TABLE_PER', 'Tbl_Per', 'Table_Per', 'Table%', 'Table', 'TABLE']),
    57,
  );

  const symmRaw = toStr(cell(row, ['Symmetry', 'SYMMETRY', 'Sym', 'SYM', 'SYMM'])) || 'Excellent';
  const symmU = symmRaw.toUpperCase();
  const symmetry =
    symmU === 'EX' || symmU === 'EXCELLENT' ? 'Excellent' : symmU === 'VG' ? 'Very Good' : symmRaw;

  const polRaw = toStr(cell(row, ['Polish', 'POLISH', 'Pol', 'POL'])) || 'Excellent';
  const polU = polRaw.toUpperCase();
  const polish = polU === 'EX' || polU === 'EXCELLENT' ? 'Excellent' : polU === 'VG' ? 'Very Good' : polRaw;

  const flRaw = toStr(cell(row, ['Fluorescence', 'FLUORESCENCE', 'Flour', 'Fluor', 'FL', 'FLS'])) || 'None';
  const flU = flRaw.toUpperCase();
  const fluorescence =
    flU === 'NON' || flU === 'NONE' || flU === 'NIL' || flU === 'NO' ? 'None' : flRaw;

  const measRaw =
    toStr(cell(row, ['Measurement', 'MEASUREMENT', 'Meas', 'Measurements', 'Size', 'MM'])) || '6x6x3.8';
  const { text: measurements, lxw: lxwRatio } = splitMeasurements(measRaw);

  const lab = toStr(cell(row, ['Lab', 'LAB', 'Lab_Name', 'Laboratory', 'Grading_Lab'])) || 'IGI';
  const certificateNumber =
    toStr(
      cell(row, [
        'Certificate_No',
        'CertificateNo',
        'Certificate',
        'Cert_No',
        'Report_No',
        'REPORT_NO',
        'ReportNo',
        'IGI',
        'GIA_No',
      ]),
    ) || `DA-${sku}`;

  const certificateUrl = toStr(cell(row, ['CERT_LINK', 'Cert_Link', 'Certificate_Url', 'CertUrl']));

  const netValue = toNum(cell(row, ['NET_VALUE', 'Net_Value', 'NetValue']), 0);
  const listPrice = toNum(
    cell(row, [
      'Sale_Price',
      'Price',
      'Amount',
      'Total_Price',
      'Rap_Price',
      'Price_PER_CT',
      'Rate',
      'Amt',
      'VALUE',
      'Value',
    ]),
    0,
  );
  const netRate = toNum(cell(row, ['NET_RATE', 'Net_Rate', 'NetRate']), 0);
  const priceFromRate = netRate > 0 && carat > 0 ? netRate * carat : 0;
  const price =
    netValue > 0 ? netValue : listPrice > 0 ? listPrice : priceFromRate > 0 ? priceFromRate : toNum(cell(row, ['Rap']), 0);
  const supplierPrice = Math.max(1, Math.round(price * 0.72));

  const img1 = toStr(
    cell(row, ['Image_Link', 'Photo', 'Img1', 'Image', 'Diamond_Image', 'Pic', 'DIAMOND_IMAGE']),
  );
  const images = img1 ? [img1] : [];
  const videoUrl = toStr(cell(row, ['DIAMOND_VIDEO', 'Diamond_Video', 'Video_Link', 'VideoUrl', 'videoUrl']));

  const out: Record<string, unknown> = {
    sku,
    shape,
    carat,
    color,
    clarity,
    cut,
    depthPercentage,
    tablePercentage,
    symmetry,
    polish,
    fluorescence,
    measurements,
    lxwRatio,
    lab,
    certificateNumber,
    images,
    supplierId,
    price: Math.max(price, supplierPrice + 1),
    supplierPrice,
    availability: 'in-stock',
  };
  if (certificateUrl) out.certificateUrl = certificateUrl;
  if (videoUrl) out.videoUrl = videoUrl;
  return out;
}

export function extractAtelierTable(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  for (const k of ['Table', 'table', 'Data', 'data', 'StockList', 'Result', 'Rows']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  const data = o.Data ?? o.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of ['Table', 'table', 'StockList']) {
      if (Array.isArray(d[k])) return d[k] as unknown[];
    }
  }
  return null;
}
