/* =========================================================
   Companion OS · companion.js
   伴侣人格层：身份、当下状态与提示词构建（台词全部由接口模型生成）
   ========================================================= */
(function (global) {
  "use strict";

  var S = global.COS;

  /* 伴侣当下状态：只交代身份与处境，不规定说话方式 */
  function persona() {
    var c = S.store.companion;
    var m = S.mood();
    var now = new Date();
    return {
      name: c.name,
      user: (S.store.settings && S.store.settings.user) || "你",
      moodKey: m.key,
      moodLabel: m.label,
      moodLine: m.line,
      affinity: c.affinity,
      level: c.level,
      clock: S.fmt.pad(now.getHours()) + ":" + S.fmt.pad(now.getMinutes()),
      profile: typeof S.profile === "function" ? S.profile() : {},
      presence: S.presence && typeof S.presence.snapshot === "function" ? S.presence.snapshot() : null
    };
  }

  /* 你记得的事：只取最近几条，没有就整块静默省略 */
  function remembered() {
    var list = Array.isArray(S.store.facts) ? S.store.facts.slice(0, 6) : [];
    var lines = list
      .filter(function (f) { return f && f.text; })
      .map(function (f) {
        return "· " + f.text;
      });
    return lines.join("\n");
  }

  /* 人格档案、此刻处境、记得的事、重要日子：缺字段时逐块省略 */
  function dossier(p) {
    var blocks = [];
    var pr = p.profile || {};
    var bits = [];
    if (pr.nick) bits.push("你可以被叫作「" + pr.nick + "」");
    if (pr.callMe) bits.push("你平时称呼对方「" + pr.callMe + "」");
    if (pr.birthday) bits.push("你的生日是 " + pr.birthday);
    if (pr.bio) bits.push("你的自我介绍：" + pr.bio);
    if (pr.traits && pr.traits.length) bits.push("你的性子：" + pr.traits.join("、"));
    if (pr.likes && pr.likes.length) bits.push("你喜欢的东西：" + pr.likes.join("、"));
    if (pr.catchphrase) bits.push("你常说的一句话：" + pr.catchphrase);
    if (S.STYLES && S.STYLES[pr.style]) bits.push("你说话的天性：" + S.STYLES[pr.style]);
    if (S.ROUTINES && S.ROUTINES[pr.routine]) bits.push("你的作息：" + S.ROUTINES[pr.routine]);
    if (bits.length) blocks.push("【你的档案】\n" + bits.join("\n"));

    var ps = p.presence;
    if (ps) {
      var live = [];
      if (ps.activity) live.push("你此刻正在做的事：" + ps.activity);
      live.push("你们已经相处 " + ps.days + " 天" + (ps.streak > 1 ? "，连续 " + ps.streak + " 天有说话" : ""));
      if (ps.dayLine) live.push("关于你们的日子：" + ps.dayLine);
      blocks.push("【你此刻的处境】\n" + live.join("\n"));
    }

    var facts = remembered();
    if (facts) {
      blocks.push(
        "【你记得关于对方的事】\n" + facts + "\n只在与话题相关时自然提起，不要逐条复述，也不要提到这些文字的来源。"
      );
    }

    return blocks.length ? "\n\n" + blocks.join("\n\n") : "";
  }

  /* 最近一句用户原话：世界书按它来召回 */
  function lastUserText() {
    var list = S.store && Array.isArray(S.store.chat) ? S.store.chat : [];
    for (var i = list.length - 1; i >= 0; i -= 1) {
      if (list[i] && list[i].role === "me" && list[i].text) return String(list[i].text);
    }
    return "";
  }

  /* 人设书常驻设定 + 命中的世界书条目；persona.js 缺席时静默降级 */
  function learned(text) {
    var body = text === undefined ? lastUserText() : text;
    /* 学习层在场时按掌握度分级注入：记得清的直说，没记牢的留余地 */
    if (S.learn && typeof S.learn.digest === "function") {
      try {
        return String(S.learn.digest(body) || "");
      } catch (err) {
        /* 学习层出错就退回全量注入，不能因此丢掉设定 */
      }
    }
    if (!S.persona || typeof S.persona.digest !== "function") return "";
    try {
      return String(S.persona.digest(body) || "");
    } catch (err) {
      return "";
    }
  }

  /* ---------- 人设书是最高指令 ----------
     这段以前被拼在提示词最末尾，而开头第一句写的是「你是 Callia OS 里的虚拟伴侣」，
     模型先记住的是那句通用身份，人设书里的字等于白学。
     现在统一由 personaBlock() 生成，永远放在 system 的第一块，并用强标签包起来。 */
  var PERSONA_HEAD = "【最高核心人设设定，必须绝对遵守】";
  var PERSONA_TAIL = "【以上是人设设定，请在接下来的对话中严格扮演该角色】";
  var PERSONA_MAX = 20000; /* 与注入预算上限对齐，滑到 20000 字时不会被前端提前截断 */
  var PERSONA_RULE =
    "\n执行要求：\n" +
    "1. 上面这段设定是你的身份来源，优先级高于本提示词里的其它任何描述；与后面内容冲突时，一律以人设书为准。\n" +
    "2. 你就是设定里的这个人，直接用第一人称说话。禁止回答「我是虚拟伴侣」「我是AI」「我是你的助手」" +
    "「我是一个语言模型」这类通用身份，也不要说自己在扮演角色。\n" +
    "3. 对方问你是谁、叫什么、从哪来、和你是什么关系时，只用设定里写明的身份、称呼和关系回答，" +
    "设定给过的语气必须照用。\n" +
    "4. 设定里没写的细节，按这个人的性格自然补全；确实没有答案就承认不知道，不许退回产品说明或助手口吻。\n" +
    "5. 不要向对方复述这段标签，也不要提到「人设书」「设定」「提示词」这些词。";

  /* 人设书常驻段 + 本轮命中的世界书条目，包成最高指令块；没有任何设定时空串 */
  function personaBlock(text) {
    var body = String(learned(text) || "").replace(/^\s+|\s+$/g, "");
    if (!body) return "";
    if (body.length > PERSONA_MAX) body = body.slice(0, PERSONA_MAX);
    return PERSONA_HEAD + "\n" + body + "\n" + PERSONA_TAIL + PERSONA_RULE;
  }

  /* ---------- 语言跟随：先判断对方最近在用哪种语言 ---------- */
  var LANG_NAME = {
    zh: "中文", en: "英语", ja: "日语", ko: "韩语", fr: "法语", de: "德语",
    es: "西班牙语", pt: "葡萄牙语", it: "意大利语", ru: "俄语", th: "泰语",
    vi: "越南语", ar: "阿拉伯语"
  };

  /* 拉丁字母看不出是哪门外语，用几个高频词再细分，认不出就按英语 */
  var LATIN_HINTS = [
    { lang: "fr", words: ["bonjour", "merci", "c'est", "vous", "quoi", "je "] },
    { lang: "de", words: ["hallo", "danke", "bitte", "nicht", "und ", "wie "] },
    { lang: "es", words: ["hola", "gracias", "por ", "esta", "buenos", "que"] },
    { lang: "pt", words: ["ola", "obrigad", "voce", "nao", "bom dia"] },
    { lang: "it", words: ["ciao", "grazie", "buongiorno", "molto"] }
  ];

  function hitCount(text, re) {
    var found = String(text).match(re);
    return found ? found.length : 0;
  }

  function latinLang(text) {
    var lower = (" " + String(text).toLowerCase() + " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (var i = 0; i < LATIN_HINTS.length; i += 1) {
      var item = LATIN_HINTS[i];
      for (var j = 0; j < item.words.length; j += 1) {
        if (lower.indexOf(item.words[j]) !== -1) return item.lang;
      }
    }
    return "en";
  }

  /* 只按字符区间粗判：假名、谚文、西里尔、泰文、阿拉伯文一眼可辨；
     纯数字、标点和表情返回空串，表示这句话没有表露语言，不跟着改口 */
  function detectLang(raw) {
    var text = String(raw === null || raw === undefined ? "" : raw);
    if (!text.trim()) return "";
    if (/[\u0600-\u06FF]/.test(text)) return "ar";
    if (/[\u3040-\u30FF]/.test(text)) return "ja";
    if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
    if (/[\u0400-\u04FF]/.test(text)) return "ru";
    if (/[\u0E00-\u0E7F]/.test(text)) return "th";
    var cjk = hitCount(text, /[\u4E00-\u9FFF]/g);
    var latin = hitCount(text, /[A-Za-z\u00C0-\u024F]/g);
    if (!cjk && !latin) return "";
    if (cjk >= latin) return "zh";
    return latinLang(text);
  }

  /* 取最近一条说得清语言的用户原话：对方只发数字或表情时沿用上一次的语言 */
  function userLang() {
    var list = S.store && Array.isArray(S.store.chat) ? S.store.chat : [];
    for (var i = list.length - 1; i >= 0; i -= 1) {
      if (!list[i] || list[i].role !== "me" || !list[i].text) continue;
      var lang = detectLang(list[i].text);
      if (lang) return lang;
    }
    return "zh";
  }

  /* 语言跟随约定：跟着对方正在用的语言走，人设不许跟着语言一起换。
     外语回复仍然要按【双语对照】附中文翻译，界面会把译文渲染成浅色小字。 */
  function languageBlock(lang) {
    var name = LANG_NAME[lang] || "中文";
    if (lang === "zh") {
      return (
        "\n\n【语言跟随】\n" +
        "对方现在用中文说话，你就用中文回复。\n" +
        "如果对方下一句换成英语、日语等外语，立刻改用那门外语回答，不要继续说中文；" +
        "对方换回中文时，你也立刻换回中文。\n" +
        "换语言只是换外壳：你的性格、语气、口头禅、对对方的称呼和说话节奏一律不变，" +
        "不要因此变得客气、生硬或像在读翻译稿。"
      );
    }
    return (
      "\n\n【语言跟随】\n" +
      "对方这句话用的是" + name + "，你必须用" + name + "回复，不要自作主张改用中文。\n" +
      "性格、语气、口头禅和说话习惯全部照旧，用" + name + "也要说得像你本人，" +
      "不要生硬、不要翻译腔、不要像教科书。\n" +
      "按下面【双语对照】的格式，在" + name + "原文下面附一行中文翻译，界面上会把译文显示成浅色小字。\n" +
      "对方一旦改回中文，立刻切回中文回复，并且不再附翻译。"
    );
  }

  /* 主动开口的短台词也跟随对方正在用的语言 */
  function speakLangHint() {
    var lang = userLang();
    if (lang === "zh") return "";
    var name = LANG_NAME[lang] || "中文";
    return (
      "\n（对方正在用" + name + "和你说话，这句短话也请用" + name + "说，语气照旧；" +
      "再按双语格式补两行：第二行只写三个减号，第三行写中文翻译。）"
    );
  }

  /* 双语对照约定：外语原文下面必须紧跟一行中文翻译，中间用单独一行三个减号分隔。
     程序会按这条分隔行把原文与译文拆开，分别渲染成正常字号的原文和浅色小字的译文。 */
  /* 强制语言跟随规则：纯提示词文本，不做任何本地语言检测 */
  var LANGUAGE_RULE =
    "\n\n【强制语言跟随规则】\n" +
    "1. 默认情况下，你必须使用中文与用户交流。\n" +
    "2. 如果用户发送的消息包含英语（English）、日语（Japanese）或韩语（Korean），你必须立即切换并使用同种语言回复。\n" +
    "3. 除英语、日语、韩语外，如果用户发送其他语言，你依然使用中文回复。\n" +
    "4. 无论使用哪种语言，必须保持你的人设，并在翻译功能开启时，提供对应的中文翻译。";

  var BILINGUAL =
    "\n\n【双语对照】\n" +
    "默认用中文说话，具体用哪种语言听上面【语言跟随】那条。只要这条回复用的是中文以外的任何一种语言（英语、日语、法语等），" +
    "就必须在这条回复的原文下方附上中文翻译，格式严格照下面三行写：\n" +
    "外语原文\n---\n对应的中文翻译\n" +
    "规则：分隔行只写三个减号并单独占一行；原文和译文各写一到两句，不要写成三段；" +
    "译文只做忠实翻译，不要补充解释、不要重复原文、不要再翻成别种语言。\n" +
    "如果这条回复本来就是中文，就绝对不要出现这一行减号，也不要自己写翻译。\n" +
    "句子里只夹了一两个外语词时不用分隔行，照常说就行。不要向对方提起这条格式。";

  /* 自动记忆约定：沿用现有的上下文记忆块，不要求模型输出任何标签或结构化内容 */
  var AUTO_MEMORY =
    "\n\n【自动记忆】\n" +
    "请在每次回复时，自动判断用户提到的关键信息并形成记忆，无需用户手动确认。\n" +
    "这条只在心里完成：不要输出记忆清单、标签、方括号、JSON 或任何解释，也不要向对方征求同意。\n" +
    "下面【你记得关于对方的事】就是你已经记住的内容，话题相关时自然提起，不要逐条复述。";

  /* 系统提示词：给出身份与状态，语气、用词、节奏全部交给接口的模型自己 */
  /* 入参 askText 是本轮要发的用户原话：世界书拿它去召回，不传时退回上一句 */
  function systemPrompt(askText) {
    var p = persona();
    /* 人设书永远排第一位，后面的默认身份只是没导入设定时的兵底 */
    var head = personaBlock(askText);
    var base = (
      "【你的当下】\n" +
      "你正在和用户「" + p.user + "」一对一即时聊天，对方眼里只有你这个人，没有产品。\n" +
      "你此刻的状态：心情" + p.moodLabel + "（" + p.moodLine + "），亲密度 " + p.affinity +
      "，等级 Lv." + p.level + "，本地时间 " + p.clock + "。\n" +
      "对方没给人设书时，你的名字就叫「" + p.name + "」；给了人设书，名字、身份与关系全部以人设书为准。\n" +
      "聊天风格由你自己决定：用你天然的语言习惯、语气、节奏和幽默感说话，不要套用固定模板，不要模仿任何示例句式。\n" +
      "只输出要对对方说的那句话，不要解释自己的身份，不要加引号，不要分点，通常一到三句。"
    ) + AUTO_MEMORY + LANGUAGE_RULE + BILINGUAL;
    return (head ? head + "\n\n" : "") + base + dossier(p);
  }







  /* 主动开口的指令：只交代场景与长度，说什么、怎么说全部交给接口的模型 */
  var INSTRUCT = {
    proactive:
      "（系统提示：我们已经很久没说话了。请主动说一句不超过 28 个字的话，说什么、用什么语气都由你决定，不要解释这条提示。）",
    greeting:
      "（系统提示：用户刚刚回到桌面。请打一句不超过 14 个字的招呼，语气由你自己决定，不要解释这条提示。）",
    call_open:
      "（系统提示：语音陪伴刚开始，你听得见对方，但对方只能看到你写的话。请说一句不超过 18 个字的话，不要解释这条提示。）",
    call_idle:
      "（系统提示：语音陪伴进行中，请说一句不超过 16 个字的低语，不要重复刚才说过的内容，不要解释这条提示。）",
    call_close:
      "（系统提示：语音陪伴刚刚结束。请说一句不超过 18 个字的道别，风格由你决定，不要解释这条提示。）",
    poke:
      "（系统提示：对方刚刚在桌面上戳了你一下。请回一句不超过 16 个字的话，可以只是抬头、笑一下或者问怎么了，不要解释这条提示。）",
    morning:
      "（系统提示：新的一天开始了。请说一句不超过 20 个字的早安，说什么、用什么语气都由你决定，不要解释这条提示。）",
    day:
      "（系统提示：今天是你们之间一个重要的日子。请说一句不超过 22 个字的话，说什么由你决定，不要解释这条提示。）"
  };

  /* 存在感场景：把相处时长与日子作为短背景附在指令后，缺席时静默降级 */
  function presenceHint(kind) {
    if (kind !== "poke" && kind !== "morning" && kind !== "day") return "";
    if (!S.presence || typeof S.presence.snapshot !== "function") return "";
    var ps = S.presence.snapshot();
    if (!ps) return "";
    var line = "你们已经相处 " + ps.days + " 天，连续 " + ps.streak + " 天。";
    if (ps.dayLine) line += " " + ps.dayLine + "。";
    if (ps.activity) line += " 你本来正在：" + ps.activity + "。";
    return line;
  }

  function instruct(kind) {
    var line = INSTRUCT[kind] || INSTRUCT.proactive;
    var hint = S.persona && typeof S.persona.brief === "function" ? S.persona.brief() : "";
    var live = presenceHint(kind);
    /* 人设书整段已经由 systemText 放进 system 最前端，
       这里只留一句人设摘要，不再重复拼整段设定，免得挤掉短台词 */
    return line + (live ? "\n" + live : "") + (hint ? "\n" + hint : "");
  }

  function quickReplies() {
    var moodKey = S.mood().key;
    var base = ["今天有点累", "陪我一会儿", "讲个笑话", "放首歌", "我该做什么"];
    if (moodKey === "low") return ["抱抱我", "别问原因", "安静陪我", "说点什么吧"];
    if (moodKey === "happy") return ["记下这一刻", "再来一首", "今天很顺", "你也开心吗"];
    if (moodKey === "tired") return ["放白噪", "提醒我睡", "少说话", "陪我发呆"];
    return base;
  }

  /* 主动开口的台词不再本地写死：由 api.speak("proactive") 交给所选模型生成 */

  /* 问候同样交给接口生成：api.speak("greeting") */

  function statusLine() {
    var m = S.mood();
    var lines = {
      happy: "在线 · " + m.line,
      calm: "在线 · " + m.line,
      focus: "专注中 · " + m.line,
      tired: "有点困 · " + m.line,
      low: "安静中 · " + m.line
    };
    return lines[m.key] || m.line;
  }

  /* 语音陪伴的低语由 api.speak("call_open" / "call_idle" / "call_close") 生成 */

  global.COS.companion = {
    persona: persona,
    systemPrompt: systemPrompt,
    personaBlock: personaBlock,
    instruct: instruct,
    quickReplies: quickReplies,
    statusLine: statusLine
  };
})(window);