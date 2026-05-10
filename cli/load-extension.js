"use strict";

/**
 * Reads popup.html, extracts <script src="..."> tags in order, and executes
 * each file in Node's global context via vm.runInThisContext. This replicates
 * the browser's sequential script loading without any bundler.
 *
 * Scripts to skip (replaced by shims in browser-shims.js or not needed in CLI):
 *   - zip-no-worker.min.js  → replaced by global.zip = require("@zip.js/zip.js")
 *   - purify.min.js         → replaced by global.DOMPurify from browser-shims.js
 *   - main.js               → pure browser UI; we provide a stub below
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SKIP_SCRIPTS = new Set([
    "@zip.js/zip.js/dist/zip-no-worker.min.js",
    "dompurify/dist/purify.min.js",
    "js/main.js",
]);

function extractScriptSrcs(html) {
    const srcs = [];
    const re = /<script\s+src="([^"]+)"/g;
    let match;
    while ((match = re.exec(html)) !== null) {
        srcs.push(match[1]);
    }
    return srcs;
}

function loadExtension() {
    const pluginDir = path.join(__dirname, "../plugin");
    const popupHtml = fs.readFileSync(path.join(pluginDir, "popup.html"), "utf8");
    const srcs = extractScriptSrcs(popupHtml);

    for (const src of srcs) {
        if (SKIP_SCRIPTS.has(src)) {
            continue;
        }

        const scriptPath = path.join(pluginDir, src);
        let code;
        try {
            code = fs.readFileSync(scriptPath, "utf8");
        } catch (e) {
            console.error(`[load-extension] Cannot read ${scriptPath}: ${e.message}`);
            continue;
        }

        try {
            vm.runInThisContext(code, { filename: scriptPath, displayErrors: true });
        } catch (e) {
            console.error(`[load-extension] Error in ${src}: ${e.message}`);
            throw e;
        }
    }

    // Stub for main — Parser.setUiToShowLoadingProgress calls main.getPackEpubButton()
    global.main = {
        getPackEpubButton: () => ({ disabled: false }),
    };

    // Patch UI-touching Parser methods to no-ops / progress logs
    Parser.prototype.setUiToShowLoadingProgress = function () {};
    Parser.prototype.updateLoadState = function (webPage) {
        if (webPage.title && webPage.title !== "[placeholder]") {
            process.stdout.write(`  fetched: ${webPage.title}\n`);
        }
    };

    // Redirect extension error display to stderr
    ErrorLog.showErrorMessage = function (err) {
        const msg = (err instanceof Error) ? err.message : String(err);
        process.stderr.write(`[ErrorLog] ${msg}\n`);
    };

    // RoyalRoadParser.removeWatermarks reads style.sheet.rules, which jsdom leaves
    // null for DOMParser-created documents. Patch to a safe no-op.
    if (typeof RoyalRoadParser !== "undefined") {
        RoyalRoadParser.prototype.removeWatermarks = function () {};
    }

    // Patch HttpClient to use a browser-like User-Agent
    HttpClient.makeOptions = function () {
        return {
            headers: {
                "User-Agent": global.navigator.userAgent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
        };
    };
}

module.exports = { loadExtension };
