/**
 * Stands in for the optional parts of jsPDF that Randen never uses: html2canvas (HTML into a
 * PDF), canvg with core-js (SVG into a PDF) and DOMPurify. `vite.config.ts` points them here, so
 * about 380 kB stay out of the bundle and the offline cache (ADR-0019, after Rettich TD-15).
 * Should jsPDF ever ask for one of them, it gets nothing and fails with its own message.
 */
export default undefined;
