/**
 * scanner-worker.js
 * Web Worker for offloading jsQR processing off the main thread.
 * Receives ImageData pixels, runs jsQR, posts decoded result back.
 */

// jsQR must be available as a global; use importScripts with the same CDN URL from dashboard.html
importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');

self.onmessage = function (e) {
    const { data, width, height, id } = e.data;
    try {
        const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
        self.postMessage({ id, result: code ? code.data : null });
    } catch (err) {
        self.postMessage({ id, result: null, error: err.message });
    }
};
