/**
 * Talesmith Lang (.tsl) — minimal player shim. Layout and typography are CSS (.tsl-*);
 * this script parses the file, resolves the header, and builds the page DOM.
 */
(function (global) {
    'use strict';

    var IN = 25.4;
    var PAGE_FORMATS = {
        'us-novel': [5.5, 8.5, 0.75, 0.75, 0.5, 0.875],
        'us-mass-market': [4.25, 6.875, 0.625, 0.625, 0.375, 0.75],
        'us-business': [6, 9, 0.875, 0.875, 0.625, 1],
        'us-reference': [8.5, 11, 1, 1, 0.75, 1.25],
        'uk-novel': [148 / IN, 210 / IN, 0.75, 0.75, 0.5, 0.9],
        'uk-business': [156 / IN, 234 / IN, 0.875, 0.875, 0.625, 1],
        'uk-reference': [210 / IN, 297 / IN, 1, 1, 0.75, 1.25]
    };
    var FONTS = {
        'book-serif': 'Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif',
        georgia: 'Georgia, "Times New Roman", serif',
        times: '"Times New Roman", Times, serif',
        palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
        garamond: 'Garamond, "EB Garamond", Georgia, serif',
        baskerville: 'Baskerville, "Libre Baskerville", Georgia, serif',
        sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        courier: '"Courier Prime", "Courier New", Courier, monospace'
    };
    var SETTING_KEYS = {
        theme: 1, startPage: 1, pageOffsetStart: 1, pageFormat: 1, typography: 1,
        customFormat: 1, customFields: 1, usePrintGutters: 1, hyphenation: 1
    };

    function envelopeContentFromDocument(doc) {
        var content = { blocks: Array.isArray(doc.blocks) ? doc.blocks : [] };
        if (!doc || typeof doc !== 'object') {
            return content;
        }
        Object.keys(doc).forEach(function (k) {
            if (SETTING_KEYS[k]) {
                content[k] = doc[k];
            }
        });
        return content;
    }

    function headerNeedsResolve(header) {
        return !header || typeof header !== 'object' || !header.page || !header.typography;
    }

    function parse(text) {
        var data = JSON.parse(text);
        if (data && data.format === 'talesmith-lang' && data.document) {
            var doc = data.document;
            var blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
            var header = data.header;
            if (headerNeedsResolve(header)) {
                header = resolveHeader(envelopeContentFromDocument(doc));
            } else {
                header = Object.assign({}, header);
            }
            if (!header.mergeFields) {
                header.mergeFields = synthesizeMergeFields(
                    envelopeContentFromDocument(doc),
                    blocks
                );
            }
            if (header.readMode === undefined) {
                header.readMode = true;
            }
            return { header: header, blocks: blocks };
        }
        return {
            header: resolveHeader(data),
            blocks: Array.isArray(data.blocks) ? data.blocks : []
        };
    }

    function resolveHeader(content) {
        if (content && content.page && content.typography) {
            return content;
        }
        var c = content || {};
        var formatId = typeof c.pageFormat === 'string' ? c.pageFormat : 'web';
        if (formatId !== 'custom' && !PAGE_FORMATS[formatId]) {
            formatId = 'web';
        }
        var gutters = c.usePrintGutters !== false;
        var page;
        if (formatId === 'web') {
            page = {
                formatId: 'web',
                kind: 'web',
                trimMM: { width: 210, height: 297 },
                marginsMM: { top: 12, bottom: 12, outside: 15, gutter: 15 },
                headerTopMM: 3,
                footerBottomMM: 3,
                headerRule: true,
                footerRule: true,
                rowGapMM: 2,
                usePrintGutters: gutters
            };
        } else {
            var w, h, t, b, o, g;
            if (formatId === 'custom' && c.customFormat && c.customFormat.trimIn) {
                var cf = c.customFormat;
                w = cf.trimIn.w || 6;
                h = cf.trimIn.h || 9;
                var m = cf.marginsIn || {};
                t = m.top != null ? m.top : 0.875;
                b = m.bottom != null ? m.bottom : 0.875;
                o = m.outside != null ? m.outside : 0.625;
                g = m.gutter != null ? m.gutter : 1;
            } else {
                var preset = PAGE_FORMATS[formatId];
                w = preset[0];
                h = preset[1];
                t = preset[2];
                b = preset[3];
                o = preset[4];
                g = preset[5];
            }
            page = {
                formatId: formatId,
                kind: 'print',
                trimMM: { width: round(w * IN, 2), height: round(h * IN, 2) },
                marginsMM: { top: round(t * IN, 2), bottom: round(b * IN, 2), outside: round(o * IN, 2), gutter: round(g * IN, 2) },
                headerTopMM: 8,
                footerBottomMM: 8,
                headerRule: false,
                footerRule: false,
                rowGapMM: 2,
                usePrintGutters: gutters
            };
        }
        var rawTy = c.typography || {};
        var fontId = FONTS[rawTy.fontId] ? rawTy.fontId : 'book-serif';
        var ty = {
            fontId: fontId,
            fontFamily: FONTS[fontId],
            sizePt: clampNum(rawTy.sizePt, 6, 36, 11),
            lineHeight: clampNum(rawTy.lineHeight, 1, 3, 1.45),
            paragraphAlign: ['left', 'center', 'right', 'justify'].indexOf(rawTy.paragraphAlign) >= 0
                ? rawTy.paragraphAlign : 'left',
            paragraphIndentIn: clampNum(rawTy.paragraphIndentIn, 0, 2, 0),
            paragraphSpacingPt: clampNum(rawTy.paragraphSpacingPt, 0, 36, 0),
            hyphenation: c.hyphenation !== false
        };
        var metadata = { fields: Array.isArray(c.customFields) ? c.customFields : [] };
        var header = {
            page: page,
            typography: ty,
            numbering: {
                startPage: Math.max(1, parseInt(c.startPage, 10) || 1),
                pageOffsetStart: Math.max(0, parseInt(c.pageOffsetStart, 10) || 0),
                firstPhysicalPageSide: 'left'
            },
            theme: c.theme || 'default',
            metadata: metadata,
            readMode: true,
            mergeFields: synthesizeMergeFields(c, blocksFromContent(c))
        };
        return header;
    }

    function blocksFromContent(c) {
        return Array.isArray(c && c.blocks) ? c.blocks : [];
    }

    function mergeFieldKey(name) {
        return String(name || '').toLowerCase().replace(/[\s_]/g, '');
    }

    var MERGE_COMPUTED = {
        runningheader: 1, runninghead: 1, running: 1, pageside: 1, side: 1, pageno: 1, page: 1,
        pagecount: 1, pages: 1, title: 1, wordcount: 1, wordcountrounded: 1, lines: 1,
        date: 1, publisheddate: 1, time: 1, datetime: 1, authorlastname: 1, authoralias: 1
    };

    function collectMergeTokens(node, out) {
        if (typeof node === 'string') {
            if (node.indexOf('[') < 0) {
                return;
            }
            var re = /\[([A-Za-z][A-Za-z0-9 _.\-]*)\]/g;
            var m;
            while ((m = re.exec(node)) !== null) {
                var name = m[1].trim();
                var k = mergeFieldKey(name);
                if (!name || MERGE_COMPUTED[k]) {
                    continue;
                }
                if (!out[k]) {
                    out[k] = name;
                }
            }
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(function (item) { collectMergeTokens(item, out); });
            return;
        }
        if (node && typeof node === 'object') {
            Object.keys(node).forEach(function (k) {
                if (k === 'id' || k === 'documentId') {
                    return;
                }
                collectMergeTokens(node[k], out);
            });
        }
    }

    function synthesizeMergeFields(content, blocks) {
        var used = {};
        collectMergeTokens(blocks, used);
        var fields = [];
        var values = {};
        (content.customFields || []).forEach(function (f) {
            if (!f || !f.name) {
                return;
            }
            var name = String(f.name).replace(/^\[|\]$/g, '').trim();
            var k = mergeFieldKey(name);
            if (!name || MERGE_COMPUTED[k]) {
                return;
            }
            values[k] = String(f.value != null ? f.value : '');
            fields.push({ name: name, value: values[k], used: !!used[k] });
        });
        Object.keys(used).forEach(function (k) {
            if (!values[k]) {
                fields.push({ name: used[k], value: '', used: true });
                values[k] = '';
            }
        });
        if (!values.title) {
            fields.forEach(function (row) {
                if (mergeFieldKey(row.name) === 'title' && row.value) {
                    values.title = row.value;
                }
            });
        }
        return { version: 0.1, fields: fields, values: values };
    }

    function mergeFieldValues(header) {
        var values = {};
        if (header.mergeFields && header.mergeFields.values) {
            Object.keys(header.mergeFields.values).forEach(function (k) {
                values[k] = String(header.mergeFields.values[k]);
            });
        }
        if (header.metadata && header.metadata.title) {
            values.title = String(header.metadata.title);
        }
        (header.metadata && header.metadata.fields ? header.metadata.fields : []).forEach(function (f) {
            if (f && f.name) {
                values[mergeFieldKey(f.name)] = String(f.value != null ? f.value : '');
            }
        });
        return values;
    }

    function formatPublishedDate(iso) {
        if (!iso) {
            return '';
        }
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) {
                return '';
            }
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        } catch (e) {
            return '';
        }
    }

    function round(n, p) {
        var f = Math.pow(10, p || 0);
        return Math.round(n * f) / f;
    }

    function clampNum(v, lo, hi, def) {
        var n = parseFloat(v);
        if (isNaN(n)) {
            return def;
        }
        return Math.min(hi, Math.max(lo, n));
    }

    function physicalSide(index) {
        return index % 2 === 1 ? 'left' : 'right';
    }

    function displayPageNo(header, physicalIndex) {
        var start = header.numbering.startPage || 1;
        var offset = header.numbering.pageOffsetStart || 0;
        if (physicalIndex <= offset) {
            return null;
        }
        return start + (physicalIndex - offset - 1);
    }

    var FIELD_RE = /\[([A-Za-z][A-Za-z0-9 _.\-]*)\]/g;

    function resolveFieldValue(name, ctx) {
        var key = mergeFieldKey(name);
        var values = ctx.values || {};
        if (key === 'runningheader' || key === 'runninghead' || key === 'running') {
            return ctx.runningHeader != null ? String(ctx.runningHeader) : '';
        }
        if (key === 'pageside' || key === 'side') {
            if (ctx.side === 'left') {
                return 'Left';
            }
            if (ctx.side === 'right') {
                return 'Right';
            }
            return '';
        }
        if (key === 'pageno' || key === 'page') {
            return ctx.pageNo != null && ctx.pageNo !== '' ? String(ctx.pageNo) : '';
        }
        if (key === 'pagecount' || key === 'pages') {
            return ctx.pageCount != null ? String(ctx.pageCount) : '';
        }
        if (key === 'title') {
            return values.title || '';
        }
        if (key === 'publisheddate') {
            return values.publisheddate || '';
        }
        if (key === 'date') {
            return new Date().toLocaleDateString();
        }
        if (key === 'time') {
            return new Date().toLocaleTimeString();
        }
        if (key === 'datetime') {
            return new Date().toLocaleString();
        }
        if (values[key] !== undefined) {
            return values[key];
        }
        return null;
    }

    function resolveFields(text, ctx) {
        if (text == null) {
            return '';
        }
        return String(text).replace(FIELD_RE, function (match, name) {
            var v = resolveFieldValue(name, ctx);
            return v != null ? v : match;
        });
    }

    function resolveFieldsIn(node, ctx) {
        if (!node) {
            return;
        }
        var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        var texts = [];
        var n;
        while ((n = walker.nextNode())) {
            texts.push(n);
        }
        texts.forEach(function (t) {
            var v = resolveFields(t.nodeValue, ctx);
            if (v !== t.nodeValue) {
                t.nodeValue = v;
            }
        });
    }

    function isDropCapSpan(el) {
        if (!el || !el.classList) {
            return false;
        }
        return el.classList.contains('dropcap') || el.classList.contains('studio-dropcap');
    }

    function cleanDropCapSpan(span) {
        var style = span.getAttribute('style') || '';
        span.removeAttribute('style');
        if (/^[\s;]*(--ts-dc-[\w-]+|float|line-height|color|width|font-size)/i.test(style)) {
            span.setAttribute('style', style);
        }
        Array.prototype.slice.call(span.childNodes).forEach(function (child) {
            if (child.nodeType !== 1) {
                return;
            }
            var tag = child.tagName.toLowerCase();
            if (tag === 'svg') {
                cleanSvgGlyph(child);
            } else if (tag !== 'span') {
                while (child.firstChild) {
                    span.insertBefore(child.firstChild, child);
                }
                span.removeChild(child);
            } else {
                cleanInline(child);
            }
        });
    }

    function cleanSvgGlyph(svg) {
        Array.prototype.slice.call(svg.childNodes).forEach(function (child) {
            if (child.nodeType !== 1) {
                svg.removeChild(child);
                return;
            }
            var tag = child.tagName.toLowerCase();
            if (tag !== 'path') {
                while (child.firstChild) {
                    svg.insertBefore(child.firstChild, child);
                }
                svg.removeChild(child);
            }
        });
    }

    function inlineHtml(text) {
        var s = String(text || '');
        if (!s) {
            return '';
        }
        var doc = new DOMParser().parseFromString('<div>' + s + '</div>', 'text/html');
        var allowed = { b: 1, strong: 1, i: 1, em: 1, u: 1, a: 1, br: 1, span: 1, sup: 1, sub: 1, code: 1 };
        function cleanInline(node) {
            var kids = Array.prototype.slice.call(node.childNodes);
            kids.forEach(function (child) {
                if (child.nodeType === 1) {
                    var tag = child.tagName.toLowerCase();
                    if (tag === 'span' && isDropCapSpan(child)) {
                        cleanDropCapSpan(child);
                        return;
                    }
                    if (tag === 'span' && child.classList.contains('studio-dropcap-rest')) {
                        cleanInline(child);
                        return;
                    }
                    if (!allowed[tag]) {
                        while (child.firstChild) {
                            node.insertBefore(child.firstChild, child);
                        }
                        node.removeChild(child);
                    } else {
                        if (tag === 'a') {
                            var href = child.getAttribute('href') || '';
                            if (/^\s*javascript:/i.test(href)) {
                                child.removeAttribute('href');
                            } else if (/^https?:/i.test(href)) {
                                child.setAttribute('rel', 'noopener noreferrer');
                                child.setAttribute('target', '_blank');
                            }
                        }
                        cleanInline(child);
                    }
                }
            });
        }
        cleanInline(doc.body);
        return doc.body.innerHTML;
    }

    var TSL_LAYOUT_BREAK_TYPES = {
        pageheader: 1, pagefooter: 1, newpage: 1, document: 1,
        'manuscript-title': 1, 'image-index': 1, 'full-page': 1, 'front-cover': 1,
        paywall: 1, toc: 1
    };

    function blockLayoutCols(block) {
        return Number(block && block.cols) === 1 ? 1 : 2;
    }

    function breaksColRun(block) {
        if (!block || !block.type) {
            return true;
        }
        return !!TSL_LAYOUT_BREAK_TYPES[block.type];
    }

    function leanRowWrap(innerHtml, rowClass) {
        if (!innerHtml) {
            return '';
        }
        return '<div class="studio-lean-row' + (rowClass ? ' studio-lean-row--two' : '') + '">'
            + innerHtml + '</div>';
    }

    function leanColWrap(piece) {
        return '<div class="studio-lean-col">' + piece + '</div>';
    }

    function pageSideForLayout(header, physicalIndex, layoutMode) {
        if (layoutMode === 'pages') {
            return physicalSide(physicalIndex);
        }
        if (header.page.kind === 'print' && header.page.usePrintGutters) {
            return physicalSide(physicalIndex);
        }
        return 'any';
    }

    var TSL_SPREAD_GAP_PX = 12;
    /** Smallest scale applied in “fit screen”; below this we show trim size + scroll. */
    var TSL_MIN_FIT_SCREEN_SCALE = 0.42;
    /** Host width/height below this fraction of trim → treat as too small to shrink the page. */
    var TSL_HOST_CRAMPED_RATIO = 0.55;

    function pageFitsTwoUp(availW, pageW) {
        if (availW < 1) {
            return false;
        }
        if (pageW < 1) {
            pageW = 280;
        }
        return availW >= pageW * 2 + TSL_SPREAD_GAP_PX;
    }

    function hostStageCramped(avail, layout) {
        if (!layout || layout.w < 1 || layout.h < 1) {
            return false;
        }
        if (!avail || avail.w < 1 || avail.h < 1) {
            return true;
        }
        return avail.w < layout.w * TSL_HOST_CRAMPED_RATIO
            || avail.h < layout.h * TSL_HOST_CRAMPED_RATIO;
    }

    function parseCssLengthToPx(root, value) {
        if (!value) {
            return 0;
        }
        value = String(value).trim();
        var m = value.match(/^([\d.]+)(mm|pt|px|rem|em)$/);
        if (!m) {
            return 0;
        }
        var n = parseFloat(m[1]);
        var unit = m[2];
        var rootFont = parseFloat(getComputedStyle(root).fontSize) || 16;
        if (unit === 'mm') {
            return n * (96 / 25.4);
        }
        if (unit === 'pt') {
            return n * (96 / 72);
        }
        if (unit === 'rem' || unit === 'em') {
            return n * rootFont;
        }
        return n;
    }

    function nominalPageWidthPx(root) {
        var pagePx = parseCssLengthToPx(root, getComputedStyle(root).getPropertyValue('--tsl-page-w'));
        var scale = parseFloat(getComputedStyle(root).getPropertyValue('--tsl-reader-scale')) || 1;
        return pagePx * scale;
    }

    function attachPagePager(root, pagesEl) {
        var state = { index: 0, activePage: null, lastView: '' };

        var wrap = document.createElement('div');
        wrap.className = 'tsl-pager-wrap';

        var pager = document.createElement('div');
        pager.className = 'tsl-pager';
        pager.setAttribute('data-tsl-pager', '');

        var prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'tsl-pager-arrow tsl-pager-arrow--prev';
        prevBtn.setAttribute('aria-label', 'Previous page');
        prevBtn.innerHTML = '<span class="tsl-pager-glyph" aria-hidden="true">&#8249;</span>';

        var viewport = document.createElement('div');
        viewport.className = 'tsl-pager-viewport';

        var nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'tsl-pager-arrow tsl-pager-arrow--next';
        nextBtn.setAttribute('aria-label', 'Next page');
        nextBtn.innerHTML = '<span class="tsl-pager-glyph" aria-hidden="true">&#8250;</span>';

        var status = document.createElement('p');
        status.className = 'tsl-pager-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        pager.appendChild(viewport);
        wrap.appendChild(pager);
        wrap.appendChild(status);

        root.insertBefore(wrap, pagesEl);
        viewport.appendChild(pagesEl);
        viewport.appendChild(prevBtn);
        viewport.appendChild(nextBtn);

        function visiblePages() {
            return Array.prototype.filter.call(
                pagesEl.querySelectorAll('.tsl-page'),
                function (p) { return !p.hasAttribute('aria-hidden'); }
            );
        }

        function spreadSteps() {
            return Array.prototype.filter.call(pagesEl.children, function (el) {
                return el.classList.contains('tsl-spread')
                    || (el.classList.contains('tsl-page') && !el.hasAttribute('aria-hidden'));
            });
        }

        function clearActive() {
            Array.prototype.forEach.call(pagesEl.querySelectorAll('.is-active'), function (el) {
                el.classList.remove('is-active');
            });
        }

        function fitContainerEl() {
            return root.closest('[data-tsl-fit-container]')
                || root.closest('[data-tsl-mount]')
                || wrap.parentElement
                || root;
        }

        function containerWidthPx() {
            var w = viewport.clientWidth;
            var box = fitContainerEl();
            if (box && box.clientWidth > w) {
                w = box.clientWidth;
            }
            if (root.clientWidth > w) {
                w = root.clientWidth;
            }
            return w;
        }

        function nominalTrimPageSizePx() {
            var cs = getComputedStyle(root);
            return {
                w: parseCssLengthToPx(root, cs.getPropertyValue('--tsl-page-w')),
                h: parseCssLengthToPx(root, cs.getPropertyValue('--tsl-page-h'))
            };
        }

        function stepLayoutSizeMeasured(step) {
            var gap = 0;
            var w = 0;
            var h = 0;
            if (step.classList.contains('tsl-spread')) {
                var pages = step.querySelectorAll('.tsl-page');
                Array.prototype.forEach.call(pages, function (p) {
                    var sz = pageElementSize(p);
                    w += sz.w;
                    h = Math.max(h, sz.h);
                });
                if (pages.length > 1) {
                    gap = TSL_SPREAD_GAP_PX;
                }
            } else {
                var szOne = pageElementSize(step);
                w = szOne.w;
                h = szOne.h;
            }
            return { w: w + gap, h: h };
        }

        function stepLayoutSize(step) {
            var nom = nominalTrimPageSizePx();
            if (nom.w < 1 || nom.h < 1) {
                return stepLayoutSizeMeasured(step);
            }
            if (step.classList.contains('tsl-spread')) {
                var n = step.querySelectorAll('.tsl-page').length;
                if (n < 1) {
                    n = 1;
                }
                return {
                    w: nom.w * Math.min(n, 2) + (n > 1 ? TSL_SPREAD_GAP_PX : 0),
                    h: nom.h
                };
            }
            return { w: nom.w, h: nom.h };
        }

        /** Host-defined stage (data-tsl-fit-container): geometry only, no chrome constants. */
        function pagerStageSize() {
            var inset = 8;
            var box = fitContainerEl();
            var vpRect = viewport.getBoundingClientRect();
            var w = viewport.clientWidth;
            if (w < 1) {
                w = vpRect.width;
            }
            if (box) {
                var boxRect = box.getBoundingClientRect();
                if (boxRect.width > 0) {
                    w = Math.min(w > 0 ? w : boxRect.width, boxRect.width);
                }
            }
            var h = viewport.clientHeight;
            if (h < 1) {
                h = vpRect.height;
            }
            if (box) {
                var boxRect2 = box.getBoundingClientRect();
                var top = Math.max(vpRect.top, boxRect2.top);
                var bottom = Math.min(vpRect.bottom, boxRect2.bottom);
                if (status.offsetParent) {
                    var st = status.getBoundingClientRect();
                    if (st.top > vpRect.top + 2 && st.top < bottom) {
                        bottom = Math.min(bottom, st.top);
                    }
                }
                var clipH = bottom - top;
                if (clipH > h) {
                    h = clipH;
                }
            }
            return {
                w: Math.max(0, Math.floor(w - inset)),
                h: Math.max(0, Math.floor(h - inset))
            };
        }

        function pageViewMode() {
            var avail = containerWidthPx();
            var nom = nominalTrimPageSizePx();
            if (!pageFitsTwoUp(avail, nom.w)) {
                return 'single';
            }
            return 'spread';
        }

        /** Fit width: honor host box unless unreasonably small. */
        function applyFitWidthPolicy() {
            var fit = getPageFit();
            if (fit === 'native') {
                applyNativePrintSizePolicy();
                return;
            }
            var nom = nominalTrimPageSizePx();
            var availW = containerWidthPx();
            if (nom.w > 0 && availW > 0 && availW < nom.w * TSL_HOST_CRAMPED_RATIO) {
                root.setAttribute('data-tsl-stage-cramped', '1');
            } else {
                root.removeAttribute('data-tsl-stage-cramped');
            }
            root.removeAttribute('data-tsl-scale-unreasonable');
        }

        /** Actual size: print trim (--tsl-page-w/h), not container fit; scroll if the host is too small. */
        function applyNativePrintSizePolicy() {
            root.removeAttribute('data-tsl-stage-cramped');
            root.removeAttribute('data-tsl-scale-unreasonable');
            viewport.style.alignItems = 'flex-start';
            viewport.style.justifyContent = 'center';
            viewport.style.overflowX = 'auto';
            viewport.style.overflowY = 'auto';
            viewport.style.height = '';
            viewport.style.maxHeight = '';
            viewport.style.minHeight = '';
            viewport.style.flex = '';
        }

        function bailFitScreenToScroll(layout, avail) {
            root.setAttribute('data-tsl-scale-unreasonable', '1');
            applyFitWidthPolicy();
            viewport.style.alignItems = 'flex-start';
            viewport.style.justifyContent = 'center';
            viewport.style.overflowX = 'auto';
            viewport.style.overflowY = 'auto';
            viewport.style.height = '';
            viewport.style.maxHeight = '';
            viewport.style.minHeight = '';
            viewport.style.flex = '';
        }

        function stepsForView(view) {
            return view === 'spread' ? spreadSteps() : visiblePages();
        }

        function remapIndex(steps, view) {
            if (!state.activePage || !steps.length) {
                return;
            }
            var i;
            for (i = 0; i < steps.length; i += 1) {
                if (view === 'spread') {
                    if (steps[i] === state.activePage || steps[i].contains(state.activePage)) {
                        state.index = i;
                        return;
                    }
                } else if (steps[i] === state.activePage) {
                    state.index = i;
                    return;
                }
            }
        }

        function rememberActiveFromStep(step) {
            if (step.classList.contains('tsl-spread')) {
                state.activePage = step.querySelector('.tsl-page');
            } else {
                state.activePage = step;
            }
        }

        function refresh() {
            var view = pageViewMode();
            var viewChanged = view !== state.lastView;
            state.lastView = view;
            root.setAttribute('data-tsl-page-view', view);

            var steps = stepsForView(view);
            if (!steps.length) {
                clearActive();
                status.textContent = '';
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                return;
            }

            if (viewChanged) {
                remapIndex(steps, view);
            }
            if (state.index >= steps.length) {
                state.index = steps.length - 1;
            }
            if (state.index < 0) {
                state.index = 0;
            }

            clearActive();
            var current = steps[state.index];
            current.classList.add('is-active');
            rememberActiveFromStep(current);

            prevBtn.disabled = state.index <= 0;
            nextBtn.disabled = state.index >= steps.length - 1;
            status.textContent = (view === 'spread' ? 'Spread ' : 'Page ')
                + (state.index + 1) + ' of ' + steps.length;
            requestAnimationFrame(function () {
                requestAnimationFrame(applyViewportScale);
            });
            if (typeof root._tslPagerChangeFn === 'function') {
                root._tslPagerChangeFn();
            }
        }

        function clearStepStageStyles() {
            Array.prototype.forEach.call(
                pagesEl.querySelectorAll('.tsl-spread, .tsl-page'),
                function (el) {
                    el.style.transform = '';
                    el.style.transformOrigin = '';
                    el.style.width = '';
                    el.style.height = '';
                    el.style.marginLeft = '';
                    el.style.marginRight = '';
                    el.style.marginBottom = '';
                }
            );
        }

        function clearPagerStageStyles() {
            viewport.style.height = '';
            viewport.style.minHeight = '';
            viewport.style.maxHeight = '';
            viewport.style.overflow = '';
            viewport.style.overflowX = '';
            viewport.style.overflowY = '';
            viewport.style.alignItems = '';
            viewport.style.justifyContent = '';
            pagesEl.style.width = '';
            pagesEl.style.height = '';
            pagesEl.style.transform = '';
            pagesEl.style.transformOrigin = '';
            pagesEl.style.marginLeft = '';
            pagesEl.style.marginRight = '';
            clearStepStageStyles();
            root.style.removeProperty('--tsl-viewport-scale');
        }

        function pageElementSize(pageEl) {
            if (!pageEl) {
                return { w: 0, h: 0 };
            }
            var w = Math.max(pageEl.offsetWidth, pageEl.getBoundingClientRect().width);
            var h = Math.max(pageEl.offsetHeight, pageEl.getBoundingClientRect().height);
            var body = pageEl.querySelector('.tsl-body');
            if (body) {
                var inner = body.scrollHeight;
                var header = pageEl.querySelector('.tsl-region--header');
                var footer = pageEl.querySelector('.tsl-region--footer');
                var stack = inner;
                if (header) {
                    stack += header.offsetHeight;
                }
                if (footer) {
                    stack += footer.offsetHeight;
                }
                var cs = getComputedStyle(pageEl);
                stack += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
                h = Math.max(h, stack);
            }
            return { w: w, h: h };
        }

        function applyStepTransform(step, layout, scale, opts) {
            var contentW = layout.w;
            var pageH = layout.h;
            var scaledH = pageH * scale;
            step.style.width = contentW + 'px';
            step.style.height = pageH + 'px';
            step.style.transform = 'scale(' + scale + ')';
            step.style.transformOrigin = 'top center';
            step.style.marginLeft = 'auto';
            step.style.marginRight = 'auto';
            step.style.marginBottom = (scaledH - pageH) + 'px';
            root.style.setProperty('--tsl-viewport-scale', String(scale));
            if (opts.lockHeight) {
                var boxH = opts.stageHeight > 0 ? opts.stageHeight : Math.ceil(scaledH);
                viewport.style.overflow = 'hidden';
                viewport.style.alignItems = 'flex-start';
                viewport.style.justifyContent = 'center';
                viewport.style.flex = '1 1 0';
                viewport.style.height = boxH + 'px';
                viewport.style.maxHeight = boxH + 'px';
                viewport.style.minHeight = '0';
            } else {
                var avail = pagerStageSize();
                viewport.style.overflowX = 'auto';
                viewport.style.overflowY = 'auto';
                viewport.style.alignItems = 'flex-start';
                viewport.style.justifyContent = 'center';
                viewport.style.height = '';
                viewport.style.maxHeight = '';
                viewport.style.minHeight = Math.ceil(Math.min(scaledH, avail.h)) + 'px';
            }
        }

        function applyViewportScale() {
            var fit = getPageFit();
            root.setAttribute('data-tsl-page-fit', fit);
            clearPagerStageStyles();

            var view = root.getAttribute('data-tsl-page-view') || 'single';
            var steps = stepsForView(view);
            var current = steps[state.index];
            if (!current) {
                return;
            }

            viewport.style.alignItems = 'flex-start';
            viewport.style.justifyContent = 'center';
            viewport.style.overflowX = 'auto';
            viewport.style.overflowY = 'auto';

            if (fit === 'native') {
                applyNativePrintSizePolicy();
                return;
            }
            if (fit === 'fit') {
                applyFitWidthPolicy();
                return;
            }

            var layout = stepLayoutSize(current);
            var avail = pagerStageSize();
            if (layout.w < 1 || layout.h < 1) {
                bailFitScreenToScroll(layout, avail);
                return;
            }
            if (hostStageCramped(avail, layout)) {
                bailFitScreenToScroll(layout, avail);
                return;
            }

            var s = Math.min(avail.w / layout.w, avail.h / layout.h) * 0.985;
            if (s < TSL_MIN_FIT_SCREEN_SCALE) {
                bailFitScreenToScroll(layout, avail);
                return;
            }
            s = Math.min(s, 1);
            root.removeAttribute('data-tsl-scale-unreasonable');
            root.removeAttribute('data-tsl-stage-cramped');
            applyStepTransform(current, layout, s, { lockHeight: true, stageHeight: avail.h });
        }

        function goToIndex(idx) {
            var view = root.getAttribute('data-tsl-page-view') || 'single';
            var steps = stepsForView(view);
            if (!steps.length) {
                return false;
            }
            var i = Math.max(0, Math.min(steps.length - 1, idx));
            if (i === state.index) {
                return true;
            }
            state.index = i;
            rememberActiveFromStep(steps[state.index]);
            refresh();
            return true;
        }

        function go(delta) {
            var view = root.getAttribute('data-tsl-page-view') || 'single';
            var steps = stepsForView(view);
            var next = state.index + delta;
            if (next < 0 || next >= steps.length) {
                return false;
            }
            return goToIndex(next);
        }

        function pagerInfo() {
            var view = root.getAttribute('data-tsl-page-view') || 'single';
            var steps = stepsForView(view);
            return {
                index: state.index,
                total: steps.length,
                view: view
            };
        }

        function stepForElement(el) {
            if (!el || !el.closest) {
                return -1;
            }
            var view = root.getAttribute('data-tsl-page-view') || 'single';
            var steps = stepsForView(view);
            var i;
            for (i = 0; i < steps.length; i += 1) {
                if (steps[i] === el || steps[i].contains(el)) {
                    return i;
                }
            }
            return -1;
        }

        function goToElement(el) {
            if (!el) {
                return false;
            }
            var i = stepForElement(el);
            if (i < 0 && el.id) {
                var byId = findInDocumentAnchorTarget('#' + el.id, root);
                if (byId && byId !== el) {
                    i = stepForElement(byId);
                    el = byId;
                }
            }
            if (i < 0) {
                return false;
            }
            return goToIndex(i);
        }

        prevBtn.addEventListener('click', function () { go(-1); });
        nextBtn.addEventListener('click', function () { go(1); });

        var resizeTimer;
        function schedulePagerRefresh() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(refresh, 120);
        }
        window.addEventListener('resize', schedulePagerRefresh);
        window.addEventListener('orientationchange', schedulePagerRefresh);

        if (typeof ResizeObserver !== 'undefined') {
            var pagerResizeObs = new ResizeObserver(schedulePagerRefresh);
            pagerResizeObs.observe(viewport);
            var fitObsEl = fitContainerEl();
            if (fitObsEl && fitObsEl !== viewport) {
                pagerResizeObs.observe(fitObsEl);
            }
            root._tslPagerResizeObs = pagerResizeObs;
        }

        document.addEventListener('keydown', function onPagerKey(e) {
            if (!root.isConnected || getTslLayout() !== 'pages') {
                return;
            }
            var t = e.target;
            if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) {
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                go(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                go(1);
            }
        });

        root._tslPagerRefresh = refresh;
        root._tslPagerClearStage = clearPagerStageStyles;
        root._tslPagerStep = go;
        root._tslPagerGoToIndex = goToIndex;
        root._tslPagerGoToElement = goToElement;
        root._tslPagerInfo = pagerInfo;
        root._tslPagerStepForElement = stepForElement;
        root._tslPagerSetOnChange = function (fn) {
            root._tslPagerChangeFn = typeof fn === 'function' ? fn : null;
            if (root._tslPagerChangeFn) {
                root._tslPagerChangeFn();
            }
        };
        refresh();
        window.requestAnimationFrame(function () {
            applyViewportScale();
        });
    }

    function render(mount, parsed) {
        var header = parsed.header;
        var blocks = parsed.blocks;
        ensureHeadingNumbers(blocks, header);
        var page = header.page;
        var ty = header.typography;
        var layoutMode = getTslLayout();
        var root = document.createElement('div');
        root.className = 'tsl-root';
        root.setAttribute('data-tsl-layout', layoutMode);
        root.setAttribute('data-tsl-theme', header.theme || 'default');
        if (ty.hyphenation) {
            root.setAttribute('data-tsl-hyphenate', '1');
        }
        root.style.setProperty('--tsl-page-w', page.trimMM.width + 'mm');
        root.style.setProperty('--tsl-page-h', page.trimMM.height + 'mm');
        root.style.setProperty('--tsl-pad-t', page.marginsMM.top + 'mm');
        root.style.setProperty('--tsl-pad-b', page.marginsMM.bottom + 'mm');
        root.style.setProperty('--tsl-pad-out', page.marginsMM.outside + 'mm');
        root.style.setProperty('--tsl-pad-gutter', page.marginsMM.gutter + 'mm');
        root.style.setProperty('--tsl-doc-font', ty.fontFamily);
        root.style.setProperty('--tsl-size-base', ty.sizePt + 'pt');
        root.style.setProperty('--tsl-lh', String(ty.lineHeight));
        root.style.setProperty('--tsl-text-align', ty.paragraphAlign);
        root.style.setProperty('--tsl-indent', ty.paragraphIndentIn > 0 ? ty.paragraphIndentIn + 'in' : '0');
        root.style.setProperty('--tsl-para-space', ty.paragraphSpacingPt > 0 ? ty.paragraphSpacingPt + 'pt' : '0.85em');

        var pagesEl = document.createElement('div');
        pagesEl.className = 'tsl-pages';
        var measurePage = document.createElement('section');
        measurePage.className = 'tsl-page';
        measurePage.setAttribute('data-tsl-side', 'any');
        measurePage.setAttribute('aria-hidden', 'true');
        measurePage.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;height:auto;min-height:0;';
        var measureBody = document.createElement('div');
        measureBody.className = 'tsl-body';
        measurePage.appendChild(measureBody);
        root.appendChild(measurePage);
        mount.innerHTML = '';
        mount.appendChild(root);
        applyReadingPrefs(root);
        var headerState = { any: null, left: null, right: null };
        var footerState = { any: null, left: null, right: null };
        var physical = 0;
        var pages = [];
        var values = mergeFieldValues(header);
        var readMode = header.readMode !== false;
        var runningHeader = '';
        var blockRenderCtx = { allBlocks: blocks };

        function pickSide(state, side) {
            if (state[side]) {
                return state[side];
            }
            return state.any;
        }

        function startPage(opts) {
            physical += 1;
            var side = pageSideForLayout(header, physical, layoutMode);
            var pg = {
                side: side,
                physical: physical,
                pageNo: displayPageNo(header, physical),
                fullBleed: !!(opts && opts.fullBleed),
                runningHeader: '',
                usedH: 0,
                body: document.createElement('div'),
                header: pickSide(headerState, side),
                footer: pickSide(footerState, side)
            };
            pg.body.className = 'tsl-body';
            pages.push(pg);
            return pg;
        }

        var current = null;

        function bodyMaxHeightPx(side) {
            var mm = 96 / 25.4;
            var bodyHmm = page.trimMM.height - page.marginsMM.top - page.marginsMM.bottom
                - (page.headerTopMM || 0) - (page.footerBottomMM || 0);
            return Math.max(120, bodyHmm * mm) / paginationReaderScale();
        }

        function measurePageContentWidthPx() {
            var nominal = parseCssLengthToPx(root, page.trimMM.width + 'mm');
            if (layoutMode === 'pages' || tslAuthorPrintLayout() || getPageFit() === 'native') {
                return Math.max(120, nominal);
            }
            var mount = root.closest('[data-tsl-mount]') || root.parentElement;
            var mountW = mount && mount.clientWidth ? mount.clientWidth : 0;
            var scaledNominal = nominal * paginationReaderScale();
            if (mountW > 0) {
                return Math.max(120, Math.min(scaledNominal, mountW));
            }
            return Math.max(120, scaledNominal);
        }

        function syncMeasurePageBox() {
            measurePage.style.width = measurePageContentWidthPx() + 'px';
        }

        function ensurePage() {
            if (!current) {
                current = startPage();
            }
        }

        function appendBlockToColumn(col, b) {
            var type = b.type;
            if (type === 'bullet' || type === 'todo') {
                var listType = type === 'todo' ? 'todo' : (b.bulletStyle || 'disc');
                var ul = col.querySelector('.tsl-list[data-list-type="' + listType + '"]');
                if (!ul) {
                    ul = document.createElement(type === 'todo' ? 'ul' : (listType === 'number' ? 'ol' : 'ul'));
                    ul.className = 'tsl-list' + (type === 'todo' ? ' tsl-list--todo' : '');
                    ul.setAttribute('data-list-type', listType);
                    col.appendChild(ul);
                }
                ul.appendChild(renderListItem(b, type));
                return;
            }
            col.appendChild(renderBlock(b, blockRenderCtx));
        }

        function appendFlowRow(blocksInRow, rowClass) {
            ensurePage();
            var row = document.createElement('div');
            row.className = 'tsl-row tsl-row--' + rowClass;
            blocksInRow.forEach(function (pb) {
                var col = document.createElement('div');
                col.className = 'tsl-col';
                appendBlockToColumn(col, pb);
                row.appendChild(col);
            });
            syncMeasurePageBox();
            measureBody.innerHTML = '';
            measureBody.appendChild(row);
            var rowH = measureBody.offsetHeight;
            var maxH = bodyMaxHeightPx(current.side);
            var used = current.usedH || 0;
            if (used > 0 && used + rowH > maxH) {
                current = startPage();
                used = 0;
            }
            current.body.appendChild(row);
            current.usedH = used + rowH + 4;
        }

        var bi = 0;
        while (bi < blocks.length) {
            var pre = blocks[bi];
            if (!pre || !pre.type) { bi += 1; continue; }
            if (pre.type === 'pageheader') {
                headerState[pre.side || 'any'] = pre; bi += 1; continue;
            }
            if (pre.type === 'pagefooter') {
                footerState[pre.side || 'any'] = pre; bi += 1; continue;
            }
            break;
        }
        while (bi < blocks.length) {
            var b = blocks[bi];
            if (!b || !b.type) {
                bi += 1;
                continue;
            }
            var type = b.type;
            if (type === 'pageheader') {
                headerState[b.side || 'any'] = b;
                if (current && current.body.childNodes.length === 0) {
                    current.header = pickSide(headerState, current.side);
                }
                bi += 1;
                continue;
            }
            if (type === 'pagefooter') {
                footerState[b.side || 'any'] = b;
                if (current && current.body.childNodes.length === 0) {
                    current.footer = pickSide(footerState, current.side);
                }
                bi += 1;
                continue;
            }
            if (type === 'newpage') {
                current = startPage();
                bi += 1;
                continue;
            }
            if (type === 'front-cover' || type === 'full-page') {
                current = startPage({ fullBleed: type === 'front-cover' });
                var bleedRow = document.createElement('div');
                bleedRow.className = 'tsl-row tsl-row--full';
                var bleedCol = document.createElement('div');
                bleedCol.className = 'tsl-col';
                bleedCol.appendChild(renderBlock(b, blockRenderCtx));
                bleedRow.appendChild(bleedCol);
                current.body.appendChild(bleedRow);
                current = null;
                bi += 1;
                continue;
            }
            if (type === 'toc' || type === 'image-index' || type === 'manuscript-title') {
                appendFlowRow([b], 'full');
                var markerPage = pages[pages.length - 1];
                if (markerPage) {
                    if (type === 'toc') {
                        markerPage.tocBlock = b;
                    } else if (type === 'image-index') {
                        markerPage.imageIndexBlock = b;
                    }
                }
                bi += 1;
                continue;
            }
            if (type === 'paywall') {
                appendFlowRow([b], 'full');
                bi += 1;
                continue;
            }
            if (type === 'document') {
                bi += 1;
                continue;
            }
            if (/^h[1-3]$/.test(type) || type === 'title') {
                var ht = plainText(b.text);
                runningHeader = ht;
                if (current) {
                    current.runningHeader = ht;
                }
            }

            if (blockLayoutCols(b) === 1) {
                var run = [b];
                bi += 1;
                while (bi < blocks.length && blockLayoutCols(blocks[bi]) === 1 && !breaksColRun(blocks[bi])) {
                    run.push(blocks[bi]);
                    bi += 1;
                }
                var rk = 0;
                while (rk < run.length) {
                    var pair = run.slice(rk, rk + 2);
                    rk += pair.length;
                    appendFlowRow(pair, pair.length === 2 ? 'two' : 'one');
                }
                continue;
            }

            appendFlowRow([b], 'full');
            bi += 1;
        }
        pages = pages.filter(function (p) { return p.body.childNodes.length > 0; });
        refreshIndexBlocksInPages(pages, blocks);
        var pageCount = pages.length;
        var spreadEl = null;
        pages.forEach(function (pg) {
            var section = document.createElement('section');
            section.className = 'tsl-page';
            section.setAttribute('data-tsl-side', pg.side);
            if (pg.pageNo != null) {
                section.setAttribute('data-tsl-page-no', String(pg.pageNo));
            }
            if (pg.fullBleed) {
                section.setAttribute('data-tsl-full-bleed', '1');
            }
            var ctx = {
                pageNo: pg.pageNo,
                pageCount: pageCount,
                side: pg.side,
                values: values,
                runningHeader: pg.runningHeader || runningHeader
            };
            if (pg.header && !pg.fullBleed) {
                section.appendChild(renderRegion(pg.header, 'header', page.headerRule, ctx, readMode));
            }
            section.appendChild(pg.body);
            if (readMode) {
                resolveFieldsIn(pg.body, ctx);
            }
            if (pg.footer && !pg.fullBleed) {
                section.appendChild(renderRegion(pg.footer, 'footer', page.footerRule, ctx, readMode));
            }
            if (layoutMode === 'pages' && (pg.side === 'left' || pg.side === 'right')) {
                if (pg.side === 'left' || !spreadEl) {
                    spreadEl = document.createElement('div');
                    spreadEl.className = 'tsl-spread';
                    pagesEl.appendChild(spreadEl);
                }
                spreadEl.appendChild(section);
                if (pg.side === 'right') {
                    spreadEl = null;
                }
            } else {
                spreadEl = null;
                pagesEl.appendChild(section);
            }
        });

        root.appendChild(pagesEl);
        applyReadingPrefs(root);
        if (layoutMode === 'pages') {
            attachPagePager(root, pagesEl);
        }
        bindInDocumentAnchorClicks(root);
        updateTslPrintPageRule(root);
        bindTslPrintLifecycle();
        return root;
    }

    var READER_PREFS_KEY = 'reader:prefs';
    var TSL_LAYOUT_KEY = 'tsl:layout';
    var READER_SIZES = [14, 16, 18, 20, 24];
    var READER_DEFAULT_PREFS = { font: 'serif', size: 18, theme: 'light', width: 'medium', pageFit: 'fit' };
    var tslPrintPageStyleEl = null;
    var tslPrintBound = false;

    function tslPrefsStorage() {
        var api = global.__TalesmithTslStorage;
        if (api && typeof api.getItem === 'function' && typeof api.setItem === 'function') {
            return api;
        }
        return null;
    }

    function loadStored(key, fallback) {
        var store = tslPrefsStorage();
        if (!store) {
            return fallback;
        }
        try {
            var raw = store.getItem(key);
            if (raw === null || raw === undefined) {
                return fallback;
            }
            var v = JSON.parse(raw);
            return v === null || v === undefined ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function saveStored(key, value) {
        var store = tslPrefsStorage();
        if (!store) {
            return;
        }
        try {
            store.setItem(key, JSON.stringify(value));
        } catch (e) { /* private mode */ }
    }

    function getReadingPrefs() {
        var p = Object.assign({}, READER_DEFAULT_PREFS, loadStored(READER_PREFS_KEY, {}));
        if (READER_SIZES.indexOf(p.size) < 0) {
            p.size = 18;
        }
        return p;
    }

    function getPageFit() {
        var v = getReadingPrefs().pageFit;
        return v === 'native' || v === 'scale' ? v : 'fit';
    }

    function updateTslPrintPageRule(root) {
        if (!root || typeof document === 'undefined') {
            return;
        }
        var styles = getComputedStyle(root);
        var w = (styles.getPropertyValue('--tsl-page-w') || '210mm').trim();
        var h = (styles.getPropertyValue('--tsl-page-h') || '297mm').trim();
        if (!tslPrintPageStyleEl) {
            tslPrintPageStyleEl = document.createElement('style');
            tslPrintPageStyleEl.setAttribute('data-tsl-print-page', '');
            document.head.appendChild(tslPrintPageStyleEl);
        }
        tslPrintPageStyleEl.textContent = '@media print{@page{size:' + w + ' ' + h + ';margin:0;}}';
    }

    function bindTslPrintLifecycle() {
        if (tslPrintBound || typeof window === 'undefined') {
            return;
        }
        tslPrintBound = true;
        window.addEventListener('beforeprint', function () {
            document.documentElement.setAttribute('data-tsl-printing', '1');
            rerenderAllTslMounts();
            if (!document.querySelectorAll) {
                return;
            }
            document.querySelectorAll('.tsl-root').forEach(function (root) {
                root.setAttribute('data-tsl-print-all', '1');
                updateTslPrintPageRule(root);
                if (typeof root._tslPagerClearStage === 'function') {
                    root._tslPagerClearStage();
                }
            });
        });
        window.addEventListener('afterprint', function () {
            document.documentElement.removeAttribute('data-tsl-printing');
            rerenderAllTslMounts();
        });
    }

    function getTslLayout() {
        if (typeof document !== 'undefined' && document.querySelector) {
            var readerArticle = document.querySelector('[data-reader-article][data-tsl-layout]');
            if (readerArticle) {
                var owned = readerArticle.getAttribute('data-tsl-layout');
                if (owned === 'scroll' || owned === 'pages') {
                    return owned;
                }
            }
        }
        return loadStored(TSL_LAYOUT_KEY, 'pages') === 'scroll' ? 'scroll' : 'pages';
    }

    function readerSizeScale(sizePx) {
        var n = parseInt(sizePx, 10);
        if (READER_SIZES.indexOf(n) < 0) {
            n = 18;
        }
        return n / 18;
    }

    function tslAuthorPrintLayout() {
        return typeof document !== 'undefined'
            && document.documentElement
            && document.documentElement.hasAttribute('data-tsl-printing');
    }

    function paginationReaderScale() {
        if (tslAuthorPrintLayout() || getPageFit() === 'native') {
            return 1;
        }
        return readerSizeScale(getReadingPrefs().size);
    }

    function rerenderAllTslMounts() {
        if (typeof document === 'undefined' || !document.querySelectorAll) {
            return;
        }
        document.querySelectorAll('[data-tsl-mount]').forEach(function (mount) {
            if (mount._tslParsed) {
                render(mount, mount._tslParsed);
            }
        });
    }

    function applyReadingPrefs(root) {
        if (!root) {
            return;
        }
        var p = getReadingPrefs();
        var layout = getTslLayout();
        root.setAttribute('data-tsl-reader-font', p.font || 'serif');
        root.setAttribute('data-tsl-reader-size', String(p.size || 18));
        root.setAttribute('data-tsl-reader-theme', p.theme || 'light');
        root.setAttribute('data-tsl-reader-width', p.width || 'medium');
        root.setAttribute('data-tsl-layout', layout);
        root.setAttribute('data-tsl-page-fit', tslAuthorPrintLayout() ? 'native' : getPageFit());
        root.style.setProperty('--tsl-reader-scale', String(paginationReaderScale()));
        if (layout === 'pages' && typeof root._tslPagerRefresh === 'function') {
            root._tslPagerRefresh();
        }
    }

    function refreshAllReadingPrefs(relayout) {
        if (relayout) {
            document.querySelectorAll('[data-tsl-mount]').forEach(function (mount) {
                if (mount._tslParsed) {
                    render(mount, mount._tslParsed);
                }
            });
        } else {
            document.querySelectorAll('.tsl-root').forEach(applyReadingPrefs);
        }
        document.querySelectorAll('.studio-lean-tsl').forEach(applyLeanReadingPrefs);
    }

    function setReadingPref(key, value) {
        if (key === 'layout') {
            saveStored(TSL_LAYOUT_KEY, value === 'scroll' ? 'scroll' : 'pages');
            refreshAllReadingPrefs(true);
            return;
        }
        if (key === 'pageFit') {
            var pf = getReadingPrefs();
            pf.pageFit = value === 'native' || value === 'scale' ? value : 'fit';
            saveStored(READER_PREFS_KEY, pf);
            refreshAllReadingPrefs(false);
            applyLeanReadingPrefs(document.querySelector('.studio-lean-tsl'));
            return;
        }
        var p = getReadingPrefs();
        if (key === 'size') {
            p.size = parseInt(value, 10);
        } else {
            p[key] = value;
        }
        saveStored(READER_PREFS_KEY, p);
        if (key === 'size') {
            refreshAllReadingPrefs(true);
        } else {
            refreshAllReadingPrefs(false);
        }
    }

    function resetReadingPrefs() {
        saveStored(READER_PREFS_KEY, READER_DEFAULT_PREFS);
        saveStored(TSL_LAYOUT_KEY, 'pages');
        refreshAllReadingPrefs(true);
    }

    function syncReadingPrefsUI(container) {
        if (!container) {
            return;
        }
        var p = getReadingPrefs();
        var layout = getTslLayout();
        container.querySelectorAll('[data-tsl-pref]').forEach(function (b) {
            var key = b.getAttribute('data-tsl-pref');
            var cur = key === 'layout' ? layout : (key === 'size' ? String(p.size)
                : (key === 'pageFit' ? getPageFit() : p[key]));
            var on = b.getAttribute('data-value') === cur;
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.classList.toggle('is-on', on);
        });
    }

    function findInDocumentAnchorTarget(hash, root) {
        var id = String(hash || '').replace(/^#/, '').trim();
        if (!id || !root) {
            return null;
        }
        var el = document.getElementById(id);
        if (el && root.contains(el)) {
            return el;
        }
        if (id.indexOf('tsl-h-') !== 0 && id.indexOf('h-') === 0) {
            el = document.getElementById('tsl-' + id);
            if (el && root.contains(el)) {
                return el;
            }
        }
        var m = id.match(/^tsl-h-(.+)$/);
        if (m) {
            el = root.querySelector('[data-tsl-block-id="' + m[1] + '"]');
            if (el) {
                return el;
            }
        }
        m = id.match(/^h-(.+)$/);
        if (m) {
            el = root.querySelector('[data-tsl-block-id="' + m[1] + '"]');
            if (el) {
                return el;
            }
            el = document.getElementById('h-' + m[1]);
            if (el && root.contains(el)) {
                return el;
            }
        }
        return null;
    }

    function navigateToInDocumentAnchor(target, root) {
        if (!target || !root) {
            return false;
        }
        var layout = root.getAttribute('data-tsl-layout');
        if (!layout || layout === 'pages') {
            layout = getTslLayout();
        }
        if (layout === 'pages' && typeof root._tslPagerGoToElement === 'function') {
            var ok = root._tslPagerGoToElement(target);
            if (ok && target.id && history.replaceState) {
                history.replaceState(null, '', '#' + target.id);
            }
            return ok;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target.id && history.replaceState) {
            history.replaceState(null, '', '#' + target.id);
        }
        return true;
    }

    function bindInDocumentAnchorClicks(root) {
        if (!root || root._tslAnchorClickBound) {
            return;
        }
        root._tslAnchorClickBound = true;
        root.addEventListener('click', function (e) {
            var a = e.target.closest('a.studio-lean-toc-link[href^="#"]');
            if (!a || !root.contains(a)) {
                return;
            }
            var hash = a.getAttribute('href');
            if (!hash || hash === '#') {
                return;
            }
            var target = findInDocumentAnchorTarget(hash, root);
            if (!target) {
                return;
            }
            e.preventDefault();
            navigateToInDocumentAnchor(target, root);
        });
        root._tslGoToDocumentHash = function (hash) {
            var target = findInDocumentAnchorTarget(hash, root);
            if (!target) {
                return false;
            }
            return navigateToInDocumentAnchor(target, root);
        };
    }

    function bindReadingPrefsUI(container) {
        if (!container) {
            return;
        }
        syncReadingPrefsUI(container);
        container.addEventListener('click', function (e) {
            var b = e.target.closest('[data-tsl-pref]');
            if (b) {
                setReadingPref(b.getAttribute('data-tsl-pref'), b.getAttribute('data-value'));
                syncReadingPrefsUI(container);
                return;
            }
            var step = e.target.closest('[data-tsl-size-step]');
            if (step) {
                var p = getReadingPrefs();
                var i = READER_SIZES.indexOf(p.size) + parseInt(step.getAttribute('data-tsl-size-step'), 10);
                setReadingPref('size', READER_SIZES[Math.max(0, Math.min(READER_SIZES.length - 1, i))]);
                syncReadingPrefsUI(container);
                return;
            }
            if (e.target.closest('[data-tsl-prefs-reset]')) {
                resetReadingPrefs();
                syncReadingPrefsUI(container);
            }
        });
    }

    function renderRegion(block, kind, rule, ctx, readMode) {
        var el = document.createElement('div');
        el.className = 'tsl-region tsl-region--' + kind;
        if (rule) {
            el.setAttribute('data-tsl-rule', '1');
        }
        ['left', 'center', 'right'].forEach(function (slot) {
            var key = slot === 'left' ? 'textLeft' : (slot === 'center' ? 'textCenter' : 'textRight');
            var span = document.createElement('span');
            span.className = 'tsl-region-slot tsl-region-slot--' + slot;
            var raw = block[key] || '';
            span.textContent = resolveFields(raw, ctx);
            el.appendChild(span);
        });
        return el;
    }

    function plainText(html) {
        var d = document.createElement('div');
        d.innerHTML = inlineHtml(html);
        return (d.textContent || '').trim();
    }

    function renderListItem(b, type) {
        var li = document.createElement('li');
        if (type === 'todo') {
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.disabled = true;
            cb.checked = !!b.checked;
            li.appendChild(cb);
            var span = document.createElement('span');
            span.innerHTML = inlineHtml(b.text);
            if (b.checked) {
                span.className = 'tsl-done';
            }
            li.appendChild(span);
        } else {
            li.innerHTML = inlineHtml(b.text);
        }
        return li;
    }

    function normaliseTocMaxLevel(block) {
        var ml = block && parseInt(block.maxLevel, 10);
        return (ml >= 1 && ml <= 3) ? ml : 3;
    }

    function isTocHeadingBlock(b) {
        return !!(b && /^h[1-3]$/.test(b.type) && plainText(b.text).trim());
    }

    function headingAnchorId(block) {
        if (!block || !block.id) {
            return '';
        }
        return 'tsl-h-' + String(block.id).replace(/[^a-zA-Z0-9_-]/g, '');
    }

    function stampBlockMeta(el, block) {
        if (!el || !block || !block.id) {
            return;
        }
        el.setAttribute('data-tsl-block-id', block.id);
        if (block.type) {
            el.setAttribute('data-tsl-block-type', block.type);
        }
        if (/^h[1-3]$/.test(block.type) || block.type === 'title') {
            var aid = headingAnchorId(block);
            if (aid) {
                el.id = aid;
            }
        }
    }

    /** Outline from document headings; respects toc block maxLevel when a toc block is passed. */
    function collectTocEntries(blocks, tocBlock) {
        var through = tocBlock ? normaliseTocMaxLevel(tocBlock) : 3;
        var entries = [];
        var i;
        if (!Array.isArray(blocks)) {
            return entries;
        }
        for (i = 0; i < blocks.length; i += 1) {
            var b = blocks[i];
            if (!isTocHeadingBlock(b)) {
                continue;
            }
            var lvl = parseInt(String(b.type).charAt(1), 10);
            if (lvl > through) {
                continue;
            }
            entries.push({
                id: b.id,
                level: lvl,
                type: b.type,
                text: (headingDisplayPrefix(b) + plainText(b.text).trim()).trim()
            });
        }
        return entries;
    }

    function collectImageIndexEntries(blocks) {
        var entries = [];
        if (!Array.isArray(blocks)) {
            return entries;
        }
        blocks.forEach(function (b) {
            if (b && b.type === 'image' && b.src) {
                entries.push({
                    id: b.id,
                    caption: plainText(b.caption || '') || '',
                    src: b.src
                });
            }
        });
        return entries;
    }

    function indexHeadingPageNumbers(pages) {
        var map = {};
        pages.forEach(function (pg) {
            if (!pg.body || pg.pageNo == null) {
                return;
            }
            Array.prototype.forEach.call(
                pg.body.querySelectorAll('[data-tsl-block-id][data-tsl-block-type]'),
                function (node) {
                    var t = node.getAttribute('data-tsl-block-type') || '';
                    if (!/^h[1-3]$/.test(t) && t !== 'title') {
                        return;
                    }
                    var bid = node.getAttribute('data-tsl-block-id');
                    if (bid) {
                        map[bid] = pg.pageNo;
                    }
                }
            );
        });
        return map;
    }

    function indexImagePageNumbers(pages) {
        var map = {};
        pages.forEach(function (pg) {
            if (!pg.body || pg.pageNo == null) {
                return;
            }
            Array.prototype.forEach.call(
                pg.body.querySelectorAll('[data-tsl-block-id][data-tsl-block-type="image"]'),
                function (node) {
                    var bid = node.getAttribute('data-tsl-block-id');
                    if (bid) {
                        map[bid] = pg.pageNo;
                    }
                }
            );
        });
        return map;
    }

    function replaceIndexNavInPage(pg, selector, navEl) {
        if (!pg.body || !navEl) {
            return;
        }
        var old = pg.body.querySelector(selector);
        if (old && old.parentNode) {
            old.parentNode.replaceChild(navEl, old);
        }
    }

    function refreshIndexBlocksInPages(pages, blocks) {
        if (!pages.length) {
            return;
        }
        var pageByBlockId = indexHeadingPageNumbers(pages);
        var imagePageById = indexImagePageNumbers(pages);
        pages.forEach(function (pg) {
            if (pg.tocBlock) {
                replaceIndexNavInPage(
                    pg,
                    '.tsl-toc, .studio-lean-toc',
                    renderTocNav(pg.tocBlock, blocks, pageByBlockId)
                );
            }
            if (pg.imageIndexBlock) {
                replaceIndexNavInPage(
                    pg,
                    '.tsl-image-index, .studio-lean-image-index',
                    renderImageIndexNav(pg.imageIndexBlock, blocks, imagePageById)
                );
            }
        });
    }

    function collectDocumentOutline(blocks, opts) {
        opts = opts || {};
        var tocBlock = opts.tocBlock || null;
        if (!tocBlock && Array.isArray(blocks)) {
            var i;
            for (i = 0; i < blocks.length; i += 1) {
                if (blocks[i] && blocks[i].type === 'toc') {
                    tocBlock = blocks[i];
                    break;
                }
            }
        }
        return collectTocEntries(blocks, tocBlock);
    }

    function renderTocNav(block, blocks, pageByBlockId) {
        var entries = collectTocEntries(blocks, block);
        var nav = document.createElement('nav');
        nav.className = 'tsl-toc studio-lean-toc';
        nav.setAttribute('aria-label', 'Table of contents');
        if (!entries.length) {
            var empty = document.createElement('p');
            empty.className = 'studio-lean-toc-empty';
            empty.textContent = 'No headings to include.';
            nav.appendChild(empty);
            return nav;
        }
        var leader = block && block.leader != null ? String(block.leader) : '.';
        var ul = document.createElement('ul');
        ul.className = 'studio-lean-toc-list';
        entries.forEach(function (e) {
            var li = document.createElement('li');
            li.className = 'studio-lean-toc-item studio-lean-toc-item--h' + e.level;
            var a = document.createElement('a');
            a.className = 'studio-lean-toc-link';
            a.href = '#' + headingAnchorId({ id: e.id });
            var label = document.createElement('span');
            label.className = 'studio-lean-toc-label';
            label.textContent = e.text;
            a.appendChild(label);
            if (leader !== '') {
                var fill = document.createElement('span');
                fill.className = 'studio-lean-toc-leader';
                fill.setAttribute('aria-hidden', 'true');
                fill.textContent = leader.repeat(40);
                a.appendChild(fill);
            }
            if (pageByBlockId && pageByBlockId[e.id] != null) {
                var pgEl = document.createElement('span');
                pgEl.className = 'studio-lean-toc-page';
                pgEl.textContent = String(pageByBlockId[e.id]);
                a.appendChild(pgEl);
            }
            li.appendChild(a);
            ul.appendChild(li);
        });
        nav.appendChild(ul);
        return nav;
    }

    function renderImageIndexNav(block, blocks, imagePageById) {
        var title = block && block.title ? String(block.title).trim() : 'Image index';
        if (!title) {
            title = 'Image index';
        }
        var leader = block && block.leader != null ? String(block.leader) : '.';
        var entries = collectImageIndexEntries(blocks);
        var section = document.createElement('section');
        section.className = 'tsl-image-index studio-lean-image-index';
        var h = document.createElement('h2');
        h.className = 'studio-lean-image-index-title';
        h.textContent = title;
        section.appendChild(h);
        if (!entries.length) {
            var empty = document.createElement('p');
            empty.className = 'studio-lean-image-index-empty';
            empty.textContent = 'No images in the document yet.';
            section.appendChild(empty);
            return section;
        }
        var list = document.createElement('ol');
        list.className = 'studio-lean-image-index-list';
        entries.forEach(function (e, idx) {
            var li = document.createElement('li');
            li.className = 'studio-lean-image-index-item';
            var label = document.createElement('span');
            label.className = 'studio-lean-image-index-label';
            label.textContent = e.caption || ('Image ' + (idx + 1));
            li.appendChild(label);
            if (leader !== '') {
                var fill = document.createElement('span');
                fill.className = 'studio-lean-image-index-leader';
                fill.setAttribute('aria-hidden', 'true');
                fill.textContent = leader.repeat(40);
                li.appendChild(fill);
            }
            if (imagePageById && e.id && imagePageById[e.id] != null) {
                var pgEl = document.createElement('span');
                pgEl.className = 'studio-lean-image-index-page';
                pgEl.textContent = String(imagePageById[e.id]);
                li.appendChild(pgEl);
            }
            list.appendChild(li);
        });
        section.appendChild(list);
        return section;
    }

    function renderBlock(b, ctx) {
        var type = b.type;
        var el;
        if (type === 'divider') {
            el = document.createElement('hr');
            el.className = 'tsl-block tsl-block--divider';
            return el;
        }
        if (type === 'front-cover') {
            el = document.createElement('figure');
            el.className = 'tsl-block tsl-block--front-cover';
            if (b.src) {
                var coverImg = document.createElement('img');
                coverImg.src = b.src;
                coverImg.alt = '';
                el.appendChild(coverImg);
            }
            return el;
        }
        if (type === 'full-page') {
            el = document.createElement('div');
            el.className = 'tsl-block tsl-block--full-page';
            el.setAttribute('data-halign', b.hAlign || 'center');
            el.setAttribute('data-valign', b.vAlign || 'center');
            var fpInner = document.createElement('div');
            fpInner.className = 'tsl-full-page-inner';
            fpInner.innerHTML = inlineHtml(b.text);
            el.appendChild(fpInner);
            stampBlockMeta(el, b);
            return el;
        }
        if (type === 'toc') {
            el = renderTocNav(b, ctx && ctx.allBlocks ? ctx.allBlocks : [], null);
            stampBlockMeta(el, b);
            return el;
        }
        if (type === 'image-index') {
            el = renderImageIndexNav(b, ctx && ctx.allBlocks ? ctx.allBlocks : [], null);
            stampBlockMeta(el, b);
            return el;
        }
        if (type === 'manuscript-title') {
            el = document.createElement('section');
            el.className = 'tsl-block tsl-block--manuscript-title studio-lean-manuscript-title';
            var mp = document.createElement('div');
            mp.className = 'studio-lean-manuscript-page';
            mp.innerHTML = inlineHtml(b.title || b.text || '');
            el.appendChild(mp);
            stampBlockMeta(el, b);
            return el;
        }
        if (type === 'image') {
            var fig = document.createElement('figure');
            fig.className = 'tsl-block tsl-block--image tsl-figure';
            if (b.src) {
                var img = document.createElement('img');
                img.src = b.src;
                img.alt = b.caption || '';
                if (b.width) {
                    img.style.width = Math.min(100, Math.max(10, b.width)) + '%';
                }
                fig.appendChild(img);
            }
            if (b.caption) {
                var cap = document.createElement('figcaption');
                cap.innerHTML = inlineHtml(b.caption);
                fig.appendChild(cap);
            }
            stampBlockMeta(fig, b);
            return fig;
        }
        if (type === 'paywall') {
            el = document.createElement('aside');
            el.className = 'tsl-block tsl-block--paywall studio-lean-paywall';
            el.setAttribute('role', 'note');
            var pw = document.createElement('p');
            pw.className = 'studio-lean-paywall-message';
            pw.innerHTML = inlineHtml(b.text || '');
            el.appendChild(pw);
            stampBlockMeta(el, b);
            return el;
        }
        if (type === 'code') {
            el = document.createElement('pre');
            el.className = 'tsl-block tsl-block--code';
            el.textContent = plainText(b.text);
            return el;
        }
        if (type === 'table' && Array.isArray(b.cells)) {
            var table = document.createElement('table');
            table.className = 'tsl-block tsl-block--table';
            if (b.header) {
                table.setAttribute('data-tsl-table-header', '1');
            }
            b.cells.forEach(function (row, ri) {
                if (!Array.isArray(row)) {
                    return;
                }
                var tr = document.createElement('tr');
                row.forEach(function (cell) {
                    var cellEl = document.createElement(b.header && ri === 0 ? 'th' : 'td');
                    cellEl.innerHTML = inlineHtml(cell != null ? String(cell) : '');
                    tr.appendChild(cellEl);
                });
                table.appendChild(tr);
            });
            return table;
        }
        if (type === 'aside') {
            el = document.createElement('aside');
            el.className = 'tsl-block tsl-block--aside';
            if (b.icon) {
                var ic = document.createElement('span');
                ic.setAttribute('aria-hidden', 'true');
                ic.textContent = b.icon;
                el.appendChild(ic);
            }
            var inner = document.createElement('div');
            inner.innerHTML = inlineHtml(b.text);
            el.appendChild(inner);
            return el;
        }
        var tag = type === 'title' ? 'h1' : (type === 'paragraph' ? 'p' : type);
        if (!/^(title|paragraph|h1|h2|h3|quote)$/.test(type)) {
            tag = 'div';
        }
        el = document.createElement(tag);
        el.className = 'tsl-block tsl-block--' + type;
        if (type === 'title') {
            el.setAttribute('role', 'doc-title');
        }
        if (b.align && b.align !== 'left') {
            el.setAttribute('data-align', b.align);
        }
        if (type === 'paragraph' && !plainText(b.text)) {
            el.classList.add('tsl-block--no-indent');
        }
        var inner = inlineHtml(b.text);
        if (/^h[1-3]$/.test(type)) {
            var hp = headingDisplayPrefix(b);
            if (hp) {
                el.setAttribute('data-heading-number', headingNumberLabel(b.number));
                var plain = plainText(b.text);
                var prefPlain = hp.trim();
                if (plain.indexOf(prefPlain) !== 0 && plain.indexOf(prefPlain.replace(/\.$/, '')) !== 0) {
                    inner = escapeHtml(hp) + inner;
                }
            }
        }
        el.innerHTML = inner;
        stampBlockMeta(el, b);
        return el;
    }

    function round1(n) {
        return Math.round(n * 10) / 10;
    }

    function round2(n) {
        return Math.round(n * 100) / 100;
    }

    var DC_CAP_HEIGHT = 0.703;

    var NUMHEAD_MODES = { numerals: 'numerals', roman: 'roman' };

    function normalizeNumheadingsMode(mode) {
        var m = String(mode || '').toLowerCase().trim();
        return m === NUMHEAD_MODES.numerals || m === NUMHEAD_MODES.roman ? m : null;
    }

    function headingNumberLabel(raw) {
        var n = String(raw == null ? '' : raw).trim();
        if (!n) {
            return '';
        }
        return n.charAt(n.length - 1) === '.' ? n : n + '.';
    }

    function headingDisplayPrefix(block) {
        if (!block || block.number == null || String(block.number).trim() === '') {
            return '';
        }
        return headingNumberLabel(block.number) + ' ';
    }

    function headingBodyHtml(block, header, readMode) {
        var body = leanInlineHtml(block.text, header, readMode);
        var pref = headingDisplayPrefix(block);
        if (!pref) {
            return body;
        }
        var plain = plainText(block.text);
        var prefPlain = pref.trim();
        if (plain.indexOf(prefPlain) === 0) {
            return body;
        }
        if (plain.indexOf(prefPlain.replace(/\.$/, '')) === 0) {
            return body;
        }
        return escapeHtml(pref) + body;
    }

    function headingNumberAttr(block) {
        if (!block || block.number == null || String(block.number).trim() === '') {
            return '';
        }
        return ' data-heading-number="' + escapeHtml(headingNumberLabel(block.number)) + '"';
    }

    function leanHeadingIdAttr(block) {
        var aid = headingAnchorId(block);
        return aid ? ' id="' + escapeHtml(aid) + '"' : '';
    }

    function leanTocBlockHtml(block, blocks, header, readMode, pageByBlockId) {
        var entries = collectTocEntries(blocks, block);
        if (!entries.length) {
            return '<nav class="studio-lean-toc tsl-toc" aria-label="Table of contents">'
                + '<p class="studio-lean-toc-empty">No headings to include.</p></nav>';
        }
        var leader = block && block.leader != null ? String(block.leader) : '.';
        var html = '<nav class="studio-lean-toc tsl-toc" aria-label="Table of contents"><ul class="studio-lean-toc-list">';
        entries.forEach(function (e) {
            var cls = 'studio-lean-toc-item studio-lean-toc-item--h' + e.level;
            html += '<li class="' + cls + '"><a class="studio-lean-toc-link" href="#'
                + escapeHtml(headingAnchorId({ id: e.id })) + '">';
            html += '<span class="studio-lean-toc-label">' + escapeHtml(e.text) + '</span>';
            if (leader !== '') {
                html += '<span class="studio-lean-toc-leader" aria-hidden="true">'
                    + escapeHtml(leader.repeat(40)) + '</span>';
            }
            if (pageByBlockId && pageByBlockId[e.id] != null) {
                html += '<span class="studio-lean-toc-page">' + escapeHtml(String(pageByBlockId[e.id])) + '</span>';
            }
            html += '</a></li>';
        });
        return html + '</ul></nav>';
    }

    function leanImageIndexBlockHtml(block, blocks, header, readMode, imagePageById) {
        var title = block && block.title ? String(block.title).trim() : 'Image index';
        if (!title) {
            title = 'Image index';
        }
        var leader = block && block.leader != null ? String(block.leader) : '.';
        var entries = collectImageIndexEntries(blocks);
        var html = '<section class="studio-lean-image-index tsl-image-index">'
            + '<h2 class="studio-lean-image-index-title">' + escapeHtml(title) + '</h2>';
        if (!entries.length) {
            return html + '<p class="studio-lean-image-index-empty">No images in the document yet.</p></section>';
        }
        html += '<ol class="studio-lean-image-index-list">';
        entries.forEach(function (e, idx) {
            var label = e.caption || ('Image ' + (idx + 1));
            html += '<li class="studio-lean-image-index-item">';
            html += '<span class="studio-lean-image-index-label">' + escapeHtml(label) + '</span>';
            if (leader !== '') {
                html += '<span class="studio-lean-image-index-leader" aria-hidden="true">'
                    + escapeHtml(leader.repeat(40)) + '</span>';
            }
            if (imagePageById && e.id && imagePageById[e.id] != null) {
                html += '<span class="studio-lean-image-index-page">'
                    + escapeHtml(String(imagePageById[e.id])) + '</span>';
            }
            html += '</li>';
        });
        return html + '</ol></section>';
    }

    function toRoman(n) {
        n = Math.floor(Number(n) || 0);
        if (n < 1) {
            return '0';
        }
        if (n > 3999) {
            return String(n);
        }
        var map = [
            ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90],
            ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]
        ];
        var out = '';
        var i;
        for (i = 0; i < map.length; i += 1) {
            while (n >= map[i][1]) {
                out += map[i][0];
                n -= map[i][1];
            }
        }
        return out;
    }

    function formatOutlineNumber(counters, level, mode) {
        var parts = [];
        var L;
        for (L = 1; L <= level; L += 1) {
            var v = counters[L - 1];
            if (L === 1 && v === 0 && level > 1) {
                v = 1;
            }
            if (mode === NUMHEAD_MODES.roman && L === 1) {
                parts.push(toRoman(v));
            } else {
                parts.push(String(v));
            }
        }
        return parts.join('.');
    }

    function ensureHeadingNumbers(blocks, header) {
        if (!Array.isArray(blocks)) {
            return;
        }
        var mode = normalizeNumheadingsMode(header && header.numheadings);
        if (!mode) {
            return;
        }
        var counters = [0, 0, 0];
        blocks.forEach(function (b) {
            if (!b) {
                return;
            }
            var m = /^h([1-3])$/.exec(b.type || '');
            if (!m) {
                return;
            }
            if (!plainText(b.text)) {
                if (b.number != null) {
                    delete b.number;
                }
                return;
            }
            if (b.number != null && String(b.number).trim() !== '') {
                return;
            }
            var level = parseInt(m[1], 10);
            counters[level - 1] += 1;
            for (var j = level; j < 3; j += 1) {
                counters[j] = 0;
            }
            b.number = formatOutlineNumber(counters, level, mode);
        });
    }

    var DC_TEXT_INSET = 0.04;
    var DC_OPTICAL_HANG = 0.065;
    var DROP_CAP_GLYPHS = {
        horticulture: {
            W: '<svg class="be-dc-glyph-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 88" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 82V14c0-2 1-3 3-3h4l18 42 18-42h4c2 0 3 1 3 3v68h-8V38L32 82h-8L16 38v44H8zm28-58c-6 0-10 4-10 10v4c0 6 4 10 10 10s10-4 10-10v-4c0-6-4-10-10-10zm0 6c2 0 4 2 4 4v4c0 2-2 4-4 4s-4-2-4-4v-4c0-2 2-4 4-4z"/><path fill="currentColor" opacity="0.85" d="M2 76c4-8 10-12 18-12 6 0 11 3 14 8l-3 4c-2-3-5-5-9-5-5 0-9 3-12 9l-8-4z"/></svg>'
        },
        gothic: {
            W: '<svg class="be-dc-glyph-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 92V4h10l14 52V4h8v88h-10L12 36v56H4zm22 0V28l-8-24h9l7 22 7-22h9l-8 24v64h-8zm18 0V4h10l8 34 8-34h10v88h-8V32l-10 38h-6l-10-38v60h-8z"/></svg>'
        }
    };

    function parseDropCapComment(raw) {
        if (raw == null || raw === '') {
            return null;
        }
        if (typeof raw === 'object') {
            return normalizeDropCap(raw);
        }
        try {
            return normalizeDropCap(JSON.parse(String(raw)));
        } catch (e1) {
            var n = parseInt(raw, 10);
            if (n >= 1 && n <= 3) {
                return normalizeDropCap(n);
            }
        }
        return null;
    }

    function normalizeDropCap(raw) {
        if (raw == null || raw === false || raw === 0 || raw === '0') {
            return null;
        }
        if (typeof raw === 'number') {
            return { lines: Math.max(1, Math.min(3, raw | 0)), style: 'normal', characters: 1,
                includeLeadingPunctuation: true, spacingEm: 0.08, opticalMargin: true,
                alignBaseline: true, uppercase: false, variant: 'default' };
        }
        var o = raw && typeof raw === 'object' ? raw : {};
        var capStyle = o.capStyle == null || o.capStyle === '' || o.capStyle === 'letter' || o.capStyle === 'none'
            ? null : String(o.capStyle).toLowerCase();
        if (capStyle && capStyle !== 'horticulture' && capStyle !== 'gothic') {
            capStyle = null;
        }
        return {
            lines: Math.max(1, Math.min(3, parseInt(o.lines, 10) || 2)),
            style: o.style === 'small-caps' ? 'small-caps' : 'normal',
            characters: Math.max(1, Math.min(8, parseInt(o.characters, 10) || 1)),
            includeLeadingPunctuation: o.includeLeadingPunctuation !== false,
            spacingEm: Math.max(0, Math.min(0.5, Number(o.spacingEm) || 0.08)),
            opticalMargin: o.opticalMargin !== false,
            alignBaseline: o.alignBaseline !== false,
            uppercase: !!o.uppercase,
            variant: o.variant === 'chapter' || o.variant === 'emphasis' ? o.variant : 'default',
            capStyle: capStyle
        };
    }

    function dcFloatMetrics(spec, lineHeight) {
        var lh = Math.max(1, Math.min(3, Number(lineHeight) || 1.55));
        var lines = spec.lines;
        var capFontSizeEm = (lines * lh) / DC_CAP_HEIGHT;
        var marginRightEm = spec.spacingEm;
        var marginLeftEm = (spec.opticalMargin ? -(DC_OPTICAL_HANG * capFontSizeEm) : 0) + DC_TEXT_INSET;
        return {
            capFontSizeEm: capFontSizeEm,
            marginRightEm: marginRightEm,
            marginLeftEm: Math.max(0, marginLeftEm),
            marginTopEm: 0,
            lines: lines
        };
    }

    function dcInlineStyle(metrics) {
        return '--ts-dc-cap-size:' + metrics.capFontSizeEm.toFixed(5) + 'em;'
            + '--ts-dc-margin-right:' + metrics.marginRightEm.toFixed(5) + 'em;'
            + '--ts-dc-margin-left:' + metrics.marginLeftEm.toFixed(5) + 'em;'
            + '--ts-dc-margin-top:' + metrics.marginTopEm.toFixed(5) + 'em;'
            + '--ts-dc-lines:' + metrics.lines + ';'
            + '--ts-dc-cap-height-ratio:' + DC_CAP_HEIGHT + ';';
    }

    function lookupDropCapGlyph(capStyle, letter) {
        if (!capStyle || !letter) {
            return null;
        }
        var style = DROP_CAP_GLYPHS[capStyle];
        if (!style) {
            return null;
        }
        var key = String(letter).charAt(0).toUpperCase();
        return style[key] || null;
    }

    function splitDropCapPlain(plain, spec) {
        var text = String(plain || '');
        if (!text.trim()) {
            return { cap: '', rest: text };
        }
        var work = text;
        var prefix = '';
        if (spec.includeLeadingPunctuation) {
            var m = work.match(/^[\s"'“‘«(\[{]+/);
            if (m) {
                prefix = m[0];
                work = work.slice(prefix.length);
            }
        }
        var graphemes = Array.from(work);
        var n = Math.max(1, Math.min(8, spec.characters | 0));
        var cap = prefix + graphemes.slice(0, n).join('');
        var rest = graphemes.slice(n).join('');
        if (spec.uppercase) {
            cap = cap.toLocaleUpperCase();
        }
        return { cap: cap, rest: rest };
    }

    function buildDropCapLeanInner(restInlineHtml, plain, block, header) {
        var spec = normalizeDropCap(block.dropCap);
        if (spec === null || !plainText(plain)) {
            return null;
        }
        if (/class="[^"]*(?:dropcap|studio-dropcap)/i.test(String(block.text || ''))) {
            return null;
        }
        var parts = splitDropCapPlain(plain, spec);
        if (!parts.cap) {
            return null;
        }
        var lh = (header && header.typography && header.typography.lineHeight) || 1.55;
        var metrics = dcFloatMetrics(spec, lh);
        var style = dcInlineStyle(metrics);
        var capClass = 'dropcap studio-dropcap studio-dc-variant-' + spec.variant;
        if (spec.style === 'small-caps') {
            capClass += ' be-dc-small-caps';
        }
        var glyph = lookupDropCapGlyph(spec.capStyle, parts.cap);
        var capHtml;
        if (glyph) {
            capClass += ' be-dc-glyph-cap be-dc-cap-style-' + spec.capStyle;
            capHtml = '<span class="' + capClass + '" style="' + style
                + 'float:left;line-height:1;color:inherit;width:var(--ts-dc-cap-size);" aria-hidden="true">'
                + glyph + '</span>';
        } else {
            capHtml = '<span class="' + capClass + '" style="' + style
                + 'float:left;line-height:1;color:inherit;font-size:var(--ts-dc-cap-size);" aria-hidden="true">'
                + escapeHtml(parts.cap) + '</span>';
        }
        var restHtml = restInlineHtml;
        if (!/<[a-z][\s\S]*>/i.test(String(block.text || ''))) {
            restHtml = leanInlineHtml(parts.rest, header, header.readMode !== false);
        }
        return capHtml + '<span class="studio-dropcap-rest">' + restHtml + '</span>';
    }

    function leanAlignStyle(block) {
        var align = String(block.align || 'left').toLowerCase();
        if (['left', 'center', 'right', 'justify'].indexOf(align) < 0) {
            align = 'left';
        }
        return 'text-align:' + align + ';';
    }

    function leanFieldCtx(header) {
        return {
            pageNo: null,
            pageCount: 1,
            side: 'any',
            values: mergeFieldValues(header),
            runningHeader: ''
        };
    }

    function leanInlineHtml(text, header, readMode) {
        var raw = String(text || '');
        if (!readMode) {
            return inlineHtml(raw);
        }
        return inlineHtml(resolveFields(raw, leanFieldCtx(header)));
    }

    function leanBlockHtml(block, header, readMode) {
        var type = block.type || 'paragraph';
        var style = leanAlignStyle(block);
        if (type === 'title') {
            var t = leanInlineHtml(block.text, header, readMode);
            if (!plainText(t)) {
                return '';
            }
            return '<h1 class="studio-lean-title"' + leanHeadingIdAttr(block) + ' style="' + style + '">' + t + '</h1>';
        }
        if (type === 'h1' || type === 'h2' || type === 'h3') {
            if (!plainText(block.text)) {
                return '';
            }
            return '<' + type + leanHeadingIdAttr(block) + headingNumberAttr(block) + ' style="' + style + '">'
                + headingBodyHtml(block, header, readMode) + '</' + type + '>';
        }
        if (type === 'paragraph') {
            var plain = plainText(block.text);
            var pBody = buildDropCapLeanInner(
                leanInlineHtml(block.text, header, readMode),
                plain,
                block,
                header
            );
            if (!pBody) {
                pBody = leanInlineHtml(block.text, header, readMode);
            }
            if (!plainText(pBody)) {
                return '<p class="studio-lean-empty" style="' + style + '">&nbsp;</p>';
            }
            var pClass = block.dropCap ? ' class="studio-has-dropcap"' : '';
            if (/class="[^"]*(?:dropcap|studio-dropcap)/i.test(String(block.text || ''))) {
                pClass = ' class="studio-has-dropcap"';
            }
            return '<p' + pClass + ' style="' + style + '">' + pBody + '</p>';
        }
        if (type === 'quote') {
            return '<blockquote style="' + style + '">' + leanInlineHtml(block.text, header, readMode) + '</blockquote>';
        }
        if (type === 'bullet') {
            return '<ul><li>' + leanInlineHtml(block.text, header, readMode) + '</li></ul>';
        }
        if (type === 'todo') {
            var done = !!block.checked;
            return '<p class="studio-lean-todo' + (done ? ' is-done' : '') + '" style="' + style + '">'
                + '<input type="checkbox" disabled' + (done ? ' checked' : '') + '> '
                + leanInlineHtml(block.text, header, readMode) + '</p>';
        }
        if (type === 'code') {
            return '<pre class="studio-lean-code"><code>' + escapeHtml(plainText(block.text)) + '</code></pre>';
        }
        if (type === 'table' && Array.isArray(block.cells)) {
            var rows = block.cells;
            var tbl = '<table class="studio-lean-table">';
            rows.forEach(function (row, ri) {
                if (!Array.isArray(row)) {
                    return;
                }
                tbl += '<tr>';
                row.forEach(function (cell) {
                    var tag = block.header && ri === 0 ? 'th' : 'td';
                    tbl += '<' + tag + '>' + leanInlineHtml(String(cell != null ? cell : ''), header, readMode) + '</' + tag + '>';
                });
                tbl += '</tr>';
            });
            return tbl + '</table>';
        }
        if (type === 'aside') {
            var icon = String(block.icon || '💡').trim();
            var iconH = icon ? '<span class="studio-lean-aside-icon" aria-hidden="true">' + escapeHtml(icon) + '</span> ' : '';
            return '<aside class="studio-lean-aside" style="' + style + '">' + iconH
                + leanInlineHtml(block.text, header, readMode) + '</aside>';
        }
        if (type === 'divider') {
            return '<hr class="studio-lean-divider">';
        }
        if (type === 'image' && block.src) {
            var w = block.width ? ' style="width:' + Math.min(100, Math.max(10, block.width)) + '%;"' : '';
            var fig = '<figure class="studio-lean-figure"><img src="' + escapeHtml(block.src) + '" alt=""' + w + '>';
            if (block.caption) {
                fig += '<figcaption>' + leanInlineHtml(block.caption, header, readMode) + '</figcaption>';
            }
            return fig + '</figure>';
        }
        if (type === 'front-cover') {
            if (!block.src) {
                return '';
            }
            return '<figure class="studio-lean-front-cover"><img src="' + escapeHtml(block.src) + '" alt=""></figure>';
        }
        if (type === 'full-page') {
            return '<div class="studio-lean-full-page" data-halign="' + escapeHtml(block.hAlign || 'center') + '" data-valign="' + escapeHtml(block.vAlign || 'center') + '"><div class="studio-lean-full-page-inner">' + leanInlineHtml(block.text, header, readMode) + '</div></div>';
        }
        if (type === 'manuscript-title') {
            return '<section class="studio-lean-manuscript-title"><div class="studio-lean-manuscript-page">'
                + leanInlineHtml(block.title || '[Title]', header, readMode) + '</div></section>';
        }
        if (type === 'toc') {
            return leanTocBlockHtml(block, header._leanAllBlocks || [], header, readMode, null);
        }
        if (type === 'image-index') {
            return leanImageIndexBlockHtml(block, header._leanAllBlocks || [], header, readMode, null);
        }
        if (type === 'paywall') {
            return '<aside class="studio-lean-paywall" role="note"><p class="studio-lean-paywall-message">'
                + leanInlineHtml(block.text || '', header, readMode) + '</p></aside>';
        }
        return '';
    }

    function utf8ToB64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function b64ToUtf8(b64) {
        return decodeURIComponent(escape(atob(b64)));
    }

    function leanBlockCommentOpen(block) {
        var type = block.type || 'paragraph';
        var parts = ['type=' + type];
        if (block.id) {
            parts.push('id=' + block.id);
        }
        if (block.cols && block.cols !== 2) {
            parts.push('cols=' + block.cols);
        }
        if (block.align && block.align !== 'left') {
            parts.push('align=' + block.align);
        }
        return '<!-- studio:block-start ' + parts.join(' ') + ' -->\n';
    }

    function addLeanBlockDataAttrs(innerHtml, block) {
        var id = block.id ? ' data-block-id="' + escapeHtml(block.id) + '"' : '';
        var type = block.type ? ' data-block-type="' + escapeHtml(block.type) + '"' : '';
        if (!id && !type) {
            return innerHtml;
        }
        return innerHtml.replace(/^<(\w+)(\s|>)/, '<$1' + id + type + '$2');
    }

    function wrapLeanRoundTrip(block, innerHtml) {
        innerHtml = addLeanBlockDataAttrs(innerHtml, block);
        return leanBlockCommentOpen(block) + innerHtml + '<!-- studio:block-end -->';
    }

    function tslSettingsComment(header) {
        return '<!-- studio:tsl-settings encoding="b64" '
            + utf8ToB64(JSON.stringify({ version: 1, header: header }))
            + ' -->\n';
    }

    function headerB64Attr(header) {
        var json = JSON.stringify(header);
        if (json.length > 380000) {
            return {};
        }
        return { 'data-tsl-header-b64': utf8ToB64(json) };
    }

    function blocksToLeanHtml(blocks, header, readMode, roundTrip) {
        var html = '';
        var i = 0;
        header = Object.assign({}, header, { _leanAllBlocks: blocks });
        while (i < blocks.length) {
            var block = blocks[i];
            if (!block || typeof block !== 'object') {
                i += 1;
                continue;
            }
            var type = block.type || 'paragraph';
            if (type === 'newpage') {
                var br = '<div class="studio-lean-pagebreak" role="presentation"></div>';
                html += roundTrip ? wrapLeanRoundTrip(block, br) : br;
                i += 1;
                continue;
            }
            if (type === 'pageheader' || type === 'pagefooter' || type === 'document') {
                i += 1;
                continue;
            }
            if (type === 'front-cover' || type === 'full-page' || type === 'manuscript-title'
                || type === 'image-index' || type === 'paywall' || type === 'toc') {
                var solo = leanBlockHtml(block, header, readMode);
                if (solo) {
                    html += roundTrip ? wrapLeanRoundTrip(block, solo) : solo;
                }
                i += 1;
                continue;
            }

            function emitLeanPieces(rowBlocks) {
                var inner = '';
                rowBlocks.forEach(function (rb) {
                    var piece = leanBlockHtml(rb, header, readMode);
                    if (!piece) {
                        return;
                    }
                    if (roundTrip) {
                        piece = wrapLeanRoundTrip(rb, piece);
                    }
                    inner += leanColWrap(piece);
                });
                if (!inner) {
                    return;
                }
                html += leanRowWrap(inner, rowBlocks.length > 1);
            }

            if (blockLayoutCols(block) === 1) {
                var run = [block];
                i += 1;
                while (i < blocks.length && blockLayoutCols(blocks[i]) === 1 && !breaksColRun(blocks[i])) {
                    run.push(blocks[i]);
                    i += 1;
                }
                var lk = 0;
                while (lk < run.length) {
                    emitLeanPieces(run.slice(lk, lk + 2));
                    lk += 2;
                }
                continue;
            }

            emitLeanPieces([block]);
            i += 1;
        }
        return html;
    }

    function articleAttrsFromHeader(header) {
        var page = header.page || {};
        var trim = page.trimMM || { width: 210, height: 297 };
        var margins = page.marginsMM || { top: 12, bottom: 12, outside: 15 };
        var ty = header.typography || {};
        var attrs = {
            'data-tsl-kind': page.kind === 'web' ? 'web' : 'print',
            'data-tsl-w-mm': String(round1(trim.width || 210)),
            'data-tsl-h-mm': String(round1(trim.height || 297)),
            'data-tsl-pad-t-mm': String(round1(margins.top || 12)),
            'data-tsl-pad-b-mm': String(round1(margins.bottom || 12)),
            'data-tsl-pad-o-mm': String(round1(margins.outside || 15)),
            'data-tsl-size-pt': String(round1(ty.sizePt || 11)),
            'data-tsl-lh': String(round2(ty.lineHeight || 1.55))
        };
        if (ty.hyphenation !== false) {
            attrs['data-tsl-hyphenate'] = '1';
        }
        return attrs;
    }

    function applyTslLayoutVarsToArticle(article) {
        if (!article) {
            return;
        }
        var mm = function (name) { return article.getAttribute(name); };
        if (!mm('data-tsl-w-mm')) {
            return;
        }
        article.style.setProperty('--tsl-page-w', mm('data-tsl-w-mm') + 'mm');
        article.style.setProperty('--tsl-page-h', mm('data-tsl-h-mm') + 'mm');
        article.style.setProperty('--tsl-pad-t', (mm('data-tsl-pad-t-mm') || '12') + 'mm');
        article.style.setProperty('--tsl-pad-b', (mm('data-tsl-pad-b-mm') || '12') + 'mm');
        article.style.setProperty('--tsl-pad-o', (mm('data-tsl-pad-o-mm') || '15') + 'mm');
        if (mm('data-tsl-size-pt')) {
            article.style.setProperty('--tsl-size-base', mm('data-tsl-size-pt') + 'pt');
            article.style.setProperty('--tsl-size-pt', mm('data-tsl-size-pt') + 'pt');
        }
        if (mm('data-tsl-lh')) {
            article.style.setProperty('--tsl-lh', mm('data-tsl-lh'));
        }
    }

    function applyLeanReadingPrefs(article) {
        if (!article) {
            return;
        }
        var p = getReadingPrefs();
        var readerArticle = article.closest('[data-reader-article]');
        var layout = getTslLayout();
        if (readerArticle) {
            var owned = readerArticle.getAttribute('data-tsl-layout');
            layout = owned === 'scroll' || owned === 'pages' ? owned : null;
        }
        article.setAttribute('data-tsl-reader-font', p.font || 'serif');
        article.setAttribute('data-tsl-reader-size', String(p.size || 18));
        article.setAttribute('data-tsl-reader-theme', p.theme || 'light');
        article.setAttribute('data-tsl-reader-width', p.width || 'medium');
        article.style.setProperty('--tsl-reader-scale', String(readerSizeScale(p.size)));
        if (layout !== null) {
            article.setAttribute('data-tsl-layout', layout);
        }
        var shell = article.closest('.document-tsl');
        if (shell) {
            if (layout !== null) {
                shell.setAttribute('data-tsl-layout', layout);
            }
            shell.setAttribute('data-tsl-reader-width', p.width || 'medium');
            shell.setAttribute('data-tsl-reader-theme', p.theme || 'light');
        }
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toLeanHtml(parsed) {
        var header = parsed.header;
        var blocks = parsed.blocks;
        ensureHeadingNumbers(blocks, header);
        var readMode = header.readMode !== false;
        var attrs = articleAttrsFromHeader(header);
        Object.assign(attrs, headerB64Attr(header));
        return {
            bodyHtml: tslSettingsComment(header) + blocksToLeanHtml(blocks, header, readMode, true),
            attrs: attrs
        };
    }

    function headerFromArticleAttrs(article) {
        if (!article) {
            return resolveHeader({});
        }
        var b64 = article.getAttribute('data-tsl-header-b64');
        if (b64) {
            try {
                var h = JSON.parse(b64ToUtf8(b64));
                if (h && h.page && h.typography) {
                    return h;
                }
            } catch (e) { /* fall through */ }
        }
        var kind = article.getAttribute('data-tsl-kind') === 'web' ? 'web' : 'print';
        var page = {
            formatId: kind === 'web' ? 'web' : 'us-business',
            kind: kind,
            trimMM: {
                width: parseFloat(article.getAttribute('data-tsl-w-mm')) || 210,
                height: parseFloat(article.getAttribute('data-tsl-h-mm')) || 297
            },
            marginsMM: {
                top: parseFloat(article.getAttribute('data-tsl-pad-t-mm')) || 12,
                bottom: parseFloat(article.getAttribute('data-tsl-pad-b-mm')) || 12,
                outside: parseFloat(article.getAttribute('data-tsl-pad-o-mm')) || 15,
                gutter: 15
            },
            usePrintGutters: true
        };
        var ty = {
            fontId: 'book-serif',
            fontFamily: FONTS['book-serif'],
            sizePt: parseFloat(article.getAttribute('data-tsl-size-pt')) || 11,
            lineHeight: parseFloat(article.getAttribute('data-tsl-lh')) || 1.55,
            paragraphAlign: 'left',
            paragraphIndentIn: 0,
            paragraphSpacingPt: 0,
            hyphenation: article.getAttribute('data-tsl-hyphenate') === '1'
        };
        return {
            page: page,
            typography: ty,
            numbering: { startPage: 1, pageOffsetStart: 0, firstPhysicalPageSide: 'left' },
            theme: 'default',
            metadata: { fields: [] },
            readMode: true,
            mergeFields: { version: 0.1, fields: [], values: {} }
        };
    }

    function parseLeanBlockCommentAttrs(attrString) {
        var meta = { type: '', id: '', cols: 2, align: 'left' };
        String(attrString).replace(/(\w+)=("([^"]*)"|(\S+))/g, function (_, key, q, bare) {
            var val = q !== undefined ? q : bare;
            if (key === 'type') {
                meta.type = val;
            } else if (key === 'id') {
                meta.id = val;
            } else if (key === 'cols') {
                meta.cols = parseInt(val, 10) || 2;
            } else if (key === 'align') {
                meta.align = val;
            } else if (key === 'dropCap') {
                meta.dropCap = val;
            } else if (key === 'number') {
                meta.number = val;
            }
            return '';
        });
        return meta;
    }

    function leanRegionToBlock(meta, innerHtml) {
        var type = meta.type || 'paragraph';
        if (type === 'newpage') {
            return { id: meta.id || 'b1', type: 'newpage', align: 'left', theme: null, cols: 2 };
        }
        innerHtml = String(innerHtml || '').trim();
        if (!innerHtml) {
            return null;
        }
        var block = {
            id: meta.id || ('b' + Math.random().toString(36).slice(2, 8)),
            type: type,
            align: meta.align || 'left',
            theme: null,
            cols: meta.cols || 2,
            text: innerHtml
        };
        if (type === 'code') {
            block.text = plainText(innerHtml);
        }
        if (type === 'todo') {
            block.checked = /checked/i.test(innerHtml);
        }
        if (type === 'front-cover') {
            var srcMatch = innerHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
            block.src = srcMatch ? srcMatch[1] : '';
            block.expanded = block.expanded !== false;
        }
        if (type === 'full-page') {
            block.text = innerHtml;
            block.hAlign = 'center';
            block.vAlign = 'center';
        }
        if (meta.dropCap) {
            block.dropCap = parseDropCapComment(meta.dropCap);
        }
        if (meta.number) {
            block.number = String(meta.number).replace(/\.$/, '');
        }
        return block;
    }

    function leanHtmlToEnvelope(html) {
        var src = String(html || '');
        var header = null;
        var m = src.match(/<!--\s*studio:tsl-settings\s+encoding="b64"\s+([A-Za-z0-9+\/=]+)\s*-->/);
        if (m) {
            try {
                var pack = JSON.parse(b64ToUtf8(m[1]));
                if (pack && pack.header) {
                    header = pack.header;
                }
            } catch (e) { /* ignore */ }
        }
        var doc = new DOMParser().parseFromString(src, 'text/html');
        var article = doc.querySelector('article.studio-lean-article, article.studio-lean-tsl');
        if (!article) {
            article = doc.createElement('article');
            article.className = 'studio-lean-article studio-lean-tsl';
            article.innerHTML = src;
        }
        if (!header) {
            header = headerFromArticleAttrs(article);
        }
        var inner = article.innerHTML;
        var blocks = [];
        var re = /<!--\s*studio:block-start\s+([^>]*?)-->([\s\S]*?)<!--\s*studio:block-end\s*-->/g;
        var match;
        while ((match = re.exec(inner)) !== null) {
            var b = leanRegionToBlock(parseLeanBlockCommentAttrs(match[1]), match[2]);
            if (b) {
                blocks.push(b);
            }
        }
        if (!blocks.length) {
            var kids = article.children;
            for (var ki = 0; ki < kids.length; ki++) {
                var el = kids[ki];
                if (el.nodeType !== 1) {
                    continue;
                }
                var type = el.getAttribute('data-block-type');
                var cls = ' ' + el.className + ' ';
                if (!type && cls.indexOf(' studio-lean-pagebreak ') >= 0) {
                    type = 'newpage';
                } else if (!type && el.tagName === 'H1' && cls.indexOf(' studio-lean-title ') >= 0) {
                    type = 'title';
                } else if (!type && /^H[1-3]$/.test(el.tagName)) {
                    type = el.tagName.toLowerCase();
                } else if (!type && el.tagName === 'BLOCKQUOTE') {
                    type = 'quote';
                } else if (!type && el.tagName === 'PRE') {
                    type = 'code';
                } else if (!type && el.tagName === 'HR') {
                    type = 'divider';
                } else if (!type && el.tagName === 'ASIDE') {
                    type = 'aside';
                } else if (!type && cls.indexOf(' studio-lean-front-cover ') >= 0) {
                    type = 'front-cover';
                } else if (!type && cls.indexOf(' studio-lean-full-page ') >= 0) {
                    type = 'full-page';
                } else if (!type && cls.indexOf(' studio-lean-manuscript-title ') >= 0) {
                    type = 'manuscript-title';
                } else if (!type) {
                    type = 'paragraph';
                }
                var meta = {
                    type: type,
                    id: el.getAttribute('data-block-id') || '',
                    align: 'left',
                    cols: 2
                };
                var piece = type === 'code' ? plainText(el.textContent) : el.innerHTML;
                var blk = leanRegionToBlock(meta, piece);
                if (blk) {
                    var hn = el.getAttribute('data-heading-number');
                    if (hn) {
                        blk.number = String(hn).replace(/\.$/, '');
                    }
                    blocks.push(blk);
                }
            }
        }
        return {
            format: 'talesmith-lang',
            version: 0.1,
            header: header,
            document: { blocks: blocks }
        };
    }

    function envelopeToText(envelope) {
        return JSON.stringify(envelope, null, 2) + '\n';
    }

    function mountLeanHtml(mount, parsed) {
        var lean = toLeanHtml(parsed);
        mount.innerHTML = '';
        var shell = document.createElement('div');
        shell.className = 'document-tsl post-lean-html';
        shell.setAttribute('data-tsl-lean-wrap', '1');
        var wrap = document.createElement('div');
        wrap.className = 'post-lean-html-article-wrap';
        var article = document.createElement('article');
        article.className = 'studio-lean-article studio-lean-tsl';
        Object.keys(lean.attrs).forEach(function (key) {
            article.setAttribute(key, lean.attrs[key]);
        });
        article.innerHTML = lean.bodyHtml;
        applyTslLayoutVarsToArticle(article);
        applyLeanReadingPrefs(article);
        wrap.appendChild(article);
        shell.appendChild(wrap);
        mount.appendChild(shell);
        bindInDocumentAnchorClicks(article);
        return article;
    }

    function loadUrl(url, mount, mode) {
        return fetch(url).then(function (res) {
            if (!res.ok) {
                throw new Error('Could not load ' + url);
            }
            return res.text();
        }).then(function (text) {
            var parsed = parse(text);
            if (mode === 'lean') {
                return mountLeanHtml(mount, parsed);
            }
            return render(mount, parsed);
        });
    }

    function loadText(text, mount, mode) {
        var parsed = parse(text);
        if (mode === 'lean') {
            return mountLeanHtml(mount, parsed);
        }
        return render(mount, parsed);
    }

    function display(mount, parsed, mode) {
        if (mount) {
            mount._tslParsed = parsed;
        }
        if (mode === 'lean') {
            return mountLeanHtml(mount, parsed);
        }
        return render(mount, parsed);
    }

    function findTslLeanArticle(root) {
        if (!root || !root.querySelector) {
            return null;
        }
        return root.querySelector('.studio-lean-tsl')
            || root.querySelector('article.studio-lean-article[data-tsl-w-mm]')
            || root.querySelector('[data-tsl-w-mm]');
    }

    function leanSupportsPagination(article, wrapHtml) {
        if (!article) {
            return false;
        }
        if (article.getAttribute('data-tsl-header-b64')) {
            return true;
        }
        if (article.getAttribute('data-tsl-w-mm') && article.getAttribute('data-tsl-h-mm')) {
            return true;
        }
        return !!(wrapHtml && /studio:tsl-settings\s+encoding="b64"/.test(wrapHtml));
    }

    function mountReaderEnvelope(host, jsonText) {
        if (!host || !jsonText) {
            return null;
        }
        var readerArticle = host.matches && host.matches('[data-reader-article]')
            ? host : host.querySelector('[data-reader-article]');
        if (!readerArticle) {
            readerArticle = host;
        }
        var shell = readerArticle.querySelector('.document-tsl');
        if (!shell) {
            shell = document.createElement('div');
            shell.className = 'document-tsl post-lean-html';
            var wrap0 = document.createElement('div');
            wrap0.className = 'post-lean-html-article-wrap';
            shell.appendChild(wrap0);
            readerArticle.appendChild(shell);
        }
        var wrap = shell.querySelector('.post-lean-html-article-wrap') || shell;
        var parsed;
        try {
            parsed = parse(String(jsonText));
        } catch (e) {
            return null;
        }
        var layout = readerArticle.getAttribute('data-tsl-layout');
        if (layout !== 'scroll' && layout !== 'pages') {
            layout = getTslLayout();
        }
        if (layout === 'scroll') {
            wrap.classList.remove('tsl-reader-player-mount');
            wrap.removeAttribute('data-tsl-mount');
            mountLeanHtml(wrap, parsed);
            applyTslLayoutVarsToArticle(findTslLeanArticle(wrap));
            applyLeanReadingPrefs(findTslLeanArticle(wrap));
            readerArticle._tslPlayer = { mode: 'scroll' };
            return readerArticle._tslPlayer;
        }
        wrap.innerHTML = '';
        wrap.classList.add('tsl-reader-player-mount');
        wrap.setAttribute('data-tsl-mount', 'reader');
        var root = render(wrap, parsed);
        var player = {
            mode: 'pages',
            root: root,
            step: function (delta) {
                if (typeof root._tslPagerStep === 'function') {
                    root._tslPagerStep(delta);
                }
            },
            refresh: function () {
                if (typeof root._tslPagerRefresh === 'function') {
                    root._tslPagerRefresh();
                }
            },
            goToIndex: function (idx) {
                if (typeof root._tslPagerGoToIndex === 'function') {
                    return root._tslPagerGoToIndex(idx);
                }
                return false;
            },
            progress: function () {
                if (typeof root._tslPagerInfo !== 'function') {
                    return { index: 0, total: 0, view: '', frac: 0 };
                }
                var info = root._tslPagerInfo();
                var frac = info.total > 1 ? info.index / (info.total - 1) : (info.total ? 1 : 0);
                return {
                    index: info.index,
                    total: info.total,
                    view: info.view,
                    frac: frac
                };
            }
        };
        readerArticle._tslPlayer = player;
        return player;
    }

    function enhancePublishedLean(host) {
        if (!host) {
            return null;
        }
        var readerArticle = host.matches && host.matches('[data-reader-article]')
            ? host : host.querySelector('[data-reader-article]');
        if (!readerArticle) {
            readerArticle = host;
        }
        var existing = readerArticle._tslPlayer;
        if (existing && existing.mode === 'pages' && existing.root && existing.root.isConnected) {
            return existing;
        }
        var shell = readerArticle.querySelector('.document-tsl');
        if (!shell) {
            var leanOnly = findTslLeanArticle(readerArticle);
            if (!leanOnly) {
                return null;
            }
            applyTslLayoutVarsToArticle(leanOnly);
            applyLeanReadingPrefs(leanOnly);
            bindInDocumentAnchorClicks(leanOnly);
            return { mode: 'scroll' };
        }
        var wrap = shell.querySelector('.post-lean-html-article-wrap') || shell;
        var leanArticle = findTslLeanArticle(wrap);
        if (leanArticle && !readerArticle._tslLeanBackup) {
            readerArticle._tslLeanBackup = wrap.innerHTML;
        }
        var layout = readerArticle.getAttribute('data-tsl-layout');
        if (layout !== 'scroll' && layout !== 'pages') {
            layout = getTslLayout();
        }
        if (layout === 'scroll') {
            if (readerArticle._tslLeanBackup && !findTslLeanArticle(wrap)) {
                wrap.innerHTML = readerArticle._tslLeanBackup;
                leanArticle = findTslLeanArticle(wrap);
            }
            applyTslLayoutVarsToArticle(leanArticle);
            applyLeanReadingPrefs(leanArticle);
            bindInDocumentAnchorClicks(leanArticle);
            readerArticle._tslPlayer = null;
            return { mode: 'scroll' };
        }
        if (readerArticle._tslLeanBackup && !findTslLeanArticle(wrap)) {
            wrap.innerHTML = readerArticle._tslLeanBackup;
            leanArticle = findTslLeanArticle(wrap);
        }
        if (!leanArticle || !leanSupportsPagination(leanArticle, wrap.innerHTML)) {
            applyTslLayoutVarsToArticle(leanArticle);
            applyLeanReadingPrefs(leanArticle);
            return { mode: 'scroll' };
        }
        var envelope = leanHtmlToEnvelope('<div class="document-tsl post-lean-html">' + wrap.innerHTML + '</div>');
        var parsed = { header: envelope.header, blocks: envelope.document.blocks };
        wrap.innerHTML = '';
        wrap.classList.add('tsl-reader-player-mount');
        wrap.setAttribute('data-tsl-mount', 'reader');
        var root = render(wrap, parsed);
        var player = {
            mode: 'pages',
            root: root,
            step: function (delta) {
                if (root && typeof root._tslPagerStep === 'function') {
                    root._tslPagerStep(delta);
                }
            },
            refresh: function () {
                if (root && typeof root._tslPagerRefresh === 'function') {
                    root._tslPagerRefresh();
                }
            },
            goToIndex: function (idx) {
                if (root && typeof root._tslPagerGoToIndex === 'function') {
                    return root._tslPagerGoToIndex(idx);
                }
                return false;
            },
            progress: function () {
                if (!root || typeof root._tslPagerInfo !== 'function') {
                    return { index: 0, total: 0, frac: 0 };
                }
                var info = root._tslPagerInfo();
                var frac = info.total > 1 ? info.index / (info.total - 1) : (info.total ? 1 : 0);
                return {
                    index: info.index,
                    total: info.total,
                    view: info.view,
                    frac: frac
                };
            }
        };
        readerArticle._tslPlayer = player;
        return player;
    }

    global.TalesmithTsl = {
        parse: parse,
        resolveHeader: resolveHeader,
        synthesizeMergeFields: synthesizeMergeFields,
        mergeFieldValues: mergeFieldValues,
        resolveFields: resolveFields,
        render: render,
        toLeanHtml: toLeanHtml,
        mountLeanHtml: mountLeanHtml,
        leanHtmlToEnvelope: leanHtmlToEnvelope,
        envelopeToText: envelopeToText,
        display: display,
        loadUrl: loadUrl,
        loadText: loadText,
        getReadingPrefs: getReadingPrefs,
        getTslLayout: getTslLayout,
        getPageFit: getPageFit,
        setReadingPref: setReadingPref,
        applyReadingPrefs: applyReadingPrefs,
        applyTslLayoutVarsToArticle: applyTslLayoutVarsToArticle,
        applyLeanReadingPrefs: applyLeanReadingPrefs,
        enhancePublishedLean: enhancePublishedLean,
        mountReaderEnvelope: mountReaderEnvelope,
        bindReadingPrefsUI: bindReadingPrefsUI,
        resetReadingPrefs: resetReadingPrefs,
        collectDocumentOutline: collectDocumentOutline,
        collectTocEntries: collectTocEntries,
        headingAnchorId: headingAnchorId,
        findInDocumentAnchorTarget: findInDocumentAnchorTarget,
        navigateToInDocumentAnchor: navigateToInDocumentAnchor,
        bindInDocumentAnchorClicks: bindInDocumentAnchorClicks
    };
})(typeof window !== 'undefined' ? window : globalThis);
