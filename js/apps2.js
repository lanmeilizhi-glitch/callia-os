/* =========================================================
   Companion OS · apps2.js
   日记本 / 记忆 / 设置
   （原「音乐」页面的播放器、进度条与歌单已全部下线）
   ========================================================= */
(function (global) {
  "use strict";

  var S = global.COS;
  var apps = S.apps;
  var ui = S.ui;
  var on = ui.on;

  /* =========================================================
     Zane 的日记本（纯只读：没有输入框，也没有修改入口）
     · 进入页面时若今天还没有日记，静默请接口写一篇
     · 正文按日期倒序渲染成毛玻璃卡片
     ========================================================= */
  var diaryTimer = null;
  var diaryBusy = false;

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function diaryList() {
    return Array.isArray(S.store.diaries) ? S.store.diaries : [];
  }

  function hasDiary(date) {
    return diaryList().some(function (d) { return d && d.date === date; });
  }

  /* 日期中文包装：2026-11-24 → 2026 年 11 月 24 日 · 周二 */
  function diaryDateLabel(date) {
    var parts = String(date).split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return date;
    var week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return parts[0] + " 年 " + Number(parts[1]) + " 月 " + Number(parts[2]) + " 日 · 周" + week;
  }

  /* 简单排版：正文已经 esc 过，空行分段，行首「- 」变成小圆点 */
  function diaryBody(text) {
    var blocks = String(text || "").split(/\n{2,}/);
    return blocks
      .map(function (block) {
        var lines = String(block).split("\n");
        var html = "";
        var list = [];
        lines.forEach(function (line) {
          var t = String(line).replace(/\s+$/, "");
          if (/^\s*[-\u3001*]\s+/.test(t)) {
            list.push("<li>" + t.replace(/^\s*[-\u3001*]\s+/, "") + "</li>");
            return;
          }
          if (list.length) {
            html += "<ul>" + list.join("") + "</ul>";
            list = [];
          }
          if (!t.trim()) return;
          html += "<p>" + t + "</p>";
        });
        if (list.length) html += "<ul>" + list.join("") + "</ul>";
        return html ? '<div class="diary__block">' + html + "</div>" : "";
      })
      .filter(Boolean)
      .join("");
  }

  function paintDiaries() {
    var box = S.el("#diary-list");
    if (!box) return;
    var list = diaryList().slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
    if (!list.length) {
      box.innerHTML = '<p class="diary__empty">还没有日记，稍等一会儿，Zane 正在写。</p>';
      return;
    }
    box.innerHTML = list
      .map(function (item) {
        return (
          '<article class="diary-card">' +
          '<header class="diary-card__head"><span class="diary-card__date">' +
          S.esc(diaryDateLabel(item.date)) +
          "</span></header>" +
          '<div class="diary-card__body">' + diaryBody(S.esc(item.content)) + "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function paintDiaryState(text) {
    var box = S.el("#diary-loading");
    if (!box) return;
    if (text) {
      box.hidden = false;
      var label = box.querySelector(".diary-loading__text");
      if (label) label.textContent = text;
    } else {
      box.hidden = true;
    }
  }

  /* 日记专用提示词：只拿日记需要的身份与关系，不拼聊天语言与双语规则 */
  function diaryPrompt(date) {
    var c = S.store.companion || {};
    var pr = typeof S.profile === "function" ? S.profile() || {} : {};
    var me = (S.store.settings && S.store.settings.user) || "Callia";
    var bits = [];
    if (pr.nick) bits.push("你的名字：" + pr.nick);
    if (pr.bio) bits.push("你的自我介绍：" + pr.bio);
    if (pr.traits && pr.traits.length) bits.push("你的性子：" + pr.traits.join("、"));
    if (pr.likes && pr.likes.length) bits.push("你喜欢的东西：" + pr.likes.join("、"));
    if (pr.catchphrase) bits.push("你常说的一句话：" + pr.catchphrase);
    if (S.STYLES && S.STYLES[pr.style]) bits.push("你说话的天性：" + S.STYLES[pr.style]);

    var personaBlock = "";
    if (S.companion && typeof S.companion.personaBlock === "function") {
      try {
        personaBlock = String(S.companion.personaBlock("") || "");
      } catch (err) {
        personaBlock = "";
      }
    }

    var facts = (Array.isArray(S.store.facts) ? S.store.facts.slice(0, 5) : [])
      .filter(function (f) { return f && f.text; })
      .map(function (f) { return "· " + f.text; })
      .join("\n");

    var ps = null;
    if (S.presence && typeof S.presence.snapshot === "function") {
      try {
        ps = S.presence.snapshot();
      } catch (err) {
        ps = null;
      }
    }

    return (
      (personaBlock ? personaBlock + "\n\n" : "") +
      "【你们的身份】\n" +
      "你叫「" + (pr.nick || c.name || "Zane") + "」，对方叫「" + me + "」。\n" +
      "你们刚在一起不久，关系亲近但还在慢慢熟悉对方。\n" +
      (bits.length ? "【你的档案】\n" + bits.join("\n") + "\n" : "") +
      (ps ? "【你们的日子】\n已经相处 " + ps.days + " 天，连续 " + ps.streak + " 天有说话。\n" : "") +
      (facts ? "【你记得关于对方的事】\n" + facts + "\n只在相关时自然提起，不要逐条复述。\n" : "") +
      "\n【要写的内容】\n" +
      "请以 Zane 的身份，用第一人称写一篇今天（" + date + "）的日记。\n" +
      "日记内容必须体现你的性格（温柔、喜欢写作等），并自然地提及 Callia 或者你们的关系。\n" +
      "不要像 AI 助手一样总结对话，要像真正的日记一样有真情实感，不要 OOC。\n" +
      "只写日记正文，不要写日期标题、不要加引号、不要加方括号标签、不要分点说明、不要提这条指令。"
    );
  }

  function addDiary(date, content) {
    var list = diaryList().filter(function (d) { return d && d.date !== date; });
    list.unshift({ date: date, content: content });
    S.store.diaries = list.slice(0, 60);
    S.save();
  }

  /* 静默生成：失败不打扰用户，只在卡片下方留一行短提示 */
  function ensureTodayDiary(date) {
    if (diaryBusy) return;
    if (!S.api || typeof S.api.ready !== "function" || !S.api.ready()) {
      paintDiaryState("接口未连接，暂时写不了日记，去设置里连上接口再进来。");
      return;
    }
    diaryBusy = true;
    paintDiaryState("Zane 正在写日记...");

    var messages = [
      { role: "system", content: diaryPrompt(date) },
      { role: "user", content: "写下今天的日记。" }
    ];

    S.api
      .requestRaw(messages)
      .then(function (res) {
        diaryBusy = false;
        if (!res || !res.ok || !res.text) {
          paintDiaryState(res && res.message ? res.message : "这次没能写出，稍后再试。");
          return;
        }
        /* 防呆：剥掉模型可能自己加上的情绪标签与日期标题 */
        var body = String(res.text)
          .replace(/\[\s*emotion\s*:[^\]]*\]/gi, "")
          .replace(/^\s*#.*$/gm, "")
          .replace(/^\s*\d{4}[-.\u5e74][^\n]{0,16}$/gm, "")
          .replace(/^[\s"'“”]+/, "")
          .replace(/[\s"'“”]+$/, "");
        if (!body) {
          paintDiaryState("这次没能写出内容，稍后再试。");
          return;
        }
        addDiary(date, body.slice(0, 2000));
        paintDiaryState("");
        paintDiaries();
      })
      .catch(function () {
        diaryBusy = false;
        paintDiaryState("写日记时出了点问题，稍后再试。");
      });
  }

  apps.diary = {
    render: function (root) {
      var date = todayKey();
      root.innerHTML =
        ui.head("Zane 的日记本", "碎碎念 · 只读") +
        '<div class="app-body" id="diary-body">' +
        '<p class="sectitle"><span>碎碎念</span><span>' + diaryList().length + " 篇</span></p>" +
        '<div id="diary-loading" hidden></div>' +
        '<div class="diary-list" id="diary-list"></div>' +
        "</div>";

      ui.bindBack(root);

      /* 加载动画：三个小点慢慢呼吸，只靠 CSS，没有定时器 */
      var loading = S.el("#diary-loading", root);
      if (loading) {
        loading.className = "diary-loading";
        loading.innerHTML =
          '<span class="diary-loading__dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
          '<span class="diary-loading__text"></span>';
      }

      paintDiaries();

      if (hasDiary(date)) {
        paintDiaryState("");
      } else {
        /* 今天还没写过：稍等一拍再发静默请求，让页面先完成渲染 */
        diaryTimer = global.setTimeout(function () {
          diaryTimer = null;
          if (!S.el("#diary-list")) return;
          if (hasDiary(date)) {
            paintDiaryState("");
            paintDiaries();
            return;
          }
          ensureTodayDiary(date);
        }, 120);
      }
    },
    teardown: function () {
      if (diaryTimer) clearTimeout(diaryTimer);
      diaryTimer = null;
      diaryBusy = false;
    }
  };
  /* 旧入口保留一个别名，防止外部还有 open("music") 的调用 */
  apps.music = apps.diary;

  /* ---------- 以下原音乐播放器代码已全部剥离 ----------
     大圆盘 / 播放按钮 / 进度条拖动 / 频谱动画 / 灰阶歌单 / 播放循环定时器
     均已从本页下线，不再读写 S.store.music，也不再使用 S.TRACKS 与 S.fmt.mmss。
     保留这段注释只为说明旧页面去向，实际逻辑已删除。 */

  /* =========================================================
     记忆
     ========================================================= */

  /* =========================================================
     记忆
     ========================================================= */
  var openMemoryId = null;

  function memCard(m) {
    return (
      '<button class="memcard" type="button" data-mem="' + m.id + '">' +
      '<span class="memcard__art" style="--x:' + m.x + "%;--y:" + m.y + '%">' +
      '<i style="left:' + m.x + "%;top:" + m.y + "%;width:" + m.size + "px;height:" + m.size + 'px"></i><em></em></span>' +
      '<span class="memcard__body"><span>' + S.esc(m.title) + "</span><span>" + S.esc(m.date) + "</span></span>" +
      "</button>"
    );
  }

  function memDetail() {
    var m = S.store.memories.filter(function (x) {
      return x.id === openMemoryId;
    })[0];
    if (!m) return "";
    return (
      '<div class="memdetail" id="mem-detail">' +
      '<div class="memdetail__head"><p>' + S.esc(m.title) + "</p><span>" + S.esc(m.date) + "</span></div>" +
      '<p class="memdetail__text">' + S.esc(m.text) + "</p>" +
      '<div class="memdetail__tags">' + m.tags.map(function (t) { return '<span class="tag">' + S.esc(t) + "</span>"; }).join("") + "</div>" +
      '<button class="btn btn--ghost" id="mem-close" type="button">收起这段记忆</button>' +
      "</div>"
    );
  }

  function renderMemoryBody() {
    return (
      '<div id="mem-detail-slot">' + memDetail() + "</div>" +
      '<p class="sectitle"><span>共同记忆</span><span>' + S.store.memories.length + " 段</span></p>" +
      '<div class="mem-grid">' +
      (S.store.memories.length
        ? S.store.memories.map(memCard).join("")
        : '<div class="empty"><i aria-hidden="true"></i><p>还没有记忆</p><p>在对话里说一件好事，我会自动为你们留一格。</p></div>') +
      "</div>"
    );
  }

  apps.memory = {
    render: function (root) {
      root.innerHTML =
        ui.head("记忆", "我们一起留下的痕迹") +
        '<div class="app-body" id="memory-body">' + renderMemoryBody() + "</div>" +
        '<div class="app-foot"><div class="field"><input id="mem-input" type="text" maxlength="60" placeholder="记下此刻的一件事…">' +
        '<button class="chip" id="mem-add" type="button">收藏</button></div></div>';

      ui.bindBack(root);

      function refresh() {
        S.el("#memory-body", root).innerHTML = renderMemoryBody();
      }

      on(S.el("#memory-body", root), "click", function (ev) {
        if (ev.target.closest("#mem-close")) {
          openMemoryId = null;
          refresh();
          return;
        }
        var card = ev.target.closest("[data-mem]");
        if (!card) return;
        openMemoryId = card.getAttribute("data-mem");
        refresh();
        var detail = S.el("#mem-detail");
        if (detail) detail.scrollIntoView({ block: "start", behavior: "smooth" });
      });

      on(S.el("#mem-add", root), "click", function () {
        var input = S.el("#mem-input");
        var text = input && input.value ? input.value.trim() : "";
        if (!text) {
          S.os.toast("先写一句话");
          return;
        }
        if (input) input.value = "";
        var m = S.addMemory(text.slice(0, 12), text);
        openMemoryId = m.id;
        S.shiftMood(2);
        S.addAffinity(2);
        S.os.toast("已收藏这段记忆");
        refresh();
        S.os.refreshHome();
      });
    }
  };

  /* =========================================================
     设置
     ========================================================= */
  var pendingConfirm = { key: "", at: 0 };

  function sw(key, on) {
    return '<button class="switch' + (on ? " is-on" : "") + '" type="button" data-switch="' + key + '" role="switch" aria-checked="' + on + '" aria-label="开关"><i></i></button>';
  }

  /* ---------- 纯手动留言板模式：只留言，点召唤键才回复 ----------
     状态单独存 localStorage 的 treehole_mode（'true' / 'false'），
     不进 S.store.settings，避免和设置页其它开关的存储结构混在一起。
     聊天页 js/apps.js 的 send() 每次发送时现读这个键，所以换角色卡也照样生效。 */
  var TREEHOLE_KEY = "treehole_mode";

  function getTreeholeMode() {
    try {
      return window.localStorage.getItem(TREEHOLE_KEY) === "true";
    } catch (e) {
      return false; /* 本机存储不可用时按关闭处理，聊天走原来的立即发送 */
    }
  }

  function saveTreeholeMode(on) {
    try {
      window.localStorage.setItem(TREEHOLE_KEY, on ? "true" : "false");
    } catch (e) {
      /* 存不进去也不阻断界面，本次会话内开关仍可点 */
    }
  }

  /* 留言板模式开关：结构与 sw() 完全一致，只是读写走上面两个函数 */
  function treeholeSwitch() {
    var on = getTreeholeMode();
    return '<button class="switch' + (on ? " is-on" : "") + '" type="button" data-switch="treehole" role="switch" aria-checked="' + on + '" aria-label="纯手动留言板模式"><i></i></button>';
  }

  /* ---------- 接口内页：地址自动补全 + 模型自动拉取（三个键与 api.js 共用） ---------- */
  var API_DEFAULTS = {
    api_url: "https://api.openai.com/v1/chat/completions",
    api_key: "",
    api_model: "gpt-4o-mini"
  };

  function apiGet(key) {
    var fallback = API_DEFAULTS.hasOwnProperty(key) ? API_DEFAULTS[key] : "";
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined) {
        window.localStorage.setItem(key, fallback);
        return fallback;
      }
      return String(raw);
    } catch (err) {
      return fallback;
    }
  }

  function apiSet(key, value) {
    try {
      window.localStorage.setItem(key, String(value === null || value === undefined ? "" : value));
      return true;
    } catch (err) {
      return false;
    }
  }

  var settingsView = "main";
  var keyVisible = false;
  var draft = { base: "", key: "", model: "" };
  var modelState = { status: "idle", items: [], message: "", query: "" };

  function apiSuffix() {
    return (S.api && S.api.API_SUFFIX) || "/chat/completions";
  }

  function draftUrl() {
    return S.api.composeUrl(draft.base);
  }

  function initDraft() {
    draft.base = S.api.displayBase(apiGet("api_url"));
    draft.key = apiGet("api_key");
    draft.model = apiGet("api_model");
  }

  /* 地址填完一段就落盘，没填完的半成品不写入 */
  function persistDraft() {
    apiSet("api_key", String(draft.key || "").trim());
    apiSet("api_model", String(draft.model || "").trim());
    var base = String(draft.base || "").trim();
    if (base && base.indexOf(".") !== -1 && !/\/$/.test(base)) apiSet("api_url", draftUrl());
  }

  /* 设置首页入口行的摘要 */
  function apiSummaryLine() {
    var key = apiGet("api_key");
    var model = apiGet("api_model");
    if (!key) return "未连接 · 先填密钥";
    if (!model) return "已存密钥 · 待选模型";
    return model + " · 密钥 ••••" + key.slice(-4);
  }

  /* 内页底部的完整地址回显 */
  function apiStatusText() {
    var url = draftUrl();
    var key = String(draft.key || "").trim();
    var model = String(draft.model || "").trim();
    return (
      (url || "地址未填") +
        " · " +
        (key ? "密钥 ••••" + key.slice(-4) : "密钥未填") +
        " · " +
        (model ? "模型 " + model : "模型未选")
    );
  }

  /* ---------- 地址拼接预览：把自动补全的部分直接给用户看 ---------- */
  function urlParts(raw) {
    var value = String(raw || "").replace(/\s+/g, "");
    var scheme = "https://";
    var matched = /^(https?:\/\/)([\s\S]*)$/i.exec(value);
    if (matched) {
      scheme = matched[1].toLowerCase();
      value = matched[2];
    }
    value = value.replace(/\/+$/, "");
    var suffix = apiSuffix();
    if (value.toLowerCase().slice(-suffix.length) === suffix) {
      value = value.slice(0, value.length - suffix.length);
      suffix = "";
    }
    return { scheme: scheme, base: value, suffix: suffix };
  }

  function urlViewMarkup(raw) {
    var p = urlParts(raw);
    return (
      '<span class="api-urlview__fix">' + S.esc(p.scheme) + "</span>" +
        '<b class="api-urlview__base' + (p.base ? "" : " is-empty") + '">' +
        S.esc(p.base || "api.openai.com/v1") +
        "</b>" +
        (p.suffix ? '<span class="api-urlview__fix">' + S.esc(p.suffix) + "</span>" : "")
    );
  }

  /* ---------- 模型列表 ---------- */
  function filteredModels() {
    var q = modelState.query.trim().toLowerCase();
    if (!q) return modelState.items;
    return modelState.items.filter(function (m) {
      return (
        m.id.toLowerCase().indexOf(q) !== -1 ||
        String(m.owner || "").toLowerCase().indexOf(q) !== -1
      );
    });
  }

  function modelRowsMarkup() {
    var rows = filteredModels();
    if (!rows.length) return '<p class="model-state">没有匹配的模型，换个关键词。</p>';
    return rows
      .map(function (m) {
        var on = m.id === String(draft.model || "").trim() ? " is-on" : "";
        var meta = m.owner || "可用模型";
        if (m.created) meta += " · " + S.fmt.date(m.created * 1000);
        return (
          '<button class="model-item' + on + '" type="button" data-model="' + S.esc(m.id) + '">' +
            '<span class="model-item__id">' + S.esc(m.id) + "</span>" +
            '<span class="model-item__meta">' + S.esc(meta) + "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function modelBlockMarkup() {
    var head =
      '<div class="api-field__head">' +
      '<span class="api-field__label">模型 · 点选即保存</span>' +
      '<button class="chip chip--ghost" id="api-pull" type="button">' +
      (modelState.status === "loading" ? "拉取中…" : "重新拉取") +
      "</button></div>";

    if (modelState.status === "loading") {
      return (
        head +
        '<div class="model-list is-busy" aria-live="polite">' +
        '<p class="model-state">正在拉取模型列表…</p>' +
        '<div class="model-skeleton" aria-hidden="true"><i></i><i></i><i></i></div></div>'
      );
    }

    if (modelState.status === "ready") {
      return (
        head +
        '<input class="api-field__input" id="api-model-search" type="text" autocomplete="off" spellcheck="false" ' +
        'placeholder="筛选模型 · 共 ' + modelState.items.length + ' 个" value="' + S.esc(modelState.query) + '">' +
        '<div class="model-list" id="model-list">' + modelRowsMarkup() + "</div>" +
        '<p class="api-field__hint">列表由接口返回，不需要手动输入模型名。</p>'
      );
    }

    return (
      head +
      '<input class="api-field__input" id="api-model-manual" type="text" autocomplete="off" autocapitalize="off" ' +
      'spellcheck="false" placeholder="手动填写模型名，例如 gpt-4o-mini" value="' + S.esc(draft.model) + '">' +
      '<p class="model-state' + (modelState.status === "error" ? " is-error" : "") + '">' +
      S.esc(modelState.message || "填好地址与密钥后会自动拉取模型。") +
      "</p>"
    );
  }

  /* ---------- 内页整页结构 ---------- */
  function apiBodyMarkup() {
    return (
      '<p class="sectitle"><span>接口地址</span><span>自动补全</span></p>' +
      '<div class="set-group set-group--api"><div class="api-field">' +
      '<label class="api-field__label" for="api-base">基础地址（只填括号里的部分）</label>' +
      '<input class="api-field__input" id="api-base" type="text" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="api.openai.com/v1" value="' + S.esc(draft.base) + '">' +
      '<p class="api-urlview" id="api-urlview">' + urlViewMarkup(draft.base) + "</p>" +
      '<p class="api-field__hint">协议与末尾路径由系统补全，你只需要填主机与版本段。</p>' +
      "</div></div>" +
      '<p class="sectitle"><span>密钥</span><span>仅存本机</span></p>' +
      '<div class="set-group set-group--api"><div class="api-field">' +
      '<label class="api-field__label" for="api-key">API 密钥（Key）</label>' +
      '<div class="api-field__row">' +
      '<input class="api-field__input" id="api-key" type="' + (keyVisible ? "text" : "password") + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="sk-..." value="' + S.esc(draft.key) + '">' +
      '<button class="api-eye' + (keyVisible ? " is-on" : "") + '" type="button" data-api-eye aria-label="显示或隐藏密钥">' + (keyVisible ? "隐藏" : "显示") + "</button>" +
      "</div>" +
      '<p class="api-field__hint">密钥只写入这台设备的本地存储。</p>' +
      "</div></div>" +
      '<p class="sectitle"><span>模型</span><span>自动拉取</span></p>' +
      '<div class="set-group set-group--api">' + modelBlockMarkup() + "</div>" +
      '<div class="api-actions"><button class="btn" id="api-clear" type="button">清空密钥</button></div>' +
      '<p class="api-status" id="api-status">' + S.esc(apiStatusText()) + "</p>"
    );
  }

  function apiViewMarkup() {
    return (
      '<header class="app-head">' +
      '<button class="app-head__back" id="app-back" type="button" aria-label="返回设置"></button>' +
      '<div class="app-head__title"><p>接口连接</p><p>地址自动补全 · 模型自动拉取</p></div>' +
      "</header>" +
      '<div class="app-body" id="settings-body">' + apiBodyMarkup() + "</div>" +
      '<div class="app-foot api-foot">' +
      '<button class="btn" id="api-test" type="button">测试连接</button>' +
      '<button class="btn btn--solid" id="api-save" type="button">保存接口</button>' +
      "</div>"
    );
  }

  /* ---------- 人设书 / 世界书内页：临时状态与片段 ---------- */
  var personaView = {
    mode: "auto",
    busy: false,
    draft: null,
    pasteOpen: false,
    pasteText: "",
    openBook: "",
    test: "",
    testResult: null
  };

  function P() {
    return S.persona && typeof S.persona.stats === "function" ? S.persona : null;
  }

  function cut(text, n) {
    var t = String(text === null || text === undefined ? "" : text).replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  /* 开关：避开设置首页的 data-switch，防止误改系统开关 */
  function psw(target, on) {
    return (
      '<button class="switch' + (on ? " is-on" : "") + '" type="button" data-p-toggle="' + S.esc(target) +
      '" role="switch" aria-checked="' + on + '" aria-label="启用开关"><i></i></button>'
    );
  }

  function pstat(label, value) {
    return (
      '<div class="pbook-stat"><b>' + S.esc(String(value)) + "</b><span>" + S.esc(label) + "</span></div>"
    );
  }

  function personaSummaryLine() {
    var api = P();
    if (!api) return "学习层未就绪";
    var st = api.stats();
    if (!st.hasCard && !st.books) return "未导入 · 只按默认性格说话";
    var bits = [];
    if (st.hasCard) bits.push(st.cardOn ? "人设书 " + st.cardName : "人设书已暂停");
    if (st.books) bits.push(st.books + " 本书 / " + st.activeEntries + " 条");
    return bits.join(" · ");
  }

  function personaStatsMarkup() {
    var api = P();
    if (!api) return '<p class="pbook-note">学习层未加载，检查 js/persona.js 是否存在。</p>';
    var st = api.stats();
    return (
      '<div class="pbook-stats">' +
      pstat("人设字段", st.fields) +
      pstat("生效条目", st.activeEntries + "/" + st.entries) +
      pstat("关键词", st.keys) +
      pstat("注入预算", st.budget) +
      "</div>" +
      '<p class="pbook-note">人设书常驻生效；世界书按关键词在你说话时自动想起，超出预算的条目不会挤进来。</p>'
    );
  }

  var PBOOK_MODES = [
    { key: "auto", label: "自动识别" },
    { key: "card", label: "当人设书" },
    { key: "book", label: "当世界书" }
  ];

  function personaImportMarkup() {
    var modes = PBOOK_MODES.map(function (m) {
      return (
        '<button class="seg__btn' + (personaView.mode === m.key ? " is-on" : "") +
        '" type="button" data-p-mode="' + m.key + '">' + m.label + "</button>"
      );
    }).join("");

    var paste = personaView.pasteOpen
      ? '<textarea class="pbook-area" id="pbook-paste" rows="6" spellcheck="false" placeholder="粘上角色卡 JSON、世界书条目，或分节写的人设文本…">' +
        S.esc(personaView.pasteText) +
        "</textarea>" +
        '<div class="pbook-row-acts"><button class="btn btn--solid" type="button" data-p-action="parse">解析这段文本</button></div>'
      : "";

    var busy = personaView.busy ? '<p class="model-state">正在读取并拆成伴侣能用的设定…</p>' : "";

    /* 选文件时放行哪些格式：用 docs.js 的登记表，Word 文档也能选 */
    var accept = S.docs && typeof S.docs.accept === "function"
      ? S.docs.accept()
      : ".docx,.doc,.wps,.json,.jsonl,.txt,.md,.markdown,.png,application/json,text/plain,image/png";

    return (
      '<div class="seg seg--modes">' + modes + "</div>" +
      '<div class="pbook-import">' +
      '<button class="btn" type="button" data-p-action="pick">选文件</button>' +
      '<button class="btn' + (personaView.pasteOpen ? " btn--solid" : "") + '" type="button" data-p-action="paste">' +
      (personaView.pasteOpen ? "收起粘贴" : "粘贴文本") +
      "</button>" +
      "</div>" +
      '<input class="pbook-file" id="pbook-file" type="file" accept="' + accept + '" hidden>' +
      '<p class="pbook-note">支持 Word（.docx / .doc / .wps）、PDF、角色卡 JSON（chara_card_v2 / v3）、PNG 内嵌角色卡、世界书 JSON，以及纯文本与 Markdown。Word 里把每一节写成标题、人设表用两列表格，导入时会自动拆成字段和条目。</p>' +
      busy +
      paste
    );
  }

  function personaDraftMarkup() {
    var d = personaView.draft;
    if (!d) return "";
    if (!d.ok) {
      return '<div class="pbook-fail">' + S.esc(d.message || "没认出来") + "</div>";
    }

    var rows = [];
    if (d.card) {
      rows.push('<p class="pbook-draft__title">人设书 · ' + S.esc(d.card.name) + "</p>");
      if (d.card.tagline) rows.push('<p class="pbook-draft__sub">' + S.esc(cut(d.card.tagline, 48)) + "</p>");
      (d.card.fields || []).slice(0, 6).forEach(function (f) {
        rows.push('<p class="pbook-draft__row"><b>' + S.esc(f.k) + "</b><span>" + S.esc(cut(f.v, 52)) + "</span></p>");
      });
      if (d.card.greeting) {
        rows.push('<p class="pbook-draft__row"><b>开场</b><span>' + S.esc(cut(d.card.greeting, 52)) + "</span></p>");
      }
    }
    if (d.book) {
      rows.push('<p class="pbook-draft__title">世界书 · ' + S.esc(d.book.name) + "</p>");
      rows.push('<p class="pbook-draft__sub">' + d.book.entries.length + " 条设定</p>");
      d.book.entries.slice(0, 5).forEach(function (e) {
        rows.push(
          '<p class="pbook-draft__row"><b>' + S.esc(e.title || "条目") + "</b><span>" +
            S.esc((e.keys || []).length ? e.keys.slice(0, 3).join("、") : "常驻") + "</span></p>"
        );
      });
      if (d.book.entries.length > 5) {
        rows.push('<p class="pbook-draft__more">还有 ' + (d.book.entries.length - 5) + " 条，学会后可以展开看</p>");
      }
    }
    if (d.message) rows.push('<p class="pbook-draft__more">' + S.esc(d.message) + "</p>");

    return (
      '<div class="pbook-draft">' +
      rows.join("") +
      '<div class="pbook-row-acts">' +
      '<button class="btn" type="button" data-p-action="discard">不学</button>' +
      '<button class="btn btn--solid" type="button" data-p-action="adopt">学会它</button>' +
      "</div></div>"
    );
  }

  function personaCardMarkup() {
    var api = P();
    var c = api ? api.state().card : null;
    if (!c) {
      return '<div class="empty"><i aria-hidden="true"></i><p>还没有人设书</p><p>导入一份角色卡，伴侣会按它的身份、性格和口吻说话。</p></div>';
    }
    var on = c.enabled !== false;
    var fields = (c.fields || []).map(function (f) {
      return '<div class="pbook-field"><b>' + S.esc(f.k) + "</b><span>" + S.esc(cut(f.v, 120)) + "</span></div>";
    }).join("");
    return (
      '<div class="pbook-item' + (on ? "" : " is-off") + '">' +
        '<div class="pbook-item__head"><div class="pbook-item__title"><p>' + S.esc(c.name) + "</p><p>" +
          S.esc(c.format || c.source || "本机导入") + " · " + (c.fields || []).length + " 个字段</p></div>" + psw("card", on) + "</div>" +
        (c.tagline ? '<p class="pbook-item__tag">' + S.esc(cut(c.tagline, 60)) + "</p>" : "") +
        fields +
        (c.greeting ? '<div class="pbook-field"><b>开场</b><span>' + S.esc(cut(c.greeting, 100)) + "</span></div>" : "") +
        (c.extra ? '<div class="pbook-field"><b>要求</b><span>' + S.esc(cut(c.extra, 100)) + "</span></div>" : "") +
        '<div class="pbook-item__acts">' +
          '<button class="chip chip--ghost" type="button" data-p-action="rename">用这个名字</button>' +
          '<button class="chip chip--ghost" type="button" data-p-action="del-card">移除人设书</button>' +
        "</div>" +
      "</div>"
    );
  }

  function personaEntryMarkup(bookId, e) {
    var on = e.enabled !== false;
    var keys = (e.keys || []).slice(0, 8).map(function (k) {
      return '<span class="pbook-key">' + S.esc(k) + "</span>";
    }).join("");
    var more = (e.keys || []).length > 8 ? '<span class="pbook-key is-more">+' + ((e.keys || []).length - 8) + "</span>" : "";
    var constTag = e.constant ? '<span class="pbook-key is-const">常驻</span>' : "";
    return (
      '<div class="pbook-entry' + (on ? "" : " is-off") + '">' +
        '<div class="pbook-entry__head"><b>' + S.esc(e.title || "条目") + "</b>" + psw("entry:" + bookId + ":" + e.id, on) + "</div>" +
        (keys || more || constTag ? '<div class="pbook-keys">' + constTag + keys + more + "</div>" : "") +
        '<p class="pbook-entry__text">' + S.esc(cut(e.content, 96)) + "</p>" +
        '<button class="pbook-del" type="button" data-p-action="del-entry" data-book="' + S.esc(bookId) +
          '" data-entry="' + S.esc(e.id) + '">删掉这条</button>' +
      "</div>"
    );
  }

  function personaBooksMarkup() {
    var api = P();
    var books = api ? api.state().books : [];
    if (!books.length) {
      return '<div class="empty"><i aria-hidden="true"></i><p>还没有世界书</p><p>导入设定集后，伴侣只在你提到相关词时想起它们。</p></div>';
    }
    return books
      .map(function (b) {
        var on = b.enabled !== false;
        var open = personaView.openBook === b.id;
        var active = b.entries.filter(function (e) {
          return e.enabled !== false;
        }).length;
        return (
          '<div class="pbook-item' + (on ? "" : " is-off") + '">' +
            '<div class="pbook-item__head"><div class="pbook-item__title"><p>' + S.esc(b.name) + "</p><p>" +
              b.entries.length + " 条 · 生效 " + active + " 条 · " +
              S.esc(b.format || b.source || "本机导入") + "</p></div>" +
              psw("book:" + b.id, on) +
            "</div>" +
            '<div class="pbook-item__acts">' +
              '<button class="chip chip--ghost" type="button" data-p-action="book-open" data-book="' + S.esc(b.id) + '">' +
                (open ? "收起条目" : "展开 " + b.entries.length + " 条") +
              "</button>" +
              '<button class="chip chip--ghost" type="button" data-p-action="del-book" data-book="' + S.esc(b.id) + '">移除这本书</button>' +
            "</div>" +
            (open
              ? '<div class="pbook-entries">' +
                  b.entries.map(function (e) { return personaEntryMarkup(b.id, e); }).join("")
                + "</div>"
              : "") +
          "</div>"
        );
      })
      .join("");
  }

  function personaHitsMarkup(res) {
    if (!res) return "";
    if (!res.items.length) {
      return '<p class="pbook-note">这句话没触发任何条目，伴侣只会按人设书和当下心情回答。</p>';
    }
    return (
      res.items
        .map(function (h) {
          var keys = h.keys.map(function (k) {
            return '<span class="pbook-key is-hit">' + S.esc(k) + "</span>";
          }).join("");
          return (
            '<div class="pbook-hit"><div class="pbook-hit__head"><b>' + S.esc(h.entry.title || "条目") + "</b><span>" +
              S.esc(h.book.name) +
            "</span></div><div class=\"pbook-keys\">" +
              (keys || '<span class="pbook-key is-const">常驻</span>') +
            '</div><p class="pbook-hit__why">' +
              S.esc(h.constant ? "常驻生效" : "命中关键词") + " · " + S.esc(cut(h.entry.content, 80)) +
            "</p></div>"
          );
        })
        .join("") +
      '<p class="pbook-note">这次会带入 ' + res.items.length + " 条 / " + res.used + " 字，预算 " + res.budget +
        " 字。这就是伴侣回复前真正读到的内容。</p>"
    );
  }

  function personaTestMarkup() {
    var api = P();
    var st = api ? api.stats() : null;
    if (!st || (!st.activeEntries && !st.cardOn)) {
      return '<p class="pbook-note">先导入内容，这里才能试出伴侣会想起什么。</p>';
    }
    var keys = api.keywords(10);
    return (
      '<div class="field"><input id="pbook-test" type="text" maxlength="60" autocomplete="off" placeholder="说一句设定里的词，比如角色名或地名…" value="' +
        S.esc(personaView.test) + '"><button class="chip" id="pbook-test-go" type="button">试一试</button></div>' +
      (keys.length
        ? '<div class="pbook-keys">' +
            keys.map(function (k) { return '<span class="pbook-key">' + S.esc(k) + "</span>"; }).join("") +
          "</div>"
        : "") +
      '<div class="pbook-hits">' + personaHitsMarkup(personaView.testResult) + "</div>"
    );
  }

  function personaBudgetMarkup() {
    var api = P();
    var budget = api ? api.stats().budget : 1200;
    return (
      '<div class="pbook-budget"><div class="pbook-budget__top"><span>单次注入预算</span><b id="pbook-budget-val">' +
        budget +
        ' 字</b></div><input id="pbook-budget" type="range" min="300" max="20000" step="100" value="' +
        budget +
        '" aria-label="单次注入预算" aria-valuemin="300" aria-valuemax="20000">' +
        '<p class="pbook-note">可调范围 300 – 20000 字，最高刻度 20000 字（固定上限，不再往上）。</p></div>'
    );
  }

  /* 学习层入口：缺席时整段静默降级，不给设定书留空壳 */
  function learnApi() {
    return S.learn && typeof S.learn.panelMarkup === "function" ? S.learn : null;
  }

  function learnPanelMarkup() {
    var L = learnApi();
    if (!L) return "";
    try {
      return String(L.panelMarkup() || "");
    } catch (err) {
      return "";
    }
  }

  function personaBodyMarkup() {
    return (
      '<p class="sectitle"><span>学习状态</span><span>' + S.esc(personaSummaryLine()) + "</span></p>" +
      '<div class="set-group set-group--api">' + personaStatsMarkup() + personaBudgetMarkup() + "</div>" +
      learnPanelMarkup() +
      '<p class="sectitle"><span>导入</span><span>文件 / 粘贴</span></p>' +
      '<div class="set-group set-group--api">' + personaImportMarkup() + personaDraftMarkup() + "</div>" +
      '<p class="sectitle"><span>人设书</span><span>常驻生效</span></p>' +
      '<div class="set-group set-group--api">' + personaCardMarkup() + "</div>" +
      '<p class="sectitle"><span>世界书</span><span>按关键词想起</span></p>' +
      '<div class="set-group set-group--api">' + personaBooksMarkup() + "</div>" +
      '<p class="sectitle"><span>它会想起什么</span><span>导入后立即可测</span></p>' +
      '<div class="set-group set-group--api">' + personaTestMarkup() + "</div>" +
      '<p class="set-note">人设书常驻生效，世界书只在你提到相关词时想起。所有内容只写入这台设备的本地存储，不会上传。</p>'
    );
  }

  /* ---------- 外观内页：全局玻璃外观（莫兰迪色系） ---------- */
  var GLASS_FALLBACK = [
    { id: "none", name: "原色", a: "#f7f7f5", b: "#dcdcd8", desc: "保持原本的灰白玻璃" },
    { id: "pink", name: "莫兰迪粉", a: "#f3dfe2", b: "#d8b8bf", desc: "灰调玫瑰，柔和偏暖" },
    { id: "green", name: "莫兰迪绿", a: "#dfe8df", b: "#b6c8b8", desc: "雾感苔绿，安静清爽" },
    { id: "blue", name: "莫兰迪蓝", a: "#dde5ee", b: "#b3c2d4", desc: "灰蓝雾面，冷静克制" },
    { id: "purple", name: "莫兰迪紫", a: "#e6e0ec", b: "#c2b6d2", desc: "灰紫薄雾，温柔内敛" },
    { id: "light", name: "浅色", a: "#fbfbfa", b: "#e6e6e3", desc: "更亮的白玻璃" },
    { id: "dark", name: "深色", a: "#3a3c42", b: "#22242a", desc: "更沉的墨玻璃" }
  ];

  function glassList() {
    var T = window.CalliaTheme;
    if (T && T.glasses && T.glasses.length) return T.glasses;
    return GLASS_FALLBACK;
  }

  function glassActive() {
    var T = window.CalliaTheme;
    if (T && typeof T.glass === "function") {
      try {
        return T.glass();
      } catch (err) {
        return "none";
      }
    }
    return "none";
  }

  function glassOptionMarkup(g, active) {
    var on = g.id === active;
    return (
      '<button class="glass-opt' + (on ? " is-on" : "") + '" type="button" data-set-glass="' + S.esc(g.id) +
      '" aria-pressed="' + (on ? "true" : "false") + '">' +
      '<i class="glass-opt__fill" aria-hidden="true" style="--g-a:' + S.esc(g.a) + ";--g-b:" + S.esc(g.b) + '"></i>' +
      '<span class="glass-opt__body"><span class="glass-opt__name">' + S.esc(g.name) + "</span>" +
      '<span class="glass-opt__desc">' + S.esc(g.desc || "") + "</span></span>" +
      '<i class="glass-opt__check" aria-hidden="true"></i>' +
      "</button>"
    );
  }

  function glassBodyMarkup() {
    var active = glassActive();
    var st = S.store.settings;
    return (
      '<p class="sectitle"><span>全局玻璃外观</span><span>莫兰迪色系</span></p>' +
      '<div class="set-group set-group--api">' +
      '<div class="glass-list" role="group" aria-label="全局玻璃外观">' +
      glassList().map(function (g) { return glassOptionMarkup(g, active); }).join("") +
      "</div>" +
      '<p class="set-note">选色后，设置页、心情页、主页的卡片、按钮与弹窗会一起换成这套玻璃底色，毛玻璃色调同步跟随。</p>' +
      "</div>" +
      '<p class="sectitle"><span>明暗</span><span>与玻璃外观叠加</span></p>' +
      '<div class="set-group">' +
      '<div class="set-row"><div class="set-row__label"><p>界面明暗</p><p>浅色玻璃 / 深色玻璃，只改变界面明暗</p></div>' +
      '<div class="seg"><button class="seg__btn' + (st.theme === "light" ? " is-on" : "") + '" type="button" data-set-theme="light">浅色</button>' +
      '<button class="seg__btn' + (st.theme === "dark" ? " is-on" : "") + '" type="button" data-set-theme="dark">深色</button></div></div>' +
      '<div class="set-row"><div class="set-row__label"><p>动效</p><p>关闭后光球呼吸与转场会静止</p></div>' + sw("motion", st.motion) + "</div>" +
      '<button class="set-row set-row--go" type="button" data-wp-open>' +
      '<span class="set-row__label"><span class="set-row__t">桌面壁纸</span>' +
      '<span class="set-row__d">内置预设与本机图片，桌面与锁屏共用</span></span>' +
      '<span class="set-row__value">' + S.esc(wpSummary()) + "</span>" +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      "</button>" +
      "</div>" +
      '<p class="set-note">玻璃外观只改界面材质，不会覆盖壁纸与明暗设置。</p>'
    );
  }

  function glassViewMarkup() {
    return (
      '<header class="app-head">' +
      '<button class="app-head__back" id="app-back" type="button" aria-label="返回设置"></button>' +
      '<div class="app-head__title"><p>外观</p><p>全局玻璃外观 · 莫兰迪色系</p></div>' +
      "</header>" +
      '<div class="app-body" id="settings-body">' + glassBodyMarkup() + "</div>" +
      '<div class="app-foot api-foot">' +
      '<button class="btn" id="glass-back" type="button">返回设置</button>' +
      '<button class="btn btn--solid" type="button" data-open="mood">去看看心情页</button>' +
      "</div>"
    );
  }

  /* 内页整页骨架：返回头 + 正文 + 底部动作，与接口内页同一套结构 */
  function personaViewMarkup() {
    return (
      '<header class="app-head">' +
      '<button class="app-head__back" id="app-back" type="button" aria-label="返回设置"></button>' +
      '<div class="app-head__title"><p>人设书 · 世界书</p><p>导入设定 · 伴侣按它说话</p></div>' +
      "</header>" +
      '<div class="app-body" id="settings-body">' + personaBodyMarkup() + "</div>" +
      '<div class="app-foot api-foot">' +
      '<button class="btn" id="pbook-back" type="button">返回设置</button>' +
      '<button class="btn btn--solid" type="button" data-open="chat">去对话试试</button>' +
      "</div>"
    );
  }

  /* ---------- 人设书 / 世界书：数据动作与局部刷新 ---------- */
  function stillInPersona(root) {
    return settingsView === "persona" && !!S.el("#settings-body", root);
  }

  function resetPersonaView() {
    personaView.mode = "auto";
    personaView.busy = false;
    personaView.draft = null;
    personaView.pasteOpen = false;
    personaView.pasteText = "";
    personaView.openBook = "";
    personaView.test = "";
    personaView.testResult = null;
  }

  function importPersonaFile(root, file) {
    var api = P();
    if (!api) {
      S.os.toast("学习层未加载");
      return;
    }
    personaView.busy = true;
    personaView.draft = null;
    paint(root, true);

    api.parseFile(file, personaView.mode).then(function (res) {
      personaView.busy = false;
      if (!stillInPersona(root)) return;
      personaView.draft = res;
      paint(root, true);
      if (!res || !res.ok) S.os.toast((res && res.message) || "没认出这份文件");
      else S.os.haptic(6);
    });
  }

  function parsePersonaPaste(root) {
    var api = P();
    if (!api) {
      S.os.toast("学习层未加载");
      return;
    }
    var box = S.el("#pbook-paste", root);
    var text = String(box ? box.value : personaView.pasteText || "");
    if (!text.trim()) {
      S.os.toast("先粘一段内容进来");
      return;
    }
    personaView.pasteText = text;
    personaView.draft = api.parsePaste(text, personaView.mode);
    paint(root, true);
    if (!personaView.draft.ok) S.os.toast(personaView.draft.message || "没认出来");
    else S.os.haptic(6);
  }

  /* 试算只替换命中区，不重绘整页，输入框焦点与内容都保住 */
  function runPersonaTest(root) {
    var api = P();
    if (!api) return;
    var input = S.el("#pbook-test", root);
    var text = String(input ? input.value : personaView.test || "");
    if (!text.trim()) {
      S.os.toast("先写一句话");
      return;
    }
    personaView.test = text;
    personaView.testResult = api.probe(text);
    var box = S.el(".pbook-hits", root);
    if (box) box.innerHTML = personaHitsMarkup(personaView.testResult);
    else paint(root, true);
    S.os.haptic(6);
  }

  function personaToggle(root, target) {
    var api = P();
    if (!api) return;
    var bits = String(target || "").split(":");
    if (bits[0] === "card") api.toggleCard();
    else if (bits[0] === "book" && bits[1]) api.toggleBook(bits[1]);
    else if (bits[0] === "entry" && bits[1] && bits[2]) api.toggleEntry(bits[1], bits[2]);
    personaView.testResult = null;
    paint(root, true);
  }

  function personaAction(root, btn) {
    var api = P();
    if (!api) {
      S.os.toast("学习层未加载");
      return;
    }
    var act = btn.getAttribute("data-p-action") || "";
    var bookId = btn.getAttribute("data-book") || "";
    var entryId = btn.getAttribute("data-entry") || "";

    if (act === "pick") {
      var picker = S.el("#pbook-file", root);
      if (picker) picker.click();
      else S.os.toast("这台设备选不了文件，改用粘贴文本");
      return;
    }

    if (act === "paste") {
      if (S.el("#pbook-paste", root)) personaView.pasteText = S.el("#pbook-paste", root).value;
      personaView.pasteOpen = !personaView.pasteOpen;
      paint(root, true);
      return;
    }

    if (act === "parse") {
      parsePersonaPaste(root);
      return;
    }

    if (act === "discard") {
      personaView.draft = null;
      paint(root, true);
      return;
    }

    if (act === "adopt") {
      var res = api.adopt(personaView.draft);
      personaView.draft = null;
      personaView.pasteOpen = false;
      personaView.pasteText = "";
      personaView.testResult = null;
      paint(root, false);
      S.os.haptic(8);
      S.os.toast(res.message || "没认出可用内容");
      return;
    }

    if (act === "rename") {
      var name = api.useCardName();
      if (!name) {
        S.os.toast("这个人设书没有名字");
        return;
      }
      S.os.refreshHome();
      paint(root, true);
      S.os.toast("以后我叫 " + name);
      return;
    }

    if (act === "del-card") {
      api.dropCard();
      personaView.testResult = null;
      paint(root, true);
      S.os.toast("人设书已移除");
      return;
    }

    if (act === "book-open") {
      personaView.openBook = personaView.openBook === bookId ? "" : bookId;
      paint(root, true);
      return;
    }

    if (act === "del-book") {
      api.dropBook(bookId);
      if (personaView.openBook === bookId) personaView.openBook = "";
      personaView.testResult = null;
      paint(root, true);
      S.os.toast("这本书已移除");
      return;
    }

    if (act === "del-entry") {
      api.dropEntry(bookId, entryId);
      personaView.testResult = null;
      paint(root, true);
      S.os.toast("这条设定已删掉");
      return;
    }

    /* --- 学习层：读一遍、全部过一遍、清空学习记录 --- */
    if (act === "learn-study") {
      if (!learnApi() || typeof S.learn.study !== "function") {
        S.os.toast("学习层未加载");
        return;
      }
      var studied = S.learn.study(entryId);
      paint(root, true);
      S.os.haptic(6);
      S.os.toast(studied ? "又读了一遍，记牢一点了" : "这条设定已经不在了");
      return;
    }

    if (act === "learn-all") {
      if (!learnApi() || typeof S.learn.studyAll !== "function") {
        S.os.toast("学习层未加载");
        return;
      }
      var swept = S.learn.studyAll();
      paint(root, true);
      S.os.haptic(8);
      S.os.toast(swept ? "带着读了 " + swept + " 条" : "暂时没有要补的，都记住了");
      return;
    }

    if (act === "learn-reset") {
      if (!learnApi() || typeof S.learn.reset !== "function") {
        S.os.toast("学习层未加载");
        return;
      }
      S.learn.reset();
      paint(root, true);
      S.os.toast("学习记录已清空，设定还在");
      return;
    }
  }

  /* 当前桌面壁纸名：壁纸引擎（theme.js）未就绪时退回默认文案 */
  function wpSummary() {
    var T = window.CalliaTheme;
    if (T && typeof T.wallpaperName === "function") {
      try {
        return T.wallpaperName();
      } catch (err) {
        return "主题背景";
      }
    }
    return "主题背景";
  }

  /* 聊天气泡样式：独立设置项，只读写 localStorage('bubble_style')，不参与界面明暗 */
  var BUBBLE_KEY = "bubble_style";
  var BUBBLE_STYLES = [
    { id: "plain", label: "极简白" },
    { id: "glass", label: "毛玻璃" },
    { id: "gradient", label: "柔和渐变" },
    { id: "dark", label: "暗黑质感" }
  ];

  function getBubbleStyle() {
    var v = "";
    try {
      v = localStorage.getItem(BUBBLE_KEY) || "";
    } catch (e) {
      v = "";
    }
    for (var i = 0; i < BUBBLE_STYLES.length; i++) {
      if (BUBBLE_STYLES[i].id === v) return v;
    }
    return "plain";
  }

  function saveBubbleStyle(id) {
    try {
      localStorage.setItem(BUBBLE_KEY, id);
    } catch (e) {
      /* 本机存储不可用时静默降级，不阻断界面 */
    }
  }

  function bubbleBtnHtml(id, label) {
    return '<button class="seg__btn' + (getBubbleStyle() === id ? " is-on" : "") +
      '" type="button" data-set-bubble="' + id + '">' + label + "</button>";
  }

  if (!window.__bubbleStyleBound) {
    window.__bubbleStyleBound = true;
    document.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-set-bubble]") : null;
      if (!btn) return;
      saveBubbleStyle(btn.getAttribute("data-set-bubble"));
      var group = btn.parentNode;
      var list = group ? group.querySelectorAll("[data-set-bubble]") : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] === btn) {
          list[i].classList.add("is-on");
        } else {
          list[i].classList.remove("is-on");
        }
      }
    });
  }

  /* 我的档案（User Persona）：把本机存的值原样写进设置页里写死的输入框。
     设置页每次重绘都会重建 DOM，所以回显直接在模板里完成，不需要任何监听器。 */
  function upVal(key) {
    var v = "";
    try {
      v = localStorage.getItem(key) || "";
    } catch (err) {
      v = "";
    }
    return S.esc(v);
  }

  /* 全局玻璃外观摘要：主题引擎未就绪时退回默认文案 */
  function glassSummary() {
    var T = window.CalliaTheme;
    if (T && typeof T.glassName === "function") {
      try {
        return T.glassName();
      } catch (err) {
        return "原色";
      }
    }
    return "原色";
  }

  function renderSettingsBody() {
    var st = S.store.settings;
    return (
      '<p class="sectitle"><span>外观</span><span>明暗 · 玻璃 · 壁纸 · 动效</span></p>' +
      '<div class="set-group">' +
      /* 外观内页入口：整行可点，右侧显示当前玻璃外观名 */
      '<button class="set-row set-row--go" type="button" data-glass-open>' +
      '<span class="set-row__label"><span class="set-row__t">外观</span>' +
      '<span class="set-row__d">全局玻璃外观 · 莫兰迪色系</span></span>' +
      '<span class="set-row__value" id="glass-current">' + S.esc(glassSummary()) + "</span>" +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      "</button>" +
      '<div class="set-row"><div class="set-row__label"><p>界面明暗</p><p>浅色玻璃 / 深色玻璃，只改变界面明暗</p></div>' +
      '<div class="seg"><button class="seg__btn' + (st.theme === "light" ? " is-on" : "") + '" type="button" data-set-theme="light">浅色</button>' +
      '<button class="seg__btn' + (st.theme === "dark" ? " is-on" : "") + '" type="button" data-set-theme="dark">深色</button></div></div>' +
      '<div class="set-row"><div class="set-row__label"><p>动效</p><p>关闭后光球呼吸与转场会静止</p></div>' + sw("motion", st.motion) + "</div>" +
      '<button class="set-row set-row--go" type="button" data-wp-open>' +
      '<span class="set-row__label"><span class="set-row__t">桌面壁纸</span>' +
      '<span class="set-row__d">内置预设与本机图片，桌面与锁屏共用</span></span>' +
      '<span class="set-row__value">' + S.esc(wpSummary()) + "</span>" +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      "</button>" +
      /* 聊天气泡样式：与上方“桌面壁纸”行完全同构，不使用任何内联样式 */
      '<button class="set-row set-row--go" type="button" data-bubble-open>' +
      '<span class="set-row__label"><span class="set-row__t">聊天气泡样式</span>' +
      '<span class="set-row__d">仅存在本机，随时可换</span></span>' +
      '<span class="set-row__value" id="current-bubble-label">极简白</span>' +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      '</button>' +
      "</div>" +
      '<p class="sectitle"><span>伴侣</span><span>Lv.' + S.store.companion.level + " / " + S.MAX_LEVEL + "</span></p>" +
      '<div class="set-group">' +
      '<div class="set-row"><div class="set-row__label"><p>主动消息</p><p>安静太久时我会先开口（台词由接口生成，需先连接）</p></div>' + sw("proactive", st.proactive) + "</div>" +
      '<div class="set-row"><div class="set-row__label"><p>触感反馈</p><p>关键操作时轻微震动（设备支持时）</p></div>' + sw("haptic", st.haptic) + "</div>" +
      '<div class="set-row"><div class="set-row__label"><p>伴侣名字</p><p>改名后锁屏与对话同步更新</p></div>' +
      '<input class="set-input" id="name-input" type="text" maxlength="8" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="LUMEN" value="' + S.esc(S.store.companion.name) + '"></div>' +
      '<div class="set-row"><div class="set-row__label"><p>你的称呼</p><p>问候语与提示词里会这样叫你</p></div>' +
      '<input class="set-input" id="user-input" type="text" maxlength="12" autocomplete="off" spellcheck="false" placeholder="怎么称呼你" value="' + S.esc(st.user || "") + '"></div>' +
      '<div class="set-row"><div class="set-row__label"><p>保存名字</p><p>' + S.esc(S.store.companion.name) + " · " + S.esc(st.user || "未设置") + "</p></div>" +
      '<button class="chip" id="name-save" type="button">保存</button></div>' +
      "</div>" +
      '<p class="sectitle"><span>接口</span><span>本机保存</span></p>' +
      '<div class="set-group">' +
      '<button class="set-row set-row--go" type="button" data-api-open>' +
      '<span class="set-row__label"><span class="set-row__t">连接 AI 接口</span>' +
      '<span class="set-row__d">只填基础地址，模型自动拉取</span></span>' +
      '<span class="set-row__value">' + S.esc(apiSummaryLine()) + "</span>" +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      "</button>" +
      "</div>" +
      '<p class="sectitle"><span>设定</span><span>本机导入与编辑</span></p>' +
      '<div class="set-group">' +
      '<button class="set-row set-row--go" type="button" data-p-open>' +
      '<span class="set-row__label"><span class="set-row__t">人设书与世界书</span>' +
      '<span class="set-row__d">角色卡与设定集导入，伴侣按它说话</span></span>' +
      '<span class="set-row__value">' + S.esc(personaSummaryLine()) + "</span>" +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      "</button>" +
      /* 我的档案（User Persona）：设置页只留这一行入口，表单本体在 index.html 末尾的
         #persona-modal 底部弹窗里。点击调用 userPersona.js 挂到 window 的 openPersonaModal()，
         只用 display + transform 控制显隐：没有 hash / location.href 跳转，也没有第二套表单。 */
      '<button class="set-row set-row--go" type="button" onclick="openPersonaModal()">' +
      '<span class="set-row__label"><span class="set-row__t">我的档案 (User Persona)</span>' +
      '<span class="set-row__d">设定你的身份、性格与你们的关系</span></span>' +
      '<span class="set-row__value">去设置</span>' +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      "</button>" +
      /* 纯手动留言板模式：紧跟在 User 档案下面，样式与上方「动效」「主动消息」两行同构 */
      '<div class="set-row"><div class="set-row__label"><p>纯手动留言板模式</p><p>开启后，发送键将变为召唤键，点击召唤才会回复。</p></div>' +
      treeholeSwitch() +
      "</div>" +
      "</div>" +
      '<p class="sectitle"><span>数据</span><span>时光机 · 本机存储</span></p>' +
      /* 数据模块收拢：设置页只留这一行入口，五个动作按钮整体搬到 index.html 末尾的
         #data-manage-page 全屏内页里。按钮的 id / data-confirm 原样保留，点击仍由本文件的
         委托处理（见 bindSettings 里的 #data-page-host 判断），导出导入逻辑没有改动。 */
      '<button class="set-row set-row--go" type="button" onclick="openDataPage()">' +
      '<span class="set-row__label"><span class="set-row__t">数据管理</span>' +
      '<span class="set-row__d">备份、恢复与重置</span></span>' +
      '<span class="set-row__value">去管理</span>' +
      '<i class="set-row__arrow" aria-hidden="true"></i>' +
      "</button>" +
      "</div>" +
      '<div class="about"><p>CALLIA OS</p><p>v1.0 · ' + S.store.chat.length + " 条对话 / " + S.store.memories.length + " 段记忆</p></div>"
    );
  }

  /* ---------- 内页渲染与数据动作 ---------- */
  function syncStatus(root) {
    var box = S.el("#api-status", root);
    if (box) box.textContent = apiStatusText();
  }

  function paint(root, keepScroll) {
    var old = S.el(".app-body", root);
    var top = keepScroll && old ? old.scrollTop : 0;
    root.innerHTML =
      settingsView === "api"
        ? apiViewMarkup()
        : settingsView === "persona"
          ? personaViewMarkup()
          : settingsView === "glass"
            ? glassViewMarkup()
            : ui.head("设置", "把系统调成你舒服的样子") +
              '<div class="app-body" id="settings-body">' + renderSettingsBody() + "</div>";
    var next = S.el(".app-body", root);
    if (next && top) next.scrollTop = top;
    /* 重绘后把玻璃外观选中态重新对齐（主题引擎可能已换过色） */
    if (settingsView === "glass") {
      var T = window.CalliaTheme;
      if (T && typeof T.syncGlass === "function") T.syncGlass();
    }
  }

  function saveApi(announce) {
    var url = draftUrl();
    var key = String(draft.key || "").trim();
    var model = String(draft.model || "").trim();
    if (!url) {
      S.os.toast("请填写接口地址");
      return false;
    }
    if (!model) {
      S.os.toast("请选择或填写一个模型");
      return false;
    }
    apiSet("api_url", url);
    apiSet("api_key", key);
    apiSet("api_model", model);
    draft.base = S.api.displayBase(url);
    draft.key = key;
    draft.model = model;
    if (announce) {
      S.os.haptic(8);
      S.os.toast(key ? "接口设置已保存" : "已保存，密钥还是空的");
    }
    return true;
  }

  function pullModels(root, announce) {
    var url = draftUrl();
    var key = String(draft.key || "").trim();

    if (!url || !key) {
      modelState.status = "idle";
      modelState.message = !url ? "先填写接口地址。" : "先填写 API 密钥，再拉取模型。";
      paint(root, true);
      return;
    }

    modelState.status = "loading";
    modelState.message = "";
    paint(root, true);

    S.api.models({ url: url, key: key }).then(function (res) {
      /* 已经离开内页或应用已关闭时不再写回界面 */
      if (settingsView !== "api" || !S.el("#settings-body", root)) return;

      if (!res.ok) {
        modelState.status = "error";
        modelState.message = res.message || "模型列表拉取失败";
        paint(root, true);
        if (announce) S.os.toast("模型拉取失败");
        return;
      }

      modelState.status = "ready";
      modelState.items = res.models;

      var current = String(draft.model || apiGet("api_model") || "").trim();
      var inList = modelState.items.some(function (m) {
        return m.id === current;
      });
      if (!inList) {
        if (current) {
          modelState.items.unshift({ id: current, owner: "已保存", created: 0 });
        } else {
          draft.model = modelState.items[0].id;
          apiSet("api_model", draft.model);
          S.os.toast("已自动选择 " + draft.model);
        }
      }

      paint(root, true);
      if (announce) S.os.toast("已拉取 " + res.models.length + " 个模型");
    });
  }

  /* ---------- 时光机：数据备份与恢复（纯原生 JS） ---------- */
  /* 导出：遍历 localStorage 全部键值，打包成 JSON 下载，文件名带日期与 .json 后缀 */
  function exportAllData() {
    try {
      var backupData = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key) backupData[key] = localStorage.getItem(key);
      }
      var jsonString = JSON.stringify(backupData);
      var blob = new Blob([jsonString], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "Kalia_Backup_" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      S.os.haptic(8);
      S.os.toast("已导出 " + Object.keys(backupData).length + " 项数据");
    } catch (e) {
      S.os.toast("备份失败：" + (e && e.message ? e.message : e));
    }
  }

  /* 导入：解析备份文件并全覆盖写回 localStorage；解析失败只提示，不白屏 */
  function importAllData(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          S.os.toast("文件解析失败，请确保选择了正确的备份文件！");
          return;
        }
        for (var key in data) {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            localStorage.setItem(key, String(data[key]));
          }
        }
        S.os.toast("数据恢复成功！页面即将刷新。");
        window.setTimeout(function () {
          location.reload(); /* 刷新页面以加载新数据 */
        }, 600);
      } catch (err) {
        S.os.toast("文件解析失败，请确保选择了正确的备份文件！");
      }
    };
    reader.onerror = function () {
      S.os.toast("文件读取失败，请重新选择备份文件");
    };
    reader.readAsText(file);
  }

  /* ---------- 数据管理全屏内页 ---------- */
  /* 五个动作按钮的原始 HTML（id / data-confirm / 文案与搬走前逐字一致），从设置页搬进
     index.html 末尾的 #data-manage-page。仍然由本文件渲染，是为了让 #app-root 上那套
     点击委托（#btn-export-data / #btn-import-data / [data-confirm]）继续生效，不新增第二套逻辑。 */
  function dataPageMarkup() {
    return (
      /* 时光机：一键导出全部 localStorage 为 JSON，再用同一份文件全覆盖恢复 */
      '<button class="btn" id="btn-export-data" type="button">备份所有数据（导出）</button>' +
      '<button class="btn" id="btn-import-data" type="button">恢复数据（导入）</button>' +
      '<button class="btn" type="button" data-confirm="mood">重置心情与亲密度</button>' +
      '<button class="btn" type="button" data-confirm="chat">清空对话记录</button>' +
      '<button class="btn btn--solid" type="button" data-confirm="all">恢复出厂设置</button>'
    );
  }

  /* 打开内页：先把按钮填进 #data-page-host，再整页显示。设置页未打开过时也能直接用。 */
  function openDataPage() {
    var page = document.getElementById("data-manage-page");
    if (!page) return;
    var host = document.getElementById("data-page-host");
    if (host) host.innerHTML = dataPageMarkup();
    page.style.display = "flex";
    pendingConfirm = { key: "", at: 0 };
  }

  function closeDataPage() {
    var page = document.getElementById("data-manage-page");
    if (page) page.style.display = "none";
    pendingConfirm = { key: "", at: 0 };
  }

  var boundRoot = null;
  var boundHandlers = null;

  function bindSettings(root) {
    /* 内页开关挂到 window，供 index.html 里的 onclick 调用（与 openKaliaPage 同一套写法） */
    window.openDataPage = openDataPage;
    window.closeDataPage = closeDataPage;

    if (boundRoot && boundHandlers) {
      boundRoot.removeEventListener("click", boundHandlers.click);
      boundRoot.removeEventListener("input", boundHandlers.input);
      if (boundHandlers.change) boundRoot.removeEventListener("change", boundHandlers.change);
    }

    function refresh() {
      paint(root, true);
      /* 数据管理内页是 body 层的常驻节点，不随设置页重绘：重置类动作完成后把按钮重排一次 */
      var host = document.getElementById("data-page-host");
      if (host) host.innerHTML = dataPageMarkup();
    }

    function onClick(ev) {
      /* --- 内页：进入与返回 --- */
      if (ev.target.closest("[data-api-open]")) {
        settingsView = "api";
        keyVisible = false;
        modelState = { status: "idle", items: [], message: "", query: "" };
        initDraft();
        paint(root, false);
        if (String(draft.key || "").trim()) pullModels(root, false);
        return;
      }

      /* --- 外观内页：进入 --- */
      if (ev.target.closest("[data-glass-open]")) {
        settingsView = "glass";
        paint(root, false);
        return;
      }

      /* --- 人设书 / 世界书内页：进入 --- */
      if (ev.target.closest("[data-p-open]")) {
        settingsView = "persona";
        resetPersonaView();
        paint(root, false);
        return;
      }

      /* --- 我的档案（User Persona）：只打开本机面板，不进入内页、不重绘、不碰接口 --- */
      if (ev.target.closest("[data-up-open]")) {
        if (window.UserPersona && typeof window.UserPersona.open === "function") {
          window.UserPersona.open();
        }
        return;
      }

      /* --- 时光机：导出备份 / 调起导入（委托到 root，重绘不丢监听，也只绑一次） --- */
      if (ev.target.closest("#btn-export-data")) {
        exportAllData();
        return;
      }
      if (ev.target.closest("#btn-import-data")) {
        var importer = S.el("#import-file-input");
        if (importer) importer.click();
        else S.os.toast("这台设备选不了文件");
        return;
      }

      /* --- 内页返回：先回设置首页，再退到桌面 --- */
      if (ev.target.closest("#app-back") || ev.target.closest("#pbook-back") || ev.target.closest("#glass-back")) {
        if (settingsView === "glass") {
          settingsView = "main";
          paint(root, false);
          return;
        }
        if (settingsView === "api") {
          persistDraft();
          settingsView = "main";
          modelState = { status: "idle", items: [], message: "", query: "" };
          paint(root, false);
          return;
        }
        if (settingsView === "persona") {
          settingsView = "main";
          resetPersonaView();
          paint(root, false);
          return;
        }
        S.os.home();
        return;
      }

      /* --- 内页：密钥显示与清空 --- */
      var eye = ev.target.closest("[data-api-eye]");
      if (eye) {
        keyVisible = !keyVisible;
        var eyeInput = S.el("#api-key", root);
        if (eyeInput) eyeInput.type = keyVisible ? "text" : "password";
        eye.textContent = keyVisible ? "隐藏" : "显示";
        if (eye.classList && eye.classList.toggle) eye.classList.toggle("is-on", keyVisible);
        return;
      }

      if (ev.target.closest("#api-clear")) {
        draft.key = "";
        apiSet("api_key", "");
        var clearInput = S.el("#api-key", root);
        if (clearInput) clearInput.value = "";
        syncStatus(root);
        S.os.toast("密钥已清空");
        return;
      }

      /* --- 内页：模型拉取与点选 --- */
      if (ev.target.closest("#api-pull")) {
        pullModels(root, true);
        return;
      }

      var pick = ev.target.closest("[data-model]");
      if (pick) {
        draft.model = pick.getAttribute("data-model") || "";
        apiSet("api_model", draft.model);
        S.os.haptic(6);
        S.os.toast("已选择 " + draft.model);
        paint(root, true);
        return;
      }

      /* --- 内页：保存与连通测试 --- */
      if (ev.target.closest("#api-save")) {
        if (!saveApi(true)) return;
        paint(root, true);
        return;
      }

      if (ev.target.closest("#api-test")) {
        if (!saveApi(false)) return;
        var testBtn = S.el("#api-test", root);
        if (testBtn) {
          testBtn.disabled = true;
          testBtn.textContent = "测试中…";
        }
        S.api.test().then(function (res) {
          if (testBtn) {
            testBtn.disabled = false;
            testBtn.textContent = "测试连接";
          }
          S.os.toast(res.ok ? "连接成功 · " + String(res.text).slice(0, 12) : res.message);
        });
        return;
      }

      /* --- 人设书 / 世界书内页：模式切换只改按钮态，不重绘，保住粘贴区内容 --- */
      var mode = ev.target.closest("[data-p-mode]");
      if (mode) {
        personaView.mode = mode.getAttribute("data-p-mode") || "auto";
        S.els("[data-p-mode]", root).forEach(function (btn) {
          btn.classList.toggle("is-on", btn === mode);
        });
        return;
      }

      var pToggle = ev.target.closest("[data-p-toggle]");
      if (pToggle) {
        personaToggle(root, pToggle.getAttribute("data-p-toggle"));
        return;
      }

      var pAct = ev.target.closest("[data-p-action]");
      if (pAct) {
        personaAction(root, pAct);
        return;
      }

      if (ev.target.closest("#pbook-test-go")) {
        runPersonaTest(root);
        return;
      }

        if (ev.target.closest("#name-save")) {
          var nameInput = S.el("#name-input");
          var name = nameInput && nameInput.value ? nameInput.value.trim() : "";
          if (!name) {
            S.os.toast("名字不能为空");
            return;
          }
          var userInput = S.el("#user-input");
          var who = userInput && userInput.value ? userInput.value.trim() : "";
          S.store.companion.name = name.slice(0, 8);
          S.store.settings.user = who.slice(0, 12) || "你";
          S.save();
          S.os.refreshHome();
          S.os.haptic(6);
          S.os.toast(who ? "你好，" + who : "名字已保存");
          refresh();
          return;
        }

        var theme = ev.target.closest("[data-set-theme]");
        if (theme) {
          S.store.settings.theme = theme.getAttribute("data-set-theme");
          S.save();
          S.os.applyTheme();
          refresh();
          return;
        }

        var toggle = ev.target.closest("[data-switch]");
        if (toggle) {
          var key = toggle.getAttribute("data-switch");
          /* 纯手动留言板模式存在 localStorage 的独立键里，不进 settings */
          if (key === "treehole") {
            var nextOn = !getTreeholeMode();
            saveTreeholeMode(nextOn);
            S.os.haptic(8);
            S.os.toast("纯手动留言板模式" + (nextOn ? "已开启" : "已关闭"));
            refresh();
            return;
          }
          S.store.settings[key] = !S.store.settings[key];
          S.save();
          if (key === "motion") S.os.applyMotion();
          if (key === "proactive") S.os.scheduleProactive();
          if (key === "haptic" && S.store.settings.haptic) S.os.haptic(8);
          S.os.toast((key === "proactive" ? "主动消息" : key === "haptic" ? "触感反馈" : "动效") + (S.store.settings[key] ? "已开启" : "已关闭"));
          refresh();
          return;
        }

        var act = ev.target.closest("[data-confirm]");
        if (act) {
          var kind = act.getAttribute("data-confirm");
          var now = Date.now();
          if (pendingConfirm.key !== kind || now - pendingConfirm.at > 4000) {
            pendingConfirm = { key: kind, at: now };
            S.os.toast("再点一次确认" + (kind === "mood" ? "重置" : kind === "chat" ? "清空对话" : "恢复出厂"));
            return;
          }
          pendingConfirm = { key: "", at: 0 };
          if (kind === "mood") {
            S.store.companion.mood = "calm";
            S.store.companion.moodValue = 62;
            S.store.companion.affinity = 20;
            S.store.companion.level = S.levelOf(20);
            /* 亲密度被重置：心跳同步的里程碑基准一起归零 */
            if (S.heartbeat && typeof S.heartbeat.reset === "function") S.heartbeat.reset();
          } else if (kind === "chat") {
            S.store.chat = [{ id: S.uid("m"), role: "sys", text: "对话已清空，我还在。", ts: Date.now() }];
            S.store.stats.chats = 0;
          } else {
            S.reset();
            S.os.applyTheme();
            S.os.applyMotion();
          }
          S.save();
          S.os.refreshHome();
          S.os.toast("已完成");
          refresh();
        }
    }

    var saveTimer = 0;

    function onInput(ev) {
      var node = ev.target;
      var id = node && node.id ? node.id : "";

      function autosave() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(persistDraft, 600);
      }

      if (id === "api-base") {
        draft.base = node.value;
        var view = S.el("#api-urlview", root);
        if (view) view.innerHTML = urlViewMarkup(node.value);
        syncStatus(root);
        autosave();
        return;
      }
      if (id === "api-key") {
        draft.key = node.value;
        syncStatus(root);
        autosave();
        return;
      }
      if (id === "api-model-manual") {
        draft.model = node.value.trim();
        syncStatus(root);
        autosave();
        return;
      }
      if (id === "api-model-search") {
        modelState.query = node.value;
        var list = S.el("#model-list", root);
        if (list) list.innerHTML = modelRowsMarkup();
        return;
      }

      /* --- 人设书内页：只存到内存，重绘与落盘交给动作 --- */
      if (id === "pbook-paste") {
        personaView.pasteText = node.value;
        return;
      }
      if (id === "pbook-test") {
        personaView.test = node.value;
        return;
      }
      /* 预算滑杆拖动时只改读数，松手走 change 再落盘 */
      if (id === "pbook-budget") {
        var live = S.el("#pbook-budget-val", root);
        if (live) live.textContent = Number(node.value) + " 字";
      }
    }

    function onChange(ev) {
      var node = ev.target;
      var id = node && node.id ? node.id : "";

      /* 文件选择委托到 root，重绘后也不会丢监听 */
      /* 时光机导入：选完文件立即清空 value，允许重复选同一个文件 */
      if (id === "import-file-input") {
        var backup = node.files && node.files[0];
        node.value = "";
        if (backup) importAllData(backup);
        return;
      }

      if (id === "pbook-file") {
        var file = node.files && node.files[0];
        node.value = "";
        if (file) importPersonaFile(root, file);
        return;
      }

      if (id === "pbook-budget") {
        var api = P();
        if (!api) return;
        var saved = api.setBudget(node.value);
        var label = S.el("#pbook-budget-val", root);
        if (label) label.textContent = saved + " 字";
      }
    }

    boundRoot = root;
    boundHandlers = { click: onClick, input: onInput, change: onChange };
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
  }

  apps.settings = {
    render: function (root) {
      settingsView = "main";
      keyVisible = false;
      modelState = { status: "idle", items: [], message: "", query: "" };
      resetPersonaView();
      initDraft();
      paint(root, false);
      bindSettings(root);
    },
    /* 系统返回：内页先回设置首页，再退出到桌面 */
    onBack: function () {
      if (settingsView === "main") return false;
      var root = S.el("#app-root");
      if (!root) return false;
      if (settingsView === "api") {
        persistDraft();
        modelState = { status: "idle", items: [], message: "", query: "" };
      }
      settingsView = "main";
      resetPersonaView();
      paint(root, false);
      return true;
    },
    teardown: function () {
      if (settingsView === "api") persistDraft();
      settingsView = "main";
      modelState = { status: "idle", items: [], message: "", query: "" };
      resetPersonaView();
      if (S.api && S.api.abortModels) S.api.abortModels();
    }
  };
})(window);