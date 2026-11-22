/* 推理技术知识图谱 v1 · P0 骨架
   纯静态 vanilla JS：零 CDN / 零构建 / 零框架。
   四视图共用一份数据；确定性布局 + 几何去重叠；viewBox 恒等于舞台像素（v0 教训）。 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- 中文元数据：代号一律配中文名，不许裸奔 ---------- */
  var TYPE_META = {
    engine:    { name: '推理引擎', ico: '⚙', color: 'var(--accent)' },
    tech:      { name: '技术机制', ico: '◆', color: 'var(--green)' },
    impl:      { name: '引擎实现', ico: '⌘', color: 'var(--violet)' },
    system:    { name: '依赖系统', ico: '▣', color: 'var(--amber)' },
    hardware:  { name: '硬件代际', ico: '▤', color: 'var(--red)' },
    community: { name: '社区组织', ico: '♟', color: '#e07ab5' },
    case:      { name: '实战案例', ico: '★', color: '#c08a2e' },
    metric:    { name: '关键指标', ico: '◈', color: '#48c9d6' }
  };
  var EDGE_META = {
    implements:     { name: '引擎实现该技术' },
    runs_on:        { name: '实现在 / 承载于' },
    implemented_by: { name: '技术的具体实现' },
    depends_on:     { name: '依赖' },
    relieves:       { name: '缓解瓶颈' },
    compresses:     { name: '压缩' },
    tradeoff:       { name: '权衡 / 代价' },
    alternative:    { name: '同位置替代' },
    prerequisite:   { name: '前置条件' },
    asc_equivalent: { name: '昇腾对应实现' },
    measured_on:    { name: '实测于' },
    maintained_by:  { name: '维护方' },
    supersedes:     { name: '演进替代' }
  };
  var MATURITY = { research: '研究中', experimental: '实验性', emerging: '新兴', mainstream: '主流', legacy: '逐步淘汰' };
  var EVIDENCE = { A: '官方源码/文档', B: '一手实测', C: '论文自报', D: '社区声称' };
  var STACKNAME = { nvidia: 'NVIDIA', ascend: '昇腾', cross: '跨平台', amd: 'AMD', cpu: 'CPU' };
  // 真数据里域 / 引擎是从数据并集动态生成的（adoptDocMeta），这里只给中文名的兜底表与初始占位
  var DOMAIN_CN = {
    'ascend-native': '昇腾原生', 'attention-kernel': '注意力内核', 'graph-compile': '图编译',
    'kv-cache': 'KV Cache', 'multimodal': '多模态', 'parallel': '并行',
    'prefix-cache': '前缀缓存', 'quantization': '量化', 'scheduling': '调度',
    'serving': '服务化', 'spec-decode': '投机解码', 'structured-output': '结构化输出'
  };
  var DOMAINS = Object.keys(DOMAIN_CN).map(function (k) { return [k, DOMAIN_CN[k]]; });
  var DOMAIN_NAME = {};
  DOMAINS.forEach(function (d) { DOMAIN_NAME[d[0]] = d[1]; });
  // 视图 key 与 data/graph.json 的 views 一致：engine / domain / stack / timeline
  var VIEWS = [
    ['engine', '引擎视图'], ['domain', '技术域视图'], ['stack', '双栈对照'], ['timeline', '演进']
  ];
  var VIEW_NAME = {};
  VIEWS.forEach(function (v) { VIEW_NAME[v[0]] = v[1]; });
  var ENGINES = []; // 载入真数据后由 adoptDocMeta 用 12 个 engine/* 节点重建

  /* ---------- 数据加载：只读真数据 graph.json，失败则报错（由 boot 显示，不白屏） ----------
     真数据 schema 见 data/graph.json：nodes 字段比占位 fixture 多（module/symbols/config/
     defaults/version_seen/tech/engine/hardware_scope/papers/community 等）。这里保留全部字段，
     只补齐常用数组为空，避免面板/筛选到处判空。引擎与域列表从数据并集动态生成。 */
  function adoptDocMeta(doc) {
    var ens = doc.nodes.filter(function (n) { return n.type === 'engine'; })
      .sort(function (a, b) { return a.id.localeCompare(b.id); });
    ENGINES = ens.map(function (n) { return [n.id.replace(/^engine\//, ''), n.name, (n.stack || [])[0] || '']; });
    var dset = {};
    doc.nodes.forEach(function (n) { (n.domains || []).forEach(function (d) { dset[d] = 1; }); });
    DOMAINS = Object.keys(dset).sort().map(function (d) { return [d, DOMAIN_CN[d] || d]; });
    DOMAIN_NAME = {};
    DOMAINS.forEach(function (d) { DOMAIN_NAME[d[0]] = d[1]; });
  }
  var ARRAY_FIELDS = ['alias', 'stack', 'domains', 'engines', 'impls', 'symbols', 'config',
    'gain', 'cost', 'pitfalls', 'urls', 'papers', 'hardware_scope', 'tags', 'changelog'];
  function normalize(d) {
    if (!d || !d.schema_version || !Array.isArray(d.nodes)) return null;
    var nodes = d.nodes.map(function (n) {
      var o = {};
      Object.keys(n).forEach(function (k) { o[k] = n[k]; }); // 保留全部真数据字段
      ARRAY_FIELDS.forEach(function (k) { if (!Array.isArray(o[k])) o[k] = []; });
      o.name = n.name || n.id;
      return o;
    });
    var doc = {
      schema_version: d.schema_version, generated_at: d.generated_at || '',
      title: d.title || '推理技术知识图谱', subtitle: d.subtitle || '',
      counts: d.counts || { nodes: nodes.length, edges: (d.edges || []).length },
      views: d.views || [], nodes: nodes,
      edges: (d.edges || []).map(function (e) { return { from: e.from, to: e.to, type: e.type, note: e.note || '' }; }),
      _fixture: false
    };
    adoptDocMeta(doc);
    return doc;
  }
  function loadData() {
    return fetch('data/graph.json?v=' + Date.now(), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('graph.json → HTTP ' + r.status); return r.json(); })
      .then(function (d) { var v = normalize(d); if (!v) throw new Error('graph.json 结构不符合 v1'); return v; });
  }

  /* ---------- 状态 ---------- */
  var state = {
    doc: null, view: 'engine', query: '',
    filters: { stack: '全部', engine: '全部', domain: '全部', maturity: '全部', evidence: '全部' },
    focusSet: null, selected: null, positions: {}, visible: {},
    w: 1000, h: 620, tx: 0, ty: 0, k: 1, matrixCell: null, suppressHash: false
  };
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function typeMeta(t) { return TYPE_META[t] || { name: t, ico: '•', color: 'var(--ink-3)' }; }
  function nodeMap() { var m = {}; state.doc.nodes.forEach(function (n) { m[n.id] = n; }); return m; }
  function shortName(n) { return n.name.length > 9 ? n.name.slice(0, 9) + '…' : n.name; }

  /* ---------- 视口：viewBox 恒等于舞台像素（v0 教训二） ---------- */
  function fit() {
    var st = $('gstage'), svg = $('gsvg');
    var r = st.getBoundingClientRect();
    state.w = Math.max(320, Math.round(r.width || 1000));
    var baseH = Math.max(300, Math.round(r.height || 620));
    var h = baseH;
    // 窄屏（<700px）：画布改成「纵向长卷」——节点摊开在更高的画布里，页面纵向滚动去看，
    // 而不是把 170 个节点压进 360px 高的舞台（v1 窄屏 domain/timeline 重叠的根因）。
    // 标签仍是屏幕像素级大小，viewBox 与画布像素保持 1:1，不靠缩放蒙混。
    if (state.w < 700 && state.doc && state.doc.nodes.length) {
      var per = Math.max(4, Math.floor((state.w - 92) / 28));
      var rows = Math.ceil(state.doc.nodes.length / per) + 6;
      h = Math.max(baseH, rows * 40 + 70);
      svg.style.height = h + 'px';
    } else if (svg.style.height) {
      svg.style.height = '';
    }
    state.h = h;
    svg.setAttribute('viewBox', '0 0 ' + state.w + ' ' + state.h);
  }
  function radius(n) {
    if (n.type === 'engine') return state.w < 640 ? 12 : 15;
    if (n.type === 'tech') return state.w < 640 ? 8 : 9.5;
    if (n.type === 'case') return state.w < 640 ? 9 : 10.5;
    return state.w < 640 ? 7 : 8.5;
  }

  /* ---------- 四视图布局：共用一份数据，切换只重排 ---------- */
  function nodeStack(n) { return (n.stack || [])[0] || 'cross'; }
  /* impl 没有 domains / engines[]，靠 implements 边挂到 tech，再用 tech 的字段补齐 */
  function nodeEngines(n) {
    if (n.engines && n.engines.length) return n.engines;
    if (n.engine) return [n.engine];
    return [];
  }
  function nodeDomains(n) {
    if (n.domains && n.domains.length) return n.domains;
    if (n.type !== 'impl') return [];
    var nm = nodeMap();
    for (var i = 0; i < state.doc.edges.length; i++) {
      var e = state.doc.edges[i];
      if (e.type === 'implements' && e.from === n.id && nm[e.to]) {
        var d = nm[e.to].domains || [];
        if (d.length) return d;
      }
    }
    return [];
  }
  function layout(view) {
    var w = state.w, h = state.h, out = {}, nodes = state.doc.nodes, nm = nodeMap();
    var padL = (view === 'engine' && state.w >= 640) ? 112 : 74, padR = 18, padT = 34, padB = 22;
    if (view === 'engine') {
      // 12 条泳道 = 12 个 engine/* 节点。impl 按 engine 字段落泳道；tech 按 engines[] 关联
      // （一个 tech 可在多条泳道，这里取第一条避免重复节点；筛选/矩阵仍按完整 engines[]）。
      // 泳道高度按节点数加权：vLLM 87 个、llama.cpp 1 个如果平分高度，前者必然压成一行互相重叠。
      var groups = {};
      ENGINES.forEach(function (en) { groups[en[0]] = []; });
      nodes.forEach(function (n) {
        var key = null;
        if (n.type === 'engine') key = n.id.replace(/^engine\//, '');
        else if (n.type === 'impl' && n.engine) key = n.engine;
        else if (n.engines && n.engines.length) key = n.engines[0];
        if (!groups[key]) key = ENGINES.length ? ENGINES[Math.abs(hash(n.id)) % ENGINES.length][0] : null;
        if (key) groups[key].push(n);
      });
      var availH = h - padT - padB;
      var weights = ENGINES.map(function (en) { return Math.sqrt(Math.max(1, groups[en[0]].length)); });
      var sumW = 0;
      weights.forEach(function (x) { sumW += x; });
      if (!sumW) sumW = 1;
      var y0 = padT, geom = [];
      var narrow = state.w < 640;
      ENGINES.forEach(function (en, li) {
        var lh = Math.max(narrow ? 62 : 34, availH * weights[li] / sumW);
        var g = groups[en[0]];
        g.sort(function (a, b) { return (a.domains[0] || '').localeCompare(b.domains[0] || '') || a.name.localeCompare(b.name); });
        var rowH = narrow ? 26 : 31;
        var rowTop = narrow ? 46 : 26;
        var rows = Math.max(1, Math.floor((lh - rowTop - 4) / rowH));
        var perRow = Math.max(1, Math.ceil(g.length / rows));
        var x0 = narrow ? padL + 8 : padL + 64;
        var innerW = Math.max(60, w - x0 - padR - 6);
        g.forEach(function (n, j) {
          var row = Math.floor(j / perRow), col = j % perRow;
          var x, cy;
          if (n.type === 'engine') { x = narrow ? padL + 34 : padL + 4; cy = y0 + (narrow ? 28 : 18); }
          else {
            var slot = innerW / Math.max(1, perRow - 1);
            x = x0 + col * slot;
            cy = y0 + rowTop + row * rowH;
          }
          out[n.id] = {
            x: Math.min(w - padR, Math.max(padL - 30, x)),
            y: Math.max(padT, Math.min(h - padB, cy)),
            lane: li
          };
        });
        geom.push({ name: en[1], y: y0, h: lh });
        y0 += lh;
      });
      state.laneGeom = geom;
    } else if (view === 'domain') {
      // 12 个域 = tech 节点 domains[] 并集；impl 经 implements 边挂到对应 tech 的域
      var cols = w < 640 ? 2 : 4, rows = Math.ceil(DOMAINS.length / cols);
      var cw = (w - padL - padR) / cols, ch = (h - padT - padB) / rows;
      var buckets = {};
      DOMAINS.forEach(function (d) { buckets[d[0]] = []; });
      nodes.forEach(function (n) {
        var key = (n.domains || [])[0];
        if (!key && n.type === 'impl') {
          // impl 没 domains：找它 implements 的 tech 取域
          for (var i = 0; i < state.doc.edges.length; i++) {
            var e = state.doc.edges[i];
            if (e.type === 'implements' && e.from === n.id && nm[e.to] && (nm[e.to].domains || []).length) { key = nm[e.to].domains[0]; break; }
          }
        }
        if (!key && DOMAINS.length) key = DOMAINS[Math.abs(hash(n.id)) % DOMAINS.length][0];
        if (key) (buckets[key] = buckets[key] || []).push(n);
      });
      DOMAINS.forEach(function (d, di) {
        var cx0 = padL + (di % cols) * cw, cy0 = padT + Math.floor(di / cols) * ch;
        var g = buckets[d[0]] || [];
        if (w < 700) {
          // 窄屏：每个域占整行（满宽），域内用 packBox 铺格子，而不是在几十像素的小格里硬塞
          packBox(g, padL, w - padR, cy0, cy0 + ch - 4, out);
          return;
        }
        var per = Math.max(1, Math.floor((cw - 24) / 46));
        g.forEach(function (n, j) {
          var col = j % per, row = Math.floor(j / per);
          out[n.id] = {
            x: Math.min(w - padR, cx0 + 24 + col * ((cw - 34) / per)),
            y: Math.min(h - padB, cy0 + 24 + row * 40)
          };
        });
      });
    } else if (view === 'stack') {
      // 双栈对照：stack 含 nvidia / 含 ascend 分两列，cross 走中间。asc_equivalent 边跨列连线
      var cols2 = { nvidia: [], ascend: [], cross: [] };
      nodes.forEach(function (n) {
        var s = nodeStack(n);
        if (s === 'ascend') cols2.ascend.push(n);
        else if (s === 'nvidia') cols2.nvidia.push(n);
        else cols2.cross.push(n);
      });
      // 三个列带按节点数动态分配宽度：每列先算需要几个子列（rowsMax = 可用高度/最小间距），
      // 再按子列数比例分宽，保证任何一列塞满时都不会把节点压到画布底边重合。
      var gap = state.w < 640 ? 28 : 34;
      var rowsMax = Math.max(1, Math.floor((h - padT - padB) / gap));
      var order = ['nvidia', 'cross', 'ascend'];
      var need = {}, sumNeed = 0;
      order.forEach(function (k) {
        need[k] = Math.max(1, Math.ceil(cols2[k].length / rowsMax));
        sumNeed += need[k];
      });
      var avail = Math.max(120, w - padL - padR);
      var cur = padL;
      order.forEach(function (k) {
        var cw = avail * need[k] / sumNeed;
        packStacked(cols2[k], cur, cur + cw, padT, h - padB, out, gap);
        cur += cw;
      });
    } else { // timeline：按 maturity 五段（research→experimental→emerging→mainstream→legacy），段内按 updated_at
      var matOrder = ['research', 'experimental', 'emerging', 'mainstream', 'legacy'];
      var cells = {};
      nodes.forEach(function (n) {
        var mi = matOrder.indexOf(n.maturity); if (mi < 0) mi = 2; // 无 maturity 归入 emerging
        var key = 'm' + mi;
        (cells[key] = cells[key] || []).push(n);
      });
      cells && Object.keys(cells).forEach(function (k) {
        cells[k].sort(function (a, b) { return (a.updated_at || '').localeCompare(b.updated_at || ''); });
      });
      if (w < 700) {
        // 窄屏：五个成熟度段改成纵向五条带，每条带内用 packBox 铺格子
        var bandH = (h - padT - padB) / 5;
        Object.keys(cells).forEach(function (key) {
          var mi = +key.slice(1);
          var y0 = padT + mi * bandH;
          packBox(cells[key], padL, w - padR, y0, y0 + bandH - 4, out);
        });
      } else {
        var cw = (w - padL - padR) / 5;
        Object.keys(cells).forEach(function (key) {
          var mi = +key.slice(1);
          var x0 = padL + mi * cw;
          packStacked(cells[key], x0 + 4, x0 + cw - 4, padT, h - padB, out, 40);
        });
      }
    }
    relax(out, nodes);
    return out;
  }
  /* 在一块矩形区域内把一组节点铺成二维网格（列数按可用宽度算），确定性、不抖动 */
  function packBox(list, x0, x1, y0, y1, out) {
    if (!list.length) return;
    var bw = Math.max(30, x1 - x0), bh = Math.max(24, y1 - y0);
    var step = state.w < 640 ? 28 : 36;
    var cols = Math.max(1, Math.floor(bw / step));
    var rows = Math.ceil(list.length / cols);
    var dx = bw / cols, dy = Math.max(step, bh / Math.max(1, rows));
    list.forEach(function (n, i) {
      var c = i % cols, r = Math.floor(i / cols);
      out[n.id] = {
        x: Math.min(state.w - 12, Math.max(12, x0 + dx * (c + 0.5))),
        y: Math.min(state.h - 12, Math.max(padTopSafe(), y0 + dy * (r + 0.5)))
      };
    });
  }
  function padTopSafe() { return 12; }
  /* 高度不够时先沿横向拆子列再纵向排：保证垂直间距 ≥ gap，绝不把节点压进同一格。
     用在 timeline 的成熟度列与其它「一列塞不下就换列」的场景。 */
  function packStacked(list, x0, x1, y0, y1, out, gap) {
    if (!list.length) return;
    var bw = Math.max(40, x1 - x0), bh = Math.max(40, y1 - y0);
    var rowsMax = Math.max(1, Math.floor(bh / gap));
    var subCols = Math.max(1, Math.ceil(list.length / rowsMax));
    var subW = bw / subCols;
    for (var s = 0; s < subCols; s++) {
      var part = list.slice(s * rowsMax, (s + 1) * rowsMax);
      for (var r = 0; r < part.length; r++) {
        var nn = part[r];
        out[nn.id] = { x: x0 + subW * (s + 0.5), y: y0 + Math.min(bh - gap / 2, gap * (r + 0.5)) };
      }
    }
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  /* 确定性去重叠：只推挤相互压住的圆，多轮后夹回画布内。不是物理仿真，无抖动。
     同一泳道内节点常共线（dy≈0），单独靠水平推挤需要很多轮才能沿链传播，
     故对近共线的对子加一个确定性的微小垂直错位，让它们往二维散开，收敛更快。 */
  function relax(pos, nodes) {
    var w = state.w, h = state.h, pad = 5, cell = 44, n = nodes.length;
    // 空间网格把每轮两两检测从 O(n²) 降到近 O(n)（只查 3×3 相邻格）。
    // cell=44 > 最大分离距离 (15+5)*2=40，3×3 邻域必覆盖所有可能相压的对子。
    // 半径/夹边界预计算到数组：原来每轮每对都重算 radius()，是 340 轮里的主要开销。
    // 网格用 Map + 整数 key（原字符串拼接 key 在窄屏 340 轮下明显偏慢）。
    var rounds = Math.min(240, Math.max(140, Math.round(nodes.length * 1.3)));
    var rad = new Array(n), cl = new Array(n), q;
    for (q = 0; q < n; q++) { var rr = radius(nodes[q]); rad[q] = rr + pad; cl[q] = rr + 4; }
    for (var it = 0; it < rounds; it++) {
      var moved = 0, grid = new Map();
      for (var k = 0; k < n; k++) {
        var pk = pos[nodes[k].id]; if (!pk) continue;
        var gk = (Math.floor(pk.x / cell) + 1024) * 4096 + (Math.floor(pk.y / cell) + 1024);
        var arr = grid.get(gk); if (!arr) { arr = []; grid.set(gk, arr); }
        arr.push(k);
      }
      for (var i = 0; i < n; i++) {
        var a = pos[nodes[i].id]; if (!a) continue;
        var ra = rad[i];
        var agx = Math.floor(a.x / cell) + 1024, agy = Math.floor(a.y / cell) + 1024;
        for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
          var bucket = grid.get((agx + ox) * 4096 + (agy + oy)); if (!bucket) continue;
          for (var bi = 0; bi < bucket.length; bi++) {
            var j = bucket[bi]; if (j <= i) continue;
            var b = pos[nodes[j].id]; if (!b) continue;
            var rb = rad[j];
            var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, need = ra + rb;
            if (d2 >= need * need) continue;
            var d = Math.sqrt(d2);
            // 近共线：按 id 哈希给固定上下错位，打破一维死结（确定性、可复现）
            if (Math.abs(dy) < 1.5) {
              dy = ((hash(nodes[i].id) + hash(nodes[j].id)) % 2 ? 1 : -1) * 1.2;
              d = Math.sqrt(dx * dx + dy * dy);
            }
            if (d < 0.001) { dx = 0.7; dy = 0.7; d = 1; }
            var push = (need - d) / 2 / d * 1.2;
            a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
            moved++;
          }
        }
      }
      for (var m = 0; m < n; m++) {
        var p = pos[nodes[m].id]; if (!p) continue;
        var r = cl[m];
        p.x = Math.max(r + 4, Math.min(w - r - 4, p.x));
        p.y = Math.max(r + 4, Math.min(h - r - 12, p.y));
      }
      if (!moved) break;
    }
  }

  /* ---------- 场景渲染：字符串拼接 + 事件委托，350 节点也能秒渲染 ---------- */
  // 泳道名用短名：全名（Text Generation Inference）会把左侧标签区撑到 150px 以上，
  // 压住引擎节点；短名控制在 ~14 字符，配合加宽的引擎视图左留白（112px）。
  var LANE_SHORT = {
    'NVIDIA Dynamo': 'Dynamo',
    'TensorRT-LLM': 'TensorRT-LLM',
    'Triton Inference Server': 'Triton',
    'Text Generation Inference': 'TGI',
    'MindSpore Lite': 'MindSpore'
  };
  // 窄屏（<640）左侧只留 74px，泳道名必须再短一档，否则会压住引擎图标
  var LANE_SHORT_NARROW = {
    'NVIDIA Dynamo': 'Dynamo',
    'TensorRT-LLM': 'TRT-LLM',
    'Triton Inference Server': 'Triton',
    'Text Generation Inference': 'TGI',
    'MindSpore Lite': 'MindSpore',
    'llama.cpp': 'llama',
    'vLLM-Ascend': 'vLLM-Asc'
  };
  function laneDecor() {
    if (state.view !== 'engine') return '';
    var geom = state.laneGeom || [];
    if (!geom.length) return '';
    var s = '', narrow = state.w < 640;
    geom.forEach(function (ln, i) {
      // 类名必须与 graph.css 的 .g-lane-bg / .g-lane-alt 对应：历史上写成了 g-lane-0/1，
      // 于是 rect 没有样式、用默认黑色填充把整块画布压暗。
      s += '<rect class="' + (i % 2 ? 'g-lane-alt' : 'g-lane-bg') + '" x="0" y="' + ln.y.toFixed(1) + '" width="' + state.w + '" height="' + ln.h.toFixed(1) + '"/>';
      s += '<line class="g-lane-rule" x1="0" y1="' + ln.y.toFixed(1) + '" x2="' + state.w + '" y2="' + ln.y.toFixed(1) + '"/>';
      // 泳道名固定在左上角，不再垂直居中（居中被节点压住，且与引擎节点标签重复）
      var nm = (narrow ? LANE_SHORT_NARROW[ln.name] : LANE_SHORT[ln.name]) || ln.name;
      s += '<text class="g-lane-label" x="8" y="' + (ln.y + (narrow ? 14 : 15)).toFixed(1) + '">' + esc(nm) + '</text>';
    });
    return s;
  }
  function dualDecor() {
    if (state.view !== 'stack') return '';
    return '<line class="g-lane-rule" x1="' + (state.w * 0.5).toFixed(1) + '" y1="24" x2="' + (state.w * 0.5).toFixed(1) + '" y2="' + (state.h - 12) + '"/>' +
      '<text class="g-lane-label" x="' + (state.w * 0.26 - 30) + '" y="22">NVIDIA 栈</text>' +
      '<text class="g-lane-label" x="' + (state.w * 0.74 - 26) + '" y="22">昇腾栈</text>';
  }
  function evoDecor() {
    if (state.view !== 'timeline') return '';
    var s = '', padL = 74, padR = 18;
    var mats = [['research', '研究中'], ['experimental', '实验性'], ['emerging', '新兴'], ['mainstream', '主流'], ['legacy', '逐步淘汰']];
    var cw = (state.w - padL - padR) / 5;
    mats.forEach(function (m, i) {
      var x = padL + i * cw;
      s += '<line class="g-lane-rule" x1="' + x.toFixed(1) + '" y1="24" x2="' + x.toFixed(1) + '" y2="' + (state.h - 12) + '"/>';
      s += '<text class="g-axis-label" x="' + (x + 6) + '" y="18">' + esc(m[1]) + '</text>';
    });
    return s;
  }
  function buildScene() {
    var t0 = performance.now();
    var doc = state.doc, nm = nodeMap();
    state.positions = layout(state.view);
    var t1 = performance.now();
    var edgesS = laneDecor() + dualDecor() + evoDecor();
    doc.edges.forEach(function (e) {
      var a = state.positions[e.from], b = state.positions[e.to];
      if (!a || !b) return;
      edgesS += '<line class="edge edge-' + esc(e.type) + '" data-from="' + esc(e.from) + '" data-to="' + esc(e.to) +
        '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>';
    });
    $('gedges').innerHTML = edgesS;

    var nodesS = '', map = {};
    doc.nodes.forEach(function (n) {
      var p = state.positions[n.id]; if (!p) return;
      var tm = typeMeta(n.type), r = radius(n);
      var ico = tm.ico;
      // 引擎视图里泳道名已经写在左上角，engine 节点再挂一个同名标签就是重复；
      // 只保留鼠标悬停/选中时才出现的标签（CSS .node.hov .node-label）。
      var label = (state.view === 'engine' && n.type === 'engine') ? '' : shortName(n);
      var isAsc = nodeStack(n) === 'ascend';
      nodesS += '<g class="node t-' + esc(n.type) + (isAsc ? ' s-ascend' : '') + (state.selected === n.id ? ' selected' : '') + '" data-id="' + esc(n.id) +
        '" transform="translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')">' +
        '<circle class="node-circle" r="' + r + '" cx="0" cy="0"/>' +
        (isAsc ? '<text class="asc-flag" x="0" y="' + (-(r + 5)) + '" text-anchor="middle">昇</text>' : '') +
        '<text class="node-ico" x="0" y="' + (r > 11 ? 4 : 3) + '">' + esc(ico) + '</text>' +
        '<text class="node-label" x="0" y="' + (r + 14) + '" text-anchor="middle">' + esc(label) + '</text></g>';
      map[n.id] = true;
    });
    $('gnodes').innerHTML = nodesS;
    state.visible = map;
    var t2 = performance.now();
    applyVisibility();
    applyVP();
    var t3 = performance.now();
    window.__gScene = { nodes: doc.nodes.length, layout: Math.round(t1 - t0), draw: Math.round(t2 - t1), visLabels: Math.round(t3 - t2) };
    if (!window.__gSceneFirst) window.__gSceneFirst = window.__gScene;
  }
  function applyVP() { $('vp').setAttribute('transform', 'translate(' + state.tx.toFixed(1) + ',' + state.ty.toFixed(1) + ') scale(' + state.k.toFixed(3) + ')'); }

  /* ---------- 筛选 / 搜索 / 邻域 ---------- */
  function passes(n) {
    var f = state.filters, q = state.query.trim().toLowerCase();
    if (f.stack !== '全部' && (n.stack || []).indexOf(f.stack) < 0) return false;
    if (f.engine !== '全部' && nodeEngines(n).indexOf(f.engine) < 0 && ('engine/' + f.engine) !== n.id) return false;
    if (f.domain !== '全部' && nodeDomains(n).indexOf(f.domain) < 0) return false;
    if (f.maturity !== '全部' && n.maturity !== f.maturity) return false;
    if (f.evidence !== '全部' && n.evidence !== f.evidence) return false;
    if (state.focusSet && !state.focusSet[n.id]) return false;
    if (q) {
      var hay = [n.name, n.id].concat(n.alias || [], n.one_line ? [n.one_line] : [],
        (n.module ? [n.module] : []), n.symbols || [], n.config || []).join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }
  function applyVisibility() {
    /* 一次遍历 gnodes.children 取代 per-node querySelector（原来 170 次全树查询 = O(n²)） */
    var nm = nodeMap(), ok = {}, hit = 0, q = state.query.trim().toLowerCase();
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (!g.classList || !g.classList.contains('node')) return;
      var nid = g.getAttribute('data-id'), n = nm[nid];
      if (!n) return;
      var pass = passes(n);
      ok[nid] = pass;
      g.style.display = pass ? '' : 'none';
      g.classList.remove('search-hit');
      if (pass && q) {
        var hay = [n.name, n.id].concat(n.alias || [], n.module ? [n.module] : [], n.symbols || [], n.config || []).join(' ').toLowerCase();
        if (hay.indexOf(q) >= 0) { g.classList.add('search-hit'); hit++; }
      }
    });
    Array.prototype.forEach.call($('gedges').children, function (l) {
      if (l.classList.contains('edge') === false) return;
      l.style.display = (ok[l.getAttribute('data-from')] && ok[l.getAttribute('data-to')]) ? '' : 'none';
    });
    $('gempty').hidden = !(q && hit === 0);
    layoutLabels();
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* ---------- 标签密度控制：可见 label 两两不相交（优先级 selected > 搜索命中 > engine > tech > impl > 其它） ---------- */
  function labelElOf(nid) {
    var g = $('gnodes').querySelector('[data-id="' + cssEsc(nid) + '"]');
    return g ? { g: g, t: g.querySelector('.node-label') } : null;
  }
  function labelBox(nid) {
    var o = labelElOf(nid); if (!o || !o.t) return null;
    var m = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(o.g.getAttribute('transform') || '');
    if (!m) return null;
    var bb = o.t.getBBox();
    var ox = parseFloat(m[1]), oy = parseFloat(m[2]);
    return { x1: bb.x + ox, y1: bb.y + oy, x2: bb.x + bb.width + ox, y2: bb.y + bb.height + oy };
  }
  function labelPriority(n) {
    if (state.selected === n.id) return 0;
    if (state.query.trim()) return 1;
    if (n.type === 'engine') return 2;
    if (n.type === 'tech') return 3;
    if (n.type === 'impl') return 4;
    return 5;
  }
  function layoutLabels() {
    var els = [];
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (!g.classList || !g.classList.contains('node')) return;
      if (g.style.display === 'none') return;
      var t = g.querySelector('.node-label');
      if (t && t.textContent) els.push({ g: g, t: t, id: g.getAttribute('data-id') });
    });
    /* 第一遍纯写：全部恢复可见。不要与下面的 getBBox 交替，否则每次读都触发强制重排 */
    els.forEach(function (it) { it.t.classList.remove('lo'); it.t.style.visibility = ''; });
    /* 第二遍纯读：一次性取全部 bbox，本段不再写 DOM */
    var nm = nodeMap(), list = [];
    els.forEach(function (it) {
      var n = nm[it.id]; if (!n) return;
      var m = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(it.g.getAttribute('transform') || '');
      if (!m) return;
      var bb = it.t.getBBox(), ox = parseFloat(m[1]), oy = parseFloat(m[2]);
      list.push({
        id: it.id, el: it.t, p: labelPriority(n),
        b: { x1: bb.x + ox, y1: bb.y + oy, x2: bb.x + bb.width + ox, y2: bb.y + bb.height + oy }
      });
    });
    list.sort(function (a, b) {
      return a.p - b.p || (a.b.y1 - b.b.y1) || (a.b.x1 - b.b.x1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    var kept = [], pad = 4, MAXLBL = state.w < 640 ? 30 : 55;
    list.forEach(function (it) {
      // 标签上限：超过就一律隐藏，鼠标悬停/选中时 CSS 会强制显示，避免满屏小字
      if (kept.length >= MAXLBL) { it.el.classList.add('lo'); it.el.style.visibility = 'hidden'; return; }
      var hit = false;
      for (var i = 0; i < kept.length; i++) {
        var k = kept[i].b;
        if (!(it.b.x2 + pad < k.x1 || it.b.x1 - pad > k.x2 || it.b.y2 + pad < k.y1 || it.b.y1 - pad > k.y2)) { hit = true; break; }
      }
      if (hit) { it.el.classList.add('lo'); it.el.style.visibility = 'hidden'; }
      else kept.push(it);
    });
    state.labelKept = kept.length;
  }

  function neighbors(id) {
    var ids = { }; ids[id] = true; var edges = [];
    state.doc.edges.forEach(function (e) {
      if (e.from === id) { ids[e.to] = true; edges.push(e); }
      else if (e.to === id) { ids[e.from] = true; edges.push(e); }
    });
    return { ids: ids, edges: edges };
  }
  function highlight(id) {
    var nb = neighbors(id);
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (!g.classList || !g.classList.contains('node')) return;
      g.classList.remove('hi', 'dimmed', 'hov');
      var nid = g.getAttribute('data-id');
      if (nb.ids[nid]) g.classList.add('hi'); else g.classList.add('dimmed');
      if (nid === id) g.classList.add('hov');
    });
    Array.prototype.forEach.call($('gedges').children, function (l) {
      if (!l.classList || !l.classList.contains('edge')) return;
      var on = nb.edges.some(function (e) {
        return e.from === l.getAttribute('data-from') && e.to === l.getAttribute('data-to');
      });
      l.classList.remove('hi', 'dimmed'); l.classList.add(on ? 'hi' : 'dimmed');
    });
  }
  function clearHighlight() {
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (g.classList) g.classList.remove('hi', 'dimmed', 'hov');
    });
    Array.prototype.forEach.call($('gedges').children, function (l) {
      if (l.classList) l.classList.remove('hi', 'dimmed');
    });
  }

  /* ---------- 九分区详情面板 ---------- */
  function val(v) { return (v == null || v === '' || (Array.isArray(v) && !v.length)) ? '<span class="gp-none">未查到</span>' : esc(v); }
  function badges(n) {
    var s = '<span class="gp-badge b-type">' + esc(typeMeta(n.type).name) + '</span>';
    (n.stack || []).forEach(function (x) { s += '<span class="gp-badge">' + esc(STACKNAME[x] || x) + '</span>'; });
    if (n.maturity) s += '<span class="gp-badge">' + esc(MATURITY[n.maturity] || n.maturity) + '</span>';
    if (n.evidence) s += '<span class="gp-badge">证据 ' + esc(n.evidence) + ' · ' + esc(EVIDENCE[n.evidence] || '未查到') + '</span>';
    return s;
  }
  function sec(i, title, body) {
    return '<section class="gp-sec" data-sec="' + i + '"><h4>' + i + '. ' + esc(title) + '</h4>' + body + '</section>';
  }
  function renderPanel(n) {
    var nm = nodeMap(), tm = typeMeta(n.type);
    var html = '';
    // 1 头部
    html += '<div class="gp-top"><span class="gp-ico" style="background:' + tm.color + '">' + esc(tm.ico) + '</span>' +
      '<div class="gp-title-wrap"><h3 class="gp-name">' + esc(n.name) + '</h3><div class="gp-badges">' + badges(n) + '</div>' +
      '<div class="gp-impl-meta">更新：' + val(n.updated_at) + ' · ' + val(n.updated_by) + '</div></div>' +
      '<button class="gp-close" id="gp-close" aria-label="关闭详情">×</button></div>';
    // 2 一句话 + 为什么
    html += sec(2, '一句话 · 为什么需要', '<p class="gp-oneline">' + val(n.one_line) + '</p><p class="gp-why">为什么：' + val(n.why) + '</p>');
    // 3 原理
    html += sec(3, '原理', '<p class="gp-body">' + val(n.principle) + '</p>' +
      (n.formula ? '<pre class="gp-formula">' + esc(n.formula) + '</pre>' : ''));
    // 4 引擎实现
    var impls = (n.impls || []).map(function (iid) { return nm[iid]; }).filter(Boolean);
    if (n.module) impls.unshift(n);
    var engHtml = '';
    if (n.type === 'case') {
      engHtml = nodeEngines(n).map(function (eid) {
        var eo = nm['engine/' + eid];
        return eo ? '<div class="gp-impl"><div class="gp-impl-name"><span class="gp-rel-link" data-goto="engine/' + esc(eid) + '">' + esc(eo.name) + '</span></div><div class="gp-impl-meta">' + val(eo.one_line) + '</div><div class="gp-impl-meta">实现细节点开该引擎节点的第 4 分区</div></div>' : '';
      }).join('');
    }
    var implHtml = impls.length ? impls.map(function (im) {
      var defs = im.defaults && Object.keys(im.defaults).length
        ? Object.keys(im.defaults).map(function (k) { return k + '=' + im.defaults[k]; }).join('、') : '';
      return '<div class="gp-impl"><div class="gp-impl-name">' + esc(im.name) + '</div>' +
        '<div class="gp-impl-path">' + val(im.module) + '</div>' +
        '<div class="gp-impl-meta">符号：' + val((im.symbols || []).join('、')) + '</div>' +
        '<div class="gp-impl-meta">参数：' + val((im.config || []).join('、')) + '</div>' +
        '<div class="gp-impl-meta">默认值：' + val(defs) + '</div>' +
        '<div class="gp-impl-meta">版本快照：' + val(im.version_seen) + '</div>' +
        (im.notes ? '<div class="gp-impl-meta">' + esc(im.notes) + '</div>' : '') + '</div>';
    }).join('') : (engHtml || (n.engine_note ? '<div class="gp-impl-meta">未走推理引擎：' + esc(n.engine_note) + '</div>' : '<p class="gp-none">未查到</p>'));
    // 社区节点没有实现层：改为列出本社区维护的引擎（点开即跳到该引擎面板）
    if (n.type === 'community' && !impls.length) {
      var owned = state.doc.edges.filter(function (e) { return e.type === 'maintained_by' && e.to === n.id && nm[e.from]; });
      if (owned.length) {
        implHtml = '<div class="gp-impl-meta">本社区维护的引擎（点引擎名跳转，看它的实现层与发版情况）：</div>' +
          owned.map(function (e) {
            var en = nm[e.from];
            return '<div class="gp-impl"><div class="gp-impl-name gp-rel-link" data-goto="' + esc(en.id) + '">' + esc(en.name) + '</div>' +
              '<div class="gp-impl-meta">' + esc(en.one_line || '') + '</div></div>';
          }).join('');
      }
    }
    html += sec(4, '在哪些引擎里 · 怎么实现', implHtml);
    // 5 实测收益
    var g = n.gain || [];
    // 引擎/硬件节点自身不收录基准时，聚合挂在该引擎下的技术节点实测数字（如实标注，不冒充引擎级基准）
    var gNote = '';
    if (!g.length && (n.type === 'engine' || n.type === 'hardware')) {
      var eshort = String(n.id || '').split('/')[1] || '';
      var agg = [];
      state.doc.nodes.forEach(function (t) {
        if (t.type !== 'tech' || !t.gain || !t.gain.length) return;
        var eng = t.engines || [];
        var hit = eng.some(function (x) { x = String(x); return x === n.id || x === eshort || x === 'engine/' + eshort; });
        if (!hit) return;
        t.gain.forEach(function (x) { agg.push({ tn: t.name || t.id, g: x }); });
      });
      if (agg.length) {
        g = agg.slice(0, 6).map(function (a) {
          return { metric: '〔' + a.tn + '〕' + (a.g.metric || ''), value: a.g.value, source: a.g.source, evidence: a.g.evidence };
        });
        gNote = '<p class="gp-impl-meta">引擎级基准本图未单独收录；下表是本引擎相关技术节点已收录的实测数字，注明技术名以便追溯。</p>';
      }
    }
    var gtab = g.length ? gNote + '<table class="gp-table"><tr><th>指标</th><th>数值</th><th>来源</th><th>证据</th></tr>' +
      g.map(function (x) { return '<tr><td>' + esc(x.metric || '') + '</td><td>' + esc(x.value || '') + '</td><td>' + val(x.source) + '</td><td>' + esc(x.evidence || '') + '</td></tr>'; }).join('') + '</table>'
      : '<p class="gp-none">未查到</p>';
    html += sec(5, '实测收益', gtab);
    // 6 代价与坑
    var cHtml = '<ul class="gp-list">' + ((n.cost || []).length ? (n.cost || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') : '<li class="gp-none">未查到</li>') + '</ul>';
    var pf = n.pitfalls || [];
    // 引擎/硬件节点同理：聚合挂在它下面的技术节点的代价与坑，注明来源技术
    if (!(n.cost || []).length && !pf.length && (n.type === 'engine' || n.type === 'hardware')) {
      var es2 = String(n.id || '').split('/')[1] || '';
      var costAgg = [], pfAgg = [];
      state.doc.nodes.forEach(function (t) {
        if (t.type !== 'tech') return;
        var eng = t.engines || [];
        var hit = eng.some(function (x) { x = String(x); return x === n.id || x === es2 || x === 'engine/' + es2; });
        if (!hit) return;
        (t.cost || []).forEach(function (c) { costAgg.push({ tn: t.name || t.id, c: c }); });
        (t.pitfalls || []).forEach(function (p) { pfAgg.push({ tn: t.name || t.id, p: p }); });
      });
      if (costAgg.length || pfAgg.length) {
        cHtml = '<p class="gp-impl-meta">引擎级代价本图未单独收录；以下是本引擎相关技术节点的代价与坑，注明技术名以便追溯。</p><ul class="gp-list">' +
          costAgg.slice(0, 5).map(function (a) { return '<li>〔' + esc(a.tn) + '〕' + esc(a.c) + '</li>'; }).join('') + '</ul>' +
          pfAgg.slice(0, 5).map(function (a) { return '<div class="gp-pit"><b>坑</b> 〔' + esc(a.tn) + '〕' + esc(a.p.hit || '') + '<br><b>修法</b> ' + esc(a.p.fix || '') + '</div>'; }).join('');
      }
    } else if (pf.length) {
      cHtml += pf.map(function (p) { return '<div class="gp-pit"><b>坑</b> ' + esc(p.hit || '') + '<br><b>修法</b> ' + esc(p.fix || '') + '</div>'; }).join('');
    }
    html += sec(6, '代价与坑', cHtml);
    // 7 关系（按边类型分组，每条 note，可点击）
    var rels = state.doc.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
    var groups = {};
    rels.forEach(function (e) { (groups[e.type] = groups[e.type] || []).push(e); });
    var relHtml = Object.keys(groups).map(function (t) {
      var rows = groups[t].map(function (e) {
        var out = e.from === n.id, oid = out ? e.to : e.from, o = nm[oid];
        return '<div class="gp-rel-row"><span class="gp-rel-arrow">' + (out ? '→' : '←') + '</span>' +
          '<span class="gp-rel-link" data-goto="' + esc(oid) + '">' + esc(o ? o.name : oid) + '</span>' +
          '<span class="gp-rel-note">' + val(e.note) + '</span></div>';
      }).join('');
      return '<div class="gp-rel-group"><div class="gp-rel-gtitle">' + esc((EDGE_META[t] || {}).name || t) + '（' + groups[t].length + '）</div>' + rows + '</div>';
    }).join('') || '<p class="gp-none">未查到</p>';
    html += sec(7, '关系（按类型分组）', relHtml);
    // 8 社区与维护者
    // 优先用节点自身的社区字段；engine 节点经 maintained_by 边找维护社区
    var cm = (n.type === 'community') ? n : n.community;
    if (!cm) {
      for (var ci = 0; ci < state.doc.edges.length; ci++) {
        var ce = state.doc.edges[ci];
        if (ce.type === 'maintained_by' && ce.from === n.id && nm[ce.to]) { cm = nm[ce.to]; break; }
      }
    }
    var govLink = cm && cm.governance_url
      ? ' <a class="gp-url" href="' + esc(cm.governance_url) + '" target="_blank" rel="noopener">治理说明 ↗</a>' : '';
    // 真实规模与维护者（由 enrich_community.py 从 GitHub REST API 抓取；缺失就整行不显示，不填空话）
    function num(v) { return (v === null || v === undefined || v === '') ? '' : String(v); }
    var reposTxt = cm && cm.repos ? (Array.isArray(cm.repos) ? cm.repos.join('、') : String(cm.repos)) : '';
    var scaleBits = [];
    if (cm && cm.stars !== null && cm.stars !== undefined) scaleBits.push('★ ' + Number(cm.stars).toLocaleString());
    if (cm && cm.contributors) scaleBits.push('贡献者 ' + cm.contributors);
    if (cm && cm.last_push) scaleBits.push('最近提交 ' + cm.last_push);
    var maintTxt = '';
    if (cm && cm.top_maintainers && cm.top_maintainers.length) {
      maintTxt = cm.top_maintainers.map(function (m) {
        return esc(m.login) + (m.contributions ? ' <span class="gp-impl-meta">(' + m.contributions + ')</span>' : '');
      }).join('、') + '<div class="gp-impl-meta">按公开 commit 数排序的前 ' + cm.top_maintainers.length + ' 位，来源 GitHub contributors API</div>';
    }
    var cadTxt = '';
    if (cm && (cm.release_cadence_days !== null && cm.release_cadence_days !== undefined)) {
      cadTxt = '平均 ' + cm.release_cadence_days + ' 天/版';
      if (cm.latest_release && cm.latest_release.tag) cadTxt += '；最新 ' + esc(cm.latest_release.tag) + (cm.latest_release.date ? '（' + esc(cm.latest_release.date) + '）' : '');
    }
    var cmHtml = cm ?
      '<dl class="gp-comm"><dt>组织</dt><dd>' + val(cm.org) + '</dd><dt>治理模式</dt><dd>' + val(cm.governance) + govLink + '</dd>' +
      '<dt>仓库</dt><dd>' + val(reposTxt) + '</dd>' +
      '<dt>License</dt><dd>' + val(cm.license) + '</dd>' +
      (scaleBits.length ? '<dt>规模</dt><dd>' + esc(scaleBits.join(' · ')) + '</dd>' : '') +
      (maintTxt ? '<dt>核心维护者</dt><dd>' + maintTxt + '</dd>' : '') +
      (cadTxt ? '<dt>发版节奏</dt><dd>' + cadTxt + '</dd>' : '') + '</dl>'
      : '<p class="gp-none">未查到</p>';
    html += sec(8, '社区与维护者', cmHtml);
    // 9 出处与变更
    var u = n.urls || [];
    var uHtml = u.length ? u.map(function (x) { return '<a class="gp-url" href="' + esc(x) + '" target="_blank" rel="noopener">' + esc(x) + ' ↗</a>'; }).join('') : '<p class="gp-none">未查到</p>';
    var cl = n.changelog || [];
    uHtml += '<p class="gp-impl-meta">变更：' + (cl.length ? cl.map(function (c) { return esc(c.date || '') + ' ' + esc(c.change || ''); }).join('；') : '未查到') + '</p>';
    html += sec(9, '出处与变更', uHtml);
    // 底部动作
    html += '<div class="gp-actions"><button class="gp-act primary" id="gp-neighbors">' + (state.focusSet ? '✕ 清除邻域' : '◎ 看它的邻居') + '</button>' +
      '<button class="gp-act" id="gp-copy">🔗 复制深链</button></div>';
    $('gpanel').innerHTML = html;

    $('gp-close').addEventListener('click', closePanel);
    $('gp-neighbors').addEventListener('click', function () {
      if (state.focusSet) { state.focusSet = null; }
      else { state.focusSet = neighbors(n.id).ids; }
      applyVisibility(); renderPanel(n); toast(state.focusSet ? '已聚焦邻域（' + Object.keys(state.focusSet).length + ' 个节点）' : '已清除邻域');
    });
    $('gp-copy').addEventListener('click', function () {
      var url = location.href.split('#')[0] + '#node/' + encodeURIComponent(n.id);
      copyText(url); toast('深链已复制');
    });
    Array.prototype.forEach.call($('gpanel').querySelectorAll('[data-goto]'), function (a) {
      a.addEventListener('click', function () { selectNode(a.getAttribute('data-goto'), true); });
    });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }
  function toast(msg) {
    var d = document.createElement('div'); d.className = 'gp-toast'; d.textContent = msg;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 1800);
  }
  function selectNode(id, pushHash) {
    var n = nodeMap()[id]; if (!n) return;
    state.selected = id;
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (g.classList) g.classList.toggle('selected', g.getAttribute('data-id') === id);
    });
    renderPanel(n);
    $('ggrid').classList.add('has-panel');
    $('gpanel').hidden = false;
    if (pushHash !== false) {
      state.suppressHash = true;
      history.replaceState(null, '', '#node/' + encodeURIComponent(id));
      setTimeout(function () { state.suppressHash = false; }, 0);
    }
  }
  function closePanel() {
    state.selected = null; state.focusSet = null;
    $('gpanel').hidden = true; $('ggrid').classList.remove('has-panel');
    applyVisibility();
    if (!state.suppressHash) { state.suppressHash = true; history.replaceState(null, '', '#view/' + state.view); setTimeout(function () { state.suppressHash = false; }, 0); }
  }

  /* ---------- 左栏：视图 / 筛选 / 矩阵 / 图例 ---------- */
  function renderViews() {
    $('gviews').innerHTML = VIEWS.map(function (v) {
      return '<button class="g-view-btn' + (state.view === v[0] ? ' active' : '') + '" data-view="' + v[0] + '" role="tab">' + esc(v[1]) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('gviews').querySelectorAll('[data-view]'), function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
    });
    $('gviewbadge').textContent = VIEW_NAME[state.view] + ' · ' + state.doc.nodes.length + ' 节点';
  }
  function filterVals() {
    var d = state.doc;
    return [
      ['stack', '栈', ['全部'].concat(uniq(flat(d.nodes, 'stack')))],
      ['engine', '引擎', ['全部'].concat(ENGINES.map(function (e) { return e[0]; }))],
      ['domain', '技术域', ['全部'].concat(DOMAINS.map(function (x) { return x[0]; }))],
      ['maturity', '成熟度', ['全部'].concat(uniq(map(d.nodes, 'maturity')))],
      ['evidence', '证据', ['全部'].concat(uniq(map(d.nodes, 'evidence')))]
    ];
  }
  function flat(arr, k) { var o = []; arr.forEach(function (x) { (x[k] || []).forEach(function (v) { o.push(v); }); }); return o; }
  function map(arr, k) { return arr.map(function (x) { return x[k]; }).filter(Boolean); }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o.sort(); }
  function fname(k, v) {
    if (k === 'stack') return STACKNAME[v] || v;
    if (k === 'domain') return DOMAIN_NAME[v] || v;
    if (k === 'maturity') return MATURITY[v] || v;
    if (k === 'evidence') return '证据 ' + v + '（' + (EVIDENCE[v] || '未查到') + '）';
    if (k === 'engine') { var e = ENGINES.filter(function (x) { return x[0] === v; })[0]; return e ? e[1] : v; }
    return v;
  }
  function renderFilters() {
    var rows = filterVals().map(function (r) {
      var k = r[0], label = r[1], vals = r[2];
      var chips = vals.map(function (v) {
        var cnt = v === '全部' ? state.doc.nodes.length : countFor(k, v);
        var dis = v !== '全部' && cnt === 0;
        if (dis && state.filters[k] === v) state.filters[k] = '全部';
        return '<button class="g-fchip' + (state.filters[k] === v ? ' active' : '') + '" data-k="' + k + '" data-v="' + esc(v) + '"' +
          (dis ? ' disabled' : '') + ' title="' + esc(fname(k, v)) + '">' + esc(fname(k, v)) + '<span class="cnt">' + cnt + '</span></button>';
      }).join('');
      return '<div class="g-filter-row"><span class="g-filter-label">' + esc(label) + '</span><div class="g-filter-chips">' + chips + '</div></div>';
    }).join('');
    $('gfilters').innerHTML = rows;
    Array.prototype.forEach.call($('gfilters').querySelectorAll('[data-k]'), function (b) {
      if (b.disabled) return;
      b.addEventListener('click', function () {
        state.filters[b.getAttribute('data-k')] = b.getAttribute('data-v');
        renderFilters(); applyVisibility();
      });
    });
  }
  function countFor(k, v) {
    return state.doc.nodes.filter(function (n) {
      if (k === 'stack') return (n.stack || []).indexOf(v) >= 0;
      if (k === 'engine') return nodeEngines(n).indexOf(v) >= 0 || n.id === 'engine/' + v;
      if (k === 'domain') return nodeDomains(n).indexOf(v) >= 0;
      return n[k] === v;
    }).length;
  }
  function renderMatrix() {
    var nm = nodeMap(), rows = ENGINES, cols = DOMAINS;
    var html = '<thead><tr><th class="gm-rowhead">引擎＼域</th>' + cols.map(function (c) { return '<th title="' + esc(c[1]) + '">' + esc(c[1].slice(0, 2)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (en) {
      html += '<tr><th class="gm-rowhead">' + esc(en[1]) + '</th>';
      cols.forEach(function (d) {
        var cnt = state.doc.nodes.filter(function (n) {
          return (nodeEngines(n).indexOf(en[0]) >= 0 || n.id === 'engine/' + en[0]) && nodeDomains(n).indexOf(d[0]) >= 0;
        }).length;
        var on = state.matrixCell && state.matrixCell.e === en[0] && state.matrixCell.d === d[0];
        html += '<td class="gm-cell' + (cnt ? '' : ' gm-zero') + (on ? ' on' : '') + '" data-e="' + en[0] + '" data-d="' + d[0] + '" title="' + esc(en[1] + ' × ' + d[1]) + '">' + cnt + '</td>';
      });
      html += '</tr>';
    });
    $('gmatrix').innerHTML = html + '</tbody>';
    Array.prototype.forEach.call($('gmatrix').querySelectorAll('.gm-cell:not(.gm-zero)'), function (td) {
      td.addEventListener('click', function () {
        var e = td.getAttribute('data-e'), d = td.getAttribute('data-d');
        state.matrixCell = { e: e, d: d };
        state.filters.engine = e; state.filters.domain = d;
        renderFilters(); renderMatrix(); applyVisibility();
        $('gmatrix-clear').hidden = false;
        toast('已交叉筛选：' + fname('engine', e) + ' × ' + fname('domain', d));
      });
    });
    $('gmatrix-clear').hidden = !state.matrixCell;
  }
  function renderLegends() {
    var nt = Object.keys(TYPE_META).map(function (t) {
      var m = TYPE_META[t];
      return '<div class="g-leg-item"><span class="g-leg-ico" style="background:' + m.color + '">' + esc(m.ico) + '</span>' +
        '<span><b>' + esc(m.name) + '</b><small>节点类型：' + esc(t) + '</small></span></div>';
    }).join('');
    var et = Object.keys(EDGE_META).map(function (t) {
      return '<div class="g-leg-item"><span class="g-leg-line l-' + esc(t) + '"></span>' +
        '<span><b>' + esc(EDGE_META[t].name) + '</b><small>边类型：' + esc(t) + '</small></span></div>';
    }).join('');
    $('glegendbody').innerHTML = '<section class="g-leg-sec"><h4>节点颜色 / 图标 = 类型（' + Object.keys(TYPE_META).length + ' 类）</h4>' + nt + '</section>' +
      '<section class="g-leg-sec"><h4>边的颜色 / 线型 = 关系（' + Object.keys(EDGE_META).length + ' 类）</h4>' + et + '</section>' +
      '<section class="g-leg-sec"><h4>其他代号</h4>' +
      Object.keys(EVIDENCE).map(function (e) { return '<div class="g-leg-item"><b>证据 ' + e + '</b><small>' + esc(EVIDENCE[e]) + '</small></div>'; }).join('') +
      Object.keys(MATURITY).map(function (m) { return '<div class="g-leg-item"><b>' + esc(m) + '</b><small>' + esc(MATURITY[m]) + '</small></div>'; }).join('') + '</section>';
    $('glegend-short').innerHTML = Object.keys(TYPE_META).map(function (t) {
      var m = TYPE_META[t];
      return '<span class="g-ls-item"><span class="g-ls-ico" style="background:' + m.color + '">' + esc(m.ico) + '</span>' + esc(m.name) + '</span>';
    }).join('');
  }

  /* ---------- 平移 / 缩放 ---------- */
  function svgPoint(e) {
    var r = $('gsvg').getBoundingClientRect();
    return { x: (e.clientX - r.left) * (state.w / r.width), y: (e.clientY - r.top) * (state.h / r.height) };
  }
  function zoomAt(f, cx, cy) {
    var k2 = Math.max(0.45, Math.min(3.2, state.k * f));
    var wx = (cx - state.tx) / state.k, wy = (cy - state.ty) / state.k;
    state.tx = cx - wx * k2; state.ty = cy - wy * k2; state.k = k2; applyVP();
  }
  function bindViewport() {
    var svg = $('gsvg');
    svg.addEventListener('wheel', function (e) {
      e.preventDefault(); var p = svgPoint(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    }, { passive: false });
    var drag = null, suppress = false;
    function start(e) {
      if (e.target.closest && e.target.closest('.node')) return;
      drag = { sx: e.clientX, sy: e.clientY, tx: state.tx, ty: state.ty, moved: false };
    }
    function move(e) {
      if (!drag) return;
      var r = svg.getBoundingClientRect();
      var dx = (e.clientX - drag.sx) * (state.w / r.width), dy = (e.clientY - drag.sy) * (state.h / r.height);
      if (Math.abs(e.clientX - drag.sx) > 3 || Math.abs(e.clientY - drag.sy) > 3) { drag.moved = true; svg.classList.add('dragging'); }
      state.tx = drag.tx + dx; state.ty = drag.ty + dy; applyVP();
    }
    function end() { if (drag && drag.moved) suppress = true; drag = null; svg.classList.remove('dragging'); }
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
    svg.addEventListener('dblclick', function () { resetVP(); });
    $('zin').addEventListener('click', function () { zoomAt(1.2, state.w / 2, state.h / 2); });
    $('zout').addEventListener('click', function () { zoomAt(1 / 1.2, state.w / 2, state.h / 2); });
    $('zreset').addEventListener('click', resetVP);
    $('zfit').addEventListener('click', function () { state.tx = 0; state.ty = 0; state.k = 1; fit(); buildScene(); });
  }
  function resetVP() { state.tx = 0; state.ty = 0; state.k = 1; applyVP(); }

  /* ---------- 深链 ---------- */
  function setView(mode, pushHash) {
    if (!VIEW_NAME[mode]) mode = 'engine';
    state.view = mode;
    if (pushHash !== false) {
      state.suppressHash = true;
      history.replaceState(null, '', '#view/' + mode);
      setTimeout(function () { state.suppressHash = false; }, 0);
    }
    renderViews(); buildScene();
  }
  function applyHash() {
    if (!state.doc) return;
    var h = location.hash;
    var m = h.match(/^#node\/(.+)$/);
    if (m) { selectNode(decodeURIComponent(m[1]), false); return; }
    m = h.match(/^#view\/([a-z]+)$/);
    if (m) { closePanelSilent(); setView(m[1], false); return; }
    closePanelSilent();
  }
  function closePanelSilent() {
    state.selected = null; state.focusSet = null;
    $('gpanel').hidden = true; $('ggrid').classList.remove('has-panel');
  }
  function bindHash() {
    window.addEventListener('hashchange', function () {
      if (state.suppressHash) return;
      applyHash();
    });
  }

  /* ---------- 主题：沿用 window.__themeClickBound 单绑 ---------- */
  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    if (window.__themeClickBound) return;
    window.__themeClickBound = true;
    var t = $('theme-toggle'); if (!t) return;
    t.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('theme', cur);
    });
  }

  /* ---------- 几何自检钩子：正德的验收口径，暴露给浏览器直接断言 ---------- */
  function geometryReport() {
    var nodes = state.doc.nodes, pos = state.positions, bad = [], off = [], minFont = 999;
    nodes.forEach(function (n) {
      var p = pos[n.id]; if (!p) return;
      var r = radius(n);
      if (p.x - r < 0 || p.y - r < 0 || p.x + r > state.w || p.y + r > state.h) off.push(n.id);
    });
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = pos[nodes[i].id], b = pos[nodes[j].id]; if (!a || !b) continue;
        var dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        var need = radius(nodes[i]) + radius(nodes[j]);
        if (d < need - 0.5) bad.push([nodes[i].id, nodes[j].id, +d.toFixed(1), need]);
      }
    }
    var label = $('gnodes').querySelector('.node-label');
    if (label) minFont = parseFloat(getComputedStyle(label).fontSize);
    var svg = $('gsvg'), vb = svg.getAttribute('viewBox').split(' ').map(Number);
    /* 可见 label 的 bbox 相交对（用户硬指标：必须为 0） */
    var labels = [], lp = [];
    nodes.forEach(function (n) {
      var o = labelElOf(n.id); if (!o || !o.t) return;
      if (o.g.style.display === 'none') return;
      if (o.t.style.visibility === 'hidden') return;
      var b = labelBox(n.id); if (b) labels.push({ id: n.id, b: b });
    });
    for (var a = 0; a < labels.length; a++) {
      for (var c = a + 1; c < labels.length; c++) {
        var A = labels[a].b, B = labels[c].b;
        if (!(A.x2 < B.x1 || A.x1 > B.x2 || A.y2 < B.y1 || A.y1 > B.y2)) lp.push([labels[a].id, labels[c].id]);
      }
    }
    return {
      nodes: nodes.length, edges: state.doc.edges.length, view: state.view,
      viewBox: vb, stage: [state.w, state.h],
      viewportOK: vb[2] === state.w && vb[3] === state.h,
      overlaps: bad, outside: off, overlapCount: bad.length, outsideCount: off.length,
      labelScreenPx: minFont, labelOK: minFont >= 11,
      labelVisibleCount: labels.length, labelOverlapPairs: lp.length, labelOverlaps: lp.slice(0, 8)
    };
  }
  window.__gprobe = {
    report: geometryReport,
    state: function () { return { view: state.view, selected: state.selected, query: state.query, filters: state.filters, fixture: state.doc._fixture }; },
    nodeIds: function () { return state.doc.nodes.map(function (n) { return n.id; }); },
    positions: function () { return state.positions; }
  };

  /* ---------- 节点事件委托：innerHTML 重建后不必逐个重绑 ---------- */
  function bindNodes() {
    var host = $('gnodes');
    host.addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('.node') : null;
      if (!g) return;
      e.stopPropagation();
      selectNode(g.getAttribute('data-id'), true);
    });
    host.addEventListener('mouseover', function (e) {
      var g = e.target.closest ? e.target.closest('.node') : null;
      if (g) highlight(g.getAttribute('data-id'));
    });
    host.addEventListener('mouseout', function (e) {
      var g = e.target.closest ? e.target.closest('.node') : null;
      if (g) clearHighlight();
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    var tBoot = performance.now();
    initTheme(); bindViewport(); bindHash(); bindNodes();
    var s = $('gsearch');
    s.addEventListener('input', function () { state.query = s.value; applyVisibility(); });
    s.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = state.query.trim().toLowerCase(); if (!q) return;
      var hit = state.doc.nodes.filter(function (n) {
        return passes(n) && (n.name.toLowerCase().indexOf(q) >= 0 || n.alias.join(' ').toLowerCase().indexOf(q) >= 0);
      })[0];
      if (hit) selectNode(hit.id, true);
    });
    $('gmatrix-clear').addEventListener('click', function () {
      state.matrixCell = null; state.filters.engine = '全部'; state.filters.domain = '全部';
      renderFilters(); renderMatrix(); applyVisibility();
    });
    loadData().then(function (doc) {
      var tData = performance.now();
      state.doc = doc;
      $('gver').textContent = 'v1 · ' + (doc.schema_version || '');
      $('gmeta').textContent = (doc.subtitle || '') + (doc.generated_at ? ' · 数据更新 ' + doc.generated_at : '');
      $('gstatline').innerHTML =
        '<span class="g-stat">节点 <b>' + doc.nodes.length + '</b></span>' +
        '<span class="g-stat">关系 <b>' + doc.edges.length + '</b></span>' +
        '<span class="g-stat">引擎 <b>' + ENGINES.length + '</b></span>' +
        '<span class="g-stat">技术域 <b>' + DOMAINS.length + '</b></span>';
      $('gloading').hidden = true;
      fit(); renderViews(); renderFilters(); renderMatrix(); renderLegends();
      var h = location.hash.match(/^#view\/([a-z]+)$/);
      state.view = h && VIEW_NAME[h[1]] ? h[1] : 'engine';
      var tDraw = performance.now();
      buildScene(); applyHash();
      var renderMs = Math.round(performance.now() - tDraw);
      var totalMs = Math.round(performance.now() - tBoot);
      window.__gPerf = { nodes: doc.nodes.length, edges: doc.edges.length, loadMs: Math.round(tData - tBoot), renderMs: renderMs, totalMs: totalMs };
      console.log('[graph] 首渲染 ' + doc.nodes.length + ' 节点 / ' + doc.edges.length + ' 边：总计 ' + totalMs + 'ms（取数 ' + Math.round(tData - tBoot) + 'ms + 布局渲染 ' + renderMs + 'ms），目标 <400ms');
      console.log('[graph] 350 节点估算依据：布局用空间网格把去重叠降到近 O(n)，轮数上限 240；实测入口 ?bench=350（临时补假节点跑同一条链路并打印耗时），默认不计入首渲染。');
      if (/[?&]bench=350\b/.test(location.search)) {
        try {
          var keepNodes = state.doc.nodes, pad = [];
          for (var bi = 0; keepNodes.length + pad.length < 350; bi++) {
            var bs = keepNodes[bi % keepNodes.length], bc = {};
            for (var bk in bs) if (Object.prototype.hasOwnProperty.call(bs, bk)) bc[bk] = bs[bk];
            bc.id = 'bench/' + bi; bc.name = bs.name + ' #' + bi; bc.type = 'tech';
            pad.push(bc);
          }
          state.doc.nodes = keepNodes.concat(pad);
          var tb = performance.now();
          buildScene();
          var benchMs = Math.round(performance.now() - tb);
          state.doc.nodes = keepNodes;
          buildScene();
          window.__gPerf350 = benchMs;
          console.log('[graph] 350 节点实测：临时补 ' + pad.length + ' 个假节点，跑同一条布局链路 ' + benchMs + 'ms（目标 <400ms）');
        } catch (e) { console.warn('[graph] 350 节点基准失败', e); }
      }
      var rt = null;
      function schedule() {
        clearTimeout(rt);
        rt = setTimeout(function () {
          if (!state.doc) return;
          var keep = state.selected;
          fit(); buildScene(); if (keep && nodeMap()[keep]) selectNode(keep, false);
        }, 140);
      }
      if (window.ResizeObserver) new ResizeObserver(schedule).observe($('gstage'));
      else window.addEventListener('resize', schedule);
    }).catch(function (err) {
      $('gloading').innerHTML = '<div><b>图谱加载失败</b><p>' + esc(err.message) + '</p><p>请刷新重试。</p></div>';
    });
  }
  boot();
})();
