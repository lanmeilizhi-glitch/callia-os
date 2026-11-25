/* ================================================================
   Callia OS · musicWidget.js
   正在播放小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写曲目与播放状态，不碰饮水、步数、睡眠、花销等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_music";

  var MODAL = "music-modal";
  var SHEET = "music-sheet";
  var LIST = "music-edit-list";
  var PLAY = "music-play-toggle";

  var TITLE = "music-title";
  var ARTIST = "music-artist";
  var DOT = "music-dot";

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

  function tracks() {
    var S = global.COS;
    return S && Array.isArray(S.TRACKS) && S.TRACKS.length
      ? S.TRACKS
      : [{ title: "灰度呼吸", artist: "LUMEN · Ambient", dur: 214 }];
  }

  function store() {
    var S = global.COS;
    return S && S.store ? S.store : null;
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
      return data && typeof data === "object" ? data : null;
    } catch (err) {
      return null;
    }
  }

  function writeStored(data) {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (err) {
      /* 隐私模式下写不进去时，卡片上的曲目仍然会更新 */
    }
  }

  function clampIndex(value) {
    var list = tracks();
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = 0;
    if (n < 0) n = 0;
    if (n > list.length - 1) n = list.length - 1;
    return n;
  }

  function currentMusic() {
    var s = store();
    var src = s && s.music && typeof s.music === "object" ? s.music : null;
    var stored = readStored();
    var pick = src || stored || { index: 0, playing: false };
    return {
      index: clampIndex(pick.index),
      playing: !!pick.playing
    };
  }

  /* 把曲目画到卡片上：标题、艺人、播放状态点 */
  function paintCard(data) {
    var m = data || currentMusic();
    var list = tracks();
    var track = list[m.index] || list[0] || { title: "还没有在放的歌", artist: "轻触去挑一首" };

    var title = byId(TITLE);
    if (title) title.textContent = track.title;

    var artist = byId(ARTIST);
    if (artist) artist.textContent = track.artist || "LUMEN";

    var dot = byId(DOT);
    if (dot) dot.className = "wgt__dot" + (m.playing ? " is-on" : "");

    var btn = byId(PLAY);
    if (btn) {
      btn.textContent = m.playing ? "暂停" : "播放";
      btn.setAttribute("aria-pressed", m.playing ? "true" : "false");
    }

    paintEditor(m);
  }

  /* 弹窗里的曲目清单：点一行就切过去 */
  function paintEditor(data) {
    var box = byId(LIST);
    if (!box) return;
    var m = data || currentMusic();
    box.innerHTML = tracks()
      .map(function (t, i) {
        return (
          '<button class="music-edit__row' +
          (i === m.index ? " is-on" : "") +
          '" type="button" data-music-pick="' +
          i +
          '" aria-pressed="' +
          (i === m.index ? "true" : "false") +
          '"><span class="music-edit__title">' +
          esc(t.title) +
          '</span><span class="music-edit__artist">' +
          esc(t.artist || "LUMEN") +
          "</span></button>"
        );
      })
      .join("");
  }

  /* 同步到生活数据（S.store.music），让音乐应用看到同一个曲目 */
  function syncStore(data) {
    var S = global.COS;
    var s = store();
    if (!S || !s) return;
    var prev = s.music && typeof s.music === "object" ? s.music : {};
    s.music = {
      index: data.index,
      playing: data.playing,
      pos: data.index === prev.index ? Number(prev.pos) || 0 : 0
    };
    if (typeof S.save === "function") S.save();
    if (S.homeWidgets && typeof S.homeWidgets.refresh === "function") S.homeWidgets.refresh();
  }

  /* ---------- 弹窗开关 ---------- */
  function openMusicModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    paintEditor(currentMusic());

    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeMusicModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 切换与保存 ---------- */
  function pickTrack(index) {
    var m = currentMusic();
    var next = { index: clampIndex(index), playing: true };
    writeStored(next);
    syncStore(next);
    paintCard(next);
  }

  function togglePlay() {
    var m = currentMusic();
    var next = { index: m.index, playing: !m.playing };
    writeStored(next);
    syncStore(next);
    paintCard(next);
  }

  function saveMusicData() {
    var m = currentMusic();
    writeStored(m);
    syncStore(m);
    paintCard(m);
    closeMusicModal();

    var S = global.COS;
    var list = tracks();
    var track = list[m.index] || list[0];
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast("已切换曲目 · " + (track ? track.title : "") + (m.playing ? " · 播放中" : " · 已暂停"));
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeMusicModal();
    });
  }

  /* 曲目清单：事件委派，重绘后不用重新绑定 */
  function bindEditor() {
    var box = byId(LIST);
    if (!box) return;
    box.addEventListener("click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      var pick = node.closest("[data-music-pick]");
      if (pick) pickTrack(pick.getAttribute("data-music-pick"));
    });
  }

  function boot() {
    bindMask();
    bindEditor();
    paintCard(currentMusic());
  }

  global.openMusicModal = openMusicModal;
  global.closeMusicModal = closeMusicModal;
  global.pickMusicTrack = pickTrack;
  global.toggleMusicPlay = togglePlay;
  global.saveMusicData = saveMusicData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
