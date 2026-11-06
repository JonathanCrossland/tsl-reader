/**
 * Lab document list — edit this file when you embed the lab on a site.
 *
 * Loaded after ../player/tsl.js and before lab.js. Paths are relative to lab/index.html
 * (or use absolute / https: URLs). The sample <select> is built from this list.
 *
 *   label     — text shown in the menu
 *   url       — .tsl (or lean HTML) to fetch
 *   selected  — optional; which item loads on first visit (else defaultUrl, else first item)
 *
 * defaultUrl  — optional; initial document when the URL has no ?tsl= parameter
 * placeholder — optional; first empty option label (default "Choose…")
 */
(function (g) {
    'use strict';

    g.__TslLabDocuments = {
        placeholder: 'Choose…',
        defaultUrl: '../spec/specification-0.1.tsl',
        documents: [
            { label: '0.1 Specification', url: '../spec/specification-0.1.tsl' },
            { label: 'Format specification', url: '../spec/tsl-spec.tsl', selected: true },
            { label: 'Rich content blocks', url: '../examples/rich-content.tsl' },
            { label: 'Print layout & pages', url: '../examples/print-layout.tsl' },
            { label: 'Comic Page', url: '../examples/comic.tsl' },
        ]
    };
}(window));
