// ==UserScript==
// @name         Tampermonkey Private Shield
// @namespace    https://github.com/mooh971/tampermonkey-private-shield
// @version      1.5.1
// @description  Auto-hide emails, phone numbers, IPs on any webpage during screensharing
// @author       mooh971
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_addElement
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @sandbox      JavaScript
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// @downloadURL  https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js
// ==/UserScript==

/* global exportFunction */
(function () {
    "use strict";

    // Constants & Global State
    const regexes = {
        emails: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}+/u,
        phones: /(?<![\p{Nd}.,٫])(?:\([\p{Cf} \t]*)?(?:(?:\+|00|٠٠|۰۰)[\p{Cf} \t]*)?\p{Nd}(?:(?:[ \t\-()\[\p{Cf}]{0,2}|\.)\p{Nd}){6,14}(?!\p{Nd})/u,
        ips: /(?<![\p{Nd}.,٫])(?:::(?:[fF]{4}:(?:0:)?)?)?\p{Nd}{1,3}(?:[\p{Cf} \t]*\.[\p{Cf} \t]*\p{Nd}{1,3}){3}(?::\p{Nd}{1,5})?(?![\p{Nd}.,٫])|(?<![a-zA-Z0-9])(?:\[?)(?::(?::[0-9a-fA-F]{1,4}){1,7}|[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){2,})(?:%[\w.\-]+)?(?:\])?(?::\d{1,5})?(?![a-zA-Z0-9])/u
    };

    const PATTERN = new RegExp(
        `${regexes.emails.source}|${regexes.ips.source}|${regexes.phones.source}`,
        "gu"
    );

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
        "SVG",
    ]);
    const tooltipText = "Click to reveal";

    const CSS_RULES = `
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
    `;

    const processed = new WeakSet();
    const pendingShadowRoots = [];
    const observedShadowRoots = new Set();
    const shouldMaskCache = new Map();
    const closestCache = new WeakMap();

    let globalObserver = null,
        currentSettings = null,
        badgeHideTimer = null,
        badgeTimer = null;

    // Settings management
    function getSettings() {
        return (currentSettings ??= {
            maskEmails: GM_getValue("maskEmails", true),
            maskPhones: GM_getValue("maskPhones", true),
            maskIPs: GM_getValue("maskIPs", true),
            whitelistedSites: GM_getValue("whitelistedSites", ""),
        });
    }

    function saveSettings(settings) {
        currentSettings = settings;
        for (const [key, val] of Object.entries(settings)) {
            GM_setValue(key, val);
        }
    }

    function isSiteWhitelisted() {
        const settings = getSettings();
        if (!settings.whitelistedSites) {
            return false;
        }
        const hostname = window.location.hostname.toLowerCase();
        return settings.whitelistedSites
            .split(",")
            .map((site) => site.trim().toLowerCase())
            .filter(Boolean)
            .some((site) => {
                if (site === hostname) {
                    return true;
                }
                if (site.startsWith("*.")) {
                    const domain = site.slice(2);
                    return hostname === domain || hostname.endsWith("." + domain);
                }
                return false;
            });
    }

    // Core Orchestration & DOM Observer
    function init() {
        if (isSiteWhitelisted()) {
            return;
        }
        createBadge();
        scanRoot(document.body);
        setupObserver();
        if (typeof GM_registerMenuCommand !== "undefined") {
            GM_registerMenuCommand("Private Shield Settings", showSettings, {
                accessKey: "p",
                autoClose: true,
                title: "Open Private Shield settings panel",
            });
        }
    }

    function setupObserver() {
        const observerConfig = {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["title", "aria-label"],
        };

        globalObserver = new MutationObserver((mutations) => {
            if (!document.getElementById("ps-badge") && document.body) {
                createBadge();
            }

            globalObserver.disconnect();

            const { rootsToScan, textNodesToMask, attributeElementsToMask } =
                extractNodesFromMutations(mutations);

            textNodesToMask.forEach((node) => maskNode(node));
            attributeElementsToMask.forEach(maskAttributes);
            rootsToScan.forEach((node) => {
                if (!SKIP_TAGS.has(node.tagName)) {
                    scanRoot(node);
                }
            });

            globalObserver.observe(
                document.documentElement ?? document.body,
                observerConfig,
            );

            for (const shadowRoot of observedShadowRoots) {
                try {
                    globalObserver.observe(shadowRoot, observerConfig);
                } catch (e) {
                    observedShadowRoots.delete(shadowRoot);
                }
            }
        });

        globalObserver.observe(
            document.documentElement ?? document.body,
            observerConfig,
        );

        while (pendingShadowRoots.length > 0) {
            const shadowRoot = pendingShadowRoots.shift();
            observeShadowRoot(shadowRoot);
        }
    }

    function extractNodesFromMutations(mutations) {
        const nodesToScan = new Set();
        const textNodesToMask = new Set();
        const attributeElementsToMask = new Set();

        for (const { addedNodes, characterData, target, type } of mutations) {
            if (type === "attributes") {
                if (target.nodeType === Node.ELEMENT_NODE) {
                    attributeElementsToMask.add(target);
                }
            } else if (characterData && target.nodeType === Node.TEXT_NODE) {
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
        if (observedShadowRoots.has(shadowRoot)) {
            return;
        }
        observedShadowRoots.add(shadowRoot);
        try {
            globalObserver.observe(shadowRoot, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ["title", "aria-label"],
            });
        } catch (e) { }
    }

    // Masking Engine
    function scanRoot(root) {
        if (!root) {
            return;
        }

        if (root.shadowRoot) {
            injectStyles(root.shadowRoot);
            scanRoot(root.shadowRoot);
            if (globalObserver) {
                observeShadowRoot(root.shadowRoot);
            } else {
                pendingShadowRoots.push(root.shadowRoot);
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
                            injectStyles(node.shadowRoot);
                            scanRoot(node.shadowRoot);
                            if (globalObserver) {
                                observeShadowRoot(node.shadowRoot);
                            } else {
                                pendingShadowRoots.push(node.shadowRoot);
                            }
                        }
                        return NodeFilter.FILTER_SKIP;
                    }
                    if (processed.has(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return hasTargetData(node.textContent)
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
        if (processed.has(node)) {
            return;
        }
        const parent = node.parentNode;
        if (
            !parent ||
            processed.has(parent) ||
            SKIP_TAGS.has(parent.tagName) ||
            parent.isContentEditable
        ) {
            return;
        }

        if (!closestCache.has(parent)) {
            closestCache.set(
                parent,
                parent.classList?.contains("ssb-blur-wrapper") ||
                !!parent.closest?.(".ps-hidden, .ps-visible, #ps-badge, head"),
            );
        }
        if (closestCache.get(parent)) {
            return;
        }

        const text = node.textContent;
        if (skipPreFilter !== true && !hasTargetData(text)) {
            return;
        }

        PATTERN.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0,
            match,
            found = false;

        while ((match = PATTERN.exec(text)) !== null) {
            const val = match[0];
            if (!shouldMask(val)) {
                continue;
            }

            found = true;
            if (match.index > last) {
                frag.appendChild(
                    document.createTextNode(text.slice(last, match.index)),
                );
            }

            const span = document.createElement("span");
            span.className = "ps-hidden";
            span.setAttribute("title", tooltipText);
            span.setAttribute("data-real", val);
            span.setAttribute("data-dummy", generateDummyText(val));
            span.textContent = span.getAttribute("data-dummy");

            span.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isHidden = span.className === "ps-hidden";
                span.className = isHidden ? "ps-visible" : "ps-hidden";
                toggleElementMask(span, isHidden);
                refreshBadge();
            });

            processed.add(span);
            frag.appendChild(span);
            last = match.index + val.length;
        }

        if (!found) {
            return;
        }
        if (last < text.length) {
            frag.appendChild(document.createTextNode(text.slice(last)));
        }

        processed.add(node);
        node.replaceWith(frag);
    }

    function maskAttributes(el) {
        if (!el?.getAttribute) {
            return;
        }
        for (const attr of ["title", "aria-label"]) {
            const val = el.getAttribute(attr);
            if (val && hasTargetData(val)) {
                PATTERN.lastIndex = 0;
                if (PATTERN.test(val)) {
                    PATTERN.lastIndex = 0;
                    const masked = val.replace(PATTERN, (m) =>
                        shouldMask(m) ? "***" : m,
                    );
                    if (val !== masked) {
                        el.setAttribute(attr, masked);
                    }
                }
            }
        }
    }

    function toggleElementMask(element, showRealText) {
        if (showRealText) {
            element.removeAttribute("title");
            const realText = element.getAttribute("data-real");
            if (realText) {
                element.textContent = realText;
            }
        } else {
            element.setAttribute("title", tooltipText);
            const dummyText = element.getAttribute("data-dummy");
            if (dummyText) {
                element.textContent = dummyText;
            }
        }
    }

    // Validation Rules
    function shouldMask(val) {
        if (shouldMaskCache.has(val)) {
            return shouldMaskCache.get(val);
        }
        const result = shouldMaskInternal(val);
        if (shouldMaskCache.size >= 1000) {
            const firstKey = shouldMaskCache.keys().next().value;
            shouldMaskCache.delete(firstKey);
        }
        shouldMaskCache.set(val, result);
        return result;
    }

    function shouldMaskInternal(val) {
        const settings = getSettings();
        if (val.includes("@")) {
            return settings.maskEmails && isEmail(val);
        }
        if (isIP(val)) {
            return settings.maskIPs;
        }
        if (val.includes(":") && isIPv6(val)) {
            return settings.maskIPs;
        }
        if (isTime(val) || isDate(val)) {
            return false;
        }

        const normalizedPhone = toEnglishNumerals(val).trim();
        if (!settings.maskPhones) {
            return false;
        }
        if (
            normalizedPhone.includes("/") ||
            normalizedPhone.includes(":") ||
            (normalizedPhone.includes(".") && normalizedPhone.includes("-"))
        ) {
            return false;
        }

        if (normalizedPhone.includes(".")) {
            const isPotentialPhone =
                normalizedPhone.startsWith("+") || normalizedPhone.startsWith("00");
            if (!isPotentialPhone) {
                const parts = normalizedPhone.split(".");
                if (parts.length === 2) {
                    return false;
                }
                if (parts.length > 3) {
                    return false;
                }
                if (parts.length === 3 && parts.some((p) => p.length === 1)) {
                    return false;
                }
                if (parts.length > 2 && (parts[0] === "0" || parts[0] === "1")) {
                    return false;
                }
                const lastPart = parts.at(-1);
                const lastDigits = lastPart.replace(/\D/g, "");
                if (lastDigits.length > 4) {
                    return false;
                }
            }
        }
        return isPhone(val);
    }

    function isEmail(text) {
        const str = text.trim();
        if (str.includes(" ")) {
            return false;
        }
        const parts = str.split("@");
        if (parts.length !== 2) {
            return false;
        }
        const [local, domain] = parts;
        if (!local || !domain) {
            return false;
        }

        if (!/^[\p{L}\p{N}._+-]+$/u.test(local)) {
            return false;
        }
        if (!/^[\p{L}\p{N}.-]+$/u.test(domain)) {
            return false;
        }
        if (
            domain.includes("..") ||
            domain.startsWith(".") ||
            domain.endsWith(".")
        ) {
            return false;
        }

        const domainParts = domain.split(".");
        if (domainParts.length < 2) {
            return false;
        }

        const tld = domainParts[domainParts.length - 1];
        if (tld.length < 2 || !/^\p{L}+$/u.test(tld)) {
            return false;
        }

        const systemExtensions = new Set([
            "service",
            "socket",
            "device",
            "target",
            "mount",
            "timer",
            "slice",
            "scope",
        ]);
        return !systemExtensions.has(tld.toLowerCase());
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

        if (digits.length >= 11 && digits.length <= 14) {
            const p2 = digits.slice(0, 2);
            const p3 = digits.slice(0, 3);
            if (new Set(["20", "33", "44", "49", "90", "98"]).has(p2)) {
                return true;
            }
            if (p3.startsWith("96") && p3[2] >= "1" && p3[2] <= "8") {
                return true;
            }
            if (p3.startsWith("97") && ["1", "3", "4"].includes(p3[2])) {
                return true;
            }
            if (p3.startsWith("21") && ["2", "3", "6", "8"].includes(p3[2])) {
                return true;
            }
            if (p3 === "249" || p3 === "880") {
                return true;
            }
        }
        if (
            digits.length >= 9 &&
            digits.length <= 12 &&
            digits[0] === "0" &&
            "123456789".includes(digits[1])
        ) {
            return true;
        }
        if (
            digits.length >= 9 &&
            digits.length <= 10 &&
            digits[0] >= "2" &&
            digits[0] <= "9"
        ) {
            return true;
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

    function isIP(text) {
        let norm = toEnglishNumerals(text.replace(/\s+/g, "")).split(":")[0];
        if (norm.toLowerCase().startsWith("::ffff:")) {
            norm = norm.slice(7);
            if (norm.startsWith("0:")) {
                norm = norm.slice(2);
            }
        }
        if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(norm)) {
            return false;
        }
        return norm.split(".").every((part) => {
            const num = Number(part);
            return num >= 0 && num <= 255 && (part === "0" || !part.startsWith("0"));
        });
    }

    function isIPv6(text) {
        let str = text
            .trim()
            .replace(/^\[|\](?::\d{1,5})?$/g, "")
            .split("%")[0]
            .toLowerCase();
        if (!str || str.length < 2 || str.length > 39 || !str.includes(":")) {
            return false;
        }

        if (str.includes(".")) {
            const lastColon = str.lastIndexOf(":");
            if (lastColon < 0) {
                return false;
            }
            const ipv4Part = str.slice(lastColon + 1);
            if (!isIP(ipv4Part)) {
                return false;
            }
            const prefix = str.slice(0, lastColon);
            if (!prefix) {
                return false;
            }
            const groups = prefix.split(":").filter(Boolean);
            if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
                return false;
            }
            if ((prefix.match(/::/g) || []).length > 1) {
                return false;
            }
            return true;
        }

        const colons = (str.match(/:/g) || []).length;
        if (colons < 2 || colons > 7) {
            return false;
        }

        const hasDC = str.includes("::");
        if (hasDC) {
            if ((str.match(/::/g) || []).length > 1) {
                return false;
            }
        } else if (colons !== 7) {
            return false;
        }

        if (str.startsWith(":") && !str.startsWith("::")) {
            return false;
        }
        if (str.endsWith(":") && !str.endsWith("::")) {
            return false;
        }

        const groups = str.split(":").filter(Boolean);
        if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
            return false;
        }
        return true;
    }

    function isTime(text) {
        const norm = toEnglishNumerals(text.trim());
        if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(norm)) {
            return false;
        }
        const [h, m, s] = norm.split(":").map(Number);
        return (
            h >= 0 &&
            h <= 23 &&
            m >= 0 &&
            m <= 59 &&
            (s === undefined || (s >= 0 && s <= 59))
        );
    }

    function hasTargetData(text) {
        if (!text) {
            return false;
        }
        const cleanText = toEnglishNumerals(text);
        return (
            cleanText.includes("@") ||
            /(?:[0-9][\s\-()+,،]*){7}/.test(cleanText) ||
            (cleanText.match(/\./g) || []).length >= 3 ||
            (cleanText.match(/:/g) || []).length >= 2
        );
    }

    // UI & Settings Panel
    function createBadge() {
        if (document.getElementById("ps-badge")) {
            return;
        }
        const badge = Object.assign(document.createElement("div"), {
            id: "ps-badge",
        });

        const label = document.createElement("span");
        badge.appendChild(label);

        const gear = Object.assign(document.createElement("span"), {
            textContent: " ⚙",
            title: "Settings",
        });
        Object.assign(gear.style, {
            opacity: "0.5",
            fontSize: "9px",
            marginLeft: "2px",
        });
        gear.addEventListener("click", (e) => {
            e.stopPropagation();
            showSettings();
        });
        badge.appendChild(gear);

        let allVisible = false;

        label.addEventListener("click", () => {
            allVisible = !allVisible;
            document.querySelectorAll(".ps-hidden, .ps-visible").forEach((el) => {
                el.className = allVisible ? "ps-visible" : "ps-hidden";
                toggleElementMask(el, allVisible);
            });
            refreshBadge();
        });

        badge.addEventListener("mouseenter", () => {
            clearTimeout(badgeHideTimer);
            badge.classList.remove("ps-out");
        });
        badge.addEventListener("mouseleave", () => {
            badgeHideTimer = setTimeout(() => badge.classList.add("ps-out"), 1500);
        });

        document.body.appendChild(badge);
        refreshBadge();
    }

    function refreshBadge() {
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(() => {
            const badge = document.getElementById("ps-badge");
            if (!badge) {
                return;
            }
            const label = badge.querySelector("span");
            const total = document.querySelectorAll(".ps-hidden, .ps-visible").length;
            if (label) {
                label.textContent = total;
            }
            clearTimeout(badgeHideTimer);
            badge.classList.remove("ps-out");
            badgeHideTimer = setTimeout(() => badge.classList.add("ps-out"), 3000);
        }, 50);
    }

    function showSettings() {
        const existing = document.getElementById("ps-settings");
        if (existing) {
            existing.remove();
        }

        const currentSettings = getSettings();

        const settingsPanel = Object.assign(document.createElement("div"), {
            id: "ps-settings",
        });
        settingsPanel.innerHTML = `
            <div class="ps-backdrop"></div>
            <div class="ps-modal">
                <h3>Private Shield Settings</h3>
                <div class="ps-row">
                    <span>Mask email addresses</span>
                    <input type="checkbox" id="ps-opt-emails">
                </div>
                <div class="ps-row">
                    <span>Mask phone numbers</span>
                    <input type="checkbox" id="ps-opt-phones">
                </div>
                <div class="ps-row">
                    <span>Mask IP addresses</span>
                    <input type="checkbox" id="ps-opt-ips">
                </div>
                <div class="ps-row" style="flex-wrap:wrap;">
                    <span style="width:100%;">Whitelisted sites (comma-separated)</span>
                    <input type="text" id="ps-opt-sites" placeholder="e.g. example.com, *.internal.com">
                </div>
                <div class="ps-buttons">
                    <button class="ps-btn-primary" id="ps-save">Save & Reload</button>
                    <button class="ps-btn-cancel" id="ps-cancel">Cancel</button>
                </div>
            </div>
        `;

        const emailsCheckbox = settingsPanel.querySelector("#ps-opt-emails");
        const phonesCheckbox = settingsPanel.querySelector("#ps-opt-phones");
        const ipsCheckbox = settingsPanel.querySelector("#ps-opt-ips");
        const sitesInput = settingsPanel.querySelector("#ps-opt-sites");

        emailsCheckbox.checked = currentSettings.maskEmails;
        phonesCheckbox.checked = currentSettings.maskPhones;
        ipsCheckbox.checked = currentSettings.maskIPs;
        sitesInput.value = currentSettings.whitelistedSites;

        document.body.appendChild(settingsPanel);

        settingsPanel.querySelector("#ps-save").addEventListener("click", () => {
            saveSettings({
                maskEmails: emailsCheckbox.checked,
                maskPhones: phonesCheckbox.checked,
                maskIPs: ipsCheckbox.checked,
                whitelistedSites: sitesInput.value,
            });
            settingsPanel.remove();
            location.reload();
        });

        settingsPanel
            .querySelector("#ps-cancel")
            .addEventListener("click", () => settingsPanel.remove());
        settingsPanel
            .querySelector(".ps-backdrop")
            .addEventListener("click", () => settingsPanel.remove());
    }

    // Browser hooks & shadow DOM patches
    function hookFedCM() {
        const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        try {
            if (win.navigator?.credentials?.get) {
                const originalGet = win.navigator.credentials.get;
                win.navigator.credentials.get = function (options) {
                    return options?.identity
                        ? Promise.reject(
                            new DOMException("The user aborted the request.", "AbortError"),
                        )
                        : originalGet.call(this, options);
                };
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
                injectStyles(shadowRoot);
                scanRoot(shadowRoot);
                if (globalObserver) {
                    observeShadowRoot(shadowRoot);
                } else {
                    pendingShadowRoots.push(shadowRoot);
                }
            } catch (e) { }
            return shadowRoot;
        };

        if (typeof exportFunction !== "undefined") {
            exportFunction(patchedAttachShadow, win.Element.prototype, {
                defineAs: "attachShadow",
            });
        } else {
            win.Element.prototype.attachShadow = patchedAttachShadow;
        }
    }

    // Low-level helper functions
    function addStyleNode(parent, css, className = "") {
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
    }

    function injectStyles(root) {
        if (!root || root.querySelector?.("style.ps-styles")) {
            return;
        }
        addStyleNode(root, CSS_RULES, "ps-styles");
    }

    function setupStyles() {
        const badgeCss = `
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
            #ps-settings { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483646; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
            #ps-settings .ps-backdrop { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.35); }
            #ps-settings .ps-modal { position: relative; background: #fff; border-radius: 8px; padding: 20px 24px; min-width: 300px; max-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.25); color: #222; font-size: 13px; }
            #ps-settings h3 { margin: 0 0 14px 0; font-size: 15px; }
            #ps-settings .ps-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
            #ps-settings .ps-row + .ps-row { border-top: 1px solid #eee; }
            #ps-settings .ps-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }
            #ps-settings .ps-row input[type="text"] { width: 100%; margin-top: 4px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; box-sizing: border-box; }
            #ps-settings .ps-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
            #ps-settings .ps-buttons button { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
            #ps-settings .ps-btn-primary { background: #01696f; color: #fff; }
            #ps-settings .ps-btn-primary:hover { background: #015558; }
            #ps-settings .ps-btn-cancel { background: #e0e0e0; color: #333; }
            #ps-settings .ps-btn-cancel:hover { background: #d0d0d0; }
        `;
        const css = CSS_RULES + badgeCss;

        if (typeof GM_addStyle !== "undefined") {
            GM_addStyle(css);
        } else {
            addStyleNode(document.head || document.documentElement, css);
        }
    }

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

    function isDate(text) {
        const norm = toEnglishNumerals(text.trim());
        const cleanNorm = norm.replace(/[./]/g, "-");
        const parts = cleanNorm.split("-");

        if (parts.length === 3) {
            const isVal = (s, min, max) =>
                /^\d+$/.test(s) && Number(s) >= min && Number(s) <= max;
            const isYear = (s) =>
                /^\d{4}$/.test(s) &&
                ((Number(s) >= 1900 && Number(s) <= 2099) ||
                    (Number(s) >= 1300 && Number(s) <= 1499));
            const [p0, p1, p2] = parts;
            if (
                (isYear(p0) && isVal(p1, 1, 12) && isVal(p2, 1, 31)) ||
                (isVal(p0, 1, 31) && isVal(p1, 1, 12) && isYear(p2))
            ) {
                return true;
            }
        }

        const digits = norm.replace(/\D/g, "");
        if ([8, 10, 12, 14].includes(digits.length)) {
            const y = parseInt(digits.slice(0, 4), 10);
            const m = parseInt(digits.slice(4, 6), 10);
            const d = parseInt(digits.slice(6, 8), 10);
            const validY = (y >= 1900 && y <= 2099) || (y >= 1300 && y <= 1499);
            const validM = m >= 1 && m <= 12;
            const validD = d >= 1 && d <= 31;
            if (!validY || !validM || !validD) {
                return false;
            }
            if (digits.length === 8) {
                return true;
            }
            const h = parseInt(digits.slice(8, 10), 10);
            const validH = h >= 0 && h <= 23;
            if (digits.length === 10) {
                return validH;
            }
            const min = parseInt(digits.slice(10, 12), 10);
            const validMin = min >= 0 && min <= 59;
            if (digits.length === 12) {
                return validH && validMin;
            }
            const s = parseInt(digits.slice(12, 14), 10);
            const validS = s >= 0 && s <= 59;
            return validH && validMin && validS;
        }
        return false;
    }

    // Startup execution
    hookFedCM();
    hookAttachShadow();
    setupStyles();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
