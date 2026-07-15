// ==UserScript==
// @name         GitHub Release Asset Navigator
// @namespace    https://github.com/
// @version      0.1.5
// @description  Highlight platform, architecture, and package type in GitHub release assets while de-emphasizing metadata and source archives.
// @match        https://github.com/*/*/releases
// @match        https://github.com/*/*/releases/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'gh-release-asset-navigator-style';
  const PROCESSED = 'data-gh-ran-processed';
  const ASSETS_ID = 'gh-ran-assets';
  const SOURCE_CODE_TEXT = /^source code \((?:zip|tar\.gz)\)$/i;
  const SOURCE_CODE_URL = /\/archive\/refs\/(?:tags|heads)\/[^?#]+\.(?:zip|tar\.gz)(?:[?#]|$)/i;
  const ATTESTATION_TEXT = /^release attestation \(json\)$/i;
  const METADATA_FILE = /(?:\.blockmap|\.(?:sha(?:1|256|384|512)?|md5|asc|sig|gpg|json|yml|yaml|txt))$/i;
  const PLATFORM = [
    ['android', /(?:^|[-_.])android(?:$|[-_.])|\.aab$/i],
    ['windows', /(?:^|[-_.])(?:win(?:dows)?)(?:$|[-_.])|\.(?:exe|msi|msix|appx)$/i],
    ['macOS', /(?:^|[-_.])(?:mac(?:os)?|osx|darwin)(?:$|[-_.])|\.(?:dmg|pkg)$/i],
    ['Linux', /(?:^|[-_.])(?:linux|ubuntu|debian|fedora|appimage)(?:$|[-_.])|\.appimage$/i],
  ];
  const ARCHITECTURE = [
    ['ARM64', /(?:^|[-_.])(?:arm64|aarch64)(?:$|[-_.])/i],
    ['ARM', /(?:^|[-_.])(?:armv?[5-8](?:l|hf)?|arm32)(?:$|[-_.])/i],
    ['x64', /(?:^|[-_.])(?:x64|x86_64|amd64)(?:$|[-_.])/i],
    ['x86', /(?:^|[-_.])(?:x86|i[3-6]86|ia32|win32)(?:$|[-_.])/i],
    ['Universal', /(?:^|[-_.])(?:universal|all)(?:$|[-_.])/i],
  ];
  const PACKAGE_TYPE = [
    ['APK', /\.apk$/i],
    ['AAB', /\.aab$/i],
    ['DMG', /\.dmg$/i],
    ['EXE', /\.exe$/i],
    ['MSI', /\.msi$/i],
    ['AppImage', /\.appimage$/i],
    ['DEB', /\.deb$/i],
    ['RPM', /\.rpm$/i],
    ['PKG', /\.pkg$/i],
    ['ZIP', /\.zip$/i],
    ['tar.gz', /\.tar\.gz$/i],
    ['tar.xz', /\.tar\.xz$/i],
    ['7Z', /\.7z$/i],
  ];

  function firstMatch(value, rules) {
    const match = rules.find(([, pattern]) => pattern.test(value));
    return match?.[0];
  }

  function createBadge(text, kind) {
    const badge = document.createElement('span');
    badge.className = `gh-ran-badge gh-ran-badge--${kind}`;
    badge.textContent = text;
    return badge;
  }

  function findAssetRows() {
    return document.querySelectorAll(
      'a[href*="/releases/download/"]'
    );
  }

  function processAsset(link) {
    if (link.hasAttribute(PROCESSED)) return;

    const name = link.textContent.trim();
    if (!name) return;

    link.setAttribute(PROCESSED, '');
    const row = link.closest('li, .Box-row') || link.parentElement;
    if (!row) return;

    if (METADATA_FILE.test(name)) {
      row.classList.add('gh-ran-muted');
      link.classList.add('gh-ran-link-muted');
      return;
    }

    const platform = firstMatch(name, PLATFORM);
    const architecture = firstMatch(name, ARCHITECTURE);
    const packageType = firstMatch(name, PACKAGE_TYPE);
    const badges = document.createElement('span');
    badges.className = 'gh-ran-badges';

    if (platform) badges.append(createBadge(platform, 'platform'));
    if (architecture) badges.append(createBadge(architecture, 'architecture'));
    if (packageType) badges.append(createBadge(packageType, 'package'));

    if (badges.childElementCount) {
      link.insertAdjacentElement('afterend', badges);
      row.classList.add('gh-ran-asset');
    }
  }

  function processSourceCode() {
    document.querySelectorAll('a').forEach((link) => {
      const text = link.textContent.replace(/\s+/g, ' ').trim();
      const href = link.getAttribute('href') || '';
      if (link.hasAttribute(PROCESSED) || (!SOURCE_CODE_TEXT.test(text) && !SOURCE_CODE_URL.test(href))) return;
      link.setAttribute(PROCESSED, '');
      const row = link.closest('li, .Box-row') || link.parentElement;
      row?.classList.add('gh-ran-muted');
      link.classList.add('gh-ran-link-muted');
    });
  }

  function processAttestations() {
    document.querySelectorAll('a').forEach((link) => {
      if (link.hasAttribute(PROCESSED) || !ATTESTATION_TEXT.test(link.textContent.replace(/\s+/g, ' ').trim())) return;
      link.setAttribute(PROCESSED, '');
      const row = link.closest('li, .Box-row') || link.parentElement;
      row?.classList.add('gh-ran-muted');
      link.classList.add('gh-ran-link-muted');
    });
  }

  function addAssetsJump() {
    if (!/^\/[^/]+\/[^/]+\/releases\/tag\//.test(location.pathname)) return;

    const assetsSummary = [...document.querySelectorAll('details > summary')]
      .find((summary) => summary.textContent.replace(/\s+/g, ' ').trim().startsWith('Assets'));
    const assetsSection = assetsSummary?.closest('details-toggle, .tmp-mb-3');
    const breadcrumb = document.querySelector('nav[aria-label="Breadcrumb"]');
    if (!assetsSection || !breadcrumb || document.getElementById('gh-ran-assets-jump')) return;

    assetsSection.id = ASSETS_ID;
    const jump = document.createElement('a');
    jump.id = 'gh-ran-assets-jump';
    jump.className = 'gh-ran-assets-jump';
    jump.href = `#${ASSETS_ID}`;
    jump.textContent = 'Jump to Assets';
    jump.setAttribute('aria-label', 'Jump to release assets');
    breadcrumb.classList.add('gh-ran-breadcrumb');
    breadcrumb.append(jump);
  }

  let processingScheduled = false;

  function processPage() {
    addStyles();
    findAssetRows().forEach(processAsset);
    processSourceCode();
    processAttestations();
    addAssetsJump();
  }

  function scheduleProcessing() {
    if (processingScheduled) return;
    processingScheduled = true;
    requestAnimationFrame(() => {
      processingScheduled = false;
      processPage();
    });
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .gh-ran-asset { position: relative; }
      .gh-ran-badges {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 5px;
        margin: 0 10px;
        vertical-align: middle;
      }
      .gh-ran-badge {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 8px;
        border: 1px solid;
        border-radius: 999px;
        font: 600 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .02em;
        white-space: nowrap;
      }
      .gh-ran-badge--platform { color: #0969da; background: #ddf4ff; border-color: #80ccff; }
      .gh-ran-badge--architecture { color: #8250df; background: #fbefff; border-color: #d8b4fe; }
      .gh-ran-badge--package { color: #1a7f37; background: #dafbe1; border-color: #7ee787; }
      .gh-ran-muted {
        opacity: .42;
        filter: grayscale(1);
        transition: opacity .15s ease, filter .15s ease;
      }
      .gh-ran-muted:hover,
      .gh-ran-muted:focus-within { opacity: .82; filter: none; }
      .gh-ran-link-muted { font-size: .9em; }
      #${ASSETS_ID} { scroll-margin-top: 76px; }
      .gh-ran-breadcrumb {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }
      .gh-ran-breadcrumb ol { margin-bottom: 0; }
      .gh-ran-assets-jump {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 0 15px;
        border: 1px solid #0550ae;
        border-radius: 7px;
        box-shadow: 0 2px 5px rgb(9 105 218 / .28);
        color: #fff;
        background: #0969da;
        font-size: 14px;
        font-weight: 700;
        line-height: 24px;
        text-decoration: none;
      }
      .gh-ran-assets-jump:hover {
        background: #0550ae;
        box-shadow: 0 3px 8px rgb(9 105 218 / .38);
        text-decoration: none;
      }
      .gh-ran-assets-jump:focus-visible { outline: 2px solid #54aeff; outline-offset: 2px; }
      @media (prefers-color-scheme: dark) {
        .gh-ran-badge--platform { color: #79c0ff; background: #0d2847; border-color: #1f6feb; }
        .gh-ran-badge--architecture { color: #d2a8ff; background: #2d1f4e; border-color: #8957e5; }
        .gh-ran-badge--package { color: #7ee787; background: #173c24; border-color: #2ea043; }
      }
    `;
    document.head.append(style);
  }

  addStyles();
  processPage();

  new MutationObserver(scheduleProcessing).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener('turbo:load', scheduleProcessing);
  document.addEventListener('turbo:render', scheduleProcessing);
  document.addEventListener('pjax:end', scheduleProcessing);
})();
