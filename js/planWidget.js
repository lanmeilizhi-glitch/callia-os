/* ================================================================
   Callia OS · planWidget.js
   今日安排小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写待办这一项，不碰饮水、步数、睡眠、花销等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_plans";
  var MAX_ITEMS = 12;

  var MODAL = "plan-modal";
  var SHEET = "plan-sheet";
  var INPUT = "plan-input";
  var LIST = "plan-edit-list";

  var COUNT = "plan-count";
  var NEXT = "plan-next";
  var BAR = "plan-bar";

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function store() {
    var S = global.COS;
    return S && S.store ? S.store : null;
  }

  function basePlans() {
    return [
      { id: "p-plant", title: "给植物换水", meta: "今天 · 上午", done: false },
      { id: "p-read", title: "读完《安静的地方》第三章", meta: "今天 · 夜间", done: false },
      { id: "p-note", title: "整理一周随记", meta: "伴侣提醒", done: true }
    ];
  }

  /* 本机存档：默认与卡片初始值一致 */
  function readStored() {
    var raw = null;
    try {
      raw = global.localStorage.getItem(STORE_KEY);
    } catch (err) {
      raw = null;
    }
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
    } catch (err) {
      return null;
    }
  }

  function writeStored(list) {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch (err) {
      /* 隐私模式下写不进去时，页面上的清单仍然会更新 */
    }
  }

  function normalize(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item, i) {
      if (!item || typeof item !== "object") return;
      var title = String(item.title || "").trim().slice(0, 24);
      if (!title) return;
      out.push({
        id: String(item.id || "p-" + i + "-" + Date.now().toString(36)),
        title: title,
        meta: String(item.meta || "手动添加").slice(0, 16),
        done: !!item.done
      });
    });
    return out.slice(0, MAX_ITEMS);
  }

  /* 待办与「今日进度」小组件共用 S.store.tasks，优先读它 */
  function currentPlans() {
    var s = store();
    if (s && Array.isArray(s.tasks) && s.tasks.length) return normalize(s.tasks);
    var stored = readStored();
    if (stored && stored.length) return normalize(stored);
    return normalize(basePlans());
  }

  /* 把安排画到卡片上：完成数、进度条、下一件事 */
  function paintCard(list) {
    var plans = normalize(list || currentPlans());
    var done = plans.filter(function (p) {
      return p.done;
    }).length;
    var next = null;
    plans.forEach(function (p) {
      if (!p.done && !next) next = p;
    });

    var count = byId(COUNT);
    if (count) count.textContent = done + " / " + plans.length;

    var nextNode = byId(NEXT);
    if (nextNode) nextNode.textContent = next ? next.title : "今天的都完成了";

    var bar = byId(BAR);
    if (bar) {
      var pct = plans.length ? Math.round((done / plans.length) * 100) : 0;
      bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }

    paintEditor(plans);
  }

  /* 弹窗里的可编辑清单：勾选完成、删除 */
  function paintEditor(list) {
    var box = byId(LIST);
    if (!box) return;
    var plans = normalize(list || currentPlans());
    if (!plans.length) {
      box.innerHTML = '<p class="plan-edit__empty">今天还没有安排，先在上面写一件。</p>';
      return;
    }
    box.innerHTML = plans
      .map(function (p) {
        return (
          '<div class="plan-edit__row' +
          (p.done ? " is-done" : "") +
          '">' +
          '<button class="plan-edit__check" type="button" data-plan-toggle="' +
          esc(p.id) +
          '" aria-pressed="' +
          (p.done ? "true" : "false") +
          '" aria-label="切换完成状态"><i aria-hidden="true"></i></button>' +
          '<span class="plan-edit__title">' +
          esc(p.title) +
          "</span>" +
          '<span class="plan-edit__meta">' +
          esc(p.meta) +
          "</span>" +
          '<button class="plan-edit__del" type="button" data-plan-del="' +
          esc(p.id) +
          '" aria-label="删除这条安排">✕</button>' +
          "</div>"
        );
      })
      .join("");
  }

  /* 同步到生活数据（S.store.tasks），让「今日进度」小组件看到同一份清单 */
  function syncStore(list) {
    var S = global.COS;
    var s = store();
    if (!S || !s) return;
    var plans = normalize(list);
    s.tasks = plans.map(function (p) {
      return { id: p.id, title: p.title, meta: p.meta, done: p.done, ts: Date.now() };
    });
    if (typeof S.save === "function") S.save();
    if (S.homeWidgets && typeof S.homeWidgets.refresh === "function") S.homeWidgets.refresh();
  }

  /* ---------- 弹窗开关 ---------- */
  function openPlanModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    if (byId(INPUT)) byId(INPUT).value = "";
    paintEditor(currentPlans());

    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closePlanModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 编辑动作 ---------- */
  function addPlan() {
    var input = byId(INPUT);
    if (!input) return;
    var title = String(input.value || "").trim().slice(0, 24);
    if (!title) {
      var S0 = global.COS;
      if (S0 && S0.os && typeof S0.os.toast === "function") S0.os.toast("先写一件要做的事");
      return;
    }
    var list = currentPlans();
    if (list.length >= MAX_ITEMS) {
      var S1 = global.COS;
      if (S1 && S1.os && typeof S1.os.toast === "function") S1.os.toast("最多 " + MAX_ITEMS + " 条安排");
      return;
    }
    list.push({ id: "p-" + Date.now().toString(36), title: title, meta: "手动添加", done: false });
    input.value = "";
    writeStored(list);
    syncStore(list);
    paintCard(list);
  }

  function togglePlan(id) {
    if (!id) return;
    var list = currentPlans().map(function (p) {
      if (p.id !== id) return p;
      return { id: p.id, title: p.title, meta: p.meta, done: !p.done };
    });
    writeStored(list);
    syncStore(list);
    paintCard(list);
  }

  function removePlan(id) {
    if (!id) return;
    var list = currentPlans().filter(function (p) {
      return p.id !== id;
    });
    writeStored(list);
    syncStore(list);
    paintCard(list);
  }

  function savePlanData() {
    var list = currentPlans();
    writeStored(list);
    syncStore(list);
    paintCard(list);
    closePlanModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      var done = list.filter(function (p) {
        return p.done;
      }).length;
      S.os.toast("已保存安排 · " + done + " / " + list.length + " 完成");
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closePlanModal();
    });
  }

  /* 弹窗内的勾选与删除：事件委派，重绘后不用重新绑定 */
  function bindEditor() {
    var box = byId(LIST);
    if (!box) return;
    box.addEventListener("click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      var toggle = node.closest("[data-plan-toggle]");
      if (toggle) {
        togglePlan(toggle.getAttribute("data-plan-toggle"));
        return;
      }
      var del = node.closest("[data-plan-del]");
      if (del) removePlan(del.getAttribute("data-plan-del"));
    });
  }

  function boot() {
    bindMask();
    bindEditor();
    paintCard(currentPlans());
  }

  global.openPlanModal = openPlanModal;
  global.closePlanModal = closePlanModal;
  global.addPlan = addPlan;
  global.togglePlan = togglePlan;
  global.removePlan = removePlan;
  global.savePlanData = savePlanData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
