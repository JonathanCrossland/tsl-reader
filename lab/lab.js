(function () {
    'use strict';

    var mount = document.querySelector('[data-tsl-mount]');
    var status = document.querySelector('[data-tsl-status]');
    var fileInput = document.querySelector('[data-tsl-file]');
    var downloadBtn = document.querySelector('[data-tsl-download]');
    var sampleSelect = document.querySelector('[data-tsl-sample-select]');
    var readToggle = document.querySelector('[data-tsl-read-toggle]');
    var readMenu = document.querySelector('[data-tsl-read-menu]');
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

    function setContentsOpen(open) {
        if (!contentsPanel) {
            return;
        }
        contentsPanel.hidden = !open;
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
                var root = mount && mount.querySelector('.tsl-root');
                if (root && TalesmithTsl.navigateToInDocumentAnchor && TalesmithTsl.findInDocumentAnchorTarget) {
                    var target = TalesmithTsl.findInDocumentAnchorTarget(hash, root)
                        || TalesmithTsl.findInDocumentAnchorTarget(hash, mount.querySelector('.studio-lean-tsl') || mount);
                    if (target && TalesmithTsl.navigateToInDocumentAnchor(target, root || mount)) {
                        return;
                    }
                }
                var target = document.getElementById(TalesmithTsl.headingAnchorId({ id: e.id }));
                if (root && target && typeof root._tslPagerGoToElement === 'function') {
                    root._tslPagerGoToElement(target);
                } else if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            contentsNav.appendChild(a);
        });
    }

    if (contentsToggle) {
        contentsToggle.addEventListener('click', function () {
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

    function syncPageFitRowVisibility() {
        var row = document.querySelector('[data-tsl-pagefit-row]');
        if (!row || !TalesmithTsl.getTslLayout) {
            return;
        }
        row.hidden = TalesmithTsl.getTslLayout() === 'scroll';
    }

    if (settings) {
        settings.addEventListener('click', function () {
            window.setTimeout(syncPageFitRowVisibility, 0);
        });
    }
    syncPageFitRowVisibility();

    function setStatus(msg, isError) {
        if (!status) {
            return;
        }
        status.textContent = msg || '';
        status.classList.toggle('is-error', !!isError);
    }

    function syncSampleSelect(url) {
        if (!sampleSelect || !url) {
            return;
        }
        var found = false;
        Array.prototype.forEach.call(sampleSelect.options, function (opt) {
            if (opt.value === url) {
                sampleSelect.value = url;
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
        rebuildLabContents(parsed);
        setStatus('Loaded ' + label);
    }

    function resolveTslUrl(url) {
        if (!url || /^(\.\.|\/|https?:)/i.test(url)) {
            return url;
        }
        return '../' + url.replace(/^\//, '');
    }

    function openUrl(url) {
        url = resolveTslUrl(url);
        lastUrl = url;
        syncSampleSelect(url);
        setStatus('Loading ' + url + '…');
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

    function syncReadMenuPosition() {
        if (!readToggle || !readMenu || readMenu.hidden) {
            return;
        }
        readMenu.style.marginLeft = '';
        readMenu.style.removeProperty('--tsl-lab-read-menu-top');

        if (window.matchMedia('(max-width: 720px)').matches) {
            var toggleRect = readToggle.getBoundingClientRect();
            readMenu.style.setProperty('--tsl-lab-read-menu-top', Math.round(toggleRect.bottom + 8) + 'px');
        }

        var margin = 16;
        var menuRect = readMenu.getBoundingClientRect();
        var shift = 0;
        if (menuRect.left < margin) {
            shift = margin - menuRect.left;
        } else if (menuRect.right > window.innerWidth - margin) {
            shift = window.innerWidth - margin - menuRect.right;
        }
        if (shift !== 0) {
            readMenu.style.marginLeft = shift + 'px';
        }
    }

    function setReadMenuOpen(open) {
        if (!readToggle || !readMenu) {
            return;
        }
        readToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        readMenu.hidden = !open;
        readToggle.classList.toggle('is-open', open);
        if (open) {
            requestAnimationFrame(syncReadMenuPosition);
        } else {
            readMenu.style.marginLeft = '';
            readMenu.style.removeProperty('--tsl-lab-read-menu-top');
        }
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
            lastUrl = '';
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

    if (readToggle && readMenu) {
        readToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = readMenu.hidden;
            setReadMenuOpen(open);
        });

        readMenu.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        document.addEventListener('click', function () {
            setReadMenuOpen(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !readMenu.hidden) {
                setReadMenuOpen(false);
                readToggle.focus();
            }
        });

        window.addEventListener('resize', function () {
            syncReadMenuPosition();
        });
    }

    var params = new URLSearchParams(window.location.search);
    var q = params.get('tsl');
    if (q) {
        openUrl(q);
    } else {
        openUrl('../spec/tsl-spec.tsl');
    }
}());
