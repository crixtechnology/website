import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { TermsOfService, PrivacyPolicy } from "./pages/pages.jsx";
import { legal } from "./data/content.js";
import * as pdf from "./utils/documentPdf.js";

// The legal pages offer their full text as a PDF download.
jest.mock("./services/api.js");
jest.mock("./utils/documentPdf.js", () => ({ downloadDocumentPdf: jest.fn(async () => {}) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  pdf.downloadDocumentPdf.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = async (ui) => { await act(async () => { root.render(<MemoryRouter>{ui}</MemoryRouter>); }); };
const pdfButton = () => [...container.querySelectorAll("button")].find((b) => /\(PDF\)/.test(b.textContent));

describe("legal page PDF download", () => {
  it("downloads the whole Terms of Service", async () => {
    await render(<TermsOfService />);
    expect(pdfButton().textContent).toContain("Download Terms of Service (PDF)");
    await act(async () => { pdfButton().click(); });
    expect(pdf.downloadDocumentPdf).toHaveBeenCalledWith({
      title: "Terms of Service", subtitle: legal.updated, intro: legal.terms.intro, sections: legal.terms.sections,
    });
  });

  it("downloads the Privacy Policy from its own page", async () => {
    await render(<PrivacyPolicy />);
    await act(async () => { pdfButton().click(); });
    expect(pdf.downloadDocumentPdf).toHaveBeenCalledWith(expect.objectContaining({ title: "Privacy Policy", sections: legal.privacy.sections }));
  });
});
