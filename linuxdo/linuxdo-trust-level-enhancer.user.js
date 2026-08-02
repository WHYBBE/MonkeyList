// ==UserScript==
// @name         LinuxDo Trust Level Enhancer
// @namespace    https://linux.do/
// @version      0.4.0
// @description  Strengthen trust level display on linux.do topic lists by turning the LvN portion of category badges into prominent colored chips, accenting rows by trust level, and de-emphasizing promotional topics.
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'ld-tle-style';
  const CHIP_CLASS = 'ld-tle-chip';
  const ROW_CLASS = 'ld-tle-row';
  const PROMO_CLASS = 'ld-tle-promo';
  const NAME_SEL = '.badge-category__name';
  const PROMO_TAGS = ['高级推广'];

  function parseLevel(text) {
    text = (text || '').trim();
    if (!text) return null;
    let m = text.match(/^(.+?)[,，]\s*Lv\s*(\d+)\s*$/i);
    if (m && m[1].trim()) return { name: m[1].trim(), level: Number(m[2]) };
    m = text.match(/\bLv\s*(\d+)\b/i);
    if (m) {
      const level = Number(m[1]);
      const name = text.replace(/\s*[,，]?\s*Lv\s*\d+\s*/i, '').trim();
      if (name && level >= 0 && level <= 4) return { name, level };
    }
    return null;
  }

  function enhanceBadge(nameEl) {
    const parsed = parseLevel(nameEl.textContent);
    const row = nameEl.closest('tr.topic-list-item');
    const td = row && row.querySelector('td.main-link');
    if (td && parsed) {
      td.classList.add(ROW_CLASS, `${ROW_CLASS}--${parsed.level}`);
    }
    const intact = nameEl.lastElementChild && nameEl.lastElementChild.classList.contains(CHIP_CLASS);
    if (intact || !parsed) return;

    const { name, level } = parsed;
    nameEl.textContent = name;
    const chip = document.createElement('span');
    chip.className = `${CHIP_CLASS} ${CHIP_CLASS}--${level}`;
    chip.textContent = `Lv${level}`;
    chip.title = `信任等级 ${level}`;
    nameEl.append(chip);
  }

  function weakenPromoRows() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const tagNames = [...row.querySelectorAll('a.discourse-tag[data-tag-name]')]
        .map((a) => a.getAttribute('data-tag-name'));
      const isPromo = PROMO_TAGS.some((t) => tagNames.includes(t));
      row.classList.toggle(PROMO_CLASS, isPromo);
    });
  }

  function processPage() {
    addStyles();
    document.querySelectorAll(NAME_SEL).forEach(enhanceBadge);
    weakenPromoRows();
  }

  let processingScheduled = false;
  let retryTimer;

  function scheduleProcessing() {
    if (processingScheduled) return;
    processingScheduled = true;
    requestAnimationFrame(() => {
      processingScheduled = false;
      processPage();
    });
  }

  function processWithRetries() {
    clearTimeout(retryTimer);
    scheduleProcessing();
    const delays = [150, 600, 2000, 5000];
    let index = 0;
    const retry = () => {
      scheduleProcessing();
      if (index < delays.length) retryTimer = setTimeout(retry, delays[index++]);
    };
    retryTimer = setTimeout(retry, delays[index++]);
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${CHIP_CLASS} {
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        padding: 0 6px;
        border-radius: 999px;
        font: 700 10px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .03em;
        vertical-align: 1px;
      }
      .${CHIP_CLASS}--0 { color: #fff; background: #8a9199; }
      .${CHIP_CLASS}--1 { color: #fff; background: #0969da; }
      .${CHIP_CLASS}--2 { color: #fff; background: #1a7f37; }
      .${CHIP_CLASS}--3 { color: #24292f; background: #d4a72c; }
      .${CHIP_CLASS}--4 { color: #fff; background: #8250df; }
      td.${ROW_CLASS} { box-shadow: inset 3px 0 0 transparent !important; }
      td.${ROW_CLASS}--0 { box-shadow: inset 3px 0 0 #8a9199 !important; }
      td.${ROW_CLASS}--1 { box-shadow: inset 3px 0 0 #0969da !important; }
      td.${ROW_CLASS}--2 { box-shadow: inset 3px 0 0 #1a7f37 !important; }
      td.${ROW_CLASS}--3 { box-shadow: inset 3px 0 0 #d4a72c !important; }
      td.${ROW_CLASS}--4 { box-shadow: inset 3px 0 0 #8250df !important; }
      tr.${PROMO_CLASS} td {
        opacity: .38;
        filter: grayscale(.7);
        background: linear-gradient(90deg, rgba(178,186,197,.14), rgba(178,186,197,.04));
        transition: opacity .15s ease, filter .15s ease, background .15s ease;
      }
      tr.${PROMO_CLASS} td:first-child {
        box-shadow: inset 3px 0 0 #9aa4af !important;
      }
      tr.${PROMO_CLASS} .raw-topic-link {
        text-decoration: line-through;
        text-decoration-color: rgba(110,118,129,.6);
        text-decoration-thickness: 1.5px;
      }
      tr.${PROMO_CLASS}:hover td {
        opacity: .88;
        filter: none;
        background: transparent;
      }
      tr.${PROMO_CLASS}:hover .raw-topic-link { text-decoration: none; }
      @media (prefers-color-scheme: dark) {
        .${CHIP_CLASS}--0 { color: #f0f6fc; background: #6e7681; }
        .${CHIP_CLASS}--1 { color: #f0f6fc; background: #1f6feb; }
        .${CHIP_CLASS}--2 { color: #f0f6fc; background: #2ea043; }
        .${CHIP_CLASS}--3 { color: #3d2e00; background: #e3b341; }
        .${CHIP_CLASS}--4 { color: #f0f6fc; background: #8957e5; }
        td.${ROW_CLASS}--0 { box-shadow: inset 3px 0 0 #6e7681 !important; }
        td.${ROW_CLASS}--1 { box-shadow: inset 3px 0 0 #1f6feb !important; }
        td.${ROW_CLASS}--2 { box-shadow: inset 3px 0 0 #2ea043 !important; }
        td.${ROW_CLASS}--3 { box-shadow: inset 3px 0 0 #e3b341 !important; }
        td.${ROW_CLASS}--4 { box-shadow: inset 3px 0 0 #8957e5 !important; }
      }
    `;
    document.head.append(style);
  }

  addStyles();
  processWithRetries();

  new MutationObserver(scheduleProcessing).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', scheduleProcessing);
})();
