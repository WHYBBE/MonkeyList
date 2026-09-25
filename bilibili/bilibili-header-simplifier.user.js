// ==UserScript==
// @name         Bilibili Header Simplifier
// @namespace    https://www.bilibili.com/
// @version      0.8.1
// @description  Simplify the bilibili header right navigation across all bilibili subdomains: keep only Home (首页), Dynamics (动态), Watch Later (稍后再看), and History (历史); hide everything else including the VIP button. Adds an expand toggle to temporarily restore all entries.
// @match        https://www.bilibili.com/*
// @match        https://t.bilibili.com/*
// @match        https://message.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://account.bilibili.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'bili-header-simplifier-style';
  const KEEP_CLASS = 'bili-hs-keep';
  const TOGGLE_LI_CLASS = 'bili-hs-toggle-li';
  const HOME_CLASS = 'bili-hs-home-entry';
  const WATCHLATER_CLASS = 'bili-hs-watchlater-entry';
  const EXPANDED_CLASS = 'bili-hs-expanded';

  const HOME_SVG = `
    <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg" class="trigger-icon">
      <path d="M10 2.5L2 9.5V18C2 18.5523 2.44772 19 3 19H7V13H13V19H17C17.5523 19 18 18.5523 18 18V9.5L10 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>
    </svg>`;

  const WATCHLATER_SVG = `
    <svg width="20" height="21" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="trigger-icon">
      <path d="M12 3.74976C7.44366 3.74976 3.75001 7.44341 3.75001 11.9998C3.75001 16.5561 7.44366 20.2498 12 20.2498C14.27795 20.2498 16.339 19.32755 17.83275 17.8343C18.12565 17.5415 18.6005 17.54155 18.8934 17.83445C19.1862 18.1274 19.1861 18.6023 18.8932 18.89515C17.1297 20.65805 14.69165 21.7498 12 21.7498C6.61523 21.7498 2.25001 17.38455 2.25001 11.9998C2.25001 6.61498 6.61523 2.24976 12 2.24976C17.38475 2.24976 21.75 6.61498 21.75 11.9998C21.75 12.36535 21.72985 12.72655 21.69055 13.08215C21.645 13.4939 21.27435 13.79075 20.8627 13.7452C20.451 13.6997 20.1541 13.32905 20.1996 12.91735C20.2329 12.61635 20.25 12.3102 20.25 11.9998C20.25 7.44341 16.55635 3.74976 12 3.74976z" fill="currentColor"></path>
      <path d="M18.4697 10.9694C18.76255 10.6765 19.23745 10.6765 19.53035 10.9694L21 12.43905L22.4697 10.9694C22.76255 10.6765 23.23745 10.6765 23.53035 10.9694C23.8232 11.26235 23.8232 11.73715 23.53035 12.0301L21.7071 13.8533C21.3166 14.2438 20.68345 14.2438 20.2929 13.8533L18.4697 12.0301C18.1768 11.73715 18.1768 11.26235 18.4697 10.9694z" fill="currentColor"></path>
      <path d="M14.9992 11.13405C15.6657 11.5188 15.6657 12.4808 14.9992 12.86555L11.2487 15.03095C10.58225 15.4157 9.74913 14.9347 9.74913 14.16515L9.74913 9.83448C9.74913 9.06488 10.58225 8.58388 11.2487 8.96868L14.9992 11.13405z" fill="currentColor"></path>
    </svg>`;

  const css = `
    /* Legacy header: ul.right-entry > li */
    ul.right-entry > li,
    ul.right-entry > .vip-wrap {
      display: none !important;
    }
    ul.right-entry > li.${KEEP_CLASS} {
      display: flex !important;
      align-items: center;
      flex-shrink: 0;
    }

    /* Current header: div.right-entry > .right-entry__main > .right-entry__item */
    div.right-entry .right-entry__item {
      display: none !important;
    }
    div.right-entry .right-entry__item.${KEEP_CLASS} {
      display: block !important;
    }

    ul.right-entry > li.${WATCHLATER_CLASS} {
      display: flex !important;
      align-items: center;
      gap: 4px;
    }

    .bili-hs-toggle {
      cursor: pointer;
      user-select: none;
    }
    .bili-hs-toggle svg {
      transition: transform 0.25s ease;
    }
    .bili-hs-toggle--legacy {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      color: inherit;
      border-radius: 50%;
      transition: background 0.2s;
    }
    .bili-hs-toggle--legacy:hover {
      background: color-mix(in srgb, currentColor 12%, transparent);
    }

    /* Expanded mode: show all original entries, hide toggle */
    ul.right-entry.${EXPANDED_CLASS} > li,
    ul.right-entry.${EXPANDED_CLASS} > .vip-wrap {
      display: flex !important;
      align-items: center;
    }
    div.right-entry.${EXPANDED_CLASS} .right-entry__item {
      display: block !important;
    }
    ul.right-entry.${EXPANDED_CLASS} > .${TOGGLE_LI_CLASS},
    div.right-entry.${EXPANDED_CLASS} .${TOGGLE_LI_CLASS} {
      display: none !important;
    }
  `;

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function isLegacy(root) {
    return root.tagName === 'UL';
  }

  function mountOf(root) {
    if (isLegacy(root)) return root;
    return root.querySelector(':scope > .right-entry__main') || root;
  }

  function createItem(root, extraClasses, innerHTML) {
    const li = document.createElement(isLegacy(root) ? 'li' : 'div');
    const base = isLegacy(root) ? 'right-entry-item' : 'right-entry__item';
    li.className = `${base} ${KEEP_CLASS} ${extraClasses}`.trim();
    li.innerHTML = innerHTML;
    return li;
  }

  function createHomeEntry(root) {
    const triggerClass = isLegacy(root) ? 'right-entry__outside' : 'right-entry__item-trigger';
    const textClass = isLegacy(root) ? 'right-entry-text' : 'trigger-text';
    const iconWrap = isLegacy(root) ? '' : '<div class="trigger-icon-wrap">';
    const iconWrapEnd = isLegacy(root) ? '' : '</div>';
    return createItem(root, HOME_CLASS, `
      <a href="https://www.bilibili.com" class="${triggerClass}" title="首页">
        ${iconWrap}${HOME_SVG}${iconWrapEnd}
        <span class="${textClass}">首页</span>
      </a>`);
  }

  function createWatchLaterEntry(root) {
    const triggerClass = isLegacy(root) ? 'right-entry__outside' : 'right-entry__item-trigger';
    const textClass = isLegacy(root) ? 'right-entry-text' : 'trigger-text';
    const wrap = isLegacy(root) ? 'v-popover-wrap ' : 'v-popover-wrap ';
    const iconWrap = isLegacy(root) ? '' : '<div class="trigger-icon-wrap">';
    const iconWrapEnd = isLegacy(root) ? '' : '</div>';
    return createItem(root, `${wrap}${WATCHLATER_CLASS}`, `
      <a href="https://www.bilibili.com/watchlater/list" class="${triggerClass}" title="稍后再看">
        ${iconWrap}${WATCHLATER_SVG}${iconWrapEnd}
        <span class="${textClass}">稍后再看</span>
      </a>`);
  }

  function createToggleEntry(root) {
    const legacy = isLegacy(root);
    const triggerClass = legacy ? 'right-entry__outside' : 'right-entry__item-trigger';
    const wrapStart = legacy ? '' : '<div class="trigger-icon-wrap">';
    const wrapEnd = legacy ? '' : '</div>';
    const iconClass = legacy ? 'right-entry-icon' : 'trigger-icon';
    const size = legacy ? 24 : 20;
    const li = createItem(root, TOGGLE_LI_CLASS, `
      <div class="${triggerClass} bili-hs-toggle${legacy ? ' bili-hs-toggle--legacy' : ''}" title="展开全部" role="button">
        ${wrapStart}
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="${iconClass}">
          <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${wrapEnd}
      </div>`);
    const btn = li.querySelector('.bili-hs-toggle');
    btn.addEventListener('click', () => {
      root.classList.toggle(EXPANDED_CLASS);
      const expanded = root.classList.contains(EXPANDED_CLASS);
      btn.title = expanded ? '收起' : '展开全部';
      const svg = btn.querySelector('svg');
      if (svg) svg.style.transform = expanded ? 'rotate(180deg)' : '';
    });
    return li;
  }

  function isInjected(el) {
    return el.classList.contains(HOME_CLASS)
      || el.classList.contains(WATCHLATER_CLASS)
      || el.classList.contains(TOGGLE_LI_CLASS);
  }

  function itemsOf(root) {
    if (isLegacy(root)) {
      return Array.from(root.querySelectorAll(':scope > li'));
    }
    const mount = mountOf(root);
    return Array.from(mount.children).filter((el) => el.classList.contains('right-entry__item'));
  }

  function nativeItems(root) {
    return itemsOf(root).filter((el) => !isInjected(el));
  }

  function triggerEl(el) {
    return el.querySelector('a.right-entry__item-trigger, a.left-entry__item-trigger, a.right-entry__outside')
      || el.querySelector('a');
  }

  function itemUrl(el) {
    const a = triggerEl(el);
    if (!a || !a.href) return null;
    try {
      return new URL(a.href);
    } catch (e) {
      return null;
    }
  }

  function triggerLabel(el) {
    const a = triggerEl(el);
    if (!a) return '';
    const span = a.querySelector('.trigger-text, .right-entry-text, .left-entry-text');
    return ((span || a).textContent || '').trim();
  }

  function isDynItem(el) {
    if (isInjected(el)) return false;
    if (el.classList.contains('dynamic-entry')) return true;
    const url = itemUrl(el);
    if (url) return /(^|\.)t\.bilibili\.com$/.test(url.hostname);
    return triggerLabel(el).includes('动态');
  }

  function isHistItem(el) {
    if (isInjected(el)) return false;
    if (el.classList.contains('history-entry')) return true;
    const url = itemUrl(el);
    if (url) return /\/history(?:\/|$)/.test(url.pathname);
    return triggerLabel(el).includes('历史');
  }

  function isContainerReady(root) {
    const items = nativeItems(root);
    if (!items.some(isDynItem) || !items.some(isHistItem)) return false;
    const searchBox = document.querySelector('.center-search-container');
    if (searchBox && !searchBox.querySelector('input, form, .nav-search-content, .nav-search-form')) {
      return false;
    }
    return true;
  }

  function processRoot(root) {
    if (!isContainerReady(root)) return;

    const mount = mountOf(root);
    nativeItems(root).forEach((el) => {
      if (isDynItem(el) || isHistItem(el)) el.classList.add(KEEP_CLASS);
    });

    const dyn = nativeItems(root).find(isDynItem);

    if (!root.querySelector('.' + HOME_CLASS)) {
      const home = createHomeEntry(root);
      if (dyn) mount.insertBefore(home, dyn);
      else mount.insertBefore(home, mount.firstChild);
    }

    const home = root.querySelector('.' + HOME_CLASS);
    if (!root.querySelector('.' + WATCHLATER_CLASS)) {
      const watchLater = createWatchLaterEntry(root);
      if (dyn && dyn.parentElement === mount) {
        mount.insertBefore(watchLater, dyn.nextElementSibling);
      } else if (home && home.nextElementSibling) {
        mount.insertBefore(watchLater, home.nextElementSibling);
      } else {
        mount.appendChild(watchLater);
      }
    }

    if (!root.querySelector('.' + TOGGLE_LI_CLASS)) {
      mount.appendChild(createToggleEntry(root));
    }
  }

  function containers() {
    return [
      ...document.querySelectorAll('ul.right-entry'),
      ...document.querySelectorAll('div.right-entry'),
    ];
  }

  function process() {
    if (!document.querySelector('.right-entry')) return;
    addStyles();
    containers().forEach(processRoot);
  }

  function init() {
    process();

    let debounce = null;
    const obs = new MutationObserver(() => {
      if (debounce) return;
      debounce = requestAnimationFrame(() => {
        debounce = null;
        process();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
