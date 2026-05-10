"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Converts the Blob returned by EpubPacker.assemble() to a Buffer
 * and writes it to outputDir/<safeFileName>.epub.
 *
 * @param {Blob}   blob       - The EPUB blob from EpubPacker.assemble()
 * @param {string} outputDir  - Directory to write into
 * @param {string} fileName   - Base filename (without .epub extension)
 * @returns {string} Absolute path of the written file
 */
async function writeEpub(blob, outputDir, fileName) {
    fs.mkdirSync(outputDir, { recursive: true });

    const safeName = sanitizeFileName(fileName);
    const outPath = path.join(outputDir, safeName + ".epub");

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(outPath, buffer);

    return outPath;
}

function sanitizeFileName(name) {
    if (!name || name.trim() === "") return "output";
    // Strip characters that are illegal on Windows/Linux/macOS
    return name
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/\.+$/, "")
        .substring(0, 200)
        .trim() || "output";
}

module.exports = { writeEpub };
