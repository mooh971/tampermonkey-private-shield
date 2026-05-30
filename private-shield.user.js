// ==UserScript==
// @name         🔒 Tampermonkey Private Shield
// @namespace    https://github.com/mooh971/tampermonkey-private-shield
// @version      1.1.1
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

    const PATTERN = /([^\s,،<>]+@[^\s,،<>]+)|((?<![0-9٠-٩۰-۹.,٫])[0-9٠-٩۰-۹]{1,3}\.[0-9٠-٩۰-۹]{1,3}\.[0-9٠-٩۰-۹]{1,3}\.[0-9٠-٩۰-۹]{1,3}(?::[0-9٠-٩۰-۹]{1,5})?(?![0-9٠-٩۰-۹.,٫]))|((?<![0-9٠-٩۰-۹.,٫])(?:\+|00|٠٠)?[ \u200e\u200f\u202a-\u202e\u2066-\u2069\u200c\u200d]*[0-9٠-٩۰-۹](?:[ \t\-.()\u200e\u200f\u202a-\u202e\u2066-\u2069\u200c\u200d]{0,2}[0-9٠-٩۰-۹]){6,14}(?![0-9٠-٩۰-۹]))/g;
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
        return str
            .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200c\u200d]/g, '')
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    }

    function isEmail(text) {
        const str = text.trim();
        if (str.includes(' ')) return false;
        const parts = str.split('@');
        if (parts.length !== 2) return false;
        const local = parts[0];
        const domain = parts[1];
        if (!local || !domain) return false;
        if (domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) return false;
        const domainParts = domain.split('.');
        if (domainParts.length < 2) return false;
        return domainParts[domainParts.length - 1].length >= 2;
    }

    function isIP(text) {
        const norm = toEnglishNumerals(text.trim()).split(':')[0];
        const parts = norm.split('.');
        if (parts.length !== 4) return false;
        for (let i = 0; i < 4; i++) {
            const p = parts[i];
            if (!p || p.length > 3) return false;
            for (let j = 0; j < p.length; j++) {
                if (p[j] < '0' || p[j] > '9') return false;
            }
            const n = parseInt(p, 10);
            if (n < 0 || n > 255) return false;
        }
        return true;
    }

    function isPhone(text) {
        const norm = toEnglishNumerals(text).trim();
        let digits = '';
        for (let i = 0; i < norm.length; i++) {
            if (norm[i] >= '0' && norm[i] <= '9') digits += norm[i];
        }
        if (digits.length < 7 || digits.length > 15) return false;

        if (norm.startsWith('+')) {
            return (digits.length >= 9 && digits.length <= 15);
        }
        if (norm.startsWith('00')) {
            if (digits.startsWith('000')) return false;
            return (digits.length >= 11 && digits.length <= 15);
        }

        if (digits.startsWith('1')) {
            return digits.length === 11;
        }

        const countryCodes = ['20', '33', '44', '49', '90', '98', '961', '962', '964', '965', '966', '967', '968', '971', '973', '974', '212', '213', '216', '218', '249', '880'];
        for (let i = 0; i < countryCodes.length; i++) {
            if (digits.startsWith(countryCodes[i])) {
                if (digits.length >= 11 && digits.length <= 14) return true;
            }
        }

        const localPrefixes = ['05', '01', '06', '07', '09'];
        for (let i = 0; i < localPrefixes.length; i++) {
            if (digits.startsWith(localPrefixes[i])) {
                return (digits.length >= 9 && digits.length <= 12);
            }
        }

        if (digits.length >= 9 && digits.length <= 10) {
            if (['2', '3', '4', '5', '6', '7', '8', '9'].includes(digits[0])) return true;
        }

        if (digits.length >= 11 && digits.length <= 12) {
            if (digits.startsWith('0') || ['2', '3', '6', '7', '8', '9'].includes(digits[0])) return true;
        }

        return false;
    }

    function isTime(text) {
        const norm = toEnglishNumerals(text.trim());
        const parts = norm.split(':');
        if (parts.length !== 2 && parts.length !== 3) return false;
        return parts.every((p, idx) => {
            if (!p || p.length > 2) return false;
            for (let i = 0; i < p.length; i++) {
                if (p[i] < '0' || p[i] > '9') return false;
            }
            const val = parseInt(p, 10);
            if (idx === 0) return val >= 0 && val <= 23;
            return val >= 0 && val <= 59;
        });
    }

    function isDate(text) {
        const norm = toEnglishNumerals(text.trim());

        let delimiter = '';
        if (norm.includes('-')) delimiter = '-';
        else if (norm.includes('/')) delimiter = '/';
        else if (norm.includes('.')) delimiter = '.';

        if (delimiter) {
            const parts = norm.split(delimiter);
            if (parts.length === 3) {
                const hasYear = parts.some(p => p.length === 4 && (p.startsWith('19') || p.startsWith('20') || p.startsWith('14')));
                const validLengths = parts.every(p => p.length >= 1 && p.length <= 4);
                if (hasYear && validLengths) return true;
            }
        }

        let digits = '';
        for (let i = 0; i < norm.length; i++) {
            if (norm[i] >= '0' && norm[i] <= '9') digits += norm[i];
        }

        if (digits.length === 8) {
            const y = parseInt(digits.slice(0, 4), 10);
            const m = parseInt(digits.slice(4, 6), 10);
            const d = parseInt(digits.slice(6, 8), 10);
            if (((y >= 1900 && y <= 2099) || (y >= 1300 && y <= 1499)) && (m >= 1 && m <= 12) && (d >= 1 && d <= 31)) return true;
        }

        if (digits.length === 10) {
            const y = parseInt(digits.slice(0, 4), 10);
            const m = parseInt(digits.slice(4, 6), 10);
            const d = parseInt(digits.slice(6, 8), 10);
            const h = parseInt(digits.slice(8, 10), 10);
            if (((y >= 1900 && y <= 2099) || (y >= 1300 && y <= 1499)) && (m >= 1 && m <= 12) && (d >= 1 && d <= 31) && (h >= 0 && h <= 23)) return true;
        }

        return false;
    }

    function shouldMask(val) {
        if (val.includes('@')) return isEmail(val);
        if (isIP(val)) return true;
        if (isTime(val) || isDate(val)) return false;

        const normVal = toEnglishNumerals(val).trim();

        if (normVal.includes('.') && normVal.includes('-')) return false;
        if (normVal.includes('/')) return false;

        if (normVal.includes('.')) {
            const parts = normVal.split('.');
            if (parts.length === 2) return false;

            if (parts.length > 2) {
                if (parts[0].length === 1 && (parts[0] === '0' || parts[0] === '1')) return false;
            }

            if (parts[parts.length - 1].replace(/[^0-9]/g, '').length > 4) return false;
        }

        return isPhone(val);
    }

    function hasTargetData(text) {
        if (!text) return false;
        if (text.includes('@')) return true;
        const norm = toEnglishNumerals(text);
        if (norm.includes('.')) {
            const parts = norm.split('.');
            if (parts.length >= 4) return true;
        }
        let count = 0;
        for (let i = 0; i < norm.length; i++) {
            const c = norm[i];
            if (c >= '0' && c <= '9') {
                count++;
                if (count >= 7) return true;
            } else if (c !== ' ' && c !== '-' && c !== '(' && c !== ')' && c !== '.' && c !== ',' && c !== '،') {
                count = 0;
            }
        }
        return false;
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
                        const masked = val.replace(PATTERN, (match) => shouldMask(match) ? '🔒' : match);
                        if (val !== masked) {
                            el.setAttribute(attr, masked);
                        }
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
            if (!shouldMask(val)) {
                continue;
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
        root.querySelectorAll('[title], [aria-label]').forEach(maskAttributes);

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
        badge.textContent = total ? '🔒 ' + total + ' hidden' : '🔒 none';

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
        mutations.forEach(({ addedNodes, characterData, target }) => {
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
        characterData: true
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
