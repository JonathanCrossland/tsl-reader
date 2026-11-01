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
            if (header.allowScrollMode === undefined) {
                header.allowScrollMode = true;
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
            allowScrollMode: c.allowScrollMode !== false,
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

    function looksLikeLegacyInlineHtml(value) {
        var s = value == null ? '' : String(value);
        if (!s || s.indexOf('<') === -1) {
            return false;
        }
        return /<(strong|b|em|i|u|code|br)\b/i.test(s);
    }

    function markdownInlineHasMarkup(value) {
        var s = value == null ? '' : String(value);
        if (!s) {
            return false;
        }
        if (looksLikeLegacyInlineHtml(s)) {
            return true;
        }
        return /(\*\*|__|\*(?!\*)|_(?!_)|~~[^~\n]+~~|\+\+[^+\n]+\+\+|`[^`\n]+`|\[[^\]]+\]\([^)]+\)|\\[\[(]|\\\(|\n)/.test(s);
    }

    /** Matches one HTML tag (or comment) in block text; `<code>…</code>` is taken whole so markdown never applies inside it. */
    var INLINE_HTML_TOKEN_RE = /<code\b[^>]*>[\s\S]*?<\/code\s*>|<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g;

    /**
     * Studio inline markdown → HTML (small subset); then sanitized like authored HTML.
     * Text that already contains HTML tags still gets markdown: tags are held aside as opaque
     * slots (so `*`/`_` in attributes are untouched), markdown runs on the surrounding text, and
     * the tags are restored before sanitizing. Authored entities are kept, and newlines in HTML
     * text stay as whitespace, as before.
     */
    function markdownInlineToHtml(raw) {
        var s = String(raw || '');
        if (!s) {
            return '';
        }
        var hasHtml = INLINE_HTML_TOKEN_RE.test(s);
        INLINE_HTML_TOKEN_RE.lastIndex = 0;
        var tagSlots = [];
        if (hasHtml) {
            s = s.replace(INLINE_HTML_TOKEN_RE, function (tag) {
                tagSlots.push(tag);
                return '\x02TSL_TAG' + (tagSlots.length - 1) + '\x02';
            });
        }
        var codeSlots = [];
        s = s.replace(/`([^`\n]+)`/g, function (_, inner) {
            var key = '\x01TSL_CODE' + codeSlots.length + '\x01';
            codeSlots.push('<code>' + (hasHtml ? inner.replace(/</g, '&lt;').replace(/>/g, '&gt;') : escapeHtml(inner)) + '</code>');
            return key;
        });
        var out = hasHtml ? s : s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
            return '<a href="' + escapeHtml(href) + '">' + label + '</a>';
        });
        out = out.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/__(.+?)__/g, '<strong>$1</strong>');
        out = out.replace(/~~(.+?)~~/g, '<span class="tsl-md-strike">$1</span>');
        out = out.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
        out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
        out = out.replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, '<em>$1</em>');
        codeSlots.forEach(function (html, i) {
            out = out.replace('\x01TSL_CODE' + i + '\x01', html);
        });
        if (hasHtml) {
            out = out.replace(/\x02TSL_TAG(\d+)\x02/g, function (_, i) {
                return tagSlots[+i];
            });
        } else {
            out = out.replace(/\n/g, '<br>');
        }
        return sanitizeInlineHtmlFragment(out);
    }

    function sanitizeInlineHtmlFragment(s) {
        if (!s) {
            return '';
        }
        var doc = new DOMParser().parseFromString('<div>' + s + '</div>', 'text/html');
        var allowed = { b: 1, strong: 1, i: 1, em: 1, u: 1, a: 1, br: 1, span: 1, sup: 1, sub: 1, code: 1 };
        var dropWithContent = { script: 1, style: 1, template: 1, iframe: 1, object: 1, embed: 1, noscript: 1 };
        function cleanInline(node) {
            var kids = Array.prototype.slice.call(node.childNodes);
            kids.forEach(function (child) {
                if (child.nodeType === 1) {
                    var tag = child.tagName.toLowerCase();
                    Array.prototype.slice.call(child.attributes).forEach(function (attr) {
                        if (/^on/i.test(attr.name)) {
                            child.removeAttribute(attr.name);
                        }
                    });
                    if (tag === 'span' && isDropCapSpan(child)) {
                        cleanDropCapSpan(child);
                        return;
                    }
                    if (tag === 'span' && child.classList.contains('studio-dropcap-rest')) {
                        cleanInline(child);
                        return;
                    }
                    if (dropWithContent[tag]) {
                        node.removeChild(child);
                    } else if (!allowed[tag]) {
                        // Unwrap, then clean what was inside (it is now a direct child of node).
                        var holder = child.ownerDocument.createElement('span');
                        while (child.firstChild) {
                            holder.appendChild(child.firstChild);
                        }
                        cleanInline(holder);
                        while (holder.firstChild) {
                            node.insertBefore(holder.firstChild, child);
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

    function inlineHtml(text) {
        var s = String(text || '');
        if (!s) {
            return '';
        }
        if (markdownInlineHasMarkup(s)) {
            return markdownInlineToHtml(s);
        }
        return sanitizeInlineHtmlFragment(s);
    }

    var TSL_LAYOUT_BREAK_TYPES = {
        pageheader: 1, pagefooter: 1, newpage: 1, document: 1,
        'manuscript-title': 1, 'image-index': 1, 'full-page': 1, 'front-cover': 1,
        paywall: 1, toc: 1
    };

    /* -----------------------------------------------------------------------
     * TSL block ruleset — interpreted from the specification, not hard-coded.
     *
     * Source of truth: spec/tsl-spec.tsl §5 (properties common to all blocks),
     * §5.2 (cols), §5.5 (scalar and enum constraints), §6 (block types); the
     * option surface is the one demonstrated in spec/*.tsl and examples/*.tsl.
     *
     * Each property rule declares:
     *   values  allowed enum values (anything else falls back to def)
     *   type    'boolean' | 'int' | 'string' for non-enum values
     *   min/max integer range; out of range → def, or clamped when clamp: true
     *   maxLength strings longer than this are cut (an empty string is a value)
     *   def     the spec default when omitted or invalid
     *   cls     rule-class prefix: value v maps to class "<cls>-<v>"; tsl.css
     *           imposes the rule for that class (e.g. full-page hAlign center →
     *           .halign-center). Renderers never write the presentation values.
     *   cssVar  continuous values map to a CSS custom property instead of a
     *           class; tsl.css consumes the variable.
     *   emitDefault false → the default value emits no class, so the inherited
     *           document rule (e.g. typography.paragraphAlign) keeps applying.
     *   forces  boolean rule: when true, the named property's class is emitted even
     *           at its default (paragraph alignOverride → align wins over the preset).
     *   flag    boolean rule: class emitted when the value is true.
     *   attr    value maps to an attribute (formatted by format, see TSL_RULE_FORMAT).
     *   derive  the value is derived from block content, not read from a property
     *           (see TSL_RULE_DERIVE); e.g. spec §6.2 empty paragraph → no indent.
     *   normalize  type 'object': the stored value is normalised by a named function
     *           (see TSL_RULE_NORMALIZE) — null means off; a flag fires when it is set.
     *   blankIsDefault  type 'string': a blank value ('' / whitespace) uses def.
     *   renderers  limit the class/var/attr mapping to these renderers ('paged', 'lean');
     *           the value still resolves everywhere. Omit to map in every renderer.
     *
     * The ruleset is extensible: hosts (the lab) call TalesmithTsl.defineBlockRules()
     * to replace or extend rules per type without forking the player — see below.
     *
     * Source blocks are never mutated (spec §11.3: preserve properties for
     * round-trip); resolveBlockRules() returns a validated view.
     * --------------------------------------------------------------------- */
    var TSL_ALIGN_VALUES = ['left', 'center', 'right', 'justify'];
    var TSL_BLOCK_RULES = {
        common: {
            align: { values: TSL_ALIGN_VALUES, def: 'left', cls: 'align', emitDefault: false },
            cols: { values: [1, 2], def: 2 },
            theme: { values: [null, 'default', 'serif', 'dark', 'compact'], def: null }
        },
        types: {
            // §6.2 Body text. alignOverride (Studio round-trip, spec/specification-0.1.tsl):
            // the block's own align wins over typography.paragraphAlign, even when left.
            paragraph: {
                alignOverride: { type: 'boolean', def: false, forces: 'align' },
                noIndent: { derive: 'emptyText', type: 'boolean', def: false, flag: 'no-indent' },
                // Studio drop cap: block.dropCap is the Studio object { lines, style, characters,
                // includeLeadingPunctuation, spacingEm, opticalMargin, alignBaseline, uppercase,
                // variant, capStyle } (or a 1–3 line count / JSON string from a lean comment);
                // null / false / 0 = off. The resolved value is the normalised spec (normalizeDropCap).
                // Both renderers draw the cap (buildDropCapInner); in Pages only the first fragment
                // of a split paragraph keeps dropCap (continuations are cleared in pagination).
                dropCap: { type: 'object', normalize: 'dropCap', def: null, flag: 'studio-has-dropcap' },
                // Text that already carries a Studio drop-cap span (Studio-baked lean HTML).
                dropCapMarkup: { derive: 'dropCapMarkup', type: 'boolean', def: false, flag: 'studio-has-dropcap' }
            },
            // §6.1 Document title. Presentation is the common rules (align, cols, theme) plus
            // .tsl-block--title / .studio-lean-title in tsl.css; role=doc-title is semantics.
            title: {},
            // §6.3–6.5 Headings. number is the outline label ("1", "1.2"); spec/specification-0.1.tsl.
            h1: { number: { type: 'string', def: null, attr: 'data-heading-number', format: 'headingNumber' } },
            h2: { number: { type: 'string', def: null, attr: 'data-heading-number', format: 'headingNumber' } },
            h3: { number: { type: 'string', def: null, attr: 'data-heading-number', format: 'headingNumber' } },
            'full-page': {
                hAlign: { values: ['left', 'center', 'right'], def: 'center', cls: 'halign' },
                vAlign: { values: ['top', 'center', 'bottom'], def: 'center', cls: 'valign' }
            },
            bullet: {
                bulletStyle: {
                    values: ['disc', 'circle', 'square', 'dash', 'number', 'lower-alpha', 'upper-alpha'],
                    def: 'disc',
                    cls: 'bullet'
                }
            },
            todo: { checked: { type: 'boolean', def: false } },
            table: { header: { type: 'boolean', def: true } },
            image: { width: { type: 'int', min: 10, max: 100, clamp: true, def: 100, cssVar: '--tsl-image-width', unit: '%' } },
            pageheader: { side: { values: ['any', 'left', 'right'], def: 'any' } },
            pagefooter: { side: { values: ['any', 'left', 'right'], def: 'any' } },
            toc: {
                maxLevel: { type: 'int', min: 1, max: 3, def: 3 },
                leader: { type: 'string', maxLength: 4, def: '.' }
            },
            'image-index': { leader: { type: 'string', maxLength: 4, def: '.' } },
            'manuscript-title': { kind: { values: ['novel', 'short-story', 'poem'], def: 'novel', cls: 'kind' } },
            // §6.6 Block quotation: common rules + .tsl-block--quote (tsl.css).
            quote: {},
            // §6.7 Preformatted text: plain text only, HTML not interpreted; common rules +
            // .tsl-block--code / .studio-lean-code (tsl.css).
            code: {},
            // §6.8 Callout. icon: single emoji or short text prefix, not a URL (spec §5.5);
            // default light-bulb. Blank uses the default; lab can set def '' to hide icons.
            aside: { icon: { type: 'string', def: '\uD83D\uDCA1', blankIsDefault: true } },
            // §6.11 Horizontal rule / §6.12 Page break: no extra fields; common rules only.
            divider: {},
            newpage: {},
            // §6.17 Cover image: src is content. expanded (§5.5, §12.3) is Studio editor state —
            // true selects the full-bleed cover layout in Studio, false only collapses editor
            // chrome — so it is validated for round-trip but maps to no player class. The
            // full-bleed page itself is pagination (startPage fullBleed), not a block property.
            'front-cover': { expanded: { type: 'boolean', def: true } },
            // §6.21 Embed another document: documentId / title are references, not presentation;
            // players skip the block (not flattened inside .tsl export).
            document: {},
            // §6.22 Paywall marker: text is content; roles (§5.5) gate publishing and are not
            // enforced by this player. Common rules only.
            paywall: {},
            // §6.23 Screenplay, stage and Math (Studio extensions: block-editor-script.js,
            // block-editor-stage.js, block-editor-math.js). text / character / source and the
            // scene-number labels are content; only the props below are presentation. Layout
            // (insets, casing) lives in tsl.css keyed on the per-type class.
            'script-scene': {
                // Studio: showSceneNumbers prints sceneNumberLeft / sceneNumberRight in the margins.
                showSceneNumbers: { type: 'boolean', def: false, flag: 'tsl-scene-numbered' }
            },
            'script-action': {},
            'script-character': {},
            'script-dialogue': {},
            'script-parenthetical': {},
            'script-transition': {},
            'script-shot': {},
            'stage-scene': {},
            'stage-action': {},
            'stage-direction': {},
            'stage-speech': {},
            mathml: {
                // Studio normalise: display !== false (block layout); false sets the math inline.
                display: { type: 'boolean', def: true, flag: 'tsl-math-display' },
                // Editor state only (source panel open); validated for round-trip, no class.
                sourceExpanded: { type: 'boolean', def: false }
            }
        }
    };

    /** Named content derivations for derive: rules (a rule may also pass a function). */
    var TSL_RULE_DERIVE = {
        // spec §6.2: "Empty text suppresses paragraph indent in the player."
        emptyText: function (block) { return !plainText(block && block.text); },
        // Studio-baked drop-cap span already inside the text.
        dropCapMarkup: function (block) {
            return /class="[^"]*(?:dropcap|studio-dropcap)/i.test(String((block && block.text) || ''));
        }
    };

    /** Named normalisers for normalize: rules (a rule may also pass a function). Return null for off. */
    var TSL_RULE_NORMALIZE = {
        dropCap: function (raw) { return parseDropCapComment(raw); }
    };

    /** Named value formatters for attr: rules (a rule may also pass a function). */
    var TSL_RULE_FORMAT = {
        headingNumber: function (v) { return headingNumberLabel(v); }
    };

    function cloneRule(rule) {
        var out = {};
        Object.keys(rule).forEach(function (k) {
            out[k] = Array.isArray(rule[k]) ? rule[k].slice() : rule[k];
        });
        return out;
    }

    function cloneRuleGroup(group) {
        var out = {};
        Object.keys(group || {}).forEach(function (k) { out[k] = cloneRule(group[k]); });
        return out;
    }

    var TSL_BLOCK_RULES_SPEC = {
        common: cloneRuleGroup(TSL_BLOCK_RULES.common),
        types: {}
    };
    Object.keys(TSL_BLOCK_RULES.types).forEach(function (t) {
        TSL_BLOCK_RULES_SPEC.types[t] = cloneRuleGroup(TSL_BLOCK_RULES.types[t]);
    });
    var TSL_RULE_DERIVE_SPEC = Object.assign({}, TSL_RULE_DERIVE);
    var TSL_RULE_FORMAT_SPEC = Object.assign({}, TSL_RULE_FORMAT);
    var TSL_RULE_NORMALIZE_SPEC = Object.assign({}, TSL_RULE_NORMALIZE);

    function mergeRuleGroup(target, patch, replace) {
        if (replace) {
            Object.keys(target).forEach(function (k) { delete target[k]; });
        }
        Object.keys(patch || {}).forEach(function (prop) {
            var r = patch[prop];
            if (r === null || r === false) {
                delete target[prop];
                return;
            }
            target[prop] = target[prop] && !replace
                ? Object.assign(cloneRule(target[prop]), r)
                : cloneRule(r);
        });
    }

    /**
     * Extensibility hook (used by lab/lab-rules.js). Patch the live ruleset:
     *   defineBlockRules({
     *     common: { prop: rule },                    // rules for every block type
     *     types:  { paragraph: { prop: rule } },     // per-type rules; null removes a type
     *     derive: { name: function (block) {…} },    // named derivations for derive:
     *     format: { name: function (value) {…} },    // named formatters for attr:
     *     normalize: { name: function (raw) {…} }    // named normalisers for normalize:
     *   }, { replace: false })
     * Per property, a rule object is merged onto the existing rule (so { def: 'justify' }
     * only changes the default); null removes the property. With { replace: true } each
     * group named in the patch is replaced wholesale. Renderers read the live ruleset, so
     * re-render (TalesmithTsl.display) after defining rules on an already-shown document.
     */
    function defineBlockRules(patch, opts) {
        patch = patch || {};
        var replace = !!(opts && opts.replace);
        if (patch.common) {
            mergeRuleGroup(TSL_BLOCK_RULES.common, patch.common, replace);
        }
        Object.keys(patch.types || {}).forEach(function (t) {
            if (patch.types[t] === null) {
                delete TSL_BLOCK_RULES.types[t];
                return;
            }
            TSL_BLOCK_RULES.types[t] = TSL_BLOCK_RULES.types[t] || {};
            mergeRuleGroup(TSL_BLOCK_RULES.types[t], patch.types[t], replace);
        });
        Object.assign(TSL_RULE_DERIVE, patch.derive || {});
        Object.assign(TSL_RULE_FORMAT, patch.format || {});
        Object.assign(TSL_RULE_NORMALIZE, patch.normalize || {});
        tslRuleIssuesSeen = {};
        return TSL_BLOCK_RULES;
    }

    /** Drop every override and return to the ruleset interpreted from the spec. */
    function resetBlockRules() {
        mergeRuleGroup(TSL_BLOCK_RULES.common, TSL_BLOCK_RULES_SPEC.common, true);
        Object.keys(TSL_BLOCK_RULES.types).forEach(function (t) { delete TSL_BLOCK_RULES.types[t]; });
        Object.keys(TSL_BLOCK_RULES_SPEC.types).forEach(function (t) {
            TSL_BLOCK_RULES.types[t] = cloneRuleGroup(TSL_BLOCK_RULES_SPEC.types[t]);
        });
        Object.keys(TSL_RULE_DERIVE).forEach(function (k) { delete TSL_RULE_DERIVE[k]; });
        Object.assign(TSL_RULE_DERIVE, TSL_RULE_DERIVE_SPEC);
        Object.keys(TSL_RULE_FORMAT).forEach(function (k) { delete TSL_RULE_FORMAT[k]; });
        Object.assign(TSL_RULE_FORMAT, TSL_RULE_FORMAT_SPEC);
        Object.keys(TSL_RULE_NORMALIZE).forEach(function (k) { delete TSL_RULE_NORMALIZE[k]; });
        Object.assign(TSL_RULE_NORMALIZE, TSL_RULE_NORMALIZE_SPEC);
        tslRuleIssuesSeen = {};
        return TSL_BLOCK_RULES;
    }

    function ruleNamedFn(registry, ref) {
        return typeof ref === 'function' ? ref : (ref ? registry[ref] : null);
    }

    /** A rule value as display text, through the rule's format ('' when unset). */
    function ruleFormatValue(rule, value) {
        if (!rule || value === null || value === undefined) {
            return '';
        }
        var fmt = ruleNamedFn(TSL_RULE_FORMAT, rule.format);
        var out = fmt ? fmt(value) : value;
        return out === null || out === undefined ? '' : String(out);
    }

    /** Resolved + formatted value of one rule property for a block ('' when the type has no such rule). */
    function blockRuleText(block, prop) {
        var b = block || {};
        return ruleFormatValue(ruleSetForType(b.type)[prop], resolveBlockRules(b).props[prop]);
    }

    var tslRuleIssuesSeen = {};

    function reportRuleIssue(block, prop, value, used) {
        var key = (block && block.type) + '.' + prop + '=' + String(value);
        if (tslRuleIssuesSeen[key]) {
            return;
        }
        tslRuleIssuesSeen[key] = 1;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[tsl] block ' + ((block && block.id) || '?') + ' (' + (block && block.type)
                + '): ' + prop + '=' + JSON.stringify(value) + ' is outside the spec; using ' + JSON.stringify(used));
        }
    }

    function ruleSetForType(type) {
        var own = TSL_BLOCK_RULES.types[type] || {};
        var out = {};
        Object.keys(TSL_BLOCK_RULES.common).forEach(function (k) { out[k] = TSL_BLOCK_RULES.common[k]; });
        Object.keys(own).forEach(function (k) { out[k] = own[k]; });
        return out;
    }

    function validateRuleValue(rule, raw) {
        if (raw === undefined || raw === null || (raw === '' && rule.type !== 'string')
            || (rule.blankIsDefault && typeof raw === 'string' && !raw.trim())) {
            return { value: rule.def, ok: true, omitted: true };
        }
        if (rule.type === 'object' && rule.normalize) {
            var norm = ruleNamedFn(TSL_RULE_NORMALIZE, rule.normalize);
            var nv = norm ? norm(raw) : raw;
            return { value: nv === null || nv === undefined ? rule.def : nv, ok: true };
        }
        if (rule.values) {
            var v = raw;
            if (typeof v === 'string') {
                v = v.toLowerCase();
            }
            if (rule.values.indexOf(v) < 0 && typeof rule.values[0] === 'number') {
                v = Number(raw);
            }
            return rule.values.indexOf(v) >= 0 ? { value: v, ok: true } : { value: rule.def, ok: false };
        }
        if (rule.type === 'boolean') {
            return typeof raw === 'boolean' ? { value: raw, ok: true } : { value: !!raw, ok: false };
        }
        if (rule.type === 'int') {
            var n = parseInt(raw, 10);
            if (!isFinite(n)) {
                return { value: rule.def, ok: false };
            }
            if (n >= rule.min && n <= rule.max) {
                return { value: n, ok: n === Number(raw) };
            }
            return { value: rule.clamp ? Math.min(rule.max, Math.max(rule.min, n)) : rule.def, ok: false };
        }
        if (rule.type === 'string') {
            var s = String(raw);
            return rule.maxLength && s.length > rule.maxLength
                ? { value: s.slice(0, rule.maxLength), ok: false }
                : { value: s, ok: true };
        }
        return { value: raw, ok: true };
    }

    /**
     * Validate a block's spec properties. Returns
     * { type, props: { name: value }, omitted: { name: true }, issues: [ { prop, value, used } ] }.
     */
    function resolveBlockRules(block) {
        var type = (block && block.type) || 'paragraph';
        var rules = ruleSetForType(type);
        var out = { type: type, props: {}, omitted: {}, issues: [] };
        Object.keys(rules).forEach(function (prop) {
            var derive = ruleNamedFn(TSL_RULE_DERIVE, rules[prop].derive);
            if (rules[prop].derive) {
                out.props[prop] = validateRuleValue(rules[prop], derive ? derive(block || {}) : undefined).value;
                return;
            }
            var raw = block ? block[prop] : undefined;
            var r = validateRuleValue(rules[prop], raw);
            out.props[prop] = r.value;
            if (r.omitted) {
                out.omitted[prop] = true;
            }
            if (!r.ok && !r.omitted) {
                out.issues.push({ prop: prop, value: raw, used: r.value });
                reportRuleIssue(block, prop, raw, r.value);
            }
        });
        return out;
    }

    function ruleClassToken(value) {
        return String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    }

    /** Map a block's validated properties to CSS rule classes and CSS variables. */
    function blockRuleMapping(block, opts) {
        opts = opts || {};
        var resolved = resolveBlockRules(block);
        var rules = ruleSetForType(resolved.type);
        var classes = [];
        var vars = {};
        var attrs = {};
        var forced = {};
        Object.keys(rules).forEach(function (prop) {
            if (rules[prop].forces && resolved.props[prop] === true) {
                forced[rules[prop].forces] = true;
            }
        });
        Object.keys(rules).forEach(function (prop) {
            var rule = rules[prop];
            var value = resolved.props[prop];
            if (rule.renderers && opts.renderer && rule.renderers.indexOf(opts.renderer) < 0) {
                return;
            }
            if (rule.cls && value !== null && value !== undefined) {
                var emitDefault = opts.emitDefaults || forced[prop] || rule.emitDefault !== false;
                if (emitDefault || value !== rule.def) {
                    classes.push(rule.cls + '-' + ruleClassToken(value));
                }
            }
            if (rule.flag && (value === true || (rule.type === 'object' && value))
                && classes.indexOf(rule.flag) < 0) {
                classes.push(rule.flag);
            }
            if (rule.cssVar && !resolved.omitted[prop]) {
                vars[rule.cssVar] = value + (rule.unit || '');
            }
            if (rule.attr) {
                var out = ruleFormatValue(rule, value);
                if (out !== '') {
                    attrs[rule.attr] = out;
                }
            }
        });
        return { classes: classes, vars: vars, attrs: attrs, props: resolved.props, issues: resolved.issues };
    }

    /** DOM renderer: stamp rule classes + variables onto a rendered block element. */
    function applyBlockRules(el, block, opts) {
        if (!el || !block) {
            return el;
        }
        var map = blockRuleMapping(block, Object.assign({ renderer: 'paged' }, opts));
        map.classes.forEach(function (c) { el.classList.add(c); });
        Object.keys(map.vars).forEach(function (k) { el.style.setProperty(k, map.vars[k]); });
        Object.keys(map.attrs).forEach(function (k) { el.setAttribute(k, map.attrs[k]); });
        return el;
    }

    /** Lean HTML renderer: class="…" (and style="--var:…") attribute string. */
    function leanRuleAttrs(block, baseClasses, opts) {
        var map = blockRuleMapping(block, Object.assign({ renderer: 'lean' }, opts));
        var base = String(baseClasses || '').split(/\s+/).filter(Boolean);
        var cls = base.concat(map.classes.filter(function (c) { return base.indexOf(c) < 0; })).join(' ');
        var attrs = cls ? ' class="' + escapeHtml(cls) + '"' : '';
        var vars = Object.keys(map.vars).map(function (k) { return k + ':' + map.vars[k]; }).join(';');
        if (vars) {
            attrs += ' style="' + escapeHtml(vars) + ';"';
        }
        Object.keys(map.attrs).forEach(function (k) {
            attrs += ' ' + k + '="' + escapeHtml(map.attrs[k]) + '"';
        });
        return attrs;
    }

    /** Inverse mapping: read a spec property back from rule classes or data-* on markup. */
    function blockPropFromMarkup(el, type, prop) {
        var rule = ruleSetForType(type)[prop];
        if (!el || !rule || rule.derive) {
            return undefined;
        }
        if (rule.cls && rule.values && el.classList) {
            for (var i = 0; i < rule.values.length; i++) {
                if (rule.values[i] !== null && el.classList.contains(rule.cls + '-' + ruleClassToken(rule.values[i]))) {
                    return rule.values[i];
                }
            }
        }
        var data = el.getAttribute && el.getAttribute('data-' + prop.toLowerCase());
        if (data != null && data !== '') {
            return validateRuleValue(rule, data).value;
        }
        return undefined;
    }

    /**
     * Upgrade Lean HTML published before rule classes existed (e.g. studio_publisher.php
     * writes data-halign / data-valign on .studio-lean-full-page) so tsl.css rules apply.
     */
    function applyLeanRuleClasses(root) {
        if (!root || !root.querySelectorAll) {
            return;
        }
        root.querySelectorAll('.studio-lean-full-page').forEach(function (el) {
            var block = {
                type: 'full-page',
                hAlign: blockPropFromMarkup(el, 'full-page', 'hAlign'),
                vAlign: blockPropFromMarkup(el, 'full-page', 'vAlign')
            };
            blockRuleMapping(block).classes.forEach(function (c) {
                if (/^(halign|valign)-/.test(c)) {
                    el.classList.add(c);
                }
            });
        });
    }

    /** pageheader / pagefooter side (spec §5.5: any | left | right, default any). */
    function blockChromeSide(block) {
        return resolveBlockRules(block).props.side || 'any';
    }

    /**
     * bulletStyle values that count (spec §6.9 list: number, lower-alpha, upper-alpha) render
     * as an ordered list; the bullet-* rule class supplies the marker. Others render as <ul>.
     */
    var TSL_ORDINAL_BULLET_STYLES = { number: 1, 'lower-alpha': 1, 'upper-alpha': 1 };

    function bulletListTag(bulletStyle) {
        return TSL_ORDINAL_BULLET_STYLES[bulletStyle] ? 'ol' : 'ul';
    }

    /**
     * Spec §6.9: consecutive bullet blocks form one list. Position (1-based) of a bullet within
     * its run of consecutive bullet blocks of the same bulletStyle.
     */
    function bulletRunPosition(block, allBlocks, bulletStyle) {
        var idx = allBlocks ? allBlocks.indexOf(block) : -1;
        var pos = 1;
        while (idx > 0) {
            idx -= 1;
            var prev = allBlocks[idx];
            if (!prev || prev.type !== 'bullet' || resolveBlockRules(prev).props.bulletStyle !== bulletStyle) {
                break;
            }
            pos += 1;
        }
        return pos;
    }

    /** Validated view of one spec property, for blocks rendered by a dedicated builder (toc, image-index…). */
    function blockRuleProp(block, type, prop) {
        var b = block || {};
        return resolveBlockRules(b.type ? b : Object.assign({ type: type }, b)).props[prop];
    }

    function blockLayoutCols(block) {
        return resolveBlockRules(block || {}).props.cols;
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
        var state = { index: 0, activePage: null, lastView: '', scaleRaf: 0, stageW: -1, stageH: -1, scaling: false };

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

        function fitStageWidthPx() {
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
            return Math.max(0, w);
        }

        function containerWidthPx() {
            return fitStageWidthPx();
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

        /** Hard ceiling: stage height never exceeds visible browser viewport (reader, not document scroll). */
        function readerBrowserViewportHeightPx() {
            if (typeof window === 'undefined') {
                return 0;
            }
            var pagerTop = viewport.getBoundingClientRect().top;
            var viewBottom = window.innerHeight;
            if (window.visualViewport) {
                viewBottom = window.visualViewport.offsetTop + window.visualViewport.height;
            }
            var budget = viewBottom - pagerTop;
            if (status.offsetHeight > 0) {
                budget -= status.offsetHeight;
            }
            return Math.max(0, Math.floor(budget));
        }

        /** Vertical budget for fit/scale: stable flex column size (not the viewport element we resize). */
        function pagerStageHeightPx() {
            var h = 0;
            var mount = root.closest('[data-tsl-mount]');
            var box = fitContainerEl();
            if (mount && mount.clientHeight > 0) {
                h = mount.clientHeight;
            } else if (box && box.clientHeight > 0) {
                h = box.clientHeight;
            }
            if (status.offsetHeight > 0) {
                h = Math.max(0, h - status.offsetHeight);
            }
            if (h < 32 && wrap && wrap.clientHeight > 0) {
                h = wrap.clientHeight - (status.offsetHeight || 0);
            }
            var viewCap = readerBrowserViewportHeightPx();
            if (viewCap > 0) {
                h = h > 0 ? Math.min(h, viewCap) : viewCap;
            }
            return Math.max(0, h);
        }

        /** Host-defined stage (data-tsl-fit-container): width from container; height from pager wrap. */
        function pagerStageSize() {
            var inset = 8;
            var w = fitStageWidthPx();
            var h = pagerStageHeightPx();

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
            if (!state.scaleRaf) {
                state.scaleRaf = requestAnimationFrame(function () {
                    state.scaleRaf = 0;
                    applyViewportScale();
                });
            }
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
            if (pageEl.getAttribute('data-tsl-full-bleed') === '1') {
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
                viewport.style.overflowX = 'hidden';
                viewport.style.overflowY = 'auto';
                viewport.style.alignItems = 'flex-start';
                viewport.style.justifyContent = 'center';
                viewport.style.flex = '1 1 0';
                viewport.style.minHeight = '0';
                viewport.style.maxHeight = '100%';
                viewport.style.height = '';
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
            if (tslAuthorPrintLayout() || root.getAttribute('data-tsl-print-all') === '1') {
                root.setAttribute('data-tsl-page-fit', 'native');
                state.scaling = true;
                try {
                    clearPagerStageStyles();
                    applyNativePrintSizePolicy();
                } finally {
                    state.scaling = false;
                }
                return;
            }
            var fit = getPageFit();
            root.setAttribute('data-tsl-page-fit', fit);
            state.scaling = true;
            try {
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
            var scaledH = layout.h * s;
            var viewCap = readerBrowserViewportHeightPx();
            if (viewCap > 0 && scaledH > viewCap + 1) {
                s = Math.min(s, viewCap / layout.h);
            }
            root.removeAttribute('data-tsl-scale-unreasonable');
                root.removeAttribute('data-tsl-stage-cramped');
                applyStepTransform(current, layout, s, { lockHeight: true, stageHeight: avail.h });
            } finally {
                state.scaling = false;
                var sz = pagerStageSize();
                state.stageW = sz.w;
                state.stageH = sz.h;
            }
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
            if (state.scaling) {
                return;
            }
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (state.scaling) {
                    return;
                }
                var sz = pagerStageSize();
                if (state.stageW >= 0
                    && Math.abs(sz.w - state.stageW) < 3
                    && Math.abs(sz.h - state.stageH) < 3) {
                    return;
                }
                refresh();
            }, 160);
        }
        window.addEventListener('resize', schedulePagerRefresh);
        window.addEventListener('orientationchange', schedulePagerRefresh);

        if (typeof ResizeObserver !== 'undefined') {
            var pagerResizeObs = new ResizeObserver(schedulePagerRefresh);
            var fitObsEl = fitContainerEl();
            if (fitObsEl) {
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

        function preparePagerForPrint() {
            if (state.scaleRaf) {
                cancelAnimationFrame(state.scaleRaf);
                state.scaleRaf = 0;
            }
            root.setAttribute('data-tsl-page-fit', 'native');
            root.setAttribute('data-tsl-print-all', '1');
            clearPagerStageStyles();
            applyNativePrintSizePolicy();
        }

        root._tslPagerRefresh = refresh;
        root._tslPagerClearStage = clearPagerStageStyles;
        root._tslPagerPreparePrint = preparePagerForPrint;
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

    function normalizeTslParsed(parsed) {
        if (!parsed || !parsed.header) {
            return null;
        }
        if (parsed.blocks) {
            return parsed;
        }
        if (parsed.document && parsed.document.blocks) {
            return { header: parsed.header, blocks: parsed.document.blocks };
        }
        return null;
    }

    function render(mount, parsed) {
        parsed = normalizeTslParsed(parsed);
        if (!parsed) {
            return null;
        }
        var header = parsed.header;
        var blocks = parsed.blocks;
        ensureHeadingNumbers(blocks, header);
        var page = header.page;
        var ty = header.typography;
        var layoutMode = layoutModeForDocument(header, blocks);
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
        root.style.setProperty('--tsl-row-gap', (page.rowGapMM != null ? page.rowGapMM : 2) + 'mm');

        var pagesEl = document.createElement('div');
        pagesEl.className = 'tsl-pages';
        var measurePage = document.createElement('section');
        measurePage.className = 'tsl-page';
        measurePage.setAttribute('data-tsl-side', 'any');
        measurePage.setAttribute('aria-hidden', 'true');
        measurePage.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;';
        var measureHeaderSlot = document.createElement('div');
        measureHeaderSlot.className = 'tsl-measure-chrome';
        var measureBody = document.createElement('div');
        measureBody.className = 'tsl-body';
        measureBody.style.flex = '1 1 auto';
        measureBody.style.minHeight = '0';
        measureBody.style.overflow = 'visible';
        var measureFooterSlot = document.createElement('div');
        measureFooterSlot.className = 'tsl-measure-chrome';
        measurePage.appendChild(measureHeaderSlot);
        measurePage.appendChild(measureBody);
        measurePage.appendChild(measureFooterSlot);
        root.appendChild(measurePage);
        mount.innerHTML = '';
        mount.appendChild(root);
        applyReadingPrefs(root);
        var headerState = { any: null, left: null, right: null };
        var footerState = { any: null, left: null, right: null };
        blocks.forEach(function (b) {
            if (!b || !b.type) {
                return;
            }
            if (b.type === 'pageheader') {
                headerState[blockChromeSide(b)] = b;
            }
            if (b.type === 'pagefooter') {
                footerState[blockChromeSide(b)] = b;
            }
        });

        function copySideChromeState(state) {
            return { any: state.any, left: state.left, right: state.right };
        }

        /** Effective running chrome after each block index (seeded from whole document, then updated in order). */
        function buildRunningChromeTimeline(blockList) {
            var h = { any: null, left: null, right: null };
            var f = { any: null, left: null, right: null };
            blockList.forEach(function (b) {
                if (!b || !b.type) {
                    return;
                }
                if (b.type === 'pageheader') {
                    h[blockChromeSide(b)] = b;
                }
                if (b.type === 'pagefooter') {
                    f[blockChromeSide(b)] = b;
                }
            });
            var timeline = [];
            var i;
            h = copySideChromeState(h);
            f = copySideChromeState(f);
            for (i = 0; i < blockList.length; i += 1) {
                var blk = blockList[i];
                if (blk && blk.type === 'pageheader') {
                    h[blockChromeSide(blk)] = blk;
                }
                if (blk && blk.type === 'pagefooter') {
                    f[blockChromeSide(blk)] = blk;
                }
                timeline[i] = { header: copySideChromeState(h), footer: copySideChromeState(f) };
            }
            return timeline;
        }

        var runningChromeTimeline = buildRunningChromeTimeline(blocks);
        var bi = 0;

        function refreshCurrentPageChrome() {
            if (!current || current.fullBleed) {
                return;
            }
            current.header = pickSide(headerState, current.side);
            current.footer = pickSide(footerState, current.side);
        }

        function applyRunningChromeFromTimeline(pg) {
            if (!pg || pg.fullBleed) {
                return;
            }
            var idx = typeof pg.endBlockIndex === 'number' ? pg.endBlockIndex : (blocks.length - 1);
            idx = Math.max(0, Math.min(blocks.length - 1, idx));
            var snap = runningChromeTimeline[idx] || runningChromeTimeline[blocks.length - 1];
            if (!snap) {
                pg.header = pickSide(headerState, pg.side);
                pg.footer = pickSide(footerState, pg.side);
                return;
            }
            pg.header = pickSide(snap.header, pg.side);
            pg.footer = pickSide(snap.footer, pg.side);
        }
        var physical = 0;
        var pages = [];
        var values = mergeFieldValues(header);
        var readMode = header.readMode !== false;
        var runningHeader = '';
        var blockRenderCtx = { allBlocks: blocks, header: header };

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
                endBlockIndex: typeof bi === 'number' ? Math.max(0, bi) : 0,
                body: document.createElement('div')
            };
            pg.body.className = 'tsl-body';
            pages.push(pg);
            applyRunningChromeFromTimeline(pg);
            return pg;
        }

        function collectPageHeadingTexts(body) {
            var texts = [];
            body.querySelectorAll('.tsl-block--title, .tsl-block--h1, .tsl-block--h2, .tsl-block--h3').forEach(function (el) {
                var t = (el.textContent || '').trim();
                if (t) {
                    texts.push(t);
                }
            });
            return texts;
        }

        /** Verso: first heading on page; recto: last; otherwise carry from prior pages. */
        function resolveRunningHeadersOnPages(pageList) {
            var carry = '';
            pageList.forEach(function (pg) {
                var headings = collectPageHeadingTexts(pg.body);
                if (headings.length) {
                    if (pg.side === 'left') {
                        pg.resolvedRunningHeader = headings[0];
                    } else if (pg.side === 'right') {
                        pg.resolvedRunningHeader = headings[headings.length - 1];
                    } else {
                        pg.resolvedRunningHeader = headings[headings.length - 1];
                    }
                    carry = headings[headings.length - 1];
                } else {
                    pg.resolvedRunningHeader = carry;
                }
            });
        }

        function pageFieldRunningHeader(pg) {
            if (pg && pg.resolvedRunningHeader) {
                return pg.resolvedRunningHeader;
            }
            return runningHeader;
        }

        var current = null;
        var mmPx = 96 / 25.4;

        /** Body budget: trim page minus header/footer chrome (footer is the floor for flow). */
        function syncMeasurePageForSide(side, pg) {
            var s = side || (pg && pg.side) || (current && current.side) || 'any';
            measurePage.setAttribute('data-tsl-side', s);
            measurePage.style.width = pageTrimWidthPx() + 'px';
            measurePage.style.height = page.trimMM.height + 'mm';
            measurePage.style.minHeight = page.trimMM.height + 'mm';
            measurePage.style.maxHeight = page.trimMM.height + 'mm';
            measureHeaderSlot.innerHTML = '';
            measureFooterSlot.innerHTML = '';
            var draftCtx = {
                values: values,
                runningHeader: runningHeader,
                pageNo: pg && pg.pageNo != null ? pg.pageNo : 1,
                side: s,
                pageCount: 1
            };
            var hdr = (pg && pg.header) || pickSide(headerState, s);
            var ftr = (pg && pg.footer) || pickSide(footerState, s);
            if (hdr) {
                measureHeaderSlot.appendChild(renderRegion(hdr, 'header', page.headerRule, draftCtx, readMode));
            }
            if (ftr) {
                measureFooterSlot.appendChild(renderRegion(ftr, 'footer', page.footerRule, draftCtx, readMode));
            }
            var innerW = pageBodyInnerWidthPx(s);
            measureBody.style.width = innerW + 'px';
            measureBody.style.maxWidth = innerW + 'px';
        }

        function measureBodyBudgetPx(side, pg) {
            syncMeasurePageForSide(side, pg);
            measureBody.innerHTML = '';
            return Math.max(80, measureBody.clientHeight);
        }

        function prepareMeasureBodyStack(side, pg) {
            syncMeasurePageForSide(side, pg);
            measureBody.innerHTML = '';
            var budget = Math.max(80, measureBody.clientHeight);
            var stack = document.createElement('div');
            stack.className = 'tsl-measure-stack';
            stack.style.width = '100%';
            stack.style.height = 'auto';
            measureBody.appendChild(stack);
            return { budget: budget, stack: stack };
        }

        /** True when existing page body plus optional row fits above the page footer. */
        function fitsOnPage(pg, extraRow) {
            if (!pg) {
                return true;
            }
            var shell = prepareMeasureBodyStack(pg.side, pg);
            Array.prototype.forEach.call(pg.body.childNodes, function (node) {
                shell.stack.appendChild(node.cloneNode(true));
            });
            if (extraRow) {
                shell.stack.appendChild(extraRow.cloneNode(true));
            }
            return shell.stack.scrollHeight <= shell.budget + 1;
        }

        function measureRowHeight(row, side, pg) {
            var shell = prepareMeasureBodyStack(side, pg);
            shell.stack.appendChild(row.cloneNode(true));
            return shell.stack.scrollHeight;
        }

        function pageTrimWidthPx() {
            return Math.max(120, parseCssLengthToPx(root, page.trimMM.width + 'mm'));
        }

        function pageBodyInnerWidthPx(side) {
            var trim = pageTrimWidthPx();
            var out = parseCssLengthToPx(root, page.marginsMM.outside + 'mm');
            var gut = parseCssLengthToPx(root, page.marginsMM.gutter + 'mm');
            if (side === 'left') {
                return Math.max(120, trim - out - gut);
            }
            if (side === 'right') {
                return Math.max(120, trim - gut - out);
            }
            return Math.max(120, trim - out - out);
        }

        function measurePageContentWidthPx(side) {
            if (layoutMode === 'pages' || tslAuthorPrintLayout() || getPageFit() === 'native') {
                return pageBodyInnerWidthPx(side || (current && current.side) || 'any');
            }
            var nominal = pageTrimWidthPx();
            var mount = root.closest('[data-tsl-mount]') || root.parentElement;
            var mountW = mount && mount.clientWidth ? mount.clientWidth : 0;
            var scaledNominal = nominal * paginationReaderScale();
            if (mountW > 0) {
                return Math.max(120, Math.min(scaledNominal, mountW));
            }
            return Math.max(120, scaledNominal);
        }

        function ensurePage() {
            if (!current) {
                current = startPage();
            }
        }

        function appendBlockToColumn(col, b) {
            var type = b.type;
            if (type === 'bullet' || type === 'todo') {
                var listType = type === 'todo' ? 'todo' : resolveBlockRules(b).props.bulletStyle;
                var ul = col.querySelector('.tsl-list[data-list-type="' + listType + '"]');
                if (!ul) {
                    ul = document.createElement(type === 'todo' ? 'ul' : bulletListTag(listType));
                    ul.className = 'tsl-list' + (type === 'todo' ? ' tsl-list--todo' : '');
                    ul.setAttribute('data-list-type', listType);
                    if (type === 'bullet') {
                        applyBlockRules(ul, { type: 'bullet', bulletStyle: listType });
                    }
                    col.appendChild(ul);
                }
                ul.appendChild(applyBlockRules(renderListItem(b, type), b));
                return;
            }
            col.appendChild(renderBlock(b, blockRenderCtx));
        }

        function cloneBlockShallow(b) {
            var c = {};
            Object.keys(b).forEach(function (k) {
                c[k] = b[k];
            });
            return c;
        }

        /**
         * One page fragment of a split block. Non-first fragments are continuations:
         * no drop cap (so no studio-has-dropcap flag) and tsl-block--continued (tsl.css
         * drops the first-line indent there).
         */
        function fragmentBlock(b, startSegment, inlineHtmlText) {
            var c = cloneBlockShallow(b);
            if (inlineHtmlText) {
                c._tslInlineHtml = true;
            }
            if (startSegment > 0) {
                c.dropCap = null;
                c._tslContinued = true;
            }
            return c;
        }

        function blockTypeIsSplittable(b) {
            if (!b || !b.type) {
                return false;
            }
            if (b.type === 'code') {
                return true;
            }
            return b.type === 'paragraph' || b.type === 'quote' || b.type === 'aside'
                || b.type === 'title' || b.type === 'h1' || b.type === 'h2' || b.type === 'h3';
        }

        function appendSplittableSegments(b, rowClass, segments, joinFn, inlineHtmlText) {
            if (!segments.length) {
                ensurePage();
                current.body.appendChild(buildFlowRow([b], rowClass));
                return;
            }
            var si = 0;
            while (si < segments.length) {
                ensurePage();
                while (current.body.childNodes.length && !fitsOnPage(current, null)) {
                    current = startPage();
                }
                var remain = segments.length - si;
                var lo = 1;
                var hi = remain;
                var best = 0;
                while (lo <= hi) {
                    var mid = Math.floor((lo + hi) / 2);
                    var trial = fragmentBlock(b, si, inlineHtmlText);
                    trial.text = joinFn(segments.slice(si, si + mid));
                    var trialRow = buildFlowRow([trial], rowClass);
                    if (fitsOnPage(current, trialRow)) {
                        best = mid;
                        lo = mid + 1;
                    } else {
                        hi = mid - 1;
                    }
                }
                if (best < 1) {
                    if (current.body.childNodes.length) {
                        // Nothing fits here: re-measure this fragment on a fresh page instead
                        // of forcing a one-word fragment (which would drop a cap on one word).
                        current = startPage();
                        continue;
                    }
                    best = 1;
                }
                var chunkBlock = fragmentBlock(b, si, inlineHtmlText);
                chunkBlock.text = joinFn(segments.slice(si, si + best));
                current.body.appendChild(buildFlowRow([chunkBlock], rowClass));
                si += best;
            }
        }

        function appendSplittableTextBlock(b, rowClass) {
            if (b.type === 'code') {
                appendSplittableSegments(b, rowClass, String(b.text || '').split('\n'), function (lines) {
                    return lines.join('\n');
                });
                return;
            }
            // Split at word boundaries but carry the inline HTML runs (bold, italic, links…).
            var src = inlineWordRanges(blockInlineHtml(b));
            if (!src.words.length) {
                ensurePage();
                current.body.appendChild(buildFlowRow([b], rowClass));
                return;
            }
            appendSplittableSegments(b, rowClass, src.words, function (words) {
                return sliceInlineWords(src.root, words[0], words[words.length - 1]);
            }, true);
        }

        function buildFlowRow(blocksInRow, rowClass) {
            var row = document.createElement('div');
            row.className = 'tsl-row tsl-row--' + rowClass;
            blocksInRow.forEach(function (pb) {
                var col = document.createElement('div');
                col.className = 'tsl-col';
                appendBlockToColumn(col, pb);
                row.appendChild(col);
            });
            return row;
        }

        function appendFlowRow(blocksInRow, rowClass) {
            if (blocksInRow.length === 1 && blockTypeIsSplittable(blocksInRow[0])) {
                appendSplittableTextBlock(blocksInRow[0], rowClass);
                if (current) {
                    current.endBlockIndex = bi;
                }
                return;
            }
            ensurePage();
            var row = buildFlowRow(blocksInRow, rowClass);
            while (current.body.childNodes.length && !fitsOnPage(current, row)) {
                current = startPage();
            }
            if (current) {
                current.endBlockIndex = bi;
            }
            current.body.appendChild(row);
        }

        function measureTocNavRowHeight(block, entries, pageByBlockId, side) {
            var nav = buildTocNavElement(block, entries, pageByBlockId);
            var row = document.createElement('div');
            row.className = 'tsl-row tsl-row--full';
            var col = document.createElement('div');
            col.className = 'tsl-col';
            col.appendChild(nav);
            row.appendChild(col);
            return measureRowHeight(row, side || (current && current.side) || 'any', current);
        }

        function appendTocNavRowToPage(block, entries, pageByBlockId) {
            var nav = buildTocNavElement(block, entries, pageByBlockId);
            var row = document.createElement('div');
            row.className = 'tsl-row tsl-row--full';
            var col = document.createElement('div');
            col.className = 'tsl-col';
            col.appendChild(nav);
            row.appendChild(col);
            current.body.appendChild(row);
        }

        /** Split long TOC lists across pages (matches Studio print pagination). */
        function appendPaginatedTocBlock(b) {
            var allEntries = collectTocEntries(blocks, b);
            if (!allEntries.length) {
                ensurePage();
                current.tocSlice = { block: b, start: 0, end: 0 };
                appendTocNavRowToPage(b, [], null);
                return;
            }
            var dummyPageBy = {};
            allEntries.forEach(function (e) {
                dummyPageBy[e.id] = 888;
            });
            var entryIdx = 0;
            while (entryIdx < allEntries.length) {
                ensurePage();
                if (current.body.childNodes.length > 0) {
                    current = startPage();
                }
                var maxH = measureBodyBudgetPx(current.side, current);
                var remain = allEntries.length - entryIdx;
                var best = entryIdx + 1;
                for (var n = 1; n <= remain; n += 1) {
                    var trySlice = allEntries.slice(entryIdx, entryIdx + n);
                    var tryBy = {};
                    trySlice.forEach(function (e) {
                        tryBy[e.id] = dummyPageBy[e.id];
                    });
                    var h = measureTocNavRowHeight(b, trySlice, tryBy, current.side);
                    if (h > maxH) {
                        break;
                    }
                    best = entryIdx + n;
                }
                var chunk = allEntries.slice(entryIdx, best);
                appendTocNavRowToPage(b, chunk, null);
                current.tocSlice = { block: b, start: entryIdx, end: best };
                entryIdx = best;
            }
        }

        while (bi < blocks.length) {
            var b = blocks[bi];
            if (!b || !b.type) {
                bi += 1;
                continue;
            }
            var type = b.type;
            if (type === 'pageheader') {
                headerState[blockChromeSide(b)] = b;
                ensurePage();
                current.endBlockIndex = bi;
                refreshCurrentPageChrome();
                applyRunningChromeFromTimeline(current);
                bi += 1;
                continue;
            }
            if (type === 'pagefooter') {
                footerState[blockChromeSide(b)] = b;
                ensurePage();
                current.endBlockIndex = bi;
                refreshCurrentPageChrome();
                applyRunningChromeFromTimeline(current);
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
            if (type === 'toc') {
                appendPaginatedTocBlock(b);
                bi += 1;
                continue;
            }
            if (type === 'image-index' || type === 'manuscript-title') {
                appendFlowRow([b], 'full');
                var markerPage = pages[pages.length - 1];
                if (markerPage && type === 'image-index') {
                    markerPage.imageIndexBlock = b;
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
                if (ht) {
                    runningHeader = ht;
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
        pages.forEach(function (pg) {
            applyRunningChromeFromTimeline(pg);
        });
        resolveRunningHeadersOnPages(pages);
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
                runningHeader: pageFieldRunningHeader(pg)
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
        syncMountHostLayout(mount);
        return root;
    }

    var READER_PREFS_KEY = 'reader:prefs';
    var TSL_LAYOUT_KEY = 'tsl:layout';
    var READER_SIZES = [14, 16, 18, 20, 24];
    var READER_DEFAULT_PREFS = { font: 'serif', size: 18, theme: 'light', width: 'medium', pageFit: 'fit' };
    var READER_FONT_STACK = {
        serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif',
        sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    };
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
                if (typeof root._tslPagerPreparePrint === 'function') {
                    root._tslPagerPreparePrint();
                } else if (typeof root._tslPagerClearStage === 'function') {
                    root._tslPagerClearStage();
                }
            });
        });
        window.addEventListener('afterprint', function () {
            document.documentElement.removeAttribute('data-tsl-printing');
            if (document.querySelectorAll) {
                document.querySelectorAll('.tsl-root[data-tsl-print-all]').forEach(function (root) {
                    root.removeAttribute('data-tsl-print-all');
                });
            }
            rerenderAllTslMounts();
        });
    }

    function ensureLeanBackupFromParsed(readerArticle, parsed) {
        if (!readerArticle || readerArticle._tslLeanBackup || !parsed) {
            return;
        }
        var tmp = document.createElement('div');
        mountLeanHtml(tmp, parsed);
        readerArticle._tslLeanBackup = tmp.innerHTML;
    }

    function restoreLeanScrollWrap(wrap, readerArticle) {
        if (!wrap) {
            return null;
        }
        wrap.classList.remove('tsl-reader-player-mount');
        wrap.removeAttribute('data-tsl-mount');
        if (readerArticle._tslLeanBackup) {
            wrap.innerHTML = readerArticle._tslLeanBackup;
        } else if (readerArticle._tslParsedEnvelope) {
            mountLeanHtml(wrap, readerArticle._tslParsedEnvelope);
        }
        return findTslLeanArticle(wrap);
    }

    function layoutModeForDocument(header, blocks) {
        /* render() is only used for paginated output; measure/breaks must use page trim. */
        return 'pages';
    }

    function remountTslMount(mount, parsed) {
        parsed = normalizeTslParsed(parsed);
        if (!mount || !parsed) {
            return null;
        }
        mount._tslParsed = parsed;
        stampTslReadingCapabilities(parsed.header, mount);
        if (getTslLayout() === 'scroll') {
            return mountLeanHtml(mount, parsed);
        }
        return render(mount, parsed);
    }

    function tslHeaderAllowsScroll(header) {
        if (!header || header.allowScrollMode === undefined) {
            return true;
        }
        return header.allowScrollMode !== false;
    }

    function getActiveTslHeader() {
        if (typeof document === 'undefined' || !document.querySelector) {
            return null;
        }
        var mount = document.querySelector('[data-tsl-mount]');
        if (mount && mount._tslParsed && mount._tslParsed.header) {
            return mount._tslParsed.header;
        }
        var art = document.querySelector('[data-reader-article]');
        if (art && art._tslParsedEnvelope && art._tslParsedEnvelope.header) {
            return art._tslParsedEnvelope.header;
        }
        if (art && art.getAttribute('data-tsl-allow-scroll') === '0') {
            return { allowScrollMode: false };
        }
        var lean = document.querySelector('[data-tsl-header-b64]');
        if (lean && typeof leanHtmlToEnvelope === 'function') {
            try {
                return leanHtmlToEnvelope(lean.outerHTML).header;
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    function getTslReadingCapabilities(header) {
        return { allowScrollMode: tslHeaderAllowsScroll(header || getActiveTslHeader()) };
    }

    function stampTslReadingCapabilities(header, root) {
        var allow = tslHeaderAllowsScroll(header);
        var flag = allow ? '1' : '0';
        var art = null;
        if (root) {
            if (root.matches && root.matches('[data-reader-article]')) {
                art = root;
            } else if (root.closest) {
                art = root.closest('[data-reader-article]');
            }
            if (root.setAttribute) {
                root.setAttribute('data-tsl-allow-scroll', flag);
            }
        }
        if (art) {
            art.setAttribute('data-tsl-allow-scroll', flag);
            if (!allow && art.getAttribute('data-tsl-layout') === 'scroll') {
                art.setAttribute('data-tsl-layout', 'pages');
            }
            var shell = art.querySelector('.document-tsl');
            if (shell) {
                shell.setAttribute('data-tsl-allow-scroll', flag);
            }
        }
        if (!allow && loadStored(TSL_LAYOUT_KEY, 'pages') === 'scroll') {
            saveStored(TSL_LAYOUT_KEY, 'pages');
        }
    }

    function getTslLayout() {
        if (!getTslReadingCapabilities().allowScrollMode) {
            return 'pages';
        }
        var stored = loadStored(TSL_LAYOUT_KEY, 'pages') === 'scroll' ? 'scroll' : 'pages';
        if (typeof document !== 'undefined' && document.querySelector) {
            var readerArticle = document.querySelector('[data-reader-article][data-tsl-layout]');
            if (readerArticle) {
                var owned = readerArticle.getAttribute('data-tsl-layout');
                if (owned === 'scroll' || owned === 'pages') {
                    return owned;
                }
            }
        }
        return stored;
    }

    function readerSizeScale(sizePx) {
        var n = parseInt(sizePx, 10);
        if (READER_SIZES.indexOf(n) < 0) {
            n = 18;
        }
        return n / 18;
    }

    function readerFontStack(fontId) {
        if (fontId === 'sans') {
            return READER_FONT_STACK.sans;
        }
        if (fontId === 'mono') {
            return READER_FONT_STACK.mono;
        }
        return READER_FONT_STACK.serif;
    }

    /** Apply reader font + size scale; overrides document --tsl-doc-font on paginated roots. */
    function stampReaderTypography(el, prefs, scale) {
        if (!el || !el.style) {
            return;
        }
        var p = prefs || getReadingPrefs();
        var font = p.font || 'serif';
        el.setAttribute('data-tsl-reader-font', font);
        el.setAttribute('data-tsl-reader-size', String(p.size || 18));
        el.style.setProperty('--tsl-font', readerFontStack(font));
        el.style.setProperty('--tsl-reader-scale', String(scale));
    }

    function tslAuthorPrintLayout() {
        return typeof document !== 'undefined'
            && document.documentElement
            && document.documentElement.hasAttribute('data-tsl-printing');
    }

    function paginationReaderScale() {
        if (tslAuthorPrintLayout()) {
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
                remountTslMount(mount, mount._tslParsed);
            }
        });
    }

    function applyReadingPrefs(root) {
        if (!root) {
            return;
        }
        var p = getReadingPrefs();
        var layout = getTslLayout();
        stampReaderTypography(root, p, paginationReaderScale());
        root.setAttribute('data-tsl-reader-theme', p.theme || 'light');
        root.setAttribute('data-tsl-reader-width', p.width || 'medium');
        root.setAttribute('data-tsl-layout', layout);
        root.setAttribute('data-tsl-page-fit', tslAuthorPrintLayout() ? 'native' : getPageFit());
        if (layout === 'pages' && typeof root._tslPagerRefresh === 'function') {
            root._tslPagerRefresh();
        }
    }

    function refreshAllReadingPrefs(relayout) {
        if (relayout) {
            document.querySelectorAll('[data-tsl-mount]').forEach(function (mount) {
                if (mount._tslParsed) {
                    remountTslMount(mount, mount._tslParsed);
                }
            });
        } else {
            document.querySelectorAll('.tsl-root').forEach(applyReadingPrefs);
        }
        document.querySelectorAll('.studio-lean-tsl, article.studio-lean-article[data-tsl-w-mm]').forEach(applyLeanReadingPrefs);
    }

    /**
     * Which reader prefs apply to the current layout. Pages are fixed print trim (the
     * spec's page format), so line width only applies to the reflowable scroll layout;
     * page size (fit / fit screen / actual) only applies to pages.
     */
    function readingPrefApplies(key, layout) {
        var l = layout || getTslLayout();
        if (key === 'width') {
            return l === 'scroll';
        }
        if (key === 'pageFit') {
            return l === 'pages';
        }
        if (key === 'layout') {
            return getTslReadingCapabilities().allowScrollMode;
        }
        return true;
    }

    /** Tell hosts (lab chrome, reader shell) that reading prefs changed. */
    function notifyReadingPrefs(key) {
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function' || !document.dispatchEvent) {
            return;
        }
        document.dispatchEvent(new CustomEvent('tsl:readingprefs', {
            detail: { key: key || null, prefs: getReadingPrefs(), layout: getTslLayout() }
        }));
    }

    function setReadingPref(key, value) {
        setReadingPrefInner(key, value);
        notifyReadingPrefs(key);
    }

    function setReadingPrefInner(key, value) {
        if (key === 'layout') {
            if (value === 'scroll' && !getTslReadingCapabilities().allowScrollMode) {
                return;
            }
            saveStored(TSL_LAYOUT_KEY, value === 'scroll' ? 'scroll' : 'pages');
            refreshAllReadingPrefs(true);
            return;
        }
        if (key === 'pageFit') {
            var pf = getReadingPrefs();
            pf.pageFit = value === 'native' || value === 'scale' ? value : 'fit';
            saveStored(READER_PREFS_KEY, pf);
            refreshAllReadingPrefs(false);
            return;
        }
        var p = getReadingPrefs();
        if (key === 'size') {
            p.size = parseInt(value, 10);
        } else {
            p[key] = value;
        }
        saveStored(READER_PREFS_KEY, p);
        if (getTslLayout() === 'scroll') {
            refreshAllReadingPrefs(false);
            return;
        }
        if (key === 'theme') {
            refreshAllReadingPrefs(false);
        } else if (key === 'width') {
            // Line width does not apply to fixed-trim pages (readingPrefApplies); no relayout.
            refreshAllReadingPrefs(false);
        } else if (key === 'size' || key === 'font') {
            refreshAllReadingPrefs(true);
        } else {
            refreshAllReadingPrefs(false);
        }
    }

    function resetReadingPrefs() {
        saveStored(READER_PREFS_KEY, READER_DEFAULT_PREFS);
        saveStored(TSL_LAYOUT_KEY, 'pages');
        refreshAllReadingPrefs(true);
        notifyReadingPrefs(null);
    }

    function syncReadingPrefsUI(container) {
        if (!container) {
            return;
        }
        var p = getReadingPrefs();
        var layout = getTslLayout();
        var caps = getTslReadingCapabilities();
        container.querySelectorAll('[data-tsl-layout-row]').forEach(function (row) {
            row.hidden = !caps.allowScrollMode;
        });
        container.querySelectorAll('[data-tsl-pref]').forEach(function (b) {
            var key = b.getAttribute('data-tsl-pref');
            var cur = key === 'layout' ? layout : (key === 'size' ? String(p.size)
                : (key === 'pageFit' ? getPageFit() : p[key]));
            var on = b.getAttribute('data-value') === cur;
            var applies = readingPrefApplies(key, layout);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.classList.toggle('is-on', on);
            b.disabled = !applies;
            if (applies) {
                b.removeAttribute('aria-disabled');
            } else {
                b.setAttribute('aria-disabled', 'true');
            }
        });
        /* Rows that name a pref (data-tsl-pref-row="width") show they are unavailable in this layout. */
        container.querySelectorAll('[data-tsl-pref-row]').forEach(function (row) {
            var applies = readingPrefApplies(row.getAttribute('data-tsl-pref-row'), layout);
            row.toggleAttribute('data-tsl-unavailable', !applies);
            row.setAttribute('aria-disabled', applies ? 'false' : 'true');
            row.querySelectorAll('[data-tsl-pref-note]').forEach(function (note) {
                note.hidden = applies;
            });
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

    function runningChromeSlotText(block, slot) {
        if (!block) {
            return '';
        }
        var key = slot === 'left' ? 'textLeft' : (slot === 'center' ? 'textCenter' : 'textRight');
        var raw = block[key];
        if (raw == null || String(raw) === '') {
            if (slot === 'center' && block.text) {
                raw = block.text;
            }
        }
        return raw != null ? String(raw) : '';
    }

    function renderRegion(block, kind, rule, ctx, readMode) {
        var el = document.createElement('div');
        el.className = 'tsl-region tsl-region--' + kind;
        if (rule) {
            el.setAttribute('data-tsl-rule', '1');
        }
        ['left', 'center', 'right'].forEach(function (slot) {
            var span = document.createElement('span');
            span.className = 'tsl-region-slot tsl-region-slot--' + slot;
            span.textContent = resolveFields(runningChromeSlotText(block, slot), ctx);
            el.appendChild(span);
        });
        return el;
    }

    function plainText(html) {
        var d = document.createElement('div');
        d.innerHTML = inlineHtml(html);
        return (d.textContent || '').trim();
    }

    /**
     * Sanitised inline HTML for a block's text. Page fragments of a split block carry
     * already-converted inline HTML (_tslInlineHtml), so they are sanitised, not re-parsed
     * as markdown.
     */
    function blockInlineHtml(b) {
        if (b && b._tslInlineHtml) {
            return sanitizeInlineHtmlFragment(String(b.text || ''));
        }
        return inlineHtml(b && b.text);
    }

    function blockPlainText(b) {
        var d = document.createElement('div');
        d.innerHTML = blockInlineHtml(b);
        return (d.textContent || '').trim();
    }

    /**
     * Word boundaries over inline HTML: each word is a text-node range; a word that runs
     * across inline elements (e.g. **dis**parate) stays one word, so a split never breaks it.
     */
    function inlineWordRanges(html) {
        var root = document.createElement('div');
        root.innerHTML = html;
        var words = [];
        var gap = true;
        (function walk(node) {
            Array.prototype.forEach.call(node.childNodes, function (child) {
                if (child.nodeType === 3) {
                    var v = child.nodeValue;
                    var re = /\S+/g;
                    var m;
                    var last = 0;
                    while ((m = re.exec(v))) {
                        var joined = !gap && m.index === 0 && words.length;
                        if (joined) {
                            words[words.length - 1].endNode = child;
                            words[words.length - 1].end = m.index + m[0].length;
                        } else {
                            words.push({ node: child, start: m.index, endNode: child, end: m.index + m[0].length });
                        }
                        gap = false;
                        last = m.index + m[0].length;
                    }
                    if (last < v.length) {
                        gap = true;
                    }
                } else if (child.nodeType === 1) {
                    if (child.tagName.toLowerCase() === 'br') {
                        gap = true;
                    } else {
                        walk(child);
                    }
                }
            });
        })(root);
        return { root: root, words: words };
    }

    /** Inline HTML for words[first..last] (partial ancestors cloned, so formatting is kept). */
    function sliceInlineWords(root, first, last) {
        var range = document.createRange();
        range.setStart(first.node, first.start);
        range.setEnd(last.endNode, last.end);
        var d = document.createElement('div');
        d.appendChild(range.cloneContents());
        return d.innerHTML;
    }

    /** Remove the first n characters of text from an inline DOM (drop-cap letters). */
    function removeLeadingTextChars(root, n) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var t;
        while (n > 0 && (t = walker.nextNode())) {
            var len = t.nodeValue.length;
            t.nodeValue = t.nodeValue.slice(Math.min(n, len));
            n -= len;
        }
    }

    function renderListItem(b, type) {
        var li = document.createElement('li');
        if (type === 'todo') {
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.disabled = true;
            var todoChecked = resolveBlockRules(b).props.checked;
            cb.checked = todoChecked;
            li.appendChild(cb);
            var span = document.createElement('span');
            span.innerHTML = inlineHtml(b.text);
            if (todoChecked) {
                span.className = 'tsl-done';
            }
            li.appendChild(span);
        } else {
            li.innerHTML = inlineHtml(b.text);
        }
        return li;
    }

    function normaliseTocMaxLevel(block) {
        return blockRuleProp(block, 'toc', 'maxLevel');
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

    function appendTocEntryToList(ul, block, entry, pageByBlockId) {
        var leader = blockRuleProp(block, 'toc', 'leader');
        var li = document.createElement('li');
        li.className = 'studio-lean-toc-item studio-lean-toc-item--h' + entry.level;
        var a = document.createElement('a');
        a.className = 'studio-lean-toc-link';
        a.href = '#' + headingAnchorId({ id: entry.id });
        var label = document.createElement('span');
        label.className = 'studio-lean-toc-label';
        label.textContent = entry.text;
        a.appendChild(label);
        if (leader !== '') {
            var fill = document.createElement('span');
            fill.className = 'studio-lean-toc-leader';
            fill.setAttribute('aria-hidden', 'true');
            fill.textContent = leader.repeat(40);
            a.appendChild(fill);
        }
        if (pageByBlockId && pageByBlockId[entry.id] != null) {
            var pgEl = document.createElement('span');
            pgEl.className = 'studio-lean-toc-page';
            pgEl.textContent = String(pageByBlockId[entry.id]);
            a.appendChild(pgEl);
        }
        li.appendChild(a);
        ul.appendChild(li);
        return li;
    }

    function buildTocNavElement(block, entries, pageByBlockId) {
        var nav = document.createElement('nav');
        nav.className = 'tsl-toc studio-lean-toc';
        nav.setAttribute('aria-label', 'Table of contents');
        if (!entries.length) {
            var empty = document.createElement('p');
            empty.className = 'studio-lean-toc-empty';
            empty.textContent = 'No headings to include.';
            nav.appendChild(empty);
        } else {
            var ul = document.createElement('ul');
            ul.className = 'studio-lean-toc-list';
            entries.forEach(function (e) {
                appendTocEntryToList(ul, block, e, pageByBlockId);
            });
            nav.appendChild(ul);
        }
        stampBlockMeta(nav, block);
        return nav;
    }

    function refreshIndexBlocksInPages(pages, blocks) {
        if (!pages.length) {
            return;
        }
        var pageByBlockId = indexHeadingPageNumbers(pages);
        var imagePageById = indexImagePageNumbers(pages);
        pages.forEach(function (pg) {
            if (pg.tocSlice) {
                var tocBlock = pg.tocSlice.block;
                var allEntries = collectTocEntries(blocks, tocBlock);
                var slice = allEntries.slice(pg.tocSlice.start, pg.tocSlice.end);
                replaceIndexNavInPage(
                    pg,
                    '.tsl-toc, .studio-lean-toc',
                    buildTocNavElement(tocBlock, slice, pageByBlockId)
                );
            } else if (pg.tocBlock) {
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
        return buildTocNavElement(block, collectTocEntries(blocks, block), pageByBlockId);
    }

    function renderImageIndexNav(block, blocks, imagePageById) {
        var title = block && block.title ? String(block.title).trim() : 'Image index';
        if (!title) {
            title = 'Image index';
        }
        var leader = blockRuleProp(block, 'image-index', 'leader');
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

    /* -----------------------------------------------------------------------
     * §6.23 Studio extension blocks (screenplay, stage, MathML).
     * Text types render paragraph-like (spec: v1 readers may) with a per-type class;
     * presentation comes from TSL_BLOCK_RULES flags and tsl.css. Type and all
     * properties stay on the block, so .tsl round-trip is untouched.
     * --------------------------------------------------------------------- */
    var TSL_EXT_TEXT_TYPE_RE = /^(script-(scene|action|character|dialogue|parenthetical|transition|shot)|stage-(scene|action|direction|speech))$/;
    var TSL_EXT_TYPE_RE = /^(script-(scene|action|character|dialogue|parenthetical|transition|shot)|stage-(scene|action|direction|speech)|mathml)$/;
    var TSL_MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
    // Allow-lists mirror Studio block-editor-math.js (sanitizeMathmlSource); src/href/style/on* dropped.
    var TSL_MATHML_TAGS = ('math mrow mi mn mo mtext mspace ms mfrac msqrt mroot mfenced mstyle merror '
        + 'mpadded mphantom menclose msub msup msubsup munder mover munderover mmultiscripts mprescripts none '
        + 'mtable mtr mtd mlabeledtr maligngroup malignmark mstack mlongdiv msgroup msrow mscarries mscarry '
        + 'msline maction semantics annotation annotation-xml').split(' ');
    var TSL_MATHML_ATTRS = ('xmlns display displaystyle mathvariant dir class rowalign columnalign columnspacing '
        + 'rowspacing columnwidth width align lspace rspace stretchy symmetric maxsize minsize open close '
        + 'separators subscriptshift superscriptshift accent accentunder linethickness numalign denomalign '
        + 'bevelled notation selection actiontype encoding').split(' ');

    function isTslExtTextType(type) {
        return TSL_EXT_TEXT_TYPE_RE.test(String(type || ''));
    }

    /** Sanitised <math> markup for a mathml block's source, or '' when absent / invalid. */
    function sanitizeMathmlSource(source, display) {
        var raw = String(source == null ? '' : source).trim();
        if (!raw || typeof DOMParser === 'undefined' || typeof document === 'undefined') {
            return '';
        }
        if (!/<math\b/i.test(raw)) {
            raw = '<math xmlns="' + TSL_MATHML_NS + '">' + raw + '</math>';
        }
        var doc;
        try {
            doc = new DOMParser().parseFromString(raw, 'application/xml');
        } catch (e) {
            return '';
        }
        if (!doc || doc.getElementsByTagName('parsererror').length) {
            return '';
        }
        function clean(el) {
            var local = String(el.localName || '').toLowerCase();
            if (TSL_MATHML_TAGS.indexOf(local) < 0 || (el.namespaceURI && el.namespaceURI !== TSL_MATHML_NS)) {
                return null;
            }
            var out = document.createElementNS(TSL_MATHML_NS, local);
            Array.prototype.forEach.call(el.attributes || [], function (a) {
                var n = String(a.name || '').toLowerCase();
                if (TSL_MATHML_ATTRS.indexOf(n) >= 0 && n !== 'xmlns') {
                    out.setAttribute(n, a.value);
                }
            });
            if (local === 'annotation' || local === 'annotation-xml') {
                out.textContent = el.textContent || '';
                return out;
            }
            for (var c = el.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3) {
                    out.appendChild(document.createTextNode(c.nodeValue));
                } else if (c.nodeType === 1) {
                    var k = clean(c);
                    if (!k) {
                        return null;
                    }
                    out.appendChild(k);
                }
            }
            return out;
        }
        var root = doc.documentElement;
        var safe = root && String(root.localName || '').toLowerCase() === 'math' ? clean(root) : null;
        if (!safe) {
            return '';
        }
        // §6.23 display (ruleset-validated by the caller) sets block vs inline math layout.
        if (display) {
            safe.setAttribute('display', 'block');
        } else {
            safe.removeAttribute('display');
        }
        var box = document.createElement('div');
        box.appendChild(safe);
        return box.innerHTML;
    }

    /** Inner HTML for a §6.23 block; inlineFn renders text fields (paged inlineHtml or lean). */
    function extBlockInnerHtml(block, inlineFn) {
        var type = block.type;
        var props = resolveBlockRules(block).props;
        if (type === 'mathml') {
            var math = sanitizeMathmlSource(block.source, props.display);
            // Unsupported / invalid source: show it as plain text (paragraph-like fallback).
            return math || ('<code class="studio-lean-mathml-source">' + escapeHtml(String(block.source || '')) + '</code>');
        }
        if (type === 'stage-speech') {
            return '<span class="studio-lean-stage-name">' + escapeHtml(String(block.character || '')) + '</span> '
                + '<span class="studio-lean-stage-text">' + inlineFn(block.text || '') + '</span>';
        }
        if (type === 'script-scene' && props.showSceneNumbers) {
            // Studio formatSceneHeadingPlain: the right number falls back to the left one.
            var left = String(block.sceneNumberLeft == null ? '' : block.sceneNumberLeft).trim();
            var right = String(block.sceneNumberRight == null ? '' : block.sceneNumberRight).trim() || left;
            return '<span class="studio-lean-scene-num studio-lean-scene-num--left" data-scene-number="'
                + escapeHtml(left) + '">' + escapeHtml(left) + '</span>'
                + '<span class="studio-lean-scene-text">' + inlineFn(block.text || '') + '</span>'
                + '<span class="studio-lean-scene-num studio-lean-scene-num--right" data-scene-number="'
                + escapeHtml(right) + '">' + escapeHtml(right) + '</span>';
        }
        return inlineFn(block.text || '');
    }

    function extBlockTag(type) {
        return type === 'mathml' ? 'div' : 'p';
    }

    /**
     * Render one block: build its element, then let the spec ruleset map the block's
     * validated properties to CSS rule classes (TSL_BLOCK_RULES → tsl.css).
     */
    function renderBlock(b, ctx) {
        return applyBlockRules(renderBlockElement(b, ctx), b);
    }

    function renderBlockElement(b, ctx) {
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
            var fpInner = document.createElement('div');
            fpInner.className = 'tsl-full-page-inner';
            fpInner.innerHTML = inlineHtml(b.text);
            el.appendChild(fpInner);
            stampBlockMeta(el, b);
            return el;
        }
        if (type === 'toc') {
            el = buildTocNavElement(b, collectTocEntries(ctx && ctx.allBlocks ? ctx.allBlocks : [], b), null);
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
            var tableHeader = resolveBlockRules(b).props.header;
            if (tableHeader) {
                table.setAttribute('data-tsl-table-header', '1');
            }
            b.cells.forEach(function (row, ri) {
                if (!Array.isArray(row)) {
                    return;
                }
                var tr = document.createElement('tr');
                row.forEach(function (cell) {
                    var cellEl = document.createElement(tableHeader && ri === 0 ? 'th' : 'td');
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
            // §6.8 icon through the ruleset (default light-bulb; blank → default).
            var asideIcon = resolveBlockRules(b).props.icon;
            if (asideIcon) {
                var ic = document.createElement('span');
                ic.className = 'tsl-aside-icon';
                ic.setAttribute('aria-hidden', 'true');
                ic.textContent = asideIcon;
                el.appendChild(ic);
            }
            var inner = document.createElement('div');
            inner.innerHTML = blockInlineHtml(b);
            el.appendChild(inner);
            return el;
        }
        if (TSL_EXT_TYPE_RE.test(type)) {
            // §6.23: per-type class (shared with lean) + ruleset flags via applyBlockRules.
            el = document.createElement(extBlockTag(type));
            el.className = 'tsl-block tsl-block--' + type + ' studio-lean-' + type;
            el.innerHTML = extBlockInnerHtml(b, inlineHtml);
            stampBlockMeta(el, b);
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
        var inner = blockInlineHtml(b);
        if (type === 'paragraph') {
            // Same cap builder as Scroll; null when dropCap is off / text is empty / pre-baked.
            var dcInner = buildDropCapInner(inner, b,
                ctx && ctx.header && ctx.header.typography && ctx.header.typography.lineHeight);
            if (dcInner) {
                inner = dcInner;
            }
        }
        if (b._tslContinued) {
            el.classList.add('tsl-block--continued');
        }
        if (/^h[1-3]$/.test(type)) {
            var hp = headingDisplayPrefix(b);
            if (hp) {
                // data-heading-number comes from the ruleset (h1–h3 number → attr) in applyBlockRules.
                var plain = blockPlainText(b);
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

    // Drop-cap float box = exactly dropCap.lines body lines (lines × lineHeight), so text
    // wraps beside the cap for that many lines. The cap is sized so its cap height equals
    // that box (dcFloatMetrics), i.e. box = cap-size × cap-height ratio. A letter cap sets
    // font-size to the cap size, so there the box is ratio × 1em; a glyph cap keeps the
    // paragraph font-size. Values are the --ts-dc-* variables (sized by dcInlineStyle).
    var DC_BOX_HEIGHT_LETTER = 'calc(var(--ts-dc-cap-height-ratio) * 1em)';
    var DC_BOX_HEIGHT_GLYPH = 'calc(var(--ts-dc-cap-size) * var(--ts-dc-cap-height-ratio))';

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
        // The outline label as the ruleset formats it (h1–h3 number rule; lab-overridable).
        var label = blockRuleText(block, 'number');
        return label ? label + ' ' : '';
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
        var leader = blockRuleProp(block, 'toc', 'leader');
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
        var leader = blockRuleProp(block, 'image-index', 'leader');
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
        var rawLength = cap.length;
        var rest = graphemes.slice(n).join('');
        if (spec.uppercase) {
            cap = cap.toLocaleUpperCase();
        }
        return { cap: cap, rest: rest, rawLength: rawLength };
    }

    function buildDropCapLeanInner(paraInlineHtml, block, header) {
        return buildDropCapInner(paraInlineHtml, block, header && header.typography && header.typography.lineHeight);
    }

    /**
     * Drop-cap inner HTML shared by Scroll (lean) and Pages: cap span + studio-dropcap-rest.
     * The cap letters come from the paragraph's text; the rest keeps the paragraph's inline
     * HTML (bold, italic, links…) with those letters removed.
     */
    function buildDropCapInner(paraInlineHtml, block, lineHeight) {
        // paragraph.dropCap / dropCapMarkup come from the ruleset (normalised Studio object).
        var dcProps = resolveBlockRules(block).props;
        var spec = dcProps.dropCap || null;
        if (spec === null || dcProps.dropCapMarkup) {
            return null;
        }
        var holder = document.createElement('div');
        holder.innerHTML = paraInlineHtml;
        var text = holder.textContent || '';
        var lead = text.length - text.replace(/^\s+/, '').length;
        var plain = text.slice(lead);
        if (!plain.trim()) {
            return null;
        }
        var parts = splitDropCapPlain(plain, spec);
        if (!parts.cap) {
            return null;
        }
        var metrics = dcFloatMetrics(spec, lineHeight || 1.55);
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
                + 'float:left;line-height:1;color:inherit;height:' + DC_BOX_HEIGHT_GLYPH + ';" aria-hidden="true">'
                + glyph + '</span>';
        } else {
            capHtml = '<span class="' + capClass + '" style="' + style
                + 'float:left;line-height:var(--ts-dc-cap-height-ratio);color:inherit;font-size:var(--ts-dc-cap-size);'
                + 'height:' + DC_BOX_HEIGHT_LETTER + ';" aria-hidden="true">'
                + escapeHtml(parts.cap) + '</span>';
        }
        removeLeadingTextChars(holder, lead + parts.rawLength);
        return capHtml + '<span class="studio-dropcap-rest">' + holder.innerHTML + '</span>';
    }

    /**
     * Lean text blocks (title, h1–h3, paragraph, quote, todo, aside) always carry their
     * align rule class — including align-left — so the block keeps its own alignment
     * inside hosts that set a different text-align (matches the former inline style).
     */
    function leanTextRuleAttrs(block, baseClasses) {
        return leanRuleAttrs(block, baseClasses, { emitDefaults: true });
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
        if (type === 'title') {
            var t = leanInlineHtml(block.text, header, readMode);
            if (!plainText(t)) {
                return '';
            }
            return '<h1' + leanTextRuleAttrs(block, 'studio-lean-title') + leanHeadingIdAttr(block) + '>' + t + '</h1>';
        }
        if (type === 'h1' || type === 'h2' || type === 'h3') {
            if (!plainText(block.text)) {
                return '';
            }
            return '<' + type + leanTextRuleAttrs(block, '') + leanHeadingIdAttr(block) + '>'
                + headingBodyHtml(block, header, readMode) + '</' + type + '>';
        }
        if (type === 'paragraph') {
            var pBody = buildDropCapLeanInner(leanInlineHtml(block.text, header, readMode), block, header);
            if (!pBody) {
                pBody = leanInlineHtml(block.text, header, readMode);
            }
            if (!plainText(pBody)) {
                return '<p' + leanTextRuleAttrs(block, 'studio-lean-empty') + '>&nbsp;</p>';
            }
            // studio-has-dropcap comes from the paragraph dropCap / dropCapMarkup flag rules.
            return '<p' + leanTextRuleAttrs(block, '') + '>' + pBody + '</p>';
        }
        if (type === 'quote') {
            return '<blockquote' + leanTextRuleAttrs(block, '') + '>' + leanInlineHtml(block.text, header, readMode) + '</blockquote>';
        }
        if (type === 'bullet') {
            // Each lean bullet is its own list element (one block region each); ordinal styles
            // continue the count of the consecutive run via start=, so the run reads as one list.
            var bulletStyle = resolveBlockRules(block).props.bulletStyle;
            var listTag = bulletListTag(bulletStyle);
            var listStart = listTag === 'ol' ? bulletRunPosition(block, header._leanAllBlocks || [], bulletStyle) : 1;
            return '<' + listTag + leanRuleAttrs(block, '') + (listStart > 1 ? ' start="' + listStart + '"' : '') + '><li>'
                + leanInlineHtml(block.text, header, readMode) + '</li></' + listTag + '>';
        }
        if (type === 'todo') {
            var done = resolveBlockRules(block).props.checked;
            return '<p' + leanTextRuleAttrs(block, 'studio-lean-todo' + (done ? ' is-done' : '')) + '>'
                + '<input type="checkbox" disabled' + (done ? ' checked' : '') + '> '
                + leanInlineHtml(block.text, header, readMode) + '</p>';
        }
        if (type === 'code') {
            return '<pre' + leanRuleAttrs(block, 'studio-lean-code') + '><code>' + escapeHtml(plainText(block.text)) + '</code></pre>';
        }
        if (type === 'table' && Array.isArray(block.cells)) {
            var rows = block.cells;
            var leanTableHeader = resolveBlockRules(block).props.header;
            var tbl = '<table' + leanRuleAttrs(block, 'studio-lean-table') + '>';
            rows.forEach(function (row, ri) {
                if (!Array.isArray(row)) {
                    return;
                }
                tbl += '<tr>';
                row.forEach(function (cell) {
                    var tag = leanTableHeader && ri === 0 ? 'th' : 'td';
                    tbl += '<' + tag + '>' + leanInlineHtml(String(cell != null ? cell : ''), header, readMode) + '</' + tag + '>';
                });
                tbl += '</tr>';
            });
            return tbl + '</table>';
        }
        if (type === 'aside') {
            var icon = String(resolveBlockRules(block).props.icon || '').trim();
            var iconH = icon ? '<span class="studio-lean-aside-icon" aria-hidden="true">' + escapeHtml(icon) + '</span> ' : '';
            return '<aside' + leanTextRuleAttrs(block, 'studio-lean-aside') + '>' + iconH
                + leanInlineHtml(block.text, header, readMode) + '</aside>';
        }
        if (type === 'divider') {
            return '<hr' + leanRuleAttrs(block, 'studio-lean-divider') + '>';
        }
        if (type === 'image' && block.src) {
            var fig = '<figure' + leanRuleAttrs(block, 'studio-lean-figure') + '><img src="' + escapeHtml(block.src) + '" alt="">';
            if (block.caption) {
                fig += '<figcaption>' + leanInlineHtml(block.caption, header, readMode) + '</figcaption>';
            }
            return fig + '</figure>';
        }
        if (type === 'front-cover') {
            if (!block.src) {
                return '';
            }
            return '<figure' + leanRuleAttrs(block, 'studio-lean-front-cover') + '><img src="' + escapeHtml(block.src) + '" alt=""></figure>';
        }
        if (type === 'full-page') {
            // Rule classes (halign-*, valign-*) carry the presentation; data-* keep the validated
            // values for round-trip parsing and for hosts that still key on them.
            var fp = resolveBlockRules(block).props;
            return '<div' + leanRuleAttrs(block, 'studio-lean-full-page')
                + ' data-halign="' + escapeHtml(fp.hAlign) + '" data-valign="' + escapeHtml(fp.vAlign) + '">'
                + '<div class="studio-lean-full-page-inner">' + leanInlineHtml(block.text, header, readMode) + '</div></div>';
        }
        if (type === 'manuscript-title') {
            return '<section' + leanRuleAttrs(block, 'studio-lean-manuscript-title') + '><div class="studio-lean-manuscript-page">'
                + leanInlineHtml(block.title || '[Title]', header, readMode) + '</div></section>';
        }
        if (type === 'toc') {
            return leanTocBlockHtml(block, header._leanAllBlocks || [], header, readMode, null);
        }
        if (type === 'image-index') {
            return leanImageIndexBlockHtml(block, header._leanAllBlocks || [], header, readMode, null);
        }
        if (TSL_EXT_TYPE_RE.test(type)) {
            // §6.23: was dropped (''); now paragraph-like with the per-type class + rule flags.
            var extTag = extBlockTag(type);
            var extAttrs = isTslExtTextType(type) ? leanTextRuleAttrs(block, 'studio-lean-' + type)
                : leanRuleAttrs(block, 'studio-lean-' + type);
            return '<' + extTag + extAttrs + '>' + extBlockInnerHtml(block, function (t) {
                return leanInlineHtml(t, header, readMode);
            }) + '</' + extTag + '>';
        }
        if (type === 'paywall') {
            return '<aside' + leanRuleAttrs(block, 'studio-lean-paywall') + ' role="note"><p class="studio-lean-paywall-message">'
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
        applyLeanRuleClasses(article);
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
            layout = owned === 'scroll' || owned === 'pages' ? owned : layout;
        }
        var scale = readerSizeScale(p.size);
        stampReaderTypography(article, p, scale);
        article.setAttribute('data-tsl-reader-theme', p.theme || 'light');
        article.setAttribute('data-tsl-reader-width', p.width || 'medium');
        if (layout !== null) {
            article.setAttribute('data-tsl-layout', layout);
        }
        var shell = article.closest('.document-tsl');
        if (shell) {
            stampReaderTypography(shell, p, scale);
            if (layout !== null) {
                shell.setAttribute('data-tsl-layout', layout);
            }
            shell.setAttribute('data-tsl-reader-width', p.width || 'medium');
            shell.setAttribute('data-tsl-reader-theme', p.theme || 'light');
        }
        var labMount = article.closest('[data-tsl-mount]');
        if (labMount) {
            syncMountHostLayout(labMount);
        }
    }

    /** Lab (and hosts): enable stage scrolling for lean scroll layout after mount or pref changes. */
    function syncMountHostLayout(mount) {
        if (!mount || !mount.setAttribute) {
            return;
        }
        var layout = getTslLayout();
        mount.setAttribute('data-tsl-layout', layout);
        var scrollActive = layout === 'scroll' && !!mount.querySelector('.document-tsl');
        var stage = mount.closest('.tsl-lab-stage');
        if (stage) {
            if (scrollActive) {
                stage.setAttribute('data-tsl-lab-scroll', '1');
            } else {
                stage.removeAttribute('data-tsl-lab-scroll');
            }
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
            block.expanded = resolveBlockRules({ id: block.id, type: 'front-cover', expanded: block.expanded }).props.expanded;
        }
        if (type === 'bullet') {
            // Read bulletStyle back from the list's rule class; text is the item, not the list markup.
            var listEl = meta.el && /^(UL|OL)$/.test(meta.el.tagName) ? meta.el : null;
            if (typeof document !== 'undefined') {
                var bHost = document.createElement('div');
                bHost.innerHTML = innerHtml;
                listEl = listEl || bHost.querySelector('ul, ol');
                var bItem = (listEl || bHost).querySelector('li');
                if (bItem) {
                    block.text = bItem.innerHTML;
                }
            }
            block.bulletStyle = resolveBlockRules({
                id: block.id,
                type: 'bullet',
                bulletStyle: blockPropFromMarkup(listEl, 'bullet', 'bulletStyle')
            }).props.bulletStyle;
        }
        if (type === 'full-page') {
            // Read hAlign / vAlign back from the markup (rule classes or data-*), never assume them;
            // text is the inner content, not the wrapper (which would nest a second full-page box).
            var fpEl = meta.el || null;
            if (typeof document !== 'undefined') {
                var fpHost = document.createElement('div');
                fpHost.innerHTML = innerHtml;
                fpEl = fpEl || fpHost.querySelector('.studio-lean-full-page');
                var fpInner = fpHost.querySelector('.studio-lean-full-page-inner');
                if (fpInner) {
                    block.text = fpInner.innerHTML;
                }
            }
            var fpProps = resolveBlockRules({
                id: block.id,
                type: 'full-page',
                hAlign: blockPropFromMarkup(fpEl, 'full-page', 'hAlign'),
                vAlign: blockPropFromMarkup(fpEl, 'full-page', 'vAlign')
            }).props;
            block.hAlign = fpProps.hAlign;
            block.vAlign = fpProps.vAlign;
        }
        if (TSL_EXT_TYPE_RE.test(type) && typeof document !== 'undefined') {
            recoverExtBlockFromLean(block, meta.el, innerHtml);
        }
        if (meta.dropCap) {
            block.dropCap = parseDropCapComment(meta.dropCap);
        }
        if (meta.number) {
            block.number = String(meta.number).replace(/\.$/, '');
        }
        return block;
    }

    /** §6.23 lean → block: read content fields and rule flags back from the markup. */
    function recoverExtBlockFromLean(block, el, innerHtml) {
        var host = document.createElement('div');
        host.innerHTML = innerHtml;
        var root = host.querySelector('.studio-lean-' + block.type) || el || host;
        var type = block.type;
        var rules = ruleSetForType(type);
        if (type === 'mathml') {
            var m = root.querySelector('math');
            var srcEl = root.querySelector('.studio-lean-mathml-source');
            if (m) {
                // display lives on the block (rule flag), not in the stored source.
                m = m.cloneNode(true);
                m.removeAttribute('display');
                m.setAttribute('xmlns', TSL_MATHML_NS);
            }
            block.source = m ? m.outerHTML : (srcEl ? srcEl.textContent : '');
            block.display = !!(rules.display && rules.display.flag && root.classList
                && root.classList.contains(rules.display.flag));
            delete block.text;
            return;
        }
        if (type === 'stage-speech') {
            var nm = root.querySelector('.studio-lean-stage-name');
            var tx = root.querySelector('.studio-lean-stage-text');
            block.character = nm ? nm.textContent : '';
            block.text = tx ? tx.innerHTML : '';
            return;
        }
        if (type === 'script-scene') {
            var flag = rules.showSceneNumbers && rules.showSceneNumbers.flag;
            block.showSceneNumbers = !!(flag && root.classList && root.classList.contains(flag));
            if (block.showSceneNumbers) {
                var nl = root.querySelector('.studio-lean-scene-num--left');
                var nr = root.querySelector('.studio-lean-scene-num--right');
                var st = root.querySelector('.studio-lean-scene-text');
                block.sceneNumberLeft = nl ? nl.getAttribute('data-scene-number') || '' : '';
                block.sceneNumberRight = nr ? nr.getAttribute('data-scene-number') || '' : '';
                block.text = st ? st.innerHTML : '';
                return;
            }
        }
        block.text = root === host ? host.innerHTML : root.innerHTML;
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
                } else if (!type && /\sstudio-lean-((script|stage)-[a-z]+|mathml)\s/.test(cls)) {
                    type = cls.match(/\sstudio-lean-((script|stage)-[a-z]+|mathml)\s/)[1];
                } else if (!type) {
                    type = 'paragraph';
                }
                var meta = {
                    type: type,
                    id: el.getAttribute('data-block-id') || '',
                    align: blockPropFromMarkup(el, type, 'align')
                        || resolveBlockRules({ type: type, align: el.style && el.style.textAlign }).props.align,
                    cols: 2,
                    el: el
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
        parsed = normalizeTslParsed(parsed);
        if (!mount || !parsed) {
            return null;
        }
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
        wrap.appendChild(article);
        shell.appendChild(wrap);
        mount.appendChild(shell);
        /* After attach: applyLeanReadingPrefs also stamps theme/width/layout on the
           .document-tsl shell via closest(); before attach the shell kept the light
           defaults on first load/refresh in scroll layout. */
        applyLeanReadingPrefs(article);
        bindInDocumentAnchorClicks(article);
        syncMountHostLayout(mount);
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
            return remountTslMount(mount, parsed);
        });
    }

    function loadText(text, mount, mode) {
        var parsed = parse(text);
        if (mode === 'lean') {
            return mountLeanHtml(mount, parsed);
        }
        return remountTslMount(mount, parsed);
    }

    function display(mount, parsed, mode) {
        if (mount) {
            mount._tslParsed = parsed;
            stampTslReadingCapabilities(parsed && parsed.header, mount);
        }
        if (mode === 'lean') {
            return mountLeanHtml(mount, parsed);
        }
        var out = remountTslMount(mount, parsed);
        syncMountHostLayout(mount);
        return out;
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
        stampTslReadingCapabilities(parsed.header, readerArticle);
        var layout = readerArticle.getAttribute('data-tsl-layout');
        if (layout !== 'scroll' && layout !== 'pages') {
            layout = getTslLayout();
        }
        if (layout === 'scroll') {
            wrap.classList.remove('tsl-reader-player-mount');
            wrap.removeAttribute('data-tsl-mount');
            readerArticle._tslParsedEnvelope = parsed;
            mountLeanHtml(wrap, parsed);
            applyTslLayoutVarsToArticle(findTslLeanArticle(wrap));
            applyLeanReadingPrefs(findTslLeanArticle(wrap));
            readerArticle._tslPlayer = { mode: 'scroll' };
            return readerArticle._tslPlayer;
        }
        ensureLeanBackupFromParsed(readerArticle, parsed);
        readerArticle._tslParsedEnvelope = parsed;
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
        var shell = readerArticle.querySelector('.document-tsl');
        if (!shell) {
            var leanOnly = findTslLeanArticle(readerArticle);
            if (!leanOnly) {
                return null;
            }
            applyTslLayoutVarsToArticle(leanOnly);
            applyLeanReadingPrefs(leanOnly);
            bindInDocumentAnchorClicks(leanOnly);
            readerArticle._tslPlayer = { mode: 'scroll' };
            return readerArticle._tslPlayer;
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
        var existing = readerArticle._tslPlayer;
        if (layout === 'pages' && existing && existing.mode === 'pages' && existing.root && existing.root.isConnected) {
            return existing;
        }
        if (layout === 'scroll' && existing && existing.mode === 'scroll' && findTslLeanArticle(wrap)) {
            applyTslLayoutVarsToArticle(findTslLeanArticle(wrap));
            applyLeanReadingPrefs(findTslLeanArticle(wrap));
            return existing;
        }
        if (layout === 'scroll') {
            var leanScroll = restoreLeanScrollWrap(wrap, readerArticle);
            applyTslLayoutVarsToArticle(leanScroll);
            applyLeanReadingPrefs(leanScroll);
            bindInDocumentAnchorClicks(leanScroll);
            readerArticle._tslPlayer = { mode: 'scroll' };
            return readerArticle._tslPlayer;
        }
        if (readerArticle._tslLeanBackup && !findTslLeanArticle(wrap)) {
            wrap.innerHTML = readerArticle._tslLeanBackup;
            leanArticle = findTslLeanArticle(wrap);
        }
        if (!leanArticle || !leanSupportsPagination(leanArticle, wrap.innerHTML)) {
            applyTslLayoutVarsToArticle(leanArticle);
            applyLeanReadingPrefs(leanArticle);
            readerArticle._tslPlayer = { mode: 'scroll' };
            return readerArticle._tslPlayer;
        }
        var envelope = leanHtmlToEnvelope('<div class="document-tsl post-lean-html">' + wrap.innerHTML + '</div>');
        var parsed = { header: envelope.header, blocks: envelope.document.blocks };
        readerArticle._tslParsedEnvelope = parsed;
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

    function repaginateReaderArticle(readerArticle) {
        if (!readerArticle) {
            return null;
        }
        var layout = readerArticle.getAttribute('data-tsl-layout');
        if (layout !== 'scroll' && layout !== 'pages') {
            layout = getTslLayout();
        }
        if (layout === 'scroll') {
            var shell = readerArticle.querySelector('.document-tsl');
            var wrap = shell ? (shell.querySelector('.post-lean-html-article-wrap') || shell) : readerArticle;
            var lean = findTslLeanArticle(wrap);
            if (lean) {
                applyTslLayoutVarsToArticle(lean);
                applyLeanReadingPrefs(lean);
            }
            return readerArticle._tslPlayer;
        }
        var prevIdx = 0;
        var prev = readerArticle._tslPlayer;
        if (prev && prev.mode === 'pages' && typeof prev.progress === 'function') {
            prevIdx = prev.progress().index;
        }
        readerArticle._tslPlayer = null;
        var player = enhancePublishedLean(readerArticle);
        if (player && player.mode === 'pages' && typeof player.goToIndex === 'function' && prevIdx > 0) {
            player.goToIndex(prevIdx);
        }
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
        readingPrefApplies: readingPrefApplies,
        getTslLayout: getTslLayout,
        getTslReadingCapabilities: getTslReadingCapabilities,
        getPageFit: getPageFit,
        setReadingPref: setReadingPref,
        applyReadingPrefs: applyReadingPrefs,
        applyTslLayoutVarsToArticle: applyTslLayoutVarsToArticle,
        applyLeanReadingPrefs: applyLeanReadingPrefs,
        syncMountHostLayout: syncMountHostLayout,
        enhancePublishedLean: enhancePublishedLean,
        repaginateReaderArticle: repaginateReaderArticle,
        mountReaderEnvelope: mountReaderEnvelope,
        syncReadingPrefsUI: syncReadingPrefsUI,
        bindReadingPrefsUI: bindReadingPrefsUI,
        resetReadingPrefs: resetReadingPrefs,
        collectDocumentOutline: collectDocumentOutline,
        collectTocEntries: collectTocEntries,
        headingAnchorId: headingAnchorId,
        findInDocumentAnchorTarget: findInDocumentAnchorTarget,
        navigateToInDocumentAnchor: navigateToInDocumentAnchor,
        bindInDocumentAnchorClicks: bindInDocumentAnchorClicks,
        /* Spec ruleset (spec/tsl-spec.tsl §5): validate a block / map it to CSS rule classes. */
        blockRules: TSL_BLOCK_RULES,
        defineBlockRules: defineBlockRules,
        resetBlockRules: resetBlockRules,
        validateBlock: resolveBlockRules,
        blockRuleMapping: blockRuleMapping,
        applyLeanRuleClasses: applyLeanRuleClasses
    };
})(typeof window !== 'undefined' ? window : globalThis);
