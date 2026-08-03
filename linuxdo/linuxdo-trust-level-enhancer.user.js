// ==UserScript==
// @name         LinuxDo Trust Level Enhancer
// @namespace    https://linux.do/
// @version      0.8.0
// @description  Strengthen trust level display on linux.do topic lists by turning the LvN portion of category badges into prominent colored chips, accenting rows by trust level, de-emphasizing promotional topics, surfacing the post creation date inside the activity column, highlighting the original poster's avatar, and emphasizing the original poster (楼主) on topic pages.
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
  const TIME_CLASS = 'ld-tle-time';
  const TIME_DONE = 'data-ld-tle-timedone';
  const POSTERS_DONE = 'data-ld-tle-postersdone';
  const OP_POST_CLASS = 'ld-tle-op-post';
  const NAME_SEL = '.badge-category__name';
  const PROMO_TAGS = ['高级推广'];

  let opUserId = null;
  let cachedTopicId = null;

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

  function parseCreatedDate(title) {
    if (!title) return null;
    const m = title.match(/创建日期[：:]\s*(.+?)(?:\n|$)/);
    return m ? m[1].trim() : null;
  }

  function formatCreated(raw) {
    const m = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
    if (!m) return raw;
    const [, y, mo, d, h, mi] = m;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const md = `${pad(Number(mo))}-${pad(Number(d))}`;
    const hm = h ? ` ${pad(Number(h))}:${mi}` : '';
    return Number(y) === now.getFullYear() ? md + hm : `${y}-${md}${hm}`;
  }

  function injectTimes() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      if (row.hasAttribute(TIME_DONE)) return;
      const activityTd = row.querySelector('td.activity');
      if (!activityTd) return;
      const created = parseCreatedDate(activityTd.getAttribute('title') || '');
      if (!created) return;
      row.setAttribute(TIME_DONE, '');
      const link = activityTd.querySelector('.post-activity');
      if (!link) return;
      const chip = document.createElement('span');
      chip.className = TIME_CLASS;
      chip.textContent = formatCreated(created);
      chip.title = `发帖于 ${created}`;
      link.insertAdjacentElement('afterend', chip);
    });
  }

  function enhancePosters() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const postersTd = row.querySelector('td.posters');
      if (!postersTd || postersTd.hasAttribute(POSTERS_DONE)) return;
      postersTd.setAttribute(POSTERS_DONE, '');
      const imgs = [...postersTd.querySelectorAll('a > img.avatar')];
      if (!imgs.length) return;
      const opImg = imgs.find((img) => /原始发帖人/.test(img.getAttribute('title') || '')) || imgs[0];
      opImg.classList.add('ld-tle-op');
      imgs.forEach((img) => { if (img !== opImg) img.classList.add('ld-tle-other'); });
      const mainTd = row.querySelector('td.main-link');
      const levelClass = mainTd && [...mainTd.classList].find((c) => /^ld-tle-row--\d$/.test(c));
      if (levelClass) opImg.classList.add(levelClass.replace('ld-tle-row', 'ld-tle-op'));
    });
  }

  function currentTopicId() {
    const m = location.pathname.match(/^\/t\/[^/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  function getOpUserId() {
    const tid = currentTopicId();
    if (tid !== null && tid === cachedTopicId && opUserId !== null) return opUserId;
    cachedTopicId = tid;
    opUserId = null;
    if (tid) {
      const preloaded = document.getElementById('data-preloaded');
      if (preloaded) {
        try {
          const data = JSON.parse(preloaded.textContent);
          const key = `topic_${tid}`;
          if (data[key]) {
            const t = JSON.parse(data[key]);
            if (t && t.user_id != null) { opUserId = String(t.user_id); return opUserId; }
          }
        } catch (e) { /* fall through */ }
      }
    }
    const post1 = document.querySelector('article#post_1[data-user-id]');
    if (post1) opUserId = post1.getAttribute('data-user-id');
    return opUserId;
  }

  function enhanceOpPosts() {
    const opId = getOpUserId();
    if (!opId) return;
    document.querySelectorAll('article[id^="post_"]').forEach((post) => {
      if (post.getAttribute('data-user-id') !== opId) return;
      post.classList.add(OP_POST_CLASS);
    });
  }

  function processPage() {
    addStyles();
    document.querySelectorAll(NAME_SEL).forEach(enhanceBadge);
    weakenPromoRows();
    injectTimes();
    enhancePosters();
    enhanceOpPosts();
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
      img.ld-tle-op {
        box-shadow: 0 0 0 2px #8a9199 !important;
        transition: box-shadow .15s ease;
      }
      img.ld-tle-op.ld-tle-op--1 { box-shadow: 0 0 0 2px #0969da !important; }
      img.ld-tle-op.ld-tle-op--2 { box-shadow: 0 0 0 2px #1a7f37 !important; }
      img.ld-tle-op.ld-tle-op--3 { box-shadow: 0 0 0 2px #d4a72c !important; }
      img.ld-tle-op.ld-tle-op--4 { box-shadow: 0 0 0 2px #8250df !important; }
      img.ld-tle-other {
        opacity: .4 !important;
        filter: grayscale(.6) !important;
        transition: opacity .15s ease, filter .15s ease;
      }
      tr.topic-list-item:hover img.ld-tle-other {
        opacity: .85 !important;
        filter: none !important;
      }
      article.${OP_POST_CLASS} .names .first::after {
        content: '楼主';
        display: inline-flex;
        align-items: center;
        margin: 0 0 0 6px;
        padding: 0 6px;
        border-radius: 3px;
        color: #fff;
        background: #8250df;
        font: 600 11px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        vertical-align: middle;
      }
      article.${OP_POST_CLASS} {
        box-shadow: inset 2px 0 0 #8250df !important;
        padding-left: 6px !important;
      }
      .${TIME_CLASS} {
        display: block;
        margin-top: 3px;
        padding: 1px 6px;
        border: 1px solid #d0d7de;
        border-radius: 5px;
        color: #57606a;
        background: #f6f8fa;
        font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: nowrap;
        text-align: center;
      }
      tr.${PROMO_CLASS} .${TIME_CLASS} { opacity: .7; }
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
        .${TIME_CLASS} { color: #8b949e; background: #21262d; border-color: #30363d; }
        article.${OP_POST_CLASS} .names .first::after { background: #8957e5; }
        img.ld-tle-op { box-shadow: 0 0 0 2px #6e7681 !important; }
        img.ld-tle-op.ld-tle-op--1 { box-shadow: 0 0 0 2px #1f6feb !important; }
        img.ld-tle-op.ld-tle-op--2 { box-shadow: 0 0 0 2px #2ea043 !important; }
        img.ld-tle-op.ld-tle-op--3 { box-shadow: 0 0 0 2px #e3b341 !important; }
        img.ld-tle-op.ld-tle-op--4 { box-shadow: 0 0 0 2px #8957e5 !important; }
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
