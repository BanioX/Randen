import type { jsPDF } from 'jspdf';
import { pdfText } from './kit';

/**
 * Starts an A4 portrait PDF. jsPDF (MIT) is loaded here, on first use only (ADR-0019): it is a
 * chunk of its own that the app fetches with the rest for offline use, but never parses until a
 * PDF is built. Its optional parts (html2canvas, canvg, DOMPurify) are replaced by an empty
 * module in `vite.config.ts`; Randen never draws HTML or SVG into a PDF.
 */
export async function createPdf(meta: { title: string }): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: pdfText(meta.title), creator: 'Randen' });
  doc.setLanguage('de-CH');
  return doc;
}
