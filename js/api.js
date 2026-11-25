/* ==================================================================
   Callia OS · api.js
   伴侣与 AI 接口的唯一通道。
   配置来源：设置页保存在 localStorage 的 api_url / api_key / api_model。
   规则：三项未填好之前，伴侣只能听不能说话；
        填好之后，所有伴侣台词都由模型生成，风格取决于模型自身。
   ================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;

  var KEYS = { url: "api_url", key: "api_key", model: "api_model" };
  var DEFAULTS = {
    api_url: "https://api.openai.com/v1/chat/completions",
    api_key: "",
    api_model: "gpt-4o-mini"
  };
  var TIMEOUT = 30000;
  var MODELS_TIMEOUT = 15000;
  var API_SUFFIX = "/chat/completions";
  var inflight = null;
  var modelsCtrl = null;

  /* ---------- 配置读取（与设置页共用同三个键） ---------- */
  function read(storageKey) {
    var fallback = Object.prototype.hasOwnProperty.call(DEFAULTS, storageKey) ? DEFAULTS[storageKey] : "";
    try {
      var raw = global.localStorage.getItem(storageKey);
      if (raw === null || raw === undefined) {
        global.localStorage.setItem(storageKey, fallback);
        return fallback;
      }
      return String(raw).trim();
    } catch (err) {
      return fallback;
    }
  }

  function write(storageKey, value) {
    try {
      global.localStorage.setItem(
        storageKey,
        String(value === null || value === undefined ? "" : value).trim()
      );
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ---------- 地址合成：用户只填基础段，协议与末尾路径自动补全 ---------- */
  function composeUrl(input) {
    var base = String(input === null || input === undefined ? "" : input).replace(/\s+/g, "");
    if (!base) return "";
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;
    base = base.replace(/\/+$/, "");
    if (base.slice(-API_SUFFIX.length).toLowerCase() === API_SUFFIX) return base;
    return base + API_SUFFIX;
  }

  /* 完整地址 → 输入框里显示的基础段（去掉协议与自动补全的后缀） */
  function displayBase(url) {
    var full = String(url || "").trim();
    if (!full) return "";
    if (full.slice(-API_SUFFIX.length).toLowerCase() !== API_SUFFIX) return full;
    var base = full.slice(0, full.length - API_SUFFIX.length);
    if (/^http:\/\//i.test(base)) return base;
    return base.replace(/^https:\/\//i, "");
  }

  function modelsUrl(endpoint) {
    var full = String(endpoint || "").trim().replace(/\/+$/, "");
    if (!full) return "";
    if (full.slice(-API_SUFFIX.length).toLowerCase() === API_SUFFIX) {
      return full.slice(0, full.length - API_SUFFIX.length) + "/models";
    }
    return full + "/models";
  }

  function mask(key) {
    if (!key) return "未填写";
    return "••••" + key.slice(-4);
  }

  function inspect() {
    var url = read(KEYS.url);
    var key = read(KEYS.key);
    var model = read(KEYS.model);
    var missing = "";

    if (!url) missing = "缺少 API 地址";
    else if (url.indexOf("http://") !== 0 && url.indexOf("https://") !== 0) missing = "API 地址需以 http(s):// 开头";
    else if (!key) missing = "缺少 API 密钥";
    else if (!model) missing = "缺少模型名称";

    return {
      url: url,
      key: key,
      model: model,
      keyMask: mask(key),
      missing: missing,
      ready: !missing
    };
  }

  function ready() {
    return inspect().ready;
  }

  function describe() {
    var info = inspect();
    return info.ready
      ? "接口已就绪 · " + info.model + " · 密钥 " + info.keyMask
      : "未连接接口 · " + info.missing;
  }

  /* ---------- 上下文：只把可对话的内容交给模型 ---------- */
  function history(limit) {
    var list = S.store && Array.isArray(S.store.chat) ? S.store.chat : [];
    var max = limit || 14;
    var out = [];
    for (var i = list.length - 1; i >= 0 && out.length < max; i -= 1) {
      var m = list[i];
      if (!m || !m.text) continue;
      if (m.role === "me") out.unshift({ role: "user", content: String(m.text) });
      else if (m.role === "ai") out.unshift({ role: "assistant", content: String(m.text) });
    }
    return out;
  }

  /* ---------- 人设书进 payload（最高优先级） ----------
     正常路径：companion.js 的 systemPrompt 已经把【最高核心人设设定】放在 system 第一块。
     兜底路径：人格层缺席或抛错时，这里直接从学习层 / persona 层取设定拼进去，
     保证 localStorage 里的人设书一定跟着请求走，不会静默丢失。 */
  var PERSONA_HEAD = "【最高核心人设设定，必须绝对遵守】";
  var PERSONA_TAIL = "【以上是人设设定，请在接下来的对话中严格扮演该角色】";
  var PERSONA_MAX = 20000; /* 兜底注入与主注入保持同一上限，预算拉到 20000 时不提前截断 */

  function personaDigest(ask) {
    var body = String(ask === null || ask === undefined ? "" : ask);
    if (S.learn && typeof S.learn.digest === "function") {
      try {
        return String(S.learn.digest(body) || "");
      } catch (err) {
        /* 学习层出错就退回全量注入 */
      }
    }
    if (S.persona && typeof S.persona.digest === "function") {
      try {
        return String(S.persona.digest(body) || "");
      } catch (err) {
        /* 没读到设定就空着，不抛错 */
      }
    }
    return "";
  }

  function personaBlock(ask) {
    var body = String(personaDigest(ask) || "").replace(/^\s+|\s+$/g, "");
    if (!body) return "";
    if (body.length > PERSONA_MAX) body = body.slice(0, PERSONA_MAX);
    return (
      PERSONA_HEAD +
      "\n" +
      body +
      "\n" +
      PERSONA_TAIL +
      "\n以上设定优先级最高：你就是设定里的这个人，禁止回答「我是虚拟伴侣」「我是AI助手」这类通用身份。"
    );
  }

  /* 隐藏情绪标签指令：不管人设层给的是什么，出网的系统提示词都以这句话结尾。
     模型回的那一段标签会在接口出口被 readEmotion 摘掉，不会进气泡。 */
  var EMOTION_TAIL =
    "\n\n请在每次回复的结尾，根据你当前的情绪，添加一个隐藏的情绪标签，" +
    "格式必须严格为 [emotion: happy]、[emotion: sad]、[emotion: love] 或 [emotion: normal]。" +
    "标签必须放在正文的最后。";

  /* 入参 ask 是本轮要发的用户原话，世界书按它召回 */
  function systemText(ask) {
    if (S.companion && typeof S.companion.systemPrompt === "function") {
      try {
        var text = String(S.companion.systemPrompt(ask) || "");
        if (text.replace(/\s+/g, "")) return text + EMOTION_TAIL;
      } catch (err) {
        /* 人格层出错也不能不带设定发请求 */
      }
    }
    var block = personaBlock(ask);
    return ((block ? block + "\n\n" : "") + "你是一个虚拟伴侣，请用你自己的语气回复。") + EMOTION_TAIL;
  }

  function trimByLength(messages) {
    var budget = 3600;
    var head = messages[0];
    var tail = messages.slice(1);
    var keep = [];
    for (var i = tail.length - 1; i >= 0; i -= 1) {
      var len = tail[i].content.length;
      if (budget - len < 0) break;
      budget -= len;
      keep.unshift(tail[i]);
    }
    return [head].concat(keep);
  }

  /* 世界书按哪句话召回：本轮要发的原话优先，其次取历史里最后一句用户原话。
     以前只读 store.chat，这句话还没入库时会拿上一句去匹配关键词。 */
  function recallText(ask, tail) {
    if (String(ask || "").trim()) return String(ask);
    for (var i = tail.length - 1; i >= 0; i -= 1) {
      if (tail[i] && tail[i].role === "user") return String(tail[i].content || "");
    }
    return "";
  }

  function buildMessages(ask) {
    var tail = ask ? [{ role: "user", content: ask }] : history(14);
    var messages = [{ role: "system", content: systemText(recallText(ask, tail)) }].concat(tail);
    return trimByLength(messages);
  }

  /* ---------- 响应解析与错误映射 ---------- */
  function clean(text) {
    return String(text === null || text === undefined ? "" : text)
      .split("\r")
      .join("")
      .replace(/^[\s"'“”]+/, "")
      .replace(/[\s"'“”]+$/, "")
      .slice(0, 1200);
  }

  /* ---------- 隐藏情绪标签：提取 + 剥离 ----------
     提示词要求模型在正文最后带一个 [emotion: xx]，这里在接口出口就把它摘走：
     · 正文里一律删掉标签，聊天气泡只显示文字；
     · 情绪词写进全局 COS.emotion，并随结果返回 emotion 字段，供气泡 data-emotion 使用。 */
  var EMOTION_RE = /\[\s*emotion\s*:\s*([A-Za-z][A-Za-z0-9_-]{0,15})\s*\]/gi;
  var lastEmotion = "";

  function readEmotion(text) {
    var body = String(text === null || text === undefined ? "" : text);
    var found = "";
    var rest = body.replace(EMOTION_RE, function (all, word) {
      if (!found) found = String(word || "").toLowerCase();
      return "";
    });
    if (found) {
      lastEmotion = found;
      S.emotion = found;
    }
    return {
      /* 只剪掉标签留下的头尾空白，正文内部的换行一律保留，
         不然多行回复和双语分隔行会被压成一行 */
      text: rest.replace(/^\s+/, "").replace(/\s+$/, ""),
      emotion: found
    };
  }

  function pickContent(data) {
    if (!data || typeof data !== "object") return "";
    var choice = data.choices && data.choices[0];
    if (!choice) return "";
    var content = choice.message ? choice.message.content : choice.text;
    if (Object.prototype.toString.call(content) === "[object Array]") {
      content = content
        .map(function (part) {
          if (typeof part === "string") return part;
          return part && part.text ? part.text : "";
        })
        .join("\n");
    }
    return clean(content);
  }

  function errDetail(raw) {
    var text = String(raw || "");
    try {
      var data = JSON.parse(text);
      var fromError = data.error && (data.error.message || data.error.msg);
      var detail = fromError || data.message || data.error || "";
      if (typeof detail !== "string") detail = JSON.stringify(detail);
      return clean(detail).slice(0, 90);
    } catch (err) {
      return clean(text).slice(0, 90);
    }
  }

  var HTTP_TEXT = {
    400: "请求被拒绝，模型名称或地址可能不匹配",
    401: "密钥无效或已过期",
    403: "没有访问该模型的权限",
    404: "接口地址或模型不存在",
    408: "接口响应超时",
    413: "上下文太长，清空对话后再试",
    422: "请求参数不被接口接受",
    429: "请求过于频繁或额度不足",
    500: "接口服务异常",
    502: "网关连不上模型服务",
    503: "模型服务暂时不可用",
    504: "模型服务响应超时"
  };

  function httpMessage(status, raw) {
    var base = HTTP_TEXT[status] || "接口返回 " + status;
    var detail = errDetail(raw);
    return base + (detail ? "（" + detail + "）" : "");
  }

  /* ---------- 请求 ---------- */
  function fail(code, message) {
    return { ok: false, code: code, message: message, text: "" };
  }

  /* ---------- 发送前调试：确认人设书到底有没有被携带 ----------
     控制台打一份拼好的完整 Prompt；同时留一份 lastPrompt，
     需要时在控制台用 COS.api.lastPrompt() 取回最后一次请求的完整内容。 */
  var lastPrompt = null;

  function debugPrompt(messages, info) {
    var first = messages.length && messages[0] ? messages[0] : null;
    var system = first && first.role === "system" ? String(first.content || "") : "";
    var carried = system.indexOf(PERSONA_HEAD) !== -1;
    var st = null;
    try {
      st = S.persona && typeof S.persona.stats === "function" ? S.persona.stats() : null;
    } catch (err) {
      st = null;
    }

    lastPrompt = {
      ts: Date.now(),
      model: info.model,
      personaCarried: carried,
      systemChars: system.length,
      system: system,
      messages: messages.slice()
    };

    if (!global.console || typeof global.console.log !== "function") return lastPrompt;
    var head =
      "[Callia·Prompt] 人设书" +
      (carried ? "已携带" : "未携带（本机没有可注入的设定）") +
      " · system " + system.length + " 字 · 消息 " + messages.length + " 条 · " + info.model +
      (st
        ? " · 本机人设书 " + (st.hasCard ? "《" + st.cardName + "》" : "无") +
          " · 世界书 " + st.books + " 本 / 生效 " + st.activeEntries + " 条"
        : "");
    try {
      global.console.log(
        head +
          "\n" +
          messages
            .map(function (m, i) {
              return "—— " + i + " · " + m.role + " ——\n" + m.content;
            })
            .join("\n")
      );
    } catch (err) {
      /* 日志打不出不影响请求 */
    }
    return lastPrompt;
  }

  function request(messages) {
    var info = inspect();
    if (!info.ready) return Promise.resolve(fail("unconfigured", "接口未连接：" + info.missing));
    if (typeof global.fetch !== "function") return Promise.resolve(fail("no-fetch", "当前 WebView 不支持网络请求"));

    var ctrl = null;
    try {
      if (global.AbortController) ctrl = new global.AbortController();
    } catch (err) {
      ctrl = null;
    }

    var timer = global.setTimeout(function () {
      if (ctrl) {
        try {
          ctrl.abort();
        } catch (err) {
          /* 中止失败时交给超时分支处理 */
        }
      }
    }, TIMEOUT);

    inflight = ctrl;

    /* 发之前先确认拼好的 Prompt 里真的带上了人设书 */
    debugPrompt(messages, info);

    var options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + info.key
      },
      body: JSON.stringify({ model: info.model, messages: messages, stream: false })
    };
    if (ctrl) options.signal = ctrl.signal;

    return global
      .fetch(info.url, options)
      .then(function (res) {
        return res.text().then(function (raw) {
          return { status: res.status, raw: raw };
        });
      })
      .then(function (pack) {
        global.clearTimeout(timer);
        inflight = null;

        if (pack.status < 200 || pack.status >= 300) {
          return fail("http-" + pack.status, httpMessage(pack.status, pack.raw));
        }

        var data = null;
        try {
          data = JSON.parse(pack.raw);
        } catch (err) {
          return fail("bad-json", "接口返回的不是可解析的 JSON");
        }

        if (data && data.error) {
          var apiErr = data.error.message || data.error.msg || "接口返回错误";
          return fail("api-error", clean(apiErr).slice(0, 90) || "接口返回错误");
        }

        var rawText = pickContent(data);
        if (!rawText) return fail("empty", "模型没有返回内容，换一个模型再试");
        /* 先把隐藏情绪标签摘掉：往下走的正文里一定不含 [emotion: xx] */
        var emo = readEmotion(rawText);
        var text = emo.text;
        if (!text) return fail("empty", "模型没有返回内容，换一个模型再试");
        /* 外语回复按提示词带一行中文译文：在接口出口就拆开，
           分隔行不会漏到气泡以外的提示、桌面短台词等界面上 */
        var pack =
          S && typeof S.splitBilingual === "function" ? S.splitBilingual(text) : { text: text, trans: "" };
        return {
          ok: true,
          code: "ok",
          message: "",
          text: pack.text || text,
          trans: pack.trans || "",
          emotion: emo.emotion
        };
      })
      .catch(function (err) {
        global.clearTimeout(timer);
        inflight = null;
        var name = err && err.name ? err.name : "";
        if (name === "AbortError") return fail("timeout", "接口 30 秒没有回应，检查网络或地址");
        return fail("network", "连不上接口，检查网络、地址或跨域限制");
      });
  }

  /* ---------- 对外能力 ---------- */
  function chat() {
    var messages = buildMessages(null);
    var last = messages[messages.length - 1];
    if (!last || last.role !== "user") return Promise.resolve(fail("empty", "没有可发送的内容"));
    return request(messages);
  }

  function short(ask) {
    return request(buildMessages(ask));
  }

  /* 离线梦境日记专用：人设书 + 最近的聊天记忆 + 一条隐藏指令。
     short() 只发单句不带历史，这里把历史拼回去，模型才真的“记得你们聊过什么”。
     只新增能力，chat / short / speak 的既有行为一律不动。 */
  function dream(ask) {
    if (!ready()) return Promise.resolve(fail("unconfigured", "接口未连接，伴侣不会说话"));
    if (inflight) return Promise.resolve(fail("busy", "上一条还在等接口回应"));
    var body = String(ask === null || ask === undefined ? "" : ask).trim();
    if (!body) return Promise.resolve(fail("empty", "没有可发送的内容"));
    var messages = [{ role: "system", content: systemText(body) }]
      .concat(history(10))
      .concat([{ role: "user", content: body }]);
    return request(trimByLength(messages));
  }

  function test() {
    return short("连通性测试：请只回复四个字——连接成功。");
  }

  /* ---------- 底层通道：直接发一份现成的 messages ----------
     主聊天的 chat / short / dream / speak 最终都走同一个 request()，
     这里把 request() 原样暴露出去，供卡莉娅管家这类独立模块复用：
     地址拼接（composeUrl 已补 /chat/completions）、鉴权头、超时、
     错误映射、情绪标签剥离全部与主聊天完全一致，不另写一套 fetch。
     只新增能力，chat / short / dream / speak 的既有行为一律不动。 */
  function requestRaw(messages) {
    if (!Array.isArray(messages) || !messages.length) {
      return Promise.resolve(fail("empty", "没有可发送的内容"));
    }
    return request(messages);
  }

  /* 伴侣主动开口：只把场景交给接口，台词与风格完全由所选模型决定 */
  function speak(kind) {
    if (!ready()) return Promise.resolve(fail("unconfigured", "接口未连接，伴侣不会说话"));
    if (inflight) return Promise.resolve(fail("busy", "上一条还在等接口回应"));
    if (!S.companion || typeof S.companion.instruct !== "function") {
      return Promise.resolve(fail("no-persona", "伴侣人格层未就绪"));
    }
    return short(S.companion.instruct(kind));
  }

  /* ---------- 模型列表：用同一个密钥拉取 /models ---------- */
  var NON_CHAT = [
    "embed", "whisper", "tts", "dall-e", "dalle", "image", "moderation",
    "transcrib", "translat", "audio", "sora", "video", "search", "rerank",
    "ocr", "realtime", "computer-use", "safety"
  ];

  function isChatModel(id) {
    var name = String(id || "").toLowerCase();
    for (var i = 0; i < NON_CHAT.length; i += 1) {
      if (name.indexOf(NON_CHAT[i]) !== -1) return false;
    }
    return true;
  }

  /* 不同服务商的返回形态：{data:[]} / {models:[]} / 直接数组 / 字符串数组 */
  function parseModels(data) {
    var raw = [];
    if (Array.isArray(data)) raw = data;
    else if (data && Array.isArray(data.data)) raw = data.data;
    else if (data && Array.isArray(data.models)) raw = data.models;
    else if (data && Array.isArray(data.body)) raw = data.body;

    var seen = {};
    var list = [];
    for (var i = 0; i < raw.length; i += 1) {
      var item = raw[i];
      var id = "";
      var owner = "";
      var created = 0;
      if (typeof item === "string") {
        id = item;
      } else if (item && typeof item === "object") {
        id = item.id || item.name || item.model || "";
        owner = item.owned_by || item.owner || item.ownedBy || "";
        created = typeof item.created === "number" ? item.created : 0;
      }
      id = String(id || "").trim();
      if (!id || seen[id]) continue;
      seen[id] = 1;
      list.push({ id: id, owner: String(owner || ""), created: created });
    }

    list.sort(function (a, b) {
      if (b.created !== a.created) return b.created - a.created;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    var chat = list.filter(function (m) {
      return isChatModel(m.id);
    });
    return (chat.length ? chat : list).slice(0, 200);
  }

  function models(overrides) {
    var opts = overrides || {};
    var info = inspect();
    var url = typeof opts.url === "string" ? opts.url : info.url;
    var key = typeof opts.key === "string" ? opts.key : info.key;
    var target = modelsUrl(url);

    if (!target) return Promise.resolve(fail("no-url", "先填写接口地址"));
    if (!key) return Promise.resolve(fail("no-key", "先填写 API 密钥"));
    if (typeof global.fetch !== "function") return Promise.resolve(fail("no-fetch", "当前 WebView 不支持网络请求"));

    var ctrl = null;
    try {
      if (global.AbortController) ctrl = new global.AbortController();
    } catch (err) {
      ctrl = null;
    }

    var timer = global.setTimeout(function () {
      if (ctrl) {
        try {
          ctrl.abort();
        } catch (err) {
          /* 中止失败时交给超时分支处理 */
        }
      }
    }, MODELS_TIMEOUT);

    modelsCtrl = ctrl;

    var options = {
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer " + key }
    };
    if (ctrl) options.signal = ctrl.signal;

    return global
      .fetch(target, options)
      .then(function (res) {
        return res.text().then(function (raw) {
          return { status: res.status, raw: raw };
        });
      })
      .then(function (pack) {
        global.clearTimeout(timer);
        modelsCtrl = null;

        if (pack.status < 200 || pack.status >= 300) {
          return fail("http-" + pack.status, "模型列表：" + httpMessage(pack.status, pack.raw));
        }

        var data = null;
        try {
          data = JSON.parse(pack.raw);
        } catch (err) {
          return fail("bad-json", "模型列表不是可解析的 JSON");
        }

        var list = parseModels(data);
        if (!list.length) return fail("empty", "这个接口没有返回可用模型");
        return { ok: true, code: "ok", message: "", models: list, endpoint: target };
      })
      .catch(function (err) {
        global.clearTimeout(timer);
        modelsCtrl = null;
        var name = err && err.name ? err.name : "";
        if (name === "AbortError") return fail("timeout", "拉取模型超时，检查网络或地址");
        return fail("network", "连不上模型列表，检查密钥、地址或跳域限制");
      });
  }

  function abortModels() {
    if (!modelsCtrl) return;
    try {
      modelsCtrl.abort();
    } catch (err) {
      /* 已结束的连接忽略 */
    }
    modelsCtrl = null;
  }

  function busy() {
    return !!inflight;
  }

  function abort() {
    if (!inflight) return;
    try {
      inflight.abort();
    } catch (err) {
      /* 已结束的连接忽略 */
    }
    inflight = null;
  }

  global.COS.api = {
    KEYS: KEYS,
    DEFAULTS: DEFAULTS,
    read: read,
    write: write,
    API_SUFFIX: API_SUFFIX,
    composeUrl: composeUrl,
    displayBase: displayBase,
    modelsUrl: modelsUrl,
    models: models,
    abortModels: abortModels,
    inspect: inspect,
    ready: ready,
    busy: busy,
    describe: describe,
    chat: chat,
    short: short,
    requestRaw: requestRaw,
    dream: dream,
    speak: speak,
    test: test,
    abort: abort,
    emotion: function () {
      return lastEmotion;
    },
    lastPrompt: function () {
      return lastPrompt;
    }
  };
})(window);