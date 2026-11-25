/* ================================================================
   Callia OS · drinkWidget.js
   饮水小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 只用 display + transform 控制显隐，没有任何路由跳转
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写饮水这一项，不碰睡眠、花销、天气等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_drink";
  var MAX_CUPS = 8;

  var MODAL = "drink-modal";
  var SHEET = "drink-sheet";
  var INPUT = "drink-input";
  var DISPLAY = "drink-current-val";
  var COUNT = "water-count";
  var GOAL = "water-goal";
  var BAR = "water-bar";

  function byId(id) {
    return document.getElementById(id);
  }

  function clampCups(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = 0;
    if (n < 0) n = 0;
    if (n > MAX_CUPS) n = MAX_CUPS;
    return n;
  }

  /* 本机存档：默认 1 杯 */
  function readStored() {
    var raw = null;
    try {
      raw = global.localStorage.getItem(STORE_KEY);
    } catch (err) {
      raw = null;
    }
    if (raw === null || raw === "") return 1;
    return clampCups(raw);
  }

  function writeStored(value) {
    try {
      global.localStorage.setItem(STORE_KEY, String(value));
    } catch (err) {
      /* 隐私模式下写不进去时，页面上的数字仍然会更新 */
    }
  }

  /* 目标杯数：优先用生活数据里的 waterGoal，兜底 8 */
  function goalCups() {
    var S = global.COS;
    var life = S && S.store && S.store.life ? S.store.life : null;
    var goal = life ? parseInt(life.waterGoal, 10) : NaN;
    if (!isFinite(goal) || goal <= 0) return MAX_CUPS;
    return goal;
  }

  /* 把杯数画到卡片上：数字、目标、进度条 */
  function paintCard(cups) {
    var value = clampCups(cups);
    var goal = goalCups();

    var display = byId(DISPLAY);
    if (display) display.textContent = String(value);

    var count = byId(COUNT);
    if (count && !display) count.textContent = String(value);

    var goalNode = byId(GOAL);
    if (goalNode) goalNode.textContent = "/ " + goal;

    var bar = byId(BAR);
    if (bar) {
      var pct = goal > 0 ? Math.round((value / goal) * 100) : 0;
      bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }
  }

  /* 同步到生活数据（S.store.life.water），让其他读取饮水的地方看到同一个值 */
  function syncStore(cups) {
    var S = global.COS;
    if (!S || !S.store || !S.store.life) return;
    S.store.life.water = cups;
    if (typeof S.save === "function") S.save();
  }

  function currentCups() {
    var S = global.COS;
    var life = S && S.store && S.store.life ? S.store.life : null;
    if (life && life.water !== undefined && life.water !== null) {
      var n = parseInt(life.water, 10);
      if (isFinite(n)) return clampCups(n);
    }
    return readStored();
  }

  /* ---------- 弹窗开关 ---------- */
  function openDrinkModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    var input = byId(INPUT);
    if (!modal || !sheet || !input) return;

    input.value = currentCups();
    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeDrinkModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 加减与保存 ---------- */
  function updateDrink(step) {
    var input = byId(INPUT);
    if (!input) return;
    var val = parseInt(input.value, 10);
    if (!isFinite(val)) val = 0;
    val = clampCups(val + (parseInt(step, 10) || 0));
    input.value = val;
  }

  function saveDrinkData() {
    var input = byId(INPUT);
    if (!input) return;
    var cups = clampCups(input.value);
    input.value = cups;

    writeStored(cups);
    syncStore(cups);
    paintCard(cups);
    closeDrinkModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast("已记录饮水 · " + cups + " / " + goalCups() + " 杯");
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeDrinkModal();
    });
  }

  /* 输入框失焦时把越界值收回来，避免出现 99 杯 */
  function bindInput() {
    var input = byId(INPUT);
    if (!input) return;
    input.addEventListener("change", function () {
      input.value = clampCups(input.value);
    });
  }

  function boot() {
    bindMask();
    bindInput();
    paintCard(currentCups());
  }

  global.openDrinkModal = openDrinkModal;
  global.closeDrinkModal = closeDrinkModal;
  global.updateDrink = updateDrink;
  global.saveDrinkData = saveDrinkData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
