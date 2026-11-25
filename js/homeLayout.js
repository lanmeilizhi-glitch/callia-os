/* =====================================================================
   Companion OS · homeLayout.js
   桌面网格内拖拽排序：排列模式、长按拖起、格位交换与吸附、顺序持久化

   设计约束（与需求一一对应）：
   1) 彻底放弃绝对定位自由拖拽：任何节点都不会被写成 position:absolute，
      也不会写入 left/top 坐标，因此不可能飞出网格或盖住别的内容；
   2) 拖拽只在「同一个网格容器」内换位：应用图标在 #appgrid 的 3 列网格里，
      小组件在各自所在的网格/列表里，跨容器一律不换；
   3) 拖起时只叠加 transform 位移，松手后位移归零，节点自然吸附回格位；
   4) 拖拽期间通过 body.is-dragging 与 callia:dragstart / callia:dragend
      通知轮播层让出手势，轻扫切屏逻辑本身保持不变。
   ===================================================================== */
(function (global) {
  "use strict";

  /* 桌面默认排列（与 index.html 的书写顺序一致，用于恢复默认） */
  var DEFAULTS = {
    first: ["companion"],
    life: ["apps", "weather", "water", "steps", "sleep", "focus", "budget", "habits", "plan", "music"]
  };

  var PAGE_SEL = {
    first: "#home .home__page--first",
    life: "#home .home__page--life"
  };

  /* 长按多久进入拖拽 */
  var HOLD_MS = 420;
  /* 长按判定期间允许的手指抖动 */
  var MOVE_SLOP = 10;
  /* 真正开始拖拽的最小位移 */
  var DRAG_SLOP = 6;
  /* 应用图标（第二屏功能网格）：可以一个个单独拖动换位 */
  var ICON_SEL = ".appgrid__item";
  /* 图标默认顺序，与 state.js 里 settings.appOrder 的种子保持一致 */
  var DEFAULT_APPS = ["chat", "profile", "mood", "schedule", "music", "memory", "settings", "kalia"];

  var editing = false;
  var suppressClickUntil = 0;
  var toastTimer = null;

  /* ---------- 基础工具 ---------- */
  function el(sel, root) {
    return (root || document).querySelector(sel);
  }

  function els(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function on(node, type, fn, opts) {
    if (node) node.addEventListener(type, fn, opts || false);
  }

  /* 拖拽对象可能是整块小组件，也可能是网格里的单个应用图标 */
  function keyOf(node) {
    return node.getAttribute("data-widget") || node.getAttribute("data-app") || "";
  }

  function isIcon(node) {
    return !!node && node.hasAttribute && node.hasAttribute("data-app");
  }

  function dragSelector(node) {
    return isIcon(node) ? ICON_SEL : "[data-widget]";
  }

  /* closest 从自身往上找，图标比包着它的 #appgrid 更近，会先命中图标 */
  function dragTarget(node) {
    if (!node || typeof node.closest !== "function") return null;
    if (node.closest("[data-wgt-rm]")) return null;
    return node.closest(ICON_SEL + ", [data-widget]");
  }

  function cos() {
    return global.COS;
  }

  function settings() {
    var c = cos();
    return c && c.store && c.store.settings ? c.store.settings : null;
  }

  function reduced() {
    try {
      return !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (err) {
      return false;
    }
  }

  function buzz(ms) {
    try {
      var st = settings();
      if (st && st.haptic === false) return;
      if (global.navigator && typeof global.navigator.vibrate === "function") {
        global.navigator.vibrate(ms || 12);
      }
    } catch (err) {
      /* 轻震不可用时静默 */
    }
  }

  function toast(text) {
    var c = cos();
    if (c && c.os && typeof c.os.toast === "function") {
      c.os.toast(text);
      return;
    }
    var node = document.getElementById("toast");
    if (!node) return;
    node.textContent = text;
    node.classList.add("is-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove("is-on");
    }, 2000);
  }

  /* 通知轮播层：拖拽期间让出手势（body.is-dragging 兼做 CSS 兜底） */
  function fire(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (err) {
      /* 老内核不支持 CustomEvent 构造时忽略 */
    }
  }

  /* ---------- 小组件分组：同一父节点下的一排小组件 ---------- */
  function widgetGroup(page) {
    var list = els("[data-widget]", page);
    var buckets = [];
    var best = { container: null, items: [] };

    for (var i = 0; i < list.length; i += 1) {
      var parent = list[i].parentNode;
      if (!parent) continue;
      var hit = null;
      for (var j = 0; j < buckets.length; j += 1) {
        if (buckets[j].container === parent) {
          hit = buckets[j];
          break;
        }
      }
      if (!hit) {
        hit = { container: parent, items: [] };
        buckets.push(hit);
      }
      hit.items.push(list[i]);
    }

    buckets.forEach(function (bucket) {
      if (bucket.items.length > best.items.length) best = bucket;
    });
    return best;
  }

  function pageGroups() {
    var out = [];
    Object.keys(PAGE_SEL).forEach(function (key) {
      var page = el(PAGE_SEL[key]);
      if (!page) return;
      var group = widgetGroup(page);
      if (!group.container || !group.items.length) return;
      out.push({ key: key, page: page, container: group.container, items: group.items });
    });
    return out;
  }

  /* ---------- 顺序读写 ---------- */
  function sanitize(key, list) {
    var base = DEFAULTS[key];
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (id) {
      id = String(id);
      if (base.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
    });
    base.forEach(function (id) {
      if (out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }

  function orderMap() {
    var st = settings();
    var raw = st && st.homeOrder && typeof st.homeOrder === "object" ? st.homeOrder : {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      out[key] = sanitize(key, raw[key]);
    });
    return out;
  }

  function persistOrder() {
    var st = settings();
    if (!st) return;
    var map = {};
    pageGroups().forEach(function (group) {
      map[group.key] = sanitize(
        group.key,
        group.items.map(function (node) {
          return node.getAttribute("data-widget");
        })
      );
    });
    st.homeOrder = map;
    persistAppOrder();
    var c = cos();
    if (c && typeof c.save === "function") c.save();
  }

  /* ---------- 应用图标顺序：#appgrid 里的图标可以一个个单独拖动 ---------- */
  function appNodes() {
    var grid = el("#appgrid");
    return grid ? els(ICON_SEL, grid) : [];
  }

  function sanitizeApps(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (key) {
      key = String(key);
      if (key && out.indexOf(key) < 0) out.push(key);
    });
    DEFAULT_APPS.forEach(function (key) {
      if (out.indexOf(key) < 0) out.push(key);
    });
    return out;
  }

  function persistAppOrder() {
    var st = settings();
    if (!st) return;
    var keys = [];
    appNodes().forEach(function (node) {
      var key = node.getAttribute("data-app");
      if (key) keys.push(key);
    });
    /* 网格还没渲染出来时不要覆盖存档 */
    if (!keys.length) return;
    st.appOrder = sanitizeApps(keys);
  }

  /* 把存档里的图标顺序写回网格：os.js 渲染时已排过一次，这里兜底并服务「恢复默认」 */
  function applyAppOrder() {
    var grid = el("#appgrid");
    var nodes = appNodes();
    if (!grid || !nodes.length) return;
    var st = settings();
    var ids = sanitizeApps(st && Array.isArray(st.appOrder) ? st.appOrder : []);
    var byKey = {};
    nodes.forEach(function (node) {
      byKey[node.getAttribute("data-app")] = node;
    });
    var anchor = nodes[nodes.length - 1].nextSibling;
    ids.forEach(function (key) {
      var node = byKey[key];
      if (node) grid.insertBefore(node, anchor);
    });
  }

  /* 把存档里的顺序写回 DOM：只在小组件之间换位，不动标题与提示 */
  function applyOrder() {
    var map = orderMap();
    pageGroups().forEach(function (group) {
      var ids = map[group.key] || [];
      var byId = {};
      group.items.forEach(function (node) {
        byId[node.getAttribute("data-widget")] = node;
      });
      var anchor = group.items[group.items.length - 1].nextSibling;
      ids.forEach(function (id) {
        var node = byId[id];
        if (!node) return;
        group.container.insertBefore(node, anchor);
      });
    });
  }

  /* ---------- 排列模式开关 ---------- */
  function barText() {
    return el("#edit-bar-text");
  }

  function syncBar() {
    var bar = el("#home-edit-bar");
    if (!bar) return;
    bar.hidden = !editing;
    var text = barText();
    if (text) text.textContent = "按住图标在网格内拖动 · 松手吸附到格位";
  }

  function enter(source) {
    if (editing) return;
    var home = el("#home");
    if (!home) return;
    editing = true;
    document.body.setAttribute("data-editing", "1");
    home.classList.add("is-editing");
    syncBar();
    buzz(16);
    if (source === "hold") toast("排列模式 · 按住图标在网格内拖动排序");
  }

  function exit() {
    if (!editing) return;
    cancelDrag();
    editing = false;
    document.body.removeAttribute("data-editing");
    var home = el("#home");
    if (home) home.classList.remove("is-editing");
    syncBar();
    persistOrder();
  }

  function resetOrder() {
    var map = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      map[key] = DEFAULTS[key].slice();
    });
    var st = settings();
    if (st) {
      st.homeOrder = map;
      st.appOrder = DEFAULT_APPS.slice();
      /* 历史版本留下的自由坐标一律清空：现在只认网格顺序 */
      st.appFree = {};
    }
    applyOrder();
    applyAppOrder();
    persistOrder();
    toast("已恢复默认排列");
    buzz(14);
  }

  /* ---------- 入口：按钮 + 长按小组件 ---------- */
  function bindEntries() {
    on(document, "click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      if (node.closest("[data-home-edit]")) {
        ev.preventDefault();
        enter("tap");
      }
    });

    on(document, "click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      if (node.closest("[data-edit-done]")) {
        exit();
        toast("桌面排列已保存");
      } else if (node.closest("[data-edit-reset]")) {
        resetOrder();
      }
    });
  }

  function bindHold() {
    var home = el("#home");
    var hold = {
      id: null,
      timer: null,
      x: 0,
      y: 0,
      ox: 0,
      oy: 0,
      node: null,
      down: false,
      dragging: false
    };

    function cancel() {
      if (hold.timer !== null) {
        clearTimeout(hold.timer);
        hold.timer = null;
      }
      hold.id = null;
      hold.node = null;
      hold.down = false;
      hold.dragging = false;
    }

    on(home, "pointerdown", function (ev) {
      if (editing) return;
      if (document.body.getAttribute("data-view") !== "home") return;
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      var widget = dragTarget(node);
      if (!widget) return;

      cancel();
      hold.id = ev.pointerId;
      hold.x = hold.ox = ev.clientX;
      hold.y = hold.oy = ev.clientY;
      hold.node = widget;
      hold.down = true;
      hold.timer = setTimeout(function () {
        hold.timer = null;
        var target = hold.node;
        var pid = hold.id;
        var px = hold.x;
        var py = hold.y;
        hold.id = null;
        enter("hold");
        /* 手指还按在小组件上就直接进入拖拽，不用松手再拖一次 */
        if (hold.down && target && !drag) {
          beginDrag(target, { pointerId: pid, clientX: px, clientY: py });
          hold.dragging = !!drag;
        }
      }, HOLD_MS);
    });

    on(document, "pointermove", function (ev) {
      if (ev.pointerId !== hold.id) return;
      hold.x = ev.clientX;
      hold.y = ev.clientY;
      if (hold.timer === null) return;
      if (Math.abs(ev.clientX - hold.ox) > MOVE_SLOP || Math.abs(ev.clientY - hold.oy) > MOVE_SLOP) cancel();
    }, { passive: true });

    /* 长按转拖拽时，本次触摸的 touch-action 仍是 auto，必须挡住页面跟手滚动 */
    on(
      home,
      "touchmove",
      function (ev) {
        if (!hold.dragging) return;
        if (typeof ev.preventDefault === "function") ev.preventDefault();
      },
      { passive: false }
    );

    on(document, "pointerup", cancel);
    on(document, "pointercancel", cancel);
  }

  /* 排列模式里，小组件自身的点击一律吞掉 */
  function bindClickGuard() {
    on(document, "click", function (ev) {
      if (!editing && Date.now() < suppressClickUntil) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      if (!editing) return;
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      /* 移除按钮要能点：排列模式里它是小组件内部唯一放行的操作 */
      if (node.closest("[data-wgt-rm]")) return;
      if (node.closest("[data-widget]")) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    }, true);

    on(document, "contextmenu", function (ev) {
      if (editing || Date.now() < suppressClickUntil) ev.preventDefault();
    });
  }

  /* 离开桌面（打开应用、锁屏等）自动退出排列模式 */
  function watchView() {
    if (typeof global.MutationObserver !== "function") return;
    var observer = new global.MutationObserver(function () {
      if (!editing) return;
      if (document.body.getAttribute("data-view") !== "home") exit();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-view"] });
  }

  /* ---------- 拖拽引擎 ---------- */
  var drag = null;
  var scrollRaf = null;

  function plainRect(rect) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  /* 读取不含自身 transform 的布局矩形 */
  function layoutRect(node) {
    var prev = node.style.transform;
    node.style.transform = "none";
    var rect = plainRect(node.getBoundingClientRect());
    node.style.transform = prev;
    return rect;
  }

  /* 读取当前视觉矩形（含正在播放的 FLIP 位移） */
  function visualRects(items) {
    var map = {};
    items.forEach(function (node) {
      map[keyOf(node)] = plainRect(node.getBoundingClientRect());
    });
    return map;
  }

  function scrollHost(node) {
    var node2 = node.parentNode;
    while (node2 && node2 !== document.body) {
      if (node2.scrollHeight > node2.clientHeight + 8) {
        try {
          var overflowY = global.getComputedStyle(node2).overflowY;
          if (overflowY === "auto" || overflowY === "scroll") return node2;
        } catch (err) {
          return null;
        }
      }
      node2 = node2.parentNode;
    }
    return null;
  }

  /* 拖起态只叠加位移：节点始终留在网格流里，位移归零即吸附回格位 */
  function paintGhost() {
    if (!drag) return;
    drag.node.style.transform = "translate(" + drag.dx + "px," + drag.dy + "px)";
  }

  function beginDrag(node, ev) {
    var container = node.parentNode;
    if (!container) return;
    var sel = dragSelector(node);
    var items = els(sel, container);
    var rects = visualRects(items);
    var self = layoutRect(node);
    rects[keyOf(node)] = self;

    drag = {
      id: ev.pointerId,
      node: node,
      container: container,
      sel: sel,
      items: items,
      rects: rects,
      startX: ev.clientX,
      startY: ev.clientY,
      pointerX: ev.clientX,
      pointerY: ev.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      scroll: scrollHost(node)
    };

    /* 通知轮播层：这次手势归拖拽，切屏让开 */
    fire("callia:dragstart", { key: keyOf(node) });
  }

  function shiftRects(delta) {
    if (!drag) return;
    Object.keys(drag.rects).forEach(function (key) {
      drag.rects[key].top += delta;
    });
  }

  function reorderTo(target) {
    var node = drag.node;
    var container = drag.container;
    var id = keyOf(node);
    var items = drag.items;
    var first = visualRects(items);
    var selfBefore = drag.rects[id];

    if (items.indexOf(node) < items.indexOf(target)) {
      container.insertBefore(node, target.nextSibling);
    } else {
      container.insertBefore(node, target);
    }

    var fresh = els(drag.sel, container);
    drag.items = fresh;

    /* 清掉兄弟的动画中间态，读取换位后的最终布局 */
    var last = {};
    fresh.forEach(function (n) {
      if (n !== node) {
        n.style.transition = "none";
        n.style.transform = "";
      }
      last[keyOf(n)] = layoutRect(n);
    });

    fresh.forEach(function (n) {
      if (n === node) return;
      var a = first[keyOf(n)];
      var b = last[keyOf(n)];
      if (!a || !b) return;
      var dx = a.left - b.left;
      var dy = a.top - b.top;
      if (!dx && !dy) return;
      n.style.transform = "translate(" + dx + "px," + dy + "px)";
    });

    void container.offsetWidth;

    var motion = reduced() ? "none" : "transform 220ms cubic-bezier(.22,.61,.36,1)";
    fresh.forEach(function (n) {
      if (n === node) return;
      n.style.transition = motion;
      n.style.transform = "";
    });

    /* 被拖元素保持跟手：补偿自身布局位移 */
    var selfAfter = last[id];
    if (selfBefore && selfAfter) {
      drag.dx += selfBefore.left - selfAfter.left;
      drag.dy += selfBefore.top - selfAfter.top;
    }
    drag.rects = last;
    paintGhost();
  }

  /* 命中判定：拖起节点的中心点落在哪个格位上，就与它交换 */
  function maybeSwap() {
    if (!drag) return;
    var id = keyOf(drag.node);
    var self = drag.rects[id];
    if (!self) return;
    var cx = self.left + drag.dx + self.width / 2;
    var cy = self.top + drag.dy + self.height / 2;

    for (var i = 0; i < drag.items.length; i += 1) {
      var node = drag.items[i];
      if (node === drag.node) continue;
      var rect = drag.rects[keyOf(node)];
      if (!rect) continue;
      if (cx >= rect.left && cx <= rect.left + rect.width && cy >= rect.top && cy <= rect.top + rect.height) {
        if (drag.items.indexOf(node) !== drag.items.indexOf(drag.node)) reorderTo(node);
        return;
      }
    }
  }

  function stepScroll() {
    scrollRaf = null;
    if (!drag || !drag.moved || !drag.scroll) return;

    var host = drag.scroll;
    var rect = host.getBoundingClientRect();
    var edge = 76;
    var delta = 0;
    if (drag.pointerY < rect.top + edge) delta = -Math.ceil((rect.top + edge - drag.pointerY) / 7);
    else if (drag.pointerY > rect.bottom - edge) delta = Math.ceil((drag.pointerY - (rect.bottom - edge)) / 7);
    delta = Math.max(-20, Math.min(20, delta));

    if (delta) {
      var max = Math.max(0, host.scrollHeight - host.clientHeight);
      var next = Math.max(0, Math.min(max, host.scrollTop + delta));
      var moved = next - host.scrollTop;
      if (moved) {
        host.scrollTop = next;
        shiftRects(-moved);
        drag.dy += moved;
        paintGhost();
      }
    }
    scrollRaf = global.requestAnimationFrame(stepScroll);
  }

  function cleanupDrag(delay) {
    var current = drag;
    if (!current) return;
    drag = null;

    if (scrollRaf !== null) {
      global.cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }

    var items = current.items.slice();
    var finish = function () {
      items.forEach(function (n) {
        n.style.transition = "";
        n.style.transform = "";
      });
      current.node.classList.remove("is-dragging");
      document.body.classList.remove("is-dragging");
    };

    if (delay > 0) setTimeout(finish, delay);
    else finish();

    if (current.moved) {
      suppressClickUntil = Date.now() + 340;
      persistOrder();
      buzz(8);
    }
    fire("callia:dragend", { key: keyOf(current.node) });
  }

  function cancelDrag() {
    if (!drag) return;
    drag.node.style.transition = "none";
    drag.node.style.transform = "";
    cleanupDrag(0);
  }

  function onDragMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var dx = ev.clientX - drag.startX;
    var dy = ev.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      drag.moved = true;
      drag.node.classList.add("is-dragging");
      document.body.classList.add("is-dragging");
      buzz(12);
    }

    if (typeof ev.preventDefault === "function") ev.preventDefault();
    drag.dx = dx;
    drag.dy = dy;
    drag.pointerX = ev.clientX;
    drag.pointerY = ev.clientY;
    paintGhost();
    if (drag.scroll && scrollRaf === null) scrollRaf = global.requestAnimationFrame(stepScroll);
    maybeSwap();
  }

  function onDragEnd(ev) {
    if (!drag) return;
    if (typeof ev.pointerId !== "undefined" && ev.pointerId !== drag.id) return;

    if (drag.moved) {
      /* 松手：位移归零，节点吸附回网格里的格位 */
      drag.node.style.transition = reduced() ? "none" : "transform 200ms cubic-bezier(.22,.61,.36,1)";
      drag.node.style.transform = "";
      cleanupDrag(220);
    } else {
      cleanupDrag(0);
    }
  }

  function bindDrag() {
    var home = el("#home");

    /* 捕获阶段抢先一步：排列模式里不让轮播与壁纸长按拿到这个手势 */
    on(
      home,
      "pointerdown",
      function (ev) {
        if (!editing) return;
        if (drag) return;
        var node = ev.target;
        if (!node || typeof node.closest !== "function") return;
        var target = dragTarget(node);
        if (!target) return;
        if (typeof ev.preventDefault === "function") ev.preventDefault();
        ev.stopPropagation();
        beginDrag(target, ev);
      },
      true
    );

    on(document, "pointermove", onDragMove, { passive: false });
    on(document, "pointerup", onDragEnd);
    on(document, "pointercancel", onDragEnd);
  }

  global.CalliaLayout = {
    DEFAULTS: DEFAULTS,
    isEditing: function () {
      return editing;
    },
    isDragging: function () {
      return !!drag && drag.moved;
    },
    enter: enter,
    exit: exit,
    reset: resetOrder,
    apply: applyOrder,
    applyApps: applyAppOrder,
    persist: persistOrder,
    suppress: function (ms) {
      suppressClickUntil = Date.now() + (ms || 320);
    }
  };

  /* 启动前清一次历史自由坐标：旧版本按整屏百分比钉住图标，现在只认网格顺序 */
  function clearStaleFree() {
    var st = settings();
    if (!st) return;
    if (st.appFree && typeof st.appFree === "object" && Object.keys(st.appFree).length) {
      st.appFree = {};
      var c = cos();
      if (c && typeof c.save === "function") c.save();
    }
  }

  /* ---------- 启动 ---------- */
  function boot() {
    clearStaleFree();
    applyOrder();
    applyAppOrder();
    bindEntries();
    bindHold();
    bindDrag();
    bindClickGuard();
    watchView();
    syncBar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);