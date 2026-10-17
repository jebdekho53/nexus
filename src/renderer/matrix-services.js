"use strict";
// Source: src/ts/renderer/matrix-services.ts. Compiled into src/renderer/matrix-services.js by `npm run build:renderer`; edit the TypeScript, not this file.
(() => {
    const output = document.getElementById('matrix-service-status'), button = document.getElementById('matrix-services-check');
    async function check(refresh) {
        button.disabled = true;
        try {
            const state = await window.matrixServices.status(refresh);
            output.textContent = state.source === 'online' ? 'Matrix server connected · ' + Math.round(state.roundTripMs) + ' ms round trip · clock difference ' + Math.round(state.clockOffsetMs) + ' ms' : 'Local configuration · Matrix server unavailable';
        }
        catch {
            output.textContent = 'Service status unavailable';
        }
        finally {
            button.disabled = false;
        }
    }
    button.addEventListener('click', () => check(true));
    check(false);
})();
