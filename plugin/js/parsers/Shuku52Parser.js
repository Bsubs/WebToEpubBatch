"use strict";

parserFactory.register("52shuku.net", () => new Shuku52Parser());

class Shuku52Parser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let base = dom.baseURI.replace(/\.html$/, "");
        return [...dom.querySelectorAll("ul li a")]
            .filter(a => a.href.startsWith(base + "_"))
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.article-content");
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.article-title");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1")?.textContent ?? super.extractTitleImpl(dom);
    }

    extractLanguage() {
        return "zh";
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "a");
        super.removeUnwantedElementsFromContentElement(element);
    }
}
