/* =================================================================
   Callia OS · homeWidgets.js
   主屏小组件：注册表、添加/移除、数据同步与就地小折叠组件库
   ================================================================= */
(function (global) {
  "use strict";

  var S = global.COS;
  var FIRST_PAGE = "#home .home__page--first";

  /* 组件库就地按屏展开：一个组件只待在一屏，内置两屏的名字写在这里 */
  var PAGE_LABEL = { first: "伴侣屏", life: "生活屏" };

  /* ---------- 小工具 ---------- */
  function el(sel, root) {
    return (root || document).querySelector(sel);
  }

  function els(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function on(node, type, fn, opt) {
    if (node) node.addEventListener(type, fn, opt || false);
  }

  function settings() {
    return S && S.store && S.store.settings ? S.store.settings : null;
  }

  function store() {
    return S && S.store ? S.store : null;
  }

  function layout() {
    return global.CalliaLayout;
  }

  /* 就地折叠、屏幕清单与宿主容器都由 homePages 提供 */
  function pages() {
    return global.CalliaPages;
  }

  function esc(value) {
    var text = String(value === undefined || value === null ? "" : value);
    if (S && typeof S.esc === "function") return S.esc(text);
    return text
      .split("&")
      .join("&amp;")
      .split("<")
      .join("&lt;")
      .split(">")
      .join("&gt;")
      .split('"')
      .join("&quot;");
  }

  function toast(text) {
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast(text);
      return;
    }
    var node = document.getElementById("toast");
    if (!node) return;
    node.textContent = text;
    node.classList.add("is-on");
    global.setTimeout(function () {
      node.classList.remove("is-on");
    }, 2000);
  }

  /* 相对时间：state.js 的 fmt 不保证导出 ago()，本地兜一份 */
  function ago(ts) {
    if (!ts) return "最近";
    var gap = Date.now() - ts;
    if (gap < 0) return "刚刚";
    if (gap < 60000) return "刚刚";
    if (gap < 3600000) return Math.max(1, Math.round(gap / 60000)) + " 分钟前";
    if (gap < 86400000) return Math.round(gap / 3600000) + " 小时前";
    return Math.round(gap / 86400000) + " 天前";
  }

  function buzz(ms) {
    if (S && S.os && typeof S.os.haptic === "function") {
      S.os.haptic(ms || 10);
      return;
    }
    try {
      if (global.navigator && typeof global.navigator.vibrate === "function") global.navigator.vibrate(ms || 10);
    } catch (err) {
      /* 轻震不可用时静默 */
    }
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function clampPct(v) {
    return Math.max(0, Math.min(100, Math.round(num(v, 0))));
  }

  function pick(root, role) {
    return root ? el('[data-role="' + role + '"]', root) : null;
  }

  function text(root, role, value) {
    var node = pick(root, role);
    if (node) node.textContent = value;
  }

  /* 动态节点上的 data-open 未必被全局监听接住，这里走三重降级 */
  function openApp(key) {
    if (!key) return false;
    if (S && S.os) {
      if (typeof S.os.open === "function") {
        S.os.open(key);
        return true;
      }
      if (typeof S.os.openApp === "function") {
        S.os.openApp(key);
        return true;
      }
    }
    var probe = document.querySelector('[data-open="' + key + '"]');
    if (probe && typeof probe.click === "function") {
      probe.click();
      return true;
    }
    toast("这个入口还没准备好");
    return false;
  }

  /* ---------- 小组件外壳 ---------- */
  function shell(cfg) {
    var root = document.createElement("section");
    root.className = "card wgt";
    root.setAttribute("data-widget", cfg.id);
    if (cfg.open) root.setAttribute("data-wgt-open", cfg.open);
    root.innerHTML =
      '<header class="wgt__head">' +
      '<span class="wgt__label">' + cfg.label + "</span>" +
      '<span class="wgt__tag" data-role="tag"></span>' +
      "</header>" +
      cfg.body +
      '<button class="wgt__rm" type="button" data-wgt-rm="' + cfg.id +
      '" aria-label="从桌面移除' + cfg.label + '小组件">✕</button>';
    return root;
  }

  /* ---------- 各小组件的数据同步 ---------- */
  function syncMood(root) {
    var s = store();
    var history = s && s.stats && Array.isArray(s.stats.moodHistory) ? s.stats.moodHistory.slice(-7) : [];
    var mood = S && typeof S.mood === "function" ? S.mood() : null;
    var value =
      mood && mood.value !== undefined
        ? mood.value
        : s && s.companion
          ? s.companion.moodValue
          : 0;
    text(root, "tag", (mood && mood.label ? mood.label : "心情") + " · " + clampPct(value));
    var bars = pick(root, "bars");
    if (!bars) return;
    if (!history.length) history = [62, 62, 62, 62, 62, 62, 62];
    bars.innerHTML = history
      .map(function (v) {
        return '<i style="height:' + Math.max(16, clampPct(v)) + '%"></i>';
      })
      .join("");
  }

  function syncNote(root) {
    var s = store();
    var notes = s && Array.isArray(s.notes) ? s.notes : [];
    var latest = notes[0] || null;
    var unread = S && typeof S.unreadNotes === "function" ? S.unreadNotes().length : 0;
    text(root, "tag", unread ? unread + " 条未读" : "都读过了");
    text(root, "title", latest ? latest.title || "TA 的留言" : "还没有留言");
    text(root, "text", latest ? latest.text || "" : "你说的话，TA 会挑一句留在这里。");
    text(root, "meta", latest ? ago(latest.ts) : "随时都在");
  }

  function syncToday(root) {
    var s = store();
    var tasks = s && Array.isArray(s.tasks) ? s.tasks : [];
    var done = 0;
    var next = null;
    tasks.forEach(function (task) {
      if (!task) return;
      if (task.done) done += 1;
      else if (!next) next = task;
    });
    var total = tasks.length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    var bar = pick(root, "bar");
    if (bar) bar.style.width = pct + "%";
    text(root, "tag", done + " / " + total);
    text(root, "next", next ? next.title || "还有一件事" : "今天的都完成了");
    text(root, "meta", next && next.meta ? next.meta : "今日安排 " + total + " 件");
  }

  function syncLife(root) {
    var s = store();
    if (!s) return;
    var c = s.companion || {};
    var p = s.presence || {};
    var streak = Math.max(0, Math.round(num(p.streak, 1)));
    text(root, "tag", "Lv." + (Math.round(num(c.level, 0)) || 0));
    text(root, "line", c.status || "一直在你旁边");
    text(root, "meta", "亲密度 " + Math.round(num(c.affinity, 0)) + " · 连续陪伴 " + streak + " 天");
  }

  function syncMusic(root) {
    var s = store();
    var tracks = S && Array.isArray(S.TRACKS) ? S.TRACKS : [];
    var idx = Math.max(0, Math.min(tracks.length - 1, Math.round(num(s && s.music ? s.music.index : 0, 0))));
    var track = tracks[idx] || { title: "还没有在放的歌", artist: "轻触去挑一首" };
    var playing = !!(s && s.music && s.music.playing);
    text(root, "tag", playing ? "正在播放" : "已暂停");
    text(root, "title", track.title);
    text(root, "meta", track.artist || "LUMEN");
    var dot = pick(root, "dot");
    if (dot) dot.className = "wgt__dot" + (playing ? " is-on" : "");
  }

  /* ---------- 注册表：id 必须与 homeLayout 的 DEFAULTS.first 对应 ---------- */
  var REGISTRY = [
    {
      id: "live",
      label: "此刻动态",
      desc: "TA 正在做什么的一行提示",
      isStatic: true
    },
    {
      id: "w-mood",
      label: "心情趋势",
      desc: "最近七次心情起伏",
      open: "mood",
      body: '<div class="wgt__bars" data-role="bars" aria-hidden="true"></div>',
      build: function () {
        return shell({ id: "w-mood", label: "心情趋势", open: "mood", body: this.body });
      },
      sync: syncMood
    },
    {
      id: "w-note",
      label: "TA 的留言",
      desc: "最新一条留言与未读数",
      open: "chat",
      body:
        '<p class="wgt__title" data-role="title"></p>' +
        '<p class="wgt__text" data-role="text"></p>' +
        '<p class="wgt__meta" data-role="meta"></p>',
      build: function () {
        return shell({ id: "w-note", label: "TA 的留言", open: "chat", body: this.body });
      },
      sync: syncNote
    },
    {
      id: "w-today",
      label: "今日进度",
      desc: "安排完成了多少，下一件是什么",
      open: "schedule",
      body:
        '<div class="wgt__track"><i data-role="bar"></i></div>' +
        '<p class="wgt__title" data-role="next"></p>' +
        '<p class="wgt__meta" data-role="meta"></p>',
      build: function () {
        return shell({ id: "w-today", label: "今日进度", open: "schedule", body: this.body });
      },
      sync: syncToday
    },
    {
      id: "w-life",
      label: "伴侣状态",
      desc: "等级、亲密度与连续陪伴天数",
      open: "profile",
      body:
        '<p class="wgt__title" data-role="line"></p>' +
        '<p class="wgt__meta" data-role="meta"></p>',
      build: function () {
        return shell({ id: "w-life", label: "伴侣状态", open: "profile", body: this.body });
      },
      sync: syncLife
    },
    {
      id: "w-music",
      label: "正在听",
      desc: "当前曲目与播放状态",
      open: "music",
      body:
        '<p class="wgt__title"><i class="wgt__dot" data-role="dot" aria-hidden="true"></i>' +
        '<span data-role="title"></span></p>' +
        '<p class="wgt__meta" data-role="meta"></p>',
      build: function () {
        return shell({ id: "w-music", label: "正在听", open: "music", body: this.body });
      },
      sync: syncMusic
    }
  ];

  /* 第一屏条目：live 常驻显示，动态卡片默认收在库里 */
  REGISTRY.forEach(function (item) {
    item.page = "first";
    item.defaultOn = item.id === "live";
  });

  /* 第二屏 · 生活小组件：标记已在 index.html 里，库只负责放上台或收起来 */
  var LIFE_ITEMS = [
    { id: "weather", label: "天气", desc: "温度、天气趋势与空气质量" },
    { id: "water", label: "饮水", desc: "今天喝了几杯，点一下记一杯" },
    { id: "steps", label: "步数", desc: "今日步数与目标进度" },
    { id: "sleep", label: "昨晚睡眠", desc: "时长、质量与深浅睡分布" },
    { id: "focus", label: "专注", desc: "专注计时器与当日目标" },
    { id: "budget", label: "本月花销", desc: "已花、剩余额度与分类" },
    { id: "habits", label: "今日习惯", desc: "打卡清单与连续天数" },
    { id: "plan", label: "今日安排", desc: "待办进度与下一件事" },
    { id: "music", label: "正在播放", desc: "当前曲目，轻触进音乐" }
  ];

  LIFE_ITEMS.forEach(function (item) {
    item.page = "life";
    /* 生活小组件的数据与交互都绑在原标记上，收起只加 is-off，不删节点 */
    item.isStatic = true;
    item.defaultOn = true;
    REGISTRY.push(item);
  });

  function pageItems(key) {
    return REGISTRY.filter(function (item) {
      return item.page === key;
    });
  }

  function byId(id) {
    for (var i = 0; i < REGISTRY.length; i += 1) {
      if (REGISTRY[i].id === id) return REGISTRY[i];
    }
    return null;
  }

  /* 组件落在哪一屏：内置两屏的静态组件钉在原屏，动态卡片可以改放自定义屏 */
  function pageOf(item) {
    if (!item) return "first";
    if (item.isStatic) return item.page;
    var bag = settings() && settings().widgetPage && typeof settings().widgetPage === "object" ? settings().widgetPage : null;
    var key = bag ? String(bag[item.id] || "") : "";
    if (!key) return item.page;
    var P = pages();
    if (P && typeof P.list === "function") {
      var known = P.list().some(function (page) {
        return page.key === key;
      });
      if (known) return key;
    }
    return item.page;
  }

  function setPage(item, key) {
    var st = settings();
    if (!st || !item || item.isStatic) return;
    if (!st.widgetPage || typeof st.widgetPage !== "object") st.widgetPage = {};
    st.widgetPage[item.id] = key;
  }

  /* 某一屏的组件清单：内置屏只列本屏的，自定义屏只列能搬过来的动态卡片 */
  function itemsFor(key) {
    return REGISTRY.filter(function (item) {
      if (item.isStatic) return key === item.page;
      return pageOf(item) === key;
    });
  }

  /* ---------- 开关状态 ---------- */
  function isOn(id) {
    var st = settings();
    var bag = st && st.widgetOn && typeof st.widgetOn === "object" ? st.widgetOn : null;
    /* 存档里还没这个开关时回到出厂默认：生活屏全开，第一屏只留「此刻动态」 */
    var item = byId(id);
    var fallback = !!(item && item.defaultOn);
    if (!bag) return fallback;
    if (!(id in bag)) return fallback;
    return !!bag[id];
  }

  function setOn(id, value) {
    var st = settings();
    if (!st) return false;
    if (!st.widgetOn || typeof st.widgetOn !== "object") st.widgetOn = {};
    st.widgetOn[id] = !!value;
    return true;
  }

  /* ---------- 挂载与卸载 ---------- */
  function nodeOf(id) {
    return el('#home [data-widget="' + id + '"]');
  }

  /* 组件落在哪一屏就装进哪一屏的宿主容器，自定义屏由 homePages 提供 .page__widgets */
  function hostFor(key) {
    var P = pages();
    if (P && typeof P.hostOf === "function") {
      var host = P.hostOf(key);
      if (host) return host;
    }
    var page = el('#home .home__page[data-page="' + key + '"]');
    if (!page) page = el(FIRST_PAGE);
    return page ? el(".home__scroll", page) : null;
  }

  /* 第一屏的新组件排在提示行之前，自定义屏排在空状态之前，不挡住工具行与折叠面板 */
  function anchorFor(host) {
    if (!host) return null;
    return el(".home__hint", host) || el("[data-page-empty]", host);
  }

  /* 添加与移除一律走 is-off 隐藏：节点留在 DOM 里，homeLayout 的 homeOrder 才不会丢位置 */
  function mount(item) {
    if (!item) return null;
    var node = nodeOf(item.id);
    if (node) {
      node.classList.remove("is-off");
      return node;
    }
    /* 生活小组件的标记写在 index.html，节点不在时无法凭空补出来 */
    if (item.isStatic) return null;
    if (typeof item.build !== "function") return null;
    node = item.build();
    if (!node) return null;
    var host = hostFor(pageOf(item));
    if (!host) return null;
    host.insertBefore(node, anchorFor(host));
    return node;
  }

  function unmount(item) {
    if (!item) return;
    var node = nodeOf(item.id);
    if (!node) return;
    node.classList.add("is-off");
  }

  function syncAll() {
    REGISTRY.forEach(function (item) {
      if (!isOn(item.id) || typeof item.sync !== "function") return;
      var node = nodeOf(item.id);
      if (!node) node = mount(item);
      if (node) item.sync(node);
    });
  }

  /* 生活屏全部收起时给出空状态，并留一个就地展开组件库的入口 */
  function syncEmpty() {
    var box = el("#bento-empty");
    if (!box) return;
    var left = pageItems("life").filter(function (item) {
      return isOn(item.id);
    }).length;
    var empty = left === 0;
    box.hidden = !empty;
    box.classList.toggle("is-on", empty);
  }

  /* 自定义屏只要放上了组件就收起空状态提示 */
  function syncPageEmpty(key) {
    var P = pages();
    if (!P || typeof P.nodeOf !== "function" || !key) return;
    var page = P.nodeOf(key);
    if (!page) return;
    var box = el("[data-page-empty]", page);
    if (!box) return;
    box.hidden = itemsFor(key).some(function (item) {
      return isOn(item.id);
    });
  }

  function syncPagesEmpty() {
    var P = pages();
    if (!P || typeof P.list !== "function") return;
    P.list().forEach(function (page) {
      if (P.isCustom && P.isCustom(page.key)) syncPageEmpty(page.key);
    });
  }

  function mountAll() {
    REGISTRY.forEach(function (item) {
      if (isOn(item.id)) mount(item);
      else unmount(item);
    });
    var L = layout();
    if (L && typeof L.apply === "function") L.apply();
    if (L && typeof L.persist === "function") L.persist();
    syncAll();
    syncEmpty();
    syncPagesEmpty();
    renderOpenFolds();
  }

  /* 屏名：内置两屏直接说「伴侣屏 / 生活屏」，自定义屏用用户自己取的名字 */
  function pageLabel(key) {
    if (PAGE_LABEL[key]) return PAGE_LABEL[key];
    var P = pages();
    var name = P && typeof P.nameOf === "function" ? P.nameOf(key) : "";
    return name || "这一屏";
  }

  /* 库里的一个按钮只管一件事：没放就放到这一屏，在这屏就移除，在别屏就搬过来 */
  function toggle(id, targetKey, quiet) {
    var item = byId(id);
    if (!item) return;
    var P = pages();
    var fromKey = pageOf(item);
    var key = targetKey || fromKey;
    if (P && typeof P.isCustom === "function" && P.isCustom(key) && item.isStatic) key = fromKey;
    var here = isOn(id) && fromKey === key;
    var next = !here;
    setOn(id, next);
    if (next) {
      setPage(item, key);
      mount(item);
    } else {
      unmount(item);
    }
    var L = layout();
    if (L && typeof L.apply === "function") L.apply();
    if (L && typeof L.persist === "function") L.persist();
    if (S && typeof S.save === "function") S.save();
    syncAll();
    syncEmpty();
    syncPageEmpty(key);
    if (fromKey !== key) syncPageEmpty(fromKey);
    renderOpenFolds();
    if (quiet) return;
    var label = pageLabel(key);
    if (!next) toast("已从" + label + "移除「" + item.label + "」");
    else if (fromKey === key) toast("已把「" + item.label + "」放到" + label);
    else toast("已把「" + item.label + "」移到" + label);
    buzz(12);
  }

  /* 「恢复默认」把两屏开关与归属都放回出厂状态：生活屏全开，第一屏只留「此刻动态」 */
  function reset(quiet) {
    var st = settings();
    if (st) {
      st.widgetOn = { companion: true, live: true, apps: true };
      st.widgetPage = {};
      REGISTRY.forEach(function (item) {
        st.widgetOn[item.id] = !!item.defaultOn;
      });
      if (S && typeof S.save === "function") S.save();
    }
    mountAll();
    if (!quiet) toast("已恢复默认小组件");
  }

  /* 删屏时把这一屏的动态组件收回原屏，免得开关留在没人看的屏上 */
  function clearPage(key) {
    var moved = false;
    REGISTRY.forEach(function (item) {
      if (item.isStatic || pageOf(item) !== key) return;
      setPage(item, item.page);
      moved = true;
    });
    if (!moved) return;
    if (S && typeof S.save === "function") S.save();
    mountAll();
  }

  /* ---------- 就地小折叠组件库 ---------- */
  /* 库不再从底部弹出：每屏工具行下面那块 .fold__panel 就是这一屏的组件库 */
  function panelOf(key) {
    return el('#home .fold__panel[data-fold-panel="wgt"][data-panel-key="' + key + '"]');
  }

  /* 折叠里列哪些组件：内置屏只列本屏的，自定义屏列出所有能搬过来的动态卡片 */
  function foldItems(key) {
    var P = pages();
    var custom = !!(P && typeof P.isCustom === "function" && P.isCustom(key));
    if (!custom) return itemsFor(key);
    return REGISTRY.filter(function (item) {
      return !item.isStatic;
    });
  }

  function foldMetaFor(key) {
    var items = foldItems(key);
    var placed = items.filter(function (item) {
      return isOn(item.id) && pageOf(item) === key;
    }).length;
    return "放在" + pageLabel(key) + " · " + placed + " / " + items.length + " 个";
  }

  function foldNoteFor(key) {
    var P = pages();
    if (P && typeof P.isCustom === "function" && P.isCustom(key)) {
      return "这里的组件从伴侣屏搬过来，放好后长按就能在这屏拖动排序。";
    }
    return key === "life"
      ? "收起只是收进库里，数据与打卡都还在，随时能放回来。"
      : "添加后就放在这一屏，长按小组件可以拖动排序。";
  }

  /* 入口没带屏参数时，看当前停在哪个主屏 */
  function foldKey(key) {
    if (key) return key;
    var P = pages();
    if (P && typeof P.activeKey === "function") return P.activeKey();
    return el("#home .home__page--life.is-active") ? "life" : "first";
  }

  /* homePages 展开折叠时只叫这一个函数：把当前屏的库内容就地刷出来 */
  function renderFold(key) {
    var panel = panelOf(key);
    if (!panel) return;
    var rows = foldItems(key)
      .map(function (item) {
        var here = isOn(item.id) && pageOf(item) === key;
        var elsewhere = !item.isStatic && isOn(item.id) && !here;
        var label = here ? "移除" : elsewhere ? "移到这里" : "添加";
        return (
          '<div class="fold__row">' +
          '<div class="fold__row-main">' +
          '<p class="fold__name">' + esc(item.label) + "</p>" +
          '<p class="fold__desc">' + esc(item.desc) + "</p>" +
          "</div>" +
          '<button class="fold__chip' +
          (here ? " is-on" : elsewhere ? " is-move" : "") +
          '" type="button" data-wgt-toggle="' +
          esc(item.id) +
          '" data-wgt-page="' +
          esc(key) +
          '" aria-pressed="' +
          (here ? "true" : "false") +
          '">' +
          label +
          "</button></div>"
        );
      })
      .join("");

    panel.innerHTML =
      '<div class="fold__inner">' +
      '<p class="fold__meta">' + foldMetaFor(key) + "</p>" +
      (rows
        ? '<div class="fold__list">' + rows + "</div>"
        : '<p class="fold__empty">这一屏暂时没有可放的组件，去伴侣屏的组件库看看。</p>') +
      '<p class="fold__note">' + foldNoteFor(key) + "</p>" +
      '<div class="fold__foot">' +
      '<button class="fold__link" type="button" data-wgt-reset>恢复默认小组件</button>' +
      "</div>" +
      "</div>";
  }

  /* 已经撑开的折叠跟着最新开关重画，切屏与增删组件都不会看到陈内容 */
  function renderOpenFolds() {
    els('#home .fold__panel[data-fold-panel="wgt"].is-open').forEach(function (panel) {
      renderFold(panel.getAttribute("data-panel-key"));
    });
  }

  /* 排列模式里工具行与折叠面板都是隐藏的，先退出排列再就地展开 */
  function open(key) {
    var P = pages();
    if (!P || typeof P.toggleFold !== "function") return false;
    var L = layout();
    if (L && typeof L.isEditing === "function" && L.isEditing() && typeof L.exit === "function") L.exit();
    return P.toggleFold("wgt", foldKey(key), true);
  }

  function close(key) {
    var k = foldKey(key);
    var panel = panelOf(k);
    if (!panel) return false;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    var P = pages();
    if (P && typeof P.nodeOf === "function") {
      var page = P.nodeOf(k);
      var btn = page ? el("[data-wgt-fold]", page) : null;
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
    return true;
  }

  function isOpen(key) {
    var P = pages();
    if (!P || typeof P.isOpen !== "function") return false;
    return P.isOpen("wgt", foldKey(key));
  }

  /* ---------- 事件 ---------- */
  function bind() {
    on(document, "click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      var entry = node.closest("[data-wgt-lib]");
      if (entry) {
        ev.preventDefault();
        open(entry.getAttribute("data-wgt-lib"));
        return;
      }
      /* 折叠面板底部的「恢复默认」：reset 自己会重挂并刷新展开中的折叠 */
      if (node.closest("[data-wgt-reset]")) {
        reset();
        buzz(14);
        return;
      }
      /* 折叠里的增删按钮：一律按按钮所在那一屏处理 */
      var toggleBtn = node.closest("[data-wgt-toggle]");
      if (toggleBtn) {
        toggle(toggleBtn.getAttribute("data-wgt-toggle"), toggleBtn.getAttribute("data-wgt-page"));
      }
    });

    /* 排列模式下的移除按钮：点击守卫已放行，这里负责真正卸载 */
    on(document, "click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      var rm = node.closest("[data-wgt-rm]");
      if (!rm) return;
      ev.preventDefault();
      toggle(rm.getAttribute("data-wgt-rm"));
    });

    /* 非排列模式：轻触小组件打开对应应用 */
    on(document, "click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      if (node.closest("[data-wgt-rm]")) return;
      var host = node.closest("[data-wgt-open]");
      if (!host) return;
      if (layout() && typeof layout().isEditing === "function" && layout().isEditing()) return;
      openApp(host.getAttribute("data-wgt-open"));
    });
  }

  function boot() {
    bind();
    mountAll();
  }

  S.homeWidgets = {
    registry: REGISTRY,
    pageItems: pageItems,
    syncEmpty: syncEmpty,
    isOn: isOn,
    toggle: toggle,
    reset: reset,
    clearPage: clearPage,
    renderFold: renderFold,
    renderOpenFolds: renderOpenFolds,
    open: open,
    close: close,
    isOpen: isOpen,
    refresh: syncAll,
    mountAll: mountAll
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);