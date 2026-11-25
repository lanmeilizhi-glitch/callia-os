/* ================================================================
   Callia OS · focusWidget.js
   专注小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写专注这一项，不碰饮水、步数、睡眠、花销等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_focus";

  var MODAL = "focus-modal";
  var SHEET = "focus-sheet";
  var MINUTES = "focus-input-minutes";
  var GOAL = "focus-input-goal";
  var SESSIONS = "focus-input-sessions";

  var TIME_TEXT = "focus-time";
  var BAR = "focus-bar";
  var SESSIONS_TEXT = "focus-sessions";

  function byId(id) {
    return document.getElementById(id);
  }

  function clampInt(value, min, max) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = min;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function mmss(sec) {
    var s = Math.max(0, Math.round(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  function life() {
    var S = global.COS;
    return S && S.store && S.store.life ? S.store.life : null;
  }

  function baseFocus() {
    return { sessions: 1, seconds: 0, goal: 1500 };
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

  function currentFocus() {
    var base = baseFocus();
    var L = life();
    var src = L && L.focus && typeof L.focus === "object" ? L.focus : null;
    var stored = readStored();
    var pick = src || stored || base;
    return {
      seconds: clampInt(pick.seconds === undefined ? base.seconds : pick.seconds, 0, 3600),
      goal: clampInt(pick.goal === undefined ? base.goal : pick.goal, 300, 3600),
      sessions: clampInt(pick.sessions === undefined ? base.sessions : pick.sessions, 0, 40)
    };
  }

  /* 把专注画到卡片上：计时、进度条、段数 */
  function paintCard(data) {
    var f = data || currentFocus();

    var time = byId(TIME_TEXT);
    if (time) time.textContent = mmss(f.seconds);

    var bar = byId(BAR);
    if (bar) {
      var pct = f.goal > 0 ? (f.seconds / f.goal) * 100 : 0;
      bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }

    var sessions = byId(SESSIONS_TEXT);
    if (sessions) sessions.textContent = f.sessions;
  }

  /* 同步到生活数据（S.store.life.focus），让其他读取专注的地方看到同一个值 */
  function syncStore(data) {
    var S = global.COS;
    if (!S || !S.store || !S.store.life) return;
    S.store.life.focus = {
      seconds: data.seconds,
      goal: data.goal,
      sessions: data.sessions
    };
    if (typeof S.save === "function") S.save();
  }

  /* ---------- 弹窗开关 ---------- */
  function openFocusModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    var f = currentFocus();
    if (byId(MINUTES)) byId(MINUTES).value = Math.round(f.seconds / 60);
    if (byId(GOAL)) byId(GOAL).value = Math.round(f.goal / 60);
    if (byId(SESSIONS)) byId(SESSIONS).value = f.sessions;

    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeFocusModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 加减与保存 ---------- */
  function updateFocus(field, step) {
    var delta = parseInt(step, 10) || 0;
    var node = byId(field === "goal" ? GOAL : field === "sessions" ? SESSIONS : MINUTES);
    if (!node) return;
    var min = field === "goal" ? 5 : 0;
    var max = field === "goal" ? 60 : field === "sessions" ? 40 : 60;
    node.value = clampInt((parseInt(node.value, 10) || 0) + delta, min, max);
  }

  function saveFocusData() {
    var base = baseFocus();
    var minutes = clampInt(byId(MINUTES) ? byId(MINUTES).value : 0, 0, 60);
    var goalMin = clampInt(byId(GOAL) ? byId(GOAL).value : 25, 5, 60);
    var sessions = clampInt(byId(SESSIONS) ? byId(SESSIONS).value : base.sessions, 0, 40);

    var data = {
      seconds: minutes * 60,
      goal: goalMin * 60,
      sessions: sessions
    };

    if (byId(MINUTES)) byId(MINUTES).value = minutes;
    if (byId(GOAL)) byId(GOAL).value = goalMin;
    if (byId(SESSIONS)) byId(SESSIONS).value = sessions;

    writeStored(data);
    syncStore(data);
    paintCard(data);
    closeFocusModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast("已记录专注 · " + minutes + " / " + goalMin + " 分钟 · " + sessions + " 段");
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeFocusModal();
    });
  }

  /* 输入框失焦时把越界值收回来，避免出现 999 分钟 */
  function bindInputs() {
    var minutes = byId(MINUTES);
    if (minutes) {
      minutes.addEventListener("change", function () {
        minutes.value = clampInt(minutes.value, 0, 60);
      });
    }
    var goal = byId(GOAL);
    if (goal) {
      goal.addEventListener("change", function () {
        goal.value = clampInt(goal.value, 5, 60);
      });
    }
    var sessions = byId(SESSIONS);
    if (sessions) {
      sessions.addEventListener("change", function () {
        sessions.value = clampInt(sessions.value, 0, 40);
      });
    }
  }

  function boot() {
    bindMask();
    bindInputs();
    paintCard(currentFocus());
  }

  global.openFocusModal = openFocusModal;
  global.closeFocusModal = closeFocusModal;
  global.updateFocus = updateFocus;
  global.saveFocusData = saveFocusData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
