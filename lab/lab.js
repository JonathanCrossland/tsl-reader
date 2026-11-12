(function () {
    'use strict';

    var mount = document.querySelector('[data-tsl-mount]');
    var status = document.querySelector('[data-tsl-status]');
    var fileInput = document.querySelector('[data-tsl-file]');
    var downloadBtn = document.querySelector('[data-tsl-download]');
    var sampleSelect = document.querySelector('[data-tsl-sample-select]');
    var fabRoot = document.querySelector('[data-tsl-lab-fab]');
    var fabToggle = document.querySelector('[data-tsl-lab-fab-toggle]');
    var fabPanel = document.querySelector('[data-tsl-lab-panel]');
    var fabBackdrop = document.querySelector('[data-tsl-lab-fab-backdrop]');
    var labScrollStage = null;
    var labScrollHandler = null;
    var scrollSaveTimer = null;
    var activeDocumentKey = '';
    var labRestoringProgress = false;
    var LAB_PROGRESS_PREFIX = 'tsl:lab-progress:';
    var LAB_BOOKMARKS_PREFIX = 'tsl:lab-bookmarks:';
    var LAB_LAST_DOCUMENT_KEY = 'tsl:lab-last-document';
    var prefsHost = document.querySelector('[data-tsl-prefs-host]');
    var settings = prefsHost || document.querySelector('[data-tsl-settings]');
    var searchInput = document.querySelector('[data-tsl-search-input]');
    var searchRunBtn = document.querySelector('[data-tsl-search-run]');
    var searchStatusEl = document.querySelector('[data-tsl-search-status]');
    var searchResultsEl = document.querySelector('[data-tsl-search-results]');
    var bookmarkAddBtn = document.querySelector('[data-tsl-bookmark-add]');
    var bookmarkListEl = document.querySelector('[data-tsl-bookmark-list]');
    var LAB_SEARCH_HIGHLIGHT_ID = 'tsl-lab-search';
    var LAB_BOOKMARK_HIGHLIGHT_ID = 'tsl-lab-bookmark';
    var labHighlightStyleEl = null;
    var labSearchHits = [];
    var labSearchHitIndex = -1;
    var lastUrl = '';
    var lastParsed = null;
    var lastEnvelope = null;

    if (settings && TalesmithTsl.bindReadingPrefsUI) {
        TalesmithTsl.bindReadingPrefsUI(settings);
    }

    var printBtn = document.querySelector('[data-tsl-print]');
    var contentsPanel = document.querySelector('[data-tsl-lab-contents]');
    var contentsNav = document.querySelector('[data-tsl-lab-toc]');
    var contentsToggle = document.querySelector('[data-tsl-contents-toggle]');
    var contentsClose = document.querySelector('[data-tsl-contents-close]');

    document.documentElement.style.setProperty('--tsl-lab-header-block', '0px');

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setLabTab(name) {
        var tabName = String(name || 'read');
        document.querySelectorAll('[data-tsl-lab-tab]').forEach(function (btn) {
            var on = btn.getAttribute('data-tsl-lab-tab') === tabName;
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
            btn.tabIndex = on ? 0 : -1;
        });
        document.querySelectorAll('[data-tsl-lab-tab-panel]').forEach(function (panel) {
            var on = panel.getAttribute('data-tsl-lab-tab-panel') === tabName;
            panel.classList.toggle('is-on', on);
            panel.hidden = !on;
        });
    }

    document.querySelectorAll('[data-tsl-lab-tab]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            setLabTab(btn.getAttribute('data-tsl-lab-tab'));
        });
    });

    function readerContentRoot() {
        if (!mount) {
            return null;
        }
        return mount.querySelector('.tsl-root')
            || mount.querySelector('.studio-lean-tsl')
            || mount.firstElementChild;
    }

    function blockElementById(blockId) {
        var root = readerContentRoot();
        if (!root || !blockId) {
            return null;
        }
        try {
            return root.querySelector('[data-tsl-block-id="' + CSS.escape(blockId) + '"]');
        } catch (e) {
            return root.querySelector('[data-tsl-block-id="' + String(blockId).replace(/"/g, '') + '"]');
        }
    }

    function labHighlightSupported() {
        return typeof CSS !== 'undefined'
            && CSS.highlights
            && typeof Highlight !== 'undefined';
    }

    function ensureLabHighlightStyles() {
        if (labHighlightStyleEl) {
            return;
        }
        labHighlightStyleEl = document.createElement('style');
        labHighlightStyleEl.setAttribute('data-tsl-lab-highlight-style', '');
        labHighlightStyleEl.textContent = '::highlight(' + LAB_SEARCH_HIGHLIGHT_ID + '){'
            + 'background:color-mix(in srgb,#e6c200 55%,transparent);color:inherit;}'
            + '::highlight(' + LAB_BOOKMARK_HIGHLIGHT_ID + '){'
            + 'background:color-mix(in srgb,#5ab87a 42%,transparent);color:inherit;}';
        document.head.appendChild(labHighlightStyleEl);
    }

    function clearLabDocHighlights() {
        if (labHighlightSupported()) {
            CSS.highlights.delete(LAB_SEARCH_HIGHLIGHT_ID);
            CSS.highlights.delete(LAB_BOOKMARK_HIGHLIGHT_ID);
        }
        var root = readerContentRoot();
        if (!root) {
            return;
        }
        root.querySelectorAll('[data-tsl-block-id].tsl-lab-bookmark-target').forEach(function (el) {
            el.classList.remove('tsl-lab-bookmark-target');
        });
        root.querySelectorAll('mark.tsl-lab-doc-mark').forEach(function (mark) {
            var parent = mark.parentNode;
            if (!parent) {
                return;
            }
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            if (parent.normalize) {
                parent.normalize();
            }
        });
    }

    function textRangesMatching(el, query) {
        var ranges = [];
        if (!el || !query) {
            return ranges;
        }
        var q = String(query);
        var qLower = q.toLowerCase();
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
            var text = node.textContent || '';
            var lower = text.toLowerCase();
            var start = 0;
            var idx;
            while ((idx = lower.indexOf(qLower, start)) >= 0) {
                var range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, Math.min(text.length, idx + q.length));
                ranges.push(range);
                start = idx + Math.max(1, q.length);
            }
        }
        return ranges;
    }

    function textRangesInElement(el) {
        var ranges = [];
        if (!el) {
            return ranges;
        }
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
            if (!(node.textContent || '').replace(/\s+/g, '').length) {
                continue;
            }
            var range = document.createRange();
            range.selectNodeContents(node);
            ranges.push(range);
        }
        return ranges;
    }

    function applyLabHighlight(name, ranges) {
        if (!ranges.length) {
            return false;
        }
        ensureLabHighlightStyles();
        if (!labHighlightSupported()) {
            return false;
        }
        try {
            var h = new Highlight(ranges[0]);
            var ri;
            for (ri = 1; ri < ranges.length; ri += 1) {
                h.add(ranges[ri]);
            }
            CSS.highlights.set(name, h);
        } catch (e) {
            return false;
        }
        return true;
    }

    function wrapSearchMarks(el, query) {
        var ranges = textRangesMatching(el, query);
        if (!ranges.length) {
            return false;
        }
        var i;
        for (i = ranges.length - 1; i >= 0; i -= 1) {
            var range = ranges[i];
            try {
                var mark = document.createElement('mark');
                mark.className = 'tsl-lab-doc-mark tsl-lab-doc-mark--search';
                range.surroundContents(mark);
            } catch (e) { /* cross-boundary */ }
        }
        return el.querySelector('mark.tsl-lab-doc-mark--search') != null;
    }

    function highlightSearchInDocument(el, query, occurrenceIndex) {
        if (!el || !query) {
            return;
        }
        var ranges = textRangesMatching(el, query);
        if (!ranges.length) {
            return;
        }
        var occ = occurrenceIndex == null || occurrenceIndex < 0 ? 0 : occurrenceIndex;
        if (occ >= ranges.length) {
            occ = 0;
        }
        if (!applyLabHighlight(LAB_SEARCH_HIGHLIGHT_ID, ranges)) {
            wrapSearchMarks(el, query);
        }
        try {
            var focusRange = ranges[occ];
            var focusNode = focusRange.startContainer;
            if (focusNode && focusNode.parentElement) {
                focusNode.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (e) { /* ignore */ }
    }

    function highlightBookmarkInDocument(el) {
        if (!el) {
            return;
        }
        el.classList.add('tsl-lab-bookmark-target');
        var ranges = textRangesInElement(el);
        applyLabHighlight(LAB_BOOKMARK_HIGHLIGHT_ID, ranges);
    }

    function applyDocHighlight(blockId, opts) {
        opts = opts || {};
        if (!opts.mode) {
            return;
        }
        var el = blockElementById(blockId);
        if (!el) {
            return;
        }
        clearLabDocHighlights();
        if (opts.mode === 'search' && opts.query) {
            highlightSearchInDocument(el, opts.query, opts.occurrenceIndex);
        } else if (opts.mode === 'bookmark') {
            highlightBookmarkInDocument(el);
        }
    }

    function navigateToBlock(blockId, highlightOpts, navOpts) {
        navOpts = navOpts || {};
        var el = blockElementById(blockId);
        if (!el) {
            return false;
        }
        var pagerRoot = mount && mount.querySelector('.tsl-root');
        var navRoot = pagerRoot || readerContentRoot() || mount;
        var ok = false;
        if (TalesmithTsl.navigateToInDocumentAnchor) {
            ok = TalesmithTsl.navigateToInDocumentAnchor(el, navRoot);
        } else {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            ok = true;
        }
        if (ok) {
            if (navOpts.closePanel !== false) {
                setLabPanelOpen(false);
            }
            var opts = highlightOpts || null;
            var tries = 0;
            function tryHighlight() {
                tries += 1;
                if (blockElementById(blockId)) {
                    applyDocHighlight(blockId, opts);
                    return;
                }
                if (tries < 12) {
                    requestAnimationFrame(tryHighlight);
                }
            }
            requestAnimationFrame(function () {
                requestAnimationFrame(tryHighlight);
            });
        }
        return ok;
    }

    function setSearchStatus(msg) {
        if (searchStatusEl) {
            searchStatusEl.textContent = msg || '';
        }
    }

    function snippetWithMark(snippet, query) {
        var esc = escapeHtml(snippet);
        var re = new RegExp('(' + String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return esc.replace(re, '<mark>$1</mark>');
    }

    function snippetForRange(el, query, occurrenceIndex) {
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        var ranges = textRangesMatching(el, query);
        var occ = occurrenceIndex == null ? 0 : occurrenceIndex;
        if (!ranges[occ]) {
            var idx = text.toLowerCase().indexOf(String(query).toLowerCase());
            if (idx < 0) {
                return text.slice(0, 100);
            }
            var snippetStart = Math.max(0, idx - 40);
            var snippetEnd = Math.min(text.length, idx + query.length + 60);
            var snippet = text.slice(snippetStart, snippetEnd);
            if (snippetStart > 0) {
                snippet = '\u2026' + snippet;
            }
            if (snippetEnd < text.length) {
                snippet = snippet + '\u2026';
            }
            return snippet;
        }
        try {
            var start = 0;
            var ri;
            for (ri = 0; ri < occ; ri += 1) {
                var before = document.createRange();
                before.setStart(el, 0);
                before.setEnd(ranges[ri].startContainer, ranges[ri].startOffset);
                start += (before.toString() || '').replace(/\s+/g, ' ').length;
            }
            var matchLen = (ranges[occ].toString() || '').length;
            var flat = text;
            var matchAt = flat.toLowerCase().indexOf(String(query).toLowerCase(), Math.max(0, start - 5));
            if (matchAt < 0) {
                matchAt = start;
            }
            var snippetStart = Math.max(0, matchAt - 40);
            var snippetEnd = Math.min(flat.length, matchAt + Math.max(query.length, matchLen) + 60);
            var snippet = flat.slice(snippetStart, snippetEnd);
            if (snippetStart > 0) {
                snippet = '\u2026' + snippet;
            }
            if (snippetEnd < flat.length) {
                snippet = snippet + '\u2026';
            }
            return snippet;
        } catch (e) {
            return text.slice(0, 100);
        }
    }

    function collectDocumentSearchHits(root, query) {
        var hits = [];
        if (!root || !query) {
            return hits;
        }
        root.querySelectorAll('[data-tsl-block-id]').forEach(function (el) {
            var blockId = el.getAttribute('data-tsl-block-id');
            if (!blockId) {
                return;
            }
            var ranges = textRangesMatching(el, query);
            var oi;
            for (oi = 0; oi < ranges.length; oi += 1) {
                hits.push({
                    blockId: blockId,
                    occurrenceIndex: oi,
                    query: query,
                    snippet: snippetForRange(el, query, oi)
                });
            }
        });
        return hits;
    }

    function renderSearchResults(hits) {
        if (!searchResultsEl) {
            return;
        }
        searchResultsEl.textContent = '';
        hits.forEach(function (hit, i) {
            var li = document.createElement('li');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tsl-lab-search-hit';
            btn.setAttribute('data-tsl-search-index', String(i));
            btn.setAttribute('data-tsl-search-block', hit.blockId || '');
            btn.setAttribute('data-tsl-search-query', hit.query);
            btn.setAttribute('data-tsl-search-occurrence', String(hit.occurrenceIndex));
            btn.innerHTML = snippetWithMark(hit.snippet, hit.query);
            btn.setAttribute('aria-label', 'Result ' + (i + 1) + ' of ' + hits.length);
            if (i === labSearchHitIndex) {
                btn.classList.add('is-active');
            }
            li.appendChild(btn);
            searchResultsEl.appendChild(li);
        });
    }

    function syncSearchResultSelection() {
        if (!searchResultsEl) {
            return;
        }
        searchResultsEl.querySelectorAll('.tsl-lab-search-hit').forEach(function (btn) {
            var idx = parseInt(btn.getAttribute('data-tsl-search-index'), 10);
            btn.classList.toggle('is-active', idx === labSearchHitIndex);
        });
    }

    function runDocumentSearch(query, jumpToFirst) {
        query = String(query || '').trim();
        labSearchHits = [];
        labSearchHitIndex = -1;
        if (!query) {
            setSearchStatus('Enter a search term.');
            if (searchResultsEl) {
                searchResultsEl.textContent = '';
            }
            return;
        }
        var root = readerContentRoot();
        if (!root) {
            setSearchStatus('No document loaded.');
            return;
        }
        labSearchHits = collectDocumentSearchHits(root, query);
        renderSearchResults(labSearchHits);
        if (!labSearchHits.length) {
            setSearchStatus('No matches.');
            return;
        }
        setSearchStatus(labSearchHits.length + ' result' + (labSearchHits.length === 1 ? '' : 's'));
        if (jumpToFirst) {
            goSearchHit(0, { fromRun: true });
        }
    }

    function goSearchHit(delta, opts) {
        opts = opts || {};
        if (!labSearchHits.length) {
            var q = searchInput && searchInput.value ? searchInput.value.trim() : '';
            if (q) {
                runDocumentSearch(q, true);
            } else {
                openFindPanel(true);
            }
            return;
        }
        var next;
        if (opts.fromRun && delta === 0) {
            next = 0;
        } else if (typeof delta === 'number' && !opts.fromRun) {
            next = labSearchHitIndex + delta;
            if (next < 0) {
                next = labSearchHits.length - 1;
            }
            if (next >= labSearchHits.length) {
                next = 0;
            }
        } else {
            next = labSearchHitIndex < 0 ? 0 : labSearchHitIndex;
        }
        labSearchHitIndex = next;
        var hit = labSearchHits[next];
        setSearchStatus((next + 1) + ' of ' + labSearchHits.length);
        syncSearchResultSelection();
        navigateToBlock(hit.blockId, {
            mode: 'search',
            query: hit.query,
            occurrenceIndex: hit.occurrenceIndex
        }, { closePanel: !!opts.closePanel });
    }

    function openFindPanel(selectAll) {
        setLabPanelOpen(true);
        setLabTab('search');
        if (searchInput) {
            window.setTimeout(function () {
                searchInput.focus();
                if (selectAll) {
                    searchInput.select();
                }
            }, 0);
        }
    }

    function labModKey(e) {
        return !!(e.metaKey || e.ctrlKey);
    }

    function isLabShortcutBlockedTarget(target) {
        if (!target || !target.closest) {
            return false;
        }
        if (target.closest('[data-tsl-lab-panel]')) {
            return false;
        }
        return !!target.closest('input, textarea, select, [contenteditable="true"]');
    }

    function bookmarkStorageKey() {
        return activeDocumentKey ? LAB_BOOKMARKS_PREFIX + activeDocumentKey.slice(LAB_PROGRESS_PREFIX.length) : '';
    }

    function loadBookmarks() {
        var key = bookmarkStorageKey();
        if (!key) {
            return [];
        }
        var raw = storageGetItem(key);
        if (!raw) {
            return [];
        }
        try {
            var data = JSON.parse(raw);
            if (data && Array.isArray(data.items)) {
                return data.items.filter(function (it) {
                    return it && it.blockId;
                });
            }
        } catch (e) { /* corrupt */ }
        return [];
    }

    function saveBookmarks(items) {
        var key = bookmarkStorageKey();
        if (!key) {
            return;
        }
        try {
            storageSetItem(key, JSON.stringify({ v: 1, items: items }));
        } catch (e) { /* private mode */ }
    }

    function blockLabel(el) {
        if (!el) {
            return 'Bookmark';
        }
        var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t) {
            return 'Bookmark';
        }
        return t.length > 72 ? t.slice(0, 72) + '\u2026' : t;
    }

    function bookmarkAnchorBlock() {
        var root = readerContentRoot();
        if (!root) {
            return null;
        }
        var layout = TalesmithTsl.getTslLayout ? TalesmithTsl.getTslLayout() : 'pages';
        if (layout === 'pages') {
            var page = root.querySelector('.tsl-page.is-active')
                || root.querySelector('.tsl-page:not([aria-hidden="true"])');
            if (page) {
                var first = page.querySelector('[data-tsl-block-id]');
                if (first) {
                    return first;
                }
            }
        }
        var stage = document.querySelector('.tsl-lab-stage');
        var viewMid = stage
            ? stage.getBoundingClientRect().top + stage.clientHeight * 0.35
            : window.innerHeight * 0.35;
        var best = null;
        var bestDist = Infinity;
        root.querySelectorAll('[data-tsl-block-id]').forEach(function (el) {
            var r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) {
                return;
            }
            var mid = (r.top + r.bottom) / 2;
            var dist = Math.abs(mid - viewMid);
            if (dist < bestDist) {
                bestDist = dist;
                best = el;
            }
        });
        return best;
    }

    function rebuildBookmarkList() {
        if (!bookmarkListEl) {
            return;
        }
        bookmarkListEl.textContent = '';
        var items = loadBookmarks();
        if (!items.length) {
            var empty = document.createElement('p');
            empty.className = 'tsl-lab-bookmark-empty';
            empty.textContent = activeDocumentKey ? 'No bookmarks yet.' : 'Open a document to save bookmarks.';
            bookmarkListEl.appendChild(empty);
            return;
        }
        items.forEach(function (item) {
            var li = document.createElement('li');
            var go = document.createElement('button');
            go.type = 'button';
            go.className = 'tsl-lab-bookmark-go';
            go.setAttribute('data-tsl-bookmark-id', item.id || '');
            go.textContent = item.label || 'Bookmark';
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'tsl-lab-bookmark-remove';
            rm.setAttribute('data-tsl-bookmark-remove', item.id || '');
            rm.setAttribute('aria-label', 'Remove bookmark');
            rm.textContent = '\u00d7';
            li.appendChild(go);
            li.appendChild(rm);
            bookmarkListEl.appendChild(li);
        });
    }

    function toggleBookmarkAtReadingPosition() {
        if (!activeDocumentKey) {
            setStatus('Open a document before adding a bookmark.', true);
            return;
        }
        var el = bookmarkAnchorBlock();
        if (!el) {
            setStatus('Could not find a position to bookmark.', true);
            return;
        }
        var blockId = el.getAttribute('data-tsl-block-id');
        if (!blockId) {
            setStatus('Could not find a position to bookmark.', true);
            return;
        }
        var items = loadBookmarks();
        var existing = null;
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].blockId === blockId) {
                existing = items[i];
                break;
            }
        }
        if (existing) {
            saveBookmarks(items.filter(function (it) { return it.blockId !== blockId; }));
            rebuildBookmarkList();
            clearLabDocHighlights();
            setStatus('Bookmark removed.');
            return;
        }
        var entry = {
            id: 'bm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            blockId: blockId,
            label: blockLabel(el),
            createdAt: Date.now()
        };
        items.unshift(entry);
        saveBookmarks(items);
        rebuildBookmarkList();
        setStatus('Bookmark added.');
        navigateToBlock(blockId, { mode: 'bookmark' }, { closePanel: false });
    }

    function wireLabKeyboardShortcuts() {
        document.addEventListener('keydown', function (e) {
            if (e.defaultPrevented) {
                return;
            }
            var key = e.key;
            var mod = labModKey(e);
            if (mod && (key === 'f' || key === 'F')) {
                e.preventDefault();
                openFindPanel(true);
                return;
            }
            if (mod && (key === 'd' || key === 'D' || key === 'b' || key === 'B')) {
                if (isLabShortcutBlockedTarget(e.target)) {
                    return;
                }
                e.preventDefault();
                toggleBookmarkAtReadingPosition();
                return;
            }
            var findPrev = (key === 'F3' && e.shiftKey)
                || (mod && e.shiftKey && (key === 'g' || key === 'G'));
            var findNext = (key === 'F3' && !e.shiftKey)
                || (mod && !e.shiftKey && (key === 'g' || key === 'G'));
            if (findPrev || findNext) {
                if (isLabShortcutBlockedTarget(e.target) && e.target !== searchInput) {
                    return;
                }
                e.preventDefault();
                goSearchHit(findPrev ? -1 : 1, { closePanel: false });
            }
        });
    }

    if (searchRunBtn && searchInput) {
        searchRunBtn.addEventListener('click', function () {
            runDocumentSearch(searchInput.value, true);
        });
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                runDocumentSearch(searchInput.value, true);
                return;
            }
            if (e.key === 'F3' || (labModKey(e) && (e.key === 'g' || e.key === 'G'))) {
                e.preventDefault();
                goSearchHit(e.shiftKey ? -1 : 1, { closePanel: false });
            }
        });
    }
    if (searchResultsEl) {
        searchResultsEl.addEventListener('click', function (e) {
            var hit = e.target.closest('[data-tsl-search-block]');
            if (!hit) {
                return;
            }
            var idx = parseInt(hit.getAttribute('data-tsl-search-index'), 10);
            if (!isNaN(idx)) {
                labSearchHitIndex = idx;
            }
            syncSearchResultSelection();
            setSearchStatus((labSearchHitIndex + 1) + ' of ' + labSearchHits.length);
            navigateToBlock(hit.getAttribute('data-tsl-search-block'), {
                mode: 'search',
                query: hit.getAttribute('data-tsl-search-query') || (searchInput && searchInput.value) || '',
                occurrenceIndex: parseInt(hit.getAttribute('data-tsl-search-occurrence'), 10) || 0
            }, { closePanel: true });
        });
    }
    if (bookmarkAddBtn) {
        bookmarkAddBtn.addEventListener('click', toggleBookmarkAtReadingPosition);
    }
    if (bookmarkListEl) {
        bookmarkListEl.addEventListener('click', function (e) {
            var rm = e.target.closest('[data-tsl-bookmark-remove]');
            if (rm) {
                var rid = rm.getAttribute('data-tsl-bookmark-remove');
                var next = loadBookmarks().filter(function (it) { return it.id !== rid; });
                saveBookmarks(next);
                rebuildBookmarkList();
                return;
            }
            var go = e.target.closest('.tsl-lab-bookmark-go');
            if (!go) {
                return;
            }
            var bid = go.getAttribute('data-tsl-bookmark-id');
            var item = loadBookmarks().filter(function (it) { return it.id === bid; })[0];
            if (item && item.blockId) {
                navigateToBlock(item.blockId, { mode: 'bookmark' });
            }
        });
    }

    function labProgressStorage() {
        if (typeof window !== 'undefined' && window.__TalesmithTslStorage) {
            return window.__TalesmithTslStorage;
        }
        return null;
    }

    function storageGetItem(key) {
        var store = labProgressStorage();
        if (store && store.getItem) {
            return store.getItem(key);
        }
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function storageSetItem(key, value) {
        var store = labProgressStorage();
        if (store && store.setItem) {
            store.setItem(key, value);
            return;
        }
        try {
            localStorage.setItem(key, value);
        } catch (e) { /* private mode */ }
    }

    function saveLastLabDocumentUrl(url) {
        if (!url) {
            return;
        }
        try {
            storageSetItem(LAB_LAST_DOCUMENT_KEY, JSON.stringify({ v: 1, url: String(url) }));
        } catch (e) { /* private mode */ }
    }

    function loadLastLabDocumentUrl() {
        var raw = storageGetItem(LAB_LAST_DOCUMENT_KEY);
        if (!raw) {
            return '';
        }
        try {
            var data = JSON.parse(raw);
            if (data && typeof data.url === 'string' && data.url) {
                return data.url;
            }
        } catch (e) {
            return '';
        }
        return '';
    }

    function documentProgressStorageKey(urlOrFileId) {
        if (!urlOrFileId) {
            return '';
        }
        if (String(urlOrFileId).indexOf('file:') === 0) {
            return LAB_PROGRESS_PREFIX + urlOrFileId;
        }
        try {
            return LAB_PROGRESS_PREFIX + new URL(urlOrFileId, window.location.href).href;
        } catch (e) {
            return LAB_PROGRESS_PREFIX + String(urlOrFileId);
        }
    }

    function setActiveDocumentKey(resolvedUrl, fileName) {
        if (resolvedUrl) {
            activeDocumentKey = documentProgressStorageKey(resolvedUrl);
        } else if (fileName) {
            activeDocumentKey = documentProgressStorageKey('file:' + fileName);
        } else {
            activeDocumentKey = '';
        }
        rebuildBookmarkList();
    }

    function loadDocumentProgress(key) {
        if (!key) {
            return null;
        }
        var raw = storageGetItem(key);
        if (!raw) {
            return null;
        }
        try {
            var data = JSON.parse(raw);
            if (!data || typeof data !== 'object') {
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    function saveDocumentProgress(key, data) {
        if (!key || !data) {
            return;
        }
        storageSetItem(key, JSON.stringify(data));
    }

    function persistReadingProgress() {
        if (labRestoringProgress || !activeDocumentKey || !mount) {
            return;
        }
        var layout = TalesmithTsl.getTslLayout ? TalesmithTsl.getTslLayout() : 'pages';
        var payload = { layout: layout, updated: Date.now() };
        if (layout === 'pages') {
            var root = mount.querySelector('.tsl-root');
            if (!root || typeof root._tslPagerInfo !== 'function') {
                return;
            }
            var info = root._tslPagerInfo();
            payload.pageIndex = info.index;
            payload.scrollFrac = readProgressFromPager(root);
        } else if (layout === 'scroll') {
            var stage = mount.closest('.tsl-lab-stage') || document.querySelector('.tsl-lab-stage');
            if (!stage) {
                return;
            }
            payload.scrollFrac = readProgressFromScroll(stage);
        } else {
            return;
        }
        saveDocumentProgress(activeDocumentKey, payload);
    }

    function saveCurrentReadingProgress() {
        persistReadingProgress();
    }

    function restoreLabReadingPosition() {
        if (!activeDocumentKey || !mount) {
            updateFabReadProgress(0);
            return;
        }
        var saved = loadDocumentProgress(activeDocumentKey);
        if (!saved) {
            updateFabReadProgress(0);
            return;
        }
        if (typeof saved.scrollFrac === 'number') {
            updateFabReadProgress(saved.scrollFrac);
        }
        labRestoringProgress = true;
        var layout = TalesmithTsl.getTslLayout ? TalesmithTsl.getTslLayout() : 'pages';
        if (saved.layout === 'pages' && layout === 'pages' && typeof saved.pageIndex === 'number') {
            var root = mount.querySelector('.tsl-root');
            var targetIdx = Math.max(0, saved.pageIndex);
            var tries = 0;
            function finishRestore() {
                labRestoringProgress = false;
                persistReadingProgress();
            }
            function tryPageRestore() {
                if (!root || typeof root._tslPagerGoToIndex !== 'function') {
                    if (tries < 24) {
                        tries += 1;
                        requestAnimationFrame(tryPageRestore);
                    } else {
                        finishRestore();
                    }
                    return;
                }
                root._tslPagerGoToIndex(targetIdx);
                updateFabReadProgress(readProgressFromPager(root));
                finishRestore();
            }
            requestAnimationFrame(tryPageRestore);
            return;
        }
        if (saved.layout === 'scroll' && layout === 'scroll' && typeof saved.scrollFrac === 'number') {
            var stage = mount.closest('.tsl-lab-stage') || document.querySelector('.tsl-lab-stage');
            if (!stage) {
                labRestoringProgress = false;
                return;
            }
            var frac = Math.min(1, Math.max(0, saved.scrollFrac));
            var scrollTries = 0;
            function finishRestore() {
                labRestoringProgress = false;
                persistReadingProgress();
            }
            function tryScrollRestore() {
                var range = stage.scrollHeight - stage.clientHeight;
                if (range < 1) {
                    if (scrollTries < 24) {
                        scrollTries += 1;
                        requestAnimationFrame(tryScrollRestore);
                        return;
                    }
                    updateFabReadProgress(frac);
                    finishRestore();
                    return;
                }
                stage.scrollTop = frac * range;
                updateFabReadProgress(readProgressFromScroll(stage));
                finishRestore();
            }
            requestAnimationFrame(function () {
                requestAnimationFrame(tryScrollRestore);
            });
            return;
        }
        labRestoringProgress = false;
    }

    function readProgressFromPager(root) {
        if (!root || typeof root._tslPagerInfo !== 'function') {
            return 0;
        }
        var info = root._tslPagerInfo();
        if (!info.total) {
            return 0;
        }
        if (info.total < 2) {
            return 1;
        }
        return info.index / (info.total - 1);
    }

    function readProgressFromScroll(stage) {
        if (!stage) {
            return 0;
        }
        var range = stage.scrollHeight - stage.clientHeight;
        if (range < 1) {
            return 1;
        }
        return Math.min(1, Math.max(0, stage.scrollTop / range));
    }

    function updateFabReadProgress(frac) {
        if (!fabToggle) {
            return;
        }
        frac = Math.min(1, Math.max(0, Number(frac) || 0));
        fabToggle.style.setProperty('--tsl-lab-read-progress', String(frac));
        var pct = Math.round(frac * 100);
        if (pct > 0 && pct < 100) {
            fabToggle.title = 'Lab & reading settings · ' + pct + '% read';
        } else if (pct >= 100) {
            fabToggle.title = 'Lab & reading settings · finished';
        } else {
            fabToggle.title = 'Lab & reading settings';
        }
    }

    function detachScrollProgress() {
        if (labScrollStage && labScrollHandler) {
            labScrollStage.removeEventListener('scroll', labScrollHandler);
        }
        labScrollStage = null;
        labScrollHandler = null;
    }

    function wireLabReadProgress() {
        detachScrollProgress();
        if (!mount) {
            updateFabReadProgress(0);
            return;
        }
        var root = mount.querySelector('.tsl-root');
        if (root && typeof root._tslPagerSetOnChange === 'function') {
            root._tslPagerSetOnChange(null);
        }
        var layout = TalesmithTsl.getTslLayout ? TalesmithTsl.getTslLayout() : 'pages';
        if (layout === 'pages' && root && typeof root._tslPagerSetOnChange === 'function') {
            root._tslPagerSetOnChange(function () {
                updateFabReadProgress(readProgressFromPager(root));
                persistReadingProgress();
                showLabFabTransient();
            });
            return;
        }
        if (layout === 'scroll') {
            var stage = mount.closest('.tsl-lab-stage') || document.querySelector('.tsl-lab-stage');
            if (stage) {
                labScrollHandler = function () {
                    updateFabReadProgress(readProgressFromScroll(stage));
                    clearTimeout(scrollSaveTimer);
                    scrollSaveTimer = setTimeout(function () {
                        persistReadingProgress();
                    }, 280);
                };
                labScrollStage = stage;
                stage.addEventListener('scroll', labScrollHandler, { passive: true });
                requestAnimationFrame(function () {
                    updateFabReadProgress(readProgressFromScroll(stage));
                });
                return;
            }
        }
        updateFabReadProgress(0);
    }

    function setContentsOpen(open) {
        if (!contentsPanel) {
            return;
        }
        contentsPanel.hidden = !open;
        var body = document.querySelector('.tsl-lab-body');
        if (body) {
            if (open) {
                body.setAttribute('data-tsl-lab-contents-open', '');
            } else {
                body.removeAttribute('data-tsl-lab-contents-open');
            }
        }
        if (contentsToggle) {
            contentsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            contentsToggle.classList.toggle('is-on', open);
        }
    }

    function rebuildLabContents(parsed) {
        if (!contentsNav || !parsed || !TalesmithTsl.collectDocumentOutline) {
            return;
        }
        contentsNav.textContent = '';
        var entries = TalesmithTsl.collectDocumentOutline(parsed.blocks || []);
        if (!entries.length) {
            var empty = document.createElement('p');
            empty.className = 'tsl-lab-toc-empty';
            empty.textContent = 'No headings in this document.';
            contentsNav.appendChild(empty);
            return;
        }
        entries.forEach(function (e) {
            var a = document.createElement('a');
            a.className = 'tsl-lab-toc-link tsl-lab-toc-link--h' + e.level;
            a.href = '#' + TalesmithTsl.headingAnchorId({ id: e.id });
            a.textContent = e.text;
            a.addEventListener('click', function (ev) {
                ev.preventDefault();
                var hash = a.getAttribute('href');
                var leanRoot = mount && mount.querySelector('.studio-lean-tsl');
                var pagerRoot = mount && mount.querySelector('.tsl-root');
                var navRoot = pagerRoot || leanRoot || mount;
                if (navRoot && TalesmithTsl.navigateToInDocumentAnchor && TalesmithTsl.findInDocumentAnchorTarget) {
                    var target = TalesmithTsl.findInDocumentAnchorTarget(hash, navRoot)
                        || TalesmithTsl.findInDocumentAnchorTarget(hash, mount);
                    if (target && TalesmithTsl.navigateToInDocumentAnchor(target, navRoot)) {
                        return;
                    }
                }
                var target = document.getElementById(TalesmithTsl.headingAnchorId({ id: e.id }));
                if (pagerRoot && target && typeof pagerRoot._tslPagerGoToElement === 'function') {
                    pagerRoot._tslPagerGoToElement(target);
                } else if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            contentsNav.appendChild(a);
        });
    }

    if (contentsToggle) {
        contentsToggle.addEventListener('click', function () {
            setLabPanelOpen(false);
            setContentsOpen(contentsPanel && contentsPanel.hidden);
        });
    }
    if (contentsClose) {
        contentsClose.addEventListener('click', function () {
            setContentsOpen(false);
        });
    }

    if (printBtn) {
        printBtn.addEventListener('click', function () {
            window.print();
        });
    }

    function syncChromeTheme() {
        var prefs = TalesmithTsl.getReadingPrefs ? TalesmithTsl.getReadingPrefs() : null;
        var theme = prefs && (prefs.theme === 'sepia' || prefs.theme === 'dark') ? prefs.theme : 'light';
        document.documentElement.setAttribute('data-tsl-reader-theme', theme);
    }

    document.addEventListener('tsl:readingprefs', function () {
        saveCurrentReadingProgress();
        syncChromeTheme();
        if (settings && TalesmithTsl.syncReadingPrefsUI) {
            TalesmithTsl.syncReadingPrefsUI(settings);
        }
        requestAnimationFrame(wireLabReadProgress);
    });
    syncChromeTheme();

    function setStatus(msg, isError) {
        if (!status) {
            return;
        }
        status.textContent = msg || '';
        status.classList.toggle('is-error', !!isError);
    }

    function resolveTslUrl(url) {
        if (!url || /^(\.\.|\/|https?:)/i.test(url)) {
            return url;
        }
        return '../' + url.replace(/^\//, '');
    }

    function labDocumentsConfig() {
        var raw = typeof window !== 'undefined' ? window.__TslLabDocuments : null;
        var cfg = raw && typeof raw === 'object' ? raw : {};
        var docs = Array.isArray(cfg.documents) ? cfg.documents : [];
        var list = [];
        docs.forEach(function (entry) {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            var label = entry.label != null ? String(entry.label).trim() : '';
            var url = entry.url != null ? String(entry.url).trim() : '';
            if (!label || !url) {
                return;
            }
            list.push({
                label: label,
                url: url,
                selected: !!entry.selected
            });
        });
        var defaultUrl = cfg.defaultUrl != null ? String(cfg.defaultUrl).trim() : '';
        if (!defaultUrl) {
            list.some(function (d) {
                if (d.selected) {
                    defaultUrl = d.url;
                    return true;
                }
                return false;
            });
        }
        if (!defaultUrl && list.length) {
            defaultUrl = list[0].url;
        }
        return {
            placeholder: cfg.placeholder != null ? String(cfg.placeholder) : 'Choose…',
            defaultUrl: defaultUrl,
            documents: list
        };
    }

    function populateSampleSelect() {
        if (!sampleSelect) {
            return labDocumentsConfig();
        }
        var cfg = labDocumentsConfig();
        sampleSelect.textContent = '';
        var blank = document.createElement('option');
        blank.value = '';
        blank.textContent = cfg.placeholder;
        sampleSelect.appendChild(blank);
        cfg.documents.forEach(function (doc) {
            var opt = document.createElement('option');
            opt.value = doc.url;
            opt.textContent = doc.label;
            if (doc.selected) {
                opt.selected = true;
            }
            sampleSelect.appendChild(opt);
        });
        return cfg;
    }

    function syncSampleSelect(url) {
        if (!sampleSelect || !url) {
            return;
        }
        var resolved = resolveTslUrl(url);
        var found = false;
        Array.prototype.forEach.call(sampleSelect.options, function (opt) {
            if (!opt.value) {
                return;
            }
            if (opt.value === url || resolveTslUrl(opt.value) === resolved) {
                sampleSelect.value = opt.value;
                found = true;
            }
        });
        if (!found) {
            sampleSelect.value = '';
        }
    }

    function isLeanHtml(text) {
        return /<\s*article\b/i.test(text) || /studio:tsl-settings/i.test(text) || /studio-lean-tsl/i.test(text);
    }

    function showText(text, label) {
        var parsed;
        if (isLeanHtml(text)) {
            lastEnvelope = TalesmithTsl.leanHtmlToEnvelope(text);
            parsed = TalesmithTsl.parse(TalesmithTsl.envelopeToText(lastEnvelope));
            if (downloadBtn) {
                downloadBtn.hidden = false;
            }
        } else {
            parsed = TalesmithTsl.parse(text);
            lastEnvelope = {
                format: 'talesmith-lang',
                version: 1,
                header: parsed.header,
                document: { blocks: parsed.blocks }
            };
            if (downloadBtn) {
                downloadBtn.hidden = false;
            }
        }
        lastParsed = parsed;
        clearLabDocHighlights();
        TalesmithTsl.display(mount, parsed);
        if (TalesmithTsl.syncMountHostLayout) {
            TalesmithTsl.syncMountHostLayout(mount);
            requestAnimationFrame(function () {
                TalesmithTsl.syncMountHostLayout(mount);
            });
        }
        if (settings && TalesmithTsl.syncReadingPrefsUI) {
            TalesmithTsl.syncReadingPrefsUI(settings);
        }
        rebuildLabContents(parsed);
        rebuildBookmarkList();
        labSearchHits = [];
        labSearchHitIndex = -1;
        setSearchStatus('');
        if (searchResultsEl) {
            searchResultsEl.textContent = '';
        }
        setStatus('');
        if (loadDocumentProgress(activeDocumentKey)) {
            labRestoringProgress = true;
        }
        requestAnimationFrame(function () {
            wireLabReadProgress();
            requestAnimationFrame(function () {
                restoreLabReadingPosition();
            });
        });
    }

    function openUrl(url) {
        saveCurrentReadingProgress();
        url = resolveTslUrl(url);
        saveLastLabDocumentUrl(url);
        lastUrl = url;
        setActiveDocumentKey(url, '');
        var savedEarly = loadDocumentProgress(activeDocumentKey);
        if (savedEarly && typeof savedEarly.scrollFrac === 'number') {
            updateFabReadProgress(savedEarly.scrollFrac);
        }
        syncSampleSelect(url);
        setStatus('');
        fetch(url).then(function (res) {
            if (!res.ok) {
                throw new Error('Could not load ' + url);
            }
            return res.text();
        }).then(function (text) {
            showText(text, url);
        }).catch(function (err) {
            setStatus(err.message || String(err), true);
        });
    }

    var fabAutoHideTimer = null;
    var FAB_AUTO_HIDE_MS = 3200;

    function showLabFabTransient() {
        if (!fabRoot || typeof window === 'undefined' || !window.matchMedia) {
            return;
        }
        if (!window.matchMedia('(max-width: 899px)').matches) {
            fabRoot.classList.remove('is-collapsed');
            return;
        }
        if (isLabPanelOpen()) {
            fabRoot.classList.remove('is-collapsed');
            return;
        }
        fabRoot.classList.remove('is-collapsed');
        clearTimeout(fabAutoHideTimer);
        fabAutoHideTimer = setTimeout(function () {
            if (fabRoot && !isLabPanelOpen()) {
                fabRoot.classList.add('is-collapsed');
            }
        }, FAB_AUTO_HIDE_MS);
    }

    function wireLabFabAutoHide() {
        if (!fabRoot) {
            return;
        }
        showLabFabTransient();
        var stage = document.querySelector('.tsl-lab-stage');
        var onActivity = function () {
            showLabFabTransient();
        };
        ['scroll', 'touchstart', 'pointerdown'].forEach(function (ev) {
            if (stage) {
                stage.addEventListener(ev, onActivity, { passive: true });
            }
            document.addEventListener(ev, onActivity, { passive: true, capture: true });
        });
        if (mount) {
            mount.addEventListener('click', onActivity);
        }
        document.addEventListener('keydown', onActivity);
    }

    function setLabPanelOpen(open) {
        if (!fabRoot || !fabToggle || !fabPanel) {
            return;
        }
        fabRoot.classList.toggle('is-open', open);
        fabToggle.classList.toggle('is-open', open);
        fabToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (fabBackdrop) {
            fabBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
        }
        if (open) {
            fabRoot.classList.remove('is-collapsed');
            clearTimeout(fabAutoHideTimer);
        } else {
            showLabFabTransient();
        }
    }

    function isLabPanelOpen() {
        return fabRoot && fabRoot.classList.contains('is-open');
    }

    if (sampleSelect) {
        sampleSelect.addEventListener('change', function () {
            var url = sampleSelect.value;
            if (url) {
                openUrl(url);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) {
                return;
            }
            saveCurrentReadingProgress();
            lastUrl = '';
            setActiveDocumentKey('', file.name);
            if (sampleSelect) {
                sampleSelect.value = '';
            }
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    showText(String(reader.result || ''), file.name);
                } catch (e) {
                    setStatus(e.message || 'Invalid JSON', true);
                }
            };
            reader.readAsText(file);
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
            if (!lastEnvelope) {
                return;
            }
            var blob = new Blob([TalesmithTsl.envelopeToText(lastEnvelope)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'document.tsl';
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }

    if (fabToggle && fabPanel) {
        fabToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            setLabPanelOpen(!isLabPanelOpen());
        });

        fabPanel.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        if (fabBackdrop) {
            fabBackdrop.addEventListener('click', function () {
                setLabPanelOpen(false);
            });
        }

        document.addEventListener('click', function (e) {
            if (!isLabPanelOpen()) {
                return;
            }
            if (fabRoot && fabRoot.contains(e.target)) {
                return;
            }
            setLabPanelOpen(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isLabPanelOpen()) {
                setLabPanelOpen(false);
                fabToggle.focus();
            }
        });
    }

    window.addEventListener('pagehide', saveCurrentReadingProgress);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentReadingProgress();
        }
    });

    wireLabFabAutoHide();
    wireLabKeyboardShortcuts();

    var docCfg = populateSampleSelect();
    var params = new URLSearchParams(window.location.search);
    var q = params.get('tsl');
    if (q) {
        openUrl(q);
    } else {
        var lastDoc = loadLastLabDocumentUrl();
        if (lastDoc) {
            openUrl(lastDoc);
        } else if (docCfg.defaultUrl) {
            openUrl(docCfg.defaultUrl);
        }
    }
}());
