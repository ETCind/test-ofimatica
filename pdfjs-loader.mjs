const isIPadOrIPhone = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
globalThis.TestPlatform = Object.freeze({
  isIPadOrIPhone,
  isMacLike: !isIPadOrIPhone && /Mac/i.test(navigator.platform || navigator.userAgent)
});

const PDFJS_VERSION = '6.2.108';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/`;

if (!isIPadOrIPhone) {
  globalThis.TestPdfEngine = Object.freeze({ready:false, loading:true, version:PDFJS_VERSION});
  try {
    // La build legacy es la recomendada por PDF.js para Safari. La extracción
    // de texto NO usa getTextContent(); pdf-importer.js consume el stream con
    // getReader() para evitar el fallo conocido de Safari 26.x / macOS.
    const pdfjsLib = await import(PDFJS_BASE + 'pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.mjs';
    globalThis.pdfjsLib = pdfjsLib;
    globalThis.TestPdfEngine = Object.freeze({
      ready: true,
      loading: false,
      version: pdfjsLib.version || PDFJS_VERSION,
      source: `pdfjs-dist@${PDFJS_VERSION}/legacy`,
      security: 'enableScripting=false; enableXfa=false; isEvalSupported=false',
      selfTestPassed: false
    });
  } catch (error) {
    console.error('No se pudo cargar PDF.js seguro', error);
    globalThis.TestPdfEngine = Object.freeze({
      ready:false,
      loading:false,
      version:PDFJS_VERSION,
      error:String(error && error.message || error)
    });
  }
} else {
  globalThis.TestPdfEngine = Object.freeze({ready:false, loading:false, mobileDisabled:true, version:PDFJS_VERSION});
}
window.dispatchEvent(new CustomEvent('test-pdf-engine-ready', {detail: globalThis.TestPdfEngine}));
