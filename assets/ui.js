/* 全站共用小交互：回到顶部 + 首页锚点高亮
   只做表现层，不碰数据；任何页面都可以安全加载。 */
(function () {
  'use strict';

  /* ---------- 回到顶部 ---------- */
  var btn = document.createElement('button');
  btn.className = 'to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', '回到顶部');
  btn.title = '回到顶部';
  btn.textContent = '↑';
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(btn);

  var ticking = false;
  function sync() {
    ticking = false;
    btn.classList.toggle('is-visible', window.scrollY > 520);
  }
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(sync);
  }, { passive: true });
  sync();

  /* ---------- 首页锚点导航高亮（今日 / 情报）---------- */
  var anchors = Array.prototype.slice.call(document.querySelectorAll('.nav-link[data-anchor]'));
  if (!anchors.length) return;

  var targets = anchors.map(function (a) {
    return { link: a, el: document.getElementById(a.getAttribute('data-anchor')) };
  }).filter(function (t) { return t.el; });
  if (!targets.length) return;

  function setActive(target) {
    anchors.forEach(function (a) { a.classList.toggle('is-active', a === target); });
  }

  /* 按滚动位置取「当前视口上方最后一个锚点」，比 IntersectionObserver 稳：
     页面顶部时一定高亮第一项，长区块中途也不会来回跳。 */
  function pick() {
    var line = window.scrollY + Math.min(window.innerHeight * 0.35, 300);
    var cur = targets[0];
    targets.forEach(function (t) {
      var top = t.el.getBoundingClientRect().top + window.scrollY;
      if (top <= line) cur = t;
    });
    setActive(cur.link);
  }
  var navTicking = false;
  window.addEventListener('scroll', function () {
    if (navTicking) return;
    navTicking = true;
    window.requestAnimationFrame(function () { navTicking = false; pick(); });
  }, { passive: true });
  window.addEventListener('resize', pick);
  pick();
  /* ---------- 首页「常驻专题」条数（有元素才拉）---------- */
  var counters = document.querySelectorAll('[data-count-for]');
  if (counters.length) {
    var SRC = { kv: 'data/kv.json', graph: 'data/graph.json', spec: 'data/spec.json' };
    Object.keys(SRC).forEach(function (k) {
      var nodes = document.querySelectorAll('[data-count-for="' + k + '"]');
      if (!nodes.length) return;
      fetch(SRC[k] + '?v=' + Date.now(), { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          var n = (k === 'graph' ? (d.nodes || []) : (d.items || [])).length;
          if (!n) return;
          Array.prototype.forEach.call(nodes, function (node) { node.textContent = n; });
        })
        .catch(function () { /* 数字拿不到就保留占位，不影响导航 */ });
    });
  }
})();
