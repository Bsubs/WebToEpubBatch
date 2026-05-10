#!/usr/bin/env node
"use strict";

// browser-shims MUST be the very first require — it sets up all browser globals
// before any extension code is loaded.
require("./browser-shims");

// Load all extension scripts into the global scope
const { loadExtension } = require("./load-extension");
loadExtension();

// Extension globals (parserFactory, EpubPacker, HttpClient, UserPreferences, etc.)
// are now available on globalThis.

const fs = require("fs");
const path = require("path");
const { Command } = require("commander");
const { runBatch } = require("./batch-runner");

const program = new Command();

program
    .name("webtoepub-batch")
    .description("Batch-convert web novels to EPUB using WebToEpub parsers")
    .argument("<config>", "Path to JSON config file")
    .option("-o, --output <dir>", "Output directory for EPUB files", "./epubs")
    .option("-v, --verbose", "Show extra debug output")
    .action(async (configPath, options) => {
        const resolved = path.resolve(configPath);
        if (!fs.existsSync(resolved)) {
            console.error(`Config file not found: ${resolved}`);
            process.exit(1);
        }

        let config;
        try {
            config = JSON.parse(fs.readFileSync(resolved, "utf8"));
        } catch (err) {
            console.error(`Failed to parse config: ${err.message}`);
            process.exit(1);
        }

        const outputDir = path.resolve(options.output);

        if (options.verbose) {
            process.env.WEBTOEPUB_VERBOSE = "1";
        }

        try {
            const results = await runBatch(config, outputDir);
            if (results && results.failed.length > 0) {
                process.exit(1);
            }
        } catch (err) {
            console.error(`Fatal error: ${err.message}`);
            if (options.verbose) console.error(err.stack);
            process.exit(1);
        }
    });

program.parse();
