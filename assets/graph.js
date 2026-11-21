/* 知识关联图谱 demo —— 纯静态 vanilla JS，确定性径向分层，无物理仿真 / 无构建 / 无框架 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var VBW = 1200, VBH = 1100, CX = 600, CY = 550;
  // 径向分层：第一圈 tech，第二圈 system，第三圈 hardware + layer；offset 让各圈错开，避免径向对齐遮挡标签
  var geo = { rx: 470, ry: 470 };
  var RINGS = [
    { types: ['tech'], f: 0.45, offset: 0 },
    { types: ['system'], f: 0.74, offset: 20 },
    { types: ['hardware', 'layer'], f: 1.0, offset: 33 }
  ];
  var TYPE_COLOR = { topic: 'violet', tech: 'green', layer: 'amber', system: 'accent', hardware: 'red' };

  var state = {
    doc: null, type: '全部', query: '',
    tx: CX, ty: CY, k: 1,
    selected: null, positions: {}, nodeEls: {}, edgeEls: []
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // 主题：与 kv.js 同一约定（window.__themeClickBound），同页多脚本不会重复绑定
  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    if (window.__themeClickBound) return;
    window.__themeClickBound = true;
    var t = $('theme-toggle');
    if (!t) return;
    t.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('theme', cur);
    });
  }

  // Pages CDN max-age=600：拼唯一 ?v= 覆盖发布后刷新即见新数据
  function loadJSON(url) {
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return fetch(url + sep + 'v=' + Date.now(), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  // ---------- 视口自适应：viewBox 直接等于舞台像素，文字才不会被缩放成小蚂蚁 ----------
  function fit() {
    var svg = $('gsvg');
    var rect = svg.getBoundingClientRect();
    var w = Math.max(320, Math.round(rect.width || 0));
    var h = Math.max(300, Math.round(rect.height || 0));
    VBW = w; VBH = h; CX = w / 2; CY = h / 2;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    geo.rx = Math.max(90, w / 2 - 86);
    geo.ry = Math.max(76, h / 2 - 58);
    state.tx = CX; state.ty = CY;
  }

  // ---------- 确定性径向布局 ----------
  function layout(doc) {
    var pos = {}, center = doc.center;
    pos[center] = { x: 0, y: 0, ring: 0 };
    RINGS.forEach(function (ring, ri) {
      var ns = doc.nodes.filter(function (n) {
        return ring.types.indexOf(n.type) >= 0 && n.id !== center;
      });
      var step = 360 / ns.length;
      ns.forEach(function (n, i) {
        var ang = (-90 + ring.offset + i * step) * Math.PI / 180;
        pos[n.id] = { x: Math.cos(ang) * geo.rx * ring.f, y: Math.sin(ang) * geo.ry * ring.f, ring: ri + 1 };
      });
    });
    return pos;
  }

  function labelAnchor(p) {
    if (p.ring === 0) return 'middle';
    return p.x < -20 ? 'end' : (p.x > 20 ? 'start' : 'middle');
  }

  function buildGraph(doc) {
    state.positions = layout(doc);
    var nodesG = $('gnodes'), edgesG = $('gedges');
    nodesG.innerHTML = ''; edgesG.innerHTML = '';
    state.nodeEls = {}; state.edgeEls = [];

    // 边先画，在节点下层
    doc.edges.forEach(function (e) {
      var a = state.positions[e.from], b = state.positions[e.to];
      if (!a || !b) return;
      var line = svgEl('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        'class': 'edge edge-' + e.type,
        'data-from': e.from, 'data-to': e.to
      });
      edgesG.appendChild(line);
      state.edgeEls.push({ el: line, edge: e });
    });

    // 节点
    doc.nodes.forEach(function (n) {
      var p = state.positions[n.id];
      if (!p) return;
      var g = svgEl('g', {
        'class': 'node t-' + n.type + (n.id === doc.center ? ' center-node' : ''),
        'data-id': n.id, 'data-type': n.type,
        transform: 'translate(' + p.x + ',' + p.y + ')'
      });
      var r = p.ring === 0 ? 26 : (p.ring === 1 ? 13 : 11);
      g.appendChild(svgEl('circle', { 'class': 'node-circle', r: r, cx: 0, cy: 0 }));
      var t = svgEl('text', {
        'class': 'node-label', x: 0, y: p.ring === 0 ? 44 : r + 16,
        'text-anchor': labelAnchor(p)
      });
      t.textContent = n.label;
      g.appendChild(t);
      g.addEventListener('mouseenter', function () { highlight(n.id); });
      g.addEventListener('mouseleave', function () { clearHighlight(); });
      g.addEventListener('click', function (ev) { ev.stopPropagation(); selectNode(n.id); });
      nodesG.appendChild(g);
      state.nodeEls[n.id] = g;
    });
  }

  // ---------- 悬停：高亮本节点与相邻边/节点，其余淡化 ----------
  function neighbors(id) {
    var ids = {}, edges = [];
    state.doc.edges.forEach(function (e) {
      if (e.from === id) { ids[e.to] = true; edges.push(e); }
      else if (e.to === id) { ids[e.from] = true; edges.push(e); }
    });
    ids[id] = true;
    return { ids: ids, edges: edges };
  }
  function highlight(id) {
    var nb = neighbors(id);
    Object.keys(state.nodeEls).forEach(function (nid) {
      var g = state.nodeEls[nid];
      g.classList.remove('hi', 'dimmed');
      if (nb.ids[nid]) g.classList.add('hi'); else g.classList.add('dimmed');
    });
    state.edgeEls.forEach(function (o) {
      var on = nb.edges.indexOf(o.edge) >= 0;
      o.el.classList.remove('hi', 'dimmed');
      o.el.classList.add(on ? 'hi' : 'dimmed');
    });
  }
  function clearHighlight() {
    Object.keys(state.nodeEls).forEach(function (nid) { state.nodeEls[nid].classList.remove('hi', 'dimmed'); });
    state.edgeEls.forEach(function (o) { o.el.classList.remove('hi', 'dimmed'); });
  }

  // ---------- 筛选：只留该类型节点 + 两端都可见的边（层级筛选即只剩 5 个层级节点） ----------
  function applyVisibility() {
    var type = state.type, visible = {};
    state.doc.nodes.forEach(function (n) { visible[n.id] = (type === '全部' || n.type === type); });
    Object.keys(state.nodeEls).forEach(function (id) {
      state.nodeEls[id].style.display = visible[id] ? '' : 'none';
    });
    state.edgeEls.forEach(function (o) {
      o.el.style.display = (visible[o.edge.from] && visible[o.edge.to]) ? '' : 'none';
    });
    applySearch();
  }

  // ---------- 搜索：按 label / id 高亮命中节点，零结果出空状态 ----------
  function applySearch() {
    var q = state.query.trim().toLowerCase(), hit = 0;
    state.doc.nodes.forEach(function (n) {
      var g = state.nodeEls[n.id];
      if (!g) return;
      g.classList.remove('search-hit');
      if (!q || g.style.display === 'none') return;
      if (n.label.toLowerCase().indexOf(q) >= 0 || n.id.toLowerCase().indexOf(q) >= 0) {
        g.classList.add('search-hit'); hit++;
      }
    });
    $('gempty').hidden = !(q && hit === 0);
  }

  // ---------- 点节点：右侧面板显示标签/类型/desc/全部关系 ----------
  function selectNode(id) {
    var n = state.doc.nodes.filter(function (x) { return x.id === id; })[0];
    if (!n) return;
    if (state.selected && state.nodeEls[state.selected]) state.nodeEls[state.selected].classList.remove('selected');
    state.selected = id;
    state.nodeEls[id].classList.add('selected');
    renderPanel(n);
    $('glayout').classList.add('has-panel');
    $('gpanel').hidden = false;
  }
  function closePanel() {
    if (state.selected && state.nodeEls[state.selected]) state.nodeEls[state.selected].classList.remove('selected');
    state.selected = null;
    $('gpanel').hidden = true;
    $('glayout').classList.remove('has-panel');
  }

  function renderPanel(n) {
    var doc = state.doc;
    var typeName = (doc.node_types || {})[n.type] || n.type;
    var rels = doc.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
    var relHtml = rels.map(function (e) {
      var outgoing = e.from === n.id;
      var otherId = outgoing ? e.to : e.from;
      var other = doc.nodes.filter(function (x) { return x.id === otherId; })[0];
      var rname = (doc.edge_types || {})[e.type] || e.type;
      return '<div class="rel-item">' +
        '<div class="rel-line"><span class="rel-dot l-' + esc(e.type) + '"></span>' +
        '<span class="rel-type">' + esc(rname) + '</span>' +
        '<span class="rel-dir">' + (outgoing ? '→' : '←') + '</span>' +
        '<span class="rel-other">' + esc(other ? other.label : otherId) + '</span></div>' +
        (e.note ? '<p class="rel-note">' + esc(e.note) + '</p>' : '') +
        '</div>';
    }).join('');
    $('gpanel').innerHTML =
      '<div class="gp-head">' +
        '<span class="gp-dot" style="background:var(--' + (TYPE_COLOR[n.type] || 'accent') + ')"></span>' +
        '<span class="gp-type">' + esc(typeName) + '</span>' +
        '<button class="gp-close" id="gp-close" aria-label="关闭">×</button>' +
      '</div>' +
      '<h3>' + esc(n.label) + '</h3>' +
      '<p class="gp-desc">' + esc(n.desc || '') + '</p>' +
      '<p class="gp-reltitle">参与的关系（' + rels.length + '）</p>' +
      (relHtml || '<p class="gp-desc">暂无关系</p>');
    $('gp-close').addEventListener('click', closePanel);
  }

  // ---------- 类型 chips ----------
  function renderFilters(doc) {
    var types = ['全部'].concat(Object.keys(doc.node_types || {}));
    var host = $('gfilters');
    host.innerHTML = types.map(function (t) {
      var label = t === '全部' ? '全部' : (doc.node_types[t] || t);
      var count = t === '全部' ? doc.nodes.length : doc.nodes.filter(function (n) { return n.type === t; }).length;
      return '<button class="chip' + (state.type === t ? ' active' : '') + '" data-type="' + esc(t) + '">' +
        esc(label) + '<span class="count">' + count + '</span></button>';
    }).join('');
    host.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.type = b.getAttribute('data-type');
        renderFilters(doc);
        applyVisibility();
        closePanel();
      });
    });
  }

  // ---------- 图例：节点颜色=类型、边颜色/线型=关系，逐条中文名 ----------
  function renderLegend(doc) {
    var nt = doc.node_types || {}, et = doc.edge_types || {};
    var nodeHtml = Object.keys(nt).map(function (t) {
      return '<div class="leg-item"><span class="leg-dot" style="background:var(--' + (TYPE_COLOR[t] || 'accent') + ')"></span>' +
        '<span><b>' + esc(nt[t]) + '</b><small>节点类型：' + esc(t) + '</small></span></div>';
    }).join('');
    var edgeHtml = Object.keys(et).map(function (t) {
      return '<div class="leg-item"><span class="leg-line l-' + esc(t) + '"></span>' +
        '<span><b>' + esc(et[t]) + '</b><small>关系类型：' + esc(t) + '</small></span></div>';
    }).join('');
    $('glegendbody').innerHTML =
      '<section class="leg-sec"><h4>节点颜色 = 类型</h4>' + nodeHtml + '</section>' +
      '<section class="leg-sec"><h4>边的颜色 / 线型 = 关系</h4>' + edgeHtml + '</section>';
  }

  // ---------- 平移 / 缩放 ----------
  function applyVP() {
    $('vp').setAttribute('transform', 'translate(' + state.tx + ',' + state.ty + ') scale(' + state.k + ')');
  }
  function svgPoint(e) {
    var rect = $('gsvg').getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (VBW / rect.width), y: (e.clientY - rect.top) * (VBH / rect.height) };
  }
  function zoomAt(factor, cx, cy) {
    var k2 = Math.max(0.45, Math.min(3.2, state.k * factor));
    var wx = (cx - state.tx) / state.k, wy = (cy - state.ty) / state.k;
    state.tx = cx - wx * k2; state.ty = cy - wy * k2; state.k = k2;
    applyVP();
  }
  function bindViewport() {
    var svg = $('gsvg');
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = svgPoint(e);
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    }, { passive: false });

    var drag = null, suppress = false;
    function start(e) {
      if (e.target.closest && e.target.closest('.node')) return;
      drag = { sx: e.clientX, sy: e.clientY, tx: state.tx, ty: state.ty, moved: false };
    }
    function move(e) {
      if (!drag) return;
      var rect = svg.getBoundingClientRect();
      var dx = (e.clientX - drag.sx) * (VBW / rect.width);
      var dy = (e.clientY - drag.sy) * (VBH / rect.height);
      if (Math.abs(e.clientX - drag.sx) > 3 || Math.abs(e.clientY - drag.sy) > 3) {
        drag.moved = true; svg.classList.add('dragging');
      }
      state.tx = drag.tx + dx; state.ty = drag.ty + dy; applyVP();
    }
    function end() {
      if (drag && drag.moved) suppress = true;
      drag = null; svg.classList.remove('dragging');
    }
    svg.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    svg.addEventListener('touchstart', function (e) { if (e.touches.length === 1) start(e.touches[0]); }, { passive: true });
    svg.addEventListener('touchmove', function (e) { if (e.touches.length === 1) move(e.touches[0]); }, { passive: true });
    window.addEventListener('touchend', end);
    svg.addEventListener('click', function (e) {
      if (suppress) { suppress = false; return; }
      if (!(e.target.closest && e.target.closest('.node'))) closePanel();
    });

    $('zin').addEventListener('click', function () { zoomAt(1.2, CX, CY); });
    $('zout').addEventListener('click', function () { zoomAt(1 / 1.2, CX, CY); });
    $('zreset').addEventListener('click', function () { state.tx = CX; state.ty = CY; state.k = 1; applyVP(); });
  }

  function boot() {
    initTheme();
    bindViewport();
    var s = $('gsearch');
    s.addEventListener('input', function () { state.query = s.value; applySearch(); });
    s.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = state.query.trim().toLowerCase();
      if (!q || !state.doc) return;
      var hit = state.doc.nodes.filter(function (n) {
        return n.label.toLowerCase().indexOf(q) >= 0 && state.nodeEls[n.id] && state.nodeEls[n.id].style.display !== 'none';
      })[0];
      if (hit) selectNode(hit.id);
    });

    loadJSON('data/graph.json').then(function (doc) {
      if (!doc || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) throw new Error('图谱数据格式错误');
      state.doc = doc;
      $('gtitle').textContent = doc.title || '知识关联图谱';
      $('gsub').textContent = doc.subtitle || '';
      $('gstat-node').textContent = doc.nodes.length;
      $('gstat-edge').textContent = doc.edges.length;
      $('gloading').hidden = true;
      fit();
      buildGraph(doc);
      renderFilters(doc);
      renderLegend(doc);
      applyVisibility();
      applyVP();
      var rt = null;
      function scheduleFit() {
        clearTimeout(rt);
        rt = setTimeout(function () {
          if (!state.doc) return;
          var keep = state.selected;
          fit(); buildGraph(state.doc); applyVisibility(); applyVP();
          if (keep) selectNode(keep);
        }, 160);
      }
      // 面板展开/收起、窗口缩放都会改变舞台宽度：用 ResizeObserver 保证 viewBox 始终等于实际像素
      if (window.ResizeObserver) new ResizeObserver(scheduleFit).observe($('gsvg'));
      else window.addEventListener('resize', scheduleFit);
    }).catch(function (err) {
      $('gloading').innerHTML = '<div><b>图谱数据加载失败</b><p>' + esc(err.message) + '</p>' +
        '<p>请检查 data/graph.json 是否存在后刷新。</p></div>';
    });
  }
  boot();
})();
