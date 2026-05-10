"use strict";

const { writeEpub } = require("./epub-writer");

/**
 * Converts a single novel to EPUB.
 *
 * Flow mirrors what the browser popup does:
 *  1. Fetch the starting page → pick parser via ParserFactory
 *  2. Load metadata and chapter list
 *  3. Fetch all chapters (with per-chapter delay from config)
 *  4. Pack EPUB → write to outputDir
 *
 * @param {object} novelConfig   - One entry from config.novels
 * @param {number} delayMs       - Milliseconds to wait between chapter fetches
 * @param {string} outputDir     - Directory to write EPUB files into
 */
async function convertNovel(novelConfig, delayMs, outputDir) {
    // Support both "startingURL" and the typo variant "startingURL:" from the JSON spec
    const startingURL = novelConfig["startingURL"] || novelConfig["startingURL:"];
    if (!startingURL) {
        throw new Error("Novel entry is missing 'startingURL'");
    }

    console.log(`\nProcessing: ${novelConfig.title || startingURL}`);
    console.log(`  URL: ${startingURL}`);

    // 1. Fetch the starting page
    console.log("  Fetching index page...");
    let response;
    try {
        response = await HttpClient.wrapFetch(startingURL);
    } catch (err) {
        throw new Error(`Failed to fetch starting URL: ${err.message}`);
    }
    const dom = response.responseXML;
    if (!dom) {
        throw new Error("Starting page did not return HTML content");
    }

    // 2. Select parser
    const parser = parserFactory.fetch(startingURL, dom);
    console.log(`  Parser: ${parser.constructor.name}`);

    // 3. Set up user preferences with the requested chapter delay
    const userPrefs = UserPreferences.readFromLocalStorage();
    userPrefs.manualDelayPerChapter.value = String(delayMs);
    userPrefs.overrideMinimumDelay.value = (delayMs < parser.minimumThrottle);
    userPrefs.addInformationPage.value = false;   // no info page needed in batch mode
    userPrefs.addObserver(parser);

    // Patch getRateLimit to add ±200ms jitter on every chapter delay
    const origGetRateLimit = parser.getRateLimit.bind(parser);
    parser.getRateLimit = function () {
        const base = origGetRateLimit();
        const jitter = Math.floor(Math.random() * 401) - 200;
        return Math.max(0, base + jitter);
    };

    // 4. Load metadata from the starting page
    await parser.loadEpubMetaInfo(dom);
    const metaInfo = parser.getEpubMetaInfo(dom, false);

    // Derive title/fileName from h1.article-title if requested
    if (novelConfig.useDefaultChapterTitle) {
        const h1 = dom.querySelector("h1.article-title");
        if (h1) {
            const derived = h1.textContent.trim().split(" ")[0];
            metaInfo.title = derived;
            metaInfo.fileName = derived;
        }
    }

    // Explicit config overrides take precedence over auto-derived values
    if (novelConfig.title) metaInfo.title = novelConfig.title;
    if (novelConfig.fileName) metaInfo.fileName = novelConfig.fileName;

    console.log(`  Title:  ${metaInfo.title}`);
    console.log(`  Author: ${metaInfo.author}`);

    // 5. Get chapter list
    console.log("  Fetching chapter list...");
    parser.state.chapterListUrl = startingURL;
    parser.state.firstPageDom = dom;

    let chapters;
    try {
        chapters = await parser.getChapterUrls(dom);
    } catch (err) {
        throw new Error(`Failed to get chapter list: ${err.message}`);
    }

    if (!chapters || chapters.length === 0) {
        throw new Error("No chapters found");
    }

    // Clean and mark all chapters as includeable
    chapters = parser.cleanWebPageUrls(chapters);
    chapters.forEach((ch) => {
        ch.isIncludeable = true;
        ch.row = null;   // no UI row in CLI
    });

    console.log(`  Chapters: ${chapters.length}`);
    parser.state.setPagesToFetch(chapters);

    // 6. Fetch all chapter content (uses parser.rateLimitDelay() for pacing)
    console.log(`  Fetching chapters (delay: ${delayMs} ±200ms each)...`);
    await parser.fetchContent();

    // 7. Pack EPUB
    console.log("  Packing EPUB...");
    const epub = new EpubPacker(metaInfo);
    const blob = await epub.assemble(parser.epubItemSupplier());

    // 8. Write to disk
    const outPath = await writeEpub(blob, outputDir, metaInfo.fileName);
    console.log(`  Saved: ${outPath}`);

    return outPath;
}

/**
 * Runs the full batch from a parsed config object.
 *
 * @param {object} config     - Parsed JSON config
 * @param {string} outputDir  - Directory to write EPUB files into
 */
async function runBatch(config, outputDir) {
    const delayMs = config.delayPerChapterinMs ?? 500;
    const novels = config.novels ?? [];

    if (novels.length === 0) {
        console.warn("No novels listed in config.");
        return;
    }

    console.log(`Batch: ${novels.length} novel(s), ${delayMs}ms delay per chapter`);
    console.log(`Output: ${outputDir}\n`);

    const results = { ok: [], failed: [] };

    for (let i = 0; i < novels.length; i++) {
        const novel = novels[i];
        const label = novel.title || novel["startingURL"] || novel["startingURL:"] || `novel[${i}]`;
        try {
            const outPath = await convertNovel(novel, delayMs, outputDir);
            results.ok.push({ label, outPath });
        } catch (err) {
            console.error(`\n[ERROR] ${label}: ${err.message}`);
            results.failed.push({ label, error: err.message });
        }
    }

    console.log("\n--- Batch complete ---");
    console.log(`Success: ${results.ok.length}  Failed: ${results.failed.length}`);
    if (results.failed.length > 0) {
        console.log("\nFailed:");
        results.failed.forEach((f) => console.log(`  ${f.label}: ${f.error}`));
    }

    return results;
}

module.exports = { runBatch };
