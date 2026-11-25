/* =====================================================================
   Callia OS · homePages.js
   主屏数量自由增减：屏幕模型、页面 DOM 构建、小折叠机制与屏幕管理
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;
  var MAX_PAGES = 6;
  var BUILTIN = [
    { key: "first", name: "伴侣" },
    { key: "life", name: "生活" }
  ];

  var pendingDelete = "";
  var deleteTimer = null;
  var bound = false;

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

  function remove(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function esc(value) {
    if (S && typeof S.esc === "function") return S.esc(value);
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function settings() {
    return S && S.store && S.store.settings ? S.store.settings : null;
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

  function reduced() {
    try {
      return !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (err) {
      return false;
    }
  }

  /* ---------- 屏幕模型 ---------- */
  function isBuiltin(key) {
    for (var i = 0; i < BUILTIN.length; i += 1) {
      if (BUILTIN[i].key === key) return true;
    }
    return false;
  }

  function builtinName(key) {
    for (var i = 0; i < BUILTIN.length; i += 1) {
      if (BUILTIN[i].key === key) return BUILTIN[i].name;
    }
    return key;
  }

  function clampName(value) {
    var text = String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.slice(0, 8);
  }

  function indexOfKey(list, key) {
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].key === key) return i;
    }
    return -1;
  }

  function find(list, key) {
    var i = indexOfKey(list, key);
    return i < 0 ? null : list[i];
  }

  function normalize(raw) {
    var out = [];
    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      var key = String(item.key || "");
      if (!key || find(out, key)) return;
      out.push({ key: key, name: clampName(item.name) || builtinName(key), builtin: isBuiltin(key) });
    });
    /* 内置两屏永远在，缺了就补回原位 */
    BUILTIN.forEach(function (base, i) {
      if (find(out, base.key)) return;
      out.splice(Math.min(i, out.length), 0, { key: base.key, name: base.name, builtin: true });
    });
    return out.slice(0, MAX_PAGES);
  }

  function list() {
    var st = settings();
    return normalize(st && st.homePages);
  }

  function write(items) {
    var st = settings();
    if (!st) return;
    st.homePages = items.map(function (item) {
      return { key: item.key, name: item.name, builtin: !!item.builtin };
    });
    if (S && typeof S.save === "function") S.save();
  }

  function ensure() {
    var st = settings();
    if (!st) return;
    var stored = Array.isArray(st.homePages) ? st.homePages : [];
    var cur = normalize(stored);
    var dirty = cur.length !== stored.length;
    cur.forEach(function (item, i) {
      var old = stored[i];
      if (!old || old.key !== item.key || clampName(old.name) !== item.name) dirty = true;
    });
    if (dirty) write(cur);
  }

  function nameOf(key) {
    var item = find(list(), key);
    return item ? item.name : "";
  }

  /* ---------- 页面 DOM ---------- */
  function track() {
    return el("#home-track");
  }

  function pageNodes() {
    return els("#home .home__page");
  }

  function nodeOf(key) {
    if (!key) return null;
    return el('#home .home__page[data-page="' + key + '"]');
  }

  function hostOf(key) {
    var page = nodeOf(key);
    if (!page) return null;
    if (key === "life") return el("#bento-life", page) || el(".home__scroll", page);
    return el(".page__widgets", page) || el(".home__scroll", page);
  }

  function buildPage(item) {
    var sec = document.createElement("section");
    sec.className = "home__page home__page--custom";
    sec.setAttribute("data-page", item.key);
    sec.setAttribute("role", "group");
    sec.setAttribute("aria-roledescription", "主屏");
    sec.innerHTML =
      '<div class="home__scroll">' +
      '<header class="page__head">' +
      '<p class="page__kicker">SCREEN</p>' +
      '<p class="page__title" data-page-title></p>' +
      "</header>" +
      '<div class="page__widgets" data-page-host="' + esc(item.key) + '">' +
      '<div class="page__empty" data-page-empty>' +
      "这一屏还是空的，展开下面的「组件库」挑几个放上来。" +
      '<button class="page__empty-btn" type="button" data-wgt-lib="' + esc(item.key) + '">打开组件库</button>' +
      "</div>" +
      "</div>" +
      "</div>";
    return sec;
  }

  function panel(kind, key) {
    var box = document.createElement("div");
    box.className = "fold__panel";
    box.id = kind + "-fold-" + key;
    box.setAttribute("data-fold-panel", kind);
    box.setAttribute("data-panel-key", key);
    box.setAttribute("aria-hidden", "true");
    if (kind === "wgt") box.setAttribute("data-wgt-panel", key);
    return box;
  }

  /* 每屏底部统一长出一行小工具：排列 + 组件库小折叠 + 屏幕小折叠 */
  function decorate(node, item) {
    var scroll = el(".home__scroll", node);
    if (!scroll) return;
    if (!node.getAttribute("data-page")) node.setAttribute("data-page", item.key);
    /* 重建工具行前先记下哪几块折叠是撑开的，重建后原样展开，不让内容凭空收起 */
    var reopened = els("[data-fold-panel].is-open", node).map(function (box) {
      return box.getAttribute("data-fold-panel");
    });
    remove(el("[data-page-tools]", node));
    els("[data-fold-panel]", node).forEach(remove);

    var tools = document.createElement("div");
    tools.className = "home__tools";
    tools.setAttribute("data-page-tools", item.key);
    tools.innerHTML =
      '<button class="home__arrange" type="button" data-home-edit>排列</button>' +
      '<button class="fold__btn" type="button" data-wgt-fold="' + esc(item.key) +
      '" aria-expanded="false" aria-controls="wgt-fold-' + esc(item.key) + '">' +
      '<i class="fold__chev" aria-hidden="true"></i><span>组件库</span></button>' +
      '<button class="fold__btn fold__btn--page" type="button" data-page-fold="' + esc(item.key) +
      '" aria-expanded="false" aria-controls="page-fold-' + esc(item.key) + '">' +
      '<i class="fold__chev" aria-hidden="true"></i><span>屏幕</span></button>';
    scroll.appendChild(tools);
    scroll.appendChild(panel("wgt", item.key));
    scroll.appendChild(panel("page", item.key));
    if (!reopened.length) return;
    els("[data-fold-panel]", node).forEach(function (box) {
      var kind = box.getAttribute("data-fold-panel");
      if (reopened.indexOf(kind) < 0) return;
      box.classList.add("is-open");
      box.setAttribute("aria-hidden", "false");
      syncToggle(kind, item.key, true);
    });
    renderOpenPanels();
  }

  function render() {
    var host = track();
    if (!host) return;
    var items = list();

    /* 存档里已经不要的自定义屏先请出去 */
    pageNodes().forEach(function (node) {
      var key = node.getAttribute("data-page");
      if (!key || !find(items, key)) remove(node);
    });

    var cursor = null;
    items.forEach(function (item, i) {
      var node = nodeOf(item.key);
      if (!node) {
        /* 内置屏的标记写在 index.html 里，缺失时无法凭空补出 */
        if (item.builtin) return;
        node = buildPage(item);
      }
      decorate(node, item);
      node.setAttribute("aria-label", "第" + (i + 1) + "屏 · " + item.name);
      var title = el("[data-page-title]", node);
      if (title) title.textContent = item.name;
      var kicker = el(".page__kicker", node);
      if (kicker) kicker.textContent = "SCREEN " + (i + 1);

      if (cursor) {
        if (cursor.nextSibling !== node) host.insertBefore(node, cursor.nextSibling);
      } else if (host.firstChild !== node) {
        host.insertBefore(node, host.firstChild);
      }
      cursor = node;
    });
  }

  /* ---------- 分页指示：结构由这里出，状态由 os.js 刷 ---------- */
  function renderDots() {
    var box = el("#home-dots");
    if (!box) return;
    var nodes = pageNodes();
    var html = nodes
      .map(function (node, i) {
        var name = nameOf(node.getAttribute("data-page")) || "第" + (i + 1) + "屏";
        return (
          '<button class="pager__dot" type="button" role="tab" aria-selected="false" data-page="' +
          i + '" aria-label="切换到' + esc(name) + '"></button>'
        );
      })
      .join("");
    if (nodes.length < MAX_PAGES) {
      html += '<button class="pager__add" type="button" data-page-add aria-label="新增一屏">＋</button>';
    }
    box.innerHTML = html;
  }

  function refresh() {
    render();
    renderDots();
    if (S && S.os && typeof S.os.syncPager === "function") S.os.syncPager(true);
  }

  function activeKey() {
    var node = el("#home .home__page.is-active") || pageNodes()[0];
    return node ? node.getAttribute("data-page") || "first" : "first";
  }

  function goTo(key, animate) {
    var i = indexOfKey(list(), key);
    if (i < 0 || !S || !S.os || typeof S.os.goPage !== "function") return;
    S.os.goPage(i, animate !== false);
  }

  /* ---------- 屏幕增删改 ---------- */
  function add(name) {
    var items = list();
    if (items.length >= MAX_PAGES) {
      toast("最多 " + MAX_PAGES + " 屏，先删掉一屏再加");
      return null;
    }
    var key = "p" + Date.now().toString(36);
    var at = indexOfKey(items, activeKey());
    if (at < 0) at = items.length - 1;
    items.splice(at + 1, 0, { key: key, name: clampName(name) || "第 " + (items.length + 1) + " 屏", builtin: false });
    write(items);
    refresh();
    goTo(key, true);
    toast("已新增第 " + (at + 2) + " 屏");
    buzz(12);
    return key;
  }

  function removePage(key) {
    var items = list();
    var item = find(items, key);
    if (!item || item.builtin) {
      toast("内置屏幕不能删除");
      return false;
    }
    items = items.filter(function (row) {
      return row.key !== key;
    });
    write(items);
    if (S.homeWidgets && typeof S.homeWidgets.clearPage === "function") S.homeWidgets.clearPage(key);
    clearPending();
    refresh();
    goTo(activeKey(), false);
    toast("已删除这一屏，组件收进了组件库");
    buzz(14);
    return true;
  }

  function rename(key, name) {
    var items = list();
    var item = find(items, key);
    if (!item) return false;
    var next = clampName(name);
    if (!next || next === item.name) {
      render();
      return false;
    }
    item.name = next;
    write(items);
    render();
    renderDots();
    return true;
  }

  function move(key, dir) {
    var items = list();
    var from = indexOfKey(items, key);
    var to = from + (Number(dir) || 0);
    if (from < 0 || to < 0 || to >= items.length) return false;
    var here = activeKey();
    items.splice(to, 0, items.splice(from, 1)[0]);
    write(items);
    refresh();
    goTo(here, false);
    buzz(8);
    return true;
  }

  function resetPages() {
    var items = list();
    items.forEach(function (item) {
      if (!item.builtin && S.homeWidgets && typeof S.homeWidgets.clearPage === "function") {
        S.homeWidgets.clearPage(item.key);
      }
    });
    write(
      BUILTIN.map(function (base) {
        return { key: base.key, name: base.name, builtin: true };
      })
    );
    clearPending();
    refresh();
    goTo("first", true);
    toast("已恢复默认两屏");
    buzz(14);
  }

  function clearPending() {
    pendingDelete = "";
    if (deleteTimer !== null) {
      global.clearTimeout(deleteTimer);
      deleteTimer = null;
    }
  }

  function askDelete(key) {
    var item = find(list(), key);
    if (!item || item.builtin) {
      toast("内置屏幕不能删除");
      return;
    }
    if (pendingDelete !== key) {
      pendingDelete = key;
      renderOpenPanels();
      toast("再点一次删除这一屏");
      if (deleteTimer !== null) global.clearTimeout(deleteTimer);
      deleteTimer = global.setTimeout(clearPending, 4000);
      return;
    }
    removePage(key);
    renderOpenPanels();
  }

  /* ---------- 小折叠 ---------- */
  function panelOf(kind, key) {
    if (!key) return null;
    return el('#home .fold__panel[data-fold-panel="' + kind + '"][data-panel-key="' + key + '"]');
  }

  function shut(panel) {
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }

  function syncToggle(kind, key, open) {
    var page = nodeOf(key);
    if (!page) return;
    var btn = el(kind === "wgt" ? "[data-wgt-fold]" : "[data-page-fold]", page);
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function isOpen(kind, key) {
    var panel = panelOf(kind, key);
    return !!panel && panel.classList.contains("is-open");
  }

  function toggleFold(kind, key, forceOpen) {
    var panel = panelOf(kind, key);
    if (!panel) return false;
    var page = nodeOf(key);
    if (page) {
      els(".fold__panel.is-open", page).forEach(function (other) {
        if (other === panel) return;
        shut(other);
        syncToggle(other.getAttribute("data-fold-panel"), key, false);
      });
    }
    if (panel.classList.contains("is-open") && forceOpen !== true) {
      shut(panel);
      syncToggle(kind, key, false);
      return false;
    }
    if (kind === "wgt" && S.homeWidgets && typeof S.homeWidgets.renderFold === "function") {
      S.homeWidgets.renderFold(key);
    }
    if (kind === "page") renderPagePanel(panel);
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    syncToggle(kind, key, true);
    buzz(6);
    global.setTimeout(function () {
      try {
        panel.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
      } catch (err) {
        /* 老内核不支持滚动选项时忽略 */
      }
    }, 80);
    return true;
  }

  function renderOpenPanels() {
    els('#home .fold__panel[data-fold-panel="page"].is-open').forEach(renderPagePanel);
    els('#home .fold__panel[data-fold-panel="wgt"].is-open').forEach(function (panel) {
      if (S.homeWidgets && typeof S.homeWidgets.renderFold === "function") {
        S.homeWidgets.renderFold(panel.getAttribute("data-panel-key"));
      }
    });
  }

  function renderPagePanel(panel) {
    if (!panel) return;
    var items = list();
    var rows = items
      .map(function (item, i) {
        var warn = pendingDelete === item.key;
        return (
          '<div class="pagebar__row">' +
          '<span class="pagebar__idx">' +
          (i + 1) +
          "</span>" +
          '<input class="pagebar__name" type="text" value="' +
          esc(item.name) +
          '" maxlength="8" data-page-rename="' +
          esc(item.key) +
          '" aria-label="第' +
          (i + 1) +
          "屏名称" +
          '">' +
          '<button class="pagebar__btn" type="button" data-page-move="' +
          esc(item.key) +
          '" data-dir="-1"' +
          (i === 0 ? " disabled" : "") +
          ' aria-label="把这一屏往前移">◀</button>' +
          '<button class="pagebar__btn" type="button" data-page-move="' +
          esc(item.key) +
          '" data-dir="1"' +
          (i === items.length - 1 ? " disabled" : "") +
          ' aria-label="把这一屏往后移">▶</button>' +
          '<button class="pagebar__btn pagebar__btn--del' +
          (warn ? " is-warn" : "") +
          '" type="button" data-page-del="' +
          esc(item.key) +
          '"' +
          (item.builtin ? " disabled" : "") +
          ' aria-label="删除这一屏">' +
          (warn ? "确认删除" : "✕") +
          "</button>" +
          "</div>"
        );
      })
      .join("");

    panel.innerHTML =
      '<div class="fold__inner">' +
      '<p class="fold__meta">共 ' +
      items.length +
      " 屏 · 最多 " +
      MAX_PAGES +
      " 屏，左右移动可换顺序</p>" +
      '<div class="pagebar">' +
      rows +
      "</div>" +
      '<div class="fold__foot">' +
      '<button class="fold__link" type="button" data-page-add' +
      (items.length >= MAX_PAGES ? " disabled" : "") +
      ">＋ 新增一屏</button>" +
      (items.length > BUILTIN.length
        ? '<button class="fold__link fold__link--ghost" type="button" data-page-reset>恢复默认两屏</button>'
        : "") +
      "</div>" +
      "</div>";
  }

  /* ---------- 事件 ---------- */
  function bind() {
    if (bound) return;
    bound = true;

    on(document, "click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;

      var wgt = node.closest("[data-wgt-fold]");
      if (wgt) {
        ev.preventDefault();
        toggleFold("wgt", wgt.getAttribute("data-wgt-fold"));
        return;
      }
      var page = node.closest("[data-page-fold]");
      if (page) {
        ev.preventDefault();
        toggleFold("page", page.getAttribute("data-page-fold"));
        return;
      }
      if (node.closest("[data-page-add]")) {
        ev.preventDefault();
        add();
        return;
      }
      var moved = node.closest("[data-page-move]");
      if (moved) {
        ev.preventDefault();
        move(moved.getAttribute("data-page-move"), parseInt(moved.getAttribute("data-dir"), 10));
        return;
      }
      var del = node.closest("[data-page-del]");
      if (del) {
        ev.preventDefault();
        askDelete(del.getAttribute("data-page-del"));
        return;
      }
      if (node.closest("[data-page-reset]")) {
        ev.preventDefault();
        resetPages();
      }
    });

    /* 改名走原生输入，失焦或键盘完成时落盘 */
    on(document, "change", function (ev) {
      var input = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("[data-page-rename]") : null;
      if (!input) return;
      rename(input.getAttribute("data-page-rename"), input.value);
      renderOpenPanels();
    });
  }

  function boot() {
    ensure();
    refresh();
    bind();
  }

  global.CalliaPages = {
    MAX: MAX_PAGES,
    list: list,
    nameOf: nameOf,
    isBuiltin: isBuiltin,
    isCustom: function (key) {
      return !isBuiltin(key);
    },
    nodeOf: nodeOf,
    hostOf: hostOf,
    activeKey: activeKey,
    add: add,
    remove: removePage,
    rename: rename,
    move: move,
    reset: resetPages,
    renderDots: renderDots,
    refresh: refresh,
    toggleFold: toggleFold,
    isOpen: isOpen
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);