// Server-side twin of Frontend/src/utils/receiptPdf.js — same jsPDF layout,
// used to build the PDF Buffer attached to the receipt email (utils/mailer.js
// sendReceiptEmail). The frontend's own copy stays as-is for the in-app
// "Download Receipt" button; duplicated rather than shared because the two
// apps are separate deployables with no shared package, and the only real
// difference is where the logo bytes come from (fetch() vs fs.readFileSync).
const fs = require("fs");
const path = require("path");
const { jsPDF } = require("jspdf");
const { tierLabel } = require("./tiers");
// v5's CJS export shape mirrors its ESM default export — a standalone
// autoTable(doc, options) function, not the older doc.autoTable() plugin
// style. Same call shape as Frontend/src/utils/receiptPdf.js's `import
// autoTable from "jspdf-autotable"`.
const autoTable = require("jspdf-autotable").default;
const { COMPANY } = require("./companyInfo");

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BRAND = {
  navy: "#0f1f3d",
  teal: "#0f9488",
  text: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  rowAlt: "#f4f7fb",
};

const PDF_SYMBOL = "Rs. ";

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return `${PDF_SYMBOL}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Minimal amount-to-words (Indian lakh/crore grouping), same algorithm as
// Frontend/src/utils/numberToWords.js.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return (hundred ? ONES[hundred] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigits(rest) : "");
}
function indianWords(n) {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;
  const parts = [];
  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(threeDigits(lakh) + " Lakh");
  if (thousand) parts.push(threeDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ").trim();
}
function amountToWords(amount) {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const whole = Math.floor(Math.abs(rounded));
  const paise = Math.round((Math.abs(rounded) - whole) * 100);
  let out = `${indianWords(whole)} Rupees`;
  if (paise) out += ` and ${twoDigits(paise)} Paise`;
  return out + " Only";
}

let cachedLogoBase64 = null;
function loadLogoBase64() {
  if (cachedLogoBase64 !== null) return cachedLogoBase64;
  try {
    const logoPath = path.join(__dirname, "..", "assets", "crix-logo.png");
    cachedLogoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  } catch {
    cachedLogoBase64 = false; // missing asset — PDF still builds, just without the logo
  }
  return cachedLogoBase64;
}

/**
 * Builds the receipt PDF for one purchase and returns it as a Buffer, ready
 * to attach to an email. `receipt` is the same shape routes/receipts.js
 * serializes for the frontend.
 */
function buildReceiptPdfBuffer(receipt) {
  const {
    receiptNumber, issuedAt, buyerName, buyerEmail, buyerPhone,
    itemType, itemTitle, tier, basePrice, discountPercent, discountAmount,
    totalPaid, paymentMode, razorpay_payment_id,
  } = receipt;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logoData = loadLogoBase64();

  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(...hexToRgb(BRAND.border));
      doc.setLineWidth(0.2);
      doc.line(MARGIN, PAGE_H - 16, PAGE_W - MARGIN, PAGE_H - 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...hexToRgb(BRAND.muted));
      doc.text(`${COMPANY.website}  •  ${COMPANY.email}  •  ${COMPANY.phone}`, PAGE_W / 2, PAGE_H - 11, { align: "center" });
      doc.text(`${COMPANY.legalName}  •  CIN: ${COMPANY.cin}`, PAGE_W / 2, PAGE_H - 7, { align: "center" });
      doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 7, { align: "right" });
    }
  };

  let y = MARGIN;
  if (logoData) {
    try {
      const props = doc.getImageProperties(logoData);
      const w = 58;
      const h = (props.height / props.width) * w;
      doc.addImage(logoData, "PNG", MARGIN, y - 3, w, h);
    } catch {
      // ignore malformed image — header still works without it
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...hexToRgb(BRAND.navy));
  doc.text("RECEIPT", PAGE_W - MARGIN, y + 3, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...hexToRgb(BRAND.text));
  let metaY = y + 10;
  doc.text(`No: ${receiptNumber}`, PAGE_W - MARGIN, metaY, { align: "right" });
  metaY += 5;
  doc.text(`Date: ${fmtDate(issuedAt)}`, PAGE_W - MARGIN, metaY, { align: "right" });
  if (razorpay_payment_id) {
    metaY += 5;
    doc.text(`Txn ID: ${razorpay_payment_id}`, PAGE_W - MARGIN, metaY, { align: "right" });
  }

  y = 38;
  doc.setDrawColor(...hexToRgb(BRAND.teal));
  doc.setLineWidth(1);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  y += 9;
  const colGap = CONTENT_W / 2 + 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(BRAND.teal));
  doc.text("BILLED BY", MARGIN, y);
  doc.text("BILLED TO", MARGIN + colGap, y);

  const leftLines = [COMPANY.legalName, COMPANY.registeredAddress, `Email: ${COMPANY.email}`, `Phone: ${COMPANY.phone}`, `CIN: ${COMPANY.cin}`];
  const rightLines = [buyerName || "—", buyerEmail ? `Email: ${buyerEmail}` : null, buyerPhone ? `Phone: ${buyerPhone}` : null].filter(Boolean);

  const drawWrappedBlock = (lines, x, startY, maxWidth) => {
    let cy = startY;
    lines.forEach((line, i) => {
      doc.setFont("helvetica", i === 0 ? "bold" : "normal");
      doc.setTextColor(...hexToRgb(i === 0 ? BRAND.navy : BRAND.text));
      const wrapped = doc.splitTextToSize(line, maxWidth);
      doc.text(wrapped, x, cy);
      cy += wrapped.length * 4.6;
    });
    return cy;
  };

  const blockY0 = y + 5;
  doc.setFontSize(9.5);
  const ly = drawWrappedBlock(leftLines, MARGIN, blockY0, colGap - 8);
  const ry = drawWrappedBlock(rightLines, MARGIN + colGap, blockY0, CONTENT_W - colGap);

  y = Math.max(ly, ry) + 3;

  doc.setFillColor(16, 150, 90);
  doc.roundedRect(MARGIN, y, 30, 7, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("PAID", MARGIN + 15, y + 4.7, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(BRAND.text));
  doc.text(`Payment Mode: ${paymentMode || "Razorpay (Online)"}`, MARGIN + 36, y + 4.8);
  doc.text("Currency: INR", PAGE_W - MARGIN, y + 4.8, { align: "right" });

  y += 12;

  const kindLabel = itemType === "internship" ? "Internship" : "Course";
  const planLabel = tierLabel(tier);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: [["1", `${itemTitle} (${kindLabel}${planLabel ? `, ${planLabel} plan` : ""})`, "1", fmtMoney(basePrice), fmtMoney(basePrice)]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, textColor: hexToRgb(BRAND.text), lineColor: hexToRgb(BRAND.border), lineWidth: 0.1 },
    headStyles: { fillColor: hexToRgb(BRAND.navy), textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: hexToRgb(BRAND.rowAlt) },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 16, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
  });

  y = doc.lastAutoTable.finalY + 8;
  if (y > 250) { doc.addPage(); y = MARGIN; }

  const totalsX0 = PAGE_W - MARGIN - 80;
  const totalsW = 80;
  const rows = [
    ["Subtotal", fmtMoney(basePrice)],
    ...(discountAmount > 0 ? [[`Discount (${discountPercent}%)`, `- ${fmtMoney(discountAmount)}`]] : []),
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  rows.forEach(([label, val]) => {
    doc.setTextColor(...hexToRgb(BRAND.text));
    doc.text(label, totalsX0, y);
    doc.text(val, PAGE_W - MARGIN, y, { align: "right" });
    y += 6;
  });

  doc.setFillColor(...hexToRgb(BRAND.navy));
  doc.rect(totalsX0 - 3, y - 2, totalsW + 3, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Total Paid", totalsX0, y + 4);
  doc.text(fmtMoney(totalPaid), PAGE_W - MARGIN, y + 4, { align: "right" });
  y += 16;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(BRAND.muted));
  const words = doc.splitTextToSize(`Amount in words: ${amountToWords(totalPaid)}`, CONTENT_W);
  doc.text(words, MARGIN, y);
  y += words.length * 4 + 6;

  if (y > 255) { doc.addPage(); y = MARGIN; }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(BRAND.muted));
  const note = doc.splitTextToSize(
    "This is a system-generated receipt confirming a completed online payment. No signature required.",
    CONTENT_W
  );
  doc.text(note, MARGIN, y);

  addFooter();
  return Buffer.from(doc.output("arraybuffer"));
}

module.exports = { buildReceiptPdfBuffer };
