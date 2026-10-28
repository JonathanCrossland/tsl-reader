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

    function inlineHtml(text) {
        var s = String(text || '');
        if (!s) {
            return '';
        }
        var doc = new DOMParser().parseFromString('<div>' + s + '</div>', 'text/html');
        var allowed = { b: 1, strong: 1, i: 1, em: 1, u: 1, a: 1, br: 1, span: 1, sup: 1, sub: 1, code: 1 };
        function clean(node) {
            var kids = Array.prototype.slice.call(node.childNodes);
            kids.forEach(function (child) {
                if (child.nodeType === 1) {
                    var tag = child.tagName.toLowerCase();
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
                        clean(child);
                    }
                }
            });
        }
        clean(doc.body);
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

    function render(mount, parsed) {
        var header = parsed.header;
        var blocks = parsed.blocks;
        var page = header.page;
        var ty = header.typography;
        var layoutMode = getTslLayout();
        var root = document.createElement('div');
        root.className = 'tsl-root';
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
        var headerState = { any: null, left: null, right: null };
        var footerState = { any: null, left: null, right: null };
        var physical = 0;
        var pages = [];
        var values = mergeFieldValues(header);
        var readMode = header.readMode !== false;
        var runningHeader = '';

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
            return Math.max(120, bodyHmm * mm);
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
            col.appendChild(renderBlock(b, {}));
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
                bleedCol.appendChild(renderBlock(b, {}));
                bleedRow.appendChild(bleedCol);
                current.body.appendChild(bleedRow);
                current = null;
                bi += 1;
                continue;
            }
            if (type === 'paywall' || type === 'document') {
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
            if (pg.header) {
                section.appendChild(renderRegion(pg.header, 'header', page.headerRule, ctx, readMode));
            }
            section.appendChild(pg.body);
            if (readMode) {
                resolveFieldsIn(pg.body, ctx);
            }
            if (pg.footer) {
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
        return root;
    }

    var READER_PREFS_KEY = 'reader:prefs';
    var TSL_LAYOUT_KEY = 'tsl:layout';
    var READER_SIZES = [14, 16, 18, 20, 24];
    var READER_DEFAULT_PREFS = { font: 'serif', size: 18, theme: 'light', width: 'medium' };

    function loadStored(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (raw === null) {
                return fallback;
            }
            var v = JSON.parse(raw);
            return v === null || v === undefined ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function saveStored(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* private mode */ }
    }

    function getReadingPrefs() {
        var p = Object.assign({}, READER_DEFAULT_PREFS, loadStored(READER_PREFS_KEY, {}));
        if (READER_SIZES.indexOf(p.size) < 0) {
            p.size = 18;
        }
        return p;
    }

    function getTslLayout() {
        return loadStored(TSL_LAYOUT_KEY, 'pages') === 'scroll' ? 'scroll' : 'pages';
    }

    function readerSizeScale(sizePx) {
        var n = parseInt(sizePx, 10);
        if (READER_SIZES.indexOf(n) < 0) {
            n = 18;
        }
        return n / 18;
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
        root.style.setProperty('--tsl-reader-scale', String(readerSizeScale(p.size)));
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
        var p = getReadingPrefs();
        if (key === 'size') {
            p.size = parseInt(value, 10);
        } else {
            p[key] = value;
        }
        saveStored(READER_PREFS_KEY, p);
        refreshAllReadingPrefs();
    }

    function resetReadingPrefs() {
        saveStored(READER_PREFS_KEY, READER_DEFAULT_PREFS);
        saveStored(TSL_LAYOUT_KEY, 'pages');
        refreshAllReadingPrefs();
    }

    function syncReadingPrefsUI(container) {
        if (!container) {
            return;
        }
        var p = getReadingPrefs();
        var layout = getTslLayout();
        container.querySelectorAll('[data-tsl-pref]').forEach(function (b) {
            var key = b.getAttribute('data-tsl-pref');
            var cur = key === 'layout' ? layout : (key === 'size' ? String(p.size) : p[key]);
            var on = b.getAttribute('data-value') === cur;
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.classList.toggle('is-on', on);
        });
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

    function renderBlock(b, ctx) {
        var type = b.type;
        var el;
        if (type === 'divider') {
            el = document.createElement('hr');
            el.className = 'tsl-block tsl-block--divider';
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
            return fig;
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
        el.innerHTML = inlineHtml(b.text);
        return el;
    }

    function round1(n) {
        return Math.round(n * 10) / 10;
    }

    function round2(n) {
        return Math.round(n * 100) / 100;
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
            return '<h1 class="studio-lean-title" style="' + style + '">' + t + '</h1>';
        }
        if (type === 'h1' || type === 'h2' || type === 'h3') {
            var h = leanInlineHtml(block.text, header, readMode);
            if (!plainText(h)) {
                return '';
            }
            return '<' + type + ' style="' + style + '">' + h + '</' + type + '>';
        }
        if (type === 'paragraph') {
            var p = leanInlineHtml(block.text, header, readMode);
            if (!plainText(p)) {
                return '<p class="studio-lean-empty" style="' + style + '">&nbsp;</p>';
            }
            return '<p style="' + style + '">' + p + '</p>';
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
        if (type === 'full-page') {
            return '<div class="studio-lean-full-page" data-halign="' + escapeHtml(block.hAlign || 'center') + '" data-valign="' + escapeHtml(block.vAlign || 'center') + '"><div class="studio-lean-full-page-inner">' + leanInlineHtml(block.text, header, readMode) + '</div></div>';
        }
        if (type === 'manuscript-title') {
            return '<section class="studio-lean-manuscript-title"><div class="studio-lean-manuscript-page">'
                + leanInlineHtml(block.title || '[Title]', header, readMode) + '</div></section>';
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
        setReadingPref: setReadingPref,
        applyReadingPrefs: applyReadingPrefs,
        bindReadingPrefsUI: bindReadingPrefsUI,
        resetReadingPrefs: resetReadingPrefs
    };
})(typeof window !== 'undefined' ? window : globalThis);
