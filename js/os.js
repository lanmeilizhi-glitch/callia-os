/* =========================================================
   Companion OS · os.js
   启动流程 / 应用路由 / 状态栏 / 手势 / 通知 / 主题 / 反馈
   ========================================================= */
(function (global) {
  "use strict";

  var S = global.COS;
  var el = S.el;
  var on = function (node, type, fn, opt) {
    if (node) node.addEventListener(type, fn, opt || false);
  };

  /* ---------- 图标 ---------- */
  var ICONS = {
    chat: '<svg viewBox="0 0 24 24"><path d="M4 6.6A2.6 2.6 0 0 1 6.6 4h10.8A2.6 2.6 0 0 1 20 6.6v6.8a2.6 2.6 0 0 1-2.6 2.6H10l-4 3.4v-3.4H6.6A2.6 2.6 0 0 1 4 13.4z"/></svg>',
    mood: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8.4 13.8c1 1.4 2.2 2 3.6 2s2.6-.6 3.6-2"/><path d="M9 9.6h.01M15 9.6h.01"/></svg>',
    schedule: '<svg viewBox="0 0 24 24"><rect x="4" y="5.6" width="16" height="14.4" rx="2.6"/><path d="M8 3.4v4M16 3.4v4M4 10.2h16M8.5 14h7"/></svg>',
    music: '<svg viewBox="0 0 24 24"><path d="M9.2 17.6V7l9.6-2v10.4"/><circle cx="7" cy="17.8" r="2.2"/><circle cx="16.6" cy="15.4" r="2.2"/></svg>',
    memory: '<svg viewBox="0 0 24 24"><rect x="3.6" y="6" width="12.8" height="12.4" rx="2.6"/><path d="M8 3.6h9.4A2.6 2.6 0 0 1 20 6.2v9.6"/><path d="M6.4 14.6l3-3 3.4 3.4"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.6v2.2M12 18.2v2.2M4.8 12H7M17 12h2.2M6.9 6.9l1.6 1.6M15.5 15.5l1.6 1.6M17.1 6.9l-1.6 1.6M8.5 15.5l-1.6 1.6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.6" width="16" height="14.4" rx="2.6"/><path d="M8 3.4v4M16 3.4v4M4 10.2h16M8.4 14.2h2.4"/></svg>',
    profile: '<svg viewBox="0 0 24 24"><rect x="3.4" y="4.8" width="17.2" height="14.4" rx="3"/><circle cx="9.2" cy="10.6" r="2.1"/><path d="M6.1 16.4c.7-1.7 1.8-2.5 3.1-2.5s2.4.8 3.1 2.5"/><path d="M15 9.8h3.4M15 13.4h2.4"/></svg>'
  };

  var APP_LIST = [
    { key: "chat", label: "伴侣", icon: "chat" },
    { key: "profile", label: "档案", icon: "profile" },
    { key: "mood", label: "心情", icon: "mood" },
    { key: "schedule", label: "日程", icon: "schedule" },
    { key: "music", label: "音乐", icon: "music" },
    { key: "memory", label: "记忆", icon: "memory" },
    { key: "settings", label: "设置", icon: "gear" },
    /* 卡莉娅（Callia）AI 智能管家：独立页面入口，点击走 openKaliaPage()，
       不进入主应用路由，也不读写主聊天数据。 */
    { key: "kalia", label: "卡莉娅", icon: "kalia", onclick: "openKaliaPage()" }
  ];

  var current = "";
  var toastTimer = null;
  var islandTimer = null;
  var proactiveTimer = null;
  var callTimer = null;
  var callLineTimer = null;
  var callStart = 0;
  var lastActive = Date.now();

  /* ---------- 反馈 ---------- */
  function pingIsland() {
    var node = el("#island");
    if (!node) return;
    node.classList.add("is-ping");
    if (islandTimer) clearTimeout(islandTimer);
    islandTimer = setTimeout(function () {
      node.classList.remove("is-ping");
    }, 1300);
  }

  function toast(text) {
    var node = el("#toast");
    if (!node) return;
    node.textContent = text;
    node.classList.add("is-on");
    pingIsland();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove("is-on");
    }, 2200);
  }

  /* 震动只在用户真实交互后可用：页面刚加载、还没点过任何东西时
     Chromium 会拦截 navigator.vibrate 并在控制台报 Blocked call。
     先记下「用户是否已经交互过」，没交互就静默跳过。 */
  var userTouched = false;
  function markTouched() {
    userTouched = true;
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("pointerdown", markTouched, true);
    document.addEventListener("touchstart", markTouched, true);
    document.addEventListener("keydown", markTouched, true);
  }

  function haptic(ms) {
    if (!S.store.settings.haptic) return;
    if (!userTouched) return;
    try {
      if (global.navigator && typeof global.navigator.vibrate === "function") {
        global.navigator.vibrate(ms || 8);
      }
    } catch (err) {
      /* 设备不支持震动时静默降级 */
    }
  }

  /* ---------- 伴侣台词：只取接口生成结果，未连接时保持安静 ---------- */
  function speakLine(kind, onLine) {
    if (!S.api || typeof S.api.speak !== "function" || !S.api.ready()) return;
    if (S.api.busy()) return;
    S.api.speak(kind).then(function (res) {
      if (res && res.ok && res.text) onLine(res.text);
    });
  }

  /* ---------- 主题与动效 ---------- */
  function applyTheme() {
    var theme = S.store.settings.theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    var meta = el('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#191a1d" : "#e9eaec");
  }

  function applyMotion() {
    document.body.setAttribute("data-motion", S.store.settings.motion ? "on" : "off");
  }

  /* ---------- 状态栏与时段问候 ---------- */
  var battery = 78;

  function greetingText() {
    var h = new Date().getHours();
    var part = h < 5 ? "凌晨好" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
    var who = (S.store.settings && S.store.settings.user) || "你";
    return part + "，" + who;
  }

  function paintStatus() {
    var now = Date.now();
    var time = S.fmt.time(now);
    if (el("#sb-time")) el("#sb-time").textContent = time;
    if (el("#home-clock")) el("#home-clock").textContent = time;
    if (el("#lock-time")) el("#lock-time").textContent = time;
    if (el("#lock-date")) el("#lock-date").textContent = S.fmt.date(now);
    if (el("#home-date")) el("#home-date").textContent = S.fmt.dayStamp(now);
    if (el("#home-greeting")) el("#home-greeting").textContent = greetingText();
  }

  function paintBattery() {
    if (el("#sb-battery")) el("#sb-battery").textContent = battery + "%";
    if (el("#sb-battery-level")) el("#sb-battery-level").style.setProperty("--level", battery + "%");
  }

  /* ---------- 桌面 ---------- */
  /* 图标顺序：优先用存档里用户自己拖出来的顺序，新应用自动补到末尾 */
  function orderedApps() {
    var st = S.store.settings || {};
    var raw = Array.isArray(st.appOrder) ? st.appOrder : [];
    var out = [];
    raw.forEach(function (key) {
      if (out.indexOf(key) >= 0) return;
      for (var i = 0; i < APP_LIST.length; i += 1) {
        if (APP_LIST[i].key === key) {
          out.push(key);
          break;
        }
      }
    });
    APP_LIST.forEach(function (app) {
      if (out.indexOf(app.key) < 0) out.push(app.key);
    });
    return out
      .map(function (key) {
        for (var i = 0; i < APP_LIST.length; i += 1) {
          if (APP_LIST[i].key === key) return APP_LIST[i];
        }
        return null;
      })
      .filter(Boolean);
  }

  function renderAppGrid() {
    var grid = el("#appgrid");
    if (!grid) return;
    /* 排列模式下图标正在被逐个拖动，重建 innerHTML 会抹掉拖拽中间态 */
    if (window.CalliaLayout && typeof window.CalliaLayout.isEditing === "function" && window.CalliaLayout.isEditing()) return;
    /* 拖拽进行中同样不能重建：节点被替换后拖拽引用会指向已脱离文档的旧节点 */
    if (document.body.classList.contains("is-dragging")) return;
    grid.innerHTML = orderedApps().map(function (app) {
      var badge = app.key === "chat" ? S.unreadNotes().length : 0;
      /* 带 onclick 的条目（卡莉娅）直接绑自己的入口，不挂 data-open 路由 */
      var openAttr = app.onclick ? ' onclick="' + app.onclick + '"' : ' data-open="' + app.key + '"';
      var iconHtml = app.icon === "kalia" ? "C" : ICONS[app.icon] || "";
      return (
        '<button class="appgrid__item" type="button" data-app="' + app.key + '"' + openAttr + ">" +
        (badge ? '<span class="badge">' + badge + "</span>" : "") +
        '<i class="ico' + (app.icon === "kalia" ? " ico--kalia" : "") + '" data-icon="' + app.icon + '">' + iconHtml + "</i>" +
        "<span>" + app.label + "</span></button>"
      );
    }).join("");
    applyCustomIcons();
    /* 网格重建后把存档里的图标顺序写回去（拖拽排序的结果） */
    if (window.CalliaLayout && typeof window.CalliaLayout.applyApps === "function") {
      window.CalliaLayout.applyApps();
    }
  }

  /* ---------- 桌面九宫格 · 轻触图标自定义 ----------
     存储用最基础的 localStorage 键值对：icon_chat / icon_profile / icon_mood … */
  function customIconKey(key) {
    return "icon_" + key;
  }

  function readCustomIcon(key) {
    if (!key) return "";
    try {
      return global.localStorage.getItem(customIconKey(key)) || "";
    } catch (err) {
      return "";
    }
  }

  function saveCustomIcon(key, value) {
    try {
      if (value) global.localStorage.setItem(customIconKey(key), value);
      else global.localStorage.removeItem(customIconKey(key));
    } catch (err) {
      /* 隐私模式下存不下，就只在本次生效 */
    }
  }

  function isImageUrl(value) {
    return value.indexOf("http://") === 0 || value.indexOf("https://") === 0;
  }

  /* 链接→ innerHTML 覆盖为 <img>，普通文字→直接当 Emoji 显示 */
  function paintCustomIcon(node, value) {
    if (!node || !value) return;
    if (isImageUrl(value)) node.innerHTML = '<img src="' + S.esc(value) + '" alt="">';
    else node.textContent = value;
    node.classList.add("is-custom");
  }

  /* 网格每次重建后回显自定义图标（初始化时 renderAppGrid 也会走到这里） */
  function applyCustomIcons() {
    S.els("#appgrid .appgrid__item").forEach(function (item) {
      var value = readCustomIcon(item.getAttribute("data-app"));
      if (value) paintCustomIcon(item.querySelector(".ico"), value);
    });
  }

  /* 恢复默认：把图标位重新填回内置 SVG */
  function resetCustomIcon(node) {
    if (!node) return;
    node.classList.remove("is-custom");
    node.innerHTML = ICONS[node.getAttribute("data-icon")] || "";
  }

  /* 原生 prompt 弹窗已按要求删除：轻触图标不再弹浏览器输入框，一律照常打开应用。
     历史自定义图标仍由 applyCustomIcons() 从 localStorage 回显，不影响任何渲染逻辑。 */

  function paintIcons() {
    S.els(".ico[data-icon]").forEach(function (node) {
      var key = node.getAttribute("data-icon");
      if (ICONS[key] && !node.innerHTML) node.innerHTML = ICONS[key];
    });
    S.els(".dock__item .ico").forEach(function (node) {
      var cls = node.className.split("--")[1] || "";
      if (ICONS[cls] && !node.innerHTML) node.innerHTML = ICONS[cls];
    });
  }

  function refreshHome() {
    var c = S.store.companion;
    var m = S.mood();
    if (el("#home-name")) el("#home-name").textContent = c.name;
    if (el("#home-mood")) el("#home-mood").textContent = m.label;
    /* 亲密度与等级：每 100 点一级、520 级封顶；进度条只显示当前等级内的进度 */
    var lv = S.levelProgress(c.affinity);
    if (el("#home-affinity")) el("#home-affinity").textContent = lv.points;
    if (el("#home-affinity-max")) el("#home-affinity-max").textContent = lv.maxAffinity;
    if (el("#home-level")) el("#home-level").textContent = lv.level;
    if (el("#home-level-max")) el("#home-level-max").textContent = lv.maxLevel;
    if (el("#home-affinity-bar")) el("#home-affinity-bar").style.width = lv.percent + "%";
    /* 心跳同步：亲密度每净增 50 点触发一次庆祝特效（判定与特效都在 heartbeat.js） */
    if (S.heartbeat && typeof S.heartbeat.sync === "function") S.heartbeat.sync(c.affinity);
    if (el("#home-mood-dial")) {
      el("#home-mood-dial").querySelector("i").style.transform =
        "rotate(" + Math.round(-90 + (c.moodValue / 100) * 180) + "deg) translateY(-9px)";
    }
    if (el("#home-orb")) {
      var hasAvatar = !!(S.avatar && S.avatar.isActive());
      el("#home-orb").className = "orb orb--hero orb--" + m.orb + (hasAvatar ? " has-avatar" : "");
    }
    if (S.avatar) S.avatar.paint();
    if (el("#lock-name")) el("#lock-name").textContent = c.name;
    if (el("#lock-mood")) el("#lock-mood").textContent = m.label + " · " + m.line;
    if (el("#call-name")) el("#call-name").textContent = c.name;

    renderAppGrid();
    paintIcons();
    renderLockNotes();
    renderToday();
    renderLive();
    if (S.widgets) S.widgets.refresh();
    if (S.homeWidgets && typeof S.homeWidgets.refresh === "function") S.homeWidgets.refresh();
  }

  /* ---------- 桌面 · 伴侣此刻 ----------
     第一屏的「此刻动态条」已移除，这里保留容错：节点不存在时直接返回 */
  function renderLive() {
    var text = el("#live-text");
    var meta = el("#live-meta");
    if (!text || !meta) return;
    var line = "";
    var stamp = "";
    if (S.presence && typeof S.presence.activityLine === "function") {
      line = S.presence.activityLine();
      if (typeof S.presence.activity === "function") {
        var act = S.presence.activity();
        stamp = act && act.label ? act.label : "";
      }
    }
    text.textContent = line || "TA 想把此刻留给自己 · 轻触看档案";
    meta.textContent = line ? stamp || "此刻" : "档案";
  }

  function renderLockNotes() {
    var box = el("#lock-notifs");
    if (!box) return;
    var list = S.unreadNotes().slice(0, 2);
    box.innerHTML = list
      .map(function (n) {
        return (
          '<div class="locknote"><div><b>' + S.esc(n.title) + "</b><p>" + S.esc(n.text) + "</p></div><span>" +
          S.fmt.ago(n.ts) + "</span></div>"
        );
      })
      .join("");
  }

  /* ---------- 第二屏 · 此刻 ---------- */
  function renderToday() {
    var tasks = S.store.tasks || [];
    var done = tasks.filter(function (t) {
      return t.done;
    }).length;
    var pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

    if (el('#today-bar')) el('#today-bar').style.width = pct + '%';
    if (el('#today-meta')) {
      el('#today-meta').textContent = tasks.length
        ? '已完成 ' + done + ' / ' + tasks.length + ' 项 · ' + pct + '%'
        : '今天还没有安排';
    }
    if (el('#today-sum')) {
      el('#today-sum').textContent = tasks.length ? done + ' / ' + tasks.length : '空';
    }

    var list = el('#today-list');
    if (list) {
      if (!tasks.length) {
        list.innerHTML = '<p class="today__empty">还没有安排，去日程里写一件小事。</p>';
      } else {
        list.innerHTML = tasks
          .slice(0, 3)
          .map(function (t) {
            return (
              '<button class="today__task' + (t.done ? ' is-done' : '') + '" type="button" data-open="schedule">' +
              '<i class="today__check" aria-hidden="true"></i>' +
              '<span class="today__task-main">' +
              '<span class="today__task-title">' + S.esc(t.title) + '</span>' +
              '<span class="today__task-meta">' + S.esc(t.meta || '安排') + '</span>' +
              '</span></button>'
            );
          })
          .join('');
      }
    }

    var track = S.TRACKS[S.store.music.index] || S.TRACKS[0];
    var playing = !!S.store.music.playing;
    if (el('#now-title')) el('#now-title').textContent = track.title;
    if (el('#now-artist')) el('#now-artist').textContent = track.artist;
    if (el('#now-status')) el('#now-status').textContent = playing ? '播放中 · 界面模拟' : '已暂停 · 界面模拟';
    if (el('#widget-now')) el('#widget-now').classList.toggle('is-playing', playing);
    if (el('#now-disc')) el('#now-disc').classList.toggle('is-spin', playing);

    var bars = el('#now-bars');
    if (bars && !bars.children.length) {
      var html = '';
      for (var i = 0; i < 9; i += 1) {
        html += '<i style="animation-delay:' + (i * 0.09).toFixed(2) + 's"></i>';
      }
      bars.innerHTML = html;
    }

    var hist = S.store.stats.moodHistory || [];
    var spark = el('#today-spark');
    if (spark) {
      spark.innerHTML = hist
        .map(function (v, idx) {
          var h = Math.max(14, Math.min(100, Math.round(v)));
          return '<i class="' + (idx === hist.length - 1 ? 'is-now' : '') + '" style="height:' + h + '%"></i>';
        })
        .join('');
    }
    if (el('#today-mood-value')) el('#today-mood-value').textContent = S.store.companion.moodValue;

    var mem = (S.store.memories || [])[0];
    if (el('#mem-date')) el('#mem-date').textContent = mem ? mem.date || '最近' : '还没有记忆';
    if (el('#mem-title')) el('#mem-title').textContent = mem ? mem.title : '空白胶片';
    if (el('#mem-text')) {
      el('#mem-text').textContent = mem
        ? mem.text
        : '伴侣会在你们经历一些事情之后，把它们洗成胶片。';
    }
  }

  /* ---------- 双主屏横向轮播 ---------- */
  var pager = {
    index: 0,
    count: 1,
    wrap: null,
    track: null,
    id: null,
    axis: '',
    startX: 0,
    startY: 0,
    dx: 0,
    lastX: 0,
    lastT: 0,
    v: 0,
    moved: false
  };
  var suppressClick = false;

  function pagerW() {
    return pager.wrap ? pager.wrap.clientWidth : 0;
  }

  /* 轮播轨道宽度必须等于「屏数 × 单屏宽」：
     .home__track 是 flex 容器，如果它只有容器宽，
     第二屏及之后的所有屏会被挤到容器右侧外面（被 overflow:hidden 裁掉），
     首屏里的按钮也会跟着被算成「超出视口」。
     这里在每次定位前把轨道宽度写实，保证每屏正好占满一屏宽。 */
  function pagerFit() {
    if (!pager.track) return 0;
    var w = pagerW();
    if (!w) return 0;
    var count = Math.max(1, pager.count || 1);
    pager.track.style.width = w * count + 'px';
    /* 每屏显式钉成一屏宽：flex-basis 在部分内核里会被内容撑开，
       导致第二屏的图标与卡片被推到视口外 */
    S.els('.home__page', pager.track).forEach(function (page) {
      page.style.flex = '0 0 ' + w + 'px';
      page.style.width = w + 'px';
      page.style.maxWidth = w + 'px';
    });
    /* 非当前屏整体移出可视区：只靠轨道位移时，
       部分内核仍会把相邻屏里的按钮算进视口判定，
       这里给非当前屏加 visibility:hidden，当前屏保持可见 */
    S.els('.home__page', pager.track).forEach(function (page, i) {
      page.style.visibility = i === pager.index ? 'visible' : 'hidden';
    });
    return w;
  }

  function pagerMove(x, animate) {
    if (!pager.track) return;
    pager.track.style.transition = animate ? 'transform 0.44s var(--ease)' : 'none';
    pager.track.style.transform = 'translate3d(' + Math.round(x) + 'px,0,0)';
  }

  function pagerPaint() {
    S.els('.pager__dot').forEach(function (dot, i) {
      var active = i === pager.index;
      dot.classList.toggle('is-on', active);
      dot.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    S.els('.home__page').forEach(function (page, i) {
      var active = i === pager.index;
      page.classList.toggle('is-active', active);
      /* 只有当前屏参与命中与视口判定，避免相邻屏的按钮被当成越界元素 */
      page.style.visibility = active ? 'visible' : 'hidden';
      page.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    /* 切屏后通知布局层：自由层尺寸变了，自由固定的图标要重新换算坐标 */
    try {
      document.dispatchEvent(new CustomEvent('callia:pagechange', { detail: { index: pager.index } }));
    } catch (err) {
      /* 老内核不支持 CustomEvent 构造时忽略，resize 仍会兜底 */
    }
  }

  function goPage(index, animate) {
    var next = S.clamp(index, 0, pager.count - 1);
    if (next !== pager.index) haptic(6);
    pager.index = next;
    pagerMove(-next * pagerW(), animate !== false);
    pagerPaint();
  }

  function syncPager(animate) {
    if (!pager.track) return;
    pager.count = Math.max(1, S.els('.home__page').length);
    if (pager.index > pager.count - 1) pager.index = pager.count - 1;
    pagerFit();
    pagerMove(-pager.index * pagerW(), animate === true);
    pagerPaint();
  }

  /* 桌面排列模式（图标与小组件正在逐个拖动）里，轮播必须让出这次手势 */
  function homeEditing() {
    return document.body.getAttribute('data-editing') === '1';
  }

  /* 长按图标转成网格内拖拽时，body 会挂 is-dragging：轮播同样立刻放手 */
  function homeDragging() {
    return document.body.classList.contains('is-dragging');
  }

  /* 布局层（homeLayout.js）在长按/拖拽期间会置位，作为第二道保险 */
  function layoutBusy() {
    var L = window.CalliaLayout;
    if (!L) return false;
    try {
      if (typeof L.isDragging === 'function' && L.isDragging()) return true;
      if (typeof L.isEditing === 'function' && L.isEditing()) return true;
    } catch (err) {
      return false;
    }
    return false;
  }

  function pagerYield() {
    return homeEditing() || homeDragging() || layoutBusy();
  }

  /* 手势起点落在图标/小组件上时，轮播不抢：长按拖拽优先 */
  function fromDraggable(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('.appgrid__item, [data-drag], .widget, .bento__cell');
  }

  function bindPager() {
    pager.wrap = el('#home-carousel');
    pager.track = el('#home-track');
    if (!pager.wrap || !pager.track) return;
    pager.count = Math.max(1, S.els('.home__page').length);
    pagerFit();

    /* 触摸轻扫与鼠标拖拽共用 pointer 事件。
       注意：这里不能 preventDefault，否则会打断图标的长按拖拽；
       横向位移超过阈值才接管为切屏，纵向手势直接放手给页面滚动。 */
    on(pager.wrap, 'pointerdown', function (ev) {
      if (document.body.getAttribute('data-view') !== 'home') return;
      if (pagerYield()) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      /* 从图标上按下：先让长按拖拽有机会接管，轮播只记录不接管 */
      pager.fromItem = fromDraggable(ev.target);
      pager.id = ev.pointerId;
      pager.axis = '';
      pager.moved = false;
      pager.dx = 0;
      pager.v = 0;
      pager.startX = ev.clientX;
      pager.startY = ev.clientY;
      pager.lastX = ev.clientX;
      pager.lastT = Date.now();
    });

    on(global, 'pointermove', function (ev) {
      if (pager.id === null || ev.pointerId !== pager.id) return;
      /* 长按已进入排列模式或图标正在网格内拖拽：这次触摸交给图标，轮播立刻放手 */
      if (pagerYield()) {
        pager.id = null;
        pager.axis = '';
        return;
      }
      var dx = ev.clientX - pager.startX;
      var dy = ev.clientY - pager.startY;

      if (!pager.axis) {
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
        if (Math.abs(dx) <= Math.abs(dy)) {
          pager.id = null;
          return;
        }
        /* 起点在图标上且位移还很小：留给长按拖拽，轮播放手 */
        if (pager.fromItem && Math.abs(dx) < 14) {
          pager.id = null;
          return;
        }
        /* 横向轻扫：接管手势，阻止页面跟着横向拖动 */
        pager.axis = 'x';
        pager.moved = true;
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
      }

      var now = Date.now();
      var dt = Math.max(8, now - pager.lastT);
      pager.v = (ev.clientX - pager.lastX) / dt;
      pager.lastX = ev.clientX;
      pager.lastT = now;
      pager.dx = dx;

      var w = pagerW() || 1;
      var x = -pager.index * w + dx;
      if (pager.index === 0 && dx > 0) x = dx * 0.3;
      else if (pager.index === pager.count - 1 && dx < 0) x = -(pager.count - 1) * w + dx * 0.3;
      pagerMove(x, false);
    });

    var release = function (ev) {
      if (pager.id === null) return;
      if (ev && typeof ev.pointerId !== 'undefined' && ev.pointerId !== pager.id) return;
      if (pagerYield()) {
        pager.id = null;
        pager.axis = '';
        return;
      }
      var wasDrag = pager.moved;
      pager.id = null;
      pager.axis = '';
      pager.fromItem = false;
      if (!wasDrag) return;

      var w = pagerW() || 1;
      var predict = pager.dx + pager.v * 120;
      var target = pager.index;
      if (predict < -w * 0.22) target = pager.index + 1;
      else if (predict > w * 0.22) target = pager.index - 1;

      if (Math.abs(pager.dx) > 8) {
        suppressClick = true;
        setTimeout(function () {
          suppressClick = false;
        }, 300);
      }
      goPage(target, true);
    };

    on(global, 'pointerup', release);
    on(global, 'pointercancel', release);

    on(global, 'resize', function () {
      pagerFit();
      pagerMove(-pager.index * pagerW(), false);
      pagerPaint();
    });

    /* 屏幕旋转 / 软键盘收起后尺寸会变，轨道与每屏宽度都要重算 */
    on(global, 'orientationchange', function () {
      global.setTimeout(function () {
        pagerFit();
        pagerMove(-pager.index * pagerW(), false);
      }, 120);
    });

    /* 分页点由 homePages.js 动态重建，用事件委托才能一直可点 */
    on(el('#home-dots'), 'click', function (ev) {
      var dot = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('.pager__dot') : null;
      if (!dot) return;
      goPage(parseInt(dot.getAttribute('data-page'), 10) || 0, true);
    });

    /* 布局层拖拽开始/结束：轮播立刻放手，结束后重新对齐轨道 */
    document.addEventListener('callia:dragstart', function () {
      pager.id = null;
      pager.axis = '';
      pager.fromItem = false;
    });
    document.addEventListener('callia:dragend', function () {
      pager.id = null;
      pager.axis = '';
      pager.fromItem = false;
      pagerFit();
      pagerMove(-pager.index * pagerW(), false);
    });
  }

  /* ---------- 底部导航栏（Dock）的条件渲染 ---------- */
  /* 路由状态由 body[data-view] 表示：boot / lock / home / app / notif / call。
     悬浮导航栏只在桌面出现，进入任何应用（含与伴侣的聊天页）时必须收起。 */
  function syncDock() {
    var dock = el("#dock");
    if (!dock) return;
    dock.hidden = document.body.getAttribute("data-view") !== "home";
  }

  /* ---------- 路由 ---------- */
  function openApp(key) {
    var app = S.apps[key];
    if (!app) {
      toast("应用暂未开放");
      return;
    }
    if (current && S.apps[current] && S.apps[current].teardown) S.apps[current].teardown();

    current = key;
    var layer = el("#app-layer");
    var root = el("#app-root");
    layer.hidden = false;
    layer.classList.remove("is-out");
    root.innerHTML = "";
    try {
      app.render(root);
    } catch (err) {
      root.innerHTML =
        '<header class="app-head"><button class="app-head__back" id="app-back" type="button" aria-label="返回桌面"></button>' +
        '<div class="app-head__title"><p>出错了</p><p>这个应用没能打开</p></div></header>' +
        '<div class="app-body"><div class="empty"><i aria-hidden="true"></i><p>界面渲染失败</p><p>返回桌面后再试一次。</p></div></div>';
      S.ui.bindBack(root);
      toast("应用打开失败");
    }

    var meta = APP_LIST.filter(function (a) { return a.key === key; })[0];
    if (el("#sb-label")) el("#sb-label").textContent = meta ? meta.label : "App";
    S.els(".dock__item").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-open") === key);
    });
    document.body.setAttribute("data-view", "app");
    syncDock();
    lastActive = Date.now();
    haptic(6);
  }

  function home() {
    if (current && S.apps[current] && S.apps[current].teardown) S.apps[current].teardown();
    current = "";
    var layer = el("#app-layer");
    if (!layer.hidden) {
      layer.classList.add("is-out");
      setTimeout(function () {
        layer.hidden = true;
        layer.classList.remove("is-out");
        el("#app-root").innerHTML = "";
      }, 200);
    }
    if (el("#sb-label")) el("#sb-label").textContent = "Callia OS";
    S.els(".dock__item").forEach(function (btn) {
      btn.classList.remove("is-active");
    });
    document.body.setAttribute("data-view", "home");
    syncDock();
    refreshHome();
    paintStatus();
    syncPager();
  }

  /* 系统返回：先交给当前应用的内页（例如设置 · 接口内页），
     应用不接管时才真正退回桌面。 */
  function appBack() {
    var layer = el("#app-layer");
    if (!layer || layer.hidden || !current) return false;
    var app = S.apps[current];
    if (!app || typeof app.onBack !== "function") return false;
    try {
      return !!app.onBack();
    } catch (err) {
      /* 内页返回失败时不卡住手势，交给默认返回桌面 */
      return false;
    }
  }

  /* ---------- 通知中心 ---------- */
  function renderNotes() {
    var list = el("#notif-list");
    if (!list) return;
    if (!S.store.notes.length) {
      list.innerHTML = '<div class="empty"><i aria-hidden="true"></i><p>没有新通知</p><p>伴侣想到事情的时候会先写在这里。</p></div>';
      return;
    }
    list.innerHTML = S.store.notes
      .map(function (n) {
        return (
          '<button class="note" type="button" data-note="' + n.id + '"><span class="note__top"><b>' +
          S.esc(n.title) + "</b><span>" + S.fmt.ago(n.ts) + '</span></span><span class="note__text">' + S.esc(n.text) + "</span></button>"
        );
      })
      .join("");
  }

  function openNotes() {
    renderNotes();
    el("#notif-center").hidden = false;
    document.body.setAttribute("data-view", "notif");
  }

  function closeNotes() {
    el("#notif-center").hidden = true;
    document.body.setAttribute("data-view", current ? "app" : "home");
    syncDock();
    refreshHome();
  }

  /* ---------- 语音陪伴 ---------- */
  function openCall() {
    var wave = el("#call-wave");
    if (wave && !wave.children.length) {
      var html = "";
      for (var i = 0; i < 18; i += 1) {
        html += '<i style="animation-delay:' + (i * 0.07).toFixed(2) + 's"></i>';
      }
      wave.innerHTML = html;
    }
    callStart = Date.now();
    el("#call-overlay").hidden = false;
    el("#call-timer").textContent = "00:00";
    document.body.setAttribute("data-view", "call");

    if (S.api && S.api.ready()) speakLine("call_open", toast);
    else toast("接口未连接 · 伴侣现在只会安静陪着");

    callTimer = setInterval(function () {
      el("#call-timer").textContent = S.fmt.mmss((Date.now() - callStart) / 1000);
    }, 500);

    callLineTimer = setInterval(function () {
      speakLine("call_idle", toast);
    }, 9000);
    haptic(12);
  }

  function closeCall() {
    var secs = Math.round((Date.now() - callStart) / 1000);
    if (callTimer) clearInterval(callTimer);
    if (callLineTimer) clearInterval(callLineTimer);
    callTimer = null;
    callLineTimer = null;
    el("#call-overlay").hidden = true;
    document.body.setAttribute("data-view", current ? "app" : "home");
    syncDock();
    if (secs > 3) {
      S.addAffinity(2);
      S.shiftMood(3);
      S.pushNote(S.store.companion.name, "语音陪伴 " + S.fmt.mmss(secs) + " 结束，我把这段安静存下来了。");
      toast("语音陪伴 " + S.fmt.mmss(secs) + " · 亲密度 +2");
    }
    refreshHome();
  }

  /* ---------- 主动消息 ---------- */
  function scheduleProactive() {
    if (proactiveTimer) clearInterval(proactiveTimer);
    if (!S.store.settings.proactive) return;
    proactiveTimer = setInterval(function () {
      if (document.body.getAttribute("data-view") === "boot") return;
      if (Date.now() - lastActive < 60000) return;
      speakLine("proactive", function (line) {
        S.pushNote(S.store.companion.name, line);
        /* 主动消息也是一条正常的伴侣发言：先入库（pushMsg 会把 role 规范成 ai），
           再交给聊天页的统一渲染入口。以前这里手写了一段内联 HTML，
           既没有头像也没有 .msg__stack，时间还落在气泡外面，
           在聊天页底部就变成一块无头像无时间的白块。 */
        var msg = S.pushMsg("ai", line);
        if (current === "chat" && S.apps && S.apps.chat && typeof S.apps.chat.renderMessage === "function") {
          S.apps.chat.renderMessage(msg);
        }
        toast("伴侣发来一条消息");
        refreshHome();
      });
    }, 75000);
  }

  /* ---------- 启动与锁屏 ---------- */
  function boot() {
    var bar = el("#boot-bar");
    var pct = 0;
    var step = setInterval(function () {
      pct = Math.min(100, pct + 12 + Math.random() * 16);
      if (bar) bar.style.width = pct + "%";
      if (pct >= 100) {
        clearInterval(step);
        setTimeout(showLock, 320);
      }
    }, 220);
  }

  function showLock() {
    var bootNode = el("#boot");
    bootNode.classList.add("is-out");
    setTimeout(function () {
      bootNode.hidden = true;
    }, 480);
    el("#lock").hidden = false;
    document.body.setAttribute("data-view", "lock");
    refreshHome();
    paintStatus();
  }

  function unlock() {
    var lock = el("#lock");
    if (lock.hidden) return;
    lock.classList.add("is-out");
    setTimeout(function () {
      lock.hidden = true;
    }, 320);
    el("#home").hidden = false;
    document.body.setAttribute("data-view", "home");
    syncDock();
    refreshHome();
    paintStatus();
    syncPager();
    haptic(10);
    /* 离线梦境日记：进主页时算一下离开多久，超两小时才生成 */
    if (S.diary && typeof S.diary.checkOnHome === "function") S.diary.checkOnHome();
    if (S.store.stats.openedAt && Date.now() - S.store.stats.openedAt > 6 * 3600000) {
      setTimeout(function () {
        speakLine("greeting", toast);
      }, 700);
    }
  }

  /* ---------- 手势 ---------- */
  function swipe(node, up, down) {
    if (!node) return;
    var startY = 0;
    var tracking = false;
    on(
      node,
      "touchstart",
      function (ev) {
        startY = ev.touches[0].clientY;
        tracking = true;
      },
      { passive: true }
    );
    on(
      node,
      "touchend",
      function (ev) {
        if (!tracking) return;
        tracking = false;
        var dy = (ev.changedTouches[0] ? ev.changedTouches[0].clientY : startY) - startY;
        if (dy < -46 && up) up();
        if (dy > 46 && down) down();
      },
      { passive: true }
    );
  }

  /* ---------- 事件绑定 ---------- */
  function bindGlobal() {
    document.addEventListener(
      "click",
      function (ev) {
        lastActive = Date.now();
        if (suppressClick) {
          suppressClick = false;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        var open = ev.target.closest("[data-open]");
        if (open) {
          openApp(open.getAttribute("data-open"));
          return;
        }
        var action = ev.target.closest("[data-action]");
        if (!action) return;
        var act = action.getAttribute("data-action");
        if (act === "call") openCall();
        else if (act === "avatar" && S.avatar) S.avatar.open();
      },
      true
    );

    on(el("#unlock"), "click", unlock);
    swipe(el("#lock"), unlock, null);

    on(el("#homebar"), "click", function () {
      if (!el("#call-overlay").hidden) return;
      if (!el("#notif-center").hidden) {
        closeNotes();
        return;
      }
      if (appBack()) return;
      home();
    });
    swipe(el("#homebar"), function () {
      if (!el("#notif-center").hidden) {
        closeNotes();
        return;
      }
      if (appBack()) return;
      home();
    }, null);

    on(el("#sb-left"), "click", function () {
      if (el("#notif-center").hidden) openNotes();
      else closeNotes();
    });
    on(el("#notif-mask"), "click", closeNotes);
    on(el("#notif-clear"), "click", function () {
      S.store.notes = [];
      S.save();
      renderNotes();
      toast("通知已清空");
    });
    on(el("#notif-list"), "click", function (ev) {
      var note = ev.target.closest("[data-note]");
      if (!note) return;
      var id = note.getAttribute("data-note");
      S.store.notes.forEach(function (n) {
        if (n.id === id) n.read = true;
      });
      S.save();
      openApp("chat");
      closeNotes();
    });
    swipe(el("#statusbar"), null, function () {
      if (el("#notif-center").hidden) openNotes();
    });

    on(el("#call-end"), "click", closeCall);

    on(global, "visibilitychange", function () {
      if (document.hidden) S.save();
    });
    on(global, "pagehide", function () {
      S.save();
    });

    global.addEventListener("error", function () {
      toast("出现了一点小问题，已为你保住数据");
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    applyTheme();
    applyMotion();
    paintIcons();
    renderAppGrid();
    refreshHome();
    paintStatus();
    paintBattery();
    bindPager();
    bindGlobal();
    if (S.presence && typeof S.presence.start === "function") S.presence.start();
    boot();

    setInterval(paintStatus, 1000);
    setInterval(renderLive, 60000);
    setInterval(function () {
      battery = Math.max(18, battery - 1);
      paintBattery();
    }, 90000);
    scheduleProactive();
  }

  S.os = {
    toast: toast,
    haptic: haptic,
    applyTheme: applyTheme,
    applyMotion: applyMotion,
    refreshHome: refreshHome,
    openApp: openApp,
    home: home,
    openCall: openCall,
    scheduleProactive: scheduleProactive,
    unlock: unlock,
    goPage: goPage,
    syncPager: syncPager,
    appList: APP_LIST
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);