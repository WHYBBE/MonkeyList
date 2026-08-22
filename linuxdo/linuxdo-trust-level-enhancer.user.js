// ==UserScript==
// @name         LinuxDo Trust Level Enhancer
// @namespace    https://linux.do/
// @version      0.15.0
// @description  Strengthen trust level display on linux.do topic lists by turning the LvN portion of category badges into prominent colored chips, accenting rows by trust level, de-emphasizing promotional topics, surfacing the post creation date inside the activity column, highlighting the original poster's avatar, emphasizing the original poster (楼主) on topic pages, marking topics with no replies, and dimming topics older than a week. Customizable user-mark categories override all other row/post effects and can be imported, exported, merged, and deduplicated from a manage panel.
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
  const LOTTERY_CLASS = 'ld-tle-lottery';
  const LONELY_CLASS = 'ld-tle-lonely';
  const STALE_CLASS = 'ld-tle-stale';
  const WELFARE_BADGE_CLASS = 'ld-tle-welfare';
  const TIME_CLASS = 'ld-tle-time';
  const TIME_DONE = 'data-ld-tle-timedone';
  const POSTERS_DONE = 'data-ld-tle-postersdone';
  const OP_POST_CLASS = 'ld-tle-op-post';
  const JUMP_CLASS = 'ld-tle-jump';
  const MARK_KEY = 'ld-tle-marks';
  const CATS_KEY = 'ld-tle-mark-cats';
  const TAGS_KEY = 'ld-tle-mark-tags';
  const MARK_STYLE_ID = 'ld-tle-mark-dyn';
  const MARK_CLASS = 'ld-tle-mark';
  const MARK_BADGE = 'ld-tle-mark-badge';
  const MARK_ADD = 'ld-tle-mark-add';
  const MARK_ROW = 'ld-tle-mark-row';
  const DEFAULT_CATS = [
    { id: 'block', label: '屏蔽', color: '#6e7681', effect: 'dim', hint: '弱化显示' },
    { id: 'caution', label: '注意', color: '#d4a72c', effect: 'tint', hint: '黄色警示' },
    { id: 'watch', label: '关注', color: '#0969da', effect: 'tint', hint: '蓝色高亮' },
    { id: 'friend', label: '友好', color: '#1a7f37', effect: 'tint', hint: '绿色高亮' },
    { id: 'vip', label: '重要', color: '#d4a72c', effect: 'tint', hint: '金色强调' },
  ];
  const NAME_SEL = '.badge-category__name';
  const PROMO_TAGS = ['高级推广'];
  const LOTTERY_TAGS = ['抽奖'];

  let opUserId = null;
  let cachedTopicId = null;
  let cats = loadCats();
  let tags = loadTags();
  let marks = loadMarks();
  let pickerEl = null;
  let panelEl = null;

  function normalizeCat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = String(raw.label || raw.name || '').trim();
    const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.color || '') ? raw.color : '#0969da';
    const effect = ['normal', 'tint', 'dim'].includes(raw.effect) ? raw.effect : 'tint';
    const hint = String(raw.hint || '').trim();
    if (!id || !label) return null;
    return { id, label, color, effect, hint };
  }

  function loadCats() {
    try {
      const raw = JSON.parse(localStorage.getItem(CATS_KEY) || 'null');
      const list = Array.isArray(raw) ? raw.map(normalizeCat).filter(Boolean) : [];
      return list.length ? list : DEFAULT_CATS.map((c) => ({ ...c }));
    } catch (e) {
      return DEFAULT_CATS.map((c) => ({ ...c }));
    }
  }

  function saveCats() {
    localStorage.setItem(CATS_KEY, JSON.stringify(cats));
  }

  function getCat(id) {
    return cats.find((c) => c.id === id) || null;
  }

  function normalizeTag(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = String(raw.label || raw.name || '').trim();
    const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.color || '') ? raw.color : '#8250df';
    if (!id || !label) return null;
    return { id, label, color };
  }

  function loadTags() {
    try {
      const raw = JSON.parse(localStorage.getItem(TAGS_KEY) || 'null');
      return Array.isArray(raw) ? raw.map(normalizeTag).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTags() {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  }

  function getTag(id) {
    return tags.find((t) => t.id === id) || null;
  }

  function normalizeTagIds(list) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach((id) => {
      const t = getTag(id);
      if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t.id); }
    });
    return out;
  }

  function loadMarks() {
    try {
      const raw = JSON.parse(localStorage.getItem(MARK_KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const out = {};
      for (const [k, v] of Object.entries(raw)) {
        const user = String(k).trim().toLowerCase();
        const level = typeof v === 'string' ? v : v && v.level;
        if (user && level) {
          out[user] = {
            level,
            note: (v && v.note) || '',
            tags: Array.isArray(v && v.tags) ? v.tags.map(String) : [],
            at: (v && v.at) || Date.now(),
          };
        }
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function saveMarks() {
    localStorage.setItem(MARK_KEY, JSON.stringify(marks));
  }

  function getMark(username) {
    if (!username) return null;
    return marks[String(username).trim().toLowerCase()] || null;
  }

  function setMark(username, level, note, opts) {
    const user = String(username || '').trim().toLowerCase();
    if (!user) return;
    if (!level) {
      delete marks[user];
    } else if (getCat(level)) {
      const prev = marks[user] || {};
      marks[user] = {
        level,
        note: note != null ? String(note) : (prev.note || ''),
        tags: opts && opts.tags != null ? normalizeTagIds(opts.tags) : (prev.tags || []),
        at: Date.now(),
      };
    }
    saveMarks();
    applyMarks();
    if (!opts || !opts.keepPanel) {
      if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
    }
  }

  function usernameFromEl(el) {
    if (!el) return '';
    const raw = el.getAttribute('data-user-card')
      || el.getAttribute('data-username')
      || ((el.getAttribute('href') || '').match(/\/u\/([^/?#]+)/) || [])[1]
      || '';
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function cardUsername(card) {
    const dataName = card.getAttribute('data-username');
    if (dataName) return dataName.trim();
    const link = card.querySelector('.names a[href*="/u/"], [data-user-card], [data-username], a[href*="/u/"]');
    if (link) {
      const name = usernameFromEl(link);
      if (name) return name;
    }
    const secondary = card.querySelector('.names__secondary.username, .username');
    return secondary ? secondary.textContent.trim() : '';
  }

  function markClassList(el) {
    [...el.classList].filter((c) => c.startsWith(MARK_CLASS + '--')).forEach((c) => el.classList.remove(c));
  }

  function applyMarks() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      markClassList(row);
      const posters = row.querySelector('td.posters');
      const opLink = posters && (
        [...posters.querySelectorAll('a[data-user-card]')].find((a) => {
          const img = a.querySelector('img.avatar');
          return img && /原始发帖人/.test(img.getAttribute('title') || '');
        }) || posters.querySelector('a[data-user-card]')
      );
      const user = opLink && opLink.getAttribute('data-user-card');
      const mark = getMark(user);
      if (mark && getCat(mark.level)) row.classList.add(`${MARK_CLASS}--${mark.level}`);
      const title = row.querySelector('.link-top-line, td.main-link');
      paintBadges(title, mark, null);
    });

    document.querySelectorAll('article[id^="post_"]').forEach((post) => {
      markClassList(post);
      post.querySelectorAll('.' + MARK_ADD + ', .' + MARK_ROW).forEach((el) => el.remove());
      const names = post.querySelector('.names .first, .names');
      const userEl = post.querySelector('.names [data-user-card], .names a[href^="/u/"]');
      const user = userEl && usernameFromEl(userEl);
      paintBadges(names, getMark(user), null);
    });

    document.querySelectorAll('#user-card, .user-card, .d-user-card').forEach((card) => {
      const name = cardUsername(card);
      decorateUserCard(card, name, getMark(name));
    });
  }

  function decorateUserCard(card, username, mark) {
    if (!username) return;
    const anchor = card.querySelector('.card-row.first-row .names, .names, h2.username, .full-name, .user-card-metadata');
    let row = card.querySelector('.' + MARK_ROW);
    if (!row) {
      row = document.createElement('div');
      row.className = MARK_ROW;
      if (anchor) anchor.insertAdjacentElement('afterend', row);
      else {
        const content = card.querySelector('.card-content, .d-user-card__container') || card;
        content.append(row);
      }
    }
    paintBadges(row, mark, null);
    attachCardMarkButton(card, username);
  }

  function attachCardMarkButton(card, username) {
    const controls = card.querySelector('.usercard-controls');
    if (!controls || !username || controls.querySelector('.' + MARK_ADD)) return;
    const item = document.createElement('li');
    item.className = 'ld-tle-mark-control';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-icon-text btn-default ' + MARK_ADD;
    button.title = '标记用户';
    button.textContent = '标记';
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPicker(username, button);
    });
    item.append(button);
    controls.append(item);
  }

  function paintBadges(host, mark, username) {
    if (!host) return;
    const cat = mark && getCat(mark.level);
    const tagIds = mark ? normalizeTagIds(mark.tags) : [];
    const wanted = [];
    if (cat) wanted.push({ kind: 'cat', id: cat.id, label: cat.label, title: (mark && mark.note) || cat.hint || cat.label });
    tagIds.forEach((id) => {
      const t = getTag(id);
      if (t) wanted.push({ kind: 'tag', id: t.id, label: t.label, title: t.label });
    });
    [...host.children].forEach((el) => {
      if (el.classList.contains(MARK_BADGE) || el.classList.contains(MARK_ADD)) return;
    });
    const existing = [...host.querySelectorAll(':scope > .' + MARK_BADGE)];
    existing.forEach((el, i) => { if (i >= wanted.length) el.remove(); });
    wanted.forEach((item, i) => {
      let badge = host.querySelectorAll(':scope > .' + MARK_BADGE)[i];
      if (!badge) {
        badge = document.createElement('span');
        const btn = host.querySelector(':scope > .' + MARK_ADD);
        if (btn) host.insertBefore(badge, btn);
        else host.append(badge);
      }
      const cls = `${MARK_BADGE} ${MARK_BADGE}--${item.kind}-${item.id}`;
      if (badge.className !== cls) badge.className = cls;
      if (badge.textContent !== item.label) badge.textContent = item.label;
      if (badge.title !== item.title) badge.title = item.title;
    });
    if (username) attachMarkButton(host, username);
    else host.querySelectorAll(':scope > .' + MARK_ADD).forEach((el) => el.remove());
  }

  function closePicker() {
    if (pickerEl) pickerEl.remove();
    pickerEl = null;
  }

  function openPicker(username, anchor) {
    closePicker();
    const current = getMark(username);
    pickerEl = document.createElement('div');
    pickerEl.className = 'ld-tle-picker';
    const head = document.createElement('div');
    head.className = 'ld-tle-picker__head';
    head.textContent = '标记 @' + username;
    const levels = document.createElement('div');
    levels.className = 'ld-tle-picker__levels';
    const note = document.createElement('textarea');
    note.className = 'ld-tle-picker__note';
    note.rows = 2;
    note.placeholder = '备注（可选）';
    note.value = (current && current.note) || '';
    const actions = document.createElement('div');
    actions.className = 'ld-tle-picker__actions';
    actions.innerHTML = `
      <button type="button" data-act="save">保存</button>
      <button type="button" data-act="clear"${current ? '' : ' disabled'}>清除</button>
    `;
    const tagBox = document.createElement('div');
    tagBox.className = 'ld-tle-picker__tags';
    pickerEl.append(head, levels, tagBox, note, actions);
    cats.forEach((meta) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.level = meta.id;
      b.className = `ld-tle-picker__lv ld-tle-picker__lv--${meta.id}${current && current.level === meta.id ? ' is-on' : ''}`;
      b.textContent = meta.label;
      b.title = meta.hint || meta.label;
      b.addEventListener('click', () => {
        levels.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
      });
      levels.append(b);
    });
    const currentTags = new Set(current ? normalizeTagIds(current.tags) : []);
    if (tags.length) {
      const lab = document.createElement('div');
      lab.className = 'ld-tle-picker__sub';
      lab.textContent = '子标签';
      tagBox.append(lab);
    }
    tags.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tag = t.id;
      b.className = `ld-tle-picker__tag ld-tle-picker__tag--tag-${t.id}${currentTags.has(t.id) ? ' is-on' : ''}`;
      b.textContent = t.label;
      b.addEventListener('click', () => b.classList.toggle('is-on'));
      tagBox.append(b);
    });
    pickerEl.querySelector('[data-act="save"]').addEventListener('click', () => {
      const on = pickerEl.querySelector('.ld-tle-picker__lv.is-on');
      const selected = [...pickerEl.querySelectorAll('.ld-tle-picker__tag.is-on')].map((x) => x.dataset.tag);
      setMark(username, on ? on.dataset.level : null, note.value.trim(), { tags: selected });
      closePicker();
    });
    pickerEl.querySelector('[data-act="clear"]').addEventListener('click', () => {
      setMark(username, null);
      closePicker();
    });
    document.body.append(pickerEl);
    const r = anchor.getBoundingClientRect();
    const top = Math.min(r.bottom + 6, window.innerHeight - pickerEl.offsetHeight - 8);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - pickerEl.offsetWidth - 8);
    pickerEl.style.top = `${top + window.scrollY}px`;
    pickerEl.style.left = `${left + window.scrollX}px`;
  }

  function exportMarks() {
    return JSON.stringify({
      version: 3,
      exportedAt: new Date().toISOString(),
      cats,
      tags,
      marks,
    }, null, 2);
  }

  function parseImport(text) {
    const data = JSON.parse(text);
    let entries = [];
    if (Array.isArray(data)) {
      entries = data;
    } else if (data && typeof data === 'object') {
      const src = data.marks && typeof data.marks === 'object' ? data.marks : data;
      if (Array.isArray(src)) entries = src;
      else entries = Object.entries(src).map(([username, v]) => ({ username, ...(typeof v === 'object' ? v : { level: v }) }));
    }
    const parsed = [];
    for (const item of entries) {
      const username = String(item.username || item.user || item.name || '').trim().toLowerCase();
      const level = item.level || item.mark || item.tag;
      if (!username || !level) continue;
      parsed.push({
        username,
        level,
        note: item.note || '',
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        at: item.at || Date.now(),
      });
    }
    const importedCats = Array.isArray(data && data.cats) ? data.cats.map(normalizeCat).filter(Boolean) : [];
    const importedTags = Array.isArray(data && data.tags) ? data.tags.map(normalizeTag).filter(Boolean) : [];
    return { parsed, importedCats, importedTags };
  }

  function mergeImported(parsed, importedCats, importedTags, mode) {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    importedCats.forEach((cat) => {
      if (!getCat(cat.id)) cats.push(cat);
    });
    importedTags.forEach((tag) => {
      if (!getTag(tag.id)) tags.push(tag);
    });
    for (const item of parsed) {
      if (!getCat(item.level)) {
        cats.push({ id: item.level, label: item.level, color: '#0969da', effect: 'normal', hint: '' });
      }
      (item.tags || []).forEach((id) => {
        if (!getTag(id)) tags.push({ id, label: id, color: '#8250df' });
      });
      const prev = marks[item.username];
      if (!prev) {
        marks[item.username] = { level: item.level, note: item.note, tags: item.tags || [], at: item.at };
        added++;
        continue;
      }
      if (mode === 'skip') { skipped++; continue; }
      if (mode === 'replace') {
        marks[item.username] = { level: item.level, note: item.note, tags: item.tags || [], at: item.at };
        updated++;
        continue;
      }
      const note = item.note && item.note !== prev.note
        ? (prev.note ? `${prev.note} | ${item.note}` : item.note)
        : prev.note;
      const mergedTags = [...new Set([...(prev.tags || []), ...(item.tags || [])])];
      marks[item.username] = { level: item.level, note, tags: mergedTags, at: Math.max(prev.at || 0, item.at || 0) };
      updated++;
    }
    saveCats();
    saveTags();
    saveMarks();
    updateMarkStyles();
    applyMarks();
    return { added, updated, skipped };
  }

  function dedupMarks() {
    const seen = new Map();
    let dropped = 0;
    for (const [user, info] of Object.entries(marks)) {
      const key = user.trim().toLowerCase();
      const prev = seen.get(key);
      if (!prev) { seen.set(key, info); continue; }
      dropped++;
      const newer = (info.at || 0) >= (prev.at || 0) ? info : prev;
      const older = newer === info ? prev : info;
      if (older.note && older.note !== newer.note) {
        newer.note = newer.note ? `${newer.note} | ${older.note}` : older.note;
      }
      newer.tags = [...new Set([...(newer.tags || []), ...(older.tags || [])])];
      seen.set(key, newer);
    }
    marks = Object.fromEntries([...seen.entries()]);
    saveMarks();
    updateMarkStyles();
    applyMarks();
    return dropped;
  }

  function ensureFab() {
    if (document.querySelector('.ld-tle-fab')) return;
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'ld-tle-fab';
    fab.title = '用户标记';
    fab.textContent = '标记';
    fab.addEventListener('click', togglePanel);
    document.body.append(fab);
  }

  function togglePanel() {
    if (panelEl && panelEl.classList.contains('is-open')) {
      panelEl.classList.remove('is-open');
      return;
    }
    ensurePanel();
    panelEl.classList.add('is-open');
    fillCatSelects();
    renderCats();
    renderTags();
    renderPanelList();
  }

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.className = 'ld-tle-panel';
    panelEl.innerHTML = `
      <div class="ld-tle-panel__bar">
        <strong>用户标记</strong>
        <span class="ld-tle-panel__count"></span>
        <button type="button" data-act="close">关闭</button>
      </div>
      <div class="ld-tle-panel__sec">主分类（控制列表高亮）</div>
      <div class="ld-tle-panel__cats"></div>
      <div class="ld-tle-panel__cat-add">
        <input type="text" class="ld-tle-panel__cat-label" placeholder="新分类名">
        <input type="color" class="ld-tle-panel__cat-color" value="#0969da" title="颜色">
        <select class="ld-tle-panel__cat-effect">
          <option value="normal">普通</option>
          <option value="tint">高亮</option>
          <option value="dim">弱化</option>
        </select>
        <button type="button" data-act="add-cat">加分类</button>
      </div>
      <div class="ld-tle-panel__sec">子标签（贴在用户名旁）</div>
      <div class="ld-tle-panel__tags"></div>
      <div class="ld-tle-panel__tag-add">
        <input type="text" class="ld-tle-panel__tag-label" placeholder="新标签名">
        <input type="color" class="ld-tle-panel__tag-color" value="#8250df" title="颜色">
        <button type="button" data-act="add-tag">加标签</button>
      </div>
      <div class="ld-tle-panel__tools">
        <input type="search" class="ld-tle-panel__q" placeholder="搜索用户 / 备注">
        <select class="ld-tle-panel__filter"></select>
      </div>
      <div class="ld-tle-panel__add">
        <input type="text" class="ld-tle-panel__user" placeholder="用户名">
        <select class="ld-tle-panel__lv"></select>
        <button type="button" data-act="add">添加</button>
      </div>
      <div class="ld-tle-panel__list"></div>
      <div class="ld-tle-panel__io">
        <textarea class="ld-tle-panel__json" rows="5" placeholder="在此粘贴 JSON 以导入，或点导出填入"></textarea>
        <div class="ld-tle-panel__btns">
          <button type="button" data-act="export">导出</button>
          <button type="button" data-act="import-merge">导入合并</button>
          <button type="button" data-act="import-skip">导入跳过已有</button>
          <button type="button" data-act="import-replace">导入覆盖</button>
          <button type="button" data-act="dedup">去重</button>
        </div>
        <div class="ld-tle-panel__msg"></div>
      </div>
    `;
    panelEl.querySelector('[data-act="close"]').addEventListener('click', () => panelEl.classList.remove('is-open'));
    panelEl.querySelector('.ld-tle-panel__q').addEventListener('input', renderPanelList);
    panelEl.querySelector('.ld-tle-panel__filter').addEventListener('change', renderPanelList);
    panelEl.querySelector('[data-act="export"]').addEventListener('click', () => {
      const ta = panelEl.querySelector('.ld-tle-panel__json');
      ta.value = exportMarks();
      ta.select();
      try { navigator.clipboard.writeText(ta.value); showPanelMsg('已导出到文本框（并尝试复制）'); }
      catch (e) { showPanelMsg('已导出到文本框'); }
    });
    panelEl.querySelector('[data-act="import-merge"]').addEventListener('click', () => runImport('merge'));
    panelEl.querySelector('[data-act="import-skip"]').addEventListener('click', () => runImport('skip'));
    panelEl.querySelector('[data-act="import-replace"]').addEventListener('click', () => runImport('replace'));
    panelEl.querySelector('[data-act="dedup"]').addEventListener('click', () => {
      const n = dedupMarks();
      renderPanelList();
      showPanelMsg(n ? `合并了 ${n} 条重复` : '没有重复项');
    });
    panelEl.querySelector('[data-act="add"]').addEventListener('click', () => {
      const input = panelEl.querySelector('.ld-tle-panel__user');
      const user = (input.value || '').trim();
      const level = panelEl.querySelector('.ld-tle-panel__lv').value;
      if (!user) { showPanelMsg('请输入用户名'); return; }
      setMark(user, level);
      input.value = '';
      showPanelMsg(`已标记 @${user.trim().toLowerCase()}`);
    });
    panelEl.querySelector('[data-act="add-cat"]').addEventListener('click', () => {
      const label = (panelEl.querySelector('.ld-tle-panel__cat-label').value || '').trim();
      const color = panelEl.querySelector('.ld-tle-panel__cat-color').value;
      const effect = panelEl.querySelector('.ld-tle-panel__cat-effect').value;
      const cat = addCategory(label, color, effect);
      if (!cat) { showPanelMsg('分类名无效或已存在'); return; }
      panelEl.querySelector('.ld-tle-panel__cat-label').value = '';
      showPanelMsg(`已添加分类「${cat.label}」`);
    });
    panelEl.querySelector('[data-act="add-tag"]').addEventListener('click', () => {
      const label = (panelEl.querySelector('.ld-tle-panel__tag-label').value || '').trim();
      const color = panelEl.querySelector('.ld-tle-panel__tag-color').value;
      const tag = addTag(label, color);
      if (!tag) { showPanelMsg('标签名无效或已存在'); return; }
      panelEl.querySelector('.ld-tle-panel__tag-label').value = '';
      showPanelMsg(`已添加标签「${tag.label}」`);
    });
    document.body.append(panelEl);
    fillCatSelects();
    renderCats();
    renderTags();
  }

  function slugify(label) {
    const ascii = String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (ascii) return ascii.slice(0, 24);
    let h = 0;
    for (let i = 0; i < label.length; i++) h = ((h << 5) - h + label.charCodeAt(i)) | 0;
    return 'cat-' + (h >>> 0).toString(36);
  }

  function addCategory(label, color, effect) {
    const name = String(label || '').trim();
    if (!name) return null;
    if (cats.some((c) => c.label === name)) return null;
    let id = slugify(name);
    if (getCat(id)) {
      let n = 2;
      while (getCat(id + '-' + n)) n++;
      id = id + '-' + n;
    }
    const cat = normalizeCat({ id, label: name, color, effect });
    if (!cat) return null;
    cats.push(cat);
    saveCats();
    updateMarkStyles();
    fillCatSelects();
    renderCats();
    applyMarks();
    if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
    return cat;
  }

  function updateCategory(id, patch) {
    const cat = getCat(id);
    if (!cat) return;
    if (patch.label != null) {
      const label = String(patch.label).trim();
      if (label) cat.label = label;
    }
    if (patch.color) cat.color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(patch.color) ? patch.color : cat.color;
    if (patch.effect && ['normal', 'tint', 'dim'].includes(patch.effect)) cat.effect = patch.effect;
    saveCats();
    updateMarkStyles();
    fillCatSelects();
    renderCats();
    applyMarks();
    if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
  }

  function removeCategory(id) {
    if (cats.length <= 1) { showPanelMsg('至少保留一个分类'); return; }
    cats = cats.filter((c) => c.id !== id);
    const fallback = cats[0].id;
    Object.keys(marks).forEach((user) => {
      if (marks[user].level === id) marks[user].level = fallback;
    });
    saveCats();
    saveMarks();
    updateMarkStyles();
    fillCatSelects();
    renderCats();
    applyMarks();
    if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
  }

  function fillCatSelects() {
    if (!panelEl) return;
    const filter = panelEl.querySelector('.ld-tle-panel__filter');
    const addSel = panelEl.querySelector('.ld-tle-panel__lv');
    const keepFilter = filter.value;
    filter.innerHTML = '<option value="">全部分类</option>';
    addSel.innerHTML = '';
    cats.forEach((c) => {
      const a = document.createElement('option');
      a.value = c.id;
      a.textContent = c.label;
      filter.append(a.cloneNode(true));
      addSel.append(a);
    });
    if ([...filter.options].some((o) => o.value === keepFilter)) filter.value = keepFilter;
  }

  function uniqueId(label, exists) {
    let id = slugify(label);
    if (!exists(id)) return id;
    let n = 2;
    while (exists(id + '-' + n)) n++;
    return id + '-' + n;
  }

  function addTag(label, color) {
    const name = String(label || '').trim();
    if (!name) return null;
    if (tags.some((t) => t.label === name)) return null;
    const tag = normalizeTag({ id: uniqueId(name, (id) => !!getTag(id)), label: name, color });
    if (!tag) return null;
    tags.push(tag);
    saveTags();
    updateMarkStyles();
    renderTags();
    applyMarks();
    return tag;
  }

  function updateTag(id, patch) {
    const tag = getTag(id);
    if (!tag) return;
    if (patch.label != null) {
      const label = String(patch.label).trim();
      if (label) tag.label = label;
    }
    if (patch.color) tag.color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(patch.color) ? patch.color : tag.color;
    saveTags();
    updateMarkStyles();
    renderTags();
    applyMarks();
  }

  function removeTag(id) {
    tags = tags.filter((t) => t.id !== id);
    Object.keys(marks).forEach((user) => {
      if (marks[user].tags) marks[user].tags = marks[user].tags.filter((t) => t !== id);
    });
    saveTags();
    saveMarks();
    updateMarkStyles();
    renderTags();
    applyMarks();
    if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
  }

  function renderTags() {
    if (!panelEl) return;
    const box = panelEl.querySelector('.ld-tle-panel__tags');
    if (!box) return;
    box.innerHTML = '';
    if (!tags.length) {
      box.innerHTML = '<div class="ld-tle-panel__empty">暂无子标签</div>';
      return;
    }
    tags.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__cat';
      const color = document.createElement('input');
      color.type = 'color';
      color.value = /^#([0-9a-f]{6})$/i.test(t.color) ? t.color : '#8250df';
      const label = document.createElement('input');
      label.type = 'text';
      label.value = t.label;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '删';
      color.addEventListener('input', () => updateTag(t.id, { color: color.value }));
      label.addEventListener('change', () => updateTag(t.id, { label: label.value }));
      del.addEventListener('click', () => removeTag(t.id));
      row.append(color, label, del);
      box.append(row);
    });
  }

  function renderCats() {
    if (!panelEl) return;
    const box = panelEl.querySelector('.ld-tle-panel__cats');
    box.innerHTML = '';
    cats.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__cat';
      const color = document.createElement('input');
      color.type = 'color';
      color.value = /^#([0-9a-f]{6})$/i.test(c.color) ? c.color : '#0969da';
      const label = document.createElement('input');
      label.type = 'text';
      label.value = c.label;
      const effect = document.createElement('select');
      effect.innerHTML = '<option value="normal">普通</option><option value="tint">高亮</option><option value="dim">弱化</option>';
      effect.value = c.effect;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '删';
      color.addEventListener('input', () => updateCategory(c.id, { color: color.value }));
      label.addEventListener('change', () => updateCategory(c.id, { label: label.value }));
      effect.addEventListener('change', () => updateCategory(c.id, { effect: effect.value }));
      del.addEventListener('click', () => removeCategory(c.id));
      row.append(color, label, effect, del);
      box.append(row);
    });
  }

  function runImport(mode) {
    const ta = panelEl.querySelector('.ld-tle-panel__json');
    try {
      const { parsed, importedCats, importedTags } = parseImport(ta.value);
      if (!parsed.length) { showPanelMsg('没有可导入的标记'); return; }
      const r = mergeImported(parsed, importedCats, importedTags, mode);
      renderPanelList();
      showPanelMsg(`新增 ${r.added}，更新 ${r.updated}，跳过 ${r.skipped}`);
    } catch (e) {
      showPanelMsg('JSON 无法解析');
    }
  }

  function showPanelMsg(text) {
    const el = panelEl.querySelector('.ld-tle-panel__msg');
    el.textContent = text;
  }

  function renderPanelList() {
    if (!panelEl) return;
    const q = (panelEl.querySelector('.ld-tle-panel__q').value || '').trim().toLowerCase();
    const filter = panelEl.querySelector('.ld-tle-panel__filter').value;
    const list = panelEl.querySelector('.ld-tle-panel__list');
    const entries = Object.entries(marks)
      .filter(([user, info]) => {
        if (filter && info.level !== filter) return false;
        if (!q) return true;
        return user.includes(q) || (info.note || '').toLowerCase().includes(q);
      })
      .sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    panelEl.querySelector('.ld-tle-panel__count').textContent = `${entries.length} / ${Object.keys(marks).length}`;
    list.innerHTML = '';
    if (!entries.length) {
      list.innerHTML = '<div class="ld-tle-panel__empty">暂无标记</div>';
      return;
    }
    entries.forEach(([user, info]) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__row';
      row.innerHTML = `
        <a href="/u/${encodeURIComponent(user)}" target="_blank" rel="noopener">@${user}</a>
        <select></select>
        <div class="ld-tle-panel__row-tags"></div>
        <input type="text" placeholder="备注" value="">
        <button type="button" data-act="del">删</button>
      `;
      const sel = row.querySelector('select');
      cats.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === info.level) opt.selected = true;
        sel.append(opt);
      });
      const note = row.querySelector('input');
      note.value = info.note || '';
      const tagBox = row.querySelector('.ld-tle-panel__row-tags');
      tags.forEach((tag) => {
        const tagButton = document.createElement('button');
        tagButton.type = 'button';
        tagButton.className = 'ld-tle-panel__row-tag' + (normalizeTagIds(info.tags).includes(tag.id) ? ' is-on' : '');
        tagButton.textContent = tag.label;
        tagButton.title = '切换子标签';
        tagButton.addEventListener('click', () => {
          tagButton.classList.toggle('is-on');
          const selectedTags = [...tagBox.querySelectorAll('.is-on')].map((el) => el.dataset.tag);
          setMark(user, sel.value, note.value, { tags: selectedTags, keepPanel: true });
        });
        tagButton.dataset.tag = tag.id;
        tagBox.append(tagButton);
      });
      sel.addEventListener('change', () => setMark(user, sel.value, note.value, { tags: [...tagBox.querySelectorAll('.is-on')].map((el) => el.dataset.tag), keepPanel: true }));
      note.addEventListener('change', () => setMark(user, sel.value, note.value, { tags: [...tagBox.querySelectorAll('.is-on')].map((el) => el.dataset.tag), keepPanel: true }));
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        setMark(user, null);
        renderPanelList();
      });
      list.append(row);
    });
  }

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

  function enhanceWelfareBadge() {
    document.querySelectorAll('a.badge-category__wrapper[href*="/c/welfare/"]').forEach((wrapper) => {
      const badge = wrapper.querySelector('.badge-category');
      if (badge && !badge.classList.contains(WELFARE_BADGE_CLASS)) {
        badge.classList.add(WELFARE_BADGE_CLASS);
      }
    });
  }

  function weakenPromoRows() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const tagNames = [...row.querySelectorAll('a.discourse-tag[data-tag-name]')]
        .map((a) => a.getAttribute('data-tag-name'));
      const isPromo = PROMO_TAGS.some((t) => tagNames.includes(t));
      const isLottery = LOTTERY_TAGS.some((t) => tagNames.includes(t));
      row.classList.toggle(PROMO_CLASS, isPromo);
      row.classList.toggle(LOTTERY_CLASS, isLottery && !isPromo);
    });
  }

  function markLonelyTopics() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const postersTd = row.querySelector('td.posters');
      if (!postersTd) return;
      const usernames = [...postersTd.querySelectorAll('a[data-user-card]')]
        .map((a) => a.getAttribute('data-user-card'));
      const unique = [...new Set(usernames)].filter(Boolean);
      if (unique.length === 0) return;
      const isLonely = unique.length === 1;
      if (isLonely) {
        if (!row.classList.contains(LONELY_CLASS)) row.classList.add(LONELY_CLASS);
      } else {
        if (row.classList.contains(LONELY_CLASS)) row.classList.remove(LONELY_CLASS);
      }
    });
  }

  function markStaleTopics() {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const activityTd = row.querySelector('td.activity');
      if (!activityTd) return;
      const created = parseCreatedDate(activityTd.getAttribute('title') || '');
      if (!created) return;
      const m = created.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
      if (!m) return;
      const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0).getTime();
      if (isNaN(ts)) return;
      const isStale = now - ts > WEEK_MS;
      if (isStale) {
        if (!row.classList.contains(STALE_CLASS)) row.classList.add(STALE_CLASS);
      } else {
        if (row.classList.contains(STALE_CLASS)) row.classList.remove(STALE_CLASS);
      }
    });
  }

  function parseCreatedDate(title) {
    if (!title) return null;
    const m = title.match(/创建日期[：:]\s*(.+?)(?:\n|$)/);
    return m ? m[1].trim() : null;
  }

  function formatCreated(raw) {
    const m = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
    if (!m) return { text: raw, tier: 'old' };
    const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0).getTime();
    if (isNaN(ts)) return { text: raw, tier: 'old' };
    const now = Date.now();
    const diff = now - ts;
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    if (diff < DAY) {
      const hours = Math.max(1, Math.floor(diff / (60 * 60 * 1000)));
      return { text: `${hours}小时内`, tier: 'fresh' };
    }
    if (diff < WEEK) {
      const days = Math.floor(diff / DAY);
      return { text: `${days}天内`, tier: 'week' };
    }
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return d.getFullYear() === new Date().getFullYear()
      ? { text: md, tier: 'old' }
      : { text: `${d.getFullYear()}-${md}`, tier: 'old' };
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
      const { text, tier } = formatCreated(created);
      const chip = document.createElement('span');
      chip.className = tier === 'old' ? TIME_CLASS : `${TIME_CLASS} ${TIME_CLASS}--${tier}`;
      chip.textContent = text;
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

  function addReplyJumpLinks() {
    document.querySelectorAll('article[id^="post_"]').forEach((post) => {
      const replyToTab = post.querySelector('.post-infos .reply-to-tab');
      if (!replyToTab || replyToTab.previousElementSibling?.classList.contains(JUMP_CLASS)) return;
      const btn = document.createElement('a');
      btn.className = `${JUMP_CLASS} post-info arrow`;
      btn.href = '#';
      btn.title = '跳到被回复的帖子';
      btn.innerHTML = '<svg class="fa d-icon d-icon-arrow-up svg-icon fa-width-auto svg-string" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#arrow-up"></use></svg> 跳转';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.ldTleJumping === '1') return;
        btn.dataset.ldTleJumping = '1';
        const jump = () => {
          const link = post.querySelector('.post__embedded-posts--top .post-link-arrow a');
          if (link) { link.click(); return true; }
          return false;
        };
        if (jump()) return;
        replyToTab.setAttribute('aria-expanded', 'true');
        replyToTab.click();
        let tries = 0;
        const check = setInterval(() => {
          tries++;
          if (jump()) { clearInterval(check); btn.dataset.ldTleJumping = '0'; }
          else if (tries > 25) { clearInterval(check); btn.dataset.ldTleJumping = '0'; }
        }, 200);
      }, true);
      replyToTab.insertAdjacentElement('beforebegin', btn);
    });
  }

  function processPage() {
    addStyles();
    document.querySelectorAll(NAME_SEL).forEach(enhanceBadge);
    enhanceWelfareBadge();
    weakenPromoRows();
    markLonelyTopics();
    markStaleTopics();
    injectTimes();
    enhancePosters();
    enhanceOpPosts();
    addReplyJumpLinks();
    applyMarks();
    ensureFab();
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
      .${WELFARE_BADGE_CLASS} {
        box-shadow: 0 0 0 2px rgba(228,87,53,.55), 0 2px 6px rgba(228,87,53,.3) !important;
        background: rgba(228,87,53,.14) !important;
        font-weight: 700 !important;
      }
      td.${ROW_CLASS} { --ld-tle-lv: transparent; box-shadow: inset 3px 0 0 0 var(--ld-tle-lv) !important; }
      td.${ROW_CLASS}--0 { --ld-tle-lv: #8a9199; }
      td.${ROW_CLASS}--1 { --ld-tle-lv: #0969da; }
      td.${ROW_CLASS}--2 { --ld-tle-lv: #1a7f37; }
      td.${ROW_CLASS}--3 { --ld-tle-lv: #d4a72c; }
      td.${ROW_CLASS}--4 { --ld-tle-lv: #8250df; }
      tr.topic-list-item td {
        transition: opacity .15s ease, filter .15s ease, background .15s ease;
      }
      tr.${STALE_CLASS} td {
        opacity: .62;
        filter: grayscale(.35);
      }
      tr.${STALE_CLASS}:hover td {
        opacity: .92;
        filter: none;
      }
      tr.${PROMO_CLASS} td {
        opacity: .38;
        filter: grayscale(.7);
        background: rgba(178,186,197,.08);
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
      tr.${LOTTERY_CLASS} td {
        opacity: .5;
        filter: grayscale(.5);
        background: rgba(130,80,223,.06);
      }
      tr.${LOTTERY_CLASS} td:first-child {
        box-shadow: inset 3px 0 0 #8250df !important;
      }
      tr.${LOTTERY_CLASS} .raw-topic-link {
        text-decoration: line-through;
        text-decoration-color: rgba(130,80,223,.5);
        text-decoration-thickness: 1.5px;
      }
      tr.${LOTTERY_CLASS}:hover td {
        opacity: .88;
        filter: none;
        background: transparent;
      }
      tr.${LOTTERY_CLASS}:hover .raw-topic-link { text-decoration: none; }
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
      article.${OP_POST_CLASS} .post__body > .topic-meta-data .names .first::after {
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
      tr.${LONELY_CLASS} td.main-link:not(.${ROW_CLASS}) {
        box-shadow: inset 3px 0 0 0 #bf8700 !important;
      }
      tr.${LONELY_CLASS} .raw-topic-link::after {
        content: '待回复';
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        padding: 0 6px;
        border-radius: 3px;
        color: #fff;
        background: #9a6700;
        font: 600 10px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        vertical-align: middle;
      }
      .${JUMP_CLASS} {
        margin-right: 4px;
        opacity: .7;
        font-size: .85em;
      }
      .${JUMP_CLASS}:hover { opacity: 1; }
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
      .${TIME_CLASS}--fresh {
        color: #fff;
        background: #1a7f37;
        border-color: #1a7f37;
        font-weight: 700;
      }
      .${TIME_CLASS}--week {
        color: #0969da;
        background: #ddf4ff;
        border-color: #54aeff;
        font-weight: 600;
      }
      tr.${PROMO_CLASS} .${TIME_CLASS} { opacity: .7; }
      .${MARK_ROW} {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        width: max-content;
        max-width: 100%;
      }
      .names .${MARK_BADGE} { margin-left: 6px; }
      .${MARK_BADGE} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: max-content;
        max-width: 100%;
        margin: 0 0 0 6px;
        padding: 0 8px;
        height: 20px;
        border-radius: 4px;
        color: #fff;
        font: 600 11px/20px ui-sans-serif, system-ui, sans-serif;
        vertical-align: middle;
        box-sizing: border-box;
      }
      .${MARK_ROW} > .${MARK_BADGE} { margin: 0; }
      .${MARK_ADD} {
        display: inline-flex;
        align-items: center;
        margin: 0;
        padding: 0 8px;
        height: 20px;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        background: transparent;
        color: #57606a;
        font: 600 11px/20px ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        width: max-content;
      }
      .${MARK_ADD}:hover { background: #f6f8fa; }
      .usercard-controls .ld-tle-mark-control .${MARK_ADD} {
        margin: 0;
        min-height: 34px;
      }
      .ld-tle-picker {
        position: absolute;
        z-index: 99999;
        width: 240px;
        padding: 10px;
        border: 1px solid #d0d7de;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        color: #24292f;
        font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-picker__head { font-weight: 700; margin-bottom: 8px; word-break: break-all; }
      .ld-tle-picker__levels, .ld-tle-picker__tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
      .ld-tle-picker__sub { width: 100%; font-size: 11px; color: #57606a; }
      .ld-tle-picker__tag {
        padding: 2px 8px;
        border: 1px dashed #d0d7de;
        border-radius: 999px;
        background: #fff;
        cursor: pointer;
        font: 600 11px/18px ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-picker__tag.is-on { color: #fff; }
      .ld-tle-picker__lv {
        padding: 2px 8px;
        border: 1px solid #d0d7de;
        border-radius: 999px;
        background: #fff;
        cursor: pointer;
        font: 600 11px/18px ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-picker__lv.is-on { color: #fff; }
      .ld-tle-picker__note {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 8px;
        padding: 6px;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        resize: vertical;
      }
      .ld-tle-picker__actions { display: flex; gap: 6px; }
      .ld-tle-picker__actions button {
        flex: 1;
        padding: 4px 0;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        background: #f6f8fa;
        cursor: pointer;
      }
      .ld-tle-fab {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 99990;
        padding: 8px 12px;
        border: 0;
        border-radius: 999px;
        background: #24292f;
        color: #fff;
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,.2);
      }
      .ld-tle-panel {
        display: none;
        position: fixed;
        right: 18px;
        bottom: 58px;
        z-index: 99991;
        width: min(520px, calc(100vw - 24px));
        max-height: min(78vh, 760px);
        overflow: auto;
        padding: 16px;
        border: 1px solid #d8dee4;
        border-radius: 12px;
        background: #fff;
        color: #24292f;
        box-shadow: 0 16px 48px rgba(31,35,40,.2);
        font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-panel.is-open { display: block; }
      .ld-tle-panel__bar { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #eaeef2; }
      .ld-tle-panel__bar strong { font-size: 15px; }
      .ld-tle-panel__count { margin-right: auto; color: #57606a; font-size: 12px; }
      .ld-tle-panel__tools, .ld-tle-panel__btns, .ld-tle-panel__add, .ld-tle-panel__cat-add, .ld-tle-panel__tag-add { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .ld-tle-panel__add .ld-tle-panel__user, .ld-tle-panel__cat-add .ld-tle-panel__cat-label, .ld-tle-panel__tag-add .ld-tle-panel__tag-label { flex: 1; padding: 4px 8px; }
      .ld-tle-panel__sec { padding: 9px 10px 7px; margin: 14px 0 8px; border-bottom: 1px solid #eaeef2; color: #24292f; font-size: 12px; font-weight: 700; }
      .ld-tle-panel__cats, .ld-tle-panel__tags { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
      .ld-tle-panel__cat { display: grid; grid-template-columns: 30px minmax(0, 1fr) 82px 38px; gap: 7px; align-items: center; padding: 5px 0; }
      .ld-tle-panel__tags .ld-tle-panel__cat { grid-template-columns: 32px 1fr auto; }
      .ld-tle-panel__cat input[type="color"] { width: 32px; height: 28px; padding: 0; border: 0; background: transparent; cursor: pointer; }
      .ld-tle-panel__q, .ld-tle-panel__filter, .ld-tle-panel__json, .ld-tle-panel button, .ld-tle-panel select, .ld-tle-panel input {
        font: inherit;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        background: #fff;
        color: inherit;
      }
      .ld-tle-panel__q { flex: 1; padding: 4px 8px; }
      .ld-tle-panel__list { max-height: 270px; overflow: auto; margin: 10px 0 12px; padding: 2px; }
      .ld-tle-panel__row { display: grid; grid-template-columns: minmax(88px, 1fr) 92px minmax(100px, 1.5fr) minmax(90px, 1fr) 38px; gap: 7px; align-items: center; padding: 7px 0; border-bottom: 1px solid #f0f2f4; }
      .ld-tle-panel__row a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ld-tle-panel__row-tags { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
      .ld-tle-panel__row-tag { padding: 2px 6px; border: 1px solid #d0d7de; border-radius: 999px; background: #fff; color: #57606a; font: 11px/16px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
      .ld-tle-panel__row-tag.is-on { border-color: #8250df; background: #f3efff; color: #6639b5; }
      .ld-tle-panel__json { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
      .ld-tle-panel__btns button, .ld-tle-panel__bar button, .ld-tle-panel__row button { padding: 4px 8px; cursor: pointer; }
      .ld-tle-panel__msg { min-height: 1.2em; color: #57606a; font-size: 12px; }
      .ld-tle-panel__empty { color: #8b949e; padding: 12px 0; text-align: center; }
      @media (max-width: 620px) {
        .ld-tle-panel { right: 10px; bottom: 54px; width: calc(100vw - 20px); padding: 12px; }
        .ld-tle-panel__row { grid-template-columns: 1fr 82px 38px; }
        .ld-tle-panel__row-tags, .ld-tle-panel__row input { grid-column: 1 / -1; }
      }
      @media (prefers-color-scheme: dark) {
        .${CHIP_CLASS}--0 { color: #f0f6fc; background: #6e7681; }
        .${CHIP_CLASS}--1 { color: #f0f6fc; background: #1f6feb; }
        .${CHIP_CLASS}--2 { color: #f0f6fc; background: #2ea043; }
        .${CHIP_CLASS}--3 { color: #3d2e00; background: #e3b341; }
        .${CHIP_CLASS}--4 { color: #f0f6fc; background: #8957e5; }
        .${WELFARE_BADGE_CLASS} {
          box-shadow: 0 0 0 2px rgba(228,87,53,.6), 0 2px 6px rgba(0,0,0,.4) !important;
          background: rgba(228,87,53,.18) !important;
        }
        td.${ROW_CLASS}--0 { --ld-tle-lv: #6e7681; }
        td.${ROW_CLASS}--1 { --ld-tle-lv: #1f6feb; }
        td.${ROW_CLASS}--2 { --ld-tle-lv: #2ea043; }
        td.${ROW_CLASS}--3 { --ld-tle-lv: #e3b341; }
        td.${ROW_CLASS}--4 { --ld-tle-lv: #8957e5; }
        .${TIME_CLASS} { color: #8b949e; background: #21262d; border-color: #30363d; }
        .${TIME_CLASS}--fresh { color: #f0f6fc; background: #2ea043; border-color: #2ea043; }
        .${TIME_CLASS}--week { color: #79c0ff; background: #0d2847; border-color: #1f6feb; }
        article.${OP_POST_CLASS} .post__body > .topic-meta-data .names .first::after { background: #8957e5; }
        tr.${LONELY_CLASS} td.main-link:not(.${ROW_CLASS}) {
          box-shadow: inset 3px 0 0 0 #9e6a03 !important;
        }
        tr.${LONELY_CLASS} .raw-topic-link::after { background: #9e6a03; }
        img.ld-tle-op { box-shadow: 0 0 0 2px #6e7681 !important; }
        img.ld-tle-op.ld-tle-op--1 { box-shadow: 0 0 0 2px #1f6feb !important; }
        img.ld-tle-op.ld-tle-op--2 { box-shadow: 0 0 0 2px #2ea043 !important; }
        img.ld-tle-op.ld-tle-op--3 { box-shadow: 0 0 0 2px #e3b341 !important; }
        img.ld-tle-op.ld-tle-op--4 { box-shadow: 0 0 0 2px #8957e5 !important; }
        .${MARK_ADD} { border-color: #30363d; color: #8b949e; }
        .${MARK_ADD}:hover { background: #21262d; }
        .ld-tle-picker, .ld-tle-panel { background: #161b22; border-color: #30363d; color: #c9d1d9; }
        .ld-tle-picker__lv, .ld-tle-picker__note, .ld-tle-picker__actions button,
        .ld-tle-panel__q, .ld-tle-panel__filter, .ld-tle-panel__json, .ld-tle-panel button, .ld-tle-panel select, .ld-tle-panel input {
          background: #0d1117; border-color: #30363d; color: #c9d1d9;
        }
        .ld-tle-fab { background: #c9d1d9; color: #0d1117; }
      }
    `;
    document.head.append(style);
    updateMarkStyles();
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function contrastColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#24292f' : '#fff';
  }

  function updateMarkStyles() {
    let el = document.getElementById(MARK_STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = MARK_STYLE_ID;
      document.head.append(el);
    }
    el.textContent = cats.map((c) => {
      const [r, g, b] = hexToRgb(c.color);
      const fg = contrastColor(c.color);
       const dim = c.effect === 'dim';
       const tint = c.effect === 'tint';
      return `
        tr.${MARK_CLASS}--${c.id} td {
          opacity: ${dim ? '.28' : '1'} !important;
          filter: ${dim ? 'grayscale(1)' : 'none'} !important;
          text-decoration: none !important;
           background: rgba(${r},${g},${b},${dim || tint ? (dim ? '.12' : '.14') : '0'}) !important;
        }
        tr.${MARK_CLASS}--${c.id} td:first-child,
        tr.${MARK_CLASS}--${c.id} td.main-link { box-shadow: inset 3px 0 0 ${c.color} !important; }
        tr.${MARK_CLASS}--${c.id} .raw-topic-link { text-decoration: none !important; }
        tr.${MARK_CLASS}--${c.id}:hover td { opacity: ${dim ? '.75' : '1'} !important; filter: ${dim ? 'grayscale(.4)' : 'none'} !important; }
        .${MARK_BADGE}--cat-${c.id} { color: ${fg}; background: ${c.color}; }
        .ld-tle-picker__lv--${c.id}.is-on { color: ${fg}; background: ${c.color}; border-color: ${c.color}; }
      `;
    }).concat(tags.map((t) => {
      const fg = contrastColor(t.color);
      return `
        .${MARK_BADGE}--tag-${t.id} { color: ${fg}; background: ${t.color}; }
        .ld-tle-picker__tag--${t.id}.is-on { color: ${fg}; background: ${t.color}; border-color: ${t.color}; }
      `;
    })).join('\n');
  }

  addStyles();
  processWithRetries();

  new MutationObserver(scheduleProcessing).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', scheduleProcessing);
  document.addEventListener('click', (e) => {
    if (pickerEl && !pickerEl.contains(e.target) && !e.target.closest('.' + MARK_ADD)) closePicker();
  });
})();
