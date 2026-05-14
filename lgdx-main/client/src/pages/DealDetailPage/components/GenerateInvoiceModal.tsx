import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/common/Modal/Modal';
import Button from '../../../components/common/Button/Button';
import Input from '../../../components/common/Input/Input';
import styles from './GenerateInvoiceModal.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';
import api from '../../../api';
import { Address, Company, Deal, Product } from '../../../types';

import { jsPDF } from 'jspdf';

/** Methods present on runtime jsPDF but missing from strict typings */
type JsPdfWithTextTools = jsPDF & {
  splitTextToSize?: (text: string, maxWidth: number) => string[];
  setCharSpace?: (charSpace: number) => void;
};

/** Populated product row may carry legacy/alternate certificate field names */
type InvoiceLineProduct = Product & { certificateInstituteName?: string };

type TextBlock = string;
type Money = number;

interface GenerateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: Deal;
  generatedInvoiceFilename: string;
  onUploadGeneratedInvoice: (file: File) => Promise<void> | void;
}

interface InvoiceItem {
  id: string;
  certificate: string;
  description: string;
  qty: number;
  unitPrice: Money;
}

interface InvoiceDraft {
  invoiceNumber: string;
  invoiceDate: string; // en-US display string
  dueDate: string; // en-US display string
  currency: string;

  items: InvoiceItem[];
  shipping: Money;
  importTariff: Money;
  paymentInstructions: TextBlock;
  notes: TextBlock;
  totalDueMode: 'auto' | 'manual';
  totalDueManual: Money;
  sellerLogoUrl?: string;

  seller: {
    name: string;
    email?: string;
    phone?: string;
    addressText: TextBlock;
    bankText: TextBlock;
    taxText: TextBlock;
  };

  buyer: {
    name: string;
    addressText: TextBlock;
  };
}

