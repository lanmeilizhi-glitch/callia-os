/* ================================================================
   Callia OS · habitWidget.js
   今日习惯小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写习惯这一项，不碰饮水、步数、睡眠、花销等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_habits";
  var MAX_ITEMS = 6;

  var MODAL = "habit-modal";
  var SHEET = "habit-sheet";
  var INPUT = "habit-input";
  var LIST = "habit-edit-list";

  var COUNT = "habit-count";
  var CARD_LIST = "habit-list";

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

  function life() {
    var S = global.COS;
    return S && S.store && S.store.life ? S.store.life : null;
  }

  function baseHabits() {
    return [
      { id: "h-stretch", label: "拉伸十分钟", done: false, streak: 4 },
      { id: "h-read", label: "读二十页", done: true, streak: 7 },
      { id: "h-plant", label: "照顾植物", done: false, streak: 2 },
      { id: "h-water", label: "不喝糖饮", done: false, streak: 11 }
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
      var label = String(item.label || "").trim().slice(0, 12);
      if (!label) return;
      out.push({
        id: String(item.id || "h-" + i + "-" + Date.now().toString(36)),
        label: label,
        done: !!item.done,
        streak: Math.max(0, Math.min(999, parseInt(item.streak, 10) || 0))
      });
    });
    return out.slice(0, MAX_ITEMS);
  }

  function currentHabits() {
    var L = life();
    if (L && Array.isArray(L.habits) && L.habits.length) return normalize(L.habits);
    var stored = readStored();
    if (stored && stored.length) return normalize(stored);
    return normalize(baseHabits());
  }

  /* 把习惯画到卡片上：完成数 + 打卡清单 */
  function paintCard(list) {
    var habits = normalize(list || currentHabits());
    var done = habits.filter(function (h) {
      return h.done;
    }).length;

    var count = byId(COUNT);
    if (count) count.textContent = done + " / " + habits.length;

    var cardList = byId(CARD_LIST);
    if (cardList) {
      cardList.innerHTML = habits
        .map(function (h) {
          return (
            '<button class="habit' +
            (h.done ? " is-done" : "") +
            '" type="button" data-life="habit" data-id="' +
            esc(h.id) +
            '" aria-pressed="' +
            (h.done ? "true" : "false") +
            '"><i class="habit__box" aria-hidden="true"></i>' +
            '<span class="habit__label">' +
            esc(h.label) +
            "</span>" +
            '<span class="habit__streak">' +
            h.streak +
            " 天</span></button>"
          );
        })
        .join("");
    }

    paintEditor(habits);
  }

  /* 弹窗里的可编辑清单：改名、加减连续天数、删除 */
  function paintEditor(list) {
    var box = byId(LIST);
    if (!box) return;
    var habits = normalize(list || currentHabits());
    if (!habits.length) {
      box.innerHTML = '<p class="habit-edit__empty">还没有打卡项，先在上面写一个。</p>';
      return;
    }
    box.innerHTML = habits
      .map(function (h) {
        return (
          '<div class="habit-edit__row" data-habit-row="' +
          esc(h.id) +
          '">' +
          '<input class="habit-edit__name" type="text" maxlength="12" value="' +
          esc(h.label) +
          '" data-habit-name="' +
          esc(h.id) +
          '" aria-label="习惯名称">' +
          '<span class="habit-edit__streak">' +
          h.streak +
          " 天</span>" +
          '<button class="habit-edit__step" type="button" data-habit-streak="' +
          esc(h.id) +
          '" data-step="-1" aria-label="连续天数减一">−</button>' +
          '<button class="habit-edit__step" type="button" data-habit-streak="' +
          esc(h.id) +
          '" data-step="1" aria-label="连续天数加一">+</button>' +
          '<button class="habit-edit__del" type="button" data-habit-del="' +
          esc(h.id) +
          '" aria-label="删除这个打卡项">✕</button>' +
          "</div>"
        );
      })
      .join("");
  }

  /* 同步到生活数据（S.store.life.habits），让其他读取习惯的地方看到同一个值 */
  function syncStore(list) {
    var S = global.COS;
    if (!S || !S.store || !S.store.life) return;
    S.store.life.habits = normalize(list);
    if (typeof S.save === "function") S.save();
  }

  /* ---------- 弹窗开关 ---------- */
  function openHabitModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    if (byId(INPUT)) byId(INPUT).value = "";
    paintEditor(currentHabits());

    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeHabitModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 编辑动作 ---------- */
  function addHabit() {
    var input = byId(INPUT);
    if (!input) return;
    var label = String(input.value || "").trim().slice(0, 12);
    if (!label) {
      var S0 = global.COS;
      if (S0 && S0.os && typeof S0.os.toast === "function") S0.os.toast("先写一个打卡项的名字");
      return;
    }
    var list = currentHabits();
    if (list.length >= MAX_ITEMS) {
      var S1 = global.COS;
      if (S1 && S1.os && typeof S1.os.toast === "function") S1.os.toast("最多 " + MAX_ITEMS + " 个打卡项");
      return;
    }
    list.push({ id: "h-" + Date.now().toString(36), label: label, done: false, streak: 0 });
    input.value = "";
    writeStored(list);
    syncStore(list);
    paintCard(list);
  }

  function removeHabit(id) {
    if (!id) return;
    var list = currentHabits().filter(function (h) {
      return h.id !== id;
    });
    writeStored(list);
    syncStore(list);
    paintCard(list);
  }

  function stepStreak(id, step) {
    var delta = parseInt(step, 10) || 0;
    var list = currentHabits().map(function (h) {
      if (h.id !== id) return h;
      return {
        id: h.id,
        label: h.label,
        done: h.done,
        streak: Math.max(0, Math.min(999, h.streak + delta))
      };
    });
    writeStored(list);
    syncStore(list);
    paintCard(list);
  }

  /* 改名在输入框失焦时落盘，避免每敲一个字就重绘整张清单 */
  function renameHabit(id, value) {
    if (!id) return;
    var label = String(value || "").trim().slice(0, 12);
    var list = currentHabits().map(function (h) {
      if (h.id !== id) return h;
      return { id: h.id, label: label || h.label, done: h.done, streak: h.streak };
    });
    writeStored(list);
    syncStore(list);
    paintCard(list);
  }

  function saveHabitData() {
    var list = currentHabits();
    writeStored(list);
    syncStore(list);
    paintCard(list);
    closeHabitModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      var done = list.filter(function (h) {
        return h.done;
      }).length;
      S.os.toast("已保存习惯 · " + done + " / " + list.length + " 完成");
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeHabitModal();
    });
  }

  /* 弹窗内的增删改：全部走事件委派，重绘后不用重新绑定 */
  function bindEditor() {
    var box = byId(LIST);
    if (!box) return;
    box.addEventListener("click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      var del = node.closest("[data-habit-del]");
      if (del) {
        removeHabit(del.getAttribute("data-habit-del"));
        return;
      }
      var step = node.closest("[data-habit-streak]");
      if (step) {
        stepStreak(step.getAttribute("data-habit-streak"), step.getAttribute("data-step"));
      }
    });
    box.addEventListener("change", function (ev) {
      var node = ev.target;
      if (!node || !node.getAttribute) return;
      var id = node.getAttribute("data-habit-name");
      if (id) renameHabit(id, node.value);
    });
  }

  function boot() {
    bindMask();
    bindEditor();
    paintCard(currentHabits());
  }

  global.openHabitModal = openHabitModal;
  global.closeHabitModal = closeHabitModal;
  global.addHabit = addHabit;
  global.removeHabit = removeHabit;
  global.saveHabitData = saveHabitData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
