// Same downloadReceiptPdf as utils/receiptPdf.js, but the PDF library (jsPDF and
// its helpers, ~400 KB) is only downloaded when someone actually asks for a
// receipt. Importing receiptPdf.js directly would put it in the main script that
// every visitor's phone has to load and run on every page.
export const downloadReceiptPdf = (receipt) => import("./receiptPdf.js").then((m) => m.downloadReceiptPdf(receipt));
