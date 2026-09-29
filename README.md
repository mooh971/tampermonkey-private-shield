# Tampermonkey Private Shield

Private Shield is a Tampermonkey userscript that hides emails, phone numbers, IP addresses, and national ID numbers on web pages so they don't leak while you screenshare or stream. It runs locally in your browser, works on modern front-end sites, and is free.

Use it when you share your screen on Discord, Zoom, Google Meet, or Microsoft Teams, when you stream on YouTube or Twitch, or when you record tutorials and demos.

## The problem

When you share your screen or stream live, personal details can show up by accident: your email in an account menu, your phone number in a settings page, or your IP address in a dashboard. Private Shield masks them before anyone sees them.

## What it hides

1. Email addresses
2. Phone numbers, including numbers written with Arabic-Indic digits
3. IPv4 and IPv6 addresses, with or without a port
4. 10-digit national ID numbers (the first two digits must be between 10 and 30)

Each type can be turned off in the settings. Times and dates are never masked.

## How it works

Private Shield scans the text on the page and replaces each match with a masked version. Every letter and digit becomes an "x" and the text is blurred, so `user@example.com` shows up as `xxxx@xxxxxxx.xxx`.

It also catches content that appears after the page loads, text inside shadow DOM components, and the `title` and `aria-label` attributes of elements. It runs on every http and https page and skips Cloudflare challenge pages so they still load.

Click a masked value to reveal it, and click again to hide it. A small badge in the corner shows how many values are hidden on the page. Click the badge to reveal or hide all of them, or click the gear to open the settings. You can also open the settings from the Tampermonkey menu under "Private Shield Settings".

## Settings

- Turn masking on or off separately for emails, phone numbers, IP addresses, and national IDs
- Whitelist sites where you don't want masking, as a comma-separated list. Wildcards like `*.example.com` work.

Settings are stored on your machine through Tampermonkey.

## Privacy

Everything runs locally. The script itself makes no network requests and sends nothing anywhere. It is a single file, `private-shield.user.js`, so you can read all of it. Tampermonkey can check this repository for new versions, and you can turn that off in its settings.

## Limitations

Private Shield is a safety net, not a guarantee. Check your screen before you go live.

- It only masks text in the page. Values inside images, video, canvas, SVG, and PDF viewers are not masked.
- Text in input fields, textareas, and editable areas is not masked.
- It can't touch anything outside the page: the address bar, the tab strip, and other windows on your desktop.
- Matching is pattern based. It can hide numbers that only look like phone numbers or IDs, and it can miss unusual formats. It does not detect names or street addresses.
- To let you reveal a value with a click, the original is kept in the page's DOM. It never appears on screen, but it is visible in DevTools, so keep DevTools closed while you share.
- It does not run on `file://` pages or browser pages such as `chrome://`.

## Requirements

- A browser that supports Tampermonkey: Chrome, Edge, Firefox, Brave, or Opera
- The Tampermonkey extension

## How to install

### 1. Install the Tampermonkey extension

Pick your browser:

[![Chrome](https://img.shields.io/badge/Chrome-Download-blue?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
[![Edge](https://img.shields.io/badge/Edge-Download-purple?style=for-the-badge&logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
[![Firefox](https://img.shields.io/badge/Firefox-Download-orange?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/firefox/addon/tampermonkey/)
[![Brave](https://img.shields.io/badge/Brave-Download-orange?style=for-the-badge&logo=brave&logoColor=white)](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
[![Opera](https://img.shields.io/badge/Opera-Download-red?style=for-the-badge&logo=opera&logoColor=white)](https://addons.opera.com/extensions/details/tampermonkey-beta/)

### 2. Install the script

Click the green button, then press Install in the window that opens:

[![Install Script](https://img.shields.io/badge/Install_Private_Shield-4bc51d?style=for-the-badge&font-weight=bold&logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js)

### 3. Check that it works

Open any page that shows an email address or a phone number. The value should appear masked, with a small badge in the corner showing the count.

## Live demo

<div align="center">
  <video src="https://github.com/user-attachments/assets/0a62c929-9b04-4dd6-a955-a26f991a9fd1" width="550" style="max-width: 100%; border-radius: 8px; border: 1px solid #334155;" controls autoplay muted loop></video>
</div>

## FAQ

### How do I hide my email or phone number when screensharing?

Install Tampermonkey, then install Private Shield. It masks emails, phone numbers, IP addresses, and national ID numbers on every page you open. Click a masked value to reveal it.

### Which browsers are supported?

Chrome, Edge, Firefox, Brave, and Opera, anywhere Tampermonkey runs.

### Can I turn it off for a specific site?

Yes. Add the site to the whitelist in the settings. Wildcards like `*.example.com` work.

### Does Private Shield send my data anywhere?

No. The script makes no network requests. Everything happens in your browser.

### Does it slow down websites?

It only rescans the parts of the page that change and skips text that can't contain a match, which keeps the overhead small.

### Is it free?

Yes.
