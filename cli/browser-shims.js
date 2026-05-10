"use strict";

/**
 * Must be require()'d before any extension code is loaded.
 * Sets up browser globals so the extension's JS files run in Node without modification.
 */

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const pluginDir = path.join(__dirname, "../plugin");
const popupHtml = fs.readFileSync(path.join(pluginDir, "popup.html"), "utf8");

// Strip script tags so jsdom doesn't try to execute or load them
const strippedHtml = popupHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

const popupDom = new JSDOM(strippedHtml, {
    url: "file://" + pluginDir.replace(/\\/g, "/") + "/popup.html",
    pretendToBeVisual: true,
});

const popupWindow = popupDom.window;

// Polyfill CSSStyleSheet.rules — non-standard alias for cssRules; used by
// RoyalRoadParser.removeWatermarks. jsdom exposes cssRules but not rules.
const _CSSStyleSheet = popupWindow.CSSStyleSheet;
if (_CSSStyleSheet && !("rules" in _CSSStyleSheet.prototype)) {
    Object.defineProperty(_CSSStyleSheet.prototype, "rules", {
        get() { return this.cssRules; },
        configurable: true,
    });
}

// Polyfill innerText on jsdom's HTMLElement — jsdom 24 doesn't implement it.
// The extension's hyperlinksToChapterList checks link.innerText to detect empty links.
// Returning textContent is a safe approximation for our purposes.
if (!("innerText" in popupWindow.HTMLElement.prototype)) {
    Object.defineProperty(popupWindow.HTMLElement.prototype, "innerText", {
        get() { return this.textContent; },
        configurable: true,
        enumerable: false,
    });
}


// DOM globals — extension code references these as bare names
global.window = popupWindow;
global.document = popupWindow.document;
global.DOMParser = popupWindow.DOMParser;
global.XMLSerializer = popupWindow.XMLSerializer;
global.HTMLElement = popupWindow.HTMLElement;
global.Element = popupWindow.Element;
global.Node = popupWindow.Node;
global.NodeFilter = popupWindow.NodeFilter;
global.NodeIterator = popupWindow.NodeIterator;
global.TreeWalker = popupWindow.TreeWalker;
global.MutationObserver = popupWindow.MutationObserver;
global.Event = popupWindow.Event;
global.CustomEvent = popupWindow.CustomEvent;
global.Option = popupWindow.Option;
global.CSSStyleSheet = popupWindow.CSSStyleSheet;

// Node 18+ has Blob globally, but set it explicitly so zip.js finds it
global.Blob = require("buffer").Blob;

// FileReader — Library.js instantiates one at module load time
global.FileReader = class FileReader {
    readAsArrayBuffer() {}
    readAsText() {}
    addEventListener() {}
    removeEventListener() {}
};

// alert / prompt — some parsers call these on rate-limit errors
global.alert = (msg) => console.warn("[alert]", String(msg).substring(0, 200));
global.confirm = () => true;
global.prompt = () => null;

// localStorage — UserPreferences reads/writes here; use in-memory Map for CLI
const _lsData = new Map();
const _localStorage = {
    getItem: (k) => _lsData.get(k) ?? null,
    setItem: (k, v) => _lsData.set(k, String(v)),
    removeItem: (k) => _lsData.delete(k),
    clear: () => _lsData.clear(),
};
global.localStorage = _localStorage;
// window.localStorage is a getter-only property in jsdom; patch via defineProperty
Object.defineProperty(popupWindow, "localStorage", { get: () => _localStorage, configurable: true });

// navigator — isFirefox() checks navigator.brave; we want it to return false
global.navigator = {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    brave: undefined,
};

// browser — if typeof(browser) === "undefined", isFirefox() returns false
// Do NOT set global.browser — leave it undefined

// chrome stub — only the methods actually called at runtime need to work;
// the rest are no-ops to prevent ReferenceError
// Load English locale messages so UIText.js gets real strings
let _i18nMessages = {};
try {
    const localeFile = path.join(__dirname, "../plugin/_locales/en/messages.json");
    _i18nMessages = JSON.parse(fs.readFileSync(localeFile, "utf8"));
} catch (e) {
    // fall through — use key names as fallback
}

global.chrome = {
    i18n: {
        getMessage: (key, substitutions) => {
            const bare = key.replace(/^__MSG_/, "").replace(/__$/, "");
            const entry = _i18nMessages[bare];
            let msg = entry ? entry.message : bare;
            if (substitutions) {
                const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
                subs.forEach((s, i) => { msg = msg.replace(`$${i + 1}`, s); });
            }
            return msg;
        },
    },
    runtime: {
        onMessage: {
            addListener: () => {},
            removeListener: () => {},
            hasListener: () => false,
        },
        lastError: null,
        getURL: (p) => "file://" + path.join(pluginDir, p).replace(/\\/g, "/"),
        getManifest: () => ({ version: "cli" }),
    },
    scripting: { executeScript: () => {} },
    downloads: {
        download: () => {},
        onChanged: { addListener: () => {} },
    },
    cookies: {
        getAll: async () => [],
        set: async () => {},
    },
    declarativeNetRequest: {
        getSessionRules: async () => [],
        updateSessionRules: async () => {},
    },
    tabs: {
        create: () => {},
        query: async () => [],
    },
};

// zip.js — use the npm package instead of the browser bundle
global.zip = require("@zip.js/zip.js");

// DOMPurify — initialize with jsdom window so it works in Node
const createDOMPurify = require("dompurify");
global.DOMPurify = createDOMPurify(popupWindow);
