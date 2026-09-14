/* 蓝鲸品牌覆盖（TurboWarp 编辑器换标）+ 作品存/取 运行时脚本。
   1) 隐去 TurboWarp 品牌/外链按钮（官方 Scratch 功能一律保留）；
   2) 启动时载入“蓝鲸”默认工程（或按 URL ?project=<id> 打开已存作品）；
   3) 自由模式：菜单栏注入「📂 打开 / 💾 保存」，作品以官方 sb3 存到后端(/api/works, kind=scratch)；
   4) 任务模式（URL ?attempt=<id>&task=<id>）：注入「✅ 提交判分」，saveProjectSb3 → 提交练习判分 → 弹分数与达标清单。
   注入见 apply-brand.sh。GPL：本覆盖随我们的 fork 一并开源。 */
(function () {
  'use strict';

  // ① 隐去 TurboWarp 品牌 / 指向外站的按钮（按文本/标题匹配；不动官方 Scratch 功能）
  var HIDE = ['TurboWarp', '查看作品页面'];
  function hideBranding() {
    var bar = document.querySelector('[class*="menu-bar_menu-bar"]');
    if (!bar) return;
    bar.querySelectorAll('a, button, [role="button"], [class*="menu-bar_menu-bar-item"]').forEach(function (el) {
      if (el.getAttribute('data-lj-hidden') || (el.closest && el.closest('#lj-toolbar'))) return;
      var t = (el.textContent || '').trim();
      var title = (el.getAttribute('title') || el.getAttribute('aria-label') || '');
      if (HIDE.some(function (h) { return t.indexOf(h) >= 0 || title.indexOf(h) >= 0; })) {
        el.style.display = 'none';
        el.setAttribute('data-lj-hidden', '1');
      }
    });
  }

  // ===== 作品存/取 =====
  var currentId = null;          // 当前作品 id（null=尚未保存的新作品）
  var currentTitle = '我的作品';
  var params = new URLSearchParams(location.search);
  var openId = params.get('project');    // ?project=<id> → 启动即打开该作品
  var attemptId = params.get('attempt'); // ?attempt=<id>&task=<id> → 任务模式:搭题→提交判分
  var taskId = params.get('task');
  var taskMode = !!attemptId;

  function token() { return localStorage.getItem('token') || ''; }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {});
    var tk = token();
    if (tk) opts.headers['Authorization'] = 'Bearer ' + tk;
    return fetch('/api' + path, opts);
  }

  function setStatus(msg, ok) {
    var s = document.getElementById('lj-save-status');
    if (s) { s.textContent = msg || ''; s.style.color = ok === false ? '#ffd9d9' : '#efe7ff'; }
  }

  // 抓舞台快照当封面缩略图（拿不到就降级不带封面，绝不阻塞保存）
  function captureCover() {
    return new Promise(function (resolve) {
      try {
        var r = window.vm && window.vm.renderer;
        if (!r || typeof r.requestSnapshot !== 'function') { resolve(null); return; }
        var done = false;
        var to = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 1500);
        r.requestSnapshot(function (dataURI) {
          if (done) return; done = true; clearTimeout(to);
          finish(dataURI);
        });
        // 空闲编辑器不会主动重绘 → requestSnapshot 的回调排在下次 draw；手动 draw() 立刻兑现快照
        try { if (typeof r.draw === 'function') r.draw(); } catch (e) { /* 忽略,超时兜底 */ }
        function finish(dataURI) {
          var img = new Image();
          img.onload = function () {
            var W = 480, H = Math.round(W * (img.height || 360) / (img.width || 480));
            var c = document.createElement('canvas'); c.width = W; c.height = H;
            c.getContext('2d').drawImage(img, 0, 0, W, H);
            c.toBlob(function (b) { resolve(b); }, 'image/png');
          };
          img.onerror = function () { resolve(null); };
          img.src = dataURI;
        }
      } catch (e) { resolve(null); }
    });
  }

  function doSave() {
    if (!window.vm) return;
    if (!token()) { alert('请先登录蓝鲸平台，再保存作品'); return; }
    setStatus('保存中…');
    Promise.all([
      Promise.resolve(window.vm.saveProjectSb3()),
      captureCover()
    ]).then(function (arr) {
      var blob = arr[0], cover = arr[1];
      var fd = new FormData();
      fd.append('file', new Blob([blob], { type: 'application/x.scratch.sb3' }), 'project.sb3');
      if (cover) { fd.append('cover', cover, 'cover.png'); }
      var url;
      if (currentId == null) {
        var title = (prompt('给作品起个名字：', currentTitle) || '').trim() || '我的作品';
        fd.append('title', title);
        currentTitle = title;
        url = '/works/scratch';
      } else {
        url = '/works/' + currentId + '/sb3';   // 覆盖保存，保留原标题
      }
      return api(url, { method: 'POST', body: fd }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (j && j.code === 200) {
        if (currentId == null && j.data != null) currentId = j.data;
        setStatus('已保存 ✓', true);
        setTimeout(function () { setStatus(''); }, 2500);
      } else {
        setStatus((j && j.message) || '保存失败', false);
      }
    }).catch(function () { setStatus('保存失败', false); });
  }

  function loadProject(id, title) {
    setStatus('打开中…');
    return api('/works/' + id + '/sb3', {}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      return window.vm.loadProject(buf);
    }).then(function () {
      currentId = id;
      currentTitle = title || currentTitle;
      setStatus('已打开：' + currentTitle, true);
      setTimeout(function () { setStatus(''); }, 2500);
    }).catch(function () { setStatus('打开失败', false); });
  }

  function openList() {
    if (!token()) { alert('请先登录蓝鲸平台'); return; }
    var panel = document.getElementById('lj-open-panel');
    if (!panel) return;
    panel.innerHTML = '<div class="lj-open-hint">加载中…</div>';
    panel.style.display = 'block';
    api('/works?kind=scratch', {}).then(function (r) { return r.json(); }).then(function (j) {
      var list = (j && j.code === 200 && j.data) || [];
      if (!list.length) { panel.innerHTML = '<div class="lj-open-hint">还没有保存的作品</div>'; return; }
      panel.innerHTML = '';
      list.forEach(function (p) {
        var item = document.createElement('div');
        item.className = 'lj-open-item';
        var name = document.createElement('span');
        name.textContent = p.title || ('作品 #' + p.id);
        var t = document.createElement('small');
        t.textContent = String(p.updateTime || '').replace('T', ' ').slice(0, 16);
        item.appendChild(name);
        item.appendChild(t);
        item.onclick = function () { panel.style.display = 'none'; loadProject(p.id, p.title); };
        panel.appendChild(item);
      });
    }).catch(function () { panel.innerHTML = '<div class="lj-open-hint">加载失败</div>'; });
  }

  // ===== 任务模式：提交判分 =====
  function sb3Base64() {
    return Promise.resolve(window.vm.saveProjectSb3()).then(function (blob) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(String(fr.result).split(',')[1]); };  // dataURL → base64
        fr.onerror = rej;
        fr.readAsDataURL(new Blob([blob]));
      });
    });
  }

  function doSubmit() {
    if (!window.vm) return;
    if (!token()) { alert('请先登录蓝鲸平台再提交'); return; }
    var btn = document.getElementById('lj-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '判分中…'; }
    sb3Base64().then(function (b64) {
      return api('/practical/attempts/' + attemptId + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerJson: JSON.stringify({ sb3Base64: b64 }) })
      }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ 提交判分'; }
      if (j && j.code === 200 && j.data) { showResult(j.data); }
      else { alert((j && j.message) || '判分失败，请重试'); }
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ 提交判分'; }
      alert('提交失败：' + (e && e.message || e));
    });
  }

  function showResult(data) {
    var score = data.score || {};
    var total = Math.round(Number(score.totalScore || 0));
    var review = Number(score.needReview || 0) === 1;
    var items = {}, fb = {};
    try { items = JSON.parse(score.scoreJson || '{}'); } catch (e) {}
    try { fb = JSON.parse(score.feedbackJson || '{}'); } catch (e) {}
    var rows = Object.keys(items).map(function (k) {
      var v = String(items[k]); var ok = v.indexOf('✓') >= 0;
      var extra = v.replace(/[✓✗\s]/g, '') ? ' <em>' + esc(v.replace(/[✓✗]/g, '').trim()) + '</em>' : '';
      return '<li class="' + (ok ? 'ok' : 'no') + '"><span>' + (ok ? '✓' : '✗') + '</span>' + esc(k) + extra + '</li>';
    }).join('');
    var old = document.getElementById('lj-result-mask');
    if (old) old.remove();
    var mask = document.createElement('div');
    mask.id = 'lj-result-mask';
    mask.innerHTML =
      '<div class="lj-result-card">' +
        '<div class="lj-result-score' + (review ? ' review' : '') + '">' +
          (review ? '<b>已提交</b><span>等待老师复核</span>' : '<b>' + total + '</b><span>分</span>') +
        '</div>' +
        '<div class="lj-result-sum">' + esc(fb.summary || '') + '</div>' +
        '<ul class="lj-result-list">' + rows + '</ul>' +
        '<button class="lj-btn lj-btn-primary" id="lj-result-close" type="button">继续修改</button>' +
      '</div>';
    document.body.appendChild(mask);
    document.getElementById('lj-result-close').onclick = function () { mask.remove(); };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // 任务模式:拉任务详情，把要求显示在底部浮条
  function loadTaskBanner() {
    if (!taskMode || !taskId) return;
    api('/practical/tasks/' + taskId, {}).then(function (r) { return r.json(); }).then(function (j) {
      if (!(j && j.code === 200 && j.data)) return;
      var t = j.data, banner = document.getElementById('lj-task-banner');
      if (!banner) return;
      banner.querySelector('.lj-task-title').textContent = '📝 ' + (t.title || '图形化任务');
      banner.querySelector('.lj-task-goal').textContent = t.description || '';
      banner.style.display = 'flex';
    }).catch(function () {});
  }

  // 菜单栏右侧注入工具条（自由模式=打开/保存；任务模式=提交判分）
  function injectToolbar() {
    if (!document.body || document.getElementById('lj-toolbar')) return;
    if (!document.getElementById('lj-toolbar-css')) {
      var css = document.createElement('style');
      css.id = 'lj-toolbar-css';
      css.textContent =
        '#lj-toolbar{display:flex;align-items:center;gap:8px;position:fixed;top:9px;right:14px;z-index:99998;height:32px;font-family:inherit}' +
        '#lj-toolbar .lj-btn{height:30px;padding:0 13px;border-radius:16px;border:0;cursor:pointer;font-size:13px;font-weight:600;line-height:30px;background:rgba(255,255,255,.22);color:#fff;transition:background .15s}' +
        '#lj-toolbar .lj-btn:hover{background:rgba(255,255,255,.36)}' +
        '#lj-toolbar .lj-btn-primary{background:#fff;color:#855CD6}' +
        '#lj-toolbar .lj-btn-primary:hover{background:#f1ebff}' +
        '#lj-save-status{color:#efe7ff;font-size:12px;white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis}' +
        '#lj-open-panel{display:none;position:absolute;top:38px;right:0;width:246px;max-height:340px;overflow:auto;background:#fff;border:1px solid #e7e1f4;border-radius:10px;box-shadow:0 10px 30px rgba(80,40,140,.22);z-index:99999}' +
        '.lj-open-item{display:flex;flex-direction:column;gap:2px;padding:9px 13px;cursor:pointer;color:#575E75;font-size:13px;border-bottom:1px solid #f3effb}' +
        '.lj-open-item:last-child{border-bottom:0}' +
        '.lj-open-item:hover{background:#f6f2ff}' +
        '.lj-open-item small{color:#a99fc4;font-size:11px}' +
        '.lj-open-hint{padding:12px 13px;color:#8a83a0;font-size:13px}' +
        // 任务模式:提交按钮(绿)、底部要求浮条、判分结果弹层
        '#lj-toolbar .lj-btn-submit{background:#3aab54;color:#fff;font-size:14px;padding:0 16px}' +
        '#lj-toolbar .lj-btn-submit:hover{background:#329a4b}' +
        '#lj-toolbar .lj-btn-submit:disabled{opacity:.6;cursor:default}' +
        '#lj-task-banner{position:fixed;bottom:54px;left:50%;transform:translateX(-50%);z-index:99990;display:flex;align-items:center;gap:10px;width:min(560px,92vw);padding:8px 14px;background:rgba(255,255,255,.97);border:1px solid #e7e1f4;border-radius:12px;box-shadow:0 6px 22px rgba(80,40,140,.16);font-size:13px;line-height:1.4;color:#575E75}' +
        '#lj-task-banner .lj-task-title{font-weight:700;color:#855CD6;white-space:nowrap}' +
        '#lj-task-banner .lj-task-goal{flex:1}' +
        '#lj-task-banner .lj-task-x{border:0;background:transparent;cursor:pointer;color:#a99fc4;font-size:14px;line-height:1;padding:0}' +
        '#lj-result-mask{position:fixed;inset:0;z-index:100000;background:rgba(40,20,70,.42);display:flex;align-items:center;justify-content:center}' +
        '.lj-result-card{width:340px;max-width:90vw;background:#fff;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(40,20,70,.35);text-align:center;font-family:inherit}' +
        '.lj-result-score{margin:2px 0 12px}' +
        '.lj-result-score b{font-size:52px;font-weight:800;color:#855CD6;line-height:1}' +
        '.lj-result-score span{font-size:15px;color:#8a83a0;margin-left:5px}' +
        '.lj-result-score.review b{font-size:26px}' +
        '.lj-result-sum{color:#575E75;font-size:14px;margin-bottom:14px}' +
        '.lj-result-list{list-style:none;margin:0 0 16px;padding:0;text-align:left;max-height:230px;overflow:auto}' +
        '.lj-result-list li{display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-radius:9px;font-size:13px;color:#575E75}' +
        '.lj-result-list li+li{margin-top:5px}' +
        '.lj-result-list li.ok{background:#eefaf0}' +
        '.lj-result-list li.no{background:#fdeeee}' +
        '.lj-result-list li span{font-weight:800}' +
        '.lj-result-list li.ok span{color:#2fae54}' +
        '.lj-result-list li.no span{color:#e2564d}' +
        '.lj-result-list li em{color:#a99fc4;font-style:normal}' +
        '.lj-result-card .lj-btn{width:100%;height:40px;border:0;border-radius:20px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;background:#855CD6;color:#fff}' +
        '.lj-result-card .lj-btn:hover{background:#7a4fce}';
      document.head.appendChild(css);
    }
    var wrap = document.createElement('div');
    wrap.id = 'lj-toolbar';
    wrap.innerHTML =
      '<span id="lj-save-status"></span>' +
      (taskMode
        ? '<button id="lj-submit-btn" class="lj-btn lj-btn-submit" type="button">✅ 提交判分</button>'
        : '<button id="lj-open-btn" class="lj-btn" type="button">📂 打开</button>' +
          '<button id="lj-save-btn" class="lj-btn lj-btn-primary" type="button">💾 保存</button>') +
      '<div id="lj-open-panel"></div>';
    document.body.appendChild(wrap);

    if (taskMode) {
      document.getElementById('lj-submit-btn').onclick = doSubmit;
      if (!document.getElementById('lj-task-banner')) {
        var banner = document.createElement('div');
        banner.id = 'lj-task-banner';
        banner.style.display = 'none';
        banner.innerHTML = '<span class="lj-task-title">📝 图形化任务</span>' +
          '<span class="lj-task-goal"></span>' +
          '<button class="lj-task-x" type="button" title="收起">✕</button>';
        document.body.appendChild(banner);
        banner.querySelector('.lj-task-x').onclick = function () { banner.style.display = 'none'; };
        loadTaskBanner();
      }
    } else {
      document.getElementById('lj-save-btn').onclick = doSave;
      document.getElementById('lj-open-btn').onclick = openList;
      // 点空白关闭打开面板
      document.addEventListener('click', function (e) {
        var panel = document.getElementById('lj-open-panel');
        if (panel && panel.style.display === 'block' &&
            !panel.contains(e.target) && e.target.id !== 'lj-open-btn') {
          panel.style.display = 'none';
        }
      });
    }
  }

  function tick() { hideBranding(); injectToolbar(); }
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1200);
  tick();

  // ② 启动一次性载入初始工程：有 ?project 则取回该作品，否则载蓝鲸默认工程
  var loaded = false, tries = 0;
  function loadInitial() {
    if (loaded || !window.vm || !window.vm.runtime) return;
    loaded = true;
    if (openId) {
      loadProject(openId, null).catch(function () { loaded = false; });
      return;
    }
    fetch('lanjing-default.sb3')
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { return window.vm.loadProject(buf); })
      .catch(function () { loaded = false; /* 失败保留原默认，下个 tick 再试 */ });
  }
  var timer = setInterval(function () {
    loadInitial();
    if (loaded || ++tries > 40) clearInterval(timer);
  }, 500);
})();
