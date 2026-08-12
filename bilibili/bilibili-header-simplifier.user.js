// ==UserScript==
// @name         Bilibili Header Simplifier
// @namespace    https://www.bilibili.com/
// @version      0.5.0
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
  const WATCHLATER_CLASS = 'bili-hs-watchlater-entry';
  const EXPANDED_CLASS = 'bili-hs-expanded';

  const css = `
    /* Hide all top-level <li> entries (and vip-wrap div) inside the right-entry bar … */
    ul.right-entry > li,
    ul.right-entry > .vip-wrap {
      display: none !important;
    }
    /* … then re-show the ones we want to keep */
    ul.right-entry > li.${KEEP_CLASS} {
      display: list-item !important;
    }
    /* The dynamically-injected Watch Later entry */
    .${WATCHLATER_CLASS} {
      display: flex !important;
      align-items: center;
      gap: 4px;
    }
    /* Expand toggle button */
    .bili-hs-toggle {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      cursor: pointer;
      color: var(--text2, #18191c);
      border-radius: 50%;
      transition: background 0.2s;
      user-select: none;
    }
    .bili-hs-toggle:hover {
      background: var(--graph_bg_regular, #f1f2f3);
    }
    .bili-hs-toggle svg {
      transition: transform 0.25s ease;
    }
    /* Expanded mode: show all original entries, hide toggle */
    ul.right-entry.${EXPANDED_CLASS} > li,
    ul.right-entry.${EXPANDED_CLASS} > .vip-wrap {
      display: list-item !important;
    }
    ul.right-entry.${EXPANDED_CLASS} > .${TOGGLE_LI_CLASS} {
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

  function createHomeEntry() {
    const li = document.createElement('li');
    li.className = `right-entry-item ${KEEP_CLASS} bili-hs-home-entry`;
    const a = document.createElement('a');
    a.href = 'https://www.bilibili.com';
    a.className = 'right-entry__outside';
    a.innerHTML = `
      <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg" class="right-entry-icon">
        <path d="M10 2.5L2 9.5V18C2 18.5523 2.44772 19 3 19H7V13H13V19H17C17.5523 19 18 18.5523 18 18V9.5L10 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>
      </svg>
      <span class="right-entry-text">首页</span>
    `;
    li.appendChild(a);
    return li;
  }

  function createWatchLaterEntry() {
    const li = document.createElement('li');
    li.className = `right-entry-item v-popover-wrap ${KEEP_CLASS} ${WATCHLATER_CLASS}`;
    const a = document.createElement('a');
    a.href = 'https://www.bilibili.com/watchlater/list';
    a.className = 'right-entry__outside';
    a.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="right-entry-icon">
        <path d="M12 3.74976C7.44366 3.74976 3.75001 7.44341 3.75001 11.9998C3.75001 16.5561 7.44366 20.2498 12 20.2498C14.27795 20.2498 16.339 19.32755 17.83275 17.8343C18.12565 17.5415 18.6005 17.54155 18.8934 17.83445C19.1862 18.1274 19.1861 18.6023 18.8932 18.89515C17.1297 20.65805 14.69165 21.7498 12 21.7498C6.61523 21.7498 2.25001 17.38455 2.25001 11.9998C2.25001 6.61498 6.61523 2.24976 12 2.24976C17.38475 2.24976 21.75 6.61498 21.75 11.9998C21.75 12.36535 21.72985 12.72655 21.69055 13.08215C21.645 13.4939 21.27435 13.79075 20.8627 13.7452C20.451 13.6997 20.1541 13.32905 20.1996 12.91735C20.2329 12.61635 20.25 12.3102 20.25 11.9998C20.25 7.44341 16.55635 3.74976 12 3.74976z" fill="currentColor"></path>
        <path d="M18.4697 10.9694C18.76255 10.6765 19.23745 10.6765 19.53035 10.9694L21 12.43905L22.4697 10.9694C22.76255 10.6765 23.23745 10.6765 23.53035 10.9694C23.8232 11.26235 23.8232 11.73715 23.53035 12.0301L21.7071 13.8533C21.3166 14.2438 20.68345 14.2438 20.2929 13.8533L18.4697 12.0301C18.1768 11.73715 18.1768 11.26235 18.4697 10.9694z" fill="currentColor"></path>
        <path d="M14.9992 11.13405C15.6657 11.5188 15.6657 12.4808 14.9992 12.86555L11.2487 15.03095C10.58225 15.4157 9.74913 14.9347 9.74913 14.16515L9.74913 9.83448C9.74913 9.06488 10.58225 8.58388 11.2487 8.96868L14.9992 11.13405z" fill="currentColor"></path>
      </svg>
      <span class="right-entry-text">稍后再看</span>
    `;
    li.appendChild(a);
    return li;
  }

  function createToggleEntry(ul) {
    const li = document.createElement('li');
    li.className = `right-entry-item ${KEEP_CLASS} ${TOGGLE_LI_CLASS}`;
    const btn = document.createElement('div');
    btn.className = 'bili-hs-toggle';
    btn.title = '展开全部';
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    btn.addEventListener('click', () => {
      ul.classList.toggle(EXPANDED_CLASS);
      const expanded = ul.classList.contains(EXPANDED_CLASS);
      btn.title = expanded ? '收起' : '展开全部';
      const svg = btn.querySelector('svg');
      if (svg) svg.style.transform = expanded ? 'rotate(180deg)' : '';
    });
    li.appendChild(btn);
    return li;
  }

  function isProcessed(ul) {
    return ul.querySelector(':scope > li.' + TOGGLE_LI_CLASS) !== null;
  }

  function process() {
    const ul = document.querySelector('ul.right-entry');
    if (!ul) return;
    if (isProcessed(ul)) return;

    addStyles();

    const lis = ul.querySelectorAll(':scope > li');

    lis.forEach((li) => {
      if (li.classList.contains(KEEP_CLASS)) return;
      const text = li.textContent || '';
      if (text.includes('动态') || text.includes('历史')) {
        li.classList.add(KEEP_CLASS);
      }
    });

    if (!ul.querySelector(':scope > li.bili-hs-home-entry')) {
      const home = createHomeEntry();
      const dyn = Array.from(ul.querySelectorAll(':scope > li'))
        .find((li) => (li.textContent || '').includes('动态'));
      if (dyn) {
        ul.insertBefore(home, dyn);
      } else {
        ul.appendChild(home);
      }
    }

    if (!ul.querySelector(':scope > li.' + WATCHLATER_CLASS)) {
      const watchLater = createWatchLaterEntry();
      const dyn = Array.from(ul.querySelectorAll(':scope > li.' + KEEP_CLASS))
        .find((li) => (li.textContent || '').includes('动态'));
      if (dyn && dyn.nextElementSibling) {
        ul.insertBefore(watchLater, dyn.nextElementSibling);
      } else {
        ul.appendChild(watchLater);
      }
    }

    if (!isProcessed(ul)) {
      ul.appendChild(createToggleEntry(ul));
    }
  }

  function init() {
    addStyles();
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
