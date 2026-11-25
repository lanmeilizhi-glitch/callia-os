/* ================================================================
   Callia OS · sleepWidget.js
   睡眠小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写睡眠这一项，不碰饮水、步数、花销、天气等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_sleep";

  var MODAL = "sleep-modal";
  var SHEET = "sleep-sheet";
  var HOURS = "sleep-input-hours";
  var QUALITY = "sleep-input-quality";
  var BED = "sleep-input-bed";
  var WAKE = "sleep-input-wake";

  var HOURS_TEXT = "sleep-hours";
  var QUALITY_TEXT = "sleep-quality";
  var TIME_TEXT = "sleep-time";
  var PHASES = "sleep-phases";

  function byId(id) {
    return document.getElementById(id);
  }

  function clampHours(value) {
    var n = parseFloat(value);
    if (!isFinite(n)) n = 0;
    if (n < 0) n = 0;
    if (n > 14) n = 14;
    return Math.round(n * 10) / 10;
  }

  function clampQuality(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = 0;
    if (n < 0) n = 0;
    if (n > 100) n = 100;
    return n;
  }

  /* 时间只收 HH:MM，认不出就退回默认值 */
  function clampClock(value, fallback) {
    var text = String(value === null || value === undefined ? "" : value).trim();
    var hit = text.match(/^(\d{1,2})\s*[:：.]\s*(\d{1,2})$/);
    if (!hit) return fallback;
    var h = parseInt(hit[1], 10);
    var m = parseInt(hit[2], 10);
    if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return fallback;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function life() {
    var S = global.COS;
    return S && S.store && S.store.life ? S.store.life : null;
  }

  function baseSleep() {
    return { hours: 6.8, bed: "23:42", wake: "06:26", quality: 74 };
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
      if (!data || typeof data !== "object") return null;
      return data;
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

  function currentSleep() {
    var base = baseSleep();
    var L = life();
    var src = L && L.sleep && typeof L.sleep === "object" ? L.sleep : null;
    var stored = readStored();
    var pick = src || stored || base;
    return {
      hours: clampHours(pick.hours === undefined ? base.hours : pick.hours),
      quality: clampQuality(pick.quality === undefined ? base.quality : pick.quality),
      bed: clampClock(pick.bed, base.bed),
      wake: clampClock(pick.wake, base.wake)
    };
  }

  /* 深浅睡分布按质量粗算，和卡片上的三段色条保持一致 */
  function phasesOf(quality) {
    var deep = Math.max(8, Math.round(quality * 0.32));
    var awake = Math.max(4, Math.round((100 - quality) * 0.24));
    var light = Math.max(10, 100 - deep - awake);
    return [
      { label: "深睡", value: deep },
      { label: "浅睡", value: light },
      { label: "清醒", value: awake }
    ];
  }

  /* 把睡眠画到卡片上：时长、质量、入睡醒来、色条 */
  function paintCard(data) {
    var s = data || currentSleep();

    var hours = byId(HOURS_TEXT);
    if (hours) hours.textContent = s.hours.toFixed(1);

    var quality = byId(QUALITY_TEXT);
    if (quality) quality.textContent = "质量 " + s.quality;

    var time = byId(TIME_TEXT);
    if (time) time.textContent = s.bed + " 入睡 · " + s.wake + " 醒来";

    var bar = byId(PHASES);
    if (bar) {
      bar.innerHTML = phasesOf(s.quality)
        .map(function (p) {
          return '<i class="sleep__seg" style="flex:' + Math.max(1, p.value) + ' 1 0"></i>';
        })
        .join("");
    }
  }

  /* 同步到生活数据（S.store.life.sleep），让其他读取睡眠的地方看到同一个值 */
  function syncStore(data) {
    var S = global.COS;
    if (!S || !S.store || !S.store.life) return;
    var L = S.store.life;
    var prev = L.sleep && typeof L.sleep === "object" ? L.sleep : {};
    L.sleep = {
      hours: data.hours,
      bed: data.bed,
      wake: data.wake,
      quality: data.quality,
      phases: phasesOf(data.quality)
    };
    if (!L.sleep.phases || !L.sleep.phases.length) L.sleep.phases = prev.phases || phasesOf(data.quality);
    if (typeof S.save === "function") S.save();
  }

  /* ---------- 弹窗开关 ---------- */
  function openSleepModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    var s = currentSleep();
    if (byId(HOURS)) byId(HOURS).value = s.hours;
    if (byId(QUALITY)) byId(QUALITY).value = s.quality;
    if (byId(BED)) byId(BED).value = s.bed;
    if (byId(WAKE)) byId(WAKE).value = s.wake;

    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeSleepModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 加减与保存 ---------- */
  function updateSleep(field, step) {
    var delta = parseFloat(step) || 0;
    if (field === "quality") {
      var q = byId(QUALITY);
      if (!q) return;
      q.value = clampQuality((parseInt(q.value, 10) || 0) + delta);
      return;
    }
    var input = byId(HOURS);
    if (!input) return;
    input.value = clampHours((parseFloat(input.value) || 0) + delta);
  }

  function saveSleepData() {
    var base = baseSleep();
    var data = {
      hours: clampHours(byId(HOURS) ? byId(HOURS).value : base.hours),
      quality: clampQuality(byId(QUALITY) ? byId(QUALITY).value : base.quality),
      bed: clampClock(byId(BED) ? byId(BED).value : base.bed, base.bed),
      wake: clampClock(byId(WAKE) ? byId(WAKE).value : base.wake, base.wake)
    };

    if (byId(HOURS)) byId(HOURS).value = data.hours;
    if (byId(QUALITY)) byId(QUALITY).value = data.quality;
    if (byId(BED)) byId(BED).value = data.bed;
    if (byId(WAKE)) byId(WAKE).value = data.wake;

    writeStored(data);
    syncStore(data);
    paintCard(data);
    closeSleepModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast("已记录睡眠 · " + data.hours.toFixed(1) + " 小时 · 质量 " + data.quality);
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeSleepModal();
    });
  }

  /* 输入框失焦时把越界值收回来，避免出现 30 小时 */
  function bindInputs() {
    var hours = byId(HOURS);
    if (hours) {
      hours.addEventListener("change", function () {
        hours.value = clampHours(hours.value);
      });
    }
    var quality = byId(QUALITY);
    if (quality) {
      quality.addEventListener("change", function () {
        quality.value = clampQuality(quality.value);
      });
    }
    var bed = byId(BED);
    if (bed) {
      bed.addEventListener("change", function () {
        bed.value = clampClock(bed.value, baseSleep().bed);
      });
    }
    var wake = byId(WAKE);
    if (wake) {
      wake.addEventListener("change", function () {
        wake.value = clampClock(wake.value, baseSleep().wake);
      });
    }
  }

  function boot() {
    bindMask();
    bindInputs();
    paintCard(currentSleep());
  }

  global.openSleepModal = openSleepModal;
  global.closeSleepModal = closeSleepModal;
  global.updateSleep = updateSleep;
  global.saveSleepData = saveSleepData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
