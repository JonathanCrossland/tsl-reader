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
    var settings = document.querySelector('[data-tsl-settings]');
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

    var docCfg = populateSampleSelect();
    var params = new URLSearchParams(window.location.search);
    var q = params.get('tsl');
    if (q) {
        openUrl(q);
    } else if (docCfg.defaultUrl) {
        openUrl(docCfg.defaultUrl);
    }
}());
