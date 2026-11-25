/* ================================================================
   Callia OS · budgetWidget.js
   花销小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写花销这一项，不碰饮水、步数、睡眠、天气等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_budget";
  var MAX_MONEY = 999999;

  var MODAL = "budget-modal";
  var SHEET = "budget-sheet";
  var SPENT = "budget-input-spent";
  var TOTAL = "budget-input-total";

  var SPENT_TEXT = "budget-spent";
  var TOTAL_TEXT = "budget-total";
  var LEFT_TEXT = "budget-left";
  var ITEMS = "budget-items";

  function byId(id) {
    return document.getElementById(id);
  }

  function clampMoney(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = 0;
    if (n < 0) n = 0;
    if (n > MAX_MONEY) n = MAX_MONEY;
    return n;
  }

  function group(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function life() {
    var S = global.COS;
    return S && S.store && S.store.life ? S.store.life : null;
  }

  function baseBudget() {
    return {
      spent: 1268,
      total: 2400,
      items: [
        { label: "饮食", value: 512 },
        { label: "通勤", value: 186 },
        { label: "书与杂项", value: 270 }
      ]
    };
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
      return data && typeof data === "object" ? data : null;
    } catch (err) {
      return null;
    }
  }

  function writeStored(data) {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (err) {
      /* 隐私模式下写不进去时，页面上的数字仍然会更新 */
    }
  }

  function currentBudget() {
    var base = baseBudget();
    var L = life();
    var src = L && L.budget && typeof L.budget === "object" ? L.budget : null;
    var stored = readStored();
    var pick = src || stored || base;
    var items = Array.isArray(pick.items) && pick.items.length ? pick.items : base.items;
    return {
      spent: clampMoney(pick.spent === undefined ? base.spent : pick.spent),
      total: Math.max(100, clampMoney(pick.total === undefined ? base.total : pick.total)),
      items: items
    };
  }

  /* 分类明细按已花金额等比缩放，改完总额后卡片上的三条比例条仍然说得通 */
  function scaleItems(items, spent) {
    var list = Array.isArray(items) ? items : [];
    var sum = 0;
    list.forEach(function (it) {
      sum += Math.max(0, Number(it && it.value) || 0);
    });
    if (!sum) return list;
    var ratio = spent / sum;
    return list.map(function (it) {
      return {
        label: String((it && it.label) || "其它").slice(0, 8),
        value: Math.max(0, Math.round((Number(it && it.value) || 0) * ratio))
      };
    });
  }

  /* 把花销画到卡片上：已花、预算、剩余、分类明细 */
  function paintCard(data) {
    var b = data || currentBudget();
    var left = Math.max(0, b.total - b.spent);

    var spent = byId(SPENT_TEXT);
    if (spent) spent.textContent = group(b.spent);

    var total = byId(TOTAL_TEXT);
    if (total) total.textContent = "/ " + group(b.total);

    var leftNode = byId(LEFT_TEXT);
    if (leftNode) leftNode.textContent = "余 " + group(left);

    var list = byId(ITEMS);
    if (!list) return;
    list.innerHTML = (b.items || [])
      .slice(0, 3)
      .map(function (it) {
        var w = b.total ? Math.max(0, Math.min(100, (it.value / b.total) * 100)) : 0;
        return (
          '<div class="budget__row"><span>' +
          String(it.label) +
          "</span><b>" +
          group(it.value) +
          '</b><i style="--w:' +
          w.toFixed(1) +
          '%"></i></div>'
        );
      })
      .join("");
  }

  /* 同步到生活数据（S.store.life.budget），让其他读取花销的地方看到同一个值 */
  function syncStore(data) {
    var S = global.COS;
    if (!S || !S.store || !S.store.life) return;
    S.store.life.budget = {
      spent: data.spent,
      total: data.total,
      items: data.items
    };
    if (typeof S.save === "function") S.save();
  }

  /* ---------- 弹窗开关 ---------- */
  function openBudgetModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    var b = currentBudget();
    if (byId(SPENT)) byId(SPENT).value = b.spent;
    if (byId(TOTAL)) byId(TOTAL).value = b.total;

    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeBudgetModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 加减与保存 ---------- */
  function updateBudget(field, step) {
    var delta = parseInt(step, 10) || 0;
    var node = byId(field === "total" ? TOTAL : SPENT);
    if (!node) return;
    var next = clampMoney((parseInt(node.value, 10) || 0) + delta);
    if (field === "total" && next < 100) next = 100;
    node.value = next;
  }

  function saveBudgetData() {
    var base = baseBudget();
    var prev = currentBudget();
    var spent = clampMoney(byId(SPENT) ? byId(SPENT).value : base.spent);
    var total = clampMoney(byId(TOTAL) ? byId(TOTAL).value : base.total);
    if (total < 100) total = 100;

    var data = {
      spent: spent,
      total: total,
      items: scaleItems(prev.items, spent)
    };

    if (byId(SPENT)) byId(SPENT).value = spent;
    if (byId(TOTAL)) byId(TOTAL).value = total;

    writeStored(data);
    syncStore(data);
    paintCard(data);
    closeBudgetModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast("已记录花销 · 已花 " + group(spent) + " / 预算 " + group(total));
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeBudgetModal();
    });
  }

  /* 输入框失焦时把越界值收回来，避免出现负数 */
  function bindInputs() {
    var spent = byId(SPENT);
    if (spent) {
      spent.addEventListener("change", function () {
        spent.value = clampMoney(spent.value);
      });
    }
    var total = byId(TOTAL);
    if (total) {
      total.addEventListener("change", function () {
        var v = clampMoney(total.value);
        total.value = v < 100 ? 100 : v;
      });
    }
  }

  function boot() {
    bindMask();
    bindInputs();
    paintCard(currentBudget());
  }

  global.openBudgetModal = openBudgetModal;
  global.closeBudgetModal = closeBudgetModal;
  global.updateBudget = updateBudget;
  global.saveBudgetData = saveBudgetData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
