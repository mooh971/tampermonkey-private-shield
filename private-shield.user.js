// ==UserScript==
// @name         🔒 Tampermonkey Private Shield
// @namespace    https://github.com/mooh971/tampermonkey-private-shield
// @version      1.0.11
// @description  Auto-hide emails and phone numbers on any webpage
// @author       mooh971
// @match        *://*/*
// @grant        GM_addStyle
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// @downloadURL  https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// ==/UserScript==

(function () {
    'use strict';

    const PATTERN = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})|((?<![0-9٠-٩])[0-9٠-٩]{1,3}\.[0-9٠-٩]{1,3}\.[0-9٠-٩]{1,3}\.[0-9٠-٩]{1,3}(?::[0-9٠-٩]{1,5})?(?![0-9٠-٩]))|((?<![0-9٠-٩])(?:\+|00|٠٠)?[ \u200e\u200f\u202a-\u202e\u2066-\u2069]*[0-9٠-٩](?:[\s\-.()\u200e\u200f\u202a-\u202e\u2066-\u2069]*[0-9٠-٩]){6,14}(?![0-9٠-٩]))/g;
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'HEAD', 'LINK', 'META']);
    const processed = new WeakSet();
    let badgeShown = false;
    const tooltipText = 'Click to reveal 🔒';

    GM_addStyle(`
        .ps-hidden {
            cursor: pointer !important;
            display: inline-block !important;
            padding: 0 4px !important;
            border-radius: 4px !important;
            border: 1px dashed rgba(0,105,111,0.5) !important;
            background: rgba(0,105,111,0.08) !important;
            color: transparent !important;
            text-shadow: 0 0 6px rgba(0,0,0,0.55) !important;
            filter: none !important;
            user-select: none !important;
            transition: all 0.15s ease-in-out !important;
        }
        .ps-visible {
            cursor: pointer !important;
            display: inline-block !important;
            padding: 0 4px !important;
            border-radius: 4px !important;
            border: 1px solid rgba(0,105,111,0.5) !important;
            background: rgba(0,105,111,0.06) !important;
            color: #01696f !important;
            font-weight: 600 !important;
            text-shadow: none !important;
            filter: none !important;
            user-select: auto !important;
            transition: all 0.15s ease-in-out !important;
        }
        #ps-badge {
            position: fixed !important;
            bottom: 12px !important;
            right: 12px !important;
            z-index: 2147483647 !important;
            padding: 2px 8px !important;
            border-radius: 4px !important;
            border: 1px solid rgba(0,105,111,0.3) !important;
            background: transparent !important;
            color: rgba(0,105,111,0.6) !important;
            font-family: sans-serif !important;
            font-size: 10px !important;
            white-space: nowrap !important;
            cursor: pointer !important;
            transition: opacity 0.35s ease, transform 0.35s ease !important;
        }
        #ps-badge:hover { background: rgba(0,105,111,0.08) !important; color: #01696f !important; }
        #ps-badge.ps-out { opacity: 0 !important; transform: translateY(6px) !important; pointer-events: none !important; }
    `);

    function toEnglishNumerals(str) {
        return str.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    }

    function isTime(text) {
        const norm = toEnglishNumerals(text.trim());
        return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(norm);
    }

    // High fidelity strict validation bounds matching correct structures exclusively
    // Re-verified with standard IPv4 network specifications
    function isIP(text) {
        const norm = toEnglishNumerals(text.trim()).split(':')[0];
        const parts = norm.split('.');
        if (parts.length !== 4) return false;
        return parts.every(p => {
            if (!p || p.length > 3) return false;
            const n = parseInt(p, 10);
            return !isNaN(n) && n >= 0 && n <= 255;
        });
    }

    function isDate(text) {
        const norm = toEnglishNumerals(text.trim());
        if (/\b\d{4}[\s\-/.]\d{1,2}[\s\-/.]\d{1,2}\b/.test(norm) || 
            /\b\d{1,2}[\s\-/.]\d{1,2}[\s\-/.]\d{4}\b/.test(norm)) {
            return true;
        }
        const digitsOnly = norm.replace(/[^0-9]/g, '');
        if (digitsOnly.length === 6 || digitsOnly.length === 8) {
            return /^(19|20|14)/.test(digitsOnly);
        }
        return false;
    }

    function hasTargetData(text) {
        if (!text) return false;
        if (text.includes('@')) return true;
        const norm = toEnglishNumerals(text);
        if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(norm)) return true;
        const clean = norm.replace(/[\s\-().,،]/g, '');
        return /[0-9]{7,}/.test(clean);
    }

    function maskAttributes(el) {
        if (!el || !el.getAttribute) return;
        ['title', 'aria-label'].forEach(attr => {
            if (el.hasAttribute(attr)) {
                const val = el.getAttribute(attr);
                if (hasTargetData(val)) {
                    PATTERN.lastIndex = 0;
                    if (PATTERN.test(val)) {
                        PATTERN.lastIndex = 0;
                        const masked = val.replace(PATTERN, (match) => {
                            const normVal = toEnglishNumerals(match).trim();
                            if (!match.includes('@') && !isIP(match)) {
                                if (isTime(match) || isDate(match)) return match;
                                if (/[\d٠-٩]+[.٫]\d+[\s\-]+[\d٠-٩]+[.٫]\d+/.test(normVal)) return match;
                                if (!/^(05|01|06|07|09|00|\+|966|964|90|971|965|968|973|974|962|961|20|212|213|216|218|249|967|880)/.test(normVal)) {
                                    const segments = normVal.split(/[\s\-]+/);
                                    let isFinancialBypass = false;
                                    for (let seg of segments) {
                                        const cleanSeg = seg.replace(/[^0-9]/g, '');
                                        if ((seg.includes('.') || seg.includes('٫') || cleanSeg.length >= 5)) {
                                            isFinancialBypass = true;
                                            break;
                                        }
                                    }
                                    if (isFinancialBypass) return match;
                                }
                                const digitsOnly = normVal.replace(/[^0-9]/g, '');
                                if (digitsOnly.length < 7) return match;
                            }
                            return '🔒';
                        });
                        el.setAttribute(attr, masked);
                    }
                }
            }
        });
    }

    function enforceAbsoluteClean(element, isVisible) {
        if (isVisible) {
            element.removeAttribute('title');
            const nestedWrapper = element.querySelector('.ssb-blur-wrapper');
            if (nestedWrapper) {
                element.innerHTML = ''; 
                element.textContent = nestedWrapper.textContent; 
            }
        } else {
            element.setAttribute('title', tooltipText);
        }
    }

    function maskNode(node) {
        if (processed.has(node)) return;
        if (node.parentElement?.classList.contains('ssb-blur-wrapper') || node.parentElement?.closest?.('.ps-hidden, .ps-visible')) return;

        const text = node.textContent;
        if (!hasTargetData(text)) return;

        const parent = node.parentNode;
        if (!parent || processed.has(parent) || SKIP_TAGS.has(parent.tagName) || parent.closest?.('head') || parent.isContentEditable) return;

        PATTERN.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, match, found = false;

        while ((match = PATTERN.exec(text)) !== null) {
            const val = match[0];
            const normVal = toEnglishNumerals(val).trim();

            if (!val.includes('@') && !isIP(val)) {
                if (isTime(val)) {
                    continue;
                }

                if (/[\d٠-٩]+[.٫]\d+[\s\-]+[\d٠-٩]+[.٫]\d+/.test(normVal)) {
                    continue;
                }

                if (!/^(05|01|06|07|09|00|\+|966|964|90|971|965|968|973|974|962|961|20|212|213|216|218|249|967|880)/.test(normVal)) {
                    const segments = normVal.split(/[\s\-]+/);
                    let isFinancialBypass = false;
                    for (let seg of segments) {
                        const cleanSeg = seg.replace(/[^0-9]/g, '');
                        if ((seg.includes('.') || seg.includes('٫') || cleanSeg.length >= 5)) {
                            isFinancialBypass = true;
                            break;
                        }
                    }
                    if (isFinancialBypass) {
                        continue;
                    }
                }

                if (val.includes('.')) {
                    if (!/^(05|01|06|07|09|00|\+|966|964|90|971|965|968|973|974|962|961|20|212|213|216|218|249|967|880)/.test(normVal)) {
                        continue;
                    }
                }

                if (isDate(val)) {
                    continue;
                }

                const digitsOnly = normVal.replace(/[^0-9]/g, '');
                if (digitsOnly.length < 7) {
                    continue;
                }
            }

            found = true;
            if (match.index > last) {
                frag.appendChild(document.createTextNode(text.slice(last, match.index)));
            }

            const span = document.createElement('span');
            span.className = 'ps-hidden';
            span.setAttribute('title', tooltipText);
            span.textContent = val;
            
            span.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isHidden = span.className === 'ps-hidden';
                span.className = isHidden ? 'ps-visible' : 'ps-hidden';
                enforceAbsoluteClean(span, isHidden);
                refreshBadge();
            });
            processed.add(span);
            frag.appendChild(span);
            last = match.index + val.length;
        }

        if (!found) return;
        if (last < text.length) {
            frag.appendChild(document.createTextNode(text.slice(last)));
        }

        processed.add(node);
        parent.replaceChild(frag, node);
    }

    function scanRoot(root) {
        if (!root?.querySelectorAll) return;

        if (root.nodeType === Node.ELEMENT_NODE) {
            maskAttributes(root);
        }
        root.querySelectorAll('*').forEach(maskAttributes);

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                if (!processed.has(n) && hasTargetData(n.textContent)) {
                    if (SKIP_TAGS.has(n.parentElement?.tagName) || n.parentElement?.closest?.('head, .ps-hidden, .ps-visible') || n.parentElement?.isContentEditable) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            }
        });

        const nodes = [];
        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }
        nodes.forEach(maskNode);
        refreshBadge();
    }

    function createBadge() {
        if (document.getElementById('ps-badge')) return;

        const badge = document.createElement('div');
        badge.id = 'ps-badge';

        let allVisible = false;
        badge.addEventListener('click', () => {
            allVisible = !allVisible;
            document.querySelectorAll('.ps-hidden, .ps-visible').forEach(el => {
                el.className = allVisible ? 'ps-visible' : 'ps-hidden';
                enforceAbsoluteClean(el, allVisible);
            });
            refreshBadge();
        });

        badge.addEventListener('mouseenter', () => {
            clearTimeout(window._psTimer);
            badge.classList.remove('ps-out');
        });

        badge.addEventListener('mouseleave', () => {
            window._psTimer = setTimeout(() => badge.classList.add('ps-out'), 3000);
        });

        document.body.appendChild(badge);
        refreshBadge();
    }

    function refreshBadge() {
        const badge = document.getElementById('ps-badge');
        if (!badge) return;

        const total = document.querySelectorAll('.ps-hidden, .ps-visible').length;
        badge.textContent = total ? `🔒 ${total} hidden` : '🔒 none';

        if (!badgeShown) {
            badge.classList.remove('ps-out');
            clearTimeout(window._psTimer);
            window._psTimer = setTimeout(() => {
                badge.classList.add('ps-out');
                badgeShown = true;
            }, 3000);
        }
    }

    const observer = new MutationObserver(mutations => {
        mutations.forEach(({ addedNodes, characterData, target, type }) => {
            if (type === 'attributes') {
                if (target.nodeType === Node.ELEMENT_NODE && !SKIP_TAGS.has(target.tagName) && !target.closest?.('head, .ps-hidden, .ps-visible')) {
                    maskAttributes(target);
                }
                return;
            }
            if (characterData && target.nodeType === Node.TEXT_NODE) {
                if (!SKIP_TAGS.has(target.parentElement?.tagName) && !target.parentElement?.closest?.('head, .ps-hidden, .ps-visible')) {
                    maskNode(target);
                }
                return;
            }
            addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (!SKIP_TAGS.has(node.tagName) && !node.closest?.('head, .ps-hidden, .ps-visible')) scanRoot(node);
                }
                if (node.nodeType === Node.TEXT_NODE) {
                    if (!SKIP_TAGS.has(node.parentElement?.tagName) && !node.parentElement?.closest?.('head, .ps-hidden, .ps-visible')) maskNode(node);
                }
            });
        });
    });

    observer.observe(document.documentElement ?? document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'aria-label']
    });

    function init() {
        createBadge();
        scanRoot(document.body);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
