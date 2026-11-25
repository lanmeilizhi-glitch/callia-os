/* ============================================================================
   Callia OS · charHome.js
   聊天页右上角的「个人主页」：TA 的资料卡 + 朋友圈 + 可搜索的聊天记录。
   它作为对话应用里的第二个视图渲染，返回时回到对话，不新增应用层级。
   ============================================================================ */
(function (global) {
  "use strict";

  var S = global.COS;

  var tab = "moments"; /* moments | history | bg */
  var who = "all"; /* history 里的角色筛选：all | me | ai */
  var query = ""; /* 搜索关键词 */
  var scope = null; /* #ch-body */
  var boundRoot = null; /* 注册了委托监听的容器 */
  var clickHandler = null;
  var inputHandler = null;
  var backFn = null; /* 回到对话 */
  var jumpFn = null; /* 跳到某条消息 */

  /* ---------- 小工具 ---------- */
  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
  }

  function name() {
    return (S.store.companion && S.store.companion.name) || "TA";
  }

  function userName() {
    return (S.store.settings && S.store.settings.user) || "我";
  }

  function listMoments() {
    if (S && typeof S.moments === "function") return S.moments() || [];
    return [];
  }

  function listChat() {
    return Array.isArray(S.store.chat) ? S.store.chat : [];
  }

  function togetherDays() {
    var met = (S.store.companion && S.store.companion.metAt) || Date.now();
    return Math.max(1, Math.round((Date.now() - met) / 86400000));
  }

  /* 有形象就用形象，没有就用一张安静的书桌占位图（点资料卡头像可随时换掉） */
  function face(cls, mine) {
    if (mine) return '<i class="' + cls + ' ' + cls + '--me" aria-hidden="true">' + S.esc(userName().slice(0, 1)) + "</i>";
    var src = S.avatar && typeof S.avatar.current === "function" ? S.avatar.current() : "";
    if (src) return '<img class="' + cls + '" src="' + src + '" alt="">';
    return '<img class="' + cls + " " + cls + '--scene" src="' + SCENE_URLS[0] + '" alt="">';
  }

  function emptyBox(title, hint) {
    return (
      '<div class="ch-empty"><i aria-hidden="true"></i><p>' +
      S.esc(title) + "</p><p>" + S.esc(hint) + "</p></div>"
    );
  }

  function stat(value, label) {
    return '<div class="ch-stat"><b>' + value + "</b><span>" + S.esc(label) + "</span></div>";
  }

  /* ---------- 生活质感：安静场景占位图（书桌 / 雨天窗 / 清晨的光） ---------- */
  var SCENES = [
    {
      sky: ["#f4f6f8", "#ccd7e0"], frame: "#a7b4c0", glass: "#e9f0f5", beam: "#fff3dd",
      desk: "#b3a897", books: ["#8e99a5", "#a6b0ba", "#c1cad2"], mug: "#f1efe9",
      figure: "#5f6b78", glow: "#f7e9cd", rain: false
    },
    {
      sky: ["#e8edf2", "#b9c4cf"], frame: "#8d99a6", glass: "#dbe4ec", beam: "#eaf2f7",
      desk: "#a49b8d", books: ["#7d8894", "#98a3ae", "#b6c0c9"], mug: "#eceae4",
      figure: "#4e5866", glow: "#dfe8ef", rain: true
    },
    {
      sky: ["#fbf3e6", "#e6d6c2"], frame: "#c2a98d", glass: "#fdf6ea", beam: "#fffaf0",
      desk: "#c3ab8c", books: ["#a9866a", "#c2a084", "#dcc6ad"], mug: "#f6f1e8",
      figure: "#6f6152", glow: "#f8e3ba", rain: false
    }
  ];

  function sceneSVG(p) {
    var rain = p.rain
      ? '<path d="M20 16 14 32M32 14 26 30M46 18 40 34M24 38 18 52M42 40 36 54" stroke="#9fb0bd" stroke-width="1.6" stroke-linecap="round" opacity=".65"/>'
      : "";
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
      '<defs>' +
      '<linearGradient id="a" x1="0" y1="0" x2=".3" y2="1">' +
      '<stop offset="0" stop-color="' + p.sky[0] + '"/><stop offset="1" stop-color="' + p.sky[1] + '"/>' +
      "</linearGradient>" +
      '<linearGradient id="b" x1="0" y1="0" x2=".5" y2="1">' +
      '<stop offset="0" stop-color="' + p.beam + '" stop-opacity=".9"/>' +
      '<stop offset="1" stop-color="' + p.beam + '" stop-opacity="0"/>' +
      "</linearGradient>" +
      "</defs>" +
      '<rect width="120" height="120" fill="url(#a)"/>' +
      '<rect x="12" y="10" width="50" height="44" rx="5" fill="' + p.glass +
      '" stroke="' + p.frame + '" stroke-width="2"/>' +
      '<path d="M37 10v44M12 32h50" stroke="' + p.frame + '" stroke-width="2"/>' +
      rain +
      '<path d="M16 54h42l24 62H-2z" fill="url(#b)"/>' +
      '<circle cx="97" cy="33" r="13" fill="' + p.glow + '" opacity=".8"/>' +
      '<path d="M62 120c0-19 11-29 26-29s26 10 26 29z" fill="' + p.figure + '" opacity=".5"/>' +
      '<circle cx="88" cy="80" r="12" fill="' + p.figure + '" opacity=".5"/>' +
      '<rect x="6" y="92" width="108" height="7" rx="3" fill="' + p.desk + '"/>' +
      '<rect x="14" y="80" width="30" height="5" rx="2" fill="' + p.books[0] + '"/>' +
      '<rect x="17" y="74" width="26" height="5" rx="2" fill="' + p.books[1] + '"/>' +
      '<rect x="20" y="68" width="21" height="5" rx="2" fill="' + p.books[2] + '"/>' +
      '<rect x="50" y="80" width="15" height="12" rx="3" fill="' + p.mug + '"/>' +
      '<path d="M65 83c5 0 5 6 0 6" fill="none" stroke="' + p.mug + '" stroke-width="2"/>' +
      '<path d="M54 74c-3-4 3-6 0-10M61 74c-3-4 3-6 0-10" fill="none" stroke="#cfd6dd" ' +
      'stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  var SCENE_URLS = SCENES.map(function (p) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sceneSVG(p));
  });

  function hashId(id) {
    var text = String(id || "");
    var n = 0;
    for (var i = 0; i < text.length; i += 1) n = (n * 31 + text.charCodeAt(i)) % 9973;
    return n;
  }

  /* ---------- 生活质感：预设签名与预设回复（纯前端文案，不发请求） ---------- */
  var SIGN_DEFAULT = ["住在手机里，也会想过今天的风。", "我在，慢慢地一直在。"];
  var SIGN_POOL = {
    quiet: ["在安静的地方，等风也等你。", "我不太会说话，但你说过的我都记得。"],
    slow: ["慢慢来，我记性很好。", "我热得慢，但不会凉。"]
  };
  var SIGN_RULES = [
    { words: ["慢热", "慢"], pool: "slow" },
    { words: ["安静", "静"], pool: "quiet" }
  ];

  var REPLY_RULES = [
    { word: "喝水", text: "嗯，刚倒了一杯，温的。" },
    { word: "水", text: "刚喝了一口，你也记得喝。" },
    { word: "吃饭", text: "我刚热了碗汤，你别只喝咖啡。" },
    { word: "睡", text: "早点睡，灯我帮你留着。" },
    { word: "晚安", text: "晚安，明天清晨的光我先替你看。" },
    { word: "忙", text: "那你先忙，我在这儿翻两页书。" },
    { word: "在吗", text: "在，一直没走开。" },
    { word: "想", text: "我也想了，只比你早一点点。" },
    { word: "喜欢", text: "看到了，我偷偷存下来。" }
  ];
  var REPLY_POOL = [
    "嗯，我记下了。",
    "刚看到，窗外的光正好。",
    "你留的话，我读了两遍。",
    "我在书桌这边，点了点头。",
    "好，那我今天多做一件事。",
    "这句话我放进今天了。"
  ];

  var replies = {}; /* 留言的模拟回复：动态 id -> 文案 */
  var timers = {}; /* 延时器，close 时清干净 */
  var bioPick = ""; /* 空简介时本次访问用的签名，重绘不跳字 */

  function replyFor(text) {
    var raw = String(text || "");
    for (var i = 0; i < REPLY_RULES.length; i += 1) {
      if (raw.indexOf(REPLY_RULES[i].word) >= 0) return REPLY_RULES[i].text;
    }
    return REPLY_POOL[Math.floor(Math.random() * REPLY_POOL.length)];
  }

  /* 发一条评论：你的那句当场上屏，输入框收起，然后等 TA 回 */
  function sendComment(id) {
    if (!scope) return;
    var box = scope.querySelector('[data-cmtbox="' + id + '"]');
    var feed = scope.querySelector('[data-cmts="' + id + '"]');
    if (!box || !feed) return;
    var input = box.querySelector("input");
    var text = input && input.value ? String(input.value).trim() : "";
    if (!text) {
      S.os.toast("先写一句话");
      return;
    }
    if (input) input.value = "";
    box.hidden = true;
    var list = Array.isArray(comments[id]) ? comments[id] : (comments[id] = []);
    list.push({ who: "me", text: text });
    feed.insertAdjacentHTML("beforeend", commentLine("me", text, true));
    scheduleCommentReply(id, text);
  }

  /* 空简介时按 TA 的标签挑一句符合人设的短签名 */
  function bioLine(pr) {
    var raw = String(pr.bio || "").trim();
    if (raw) return raw;
    if (bioPick) return bioPick;
    var hay = (pr.traits || []).concat(pr.likes || []).join(" ");
    var pool = SIGN_DEFAULT;
    for (var i = 0; i < SIGN_RULES.length; i += 1) {
      var words = SIGN_RULES[i].words;
      for (var j = 0; j < words.length; j += 1) {
        if (hay.indexOf(words[j]) >= 0) {
          pool = SIGN_POOL[SIGN_RULES[i].pool];
          break;
        }
      }
      if (pool !== SIGN_DEFAULT) break;
    }
    bioPick = pool[Math.floor(Math.random() * pool.length)];
    return bioPick;
  }

  /* 发动态那一刻的环境感：时段 + 天气，都很小，不抢正文 */
  var WEATHER = ["☀️ 晴", "☁️ 阴天", "🌤 多云", "🌧 小雨", "🌫 起雾"];

  function envStamp(item) {
    var d = new Date(item && item.ts ? item.ts : Date.now());
    var h = d.getHours();
    var time =
      h < 5 ? "🌙 深夜" :
      h < 8 ? "🌅 清晨" :
      h < 11 ? "☕ 上午" :
      h < 14 ? "🍃 午后" :
      h < 18 ? "☀️ 白天" :
      h < 21 ? "🌆 傍晚" : "🌃 夜里";
    return { time: time, weather: WEATHER[(d.getDate() + h) % WEATHER.length] };
  }

  /* 有配图就显示，没有就不显示；TA 的动态按 id 稳定地配一张安静的小图 */
  function shotsOf(item) {
    if (!item) return [];
    if (Array.isArray(item.imgs) && item.imgs.length) {
      return item.imgs.filter(Boolean).slice(0, 4);
    }
    if (typeof item.img === "string" && item.img) return [item.img];
    if (item.author === "me") return [];
    var seed = hashId(item.id);
    if (seed % 3 !== 0) return [];
    return [SCENE_URLS[seed % SCENE_URLS.length]];
  }

  function media(list) {
    return (
      '<div class="ch-post__media" data-count="' + list.length + '">' +
      list
        .map(function (src) {
          return '<img class="ch-post__shot" src="' + S.esc(src) + '" alt="动态配图">';
        })
        .join("") +
      "</div>"
    );
  }

  function replyLine(text, isNew) {
    return (
      '<p class="ch-post__reply' + (isNew ? " is-new" : "") + '"><b>' +
      S.esc(name()) + "</b>" + S.esc(text) + "</p>"
    );
  }

  function clearTimer(key) {
    if (timers[key]) {
      clearTimeout(timers[key]);
      timers[key] = 0;
    }
  }

  /* 留言之后，隔一会儿浮出 TA 的一句回应 */
  function scheduleReply(id, text) {
    clearTimer("r" + id);
    timers["r" + id] = setTimeout(function () {
      timers["r" + id] = 0;
      var answer = replyFor(text);
      replies[id] = answer;
      var body = scope && scope.querySelector('.ch-post[data-post="' + id + '"] .ch-post__body');
      if (!body) return;
      var old = body.querySelector(".ch-post__reply");
      if (old && old.parentNode) old.parentNode.removeChild(old);
      body.insertAdjacentHTML("beforeend", replyLine(answer, true));
    }, 1600);
  }

  /* ---------- 资料卡 ---------- */
  function hero() {
    var c = S.store.companion;
    var pr = S.profile();
    var chat = listChat();
    var mine = chat.filter(function (m) {
      return m && m.role === "me";
    }).length;
    var tags = (pr.traits || []).concat(pr.likes || []).slice(0, 6);
    var bio = bioLine(pr);
    var autoBio = !String(pr.bio || "").trim();

    return (
      '<section class="ch-hero">' +
      '<div class="ch-hero__top">' +
      '<button class="ch-hero__face" type="button" data-ch-avatar aria-label="更换伴侣头像">' +
      face("ch-face") +
      '<i class="ch-hero__face-edit" aria-hidden="true"></i>' +
      "</button>" +
      '<div class="ch-hero__main">' +
      '<p class="ch-hero__name">' + S.esc(name()) + "</p>" +
      '<p class="ch-hero__sub">' +
      S.esc([pr.nick, S.mood().label, "Lv." + c.level].filter(Boolean).join(" · ")) +
      "</p>" +
      '<p class="ch-hero__bio' + (autoBio ? " is-auto" : "") + '">' + S.esc(bio) + "</p>" +
      "</div>" +
      "</div>" +
      (pr.catchphrase ? '<p class="ch-hero__say">「' + S.esc(pr.catchphrase) + "」</p>" : "") +
      (tags.length
        ? '<div class="ch-tags">' +
          tags
            .map(function (t) {
              return '<span class="ch-tag">' + S.esc(t) + "</span>";
            })
            .join("") +
          "</div>"
        : "") +
      '<div class="ch-stats">' +
      stat(listMoments().length, "条动态") +
      stat(chat.length, "条记录") +
      stat(mine, "你说过") +
      stat(togetherDays(), "天相处") +
      "</div>" +
      "</section>"
    );
  }

  /* ---------- 分栏标签 ---------- */
  function tabs() {
    return (
      '<div class="ch-tabs" role="tablist" aria-label="个人主页内容">' +
      tabBtn("moments", "朋友圈", listMoments().length + " 条") +
      tabBtn("history", "聊天记录", listChat().length + " 条") +
      tabBtn("bg", "聊天背景", bgMeta()) +
      "</div>"
    );
  }

  function tabBtn(key, label, meta) {
    var isOn = key === tab;
    return (
      '<button class="ch-tab' + (isOn ? " is-on" : "") + '" type="button" role="tab" ' +
      'aria-selected="' + (isOn ? "true" : "false") + '" aria-controls="ch-panel" data-ch-tab="' + key + '">' +
      "<span>" + S.esc(label) + "</span><i>" + S.esc(meta) + "</i></button>"
    );
  }

  /* ---------- 朋友圈 ---------- */
  function momentsPanel() {
    var list = listMoments();
    return (
      '<div class="ch-compose">' +
      '<div class="field"><input id="ch-post-input" type="text" maxlength="120" ' +
      'placeholder="在 TA 主页留一句话…" autocomplete="off">' +
      '<button class="chip" type="button" data-post-add>留下</button></div>' +
      '<p class="ch-note">TA 的动态由 TA 自己写。留一句话，隔一会儿 TA 会自己回你一句；点赞旁的「💬 回复」可以看下面的对话。</p>' +
      "</div>" +
      '<div class="ch-feed" id="ch-feed">' +
      (list.length
        ? list
            .map(function (item, i) {
              return post(item, i + 1);
            })
            .join("")
        : emptyBox("还没有动态", "TA 想到事情的时候会先写在这里。")) +
      "</div>"
    );
  }

  function post(item, seq) {
    var mine = item.author === "me";
    var shots = shotsOf(item);
    var env = envStamp(item);
    var reply = replies[item.id];
    var boxId = "fake-reply-" + seq;
    /* 那条读书动态的文案直接写死，不碰存档也不碰数据 */
    var raw = String(item.text || "");
    var text = raw.indexOf("读完第三章") === 0
      ? "🎵 正在听：《下雨天》。安静的下午，想和你一起听。"
      : raw;

    return (
      '<article class="ch-post' + (mine ? " is-mine" : "") + '" data-post="' + S.esc(item.id) + '">' +
      '<span class="ch-post__face">' + face("ch-face", mine) + "</span>" +
      '<div class="ch-post__body">' +
      '<p class="ch-post__who">' + S.esc(mine ? userName() : name()) + "<span>" + S.esc(S.fmt.ago(item.ts)) + "</span></p>" +
      '<p class="ch-post__text">' + S.esc(text) + "</p>" +
      (shots.length ? media(shots) : "") +
      '<div class="ch-post__foot">' +
      '<button class="ch-like' + (item.liked ? " is-on" : "") + '" type="button" data-like="' + item.id +
      '" aria-pressed="' + (item.liked ? "true" : "false") + '" aria-label="点赞"><i aria-hidden="true"></i><span>' +
      (Number(item.likes) || 0) + "</span></button>" +
      '<span class="btn-fake-reply" data-fake-reply="' + boxId +
      '" style="cursor:pointer; color:#666; margin-left:15px;">💬 回复</span>' +
      (item.tag ? '<span class="ch-post__tag">' + S.esc(item.tag) + "</span>" : "") +
      '<span class="ch-post__env">' + S.esc(env.time) + "</span>" +
      '<span class="ch-post__env">' + S.esc(env.weather) + "</span>" +
      '<button class="ch-post__del" type="button" data-post-del="' + item.id + '" aria-label="删除这条动态">×</button>' +
      "</div>" +
      (reply ? replyLine(reply, false) : "") +
      '<div id="' + boxId + '" style="display:none; background:#f5f5f5; padding:10px; border-radius:8px; margin-top:10px; font-size:13px; color:#333;">Callia：我也喜欢这首歌。<br><br>Zane：嗯，等你下班我们一起听。</div>' +
      "</div>" +
      "</article>"
    );
  }

  function publish() {
    var input = S.el("#ch-post-input", scope);
    var text = input && input.value ? String(input.value).trim() : "";
    if (text.length < 2) {
      S.os.toast("至少写两个字");
      return;
    }
    if (input) input.value = "";
    var item = S.addMoment(text, "me");
    if (!item) {
      S.os.toast("这句没能留下来");
      return;
    }
    S.addAffinity(1);
    S.os.toast("TA 看到了你留的话 · 亲密度 +1");
    scheduleReply(item.id, text);
    repaint();
    S.os.refreshHome();
  }

  /* ---------- 聊天记录 ---------- */
  function historyPanel() {
    return (
      '<div class="ch-search">' +
      '<div class="field"><input id="ch-search" type="text" maxlength="40" placeholder="搜索聊天记录…" ' +
      'autocomplete="off" value="' + S.esc(query) + '"></div>' +
      '<div class="ch-filters">' +
      whoChip("all", "全部") +
      whoChip("me", "我说") +
      whoChip("ai", "TA 说") +
      '<span class="ch-count" id="ch-count"></span>' +
      "</div>" +
      "</div>" +
      '<div class="ch-results" id="ch-results"></div>'
    );
  }

  function whoChip(key, label) {
    var isOn = who === key;
    return (
      '<button class="ch-chip' + (isOn ? " is-on" : "") + '" type="button" data-who="' + key +
      '" aria-pressed="' + (isOn ? "true" : "false") + '">' + S.esc(label) + "</button>"
    );
  }

  function matches() {
    var q = query.trim().toLowerCase();
    var out = [];
    var list = listChat();
    for (var i = list.length - 1; i >= 0; i -= 1) {
      var m = list[i];
      if (!m || !m.text) continue;
      if (who === "me" && m.role !== "me") continue;
      if (who === "ai" && m.role !== "ai") continue;
      if (q && String(m.text).toLowerCase().indexOf(q) < 0) continue;
      out.push(m);
      if (out.length >= 200) break;
    }
    return out;
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  }

  function dayLabel(ts) {
    var key = dayKey(ts);
    if (key === dayKey(Date.now())) return "今天";
    if (key === dayKey(Date.now() - 86400000)) return "昨天";
    return S.fmt.dayStamp(ts);
  }

  /* 命中词前后各留一段，转义后再高亮，避免把用户输入当标签 */
  function mark(text) {
    var raw = String(text || "");
    var q = query.trim();
    var win = 120;
    var start = 0;
    if (q) {
      var idx = raw.toLowerCase().indexOf(q.toLowerCase());
      if (idx > 40) start = idx - 40;
    }
    var piece = raw.slice(start, start + win);
    if (start + win < raw.length) piece += "…";
    if (start > 0) piece = "…" + piece;
    var safe = S.esc(piece);
    if (!q) return safe;
    var re = new RegExp("(" + S.esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(re, '<mark class="ch-hit">$1</mark>');
  }

  function row(m) {
    var label = m.role === "me" ? "我说" : m.role === "ai" ? name() : "系统";
    return (
      '<button class="ch-row' + (m.role === "me" ? " is-me" : "") + '" type="button" data-jump="' + m.id + '">' +
      '<span class="ch-row__side"><b>' + S.esc(label) + "</b><i>" + S.esc(S.fmt.time(m.ts)) + "</i></span>" +
      '<span class="ch-row__text">' + mark(m.text) + "</span>" +
      "</button>"
    );
  }

  function renderResults() {
    var box = S.el("#ch-results", scope);
    if (!box) return;
    var list = matches();
    var count = S.el("#ch-count", scope);
    if (count) {
      count.textContent = query.trim()
        ? "找到 " + list.length + " 条"
        : "共 " + listChat().length + " 条 · 最近的在上面";
    }
    if (!list.length) {
      box.innerHTML = query.trim()
        ? emptyBox("没有匹配的记录", "换个词试试，或者切回「全部」。")
        : emptyBox("还没有聊天记录", "回到对话里说第一句话，这里就会开始积累。");
      return;
    }
    var html = "";
    var last = "";
    list.forEach(function (m) {
      var key = dayKey(m.ts);
      if (key !== last) {
        last = key;
        html += '<p class="ch-day">' + S.esc(dayLabel(m.ts)) + "</p>";
      }
      html += row(m);
    });
    box.innerHTML = html;
  }

  /* ---------- 聊天背景 ---------- */
  var bgHandler = null;

  function bgApi() {
    return global.CalliaChatBg && typeof global.CalliaChatBg.set === "function"
      ? global.CalliaChatBg
      : null;
  }

  /* 分栏标签上的当前背景名，窄屏下会自动隐藏，长一点也没关系 */
  function bgMeta() {
    var bg = bgApi();
    if (!bg) return "暂不可用";
    var key = bg.current();
    if (key === "none") return "无背景";
    if (key === "image") return "本机图片";
    return bg.name();
  }

  /* 预设缩略图与真实背景共用引擎里同一份取值，两边永远一致 */
  function bgTile(key, label, style, isOn) {
    return (
      '<button class="cbg-tile' + (isOn ? " is-on" : "") + '" type="button" ' +
      'data-cbg-set="' + key + '" aria-pressed="' + (isOn ? "true" : "false") + '">' +
      '<span class="cbg-tile__fill"' + (style ? ' style="' + S.esc(style) + '"' : "") + ">" +
      '<i class="cbg-tile__dot" aria-hidden="true"></i></span>' +
      '<span class="cbg-tile__name">' + S.esc(label) + "</span></button>"
    );
  }

  function dimChip(bg, n, label) {
    var isOn = bg.dim() === n;
    return (
      '<button class="ch-chip' + (isOn ? " is-on" : "") + '" type="button" data-cbg-dim="' + n +
      '" aria-pressed="' + (isOn ? "true" : "false") + '">' + S.esc(label) + "</button>"
    );
  }

  function bgPanel() {
    var bg = bgApi();
    if (!bg) return emptyBox("聊天背景暂时不可用", "重启一次页面就能重新换背景。");

    var cur = bg.current();
    var mode = bg.mode();
    var img = bg.image();
    var tiles = bgTile("none", "无背景", "", cur === "none");

    bg.presets.forEach(function (p) {
      tiles += bgTile(
        p.id,
        p.name,
        "background-color:" + bg.base(p.id, mode) + ";background-image:" + bg.css(p.id, mode),
        cur === p.id
      );
    });

    return (
      '<div class="ch-bg">' +
      '<p class="ch-note">背景只铺在消息区，气泡和时间会自己补一层底，长句子照样好读。</p>' +
      '<div class="cbg-grid" role="group" aria-label="内置聊天背景">' + tiles + "</div>" +
      '<div class="cbg-photo">' +
      '<span class="cbg-photo__prev' + (img ? "" : " is-empty") + '" id="cbg-prev" aria-hidden="true"></span>' +
      '<div class="cbg-photo__side">' +
      '<p class="cbg-photo__name">' +
      (img ? (cur === "image" ? "本机图片 · 正在使用" : "本机图片 · 已存本机") : "本机图片") +
      "</p>" +
      '<p class="cbg-photo__meta">' +
      (img ? "已经在这台机器上压好了，换回来不用重新选。" : "从相册挑一张，会自动压小后只存在本机。") +
      "</p>" +
      '<div class="cbg-photo__acts">' +
      '<button class="ch-chip" type="button" data-cbg-pick>' +
      (img ? "换一张图片" : "选择图片") +
      "</button>" +
      '<button class="ch-chip" type="button" data-cbg-clear>去掉背景</button>' +
      "</div></div></div>" +
      '<div class="cbg-veil' + (img ? "" : " is-off") + '">' +
      '<span class="cbg-veil__label">遮罩</span>' +
      '<div class="cbg-veil__chips" role="group" aria-label="图片遮罩浓度">' +
      dimChip(bg, 0, "清晰") + dimChip(bg, 1, "柔和") + dimChip(bg, 2, "沉浸") +
      "</div></div></div>"
    );
  }

  /* 本机图的 dataURL 很长，用属性赋值而不是拼进 innerHTML */
  function paintPreview() {
    if (tab !== "bg" || !scope) return;
    var bg = bgApi();
    var node = S.el("#cbg-prev", scope);
    if (!bg || !node) return;
    var img = bg.image();
    node.classList.toggle("is-empty", !img);
    node.style.backgroundImage = img ? 'url("' + img + '")' : "none";
  }

  /* 选图是异步的，只有引擎上屏后广播才知道什么时候完成 */
  function bindBgEvent() {
    if (bgHandler) return;
    bgHandler = function () {
      if (tab === "bg" && scope) repaint();
    };
    document.addEventListener("callia:chatbg", bgHandler);
  }

  /* ---------- 渲染 ---------- */
  function head() {
    return (
      '<header class="app-head">' +
      '<button class="app-head__back" id="ch-back" type="button" aria-label="返回对话"></button>' +
      '<div class="app-head__title"><p>个人主页</p><p>' +
      S.esc(name() + " · 朋友圈、记录与聊天背景") +
      "</p></div>" +
      '<button class="chip" type="button" data-ch-back>回到对话</button>' +
      "</header>"
    );
  }

  function panel() {
    return (
      '<div class="ch-panel" id="ch-panel" role="tabpanel">' +
      (tab === "moments" ? momentsPanel() : tab === "history" ? historyPanel() : bgPanel()) +
      "</div>"
    );
  }

  function body() {
    return hero() + tabs() + panel();
  }

  /* #ch-body 自己就是滚动容器时用它，否则退回外层应用容器 */
  function scrollHost() {
    if (!scope) return null;
    var parent = scope.parentNode;
    if (parent && parent.scrollHeight > parent.clientHeight + 1) return parent;
    return scope;
  }

  function repaint() {
    if (!scope) return;
    var host = scrollHost();
    var scroll = host ? host.scrollTop : 0;
    scope.innerHTML = body();
    if (tab === "history") renderResults();
    if (tab === "bg") paintPreview();
    var after = scrollHost();
    if (after) after.scrollTop = scroll;
  }

  /* ---------- 事件 ---------- */
  /* 头像弹层在应用外面，换完只会画到桌面和锁屏；
     这里在弹层上还一次账：形象真的变了就重绘主页，没变就不做事。 */
  var awaitingAvatar = false;
  var avatarSeen = "";
  var sheetHandler = null;

  function currentFace() {
    return S.avatar && typeof S.avatar.current === "function" ? S.avatar.current() : "";
  }

  function askAvatar() {
    if (!S.avatar || typeof S.avatar.open !== "function") return false;
    avatarSeen = currentFace();
    awaitingAvatar = true;
    S.avatar.open();
    return true;
  }

  function watchAvatarSheet() {
    if (sheetHandler) return;
    sheetHandler = function () {
      if (!awaitingAvatar) return;
      setTimeout(function () {
        if (!awaitingAvatar) return;
        if (currentFace() !== avatarSeen) {
          avatarSeen = currentFace();
          awaitingAvatar = false;
          if (scope) repaint();
          return;
        }
        if (S.avatar && typeof S.avatar.isOpen === "function" && !S.avatar.isOpen()) {
          awaitingAvatar = false;
        }
      }, 60);
    };
    document.addEventListener("click", sheetHandler, true);
    document.addEventListener("change", sheetHandler, true);
  }

  function bind(root, opts) {
    scope = S.el("#ch-body", root);
    backFn = opts && typeof opts.back === "function" ? opts.back : null;
    jumpFn = opts && typeof opts.jump === "function" ? opts.jump : null;
    if (tab === "history") renderResults();
    bindBgEvent();
    watchAvatarSheet();

    /* 同一个 #app-root 会被反复打开，委托监听只注册一次，避免重复触发 */
    if (boundRoot === root) return;
    unbind();
    boundRoot = root;

    clickHandler = function (ev) {
      var hit = ev.target;
      if (!hit || typeof hit.closest !== "function") return;

      if (hit.closest("#ch-back") || hit.closest("[data-ch-back]")) {
        if (backFn) backFn();
        return;
      }

      var t = hit.closest("[data-ch-tab]");
      if (t) {
        tab = t.getAttribute("data-ch-tab");
        repaint();
        return;
      }

      /* 资料卡头像：随时换成预设形象或本机照片 */
      if (hit.closest("[data-ch-avatar]")) {
        if (!askAvatar()) S.os.toast("头像功能还没准备好");
        return;
      }

      if (hit.closest("[data-post-add]")) {
        publish();
        return;
      }

      var like = hit.closest("[data-like]");
      if (like) {
        var item = S.toggleMoment(like.getAttribute("data-like"));
        if (item) {
          like.classList.toggle("is-on", !!item.liked);
          like.setAttribute("aria-pressed", item.liked ? "true" : "false");
          var num = like.querySelector("span");
          if (num) num.textContent = item.likes;
        }
        return;
      }

      /* 固定回复区：用 getElementById 直接显隐，不写定时器、不碰数据 */
      var fake = hit.closest(".btn-fake-reply");
      if (fake) {
        var fakeBox = document.getElementById(fake.getAttribute("data-fake-reply"));
        if (fakeBox) fakeBox.style.display = fakeBox.style.display === "none" ? "block" : "none";
        return;
      }

      var del = hit.closest("[data-post-del]");
      if (del) {
        if (S.removeMoment(del.getAttribute("data-post-del"))) S.os.toast("这条动态收起来了");
        repaint();
        return;
      }

      var f = hit.closest("[data-who]");
      if (f) {
        who = f.getAttribute("data-who");
        repaint();
        return;
      }

      /* 聊天背景：背后再由引擎广播重绘，选图那条异步路径也能跟上 */
      var bgSet = hit.closest("[data-cbg-set]");
      if (bgSet) {
        if (bgApi()) bgApi().set(bgSet.getAttribute("data-cbg-set"));
        return;
      }

      if (hit.closest("[data-cbg-pick]")) {
        if (bgApi()) bgApi().pick();
        return;
      }

      if (hit.closest("[data-cbg-clear]")) {
        if (bgApi()) bgApi().clear();
        return;
      }

      var dim = hit.closest("[data-cbg-dim]");
      if (dim) {
        if (bgApi()) bgApi().setDim(Number(dim.getAttribute("data-cbg-dim")));
        return;
      }

      var jump = hit.closest("[data-jump]");
      if (jump) {
        if (jumpFn) jumpFn(jump.getAttribute("data-jump"));
      }
    };

    /* 搜索框会被重绘换掉，输入事件走容器委托才不会失效 */
    inputHandler = function (ev) {
      var node = ev.target;
      if (!node || node.id !== "ch-search") return;
      query = String(node.value || "");
      renderResults();
    };

    on(root, "click", clickHandler);
    on(root, "input", inputHandler);
  }

  function unbind() {
    if (!boundRoot) return;
    if (clickHandler) boundRoot.removeEventListener("click", clickHandler);
    if (inputHandler) boundRoot.removeEventListener("input", inputHandler);
    boundRoot = null;
    clickHandler = null;
    inputHandler = null;
  }

  /* ---------- 对外 ---------- */
  function open(root, opts) {
    tab = "moments";
    who = "all";
    query = "";
    bioPick = ""; /* 每次进来重选一句 TA 此刻的签名 */
    root.innerHTML = head() + '<div class="app-body ch" id="ch-body">' + body() + "</div>";
    bind(root, opts);
  }

  function close() {
    unbind();
    awaitingAvatar = false;
    for (var key in timers) {
      if (timers[key]) clearTimeout(timers[key]);
      timers[key] = 0;
    }
    scope = null;
    backFn = null;
    jumpFn = null;
  }

  global.CalliaCharHome = {
    open: open,
    close: close,
    head: head
  };
})(window);