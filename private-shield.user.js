// ==UserScript==
// @name         🙈 YouTube Shield
// @namespace    https://github.com/mooh971/tampermonkey-youtube-shield
// @version      1.0.3
// @description  Auto-blur YouTube thumbnails, titles, channel avatars on home page — subscriptions sidebar hidden everywhere
// @author       mooh971
// @match        *://www.youtube.com/*
// @grant        GM_addStyle
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/mooh971/tampermonkey-youtube-shield/main/youtube-shield.user.js
// @downloadURL  https://raw.githubusercontent.com/mooh971/tampermonkey-youtube-shield/main/youtube-shield.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  State
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    let revealed  = false;
    let hideTimer = null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Subscriptions label — multi-language
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const SUBS_LABELS = new Set([
        'Subscriptions',   // English
        'الاشتراكات',      // Arabic
        'Abonnements',     // French
        'Abonnieren',      // German
        'Suscripciones',   // Spanish
        'Iscrizioni',      // Italian
        'Inscrições',      // Portuguese
        'Подписки',        // Russian
        '訂閱',            // Chinese Traditional
        '订阅',            // Chinese Simplified
        '구독',            // Korean
        'チャンネル登録',   // Japanese
    ]);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Page check
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function isHomePage() {
        return window.location.pathname === '/';
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Styles
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    GM_addStyle(`

        /* ── Thumbnails — home page only ── */
        body.yts-home div.ytThumbnailViewModelImage,
        body.yts-home yt-thumbnail-view-model,
        body.yts-home a.ytLockupViewModelContentImage,
        body.yts-home ytd-thumbnail,
        body.yts-home ytd-thumbnail img,
        body.yts-home a#thumbnail,
        body.yts-home #thumbnail img {
            filter: blur(20px) brightness(0.4) !important;
            transition: filter 0.3s ease !important;
            border-radius: 10px !important;
            overflow: hidden !important;
        }

        body.yts-home div.ytThumbnailViewModelImage:hover,
        body.yts-home yt-thumbnail-view-model:hover,
        body.yts-home a.ytLockupViewModelContentImage:hover,
        body.yts-home ytd-thumbnail:hover,
        body.yts-home a#thumbnail:hover {
            filter: none !important;
        }

        /* ── Channel avatars — home page only ── */
        body.yts-home yt-avatar-shape img.ytSpecAvatarShapeImage,
        body.yts-home yt-decorated-avatar-view-model,
        body.yts-home ytd-avatar-block-view-model {
            filter: blur(10px) !important;
            transition: filter 0.3s ease !important;
        }

        body.yts-home yt-avatar-shape img.ytSpecAvatarShapeImage:hover,
        body.yts-home yt-decorated-avatar-view-model:hover,
        body.yts-home ytd-avatar-block-view-model:hover {
            filter: none !important;
        }

        /* ── Titles — home page only ── */
        body.yts-home h3.ytLockupMetadataViewModelHeadingReset,
        body.yts-home a.ytLockupMetadataViewModelTitle,
        body.yts-home span.ytAttributedStringHost.ytAttributedStringWhiteSpacePreWrap,
        body.yts-home #video-title,
        body.yts-home yt-formatted-string#video-title,
        body.yts-home a#video-title-link yt-formatted-string {
            filter: blur(7px) !important;
            transition: filter 0.3s ease !important;
            user-select: none !important;
        }

        body.yts-home h3.ytLockupMetadataViewModelHeadingReset:hover,
        body.yts-home a.ytLockupMetadataViewModelTitle:hover,
        body.yts-home span.ytAttributedStringHost.ytAttributedStringWhiteSpacePreWrap:hover,
        body.yts-home #video-title:hover,
        body.yts-home a#video-title-link yt-formatted-string:hover {
            filter: none !important;
        }

        /* ── Subscriptions sidebar — ALL pages ── */
        #yts-subs-section {
            filter: blur(8px) !important;
            transition: filter 0.3s ease !important;
            user-select: none !important;
            pointer-events: none !important;
        }

        #yts-subs-section:hover {
            filter: none !important;
            pointer-events: auto !important;
        }

        /* ── Reveal mode ── */
        .yts-reveal body.yts-home div.ytThumbnailViewModelImage,
        .yts-reveal body.yts-home yt-thumbnail-view-model,
        .yts-reveal body.yts-home a.ytLockupViewModelContentImage,
        .yts-reveal body.yts-home ytd-thumbnail,
        .yts-reveal body.yts-home ytd-thumbnail img,
        .yts-reveal body.yts-home a#thumbnail,
        .yts-reveal body.yts-home #thumbnail img {
            filter: none !important;
            border-radius: 0 !important;
        }

        .yts-reveal body.yts-home yt-avatar-shape img.ytSpecAvatarShapeImage,
        .yts-reveal body.yts-home yt-decorated-avatar-view-model,
        .yts-reveal body.yts-home ytd-avatar-block-view-model {
            filter: none !important;
        }

        .yts-reveal body.yts-home h3.ytLockupMetadataViewModelHeadingReset,
        .yts-reveal body.yts-home a.ytLockupMetadataViewModelTitle,
        .yts-reveal body.yts-home span.ytAttributedStringHost.ytAttributedStringWhiteSpacePreWrap,
        .yts-reveal body.yts-home #video-title,
        .yts-reveal body.yts-home yt-formatted-string#video-title,
        .yts-reveal body.yts-home a#video-title-link yt-formatted-string {
            filter: none !important;
            user-select: auto !important;
        }

        .yts-reveal #yts-subs-section {
            filter: none !important;
            pointer-events: auto !important;
            user-select: auto !important;
        }

        /* ── Badge ── */
        #yts-badge {
            position: fixed !important;
            bottom: 12px !important;
            left: 12px !important;
            z-index: 2147483647 !important;
            padding: 2px 8px !important;
            border-radius: 4px !important;
            border: 1px solid rgba(255, 70, 70, 0.3) !important;
            background: transparent !important;
            color: rgba(255, 70, 70, 0.6) !important;
            font-family: sans-serif !important;
            font-size: 10px !important;
            white-space: nowrap !important;
            cursor: pointer !important;
            transition: opacity 0.35s ease, transform 0.35s ease !important;
        }

        #yts-badge:hover {
            background: rgba(255, 70, 70, 0.08) !important;
            color: #ff4d4d !important;
        }

        #yts-badge.yts-out {
            opacity: 0 !important;
            transform: translateY(6px) !important;
            pointer-events: none !important;
        }

    `);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Subscriptions section handler
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function markSubsSection() {
        document.getElementById('yts-subs-section')?.removeAttribute('id');

        const sections = document.querySelectorAll('ytd-guide-section-renderer');
        for (const section of sections) {
            const firstItem = section.querySelector('ytd-guide-entry-renderer yt-formatted-string');
            if (SUBS_LABELS.has(firstItem?.textContent.trim())) {
                section.id = 'yts-subs-section';
                break;
            }
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Page state manager
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function updatePageState() {
        if (isHomePage()) {
            document.body.classList.add('yts-home');
        } else {
            document.body.classList.remove('yts-home');
        }
        markSubsSection();
        refreshBadge();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Badge
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function createBadge() {
        if (document.getElementById('yts-badge')) return;

        const badge = document.createElement('div');
        badge.id = 'yts-badge';

        badge.addEventListener('click', () => {
            if (!isHomePage()) return;
            revealed = !revealed;
            document.documentElement.classList.toggle('yts-reveal', revealed);
            refreshBadge();
        });

        badge.addEventListener('mouseenter', () => {
            clearTimeout(hideTimer);
            badge.classList.remove('yts-out');
        });

        badge.addEventListener('mouseleave', () => {
            hideTimer = setTimeout(() => badge.classList.add('yts-out'), 3000);
        });

        document.body.appendChild(badge);
        refreshBadge();
    }

    function refreshBadge() {
        const badge = document.getElementById('yts-badge');
        if (!badge) return;

        if (!isHomePage()) {
            badge.classList.add('yts-out');
            return;
        }

        badge.textContent = revealed ? '👁 visible' : '🙈 hidden';
        badge.classList.remove('yts-out');

        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => badge.classList.add('yts-out'), 3000);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Observer — catch sidebar when it loads
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const observer = new MutationObserver(() => {
        if (!document.getElementById('yts-subs-section')) {
            markSubsSection();
        }
    });

    observer.observe(document.documentElement, {
        childList : true,
        subtree   : true,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SPA navigation listener
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    window.addEventListener('yt-navigate-finish', updatePageState);
    window.addEventListener('popstate', updatePageState);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Init
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function init() {
        updatePageState();
        createBadge();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
