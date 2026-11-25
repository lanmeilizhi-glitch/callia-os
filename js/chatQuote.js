/* ===================================================================
   Callia OS · chatQuote.js
   聊天气泡「点击引用」——最简实现，纯前端 UI 状态，不碰发送接口与存储结构
   · 点一下气泡 → currentQuote = 这句话，输入框上方出现「引用 · 谁：文本」小框
   · 点框上的 × → currentQuote 清空，小框收起
   · 没有长按、没有定时器、没有浮层菜单
   对外只暴露 COS.quote：set / clear / mount / current
   =================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;
  if (!S) return;

  var PREVIEW_MAX = 20; /* 引用预览最多显示前 20 个字符 */

  /* 需求里说的那个状态变量：有值就显示引用提示框，没值就收起 */
  var currentQuote = null; /* { id, role, name, text, preview } */

  /* ---------- 小工具 ---------- */
  /* 只有真正的对话气泡可以引用：系统提示、正在输入、接口失败气泡都排除 */
  function bubbleOf(target) {
    if (!target || typeof target.closest !== "function") return null;
    var row = target.closest(".msg");
    if (!row) return null;
    if (row.classList.contains("msg--sys")) return null;
    if (row.classList.contains("msg--err")) return null;
    if (row.classList.contains("msg--typing")) return null;
    return row.getAttribute("data-mid") ? row : null;
  }

  function findMsg(mid) {
    var list = Array.isArray(S.store.chat) ? S.store.chat : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === mid) return list[i];
    }
    return null;
  }

  function speakerName(msg) {
    if (msg.role === "me") return "我";
    return (S.store.companion && S.store.companion.name) || "TA";
  }

  function previewOf(text) {
    var value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length <= PREVIEW_MAX) return value;
    return value.slice(0, PREVIEW_MAX) + "…";
  }

  /* ---------- 引用状态与预览框 ---------- */
  /* 引用提示框：currentQuote 有值就显示，没值就收起 */
  function paint() {
    var box = S.el("#chat-quote");
    if (!box) return;
    if (!currentQuote) {
      box.hidden = true;
      return;
    }
    var who = S.el("#chat-quote-who");
    var text = S.el("#chat-quote-text");
    if (who) who.textContent = "引用 · " + currentQuote.name;
    if (text) text.textContent = currentQuote.preview;
    box.hidden = false;
  }

  /* 点气泡时调用：把这句话存进 currentQuote */
  function setQuote(msg) {
    if (!msg || !msg.text) return;
    currentQuote = {
      id: msg.id,
      role: msg.role,
      name: speakerName(msg),
      text: String(msg.text),
      preview: previewOf(msg.text)
    };
    paint();
    if (S.os && typeof S.os.toast === "function") S.os.toast("已引用这句话");
  }

  /* 点 × 时调用：清空引用 */
  function clearQuote() {
    currentQuote = null;
    paint();
  }

  /* 聊天视图重绘（含从个人主页返回）后把引用状态接回去 */
  function mount() {
    paint();
  }

  /* ---------- 事件绑定：只有一个点击委托 ---------- */
  function bindClicks() {
    var root = global.document.getElementById("app-root");
    if (!root) return;
    root.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target || typeof target.closest !== "function") return;
      /* 点 × → 清空 currentQuote */
      if (target.closest("#chat-quote-close")) {
        clearQuote();
        return;
      }

      /* 点气泡 → 把这句话存进 currentQuote */
      var row = bubbleOf(target);
      if (!row) return;
      setQuote(findMsg(row.getAttribute("data-mid")));
    });
  }

  function init() {
    bindClicks();
  }

  S.quote = {
    set: setQuote,
    clear: clearQuote,
    mount: mount,
    current: function () {
      return currentQuote;
    }
  };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);