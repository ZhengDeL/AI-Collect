/* AI 情报站 —— 纯静态前端，无构建步骤 */
(function () {
  'use strict';

  var state = {
    index: null,
    date: null,
    day: null,
    source: '全部',
    tune: false,
    query: ''
  };

  var el = {
    filters: document.getElementById('filters'),
    search: document.getElementById('search'),
    list: document.getElementById('list'),
    empty: document.getElementById('empty'),
    overview: document.getElementById('overview'),
    dateLabel: document.getElementById('current-date'),
    summary: document.getElementById('summary'),
    prev: document.getElementById('prev-day'),
    next: document.getElementById('next-day'),
    theme: document.getElementById('theme-toggle')
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    var p = String(d).split('-');
    return p.length === 3 ? (p[0] + ' 年 ' + Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : d;
  }

  function verdictClass(v) {
    if (!v) return 'maybe';
    if (/^(是|值得|有用|有)/.test(v)) return 'yes';
    if (/^(否|不值得|没用|不)/.test(v)) return 'no';
    return 'maybe';
  }

  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    el.theme.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('theme', cur);
    });
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  function sourcesOf(items) {
    var m = {};
    items.forEach(function (it) {
      var k = it.source || '其他';
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  // 「调优」是 tag 维度，与 source 正交：字面口径，含该 tag 即计入（含 source=创新）
  function hasTune(it) {
    return (it.tags || []).indexOf('业界调优') !== -1;
  }

  function renderFilters() {
    var items = (state.day && state.day.items) || [];
    var counts = sourcesOf(items);
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });

    var html = '<button class="chip' + (state.source === '全部' ? ' active' : '') +
      '" data-src="全部" role="tab">全部<span class="count">' + items.length + '</span></button>';

    names.forEach(function (n) {
      html += '<button class="chip' + (state.source === n ? ' active' : '') +
        '" data-src="' + esc(n) + '" role="tab">' + esc(n) +
        '<span class="count">' + counts[n] + '</span></button>';
    });

    // tag 维度的「调优」chip：与 source chip 同套样式同一行，数字为含该 tag 的条数
    var tuneCount = items.filter(hasTune).length;
    html += '<button class="chip' + (state.tune ? ' active' : '') +
      '" data-tune="1" role="tab">调优<span class="count">' + tuneCount + '</span></button>';

    el.filters.innerHTML = html;
    el.filters.querySelectorAll('.chip[data-src]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.source = b.getAttribute('data-src');
        state.tune = false; // 点任一 source chip 清掉调优筛选，避免两个维度叠加
        renderFilters();
        renderList();
      });
    });
    var tuneBtn = el.filters.querySelector('.chip[data-tune]');
    if (tuneBtn) {
      tuneBtn.addEventListener('click', function () {
        state.tune = !state.tune;
        if (state.tune) state.source = '全部'; // 调优只与「全部」共存，不与具体来源叠加
        renderFilters();
        renderList();
      });
    }
  }

  // 可信度按文本分级上色：高/官方→绿，低/传闻/未证实/未查到→红，其余→蓝
  function credClass(c) {
    var s = String(c || '');
    if (/低|传闻|未证实|未查到/.test(s)) return 'low';
    if (/高|官方/.test(s)) return 'high';
    return 'mid';
  }

  // 今日概览：基于当日全部条目（不随筛选/搜索重算），让人一进来就知道今天有什么
  function renderOverview(items) {
    if (!items || !items.length) { el.overview.hidden = true; el.overview.innerHTML = ''; return; }
    el.overview.hidden = false;
    var counts = sourcesOf(items);
    var order = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var stats = order.map(function (n) {
      return '<span class="ov-stat" data-src="' + esc(n) + '"><span class="dot"></span>' +
        '<em>' + esc(n) + '</em> <b>' + counts[n] + '</b> 条</span>';
    }).join('');
    var picks = items.filter(function (it) { return verdictClass(it.verdict) === 'yes'; }).slice(0, 2);
    var picksHtml = picks.length ? picks.map(function (it, i) {
      return '<div class="ov-pick"><span class="rank">' + (i + 1) + '</span>' +
        '<span class="badge ' + esc(it.source || '其他') + '">' + esc(it.source || '其他') + '</span>' +
        '<a href="' + esc(it.url || '#') + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></div>';
    }).join('') : '<div class="ov-pick"><span class="rank">—</span>本期暂无「值得」条目</div>';

    el.overview.innerHTML =
      '<p class="ov-eyebrow">今日概览 · DAILY BRIEF</p>' +
      '<div class="ov-top">' +
        '<h2 class="ov-date">' + esc(fmtDate(state.date)) + '</h2>' +
        '<div class="ov-total"><b>' + items.length + '</b><span>条情报 · 已分类整理</span></div>' +
      '</div>' +
      '<div class="ov-stats">' + stats + '</div>' +
      '<div class="ov-picks"><h3>今日最值得看</h3>' + picksHtml + '</div>';
  }

  // 单张卡片：首条要点常显，其余收进 <details>；verdict/可信度做成有色徽标；链接收成「原文 ↗」
  function cardHTML(it, i) {
    var src = it.source || '其他';
    var pts = it.points || [];
    var lead = pts.length ? '<div class="point-lead"><span class="pdot">①</span><span>' + esc(pts[0]) + '</span></div>' : '';
    var more = pts.length > 1
      ? '<details class="points-more"><summary>展开其余 ' + (pts.length - 1) + ' 条要点</summary>' +
          '<ul class="points">' + pts.slice(1).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') +
        '</ul></details>'
      : '';
    var tags = (it.tags || []).map(function (t) {
      return '<span class="tag' + (t === '业界调优' ? ' tag-tune' : '') + '">' + esc(t) + '</span>';
    }).join('');
    var time = it.time ? '<span>🕒 ' + esc(it.time) + '</span>' : '';
    var verdict = it.verdict
      ? '<span class="vbadge vbadge-' + verdictClass(it.verdict) + '">' + esc(it.verdict) + '</span>' : '';
    var cred = it.credibility
      ? '<span class="cbadge cbadge-' + credClass(it.credibility) + '">可信度 ' + esc(it.credibility) + '</span>' : '';
    var origin = '<a class="origin" href="' + esc(it.url || '#') + '" target="_blank" rel="noopener">原文 ↗</a>';

    return '<article class="card" data-id="' + esc(it.id || '') + '" style="--i:' + i + '">' +
      '<div class="card-top">' +
        '<span class="badge ' + esc(src) + '">' + esc(src) + '</span>' +
        time + origin +
      '</div>' +
      '<h2><a href="' + esc(it.url || '#') + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></h2>' +
      (lead || more ? '<div class="points-box">' + lead + more + '</div>' : '') +
      '<div class="card-foot">' + verdict + cred +
        (tags ? '<span class="tags">' + tags + '</span>' : '') +
      '</div>' +
    '</article>';
  }

  function renderList() {
    var items = (state.day && state.day.items) || [];
    var q = state.query.trim().toLowerCase();

    var shown = items.filter(function (it) {
      if (state.tune) {
        if (!hasTune(it)) return false;
      } else if (state.source !== '全部' && (it.source || '其他') !== state.source) {
        return false;
      }
      if (!q) return true;
      var hay = [it.title, (it.points || []).join(' '), (it.tags || []).join(' '), it.verdict || '']
        .join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    el.summary.textContent = '共 ' + items.length + ' 条' +
      (shown.length !== items.length ? '，显示 ' + shown.length + ' 条' : '');

    if (!shown.length) {
      el.list.innerHTML = '';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = items.length ? '没有匹配的内容。' : '这一天还没有内容。';
      return;
    }
    el.empty.hidden = true;

    // 按来源分组：组顺序固定为「当日全部条目的来源计数降序」（与 chip 一致），
    // 组内按时间新→旧，只渲染命中的条目，空组跳过。排序作用于 filter 出的新数组，不改 state.day.items。
    var counts = sourcesOf(items);
    var order = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var html = order.map(function (src) {
      var gi = shown.filter(function (it) { return (it.source || '其他') === src; });
      if (!gi.length) return '';
      gi.sort(function (a, b) { return String(b.time || '').localeCompare(String(a.time || '')); });
      return '<section class="group">' +
        '<div class="group-head">' +
          '<span class="badge ' + esc(src) + '">' + esc(src) + '</span>' +
          '<span class="group-count">' + gi.length + ' 条</span>' +
          '<span class="group-line"></span>' +
        '</div>' +
        '<div class="group-cards">' + gi.map(cardHTML).join('') + '</div>' +
      '</section>';
    }).join('');
    el.list.innerHTML = html;
  }

  function renderDay() {
    el.dateLabel.textContent = fmtDate(state.date);
    var idx = state.index.dates.findIndex(function (d) { return d.date === state.date; });
    el.prev.disabled = idx >= state.index.dates.length - 1;
    el.next.disabled = idx <= 0;
    renderOverview((state.day && state.day.items) || []);
    renderFilters();
    renderList();
  }

  function goto(date) {
    if (date === state.date) return;
    state.date = date;
    el.list.innerHTML = '<p class="empty">加载中…</p>';
    loadJSON('data/' + date + '.json').then(function (day) {
      state.day = day;
      // chip 由当日数据动态生成：若上一天选中的来源在这一天不存在，沿用会让列表
      // 为空且没有任何 chip 高亮，用户无法判断为何空白。此时回退到「全部」；来源仍在则保持筛选。
      if (state.source !== '全部' && !sourcesOf(day.items || [])[state.source]) {
        state.source = '全部';
      }
      renderDay();
      history.replaceState(null, '', '#' + date);
    }).catch(function (e) {
      el.list.innerHTML = '';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = '加载失败：' + e.message;
    });
  }

  function boot() {
    initTheme();

    el.search.addEventListener('input', function () {
      state.query = el.search.value;
      renderList();
    });

    el.prev.addEventListener('click', function () {
      var i = state.index.dates.findIndex(function (d) { return d.date === state.date; });
      if (i < state.index.dates.length - 1) goto(state.index.dates[i + 1].date);
    });
    el.next.addEventListener('click', function () {
      var i = state.index.dates.findIndex(function (d) { return d.date === state.date; });
      if (i > 0) goto(state.index.dates[i - 1].date);
    });

    loadJSON('data/index.json').then(function (index) {
      if (!index || !index.dates || !index.dates.length) throw new Error('还没有任何一期内容');
      state.index = index;
      var hash = location.hash.replace('#', '');
      var start = index.dates.some(function (d) { return d.date === hash; }) ? hash : index.dates[0].date;
      goto(start);
    }).catch(function (e) {
      el.dateLabel.textContent = '暂无内容';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = e.message;
    });
  }

  boot();
})();
