// Turns a text document — the Terms of Service, Privacy Policy, Client Terms,
// the careers and aptitude-test rules — into a branded, downloadable A4 PDF,
// built in the browser with the same letterhead and footer as the receipts
// (utils/receiptPdf.js). Pages import this lazily (`await import(...)`) when
// the Download button is pressed, so jsPDF never slows down the page itself.
//
// A document is { title, subtitle?, intro?, sections: [{ title, content }] }
// — the same shape as the legal docs in data/content.js. `content` is plain
// text: blank lines split paragraphs, and lines starting with "•" become
// bullet points with a hanging indent.
import jsPDF from "jspdf";
import { site } from "../data/content.js";
import loadImageDataUrl from "./loadImageDataUrl.js";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 22; // keep clear of the footer
const BRAND = { navy: [15, 31, 61], teal: [15, 148, 136], text: [30, 41, 59], muted: [100, 116, 139], border: [226, 232, 240], soft: [240, 249, 248] };

// jsPDF's built-in Helvetica only knows the Windows-1252 characters. Map the
// few others this site's text uses, and drop anything else rather than let it
// print as garbage.
const REPLACE = {
  "₹": "Rs. ", // ₹
  "−": "-", // minus sign
  "→": "->",
  "←": "<-",
  "✓": "-", // ✓
  "✕": "x", // ✕
  "≈": "~",
  " ": " ", // thin space
  " ": " ", // narrow no-break space
  " ": " ", // figure space
  "​": "", // zero-width space
};
const REPLACE_RE = /[₹−→←✓✕≈   ​]/g;
const WIN1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfSafe(text) {
  return String(text == null ? "" : text)
    .replace(REPLACE_RE, (c) => REPLACE[c])
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, (c) => (WIN1252_EXTRA.includes(c) ? c : ""));
}

// "Terms of Service" -> "Crix-Technology-Terms-of-Service.pdf"
export const pdfFileName = (title) => `Crix-Technology-${pdfSafe(title).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;

export async function buildDocumentPdf({ title, subtitle = "", intro = "", sections = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadImageDataUrl("/crix-logo.png");
  let y = MARGIN;

  const newPage = () => { doc.addPage(); y = MARGIN; };
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };
  const write = (lines, x, lineH) => {
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, x, y);
      y += lineH;
    }
  };

  // ── Letterhead ──
  if (logo) {
    try {
      const p = doc.getImageProperties(logo);
      doc.addImage(logo, "PNG", MARGIN, y - 3, 50, (p.height / p.width) * 50);
    } catch {
      // a broken logo never stops the document
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...BRAND.navy);
  const titleLines = doc.splitTextToSize(pdfSafe(title).toUpperCase(), 95);
  doc.text(titleLines, PAGE_W - MARGIN, y + 3, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.muted);
  const metaY = y + 3 + titleLines.length * 6.5;
  if (subtitle) doc.text(doc.splitTextToSize(pdfSafe(subtitle), 95), PAGE_W - MARGIN, metaY, { align: "right" });
  y = Math.max(38, metaY + 8);
  doc.setDrawColor(...BRAND.teal);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 9;

  // ── Intro, in a soft box ──
  if (intro) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(pdfSafe(intro), CONTENT_W - 10);
    const h = lines.length * 5 + 8;
    ensure(h);
    doc.setFillColor(...BRAND.soft);
    doc.setDrawColor(...BRAND.teal);
    doc.setLineWidth(0.6);
    doc.rect(MARGIN, y - 5, CONTENT_W, h, "F");
    doc.line(MARGIN, y - 5, MARGIN, y - 5 + h);
    doc.setTextColor(...BRAND.text);
    doc.text(lines, MARGIN + 5, y + 1);
    y += h + 4;
  }

  // ── Sections ──
  for (const section of sections) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...BRAND.navy);
    const head = doc.splitTextToSize(pdfSafe(section.title), CONTENT_W);
    ensure(head.length * 6 + 10); // never leave a heading alone at the foot of a page
    write(head, MARGIN, 6);
    y += 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.8);
    doc.setTextColor(...BRAND.text);
    const paragraphs = pdfSafe(section.content).split(/\n\s*\n/);
    for (const para of paragraphs) {
      for (const raw of para.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("•")) {
          const wrapped = doc.splitTextToSize(line.replace(/^•\s*/, ""), CONTENT_W - 7);
          ensure(4.8);
          doc.text("•", MARGIN + 2, y);
          write(wrapped, MARGIN + 7, 4.8);
        } else {
          write(doc.splitTextToSize(line, CONTENT_W), MARGIN, 4.8);
        }
      }
      y += 2.5;
    }
    y += 3;
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  const downloaded = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 16, PAGE_W - MARGIN, PAGE_H - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(...BRAND.muted);
    doc.text(pdfSafe(`${site.website}  •  ${site.email}  •  ${site.phoneAlt}`), PAGE_W / 2, PAGE_H - 11, { align: "center" });
    doc.text(pdfSafe(`${site.legalName}  •  CIN: ${site.cin}  •  Downloaded ${downloaded}`), PAGE_W / 2, PAGE_H - 7, { align: "center" });
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 7, { align: "right" });
  }
  return doc;
}

export async function downloadDocumentPdf(document) {
  const doc = await buildDocumentPdf(document);
  doc.save(pdfFileName(document.title));
}
