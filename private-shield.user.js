// ==UserScript==
// @name         🔒 Tampermonkey Private Shield
// @namespace    https://github.com/mooh971/tampermonkey-private-shield
// @version      1.0.3
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

    const PATTERN = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})|((?:\+|00)\d{1,4}(?:[\s\-.()]*\d){6,12}\b|(?:\b|\d+)(?:06|0|8)(?:[\s\-.()]*\d){6,11}\b|(?<!\d)(?:[1-9])(?:[\s\-.()]*\d){6,11}(?!\d))/g;
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
        .ps-hidden .ssb-blur-wrapper, .ps-visible .ssb-blur-wrapper {
            filter: none !important;
            background: transparent !important;
            background-color: transparent !important;
            text-shadow: inherit !important;
            color: inherit !important;
            pointer-events: none !important;
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

    function hasTargetData(text) {
        return text.includes('@') || /[0-9]{7,}/.test(text.replace(/[\s\-().]/g, ''));
    }

    function enforceAbsoluteClean(element, isVisible) {
        if (isVisible) {
            element.removeAttribute('title');
            const nestedWrapper = element.querySelector('.ssb-blur-wrapper');
            if (nestedWrapper) {
                const pureText = nestedWrapper.textContent;
                element.innerHTML = ''; 
                element.textContent = pureText; 
            }
        } else {
            element.setAttribute('title', tooltipText);
        }
    }

    function cleanOverride(element, isVisible) {
        enforceAbsoluteClean(element, isVisible);
    }

    function maskNode(node) {
        if (processed.has(node)) return;

        if (node.parentElement?.classList.contains('ssb-blur-wrapper') || node.parentElement?.closest?.('.ps-hidden, .ps-visible')) {
            return;
        }

        const text = node.textContent;
        if (!hasTargetData(text)) return;

        const parent = node.parentNode;
        if (!parent || processed.has(parent) || SKIP_TAGS.has(parent.tagName) || parent.closest?.('head') || parent.isContentEditable) return;

        PATTERN.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, match, found = false;

        while ((match = PATTERN.exec(text)) !== null) {
            found = true;
            if (match.index > last) {
                frag.appendChild(document.createTextNode(text.slice(last, match.index)));
            }

            const span = document.createElement('span');
            span.className = 'ps-hidden';
            span.setAttribute('title', tooltipText);
            span.textContent = match[0];
            
            span.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const isHidden = span.className === 'ps-hidden';
                span.className = isHidden ? 'ps-visible' : 'ps-hidden';
                cleanOverride(span, isHidden);
                refreshBadge();
            });
            processed.add(span);
            frag.appendChild(span);
            last = match.index + match[0].length;
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

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                if (!hasTargetData(n.textContent) || processed.has(n) || SKIP_TAGS.has(n.parentElement?.tagName) || n.parentElement?.closest?.('head, .ps-hidden, .ps-visible') || n.parentElement?.isContentEditable) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
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
                cleanOverride(el, allVisible);
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
