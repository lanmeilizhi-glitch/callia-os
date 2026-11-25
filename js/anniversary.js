/* =========================================================
   Companion OS · anniversary.js
   纪念日（倒数日）：完全独立的一页
   · 数据只存本机 localStorage 的 anniversary_data，刷新不丢
   · 天数全部用原生 Date 计算，不引任何第三方库
   · 不读写 COS.store，也不碰其它应用的存档
   ========================================================= */
(function (global) {
  "use strict";

  var S = global.COS;
  if (!S || !S.apps || !S.ui) return;

  var apps = S.apps;
  var ui = S.ui;
  var on = ui.on;

  var STORE_KEY = "anniversary_data";

  /* ---------- 存档：读不出好数据就当空列表 ---------- */
  function loadList() {
    var raw = "";
    try {
      raw = global.localStorage.getItem(STORE_KEY) || "";
    } catch (err) {
      return [];
    }
    if (!raw) return [];
    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(function (item) {
        return item && typeof item === "object" && isDateStr(item.date);
      })
      .map(function (item, index) {
        return {
          id: String(item.id || "ann_" + Date.now() + "_" + index),
          title: String(item.title || "").slice(0, 30) || "未命名纪念日",
          date: item.date
        };
      });
  }

  function saveList(list) {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch (err) {
      /* 隐私模式或存储写满：本次会话内仍然可见，不打断界面 */
    }
  }

  /* ---------- 日期工具（纯原生） ---------- */
  function isDateStr(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /* 把 "YYYY-MM-DD" 拆成本地零点的 Date；非法日期返回 null */
  function dayStart(value) {
    var p = String(value).split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  /* 当前时间到设定日期的整天差：未来为正、过去为负、今天为 0 */
  function diffDays(value) {
    var target = dayStart(value);
    if (!target) return null;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / 86400000);
  }

  /* 三种文案：还有 X 天 / 已经过去 X 天 / 就是今天！ */
  function statusText(item, diff) {
    var name = S.esc(item.title);
    if (diff === 0) return name + " 就是今天！";
    if (diff > 0) return "距离 " + name + " 还有 <b class=\"ann-num\">" + diff + "</b> 天";
    return name + " 已经过去 <b class=\"ann-num\">" + Math.abs(diff) + "</b> 天";
  }

  function dateLabel(value) {
    var p = String(value).split("-");
    var d = dayStart(value);
    var week = d ? ["日", "一", "二", "三", "四", "五", "六"][d.getDay()] : "";
    return Number(p[0]) + " 年 " + Number(p[1]) + " 月 " + Number(p[2]) + " 日" + (week ? " · 周" + week : "");
  }

  /* ---------- 渲染 ---------- */
  function card(item) {
    var diff = diffDays(item.date);
    if (diff === null) return "";
    var state = diff === 0 ? "today" : diff > 0 ? "future" : "past";
    return (
      '<article class="anncard anncard--' + state + '">' +
      '<div class="anncard__main">' +
      '<p class="anncard__title">' + S.esc(item.title) + "</p>" +
      '<p class="anncard__status">' + statusText(item, diff) + "</p>" +
      '<p class="anncard__date">' + S.esc(dateLabel(item.date)) + "</p>" +
      "</div>" +
      '<button class="anncard__del" type="button" data-del="' + S.esc(item.id) + '" aria-label="删除 ' + S.esc(item.title) + '"></button>' +
      "</article>"
    );
  }

  function listHtml(list) {
    if (!list.length) {
      return ui.empty("还没有纪念日", "写一件想记住的事，再挑一个日子，我会替你们数着。");
    }
    /* 未来的按由近到远排前面，已过去的按最近发生排后面 */
    var sorted = list.slice().sort(function (a, b) {
      var da = diffDays(a.date);
      var db = diffDays(b.date);
      var fa = da >= 0 ? 0 : 1;
      var fb = db >= 0 ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return fa === 0 ? da - db : db - da;
    });
    return '<div class="ann-grid">' + sorted.map(card).join("") + "</div>";
  }

  function countText(list) {
    var future = list.filter(function (item) {
      return diffDays(item.date) > 0;
    }).length;
    return "待倒数 " + future + " 个";
  }

  /* ---------- 页面 ---------- */
  apps.anniversary = {
    render: function (root) {
      root.innerHTML =
        ui.head("纪念日", "把重要的日子数给你听") +
        '<div class="app-body" id="ann-body">' +
        '<p class="sectitle"><span>倒数日</span><span id="ann-count"></span></p>' +
        '<div id="ann-list"></div>' +
        "</div>" +
        '<div class="app-foot ann-foot">' +
        '<div class="field"><input id="ann-title" type="text" maxlength="30" placeholder="事件名，例如：在一起纪念日" autocomplete="off"></div>' +
        '<div class="field"><input id="ann-date" type="date" aria-label="选择日期"><button class="chip" id="ann-add" type="button">添加</button></div>' +
        "</div>";

      ui.bindBack(root);

      var list = loadList();
      var body = S.el("#ann-body", root);

      function refresh() {
        var box = S.el("#ann-list", root);
        if (!box) return;
        box.innerHTML = listHtml(list);
        var count = S.el("#ann-count", root);
        if (count) count.textContent = countText(list);
      }

      function addEvent() {
        var titleInput = S.el("#ann-title", root);
        var dateInput = S.el("#ann-date", root);
        var title = titleInput && titleInput.value ? titleInput.value.trim() : "";
        var date = dateInput && dateInput.value ? dateInput.value : "";

        if (!title) {
          S.os.toast("先写一个事件名");
          if (titleInput) titleInput.focus();
          return;
        }
        if (!isDateStr(date)) {
          S.os.toast("先选一个日期");
          if (dateInput) dateInput.focus();
          return;
        }

        list.push({
          id: "ann_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          title: title.slice(0, 30),
          date: date
        });
        saveList(list);
        if (titleInput) titleInput.value = "";
        if (dateInput) dateInput.value = "";
        S.os.toast("已记下这个日子");
        refresh();
        if (body) body.scrollTop = 0;
      }

      refresh();

      on(S.el("#ann-add", root), "click", addEvent);

      /* 事件名输入框回车 = 直接添加，手机上少找按钮 */
      on(S.el("#ann-title", root), "keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          addEvent();
        }
      });

      on(body, "click", function (ev) {
        var del = ev.target.closest("[data-del]");
        if (!del) return;
        var id = del.getAttribute("data-del");
        var next = list.filter(function (item) {
          return item.id !== id;
        });
        if (next.length === list.length) return;
        list = next;
        saveList(list);
        S.os.toast("已删除这条纪念日");
        refresh();
      });
    }
  };
})(window);
