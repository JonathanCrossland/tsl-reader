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

    function setReadMenuOpen(open) {
        if (!readToggle || !readMenu) {
            return;
        }
        readToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        readMenu.hidden = !open;
        readToggle.classList.toggle('is-open', open);
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
    }

    var params = new URLSearchParams(window.location.search);
    var q = params.get('tsl');
    if (q) {
        openUrl(q);
    } else {
        openUrl('../spec/tsl-spec.tsl');
    }
}());
