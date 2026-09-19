// The Campus Ambassador certificate, built as a landscape A4 PDF in the browser
// (same approach as the receipts in receiptPdf.js — jsPDF, company details from
// content.js's `site`). The ambassador downloads it from their dashboard once
// an admin has approved them; the number is issued by the backend.
import jsPDF from "jspdf";
import { site } from "../data/content.js";
import loadImageDataUrl from "./loadImageDataUrl.js";

const PAGE_W = 297;
const PAGE_H = 210;
const NAVY = [15, 31, 61];
const TEAL = [15, 148, 136];
const TEXT = [30, 41, 59];
const MUTED = [100, 116, 139];

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * @param {{ name: string, college: string, city: string, number: string, issuedAt: string }} cert
 */
export async function buildAmbassadorCertificate({ name, college, city, number, issuedAt }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const center = PAGE_W / 2;

  // Double border.
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.6);
  doc.rect(9, 9, PAGE_W - 18, PAGE_H - 18);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.rect(13, 13, PAGE_W - 26, PAGE_H - 26);

  const logo = await loadImageDataUrl("/crix-logo.png");
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const w = 56;
      doc.addImage(logo, "PNG", center - w / 2, 20, w, (props.height / props.width) * w);
    } catch {
      /* a malformed logo just means no logo — the certificate still builds */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...NAVY);
  doc.text("CERTIFICATE OF APPOINTMENT", center, 62, { align: "center" });

  doc.setFontSize(13);
  doc.setTextColor(...TEAL);
  doc.text("CAMPUS AMBASSADOR", center, 72, { align: "center", charSpace: 2 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...MUTED);
  doc.text("This is to certify that", center, 90, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...TEXT);
  doc.text(name || "—", center, 106, { align: "center" });
  const nameW = doc.getTextWidth(name || "—");
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.4);
  doc.line(center - Math.max(nameW / 2, 40), 109, center + Math.max(nameW / 2, 40), 109);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12.5);
  doc.setTextColor(...TEXT);
  const place = [college, city].filter(Boolean).join(", ");
  const body = doc.splitTextToSize(
    `has been appointed a Campus Ambassador of ${site.legalName || "Crix Technology Private Limited"}, ` +
    `representing the company${place ? ` at ${place}` : ""}, and is recognised for promoting its ` +
    "internships and courses to fellow students.",
    190
  );
  doc.text(body, center, 122, { align: "center", lineHeightFactor: 1.5 });

  // Footer: date, number, company.
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Date of issue", 40, 172);
  doc.text("Certificate no.", PAGE_W - 40, 172, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TEXT);
  doc.text(fmtDate(issuedAt), 40, 179);
  doc.text(number || "", PAGE_W - 40, 179, { align: "right" });

  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(center - 35, 176, center + 35, 176);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Authorised signatory", center, 181, { align: "center" });
  doc.text(site.legalName || "Crix Technology Private Limited", center, 186, { align: "center" });

  doc.setFontSize(8);
  doc.text(`CIN: ${site.cin || ""}  •  ${site.email || ""}  •  ${site.city || ""}`, center, PAGE_H - 16, { align: "center" });
  return doc;
}

export async function downloadAmbassadorCertificate(cert) {
  const doc = await buildAmbassadorCertificate(cert);
  doc.save(`Crix-Campus-Ambassador-${cert.number || "certificate"}.pdf`.replace(/\s+/g, "-"));
}
