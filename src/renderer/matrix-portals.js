"use strict";
// Source: src/ts/renderer/matrix-portals.ts. Compiled into src/renderer/matrix-portals.js by `npm run build:renderer`; edit the TypeScript, not this file.
document.addEventListener('DOMContentLoaded', () => { for (const button of document.querySelectorAll('[data-matrix-portal]'))
    button.addEventListener('click', () => window.matrixPortal.open(button.dataset.matrixPortal)); });
