# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebToEpub is a browser extension (Chrome/Firefox) that converts web novels and other web pages into EPUB files. It supports 500+ websites through a pluggable parser architecture.

## Commands

```bash
npm install           # Install dependencies
npm run build         # Pack JS files (outputs eslint/packed.js, .xpi, .zip)
npm run lint          # Pack JS + run ESLint
npm run lint:fix      # Auto-fix ESLint errors
npm test              # Start http-server serving unitTest/Tests.html (QUnit suite)
npm run web-ext       # Lint the built .xpi with web-ext tool
```

**Running a single test:** Open `unitTest/Tests.html` in a browser and use QUnit's filter box to run specific tests by name. Test files are in `unitTest/Utest*.js`; fixtures are in `testdata/`.

**Build internals:** `eslint/pack.js` reads `plugin/popup.html`, extracts all `<script>` tags in order, concatenates them into `eslint/packed.js`, then produces `eslint/WebToEpub[VERSION].xpi` (Firefox) and `.zip` (Chrome). No bundler — raw concatenation.

## Architecture

### Data Flow

1. User opens the extension popup → `plugin/popup.html` loads all JS via `<script>` tags
2. `ContentScript.js` (injected into the page) sends the page DOM back to the popup
3. `main.js` calls `ProcessInitialHtml()` → `ParserFactory` selects the right parser by hostname
4. Parser's `loadEpubMetaInfo()` populates metadata; `getChapterUrls()` returns chapter list
5. User clicks "Pack EPUB" → each chapter URL is fetched; parser's `findContent()` extracts body HTML
6. `EpubPacker.assemble()` builds a valid EPUB2/EPUB3 ZIP blob
7. `Download.save()` triggers the browser download

### Key Components

**`plugin/js/ParserFactory.js`** — Registers all parsers by hostname; selects parser via rule-based matching. Add new sites here (or in the parser file's static `registerParser()` call).

**`plugin/js/Parser.js`** — Abstract base class. Key overridable methods: `getChapterUrls()`, `findContent()`, `findChapterTitle()`, `loadEpubMetaInfo()`. Includes `FetchCache` to avoid re-fetching pages.

**`plugin/js/parsers/`** — ~426 site-specific parser files. Each typically extends `Parser` (or a mid-level base like `WordPressBaseParser`). Parser filenames match the site they target.

**`plugin/js/EpubPacker.js`** — Generates EPUB. Produces `mimetype` (must be uncompressed, first entry), `META-INF/container.xml`, OPF manifest/spine, `toc.ncx` (EPUB2), and `toc.xhtml` (EPUB3).

**`plugin/js/ImageCollector.js`** — Deduplicates images by URL and by bitmap hash. Images marked `fetchFirst` (e.g., cover) are prioritized.

**`plugin/js/HttpClient.js`** — Fetch wrapper with retry logic for 429/503/408/500; 500ms minimum throttle between requests; `maxSimultanousFetchSize = 1`.

**`plugin/js/Download.js`** — Platform-aware file saving (Chrome vs Firefox). Validates filenames for Windows compatibility. Supports filename templates with variables like `%Title%`, `%Author%`, `%Chapters_Count%`.

### No Module System

All classes are globals — no `import`/`export`. The extension loads files via sequential `<script>` tags in `popup.html`. Script order matters: utilities must appear before classes that use them.

### ESLint Config

See `eslint/.eslintrc.js`: ES6, 4-space indent, double quotes. Runs against the concatenated `packed.js`, so errors reference line numbers there, not the original source files.

## Adding a New Parser

1. Create `plugin/js/parsers/MySiteParser.js` extending `Parser` (or an appropriate base class like `WordPressBaseParser`)
2. Override `getChapterUrls()` and `findContent()` at minimum
3. Call `ParserFactory.register(MySiteParser)` (or use a static `registerParser()` in the class)
4. Add a `<script src="js/parsers/MySiteParser.js">` to `plugin/popup.html` (order within the parsers block doesn't matter)
5. Add HTML fixtures to `testdata/` and a test file `unitTest/UtestMySite.js`
6. Check `CONTRIBUTING.md` for the PR checklist (ESLint pass, unit tests, attribution)

## Platform Detection

Use `util.isFirefox()` to branch between `browser.*` (Firefox) and `chrome.*` (Chrome) APIs. The extension targets Manifest V3.
