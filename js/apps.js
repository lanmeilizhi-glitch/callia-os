/* =========================================================
   Companion OS · apps.js
   共享 UI 助手 + 对话 / 心情 / 日程
   ========================================================= */
(function (global) {
  "use strict";

  var S = global.COS;
  var apps = {};

  /* ---------- 共享助手 ---------- */
  function head(title, sub, extra) {
    return (
      '<header class="app-head">' +
      '<button class="app-head__back" id="app-back" type="button" aria-label="返回桌面"></button>' +
      '<div class="app-head__title"><p>' + S.esc(title) + "</p><p>" + S.esc(sub || "") + "</p></div>" +
      (extra || "") +
      "</header>"
    );
  }

  function empty(title, hint) {
    return (
      '<div class="empty"><i aria-hidden="true"></i><p>' +
      S.esc(title) + "</p><p>" + S.esc(hint) + "</p></div>"
    );
  }

  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
  }

  function bindBack(root) {
    on(S.el("#app-back", root), "click", function () {
      S.os.home();
    });
  }

  S.ui = { head: head, empty: empty, on: on, bindBack: bindBack };

  /* =========================================================
     对话
     ========================================================= */
  var requestSeq = 0;

  /* ---------- 聊天页头像 ----------
     · TA 的气泡在左侧，头像自动同步档案页：先读本机的 zane_custom_avatar
       （档案页上传的照片），没有就退回桌面/档案页那套预设 Emoji 形象，
       再没有就一个默认 Emoji + 浅色底。
     · 你的气泡在右侧，点头像就能从相册换一张，存进 user_custom_avatar。
     头像一律是独立 div + background-image，不用 <img>，图片尺寸不一致也不会
     把气泡挤坏。全部用最基础的 getElementById / querySelectorAll + 直接绑
     事件，没有事件代理。 */
  var CHAR_AVATAR_KEY = "zane_custom_avatar";
  var USER_AVATAR_KEY = "user_custom_avatar";

  function storeGet(key) {
    var v = "";
    try {
      if (global.localStorage) v = global.localStorage.getItem(key) || "";
    } catch (err) {
      v = "";
    }
    return typeof v === "string" && v.indexOf("data:image/") === 0 ? v : "";
  }

  function storeSet(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, value);
    } catch (err) {
      /* 隐私模式或存储写满：这次打开照样看得到，不打断聊天 */
    }
  }

  /* TA 的头像：档案页上传的本机照片优先，其次桌面那套预设 Emoji 形象 */
  function charAvatarSrc() {
    var custom = storeGet(CHAR_AVATAR_KEY);
    if (custom) return custom;
    return S.avatar && typeof S.avatar.current === "function" ? S.avatar.current() : "";
  }

  /* 头像只画背景图；没有图就留一个默认 Emoji，底色由 CSS 的浅色块兜住 */
  function paintAvatar(node, src, fallbackEmoji) {
    if (!node) return;
    if (src) {
      node.style.backgroundImage = 'url("' + src + '")';
      node.textContent = "";
      return;
    }
    node.style.backgroundImage = "";
    node.textContent = fallbackEmoji;
  }

  /* 把当前头像贴到作用域里每一个头像 div（整屏重绘、新气泡进场都调用） */
  function paintChatAvatars(scope) {
    var root = scope || S.el("#chat-log");
    if (!root) return;
    var charSrc = charAvatarSrc();
    var userSrc = storeGet(USER_AVATAR_KEY);
    var chars = root.querySelectorAll(".char-avatar");
    for (var i = 0; i < chars.length; i++) paintAvatar(chars[i], charSrc, "📖");
    var users = root.querySelectorAll(".user-avatar");
    for (var j = 0; j < users.length; j++) paintAvatar(users[j], userSrc, "👤");
  }

  /* 点你的头像 → 调起相册。点击必须就地拦掉：#app-root 上挂着「点气泡引用」
     的委托，不拦住的话换头像会顺手把这句话引用进输入框。 */
  function openUserAvatarPicker(ev) {
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    var input = global.document.getElementById("user-avatar-upload");
    if (!input) {
      S.os.toast("头像入口还没准备好");
      return;
    }
    input.value = ""; /* 连续选同一张也会触发 change */
    input.click();
  }

  /* 每个头像 div 直接绑 click，绑过就跳过，重绘不会重复注册 */
  function bindUserAvatars(scope) {
    var root = scope || S.el("#chat-log");
    if (!root) return;
    var users = root.querySelectorAll(".user-avatar");
    for (var i = 0; i < users.length; i++) {
      if (users[i].getAttribute("data-avatar-bound") === "1") continue;
      users[i].setAttribute("data-avatar-bound", "1");
      on(users[i], "click", openUserAvatarPicker);
    }
  }

  /* 相册选完：转 Base64 存本机，再在 onload 里把聊天页所有你的头像换掉 */
  function onUserAvatarFile(ev) {
    var input = ev.currentTarget;
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (String(file.type || "").indexOf("image/") !== 0) {
      S.os.toast("只能选图片");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataURL = String(reader.result || "");
      if (dataURL.indexOf("data:image/") !== 0) {
        S.os.toast("这张图片读不出来");
        return;
      }
      storeSet(USER_AVATAR_KEY, dataURL);
      var log = S.el("#chat-log");
      if (!log) return;
      var users = log.querySelectorAll(".user-avatar");
      for (var i = 0; i < users.length; i++) paintAvatar(users[i], dataURL, "👤");
      S.os.toast("你的头像换好了");
    };
    reader.onerror = function () {
      S.os.toast("这张图片读不出来");
    };
    reader.readAsDataURL(file);
  }

  /* 文件框常驻 body（聊天页每次重绘都会重建 DOM），change 只绑一次 */
  function bindUserAvatarInput() {
    var input = global.document.getElementById("user-avatar-upload");
    if (!input || input.getAttribute("data-user-avatar-bound") === "1") return;
    input.setAttribute("data-user-avatar-bound", "1");
    on(input, "change", onUserAvatarFile);
  }

  /* 头像节点：TA 的在气泡左侧，你的在气泡右侧，都是空 div，图片由上面贴上去 */
  function charAvatarTag() {
    return '<div class="chat-avatar char-avatar" aria-hidden="true"></div>';
  }

  function userAvatarTag() {
    return '<div class="chat-avatar user-avatar" role="button" aria-label="换一张你的头像"></div>';
  }

  /* 你发出去的那句被读到之后，把「已送达」改成「已读」 */
  function markRead() {
    var list = Array.isArray(S.store.chat) ? S.store.chat : [];
    for (var i = list.length - 1; i >= 0; i -= 1) {
      if (!list[i] || list[i].role !== "me") continue;
      list[i].read = true;
      S.save();
      var node = S.el('.msg--me[data-mid="' + list[i].id + '"] .msg__read');
      if (node) {
        node.textContent = "已读";
        node.classList.add("is-read");
      }
      return;
    }
  }

  /* 未读徽标清零：主页伴侣图标上的数字取自 S.unreadNotes().length（未读留言条数）。
     进入聊天页就等于这些留言都看过了，这里统一标记已读并让主页重绘，
     否则回到桌面后图标上还挂着旧数字。 */
  function clearUnreadBadge() {
    var notes = Array.isArray(S.store.notes) ? S.store.notes : [];
    var changed = false;
    notes.forEach(function (n) {
      if (n && !n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) S.save();
    /* 桌面是常驻 DOM，徽标要主动重绘；home() 返回桌面时还会再刷一次作为兜底 */
    if (S.os && typeof S.os.refreshHome === "function") S.os.refreshHome();
  }

  /* 气泡正文：伴侣用外语回复时，原文正常字号，中文译文另起一块（小字、浅色、带分割线） */
  function bubbleBody(msg) {
    var main = '<span class="msg__text">' + S.esc(msg.text) + "</span>";
    if (msg.role !== "ai" || !msg.trans) return main;
    return (
      main +
      '<div class="msg__trans">' +
      '<span class="msg__trans__tag" aria-hidden="true">译</span>' +
      '<span class="msg__trans__text">' + S.esc(msg.trans) + "</span>" +
      "</div>"
    );
  }

  /* 气泡材质：先读设置页存在本机的 bubble_style，再用最基础的 if-else 上类名，
     分支里只有字面量类名，不做任何字符串拼接。
     类名只加在气泡 div（.msg__bubble）上，不会加到消息列表外层容器；
     glass / gradient / dark 各对应一套预设，其余值一律走默认 bubble-plain。 */
  function applyBubbleStyle(bubbleEl) {
    if (!bubbleEl) return;
    var style = localStorage.getItem("bubble_style") || "plain";
    if (style === "glass") bubbleEl.classList.add("bubble-glass");
    else if (style === "gradient") bubbleEl.classList.add("bubble-gradient");
    else if (style === "dark") bubbleEl.classList.add("bubble-dark");
    else bubbleEl.classList.add("bubble-plain");
  }

  /* 整屏重绘（打开聊天页 / 从个人主页返回）后，把材质补到每条气泡上。
     只挑你和 TA 的气泡，系统提示与接口报错气泡保持原样。 */
  function paintBubbleStyles() {
    var log = S.el("#chat-log");
    if (!log) return;
    var list = log.querySelectorAll(".msg--me .msg__bubble, .msg--ai .msg__bubble");
    for (var i = 0; i < list.length; i++) applyBubbleStyle(list[i]);
  }

  /* 情绪呼吸光：只切换 #emotion-ambient-light 的 className，分支里只有字面量类名，
     不做任何字符串拼接。happy / love / sad 各对应 apps.css 里的一条呼吸动画，
     normal、接口没给情绪词以及其余不认识的值一律置空，呼吸光自己退回 opacity: 0。 */
  function applyEmotionLight(emotion) {
    var light = S.el("#emotion-ambient-light");
    if (!light) return;
    if (emotion === "happy") light.className = "emotion-happy";
    else if (emotion === "love") light.className = "emotion-love";
    else if (emotion === "sad") light.className = "emotion-sad";
    else light.className = "";
  }

  /* 渲染前的最后一道闸：不管消息是从接口、主动消息还是旧存档里来的，
     都先补齐 role / type / id / ts。缺 role 的历史脏数据一律按伴侣（ai）
     处理，这样它一定会走下面的气泡模板，不会变成一行裸文本。 */
  function safeMsg(msg) {
    var raw = msg && typeof msg === "object" ? msg : {};
    var role = S.normalizeRole ? S.normalizeRole(raw.role) : raw.role === "me" || raw.role === "sys" ? raw.role : "ai";
    var type = S.normalizeType ? S.normalizeType(raw.type, role) : role === "sys" ? "notice" : "text";
    return {
      id: raw.id || S.uid("m"),
      role: role,
      type: type,
      text: String(raw.text === null || raw.text === undefined ? "" : raw.text),
      trans: raw.trans,
      emotion: raw.emotion,
      read: raw.read,
      ts: Number(raw.ts) || Date.now()
    };
  }

  function bubble(msg) {
    var m = safeMsg(msg);
    /* 系统提示也是聊天记录的一种，同样要带 data-type，
       这样列表里每一条 .msg 都能被 type 归类，不会出现无类型的裸节点。 */
    if (m.role === "sys") {
      return (
        '<div class="msg msg--sys" data-mid="' + m.id + '" data-type="' + m.type + '">' +
        '<div class="msg__bubble">' + S.esc(m.text) + "</div></div>"
      );
    }
    var isMe = m.role === "me";
    var cls = isMe ? "msg--me" : "msg--ai";
    /* 材质不再写死：气泡 div 先只给基础类，渲染完成后由 applyBubbleStyle 加预设类 */
    var bubbleCls = "msg__bubble";
    /* 隐藏情绪标签已在接口层剥掉，这里只把摘出来的情绪词挂到气泡上，
       气泡里依旧只显示正文。 */
    var emoAttr = !isMe && m.emotion ? ' data-emotion="' + S.esc(m.emotion) + '"' : "";
    var face = isMe ? userAvatarTag() : charAvatarTag();
    var read = isMe
      ? '<span class="msg__read' + (m.read ? " is-read" : "") + '">' + (m.read ? "已读" : "已送达") + "</span>"
      : "";
    /* UI：气泡下方的「存进记忆」小按钮不再渲染（只删 DOM 输出，
       记忆写入与 data-mem 事件处理逻辑原样保留）。
       布局：外层是横向 Flex——TA 的头像在气泡左边，你的头像在气泡右边，
       气泡与时间竖向包在 .msg__stack 里，头像固定 40px 不会被气泡挤压。 */
    return (
      '<div class="msg ' + cls + '" data-mid="' + m.id + '" data-type="' + m.type + '">' +
      (isMe ? "" : face) +
      '<div class="msg__stack">' +
      '<div class="' + bubbleCls + '"' + emoAttr + '>' + bubbleBody(m) + "</div>" +
      '<span class="msg__time">' + S.fmt.time(m.ts) + read + "</span>" +
      "</div>" +
      (isMe ? face : "") +
      "</div>"
    );
  }

  /* 对外唯一的「往聊天页追加一条消息」入口：
     主动消息、环境感知、语音陪伴都走这里，绝不允许再手写内联气泡 HTML。
     不在聊天页时返回 null，调用方只需保证数据已经入库。 */
  function renderMessage(msg) {
    var log = S.el("#chat-log");
    if (!log) return null;
    return appendBubble(msg);
  }

  function appendBubble(msg) {
    var log = S.el("#chat-log");
    if (!log) return null;
    log.insertAdjacentHTML("beforeend", bubble(msg));
    var node = log.lastElementChild;
    /* 新气泡一进场就按本机存的样式上材质 */
    if (node) applyBubbleStyle(node.querySelector(".msg__bubble"));
    /* 新气泡的头像当场贴上去：TA 的同步档案页，你的读本机上传的那张 */
    if (node) {
      paintChatAvatars(node);
      bindUserAvatars(node);
      bindCharAvatars(node);
    }
    /* 最新一条消息渲染完，按它身上的情绪词切换呼吸光；没有情绪词就置空 */
    applyEmotionLight(msg && msg.emotion);
    log.scrollTop = log.scrollHeight;
    return node;
  }

  function scrollBottom() {
    var log = S.el("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  }

  /* 快捷回复栏已按需求彻底删除，原 renderChips() 一并移除，
     输入框上方那个位置现在交给引用预览框（见 chatQuote.js）。 */

  function showTyping() {
    var log = S.el("#chat-log");
    if (!log) return null;
    log.insertAdjacentHTML(
      "beforeend",
      '<div class="msg msg--ai msg--typing" id="chat-typing">' +
        charAvatarTag() +
        '<div class="msg__stack"><div class="msg__bubble"><span class="dots"><i></i><i></i><i></i></span></div></div>' +
        "</div>"
    );
    var typing = S.el("#chat-typing");
    if (typing) applyBubbleStyle(typing.querySelector(".msg__bubble"));
    /* 正在输入的这条也带上 TA 的头像，和上面的气泡对齐 */
    if (typing) paintChatAvatars(typing);
    if (typing) bindCharAvatars(typing);
    scrollBottom();
    return typing;
  }

  /* ---------- 接口状态提示与失败反馈 ---------- */
  function gateCard(info) {
    if (info.ready) {
      return (
        '<div class="chat-gate is-ready">' +
        '<p class="chat-gate__title">已连接 · ' +
        S.esc(info.model) +
        "</p>" +
        '<p class="chat-gate__text">回复由这个模型生成，语气、长度和风格都取决于它本身。</p>' +
        "</div>"
      );
    }
    return (
      '<div class="chat-gate">' +
      "<p class=\"chat-gate__title\">还没接上接口</p>" +
      '<p class="chat-gate__text">' +
      S.esc(info.missing) +
      "。伴侣现在只能听你说，不会自己编台词。</p>" +
      '<button class="chip" type="button" data-open="settings">去连接接口</button>' +
      "</div>"
    );
  }

  function paintGate() {
    var slot = S.el("#chat-gate-slot");
    if (!slot) return;
    slot.innerHTML = gateCard(S.api.inspect());
  }

  function setSending(on) {
    var btn = S.el("#main-send-btn");
    if (!btn) return;
    btn.classList.toggle("is-busy", !!on);
  }

  function removeTyping(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function failBubble(res) {
    var log = S.el("#chat-log");
    if (!log) return;
    log.insertAdjacentHTML(
      "beforeend",
      '<div class="msg msg--err">' +
        '<div class="msg__bubble">' +
        S.esc(res.message || "接口没有返回可用内容") +
        "</div>" +
        '<div class="msg__acts">' +
        '<button class="chip" type="button" data-retry="1">重试</button>' +
        '<button class="chip chip--ghost" type="button" data-open="settings">检查接口</button>' +
        "</div>" +
        "</div>"
    );
    scrollBottom();
  }

  /* ---------- 纯手动留言板模式：只留言，点召唤才回复 ----------
     · 开启后每发一条只渲染气泡 + 入队，绝不请求接口；
     · 没有任何定时器：不点召唤键，大模型接口永远不会被触发；
     · 输入框为空时点召唤键，才把队列打包成一段话交给接口；
     · 开关关闭时完全走原来的「发一条回一条」，按钮永远是发送箭头。 */
  var pendingMessages = []; /* 还没送进接口的那几句原文 */
  var TREEHOLE_KEY = "treehole_mode"; /* 与设置页 js/apps2.js 共用同一个键 */

  /* 留言板模式开关：每次发送时现读，所以设置页改完立刻生效，
     换角色卡、重进聊天页也不用重新绑定。读不到就按关闭处理。 */
  function treeholeOn() {
    try {
      return global.localStorage.getItem(TREEHOLE_KEY) === "true";
    } catch (e) {
      return false;
    }
  }

  /* 初始化时清一次残留：上次报错可能留下没送出去的队列 */
  function resetPending() {
    pendingMessages = [];
  }
  resetPending();

  /* ---------- 底栏按钮：发送箭头 ⇄ 让Ta回复 (N) ----------
     按钮本体在 renderChatView 里生成，id 固定为 main-send-btn。
     变身只改 class 与文字，箭头图标由 CSS 的 ::after 画，
     所以召唤态把 ::after 关掉、把计数写进 data-count 即可。 */
  function sendBtn() {
    return S.el("#main-send-btn");
  }

  /* 按当前模式与队列长度刷新按钮外观：
     开关关闭 → 永远发送箭头；开关开启 → 召唤键，带队列计数。 */
  function paintSendBtn() {
    var btn = sendBtn();
    if (!btn) return;
    var on = treeholeOn();
    var count = pendingMessages.length;
    var summon = on && count > 0;
    btn.classList.toggle("is-summon", summon);
    btn.setAttribute("data-count", summon ? String(count) : "");
    btn.setAttribute("aria-label", summon ? "让Ta回复，已留言 " + count + " 条" : "发送");
    btn.setAttribute("title", summon ? "让Ta回复 (" + count + ")" : "发送");
  }

  /* 把攒下的几句拼成一段交给接口：一条就原样发，多条编号列出 */
  function packPending(list) {
    if (list.length === 1) return list[0];
    var lines = list.map(function (text, i) {
      return i + 1 + ". " + text;
    });
    return "（我连续发了几条消息）\n" + lines.join("\n");
  }

  /* 统一触发回复：取走队列 → 打包 → 走原来的 ask()。
     只有用户主动点召唤键（或点 TA 头像）才会走到这里，
     全程没有任何定时器，接口不会被自动触发。 */
  function flushPending() {
    /* 空队列绝不调接口，避免「没有可发送的内容」 */
    if (!pendingMessages || pendingMessages.length === 0) return false;
    var batch = pendingMessages.slice();
    pendingMessages = [];
    /* 队列已取走，按钮立刻回到发送箭头；接口失败也不会卡在召唤态 */
    paintSendBtn();
    ask(packPending(batch));
    return true;
  }

  /* 点 TA 左侧头像：队列里有话就立刻回，没有就什么都不做 */
  function onCharAvatarTap(ev) {
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    /* 第一行判空：队列空就什么都不做，不发任何请求 */
    if (!pendingMessages || pendingMessages.length === 0) return;
    flushPending();
  }

  /* 每个 TA 头像 div 直接绑 click，绑过就跳过，重绘不会重复注册 */
  function bindCharAvatars(scope) {
    var root = scope || S.el("#chat-log");
    if (!root) return;
    var chars = root.querySelectorAll(".char-avatar");
    for (var i = 0; i < chars.length; i++) {
      if (chars[i].getAttribute("data-reply-bound") === "1") continue;
      chars[i].setAttribute("data-reply-bound", "1");
      on(chars[i], "click", onCharAvatarTap);
    }
  }

  /* 把上下文交给接口，回复内容完全由所选模型决定 */
  function ask(packedText) {
    var info = S.api.inspect();
    if (!info.ready) {
      paintGate();
      S.os.toast("接口未连接 · " + info.missing);
      return;
    }
    if (S.api.busy()) {
      S.os.toast("上一条还在等接口回应");
      return;
    }

    var typing = showTyping();
    var token = requestSeq;
    setSending(true);

    /* packedText 是连续发送打包后的那段话；单条发送时就是原文。
       不传时沿用原来的上下文，接口封装本身一行没改。 */
    var req = typeof packedText === "string" && packedText ? S.api.chat(packedText) : S.api.chat();

    req.then(function (res) {
      removeTyping(typing);
      if (token !== requestSeq) return;
      setSending(false);

      if (!res.ok) {
        failBubble(res);
        S.os.toast("接口没有回话");
        return;
      }

      markRead();
      /* res.emotion 是接口层从 [emotion: xx] 里摘出来的情绪词，正文里已没有标签 */
      appendBubble(S.pushMsg("ai", res.text, res.trans, res.emotion));
      /* 人还在聊天页里，对话过程中产生的留言（日程提醒等）也算当场看过 */
      clearUnreadBadge();
      S.shiftMood(1);
      var level = S.addAffinity(2);
      if (level.leveled) S.os.toast("亲密度升到 Lv." + level.level);
      S.os.refreshHome();
      paintGate();
    });
  }

  function send(text) {
    /* 第一道闸：空内容直接结束，绝不往下走到接口 */
    var value = String(text === null || text === undefined ? "" : text).trim();
    if (!value) return;
    var input = S.el("#chat-input");
    if (input) input.value = "";
    /* 引用只是这条草稿的附属状态，发出去就收起；发送与存储逻辑未动 */
    if (S.quote && typeof S.quote.clear === "function") S.quote.clear();
    appendBubble(S.pushMsg("me", value));

    /* 存在感：今天说过话了，并从这句话里记下事实与提醒 */
    if (S.presence && typeof S.presence.remember === "function") {
      S.presence.markTalked();
      var got = S.presence.remember(value);
      if (got.facts && got.facts.length) {
        S.os.toast("我记下了：" + got.facts[got.facts.length - 1].text);
      } else if (got.reminder) {
        S.os.toast("记进日程：" + got.reminder.title);
      }
    }

    /* 严格读开关：只有字符串 'true' 才算开启 */
    var isBoard = treeholeOn();

    if (isBoard) {
      /* 纯手动留言板：只入队 + 刷新召唤键，立刻 return，
         绝不往下走到接口，也不挂任何定时器。 */
      pendingMessages.push(value);
      paintSendBtn();
      return;
    }

    /* 开关关闭：完全走原来的「发一条回一条」，立刻请求接口 */
    ask();
  }

  /* 底栏按钮点击：一个入口分三种情况
     1. 输入框有字 → 正常发消息（留言板模式下就是入队）；
     2. 输入框为空 + 队列有货 → 打包召唤，调接口；
     3. 输入框为空 + 队列为空 → 什么都不做，绝不调接口。 */
  function onSendBtnTap() {
    var input = S.el("#chat-input");
    var value = input ? String(input.value || "").trim() : "";
    if (value) {
      send(value);
      return;
    }
    if (!treeholeOn()) return;
    if (!pendingMessages || pendingMessages.length === 0) return;
    flushPending();
  }

  /* 右上角入口：TA 的资料、朋友圈和可搜索的聊天记录 */
  function homeEntry() {
    return (
      '<button class="chat__home" type="button" id="chat-home" aria-label="打开个人主页">' +
      '<i aria-hidden="true"></i><span>主页</span></button>'
    );
  }

  /* 对话视图：打开应用和从个人主页返回都走这里，不自增 requestSeq 才不会丢掉在途回复 */
  function renderChatView(root) {
    /* 挂载聊天页的第一步：清掉未读留言，图标小红点当场消失 */
    clearUnreadBadge();

    root.innerHTML =
      head(
        S.store.companion.name,
        S.companion.statusLine(),
        homeEntry()
      ) +
      '<div class="app-body" id="chat-log"></div>' +
      /* 引用预览框：长按气泡选「引用」后出现，占的就是原来快捷回复栏的位置 */
      '<div class="chat__quote" id="chat-quote" hidden>' +
      '<i class="chat__quote__bar" aria-hidden="true"></i>' +
      '<div class="chat__quote__body">' +
      '<p class="chat__quote__who" id="chat-quote-who"></p>' +
      '<p class="chat__quote__text" id="chat-quote-text"></p>' +
      "</div>" +
      '<button class="chat__quote__close" type="button" id="chat-quote-close" aria-label="取消引用">×</button>' +
      "</div>" +
      '<div class="app-foot chat__foot">' +
      '<div class="field"><input id="chat-input" type="text" maxlength="140" placeholder="说点什么…" autocomplete="off"></div>' +
      '<button class="btn btn--solid chat__send" id="main-send-btn" type="button" aria-label="发送"></button>' +
      "</div>";

    var headEl = root.querySelector(".app-head");
    if (headEl) headEl.classList.add("app-head--chat");

    bindBack(root);

    var log = S.el("#chat-log", root);
    log.innerHTML =
      '<div class="chat__day">' + S.fmt.date(Date.now()) + '</div><div id="chat-gate-slot"></div>';
    if (!S.store.chat.length) S.pushMsg("sys", "伴侣系统已就绪");
    var lastTs = S.store.chat.length ? Number(S.store.chat[0].ts) || 0 : 0;
    S.store.chat.forEach(function (m) {
      /* 隔了 20 分钟以上就插一条时间分隔，像真的聊天记录 */
      if (m.ts && lastTs && m.ts - lastTs > 20 * 60000) {
        log.insertAdjacentHTML("beforeend", '<div class="chat__day">' + S.fmt.time(m.ts) + "</div>");
        lastTs = m.ts;
      }
      /* 每条记录都走 bubble()：它内部会先 safeMsg() 补齐 role / type，
         所以旧存档里缺 role 的脏数据也会被当成伴侣发言渲染成完整气泡，
         绝不会在列表里直接抛出一行裸文本。 */
      log.insertAdjacentHTML("beforeend", bubble(m));
    });
    /* 历史气泡统一上材质：只处理你和 TA 的气泡 */
    paintBubbleStyles();
    /* 整屏重绘后：上传框只绑一次，再把每条气泡的头像贴上去，
       并给每条气泡右侧你的头像直接绑上点击（无事件代理）。 */
    bindUserAvatarInput();
    paintChatAvatars(log);
    bindUserAvatars(log);
    /* TA 左侧头像：队列里有攒着的消息时，点一下就立刻统一回复 */
    bindCharAvatars(log);
    /* 整屏重绘后，呼吸光跟着最后一条消息的情绪走 */
    applyEmotionLight(S.store.chat.length ? S.store.chat[S.store.chat.length - 1].emotion : "");

    paintGate();
    scrollBottom();
    /* 引用属于输入草稿的一部分：从个人主页回来重绘后原样接回去 */
    if (S.quote && typeof S.quote.mount === "function") S.quote.mount();

    /* 从个人主页回来时接口可能还在回话，把等待状态原样接回去 */
    if (S.api && S.api.busy()) {
      showTyping();
      setSending(true);
    }

    /* 底栏按钮：发送 / 召唤共用同一个入口，按输入框与队列状态分流 */
    on(S.el("#main-send-btn", root), "click", onSendBtnTap);
    /* 重绘后按当前模式与队列长度还原按钮外观 */
    paintSendBtn();

    on(S.el("#chat-home", root), "click", function () {
      openCharHome(root);
    });

    on(log, "click", function (ev) {
      if (ev.target.closest("[data-retry]")) {
        ask();
        return;
      }
      var mem = ev.target.closest("[data-mem]");
      if (!mem) return;
      var mid = mem.getAttribute("data-mem");
      var item = S.store.chat.filter(function (m) {
        return m.id === mid;
      })[0];
      if (!item || !item.text) return;
      S.addMemory(String(item.text).replace(/\s+/g, " ").slice(0, 12), item.text);
      mem.textContent = "已存进记忆";
      mem.setAttribute("disabled", "");
      S.os.toast("已洗成一张胶片");
      S.os.refreshHome();
    });
  }

  /* ---------- 个人主页：同一个对话应用里的第二个视图 ---------- */
  var chatRoot = null; /* #app-root，打开应用时记下来 */
  var inCharHome = false; /* 现在停在对话还是个人主页 */

  function charHomeApi() {
    return global.CalliaCharHome && typeof global.CalliaCharHome.open === "function"
      ? global.CalliaCharHome
      : null;
  }

  /* 回对话只重绘视图，绝不自增 requestSeq，在途的接口回复才不会丢 */
  function leaveCharHome() {
    var home = charHomeApi();
    if (home && typeof home.close === "function") home.close();
    inCharHome = false;
    renderChatView(chatRoot || S.el("#app-root"));
  }

  /* 从搜索结果跳回原来那条消息，闪一下告诉你是哪条 */
  function jumpToMessage(id) {
    var root = chatRoot || S.el("#app-root");
    leaveCharHome();
    var log = S.el("#chat-log", root);
    var node = S.el('.msg[data-mid="' + id + '"]', root);
    if (!log || !node) {
      S.os.toast("这条记录有些久了，往上翻翻看");
      return;
    }
    var box = log.getBoundingClientRect();
    var hit = node.getBoundingClientRect();
    log.scrollTop += hit.top - box.top - log.clientHeight / 2 + hit.height / 2;
    node.classList.add("is-flash");
    global.setTimeout(function () {
      node.classList.remove("is-flash");
    }, 1600);
  }

  function openCharHome(root) {
    var home = charHomeApi();
    if (!home) {
      S.os.toast("个人主页暂时打不开");
      return;
    }
    chatRoot = root;
    inCharHome = true;
    home.open(root, { back: leaveCharHome, jump: jumpToMessage });
  }

  apps.chat = {
    render: function (root) {
      chatRoot = root;
      inCharHome = false;
      renderChatView(root);
    },
    /* homebar 先退回对话，再退回桌面 */
    onBack: function () {
      if (!inCharHome) return false;
      leaveCharHome();
      return true;
    },
    /* 统一渲染入口：任何模块往聊天页追加消息都调这里，
       保证每条记录都包在 .msg 气泡容器里（带头像与时间）。 */
    renderMessage: renderMessage,
    teardown: function () {
      var home = charHomeApi();
      if (home && typeof home.close === "function") home.close();
      chatRoot = null;
      inCharHome = false;
      /* 离开聊天页回到桌面，呼吸光当场收起，不会跟着带到其他界面 */
      applyEmotionLight("");
      requestSeq += 1;
      setSending(false);
      /* 离开聊天页：攒着的留言不丢，下次进聊天页点召唤键再发 */
      if (S.api) S.api.abort();
    }
  };

  /* =========================================================
     心情
     ========================================================= */
  function daysTogether() {
    return Math.max(1, Math.round((Date.now() - S.store.companion.metAt) / 86400000));
  }

  /* 近 7 日心情曲线：只画 TA 自己的心情值（store.stats.moodHistory），
     不掺任何 user 侧数据。viewBox 固定，宽度交给 CSS 自适应，
     所以窄屏 / 宽屏都不会溢出或留白。 */
  function sparkSvg(list) {
    var w = 280;
    var h = 84;
    var pad = 10;
    var data = (Array.isArray(list) ? list : []).slice(-7);
    if (!data.length) data = [S.store.companion.moodValue];
    var step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
    var pts = data.map(function (v, i) {
      var x = Math.round((pad + i * step) * 10) / 10;
      var y = Math.round(h - pad - (S.clamp(v, 0, 100) / 100) * (h - pad * 2));
      return [x, y];
    });
    var line = pts.map(function (p) { return p.join(","); }).join(" ");
    var dots = pts
      .map(function (p, i) {
        var now = i === pts.length - 1 ? " is-now" : "";
        return '<circle class="pt' + now + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (now ? 4 : 2.6) + '"></circle>';
      })
      .join("");
    var area =
      "M" + pts[0][0] + "," + (h - pad) + " " +
      pts.map(function (p) { return "L" + p[0] + "," + p[1]; }).join(" ") +
      " L" + pts[pts.length - 1][0] + "," + (h - pad) + " Z";
    return (
      '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="近 7 日心情曲线">' +
      '<line class="axis" x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '"></line>' +
      '<line class="axis axis--mid" x1="' + pad + '" y1="' + h / 2 + '" x2="' + (w - pad) + '" y2="' + h / 2 + '"></line>' +
      '<path class="area" d="' + area + '"></path>' +
      '<polyline class="line" points="' + line + '"></polyline>' +
      dots +
      "</svg>"
    );
  }

  /* 心情页只展示 TA 自己的心情：没有 user 手记输入、没有 user 记录列表。
     顶部五个状态是纯展示位（不可点击、不切换心情），
     下面的大数字 + 描述语是 TA 当前心情，数据卡片是这份心情的背景支撑。 */
  function renderMoodBody() {
    var m = S.mood();
    var st = S.store.stats;
    var c = S.store.companion;
    var mem = S.store.memories.length;
    var lv = S.levelProgress(c.affinity);
    var hist = Array.isArray(st.moodHistory) ? st.moodHistory.slice(-7) : [];
    var prev = hist.length > 1 ? hist[hist.length - 2] : c.moodValue;
    var delta = c.moodValue - prev;
    var trend = delta > 0 ? "较昨日 +" + delta : delta < 0 ? "较昨日 " + delta : "与昨日持平";

    return (
      '<section class="mood-hero">' +
      '<div class="mood-hero__top"><span>TA 此刻的心情</span><span class="mood-hero__trend">' + S.esc(trend) + "</span></div>" +
      '<div class="mood-hero__main">' +
      '<p class="mood-hero__num">' + c.moodValue + "</p>" +
      '<div class="mood-hero__side"><p class="mood-hero__label">' + S.esc(m.label) + "</p>" +
      '<p class="mood-hero__line">' + S.esc(m.line) + "</p></div>" +
      "</div>" +
      '<div class="mood-hero__track"><i style="width:' + S.clamp(c.moodValue, 0, 100) + '%"></i></div>' +
      "</section>" +
      /* 五个心情状态：纯展示，不是按钮，没有点击事件与选中态 */
      '<div class="mood__checkin" role="list" aria-label="TA 的心情状态">' +
      Object.keys(S.MOODS)
        .map(function (k) {
          var on = k === c.mood ? " is-on" : "";
          return (
            '<div class="moodbtn' + on + '" role="listitem">' +
            '<i aria-hidden="true"></i><span>' + S.MOODS[k].label + "</span></div>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="stat-grid">' +
      stat("亲密度", c.affinity, lv.percent, "Lv." + lv.level + " / " + lv.maxLevel) +
      stat("对话轮数", st.chats, S.clamp(Math.round((st.chats / 200) * 100), 4, 100), "轮") +
      stat("相处天数", daysTogether(), S.clamp(Math.round((daysTogether() / 365) * 100), 4, 100), "天") +
      stat("共同记忆", mem, S.clamp(Math.round((mem / 30) * 100), 4, 100), "条") +
      "</div>" +
      '<section class="spark">' +
      '<div class="spark__head"><span>近 7 日心情</span><span class="spark__now">今日 ' + c.moodValue + "</span></div>" +
      sparkSvg(hist) +
      '<div class="spark__axis"><span>7 天前</span><span>今天</span></div>' +
      "</section>"
    );
  }

  /* 数据卡片：第一行标签 + 右上角单位，第二行大数字，
     底部进度条与数字左对齐、与单位右对齐，四张卡片高度一致。 */
  function stat(label, value, pct, unit) {
    return (
      '<div class="stat">' +
      '<div class="stat__top"><span class="stat__label">' + S.esc(label) + "</span>" +
      (unit ? '<em class="stat__unit">' + S.esc(unit) + "</em>" : "") + "</div>" +
      '<b class="stat__num">' + value + "</b>" +
      '<div class="stat__track"><i style="width:' + S.clamp(Math.round(pct), 4, 100) + '%"></i></div>' +
      "</div>"
    );
  }

  apps.mood = {
    render: function (root) {
      root.innerHTML =
        head("心情", "TA 此刻的情绪，只属于 TA 自己") +
        '<div class="app-body app-body--mood" id="mood-body">' + renderMoodBody() + "</div>";
      bindBack(root);
      /* 心情状态只展示，不绑定任何点击切换：user 无法改动 TA 的心情 */
    }
  };

  /* =========================================================
     日程
     ========================================================= */
  function renderTask(task) {
    return (
      '<li class="task' + (task.done ? " is-done" : "") + '" data-id="' + task.id + '">' +
      '<button class="task__check" type="button" data-toggle="' + task.id + '" aria-label="切换完成状态"></button>' +
      '<div class="task__body"><p class="task__title">' + S.esc(task.title) + '</p><p class="task__meta">' + S.esc(task.meta) + "</p></div>" +
      '<button class="task__del" type="button" data-del="' + task.id + '" aria-label="删除安排"></button>' +
      "</li>"
    );
  }

  function renderScheduleBody() {
    var list = S.store.tasks;
    var done = list.filter(function (t) { return t.done; }).length;
    var pct = list.length ? Math.round((done / list.length) * 100) : 0;

    return (
      '<div class="daybar"><span>今日</span><b>' + done + "/" + list.length + '</b><div class="daybar__track"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="field"><input id="task-input" type="text" maxlength="40" placeholder="添加一项安排…"><button class="chip" id="task-add" type="button">添加</button></div>' +
      '<p class="sectitle"><span>安排</span><span>' + (list.length - done) + " 项待办</span></p>" +
      '<ul class="tasks" id="tasks">' +
      (list.length ? list.map(renderTask).join("") : '<div class="empty"><i aria-hidden="true"></i><p>今天还没有安排</p><p>写一件最小的事，我会在合适的时候提醒你。</p></div>') +
      "</ul>"
    );
  }

  apps.schedule = {
    render: function (root) {
      root.innerHTML = head("日程", "伴侣会替你记着小事") + '<div class="app-body" id="schedule-body">' + renderScheduleBody() + "</div>";
      bindBack(root);

      function refresh() {
        S.el("#schedule-body", root).innerHTML = renderScheduleBody();
        S.os.refreshHome();
      }

      function add() {
        var input = S.el("#task-input");
        var text = input && input.value ? input.value.trim() : "";
        if (!text) {
          S.os.toast("先写一件事");
          return;
        }
        if (input) input.value = "";
        S.addTask(text, "今天 · 手动");
        S.pushNote("日程提醒", "已加入：" + text);
        S.os.toast("已加入日程");
        refresh();
      }


      on(S.el("#schedule-body", root), "click", function (ev) {
        if (ev.target.closest("#task-add")) {
          add();
          return;
        }

        var toggle = ev.target.closest("[data-toggle]");
        if (toggle) {
          var id = toggle.getAttribute("data-toggle");
          S.store.tasks.forEach(function (t) {
            if (t.id === id) t.done = !t.done;
          });
          S.save();
          if (S.store.tasks.some(function (t) { return t.id === id && t.done; })) {
            S.shiftMood(2);
            S.addAffinity(1);
            S.os.toast("完成一件，心情 +2");
          }
          refresh();
          return;
        }
        var del = ev.target.closest("[data-del]");
        if (del) {
          var did = del.getAttribute("data-del");
          S.store.tasks = S.store.tasks.filter(function (t) {
            return t.id !== did;
          });
          S.save();
          S.os.toast("已删除");
          refresh();
        }
      });
    }
  };

  global.COS.apps = apps;
})(window);