const safeId = (): string => `it_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

const toMoney = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clampNonNegative = (n: number): number => (Number.isFinite(n) ? Math.max(0, n) : 0);

const clampPositiveQty = (v: unknown, fallback = 1): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
};

const resolveLogoFetchPath = (rawUrl?: string): string | null => {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('/uploads/')) {
    const filename = rawUrl.split('/').pop();
    // IMPORTANT: axios baseURL already includes "/api" — using a leading "/" would drop it.
    return filename ? `files/company_logos/${filename}` : null;
  }
  if (rawUrl.startsWith('/api/files/')) return rawUrl.replace(/^\/api\//, '');
  if (rawUrl.startsWith('/files/')) return rawUrl.replace(/^\//, '');
  return null;
};

const addDays = (d: Date, days: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

const inferJsPdfImageFormat = (dataUrl: string): 'PNG' | 'JPEG' => {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  const mime = m?.[1]?.toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'JPEG';
  return 'PNG';
};

const getImageSize = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });

/** Single-line legal address (comma-separated). */
const buildLegalAddressOneLine = (addr?: Address): string => {
  if (!addr) return '';
  const cityState = [addr.city, addr.stateProvinceRegion].filter(Boolean).join(', ');
  const cityPostal = [cityState, addr.postalCode].filter(Boolean).join(' ').trim();
  const parts = [addr.addressLine1, addr.addressLine2, cityPostal || undefined, addr.country].filter(Boolean) as string[];
  return parts.join(', ');
};

/** At most two lines: prefer one comma-separated line; split near midpoint at a comma if too long. */
const buildLegalAddressMaxTwoLines = (addr?: Address): string => {
  const one = buildLegalAddressOneLine(addr).trim();
  if (!one) return '';
  const maxSingle = 92;
  if (one.length <= maxSingle) return one;
  const mid = Math.floor(one.length / 2);
  let splitIdx = one.lastIndexOf(', ', mid + 28);
  if (splitIdx < 12) splitIdx = one.indexOf(', ', Math.max(0, mid - 28));
  if (splitIdx < 0) return one;
  return `${one.slice(0, splitIdx).trim()}\n${one.slice(splitIdx + 2).trim()}`;
};

const buildBankText = (company?: Company): string => {
  const bank = company?.details?.bankInformation;
  const corr = bank?.correspondentBank;

  const lines = [
    bank?.bankName && `Bank: ${bank.bankName}`,
    bank?.accountName && `Account Name: ${bank.accountName}`,
    bank?.accountNumber && `Account Number: ${bank.accountNumber}`,
    bank?.routingNumber && `Routing Number: ${bank.routingNumber}`,
    bank?.swiftCode && `SWIFT Code: ${bank.swiftCode}`,
    bank?.bankAddress && `Bank Address: ${bank.bankAddress}`,
    corr?.bankName && `Correspondent Bank: ${corr.bankName}`,
    corr?.accountNumber && `Correspondent Account: ${corr.accountNumber}`,
    corr?.swiftCode && `Correspondent SWIFT: ${corr.swiftCode}`,
    corr?.bankAddress && `Correspondent Address: ${corr.bankAddress}`,
  ].filter(Boolean) as string[];

  return lines.length ? lines.join('\n') : 'Bank details: N/A';
};

const buildTaxText = (company?: Company): string => {
  const tax = company?.details?.taxInformation;
  if (!tax) return 'Tax ID: N/A';

  const lines = [
    tax.taxId && `Tax ID: ${tax.taxId}`,
    tax.vatNumber && `VAT Number: ${tax.vatNumber}`,
    typeof tax.worksWithVat === 'boolean' && `Works with VAT: ${tax.worksWithVat ? 'Yes' : 'No'}`,
  ].filter(Boolean) as string[];

  return lines.length ? lines.join('\n') : 'Tax ID: N/A';
};

const getCompanyName = (ref?: Company | string): string => {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref.name || '';
};

const formatMoney = (n: number): string => {
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toFixed(2);
};

const calcItemsSubtotal = (items: InvoiceItem[]): number =>
  items.reduce((sum, it) => sum + clampPositiveQty(it.qty, 1) * clampNonNegative(toMoney(it.unitPrice, 0)), 0);

const calcTotalAuto = (draft: Pick<InvoiceDraft, 'items' | 'shipping' | 'importTariff'>): number =>
  calcItemsSubtotal(draft.items) + clampNonNegative(toMoney(draft.shipping, 0)) + clampNonNegative(toMoney(draft.importTariff, 0));

/** Grid table without jspdf-autotable (avoids bundler / DocHandler issues). */
const drawInvoiceItemsGrid = (
  doc: jsPDF,
  opts: {
    startY: number;
    margin: number;
    pageWidth: number;
    pageHeight: number;
    head: string[];
    body: string[][];
  },
): number => {
  // Minimal, premium-looking table: subtle header fill + horizontal separators only.
  const pad = 10;
  const lineRgb: [number, number, number] = [210, 210, 210];
  const headFill: [number, number, number] = [242, 242, 242];
  const innerW = opts.pageWidth - opts.margin * 2;
  const wCert = 140;
  const wQty = 46;
  const wUnit = 86;
  const wAmt = 86;
  const wDesc = Math.max(64, innerW - wCert - wQty - wUnit - wAmt);
  const colW = [wCert, wDesc, wQty, wUnit, wAmt];

  const tableLeft = opts.margin;
  const colXs: number[] = [];
  let xAcc = tableLeft;
  for (const w of colW) {
    colXs.push(xAcc);
    xAcc += w;
  }
  const tableRight = colXs[4] + colW[4];
  const bottomLimit = opts.pageHeight - opts.margin;

  let y = opts.startY;

  const measureRow = (cells: string[], fontSize: number, bold: boolean): { lines: string[][]; rowH: number; lineH: number } => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const lineH = fontSize * 1.18;
    const lines = cells.map((raw, colIdx) => {
      const txt = (raw ?? '').trim() || ' ';
      const usable = Math.max(16, colW[colIdx] - pad * 2);
      return doc.splitTextToSize(txt, usable);
    });
    const maxLines = Math.max(1, ...lines.map((ln) => ln.length));
    const rowH = maxLines * lineH + pad * 2;
    return { lines, rowH, lineH };
  };

  const drawOneRow = (cells: string[], fontSize: number, bold: boolean, isHead: boolean) => {
    const { lines, rowH, lineH } = measureRow(cells, fontSize, bold);
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = opts.margin;
    }

    if (isHead) {
      doc.setFillColor(headFill[0], headFill[1], headFill[2]);
      doc.rect(tableLeft, y, tableRight - tableLeft, rowH, 'F');
    }

    doc.setDrawColor(lineRgb[0], lineRgb[1], lineRgb[2]);
    doc.setLineWidth(0.6);
    // Top border for header; bottom border for every row.
    if (isHead) doc.line(tableLeft, y, tableRight, y);
    doc.line(tableLeft, y + rowH, tableRight, y + rowH);

    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(isHead ? 24 : 30, isHead ? 24 : 30, isHead ? 24 : 30);

    for (let col = 0; col < cells.length; col++) {
      const rightAligned = col >= 2;
      const cellRight = colXs[col] + colW[col] - pad;
      const cellLeft = colXs[col] + pad;
      let ty = y + pad + fontSize;
      for (const piece of lines[col]) {
        if (rightAligned) {
          doc.text(piece, cellRight, ty, { align: 'right' });
        } else {
          doc.text(piece, cellLeft, ty);
        }
        ty += lineH;
      }
    }
    doc.setTextColor(0, 0, 0);

    y += rowH;
  };

  drawOneRow(opts.head, 10, true, true);
  for (const row of opts.body) {
    drawOneRow(row, 9.8, false, false);
  }

  return y;
};

const generateInvoicePdfBlob = async (docData: {
  deal: Deal;
  draft: InvoiceDraft;
}): Promise<Blob> => {
  const { deal, draft } = docData;

  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  // Larger page margin makes the document feel less "cramped" (premium invoices tend to breathe).
  const margin = 62;
  const maxWidth = pageWidth - margin * 2;
  // Give the header noticeable top air.
  let y = 92;

  const ensureRoom = (minRemaining: number) => {
    if (y + minRemaining <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const drawMultiline = (text: string, x: number, startY: number, maxW: number, lineH = 12) => {
    // IMPORTANT: jsPDF methods rely on `this` (they access `this.internal`).
    // Do NOT detach methods like `const split = doc.splitTextToSize` — it will crash with "reading 'internal'".
    const d = doc as JsPdfWithTextTools;
    const splitToSize =
      typeof d.splitTextToSize === 'function'
        ? (d.splitTextToSize.bind(doc) as (t: string, w: number) => string[])
        : null;
    let yy = startY;
    for (const para of text.split(/\n+/)) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const lines = splitToSize ? splitToSize(trimmed, maxW) : [trimmed];
      for (const ln of lines) {
        doc.text(String(ln), x, yy);
        yy += lineH;
      }
    }
    return yy;
  };

  // Header (reference layout): left = logo + company + contacts; right = serif INVOICE + meta block
  const headerTopY = y;
  // Slightly inset meta block from the right edge.
  const metaValueX = pageWidth - margin - 34;
  const metaLabelX = metaValueX - 178;
  const leftColW = Math.max(230, metaLabelX - margin - 32);
  const leftX = margin;

  let leftY = headerTopY;
  try {
    const logoPath = resolveLogoFetchPath(draft.sellerLogoUrl);
    if (logoPath) {
      const resp = await api.get(logoPath, { responseType: 'blob' });
      const dataUrl = await blobToDataUrl(resp.data);
      const fmt = inferJsPdfImageFormat(dataUrl);
      const maxLogoW = 128;
      const maxLogoH = 52;
      const { width: iw, height: ih } = await getImageSize(dataUrl);
      const safeIw = iw > 0 ? iw : 1;
      const safeIh = ih > 0 ? ih : 1;
      const scale = Math.min(maxLogoW / safeIw, maxLogoH / safeIh, 1);
      const drawW = safeIw * scale;
      const drawH = safeIh * scale;
      doc.addImage(dataUrl, fmt, leftX, leftY, drawW, drawH, undefined, 'FAST');
      // Extra air between logo and company name reads more premium.
      leftY += drawH + 18;
    }
  } catch {
    // non-fatal: skip logo
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(22, 22, 22);
  doc.text(draft.seller.name || '', leftX, leftY);
  leftY += 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(55, 55, 55);
  const identity = [draft.seller.email, draft.seller.phone].filter(Boolean).join(' • ');
  if (identity) {
    leftY = drawMultiline(identity, leftX, leftY, leftColW, 13);
  }
  doc.setTextColor(0, 0, 0);

  // Right: large serif title, then metadata (labels / values)
  let rightY = headerTopY + 2;
  doc.setFont('times', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(18, 18, 18);
  const docTools = doc as JsPdfWithTextTools;
  if (typeof docTools.setCharSpace === 'function') docTools.setCharSpace(1.1);
  doc.text('INVOICE', metaValueX, rightY, { align: 'right' });
  if (typeof docTools.setCharSpace === 'function') docTools.setCharSpace(0);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  rightY += 34;

  const drawMeta = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(35, 35, 35);
    doc.text(label, metaLabelX, rightY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(22, 22, 22);
    doc.text(value, metaValueX, rightY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    rightY += 15;
  };

  drawMeta('Invoice #', draft.invoiceNumber || '');
  drawMeta('Issue date', draft.invoiceDate || '');
  drawMeta('Due date', draft.dueDate || '');

  // Space after header before parties.
  y = Math.max(leftY, rightY) + 36;

  // Parties — "Bill To" left edge aligns with invoice meta labels (Invoice # / Issue date / Due date)
  const partiesGap = 80;
  const fromX = margin;
  const billToX = metaLabelX;
  const billToW = metaValueX - metaLabelX;
  const fromW = Math.max(100, billToX - partiesGap - fromX);

  const drawParty = (title: string, x: number, startY: number, colW: number, lines: Array<string | undefined>) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(28, 28, 28);
    doc.text(title, x, startY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(45, 45, 45);
    const text = lines.filter(Boolean).join('\n');
    const endY = drawMultiline(text, x, startY + 16, colW, 13);
    doc.setTextColor(0, 0, 0);
    return endY;
  };

  // Header already shows seller email/phone; keep "From" focused on address.
  const fromLines: Array<string | undefined> = [draft.seller.name, draft.seller.addressText];
  const billToLines: Array<string | undefined> = [draft.buyer.name, draft.buyer.addressText];

  const fromEndY = drawParty('From', fromX, y, fromW, fromLines);
  const billToEndY = drawParty('Bill To', billToX, y, billToW, billToLines);
  // More separation between addresses and divider line.
  y = Math.max(fromEndY, billToEndY) + 28;

  doc.setDrawColor(210);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  // Table should not hug the divider.
  y += 28;

  // Items table (perfect alignment)
  const rows = draft.items.map((it) => {
    const qty = clampPositiveQty(it.qty, 1);
    const unit = clampNonNegative(toMoney(it.unitPrice, 0));
    const amount = qty * unit;
    return [
      it.certificate?.trim() || '',
      it.description?.trim() || '',
      String(qty),
      formatMoney(unit),
      formatMoney(amount),
    ];
  });

  y = drawInvoiceItemsGrid(doc, {
    startY: y,
    margin,
    pageWidth,
    pageHeight,
    head: ['Certificate', 'Description', 'Qty', 'Unit Price', 'Amount'],
    body: rows.length ? rows : [['', '', '1', '0.00', '0.00']],
  });

  y += 14;

  // Totals
  const subtotal = calcItemsSubtotal(draft.items);
  const shipping = clampNonNegative(toMoney(draft.shipping, 0));
  const importTariff = clampNonNegative(toMoney(draft.importTariff, 0));
  const totalAuto = subtotal + shipping + importTariff;
  const totalDue = draft.totalDueMode === 'manual' ? clampNonNegative(toMoney(draft.totalDueManual, totalAuto)) : totalAuto;

  const totalsX = pageWidth - margin;
  const labelX = totalsX - 180;

  const drawTotalLine = (label: string, value: string, isBold = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 12.8 : 10);
    doc.setTextColor(isBold ? 18 : 45, isBold ? 18 : 45, isBold ? 18 : 45);
    doc.text(label, labelX, y);
    doc.text(value, totalsX, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += isBold ? 19 : 13.5;
  };

  drawTotalLine('Subtotal', formatMoney(subtotal));
  if (shipping !== 0) drawTotalLine('Shipping', formatMoney(shipping));
  if (importTariff !== 0 && deal.dealType === 'buyer-to-lgdeal') drawTotalLine('Import tariff', formatMoney(importTariff));
  doc.setDrawColor(70);
  doc.setLineWidth(0.6);
  doc.line(labelX, y + 2, totalsX, y + 2);
  y += 14;
  // Total Due highlight row
  const totalRowY = y - 10;
  const boxX = labelX - 10;
  const boxW = totalsX - boxX + 10;
  const boxH = 22;
  doc.setFillColor(245, 245, 245);
  doc.rect(boxX, totalRowY, boxW, boxH, 'F');
  y = totalRowY + 16;
  drawTotalLine('Total Due', `${formatMoney(totalDue)} ${draft.currency}`, true);

  y += 12;
  ensureRoom(120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(28, 28, 28);
  doc.text('Payment Instructions', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.7);
  doc.setTextColor(48, 48, 48);
  y = drawMultiline(draft.paymentInstructions || '', margin, y, maxWidth, 11.5);
  doc.setTextColor(0, 0, 0);
  y += 14;

  ensureRoom(48);
  if (draft.notes?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(72, 72, 72);
    y = drawMultiline(draft.notes.trim(), margin, y, maxWidth, 11.5);
    doc.setTextColor(0, 0, 0);
  }

  return doc.output('blob');
};

const reportClientError = async (payload: {
  message: string;
  stack?: string;
  where: string;
  extra?: unknown;
}): Promise<void> => {
  try {
    await api.post('/client-logs/error', {
      message: payload.message,
      stack: payload.stack,
      where: payload.where,
      href: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      extra: payload.extra,
    });
  } catch {
    // best-effort only
  }
};

const GenerateInvoiceModal: React.FC<GenerateInvoiceModalProps> = ({
  isOpen,
  onClose,
  deal,
  onUploadGeneratedInvoice,
  generatedInvoiceFilename,
}) => {
  const [isCompanyLoading, setIsCompanyLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const initialInvoiceDraft: InvoiceDraft = useMemo(() => {
    const now = new Date();
    const invoiceDate = now.toLocaleDateString('en-US');
    const dueDate = addDays(now, 7).toLocaleDateString('en-US');

    const items: InvoiceItem[] = (deal.products || []).map((p) => {
      const prod = p.product as InvoiceLineProduct;
      const certificate = prod?.certificateNumber || '';
      const institute = prod?.certificateInstitute || prod?.certificateInstituteName || '';
      const location = prod?.location || '';
      const shape = prod?.shape || '';
      const carat = prod?.carat != null ? `${prod.carat}` : '';
      const color = prod?.color || '';
      const clarity = prod?.clarity || '';
      const descParts = [shape && `${shape}`, carat && `${carat} ct`, color && `${color}`, clarity && `${clarity}`, location && `${location}`].filter(Boolean) as string[];
      const description = descParts.join(' / ') || 'N/A';
      const certLine = [certificate && `${certificate}`, institute && institute].filter(Boolean).join(' - ') || '';

      return {
        id: safeId(),
        certificate: certLine,
        description,
        qty: 1,
        unitPrice: clampNonNegative(toMoney(p.price ?? 0, 0)),
      };
    });

    const shipping = clampNonNegative(toMoney(deal.shippingDetails?.cost ?? 0, 0));
    const importTariffRaw = clampNonNegative(toMoney(deal.shippingDetails?.importTariff ?? 0, 0));
    const importTariff = deal.dealType === 'buyer-to-lgdeal' ? importTariffRaw : 0;
    const totalAuto = calcItemsSubtotal(items) + shipping + importTariff;
    const totalManual = clampNonNegative(toMoney(deal.amount ?? totalAuto, totalAuto));

    return {
      invoiceNumber: deal.dealNumber || '',
      invoiceDate,
      dueDate,
      currency: deal.currency || 'USD',

      items,
      shipping,
      importTariff,
      paymentInstructions: buildBankText(undefined),
      notes: 'Thank you for your business.',
      totalDueMode: 'auto',
      totalDueManual: totalManual,

      seller: {
        name: '',
        email: '',
        phone: '',
        addressText: '',
        bankText: 'Bank details: N/A',
        taxText: 'Tax ID: N/A',
      },
      buyer: {
        name: getCompanyName(deal.buyerCompanyId as Company | string | undefined) || '',
        addressText: buildLegalAddressMaxTwoLines(
          typeof deal.buyerCompanyId === 'object' && deal.buyerCompanyId?.details?.legalAddress
            ? (deal.buyerCompanyId.details.legalAddress as Address)
            : undefined,
        ),
      },
      sellerLogoUrl: undefined,
    };
  }, [deal.amount, deal.buyerCompanyId, deal.currency, deal.dealNumber, deal.dealType, deal.products, deal.shippingDetails?.cost, deal.shippingDetails?.importTariff]);

  const [draft, setDraft] = useState<InvoiceDraft>(initialInvoiceDraft);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(initialInvoiceDraft);
    setError(null);

    const loadCompanyProfile = async () => {
      setIsCompanyLoading(true);
      try {
        const resp = await api.get<Company>('/company/profile');
        setCompany(resp.data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load company profile';
        setError(msg);
      } finally {
        setIsCompanyLoading(false);
      }
    };

    void loadCompanyProfile();
  }, [isOpen, initialInvoiceDraft]);

  useEffect(() => {
    if (!company) return;
    setDraft((prev) => ({
      ...prev,
      sellerLogoUrl: company.details?.logo?.url,
      seller: {
        ...prev.seller,
        name: company.name || prev.seller.name,
        email: company.details?.email || prev.seller.email,
        phone: company.details?.phone || prev.seller.phone,
        addressText: buildLegalAddressMaxTwoLines(company.details?.legalAddress),
        bankText: buildBankText(company),
        taxText: buildTaxText(company),
      },
      paymentInstructions:
        prev.paymentInstructions && prev.paymentInstructions !== buildBankText(undefined) ? prev.paymentInstructions : buildBankText(company),
    }));
  }, [company]);

  const handleDraftChange = (key: 'invoiceNumber' | 'invoiceDate' | 'dueDate' | 'currency') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSellerChange = (field: keyof InvoiceDraft['seller']) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft((prev) => ({ ...prev, seller: { ...prev.seller, [field]: value } }));
  };

  const handleBuyerChange = (field: keyof InvoiceDraft['buyer']) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft((prev) => ({ ...prev, buyer: { ...prev.buyer, [field]: value } }));
  };

  const setItemField = (id: string, field: keyof Omit<InvoiceItem, 'id'>, value: string) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== id) return it;
        if (field === 'unitPrice') return { ...it, unitPrice: clampNonNegative(toMoney(value, it.unitPrice)) };
        if (field === 'qty') return { ...it, qty: clampPositiveQty(value, it.qty) };
        return { ...it, [field]: value } as InvoiceItem;
      }),
    }));
  };

  const removeItem = (id: string) => {
    setDraft((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
  };

  const addItem = () => {
    setDraft((prev) => ({
      ...prev,
      items: [...prev.items, { id: safeId(), certificate: '', description: '', qty: 1, unitPrice: 0 }],
    }));
  };

  const subtotal = useMemo(() => calcItemsSubtotal(draft.items), [draft.items]);
  const totalAuto = useMemo(() => calcTotalAuto({ items: draft.items, shipping: draft.shipping, importTariff: draft.importTariff }), [draft.importTariff, draft.items, draft.shipping]);
  const totalDue = useMemo(() => {
    if (draft.totalDueMode === 'manual') return clampNonNegative(toMoney(draft.totalDueManual, totalAuto));
    return totalAuto;
  }, [draft.totalDueManual, draft.totalDueMode, totalAuto]);

  const handleUploadGenerated = async () => {
    setError(null);
    setIsGeneratingPdf(true);
    try {
      const blob = await generateInvoicePdfBlob({ deal, draft });
      const file = new File([blob], generatedInvoiceFilename, { type: 'application/pdf' });
      await onUploadGeneratedInvoice(file);
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to generate PDF invoice');
      const stack = typeof err.stack === 'string' ? err.stack : '';
      const stackPreview = stack
        .split('\n')
        .slice(0, 8)
        .join('\n')
        .trim();
      void reportClientError({
        message: err.message,
        stack,
        where: 'GenerateInvoiceModal.handleUploadGenerated',
        extra: { dealId: deal._id, dealNumber: deal.dealNumber, filename: generatedInvoiceFilename },
      });
      setError(stackPreview ? `${err.message}\n\n${stackPreview}` : err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Generate Invoice"
      size="xl"
      closeOnOverlayClick={false}
      closeOnEscape={true}
      footer={
        <>
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleUploadGenerated()}
            loading={isCompanyLoading || isGeneratingPdf}
            disabled={isCompanyLoading || isGeneratingPdf}
          >
            Upload invoice
          </Button>
        </>
      }
    >
      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.grid}>
        <div className={styles.leftCol}>
          <div className={styles.sectionTitle}>Invoice</div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldSmall}>
              <label className={styles.label}>Invoice Number</label>
              <Input value={draft.invoiceNumber} onChange={handleDraftChange('invoiceNumber')} />
            </div>
            <div className={styles.fieldSmall}>
              <label className={styles.label}>Date</label>
              <Input value={draft.invoiceDate} onChange={handleDraftChange('invoiceDate')} />
            </div>
            <div className={styles.fieldSmall}>
              <label className={styles.label}>Due date</label>
              <Input value={draft.dueDate} onChange={handleDraftChange('dueDate')} />
            </div>
          </div>

          <div className={styles.sectionTitle}>Items</div>
          <div className={styles.itemsToolbar}>
            <Button variant="secondary" size="sm" onClick={addItem}>
              <i className={`fas fa-plus ${dealIconStyles.iconMarginEnd}`} />
              Add item
            </Button>
          </div>

          <div className={styles.itemsTable}>
            <div className={styles.itemsHeader}>
              <div>Certificate</div>
              <div>Description</div>
              <div className={styles.num}>Qty</div>
              <div className={styles.num}>Unit</div>
              <div className={styles.num}>Amount</div>
              <div />
            </div>

            {draft.items.map((it) => {
              const amount = clampPositiveQty(it.qty, 1) * clampNonNegative(toMoney(it.unitPrice, 0));
              return (
                <div key={it.id} className={styles.itemsRow}>
                  <input
                    className={styles.cellInput}
                    value={it.certificate}
                    onChange={(e) => setItemField(it.id, 'certificate', e.target.value)}
                    placeholder="Certificate"
                  />
                  <input
                    className={styles.cellInput}
                    value={it.description}
                    onChange={(e) => setItemField(it.id, 'description', e.target.value)}
                    placeholder="Description"
                  />
                  <input
                    className={`${styles.cellInput} ${styles.num}`}
                    value={String(it.qty)}
                    onChange={(e) => setItemField(it.id, 'qty', e.target.value)}
                    inputMode="numeric"
                  />
                  <input
                    className={`${styles.cellInput} ${styles.num}`}
                    value={String(it.unitPrice)}
                    onChange={(e) => setItemField(it.id, 'unitPrice', e.target.value)}
                    inputMode="decimal"
                  />
                  <div className={`${styles.amountCell} ${styles.num}`}>{formatMoney(amount)}</div>
                  <button type="button" className={styles.removeBtn} onClick={() => removeItem(it.id)} title="Remove item" aria-label="Remove item">
                    &times;
                  </button>
                </div>
              );
            })}
          </div>

          <div className={styles.sectionTitle}>Payment Instructions</div>
          <textarea
            className={styles.textarea}
            value={draft.paymentInstructions}
            onChange={(e) => setDraft((p) => ({ ...p, paymentInstructions: e.target.value }))}
            rows={6}
            placeholder="How should the buyer pay?"
          />

          <div className={styles.sectionTitle}>Notes</div>
          <textarea
            className={styles.textarea}
            value={draft.notes}
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
            rows={4}
            placeholder="Optional notes..."
          />

          <div className={styles.sectionTitle}>Totals</div>

          <div className={styles.totalsGrid}>
            <div className={styles.totalLine}>
              <span className={styles.totalLabel}>Subtotal</span>
              <span className={styles.totalValue}>{formatMoney(subtotal)}</span>
            </div>

            <div className={styles.totalLine}>
              <span className={styles.totalLabel}>Shipping</span>
              <input
                className={styles.totalInput}
                value={String(draft.shipping)}
                onChange={(e) => setDraft((p) => ({ ...p, shipping: clampNonNegative(toMoney(e.target.value, p.shipping)) }))}
                inputMode="decimal"
              />
            </div>

            {deal.dealType === 'buyer-to-lgdeal' && (
              <div className={styles.totalLine}>
                <span className={styles.totalLabel}>Import tariff</span>
                <input
                  className={styles.totalInput}
                  value={String(draft.importTariff)}
                  onChange={(e) => setDraft((p) => ({ ...p, importTariff: clampNonNegative(toMoney(e.target.value, p.importTariff)) }))}
                  inputMode="decimal"
                />
              </div>
            )}

            <div className={styles.totalModeRow}>
              <label className={styles.modeLabel}>
                <input
                  type="radio"
                  name="totalDueMode"
                  checked={draft.totalDueMode === 'auto'}
                  onChange={() => setDraft((p) => ({ ...p, totalDueMode: 'auto' }))}
                />
                Auto total
              </label>
              <label className={styles.modeLabel}>
                <input
                  type="radio"
                  name="totalDueMode"
                  checked={draft.totalDueMode === 'manual'}
                  onChange={() => setDraft((p) => ({ ...p, totalDueMode: 'manual' }))}
                />
                Manual total
              </label>
            </div>

            <div className={styles.totalLineStrong}>
              <span className={styles.totalLabel}>Total Due</span>
              {draft.totalDueMode === 'manual' ? (
                <input
                  className={styles.totalInputStrong}
                  value={String(draft.totalDueManual)}
                  onChange={(e) => setDraft((p) => ({ ...p, totalDueManual: clampNonNegative(toMoney(e.target.value, p.totalDueManual)) }))}
                  inputMode="decimal"
                />
              ) : (
                <span className={styles.totalValueStrong}>{formatMoney(totalDue)} {draft.currency}</span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.rightCol}>
          <div className={styles.sectionTitle}>Parties</div>

          <div className={styles.field}>
            <label className={styles.label}>From (Seller)</label>
            <Input value={draft.seller.name} onChange={handleSellerChange('name')} />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldSmall}>
              <label className={styles.label}>Email</label>
              <Input value={draft.seller.email || ''} onChange={handleSellerChange('email')} />
            </div>
            <div className={styles.fieldSmall}>
              <label className={styles.label}>Phone</label>
              <Input value={draft.seller.phone || ''} onChange={handleSellerChange('phone')} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Seller Address</label>
            <textarea
              className={styles.textarea}
              value={draft.seller.addressText}
              onChange={handleSellerChange('addressText')}
              rows={5}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Seller Bank Details</label>
            <textarea
              className={styles.textarea}
              value={draft.seller.bankText}
              onChange={handleSellerChange('bankText')}
              rows={6}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Seller Tax Information</label>
            <textarea
              className={styles.textarea}
              value={draft.seller.taxText}
              onChange={handleSellerChange('taxText')}
              rows={4}
            />
          </div>

          <div className={styles.sectionTitle}>Buyer</div>
          <div className={styles.field}>
            <label className={styles.label}>To (Buyer)</label>
            <Input value={draft.buyer.name} onChange={handleBuyerChange('name')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Buyer Address</label>
            <textarea
              className={styles.textarea}
              value={draft.buyer.addressText}
              onChange={handleBuyerChange('addressText')}
              rows={6}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default GenerateInvoiceModal;

