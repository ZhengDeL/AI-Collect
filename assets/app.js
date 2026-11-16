/* AI 情报站 —— 纯静态前端，无构建步骤 */
(function () {
  'use strict';

  var state = {
    index: null,
    date: null,
    day: null,
    source: '全部',
    query: ''
  };

  var el = {
    filters: document.getElementById('filters'),
    search: document.getElementById('search'),
    list: document.getElementById('list'),
    empty: document.getElementById('empty'),
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

    el.filters.innerHTML = html;
    el.filters.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.source = b.getAttribute('data-src');
        renderFilters();
        renderList();
      });
    });
  }

  function renderList() {
    var items = (state.day && state.day.items) || [];
    var q = state.query.trim().toLowerCase();

    var shown = items.filter(function (it) {
      if (state.source !== '全部' && (it.source || '其他') !== state.source) return false;
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

    el.list.innerHTML = shown.map(function (it) {
      var src = it.source || '其他';
      var pts = (it.points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
      var tags = (it.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
      var time = it.time ? '<span>🕒 ' + esc(it.time) + '</span>' : '';
      var cred = it.credibility ? '<span class="cred">可信度 ' + esc(it.credibility) + '</span>' : '';

      return '<article class="card">' +
        '<div class="card-top">' +
          '<span class="badge ' + esc(src) + '">' + esc(src) + '</span>' +
          time +
        '</div>' +
        '<h2><a href="' + esc(it.url || '#') + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></h2>' +
        (pts ? '<ul class="points">' + pts + '</ul>' : '') +
        '<div class="card-foot">' +
          (it.verdict ? '<span class="verdict ' + verdictClass(it.verdict) + '">' + esc(it.verdict) + '</span>' : '') +
          cred +
          (tags ? '<span class="tags">' + tags + '</span>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderDay() {
    el.dateLabel.textContent = fmtDate(state.date);
    var idx = state.index.dates.findIndex(function (d) { return d.date === state.date; });
    el.prev.disabled = idx >= state.index.dates.length - 1;
    el.next.disabled = idx <= 0;
    renderFilters();
    renderList();
  }

  function goto(date) {
    if (date === state.date) return;
    state.date = date;
    el.list.innerHTML = '<p class="empty">加载中…</p>';
    loadJSON('data/' + date + '.json').then(function (day) {
      state.day = day;
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
