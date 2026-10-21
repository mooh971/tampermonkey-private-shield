// ==UserScript==
// @name         Tampermonkey Private Shield
// @namespace    https://github.com/mooh971/tampermonkey-private-shield
// @version      1.7.0
// @description  Auto-hide emails, phone numbers, IPs, and national IDs on any webpage during screensharing
// @author       mooh971
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_addElement
// @grant        unsafeWindow
// @sandbox      JavaScript
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// @downloadURL  https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// ==/UserScript==

/* global exportFunction */
(function () {
    "use strict";

    // 1. Constants & Styling
    const TOOLTIP_TEXT = "Click to reveal";

    const SKIP_TAGS = new Set([
        "SCRIPT",
        "STYLE",
        "NOSCRIPT",
        "TEXTAREA",
        "INPUT",
        "HEAD",
        "LINK",
        "META",
        "TEMPLATE",
        "IFRAME",
        "FRAME",
        "FRAMESET",
        "SVG",
    ]);

    const MASK_STYLES = `
        .ps-hidden {
            cursor: pointer !important;
            display: inline-block !important;
            box-sizing: border-box !important;
            vertical-align: baseline !important;
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
            box-sizing: border-box !important;
            vertical-align: baseline !important;
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
    `;

    const BADGE_STYLES = `
        #ps-badge {
            position: fixed !important;
            bottom: 8px !important;
            right: 8px !important;
            z-index: 2147483647 !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            border: none !important;
            background: rgba(0, 0, 0, 0.55) !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
            color: rgba(255, 255, 255, 0.85) !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            font-size: 10px !important;
            white-space: nowrap !important;
            cursor: pointer !important;
            transition: opacity 0.3s ease, transform 0.3s ease !important;
        }
        #ps-badge:hover { background: rgba(0, 0, 0, 0.75) !important; color: #fff !important; }
        #ps-badge.ps-out { opacity: 0 !important; transform: translateY(4px) !important; pointer-events: none !important; }
    `;

    // 2. Pure Utilities
    function toEnglishNumerals(str) {
        return str
            .replace(/\p{Cf}/gu, "")
            .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (c) =>
                String.fromCharCode(
                    c.charCodeAt(0) - (c.charCodeAt(0) >= 1776 ? 1728 : 1584),
                ),
            );
    }

    function generateDummyText(text) {
        return text.replace(/[a-zA-Z0-9\u0660-\u0669\u06f0-\u06f9]/g, "x");
    }

    // 3. Validation Domain (Pure, Independent Seam)
    const ShieldValidator = (() => {
        const regexes = {
            emails: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}+/u,
            phones: /(?<![\p{L}\p{N}_])(?:\([\p{Cf} \t]*)?(?:(?:\+|00|٠٠|۰۰)[\p{Cf} \t]*)?\p{Nd}(?:(?:[ \t\-()\[\p{Cf}]{0,2}|\.)\p{Nd}){6,14}(?![\p{L}\p{N}_])/u,
            ips: /(?<![\p{L}\p{N}_])(?:::(?:[fF]{4}:(?:0:)?)?)?\p{Nd}{1,3}(?:[\p{Cf} \t]*\.[\p{Cf} \t]*\p{Nd}{1,3}){3}(?::\p{Nd}{1,5})?(?![\p{L}\p{N}_])|(?<![a-zA-Z0-9])(?:\[?)(?::(?::[0-9a-fA-F]{1,4}){1,7}|[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){2,})(?:%[\w.\-]+)?(?:\])?(?::\d{1,5})?(?![a-zA-Z0-9])/u,
            nationalIds: /(?<![\p{L}\p{N}_])\p{Nd}{10}(?![\p{L}\p{N}_])/u,
        };

        const PATTERN = new RegExp(
            `${regexes.emails.source}|${regexes.ips.source}|${regexes.phones.source}|${regexes.nationalIds.source}`,
            "gu"
        );

        const COUNTRY_CODE_RE = /^(?:20|33|44|49|90|98|96[1-8]|97[134]|21[2368]|249|880)/;
        const FAST_TARGET_RE = /@|(?:[\d\u0660-\u0669\u06f0-\u06f9][\s\-()+,،]*){7}|\..*\..*\.|:.*:/;

        const SYSTEM_EXTENSIONS = new Set([
            "service",
            "socket",
            "device",
            "target",
            "mount",
            "timer",
            "slice",
            "scope",
        ]);

        const maskCache = new Map();

        function hasTargetData(text) {
            if (!text || text.length < 5) {
                return false;
            }
            return FAST_TARGET_RE.test(text);
        }

        function isEmail(text) {
            const m = text.trim().match(/^[\p{L}\p{N}._+-]+@(?:[\p{L}\p{N}-]+\.)+(\p{L}{2,})$/u);
            return m ? !SYSTEM_EXTENSIONS.has(m[1].toLowerCase()) : false;
        }

        function isPhone(text) {
            const normalizedPhone = toEnglishNumerals(text).trim();
            const digits = normalizedPhone.replace(/\D/g, "");
            if (digits.length < 7 || digits.length > 15) {
                return false;
            }

            if (normalizedPhone.startsWith("+")) {
                return digits.length >= 9 && digits.length <= 15;
            }
            if (normalizedPhone.startsWith("00")) {
                return (
                    !digits.startsWith("000") && digits.length >= 11 && digits.length <= 15
                );
            }
            if (digits.startsWith("1")) {
                return digits.length === 11;
            }

            if (digits.length >= 11 && digits.length <= 14 && COUNTRY_CODE_RE.test(digits)) {
                return true;
            }
            if (
                digits.length >= 9 &&
                digits.length <= 12 &&
                digits[0] === "0" &&
                digits[1] !== "0"
            ) {
                return true;
            }
            if (
                digits.length >= 9 &&
                digits.length <= 10 &&
                digits[0] >= "2" &&
                digits[0] <= "9"
            ) {
                return /[\s\-().]/.test(normalizedPhone);
            }
            if (
                digits.length >= 11 &&
                digits.length <= 12 &&
                "0236789".includes(digits[0])
            ) {
                return true;
            }

            return false;
        }

        function isNationalID(text) {
            return /^(?:[12]\d|30)\d{8}$/.test(
                toEnglishNumerals(text.trim()).replace(/\D/g, ""),
            );
        }

        function isIP(text) {
            const norm = toEnglishNumerals(text.replace(/\s+/g, "")).split(":")[0];
            if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(norm)) {
                return false;
            }
            return norm.split(".").every((part) => {
                const num = Number(part);
                return num >= 0 && num <= 255 && (part === "0" || !part.startsWith("0"));
            });
        }

        function isIPv6(text) {
            const clean = text.trim().replace(/^\[|\](?::\d+)?$/g, "").split("%")[0];
            if (!clean.includes(":")) {
                return false;
            }
            if (typeof URL.canParse === "function") {
                return URL.canParse(`http://[${clean}]`);
            }
            try {
                return !!new URL(`http://[${clean}]`);
            } catch {
                return false;
            }
        }

        function isTime(text) {
            return /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
                toEnglishNumerals(text.trim()),
            );
        }

        function isDate(text) {
            const norm = toEnglishNumerals(text.trim()).replace(/[./]/g, "-");
            const m = norm.match(/^(\d{1,4})-(\d{1,2})-(\d{1,4})$/);
            if (m) {
                const [, p1, p2, p3] = m;
                const isY = (y) => /^\d{4}$/.test(y) && ((+y >= 1900 && +y <= 2099) || (+y >= 1300 && +y <= 1499));
                return (isY(p1) && +p2 >= 1 && +p2 <= 12 && +p3 >= 1 && +p3 <= 31) ||
                       (+p1 >= 1 && +p1 <= 31 && +p2 >= 1 && +p2 <= 12 && isY(p3));
            }
            const d = norm.replace(/\D/g, "");
            return [8, 10, 12, 14].includes(d.length) &&
                /^(?:1[3-4]\d{2}|19\d{2}|20\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:(?:[01]\d|2[0-3])(?:[0-5]\d(?:[0-5]\d)?)?)?$/.test(d);
        }

        function shouldMaskInternal(val) {
            if (val.includes("@")) {
                return isEmail(val);
            }
            if (isIP(val)) {
                return true;
            }
            if (val.includes(":") && isIPv6(val)) {
                return true;
            }
            if (isTime(val) || isDate(val)) {
                return false;
            }
            if (isNationalID(val)) {
                return true;
            }

            const normalizedPhone = toEnglishNumerals(val).trim();
            if (
                normalizedPhone.includes("/") ||
                normalizedPhone.includes(":") ||
                (normalizedPhone.includes(".") && normalizedPhone.includes("-"))
            ) {
                return false;
            }

            if (normalizedPhone.includes(".") && !normalizedPhone.startsWith("+") && !normalizedPhone.startsWith("00")) {
                const p = normalizedPhone.split(".");
                if (p.length !== 3 || p.some((s) => s.length === 1) || ["0", "1"].includes(p[0]) || p[2].replace(/\D/g, "").length > 4) {
                    return false;
                }
            }
            return isPhone(val);
        }

        function shouldMask(val) {
            if (maskCache.has(val)) {
                const cached = maskCache.get(val);
                maskCache.delete(val);
                maskCache.set(val, cached);
                return cached;
            }
            const result = shouldMaskInternal(val);
            if (maskCache.size >= 1000) {
                const oldest = maskCache.keys().next().value;
                maskCache.delete(oldest);
            }
            maskCache.set(val, result);
            return result;
        }

        return {
            PATTERN,
            hasTargetData,
            shouldMask,
            isEmail,
            isPhone,
            isIP,
            isIPv6,
            isTime,
            isDate,
            isNationalID,
        };
    })();

    // 4. Encapsulated State Management
    const domState = {
        processed: new WeakSet(),
        observedShadowRoots: new Set(),
        pendingShadowRoots: [],
        globalObserver: null,
        isMasking: false,
    };

    const uiState = {
        badgeTimer: null,
        badgeHideTimer: null,
        allVisible: false,
        globalListenersSet: false,
    };

    const styleManager = {
        sharedSheet: null,
        injectStyles(root) {
            if (!root) {
                return;
            }
            if ("adoptedStyleSheets" in root && typeof CSSStyleSheet !== "undefined") {
                this.sharedSheet ??= new CSSStyleSheet();
                if (this.sharedSheet.cssRules.length === 0) {
                    this.sharedSheet.replaceSync(MASK_STYLES);
                }
                if (!root.adoptedStyleSheets.includes(this.sharedSheet)) {
                    root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.sharedSheet];
                }
                return;
            }
            if (root.querySelector?.("style.ps-styles")) {
                return;
            }
            this.addStyleNode(root, MASK_STYLES, "ps-styles");
        },
        addStyleNode(parent, css, className = "") {
            if (typeof GM_addElement !== "undefined") {
                GM_addElement(parent, "style", { class: className, textContent: css });
            } else {
                const style = Object.assign(document.createElement("style"), {
                    textContent: css,
                });
                if (className) {
                    style.className = className;
                }
                (parent || document.head || document.documentElement).appendChild(style);
            }
        },
        setupStyles() {
            const combinedCss = MASK_STYLES + BADGE_STYLES;
            if (typeof GM_addStyle !== "undefined") {
                GM_addStyle(combinedCss);
            } else {
                this.addStyleNode(document.documentElement || document.head, combinedCss);
            }
        },
    };

    // 5. Masking Engine
    function scanRoot(root) {
        if (!root || isEditableDocument() || typeof document.createTreeWalker !== "function") {
            return;
        }

        if (root.shadowRoot) {
            styleManager.injectStyles(root.shadowRoot);
            scanRoot(root.shadowRoot);
            if (domState.globalObserver) {
                observeShadowRoot(root.shadowRoot);
            } else {
                domState.pendingShadowRoots.push(root.shadowRoot);
            }
        }

        if (root.hasAttribute?.("title") || root.hasAttribute?.("aria-label")) {
            maskAttributes(root);
        }

        const domTreeWalker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (
                            SKIP_TAGS.has(node.tagName) ||
                            node.isContentEditable ||
                            node.classList?.contains("ps-hidden") ||
                            node.classList?.contains("ps-visible") ||
                            node.id === "ps-badge"
                        ) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        if (
                            node.hasAttribute?.("title") ||
                            node.hasAttribute?.("aria-label")
                        ) {
                            maskAttributes(node);
                        }
                        if (node.shadowRoot) {
                            styleManager.injectStyles(node.shadowRoot);
                            scanRoot(node.shadowRoot);
                            if (domState.globalObserver) {
                                observeShadowRoot(node.shadowRoot);
                            } else {
                                domState.pendingShadowRoots.push(node.shadowRoot);
                            }
                        }
                        return NodeFilter.FILTER_SKIP;
                    }
                    if (domState.processed.has(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return ShieldValidator.hasTargetData(node.textContent)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            },
        );

        const nodes = [];
        while (domTreeWalker.nextNode()) {
            nodes.push(domTreeWalker.currentNode);
        }
        for (let i = nodes.length - 1; i >= 0; i--) {
            maskNode(nodes[i], true);
        }

        refreshBadge();
    }

    function maskNode(node, skipPreFilter = false) {
        if (domState.processed.has(node)) {
            return;
        }
        const parent = node.parentNode;
        if (
            !parent ||
            domState.processed.has(parent) ||
            SKIP_TAGS.has(parent.tagName) ||
            parent.isContentEditable
        ) {
            return;
        }

        if (
            parent.classList?.contains("ssb-blur-wrapper") ||
            parent.closest?.(".ps-hidden, .ps-visible, #ps-badge, head")
        ) {
            return;
        }

        const text = node.textContent;
        if (skipPreFilter !== true && !ShieldValidator.hasTargetData(text)) {
            return;
        }

        const pieces = [];
        let last = 0,
            found = false;

        for (const match of text.matchAll(ShieldValidator.PATTERN)) {
            const val = match[0];
            if (!ShieldValidator.shouldMask(val)) {
                continue;
            }

            found = true;
            if (match.index > last) {
                pieces.push(text.slice(last, match.index));
            }

            const span = document.createElement("span");
            span.className = "ps-hidden";
            span.setAttribute("title", TOOLTIP_TEXT);
            span.setAttribute("data-real", val);
            span.setAttribute("data-dummy", generateDummyText(val));
            span.textContent = span.getAttribute("data-dummy");

            domState.processed.add(span);
            pieces.push(span);
            last = match.index + val.length;
        }

        if (!found) {
            return;
        }
        if (last < text.length) {
            pieces.push(text.slice(last));
        }

        domState.processed.add(node);
        node.replaceWith(...pieces);
    }

    function maskAttributes(el) {
        if (!el?.getAttribute) {
            return;
        }
        for (const attr of ["title", "aria-label"]) {
            const val = el.getAttribute(attr);
            if (val && ShieldValidator.hasTargetData(val)) {
                const masked = val.replace(ShieldValidator.PATTERN, (m) =>
                    ShieldValidator.shouldMask(m) ? "***" : m,
                );
                if (val !== masked) {
                    el.setAttribute(attr, masked);
                }
            }
        }
    }

    function toggleElementMask(element, showRealText) {
        if (showRealText) {
            element.removeAttribute("title");
        } else {
            element.setAttribute("title", TOOLTIP_TEXT);
        }
        const text = element.getAttribute(showRealText ? "data-real" : "data-dummy");
        if (text) {
            element.textContent = text;
        }
    }

    // 6. DOM Observer & Lifecycles
    function setupObserver() {
        if (domState.globalObserver) {
            return;
        }
        const observerConfig = {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["title", "aria-label"],
        };

        domState.globalObserver = new MutationObserver((mutations) => {
            if (domState.isMasking) {
                return;
            }

            if (!document.getElementById("ps-badge") && (document.body || document.documentElement)) {
                createBadge();
            }

            domState.isMasking = true;
            try {
                const { rootsToScan, textNodesToMask, attributeElementsToMask } =
                    extractNodesFromMutations(mutations);

                textNodesToMask.forEach((node) => maskNode(node));
                attributeElementsToMask.forEach(maskAttributes);
                rootsToScan.forEach((node) => {
                    if (!SKIP_TAGS.has(node.tagName)) {
                        scanRoot(node);
                    }
                });
            } finally {
                domState.isMasking = false;
            }
        });

        domState.globalObserver.observe(document, observerConfig);

        while (domState.pendingShadowRoots.length > 0) {
            const shadowRoot = domState.pendingShadowRoots.shift();
            observeShadowRoot(shadowRoot);
        }
    }

    function extractNodesFromMutations(mutations) {
        const nodesToScan = new Set();
        const textNodesToMask = new Set();
        const attributeElementsToMask = new Set();

        for (const { addedNodes, target, type } of mutations) {
            if (type === "attributes") {
                if (target.nodeType === Node.ELEMENT_NODE) {
                    attributeElementsToMask.add(target);
                }
            } else if (type === "characterData" && target.nodeType === Node.TEXT_NODE) {
                textNodesToMask.add(target);
            } else if (addedNodes) {
                const len = addedNodes.length;
                for (let i = 0; i < len; i++) {
                    const node = addedNodes[i];
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (
                            node.classList?.contains("ps-hidden") ||
                            node.classList?.contains("ps-visible") ||
                            node.id === "ps-badge"
                        ) {
                            continue;
                        }
                        nodesToScan.add(node);
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        textNodesToMask.add(node);
                    }
                }
            }
        }

        const rootsToScan = [...nodesToScan].filter((node) => {
            let parent = node.parentNode;
            while (parent) {
                if (nodesToScan.has(parent)) {
                    return false;
                }
                parent = parent.parentNode;
            }
            return true;
        });

        return { rootsToScan, textNodesToMask, attributeElementsToMask };
    }

    function observeShadowRoot(shadowRoot) {
        if (domState.observedShadowRoots.has(shadowRoot)) {
            return;
        }
        domState.observedShadowRoots.add(shadowRoot);
        try {
            domState.globalObserver.observe(shadowRoot, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ["title", "aria-label"],
            });
        } catch (e) { }
    }

    // 7. UI & Badge Controller
    function createBadge() {
        if (document.getElementById("ps-badge")) {
            return;
        }
        const badge = Object.assign(document.createElement("div"), {
            id: "ps-badge",
        });

        const label = document.createElement("span");
        badge.appendChild(label);

        label.addEventListener("click", () => {
            uiState.allVisible = !uiState.allVisible;
            document.querySelectorAll(".ps-hidden, .ps-visible").forEach((el) => {
                el.className = uiState.allVisible ? "ps-visible" : "ps-hidden";
                toggleElementMask(el, uiState.allVisible);
            });
            refreshBadge();
        });

        badge.addEventListener("mouseenter", () => {
            clearTimeout(uiState.badgeHideTimer);
            badge.classList.remove("ps-out");
        });
        badge.addEventListener("mouseleave", () => {
            uiState.badgeHideTimer = setTimeout(() => badge.classList.add("ps-out"), 1500);
        });

        const container = document.body || document.documentElement;
        if (container) {
            container.appendChild(badge);
            refreshBadge();
        }
    }

    function refreshBadge() {
        clearTimeout(uiState.badgeTimer);
        uiState.badgeTimer = setTimeout(() => {
            const badge = document.getElementById("ps-badge");
            if (!badge) {
                return;
            }
            const label = badge.querySelector("span");
            const total = document.querySelectorAll(".ps-hidden, .ps-visible").length;
            if (label) {
                label.textContent = total;
            }
            clearTimeout(uiState.badgeHideTimer);
            badge.classList.remove("ps-out");
            uiState.badgeHideTimer = setTimeout(() => badge.classList.add("ps-out"), 3000);
        }, 50);
    }

    function setupGlobalListeners() {
        if (uiState.globalListenersSet) {
            return;
        }
        uiState.globalListenersSet = true;
        window.addEventListener(
            "click",
            (e) => {
                const span = e.target?.closest?.(".ps-hidden, .ps-visible");
                if (!span) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                const isHidden = span.classList.contains("ps-hidden");
                span.className = isHidden ? "ps-visible" : "ps-hidden";
                toggleElementMask(span, isHidden);
                refreshBadge();
            },
            true,
        );
    }

    // 8. Browser Hooks & Tampermonkey Patches
    function isCloudflareChallenge() {
        try {
            const { hostname: host, href } = window.location;
            return (
                host.endsWith("challenges.cloudflare.com") ||
                host.endsWith("turnstile.cloudflare.com") ||
                href.includes("/cdn-cgi/challenge-platform/") ||
                href.includes("cf-challenge")
            );
        } catch (e) {
            return false;
        }
    }

    function hookFedCM() {
        const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        try {
            if (win.navigator?.credentials?.get) {
                const originalGet = win.navigator.credentials.get;
                const patchedGet = function (options) {
                    return options?.identity
                        ? Promise.reject(
                            new DOMException("The user aborted the request.", "AbortError"),
                        )
                        : originalGet.call(this, options);
                };
                try {
                    Object.defineProperty(patchedGet, "name", { value: "get", writable: false });
                    patchedGet.toString = function () {
                        return "function get() { [native code] }";
                    };
                } catch (e) { }
                win.navigator.credentials.get = patchedGet;
            }
        } catch (e) { }
    }

    function hookAttachShadow() {
        const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        const originalAttachShadow = win.Element?.prototype?.attachShadow;
        if (!originalAttachShadow) {
            return;
        }

        const patchedAttachShadow = function (init) {
            const shadowRoot = originalAttachShadow.call(this, init);
            try {
                const isCF = this?.classList?.contains("cf-turnstile") ||
                    this?.id?.includes("cf-") ||
                    this?.closest?.('[class*="cf-"], [id*="cf-"]');
                if (!isCF) {
                    styleManager.injectStyles(shadowRoot);
                    scanRoot(shadowRoot);
                    if (domState.globalObserver) {
                        observeShadowRoot(shadowRoot);
                    } else {
                        domState.pendingShadowRoots.push(shadowRoot);
                    }
                }
            } catch (e) { }
            return shadowRoot;
        };

        try {
            Object.defineProperty(patchedAttachShadow, "name", { value: "attachShadow", writable: false });
            patchedAttachShadow.toString = function () {
                return "function attachShadow() { [native code] }";
            };
        } catch (e) { }

        if (typeof exportFunction !== "undefined") {
            exportFunction(patchedAttachShadow, win.Element.prototype, {
                defineAs: "attachShadow",
            });
        } else {
            win.Element.prototype.attachShadow = patchedAttachShadow;
        }
    }

    // 9. Startup & Initialization
    function isEditableDocument() {
        try {
            return document.designMode?.toLowerCase() === "on";
        } catch {
            return false;
        }
    }

    function init() {
        if (isCloudflareChallenge() || isEditableDocument()) {
            return;
        }
        createBadge();
        setupObserver();
        scanRoot(document.documentElement || document.body);
    }

    if (!isCloudflareChallenge() && !isEditableDocument()) {
        hookFedCM();
        hookAttachShadow();
        styleManager.setupStyles();
        setupGlobalListeners();
        setupObserver();

        if (document.documentElement) {
            scanRoot(document.documentElement);
        }

        if (document.readyState === "loading") {
            const onReady = () => {
                if (document.readyState === "interactive" || document.readyState === "complete") {
                    document.removeEventListener("readystatechange", onReady);
                    document.removeEventListener("DOMContentLoaded", onReady);
                    init();
                }
            };
            document.addEventListener("readystatechange", onReady);
            document.addEventListener("DOMContentLoaded", onReady);
        } else {
            init();
        }
    }
})();
