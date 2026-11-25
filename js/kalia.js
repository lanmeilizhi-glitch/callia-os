/* ==================================================================
   Callia OS · kalia.js
   卡莉娅（Callia）AI 智能管家 —— 完全独立模块。
   独立界面：#kalia-page（index.html 最外层，默认隐藏）
   独立数据：kaliaMessages（只存卡莉娅自己的聊天记录）
   接口：不再自己写 fetch，直接复用主聊天同一个底层通道 COS.api.requestRaw()，
         地址拼接、鉴权头、超时、错误映射全部与主聊天一致，
         只把 kaliaMessages 作为参数传进去。
   ================================================================== */

/* 卡莉娅专属记忆：只存本模块的聊天记录，与主聊天完全隔离 */
let kaliaMessages = [];

/* 卡莉娅专属人设：每次发送前插到 kaliaMessages 开头 */
const KALIA_SYSTEM_PROMPT =
  "你现在是‘卡莉娅机’的智能管家，中文名叫卡莉娅（Callia）。请用温柔、简洁、可爱的语气，解答用户关于本软件的使用问题（比如怎么填 API、树洞模式是什么、怎么换头像），以及提供基础的情绪陪伴。你不是用户的伴侣，你是系统的向导。";

/* 未配置接口时的兜底台词 */
const KALIA_NO_API_TEXT = "主人，我还没有被接入大脑（API）哦，请先去设置里帮我把接口配好～";

/* 接口配置键：与设置页共用同一组 localStorage 键名 */
const KALIA_KEYS = { url: "api_url", key: "api_key", model: "api_model" };

/* 发送中标记：防止连点重复请求 */
let kaliaSending = false;

/* ---------- 小工具 ---------- */
function kaliaEl(id) {
  return document.getElementById(id);
}

/* 转义：气泡用 innerHTML 渲染，用户输入必须先转义 */
function kaliaEsc(text) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function kaliaRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return String(raw).trim();
  } catch (err) {
    return fallback;
  }
}

/* ---------- 渲染 ---------- */
/* 用最基础的 innerHTML 拼气泡，不写闭包、不用 document.write */
function kaliaRenderLog() {
  const log = kaliaEl("kalia-chat-log");
  if (!log) return;
  let html = "";
  for (let i = 0; i < kaliaMessages.length; i += 1) {
    const msg = kaliaMessages[i];
    if (!msg || msg.role === "system") continue;
    const who = msg.role === "user" ? "user" : "kalia";
    const name = msg.role === "user" ? "我" : "卡莉娅";
    html +=
      '<div class="kalia-msg kalia-msg--' + who + '">' +
      '<span class="kalia-msg__name">' + name + "</span>" +
      '<div class="kalia-bubble">' + kaliaEsc(msg.content) + "</div>" +
      "</div>";
  }
  log.innerHTML = html;
  log.scrollTop = log.scrollHeight;
}

/* 追加一条消息并重绘 */
function kaliaPush(role, content) {
  kaliaMessages.push({ role: role, content: String(content) });
  kaliaRenderLog();
}

/* 只显示一条卡莉娅的临时提示（不写进记忆） */
function kaliaShowTip(text) {
  const log = kaliaEl("kalia-chat-log");
  if (!log) return;
  log.innerHTML =
    '<div class="kalia-msg kalia-msg--kalia">' +
    '<span class="kalia-msg__name">卡莉娅</span>' +
    '<div class="kalia-bubble">' + kaliaEsc(text) + "</div>" +
    "</div>";
  log.scrollTop = log.scrollHeight;
}

/* ---------- 页面开关 ---------- */
function openKaliaPage() {
  const page = kaliaEl("kalia-page");
  if (!page) return;
  page.style.display = "flex";
  page.setAttribute("aria-hidden", "false");
  if (!kaliaMessages.length) {
 	aliaShowTip("你好呀，我是卡莉娅～ 是卡莉娅机的小管家^^ 软件怎么用、心里闷闷的，都可以问我。");
  } else {
    kaliaRenderLog();
  }
}

function closeKaliaPage() {
  const page = kaliaEl("kalia-page");
  if (!page) return;
  page.style.display = "none";
  page.setAttribute("aria-hidden", "true");
  const input = kaliaEl("kalia-input");
  if (input) input.blur();
}

/* ---------- 发送 ----------
   可选参数 preset：快捷提问标签点一下就把写死的文字传进来，
   不传时照旧读输入框。两条路径后面的逻辑完全一致，没有第二套请求。 */
function sendKaliaMessage(preset) {
  const input = kaliaEl("kalia-input");
  const fromChip = typeof preset === "string" && preset.trim() ? preset.trim() : "";
  const text = fromChip || (input ? String(input.value || "").trim() : "");
  if (!text) return;
  if (kaliaSending) return;

  /* 1. 用户消息上屏并进记忆 */
  kaliaPush("user", text);
  if (input) input.value = "";

  /* 2. 人设注入：每次发送前把系统提示词插到 kaliaMessages 开头 */
  kaliaMessages.unshift({ role: "system", content: KALIA_SYSTEM_PROMPT });

  /* 3. 兜底：没配 API Key 就直接回复，不发请求 */
  const apiKey = kaliaRead(KALIA_KEYS.key, "");
  if (!apiKey) {
    kaliaPush("assistant", KALIA_NO_API_TEXT);
    return;
  }

  /* 4. 复用主聊天同一个底层通道：地址拼接、鉴权头、超时、错误映射
        全部交给 COS.api.requestRaw()，这里只把 kaliaMessages 传进去。
        不再自己写 fetch，也不会再因为地址拼错而 404。 */
  const api = window.COS && window.COS.api;
  if (!api || typeof api.requestRaw !== "function") {
    kaliaPush("assistant", "主人，接口通道还没准备好，稍后再试试～");
    return;
  }

  kaliaSending = true;
  kaliaShowTip("卡莉娅正在想…");

  api.requestRaw(kaliaMessages).then(function (res) {
    kaliaSending = false;

    if (!res || !res.ok) {
      const msg = res && res.message ? res.message : "接口没有回话";
      kaliaPush("assistant", "主人，" + msg + "～");
      return;
    }

    const reply = String(res.text || "").trim();
    if (!reply) {
      kaliaPush("assistant", "主人，我这次没想出话来，再问我一次好不好～");
      return;
    }

    kaliaPush("assistant", reply);
  });
}

/* ---------- 事件绑定：回车也能发送 ---------- */
(function bindKaliaEvents() {
  function bind() {
    const input = kaliaEl("kalia-input");
    if (!input) return;
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        sendKaliaMessage();
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
