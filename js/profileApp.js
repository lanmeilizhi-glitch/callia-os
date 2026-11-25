/* =====================================================================
   Callia OS · profileApp.js
   伴侣档案：TA 是谁、TA 此刻在做什么、TA 记得什么、你们之间的日子。
   所有编辑立刻写进本机存储，并随提示词一起交给接口模型。
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;
  var apps = S.apps;
  var ui = S.ui;
  var on = ui.on;

  var scope = null;      /* 当前应用容器 */
  var resetArm = 0;      /* 恢复默认档案：两步确认 */

  var DEFAULT_PROFILE = {
    nick: "小光",
    callMe: "小鹿",
    birthday: "03-14",
    bio: "住在手机里的伴侣，喜欢清晨的灰光和没写完的句子。",
    traits: ["安静", "记性好", "慢热"],
    likes: ["清晨的光", "白噪", "纸质书", "跑完步的那杯水"],
    catchphrase: "慢慢来，我在。",
    style: "gentle",
    routine: "normal",
    autonomous: true,
    showActivity: true
  };

  /* ---------- 小工具 ---------- */
  function prof() {
    return S.profile();
  }

  function pres() {
    return S.store.presence || {};
  }

  function live() {
    if (S.presence && typeof S.presence.activity === "function") return S.presence.activity();
    return { key: "", line: "安静地待着", label: "" };
  }

  function streakDays() {
    if (S.presence && typeof S.presence.streak === "function") return S.presence.streak();
    return Math.max(1, pres().streak || 1);
  }

  function togetherDays() {
    if (S.presence && typeof S.presence.daysTogether === "function") return S.presence.daysTogether();
    return Math.max(1, Math.round((Date.now() - (S.store.companion.metAt || Date.now())) / 86400000));
  }

  /* 只存月日的重要日子：今年过了就顺延到明年 */
  function daysLeft(md) {
    var m = Number(String(md).slice(0, 2));
    var d = Number(String(md).slice(3, 5));
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return 0;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var target = new Date(now.getFullYear(), m - 1, d);
    if (target.getTime() < today.getTime()) target = new Date(now.getFullYear() + 1, m - 1, d);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  function sect(title, meta) {
    return (
      '<p class="sectitle"><span>' + S.esc(title) + "</span><span>" + S.esc(meta || "") + "</span></p>"
    );
  }

  function field(label, key, value, max, ph) {
    return (
      '<div class="pf-field">' +
      '<label class="pf-field__label" for="pf-' + key + '">' + S.esc(label) + "</label>" +
      '<div class="field"><input id="pf-' + key + '" type="text" maxlength="' + max +
      '" data-pf="' + key + '" value="' + S.esc(value || "") + '" placeholder="' + S.esc(ph || "") +
      '" autocomplete="off" enterkeyhint="done"></div>' +
      "</div>"
    );
  }

  function swRow(label, hint, key, isOn) {
    return (
      '<div class="pf-row">' +
      '<span class="pf-row__txt"><b>' + S.esc(label) + "</b><span>" + S.esc(hint) + "</span></span>" +
      '<button class="switch' + (isOn ? " is-on" : "") + '" type="button" data-pf-switch="' + key +
      '" role="switch" aria-checked="' + (isOn ? "true" : "false") + '" aria-label="' + S.esc(label) +
      '"><i></i></button>' +
      "</div>"
    );
  }

  function chipRow(title, keys, labels, current, attr) {
    return (
      '<div class="pf-opt">' +
      '<p class="pf-opt__label">' + S.esc(title) + "</p>" +
      '<div class="pf-chips">' +
      keys
        .map(function (k) {
          return (
            '<button class="pf-chip' + (k === current ? " is-on" : "") + '" type="button" data-' +
            attr + '="' + k + '">' + S.esc(labels[k] || k) + "</button>"
          );
        })
        .join("") +
      "</div>" +
      "</div>"
    );
  }

  function tagBlock(title, key, list, ph) {
    return (
      '<div class="pf-tags">' +
      '<p class="pf-tags__label">' + S.esc(title) + " · " + list.length + " 项</p>" +
      '<div class="pf-chips">' +
      (list.length
        ? list
            .map(function (tag, i) {
              return (
                '<span class="pf-tag">' + S.esc(tag) +
                '<button class="pf-tag__x" type="button" data-tag-del="' + key + ":" + i +
                '" aria-label="删除 ' + S.esc(tag) + '">×</button></span>'
              );
            })
            .join("")
        : '<span class="pf-tags__empty">还没写过，先加一个。</span>') +
      "</div>" +
      '<div class="field"><input id="pf-tag-' + key + '" type="text" maxlength="12" placeholder="' +
      S.esc(ph) + '" autocomplete="off" enterkeyhint="done">' +
      '<button class="chip" type="button" data-tag-add="' + key + '">加上</button></div>' +
      "</div>"
    );
  }

  function stat(label, value, max) {
    var pct = S.clamp(Math.round((value / (max || 1)) * 100), 4, 100);
    return (
      '<div class="stat"><div class="stat__top"><span>' + S.esc(label) + "</span><b>" + value +
      "</b></div><div class=\"stat__track\"><i style=\"width:" + pct + '%"></i></div></div>'
    );
  }

  /* ---------- 档案页头像：点击大白球循环切换预设 Emoji ---------- */
  /* 刻意不用浏览器原生 prompt：只在一组预设 Emoji 里循环，点一次换一个。
     选择结果写进 localStorage，重开应用仍然保留；读写全部包在 try/catch 里，
     隐私模式禁用存储或值被写坏时退回第一个，绝不抛异常。 */
  var AVATAR_KEY = "zane_profile_avatar_idx";
  var PROFILE_AVATARS = ["🌌", "📖", "☕", "✨", "🌙", "🌿"];

  function avatarIdx() {
    var n = 0;
    try {
      n = parseInt(global.localStorage.getItem(AVATAR_KEY) || "0", 10);
    } catch (err) {
      n = 0;
    }
    if (!isFinite(n) || n < 0 || n >= PROFILE_AVATARS.length) n = 0;
    return n;
  }

  function avatarEmoji() {
    return PROFILE_AVATARS[avatarIdx()];
  }

  /* 档案页渲染完成后把当前选中的 Emoji 写回球体里的那个 span。 */
  function applyProfileAvatar() {
    var el = null;
    try {
      el = document.getElementById("profile-avatar-text");
    } catch (err) {
      el = null;
    }
    if (!el) return false;
    el.textContent = avatarEmoji();
    return true;
  }

  function changeProfileAvatar() {
    var next = (avatarIdx() + 1) % PROFILE_AVATARS.length;
    try {
      global.localStorage.setItem(AVATAR_KEY, String(next));
    } catch (err) {
      /* 存不下也不影响本次切换，下次启动回到第一个 */
    }
    /* 已经设了图片头像时球体被图片替掉，span 不在页面上，
       给一条应用内 toast 兜底，不让点击看起来是死的。 */
    if (!applyProfileAvatar() && S.os && typeof S.os.toast === "function") {
      S.os.toast("头像已换成 " + PROFILE_AVATARS[next]);
    }
  }

  /* ---------- 本机相册头像：隐藏文件框 + FileReader + localStorage ---------- */
  /* 约定：只用 document.getElementById 拿元素，监听直接绑在元素自己身上，
     不做事件代理，不用 closest，不往 document / window 上挂监听。 */
  var CUSTOM_AVATAR_KEY = "zane_custom_avatar";
  var AVATAR_INPUT_ID = "avatar-upload";
  var AVATAR_ORB_ID = "pf-avatar-orb";
  var AVATAR_PICK_ID = "pf-avatar-pick";
  var AVATAR_FACE_ID = "pf-face-btn";
  var AVATAR_MAX_BYTES = 6 * 1024 * 1024; /* 手机原图动辄十几 M，先挡一道，免得 base64 撑爆存储 */
  var PHOTO_STYLE = "width: 100%; height: 100%; display: block; object-fit: cover; border-radius: 50%;";

  var sessionAvatar = "";      /* 存不进 localStorage 时，本次打开仍然显示这张图 */
  var avatarTapTimer = 0;      /* 区分单击与双击 */
  var avatarInputBound = false;

  function byId(id) {
    try {
      return document.getElementById(id);
    } catch (err) {
      return null;
    }
  }

  function say(text) {
    if (S.os && typeof S.os.toast === "function") S.os.toast(text);
  }

  /* 第三步：档案页每次渲染都先查这里。有值就上图片，没值才回到原来的表情。 */
  function customAvatar() {
    var v = "";
    try {
      v = global.localStorage.getItem(CUSTOM_AVATAR_KEY) || "";
    } catch (err) {
      v = "";
    }
    if (typeof v === "string" && v.indexOf("data:image/") === 0) return v;
    if (sessionAvatar.indexOf("data:image/") === 0) return sessionAvatar;
    return "";
  }

  function keepCustomAvatar(dataUrl) {
    sessionAvatar = dataUrl;
    try {
      global.localStorage.setItem(CUSTOM_AVATAR_KEY, dataUrl);
      return true;
    } catch (err) {
      /* 原图太大或隐私模式写不进去：本次照样显示，下次打开回到默认 */
      return false;
    }
  }

  function dropCustomAvatar() {
    sessionAvatar = "";
    try {
      global.localStorage.removeItem(CUSTOM_AVATAR_KEY);
    } catch (err) {
      /* 删不掉也只是下次打开还在，本次已经回到默认 */
    }
  }

  function avatarImgHTML(src) {
    return (
      '<img id="pf-avatar-img" class="pf-face__img" src="' + src + '" alt="伴侣头像" style="' + PHOTO_STYLE + '">'
    );
  }

  /* 白球里的内容：有照片放照片，其次预设形象，最后才是原来的表情 */
  function avatarInnerHTML() {
    var photo = customAvatar();
    if (photo) return avatarImgHTML(photo);
    var src = S.avatar && typeof S.avatar.current === "function" ? S.avatar.current() : "";
    if (src) return avatarImgHTML(src);
    return '<span class="pf-face__emoji" id="profile-avatar-text">' + avatarEmoji() + "</span>";
  }

  /* 就地替换白球里的内容，不整页重绘，页面滚动位置不动 */
  function paintAvatar() {
    var orb = byId(AVATAR_ORB_ID);
    if (!orb) return false;
    try {
      orb.innerHTML = avatarInnerHTML();
    } catch (err) {
      return false;
    }
    return true;
  }

  /* 内联 onclick 需要全局可访问的函数。 */
  global.changeProfileAvatar = changeProfileAvatar;
  global.applyProfileAvatar = applyProfileAvatar;

  /* ---------- 第一步：调起手机相册 ---------- */
  function openAvatarPicker() {
    var input = byId(AVATAR_INPUT_ID);
    if (!input) {
      say("上传组件还没准备好");
      return;
    }
    if (!global.FileReader) {
      say("这台手机读不了本机图片");
      return;
    }
    try {
      input.value = ""; /* 先清空，连续选同一张也会触发 change */
      input.click();
    } catch (err) {
      say("没能打开相册，再点一次试试");
    }
  }

  /* ---------- 第二步：读图片并替掉白球里的内容 ---------- */
  function readAvatarFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf("image/") !== 0) {
      say("只能选图片");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      say("图片太大了，换一张小一点的");
      return;
    }

    var reader = null;
    try {
      reader = new global.FileReader();

      reader.onload = function (ev) {
        var dataUrl = "";
        try {
          dataUrl = String((ev && ev.target && ev.target.result) || "");
        } catch (err) {
          dataUrl = "";
        }
        if (dataUrl.indexOf("data:image/") !== 0) {
          say("这张图片没能读出来");
          return;
        }
        var saved = keepCustomAvatar(dataUrl);
        if (!paintAvatar()) repaint();
        say(saved ? "头像已经换成这张照片" : "手机存不下这么大的图，这次打开只显示一次");
      };

      reader.onerror = function () {
        say("读取失败，换一张试试");
      };
      reader.onabort = function () {
        say("读取中断了");
      };

      reader.readAsDataURL(file);
    } catch (err) {
      /* 内存不够时 FileReader 会直接抛错，绝不让档案页崩掉 */
      say("读取图片时出错了，换一张小一点的");
    }
  }

  function onAvatarFileChange() {
    var input = byId(AVATAR_INPUT_ID);
    if (!input || !input.files || !input.files.length) return;
    var file = input.files[0];
    try {
      input.value = "";
    } catch (err) {
      /* 清不掉也不影响这一次读取 */
    }
    readAvatarFile(file);
  }

  /* 第四步：恢复默认。双击白球或长按黑钮都会走这里。 */
  function restoreDefaultAvatar() {
    if (!customAvatar()) {
      say("现在用的就是默认表情头像");
      return;
    }
    dropCustomAvatar();
    if (!paintAvatar()) repaint();
    say("已恢复默认头像");
  }

  /* 白球：单击——有照片就再换一张，没照片按老样子换表情；双击——清掉照片。
     用一次短暂延时区分单击与双击，免得双击时先把表情换掉了。 */
  function onFaceTap() {
    if (avatarTapTimer) {
      global.clearTimeout(avatarTapTimer);
      avatarTapTimer = 0;
      restoreDefaultAvatar();
      return;
    }
    avatarTapTimer = global.setTimeout(function () {
      avatarTapTimer = 0;
      if (customAvatar()) openAvatarPicker();
      else changeProfileAvatar();
    }, 280);
  }

  /* 右下角黑色小按钮：单击调起相册，长按恢复默认 */
  var pickHoldTimer = 0;
  var pickSuppressClick = false;

  function stopPickHold() {
    if (pickHoldTimer) {
      global.clearTimeout(pickHoldTimer);
      pickHoldTimer = 0;
    }
  }

  function onPickTap(ev) {
    /* 黑钮在白球里，不挡住就会连带触发白球的单击逻辑 */
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    if (pickSuppressClick) return;
    openAvatarPicker();
  }

  function onPickHoldStart() {
    stopPickHold();
    pickHoldTimer = global.setTimeout(function () {
      pickHoldTimer = 0;
      pickSuppressClick = true;
      global.setTimeout(function () {
        pickSuppressClick = false;
      }, 600);
      restoreDefaultAvatar();
    }, 620);
  }

  /* 手指滑动（滚页面）时不算长按 */
  function onPickHoldCancel() {
    stopPickHold();
  }

  /* 档案页每次渲染、每次重绘之后都要重绑：DOM 是重新生成的，
     旧监听随旧节点一起释放，不会重复注册。 */
  function bindAvatar() {
    var input = byId(AVATAR_INPUT_ID);
    if (input && !avatarInputBound) {
      input.addEventListener("change", onAvatarFileChange, false);
      avatarInputBound = true;
    }

    var face = byId(AVATAR_FACE_ID);
    if (face) face.addEventListener("click", onFaceTap, false);

    var pick = byId(AVATAR_PICK_ID);
    if (!pick) return;
    pick.addEventListener("click", onPickTap, false);
    pick.addEventListener("touchstart", onPickHoldStart, false);
    pick.addEventListener("touchend", onPickHoldCancel, false);
    pick.addEventListener("touchmove", onPickHoldCancel, false);
    pick.addEventListener("touchcancel", onPickHoldCancel, false);
  }

  /* ---------- 身份 ---------- */
  function idCard() {
    var c = S.store.companion;
    var pr = prof();

    return (
      '<section class="pf-id">' +
      /* 大白球：监听直接绑在按钮自己身上（见 bindAvatar），不用内联 onclick，也不走事件代理 */
      '<button class="pf-face" type="button" id="pf-face-btn" aria-label="伴侣头像：轻点换头像，双击恢复默认">' +
      '<span class="pf-face__orb pf-face__orb--' + S.mood().orb + '" id="pf-avatar-orb">' +
      avatarInnerHTML() +
      "</span>" +
      /* 右下角黑色小按钮：单击从相册选图，长按恢复默认 */
      '<i class="pf-face__edit" id="pf-avatar-pick" role="button" aria-label="从相册上传头像"></i>' +
      "</button>" +
      '<div class="pf-id__main">' +
      '<p class="pf-id__name">' + S.esc(c.name) + "</p>" +
      '<p class="pf-id__sub">' +
      S.esc([pr.nick, S.mood().label, "Lv." + c.level].filter(Boolean).join(" · ")) +
      "</p>" +
      '<p class="pf-id__bio">' + S.esc(pr.bio || "还没写自我介绍，下面那句就是。") + "</p>" +
      (pr.catchphrase ? '<p class="pf-id__say">「' + S.esc(pr.catchphrase) + "」</p>" : "") +
      "</div>" +
      "</section>"
    );
  }

  /* ---------- 此刻 ---------- */
  function liveCard() {
    var a = live();
    var p = pres();
    var talked = p.talkedToday ? "今天说过话" : "今天还没说话";
    var seen = p.lastSeen ? S.fmt.ago(p.lastSeen) + "有过动静" : "还没有互动记录";

    return (
      '<section class="pf-live">' +
      '<div class="pf-live__head">' +
      '<i class="pf-live__dot" aria-hidden="true"></i>' +
      '<span class="pf-live__label">此刻</span>' +
      '<span class="pf-live__time">' + S.esc(a.label) + "</span>" +
      "</div>" +
      '<p class="pf-live__line">' + S.esc(a.line) + "</p>" +
      '<p class="pf-live__meta">' + S.esc(talked) + " · " + S.esc(seen) + "</p>" +
      '<div class="pf-live__acts">' +
      '<button class="btn btn--solid" type="button" data-poke>戳一戳</button>' +
      '<button class="btn" type="button" data-next-act>换一件事</button>' +
      "</div>" +
      "</section>"
    );
  }

  /* ---------- 重要日子 ---------- */
  function dayRow(item) {
    var left = daysLeft(item.date);
    var label = left === 0 ? "就是今天" : left === 1 ? "还有 1 天" : "还有 " + left + " 天";
    return (
      '<li class="pf-day">' +
      '<span class="pf-day__date">' + S.esc(item.date) + "</span>" +
      '<span class="pf-day__main"><b>' + S.esc(item.title) + "</b>" +
      (item.note ? "<span>" + S.esc(item.note) + "</span>" : "") +
      "</span>" +
      '<span class="pf-day__left">' + label + "</span>" +
      '<button class="pf-del" type="button" data-day-del="' + item.id + '" aria-label="删除这个日子">×</button>' +
      "</li>"
    );
  }

  function daysBlock() {
    var list = Array.isArray(S.store.days) ? S.store.days : [];
    return (
      sect("你们的日子", list.length + " 个 · 每年循环") +
      '<ul class="pf-days">' +
      (list.length
        ? list.map(dayRow).join("")
        : '<li class="pf-days__empty">还没有日子。加一个第一次说话的日期，到那天 TA 会自己提起来。</li>') +
      "</ul>" +
      '<div class="pf-add">' +
      '<div class="field"><input id="pf-day-title" type="text" maxlength="12" placeholder="日子叫什么" autocomplete="off"></div>' +
      '<div class="field"><input id="pf-day-date" type="text" maxlength="10" placeholder="03-14" autocomplete="off"></div>' +
      '<div class="field"><input id="pf-day-note" type="text" maxlength="30" placeholder="一句备注（可留空）" autocomplete="off"></div>' +
      '<button class="chip" type="button" data-day-add="1">记下日子</button>' +
      "</div>"
    );
  }

  /* ---------- TA 记得的事 ---------- */
  function factRow(f) {
    return (
      '<li class="pf-fact">' +
      '<span class="pf-fact__kind">' + S.esc(S.FACT_KIND_LABELS[f.kind] || "其它") + "</span>" +
      '<span class="pf-fact__text">' + S.esc(f.text) + "</span>" +
      '<span class="pf-fact__time">' + S.esc(S.fmt.ago(f.ts)) + "</span>" +
      '<button class="pf-del" type="button" data-fact-del="' + f.id + '" aria-label="忘掉这条">忘</button>' +
      "</li>"
    );
  }

  function factsBlock() {
    var list = Array.isArray(S.store.facts) ? S.store.facts : [];
    var auto = list.filter(function (f) {
      return f.source !== "manual";
    }).length;
    return (
      sect("TA 记得的事", list.length + " 条 · " + auto + " 条自己听到") +
      '<ul class="pf-facts">' +
      (list.length
        ? list.map(factRow).join("")
        : '<li class="pf-facts__empty">还没记住什么。在对话里说「我喜欢…」，TA 会自己记下来。</li>') +
      "</ul>" +
      '<div class="field"><input id="pf-fact-input" type="text" maxlength="60" placeholder="替 TA 补一条…">' +
      '<button class="chip" type="button" data-fact-add="1">记住</button></div>'
    );
  }

  /* ---------- 整页 ---------- */
  function body() {
    var c = S.store.companion;
    var pr = prof();
    var done = (S.store.tasks || []).filter(function (t) {
      return t.done;
    }).length;
    var next = S.presence && typeof S.presence.nextDay === "function" ? S.presence.nextDay() : null;

    return (
      idCard() +
      liveCard() +
      sect("相处痕迹", "连续 " + streakDays() + " 天 · 一共 " + togetherDays() + " 天") +
      '<div class="stat-grid">' +
      stat("亲密度", c.affinity, S.MAX_AFFINITY) +
      stat("心情值", c.moodValue, 100) +
      stat("对话轮数", (S.store.stats && S.store.stats.chats) || 0, 60) +
      stat("共同记忆", (S.store.memories || []).length, 12) +
      stat("完成安排", done, Math.max(1, (S.store.tasks || []).length)) +
      stat("连续天数", streakDays(), Math.max(7, togetherDays())) +
      "</div>" +
      (next
        ? '<p class="pf-next">下一个日子：「' + S.esc(next.item.title) + "」· " +
          (next.left === 0 ? "就是今天" : "还有 " + next.left + " 天") + "</p>"
        : "") +
      sect("TA 的档案", "改完就生效") +
      '<div class="pf-fields">' +
      field("名字", "name", c.name, 12, "TA 的名字") +
      field("可以被叫作", "nick", pr.nick, 12, "小名") +
      field("TA 怎么称呼你", "callMe", pr.callMe, 12, "你的称呼") +
      field("生日", "birthday", pr.birthday, 10, "03-14") +
      field("常挂在嘴边的一句", "catchphrase", pr.catchphrase, 40, "慢慢来，我在。") +
      "</div>" +
      '<div class="pf-field"><label class="pf-field__label" for="pf-bio">一句话介绍自己</label>' +
      '<div class="field"><input id="pf-bio" type="text" maxlength="120" data-pf="bio" value="' +
      S.esc(pr.bio) + '" placeholder="住在手机里的伴侣…" autocomplete="off" enterkeyhint="done"></div></div>' +
      tagBlock("TA 的性子", "traits", pr.traits || [], "再加一个词") +
      tagBlock("TA 喜欢的东西", "likes", pr.likes || [], "再加一样") +
      sect("说话与作息", "会写进提示词") +
      chipRow("说话的天性", S.STYLE_KEYS, S.STYLES, pr.style, "style") +
      chipRow("作息", S.ROUTINE_KEYS, S.ROUTINES, pr.routine, "routine") +
      '<div class="pf-rows">' +
      swRow("心情会自己漂", "隔一段时间情绪会轻轻起伏，不只跟着你走", "autonomous", pr.autonomous !== false) +
      swRow("让别人看见此刻", "桌面与提示词里会写 TA 正在做的事", "showActivity", pr.showActivity !== false) +
      "</div>" +
      daysBlock() +
      factsBlock() +
      '<div class="pf-foot">' +
      '<p class="set-note">档案、日子和记得的事只存在这台手机里，会随每次对话交给接口模型，语气与用词由所选模型自己决定。</p>' +
      '<button class="chip chip--ghost" type="button" data-pf-reset="1">恢复默认档案</button>' +
      "</div>"
    );
  }

  /* ---------- 渲染与保存 ---------- */
  function repaint() {
    if (!scope) return;
    scope.innerHTML = body();
    bindAvatar();
  }

  function saveProfile(patch) {
    S.updateProfile(patch);
    repaint();
    S.os.refreshHome();
  }

  function readField(node) {
    var key = node.getAttribute("data-pf");
    var value = String(node.value || "").trim();
    if (key === "name") {
      if (!value) {
        S.os.toast("名字不能空着");
        node.value = S.store.companion.name;
        return;
      }
      S.store.companion.name = value.slice(0, 12);
      S.save();
      S.os.toast("TA 叫 " + S.store.companion.name);
      repaint();
      S.os.refreshHome();
      return;
    }
    var patch = {};
    patch[key] = value;
    S.updateProfile(patch);
    S.os.toast("已保存");
    repaint();
    S.os.refreshHome();
  }

  function addTag(key) {
    var input = S.el("#pf-tag-" + key, scope);
    var value = input && input.value ? String(input.value).trim() : "";
    if (!value) {
      S.os.toast("先写一个词");
      return;
    }
    var pr = prof();
    var list = (key === "traits" ? pr.traits : pr.likes).slice(0);
    if (list.indexOf(value) >= 0) {
      S.os.toast("已经写过了");
      return;
    }
    list.push(value);
    var patch = {};
    patch[key] = list;
    saveProfile(patch);
    S.os.toast(key === "traits" ? "TA 记下自己的一点性子" : "TA 记下了一样喜欢的东西");
  }

  function delTag(spec) {
    var parts = String(spec).split(":");
    var key = parts[0];
    var idx = Number(parts[1]);
    var pr = prof();
    var list = (key === "traits" ? pr.traits : pr.likes).slice(0);
    if (!isFinite(idx) || idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    var patch = {};
    patch[key] = list;
    saveProfile(patch);
  }

  function addFact() {
    var input = S.el("#pf-fact-input", scope);
    var value = input && input.value ? String(input.value).trim() : "";
    if (value.length < 2) {
      S.os.toast("至少写两个字");
      return;
    }
    var fact = S.addFact(value, "other", "manual");
    if (!fact) {
      S.os.toast("这条没能记下来");
      return;
    }
    if (input) input.value = "";
    S.shiftMood(1);
    S.os.toast("TA 把这件事放进心里了");
    repaint();
  }

  function addDay() {
    var title = S.el("#pf-day-title", scope);
    var date = S.el("#pf-day-date", scope);
    var note = S.el("#pf-day-note", scope);
    var name = title && title.value ? String(title.value).trim() : "";
    var md = date && date.value ? String(date.value) : "";
    if (!name) {
      S.os.toast("先给日子起个名字");
      return;
    }
    var day = S.addDay(name, md, note && note.value ? String(note.value) : "");
    if (!day) {
      S.os.toast("日期写成 03-14 这样试试");
      return;
    }
    if (title) title.value = "";
    if (date) date.value = "";
    if (note) note.value = "";
    S.pushNote("重要日子", "记下「" + day.title + "」· " + day.date);
    S.os.toast("已记下 " + day.date);
    repaint();
    S.os.refreshHome();
  }

  function bind(root) {
    on(root, "click", function (ev) {
      var hit = ev.target;

      var poke = hit.closest("[data-poke]");
      if (poke) {
        if (!S.presence) {
          S.os.toast("存在感引擎还没起来");
          return;
        }
        S.presence.poke();
        repaint();
        S.os.refreshHome();
        return;
      }

      var nextAct = hit.closest("[data-next-act]");
      if (nextAct) {
        if (S.presence && typeof S.presence.next === "function") {
          S.presence.next();
          S.os.toast("TA 起身去做了别的事");
          repaint();
          S.os.refreshHome();
        }
        return;
      }

      var sw = hit.closest("[data-pf-switch]");
      if (sw) {
        var key = sw.getAttribute("data-pf-switch");
        var patch = {};
        patch[key] = prof()[key] === false;
        saveProfile(patch);
        S.os.toast(patch[key] ? "已打开" : "已关掉");
        return;
      }

      var style = hit.closest("[data-style]");
      if (style) {
        saveProfile({ style: style.getAttribute("data-style") });
        S.os.toast("说话的天性改了");
        return;
      }

      var routine = hit.closest("[data-routine]");
      if (routine) {
        saveProfile({ routine: routine.getAttribute("data-routine") });
        S.os.toast("作息改了");
        return;
      }

      var tagAdd = hit.closest("[data-tag-add]");
      if (tagAdd) {
        addTag(tagAdd.getAttribute("data-tag-add"));
        return;
      }

      var tagDel = hit.closest("[data-tag-del]");
      if (tagDel) {
        delTag(tagDel.getAttribute("data-tag-del"));
        return;
      }

      if (hit.closest("[data-fact-add]")) {
        addFact();
        return;
      }

      var factDel = hit.closest("[data-fact-del]");
      if (factDel) {
        if (S.removeFact(factDel.getAttribute("data-fact-del"))) S.os.toast("TA 决定不记这条了");
        repaint();
        return;
      }

      if (hit.closest("[data-day-add]")) {
        addDay();
        return;
      }

      var dayDel = hit.closest("[data-day-del]");
      if (dayDel) {
        if (S.removeDay(dayDel.getAttribute("data-day-del"))) S.os.toast("日子已删除");
        repaint();
        S.os.refreshHome();
        return;
      }

      var reset = hit.closest("[data-pf-reset]");
      if (reset) {
        if (Date.now() - resetArm > 6000) {
          resetArm = Date.now();
          S.os.toast("再点一次会恢复默认档案");
          return;
        }
        resetArm = 0;
        S.updateProfile(JSON.parse(JSON.stringify(DEFAULT_PROFILE)));
        S.os.toast("档案恢复默认");
        repaint();
        S.os.refreshHome();
      }
    });

    on(root, "change", function (ev) {
      var input = ev.target.closest("[data-pf]");
      if (input) readField(input);
    });
  }

  apps.profile = {
    render: function (root) {
      resetArm = 0;
      root.innerHTML =
        ui.head(
          "伴侣档案",
          "TA 是谁 · TA 此刻在做什么",
          '<button class="chip" type="button" data-poke>戳一戳</button>'
        ) + '<div class="app-body pf" id="pf-body">' + body() + "</div>";

      scope = S.el("#pf-body", root);
      ui.bindBack(root);
      bind(root);
      /* 渲染完成后应用已选中的头像 Emoji（idCard 已经输出一次，这里是二次保险） */
      applyProfileAvatar();
      /* 头像的上传、换图、恢复默认：监听直接绑在真实元素上 */
      bindAvatar();

      if (S.presence && typeof S.presence.tick === "function") S.presence.tick();
    },
    teardown: function () {
      scope = null;
      resetArm = 0;
    }
  };
})(window);