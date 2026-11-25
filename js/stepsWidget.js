/* ================================================================
   Callia OS · stepsWidget.js
   步数小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写步数这一项，不碰饮水、睡眠、花销、天气等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_steps";
  var MAX_STEPS = 60000;
  var STEP_UNIT = 500;

  var MODAL = "steps-modal";
  var SHEET = "steps-sheet";
  var INPUT = "steps-input";
  var DISPLAY = "steps-current-val";
  var VALUE = "steps-value";
  var RING = "steps-ring";
  var GOAL = "steps-goal";

  function byId(id) {
    return document.getElementById(id);
  }

  function clampSteps(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = 0;
    if (n < 0) n = 0;
    if (n > MAX_STEPS) n = MAX_STEPS;
    return n;
  }

  /* 本机存档：默认 4820 步（与卡片初始值一致） */
  function readStored() {
    var raw = null;
    try {
      raw = global.localStorage.getItem(STORE_KEY);
    } catch (err) {
      raw = null;
    }
    if (raw === null || raw === "") return 4820;
    return clampSteps(raw);
  }

  function writeStored(value) {
    try {
      global.localStorage.setItem(STORE_KEY, String(value));
    } catch (err) {
      /* 隐私模式下写不进去时，页面上的数字仍然会更新 */
    }
  }

  function life() {
    var S = global.COS;
    return S && S.store && S.store.life ? S.store.life : null;
  }

  /* 目标步数：优先用生活数据里的 stepsGoal，兜底 8000 */
  function goalSteps() {
    var L = life();
    var goal = L ? parseInt(L.stepsGoal, 10) : NaN;
    if (!isFinite(goal) || goal <= 0) return 8000;
    return goal;
  }

  function currentSteps() {
    var L = life();
    if (L && L.steps !== undefined && L.steps !== null) {
      var n = parseInt(L.steps, 10);
      if (isFinite(n)) return clampSteps(n);
    }
    return readStored();
  }

  /* 卡片上的数字：>=10000 时显示成 12.4k，与 widgets.js 的 renderSteps 保持一致 */
  function formatSteps(steps) {
    return steps >= 10000 ? (steps / 1000).toFixed(1) + "k" : String(steps);
  }

  /* 把步数画到卡片上：数字、目标、环形进度 */
  function paintCard(steps) {
    var value = clampSteps(steps);
    var goal = goalSteps();

    var display = byId(DISPLAY);
    if (display) display.textContent = formatSteps(value);

    var valueNode = byId(VALUE);
    if (valueNode && !display) valueNode.textContent = formatSteps(value);

    var goalNode = byId(GOAL);
    if (goalNode) goalNode.textContent = "/ " + goal;

    var ring = byId(RING);
    if (ring) {
      var pct = goal > 0 ? (value / goal) * 100 : 0;
      ring.style.setProperty("--p", Math.max(0, Math.min(100, pct)).toFixed(1));
    }
  }

  /* 同步到生活数据（S.store.life.steps），让其他读取步数的地方看到同一个值 */
  function syncStore(steps) {
    var S = global.COS;
    if (!S || !S.store || !S.store.life) return;
    S.store.life.steps = steps;
    if (typeof S.save === "function") S.save();
  }

  /* ---------- 弹窗开关 ---------- */
  function openStepsModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    var input = byId(INPUT);
    if (!modal || !sheet || !input) return;

    input.value = currentSteps();
    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeStepsModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 加减与保存 ---------- */
  function updateSteps(step) {
    var input = byId(INPUT);
    if (!input) return;
    var val = parseInt(input.value, 10);
    if (!isFinite(val)) val = 0;
    val = clampSteps(val + (parseInt(step, 10) || 0));
    input.value = val;
  }

  function saveStepsData() {
    var input = byId(INPUT);
    if (!input) return;
    var steps = clampSteps(input.value);
    input.value = steps;

    writeStored(steps);
    syncStore(steps);
    paintCard(steps);
    closeStepsModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast("已记录步数 · " + steps + " / " + goalSteps() + " 步");
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeStepsModal();
    });
  }

  /* 输入框失焦时把越界值收回来，避免出现 999999 步 */
  function bindInput() {
    var input = byId(INPUT);
    if (!input) return;
    input.addEventListener("change", function () {
      input.value = clampSteps(input.value);
    });
  }

  function boot() {
    bindMask();
    bindInput();
    paintCard(currentSteps());
  }

  global.openStepsModal = openStepsModal;
  global.closeStepsModal = closeStepsModal;
  global.updateSteps = updateSteps;
  global.saveStepsData = saveStepsData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
