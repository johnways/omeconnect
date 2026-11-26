// OMECOnnect compatibility helpers for older phones and browsers.
// Loaded first by both apps. Only adds a feature when the browser lacks it,
// so modern browsers use their own built-in version.
(function () {
  'use strict';

  // Element.replaceChildren() — Chrome/Android WebView 86+, Safari 14+.
  // Older phones (e.g. Chrome 83) crashed the bill estimator and the
  // municipality/barangay pickers without it.
  function replaceChildren(...nodes) {
    while (this.lastChild) this.removeChild(this.lastChild);
    if (nodes.length) this.append(...nodes);
  }
  [window.Element, window.Document, window.DocumentFragment].forEach((type) => {
    if (type && type.prototype && !type.prototype.replaceChildren) {
      Object.defineProperty(type.prototype, 'replaceChildren', {
        value: replaceChildren, writable: true, configurable: true
      });
    }
  });
})();
