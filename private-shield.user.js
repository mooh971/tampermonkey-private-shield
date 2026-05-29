// ==UserScript==
// @name         🔒 Tampermonkey Private Shield
// @namespace    https://github.com/mooh971/tampermonkey-private-shield
// @version      1.0.2
// @description  Auto-hide emails, phone numbers, and national IDs on any webpage
// @author       mooh971
// @match        *://*/*
// @grant        GM_addStyle
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// @downloadURL  https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Patterns
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const PATTERN   = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})|(?:\+966\s?|0)(5\d[\s\-]?\d{3}[\s\-]?\d{4})|(?<!\d)([123]\d{9})(?!\d)/g;
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);
    const processed = new WeakSet();
    let   badgeShown = false;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Styles
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
            user-select: none !important;
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
        #ps-badge:hover {
            background: rgba(0,105,111,0.08) !important;
            color: #01696f !important;
        }
        #ps-badge.ps-out {
            opacity: 0 !important;
            transform: translateY(6px) !important;
            pointer-events: none !important;
        }
    `);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Core
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function maskNode(node) {
        if (processed.has(node)) return;

        const text = node.textContent;
        if (!text.includes('@') && !text.includes('05') && !text.includes('+966') && !/[123]\d{9}/.test(text)) return;

        const parent = node.parentNode;
        if (!parent) return;
        if (processed.has(parent)) return;
        if (parent.closest?.('.ps-hidden, .ps-visible')) return;
        if (SKIP_TAGS.has(parent.tagName)) return;
        if (parent.isContentEditable) return;

        PATTERN.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, match, found = false;

        while ((match = PATTERN.exec(text)) !== null) {
            found = true;
            if (match.index > last)
                frag.appendChild(document.createTextNode(text.slice(last, match.index)));

            const span = document.createElement('span');
            span.className = 'ps-hidden';
            span.textContent = match[0];
            span.addEventListener('click', function (e) {
                e.stopPropagation();
                this.className = this.className === 'ps-hidden' ? 'ps-visible' : 'ps-hidden';
                refreshBadge();
            });
            processed.add(span);
            frag.appendChild(span);
            last = match.index + match[0].length;
        }

        if (!found) return;
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

        processed.add(node);
        parent.replaceChild(frag, node);
    }

    function scanRoot(root) {
        if (!root?.querySelectorAll) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                const t = n.textContent;
                if (!t.includes('@') && !t.includes('05') && !t.includes('+966') && !/[123]\d{9}/.test(t))
                    return NodeFilter.FILTER_REJECT;
                if (processed.has(n)) return NodeFilter.FILTER_REJECT;
                if (SKIP_TAGS.has(n.parentElement?.tagName)) return NodeFilter.FILTER_REJECT;
                if (n.parentElement?.isContentEditable) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(maskNode);
        refreshBadge();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Badge
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function createBadge() {
        if (document.getElementById('ps-badge')) return;

        const badge = document.createElement('div');
        badge.id = 'ps-badge';

        let allVisible = false;
        badge.addEventListener('click', () => {
            allVisible = !allVisible;
            document.querySelectorAll('.ps-hidden, .ps-visible')
                .forEach(el => el.className = allVisible ? 'ps-visible' : 'ps-hidden');
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

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Observer
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const observer = new MutationObserver(mutations => {
        mutations.forEach(({ addedNodes, characterData, target }) => {
            if (characterData && target.nodeType === Node.TEXT_NODE) {
                maskNode(target);
                return;
            }
            addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) scanRoot(node);
                if (node.nodeType === Node.TEXT_NODE)    maskNode(node);
            });
        });
    });

    observer.observe(document.documentElement ?? document.body, {
        childList     : true,
        subtree       : true,
        characterData : true
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Init
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
