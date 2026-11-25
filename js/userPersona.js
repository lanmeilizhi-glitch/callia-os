/* ===================================================================
   Callia OS · userPersona.js
   「我的档案 (User Persona)」：设置页只有一行入口，表单在 index.html 末尾的底部弹窗里。
   · 开关弹窗只改 display 与 transform，没有 hash / location.href 跳转，没有 MutationObserver
   · 三个字段各存一个 localStorage 键，纯本机保存，不发送任何网络请求
   · 弹窗是 index.html 里的常驻节点，不会被设置页重绘销毁；打开前先 fill() 回显，
     页面加载时也 fill() 一次，所以任何时候打开都能看到存量值
   · 与聊天接口、聊天页面完全无关：不调用 S.api，不读写 S.store，
     也不修改 apps2.js 里任何发送请求的逻辑
   =================================================================== */
(function (global) {
  "use strict";

  /* 需求指定的三个存储键名，逐字一致，不另起别名 */
  var KEYS = {
    nickname: "up_nickname",
    traits: "up_traits",
    relationship: "up_relationship"
  };

  /* id 对应设置页里写死的三个输入框：昵称是 input，另两个是 textarea */
  var FIELDS = [
    { key: KEYS.nickname, id: "up-nickname" },
    { key: KEYS.traits, id: "up-traits" },
    { key: KEYS.relationship, id: "up-relationship" }
  ];

  /* 表单与保存按钮都在 index.html 末尾的 #persona-sheet 里，id 逐字一致 */
  var SAVE_BTN = "save-persona-btn";
  var MODAL = "persona-modal";
  var SHEET = "persona-sheet";
  /* 与弹窗内联的 transition: transform 0.3s ease 对齐，动画跑完再收起遮罩 */
  var SLIDE_MS = 300;

  function el(id) {
    return document.getElementById(id);
  }

  function read(key) {
    try {
      return global.localStorage.getItem(key) || "";
    } catch (err) {
      return "";
    }
  }

  function write(key, value) {
    try {
      global.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      /* 隐私模式或存储写满时不抛异常，由提示语给出可见反馈 */
      return false;
    }
  }

  /* 提示：宿主有 toast 就用它，没有就退回原生 alert，保证保存一定有可见反馈 */
  function notify(msg) {
    var os = global.S && global.S.os;
    if (os && typeof os.toast === "function") {
      os.toast(msg);
    } else if (typeof global.alert === "function") {
      global.alert(msg);
    }
  }

  /* 回显：把本机存的值填回弹窗里的三个输入框，元素不在就什么都不做，绝不报错 */
  function fill() {
    FIELDS.forEach(function (f) {
      var box = el(f.id);
      if (box) box.value = read(f.key);
    });
  }

  /* 保存：点一次写三个键，成功与失败都给出可见反馈 */
  function save() {
    var ok = true;
    FIELDS.forEach(function (f) {
      var box = el(f.id);
      if (!box) return;
      if (!write(f.key, String(box.value || ""))) ok = false;
    });
    notify(ok ? "档案已保存！" : "保存失败 · 本机存储不可用");
    /* 存成功就顺手把弹窗滑下去；存失败时留着抽屉，不让用户白输 */
    if (ok) closeModal();
  }

  /* 打开弹窗：先回显，再把遮罩 display:flex，下一帧把抽屉滑上来。
     全程只改 display 与 transform，没有任何页面跳转 */
  function openModal() {
    var mask = el(MODAL);
    var sheet = el(SHEET);
    if (!mask || !sheet) return;
    fill();
    mask.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  /* 关闭弹窗：抽屉先滑回屏幕下方，动画结束再把遮罩收掉 */
  function closeModal() {
    var mask = el(MODAL);
    var sheet = el(SHEET);
    if (!mask || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      mask.style.display = "none";
    }, SLIDE_MS);
  }

  /* 弹窗是常驻节点，但事件统一绑在 document 上按 id 判断：
     既不用重复绑定，也不需要任何 DOM 监听器 */
  function bind() {
    document.addEventListener("click", function (e) {
      var node = e.target;
      if (node && typeof node.closest === "function" && node.closest("#" + SAVE_BTN)) {
        save();
      }
    });
    /* 点黑色遮罩关闭：只有点在最外层 #persona-modal 自己身上才关，
       点抽屉内部（包括输入框与保存按钮）不会误关 */
    document.addEventListener("click", function (e) {
      if (e.target && e.target.id === MODAL) closeModal();
    });
  }

  /* 页面加载时先读取一次：弹窗是 index.html 里的常驻节点，这时已经能拿到元素。
     真正打开前 openModal() 还会再 fill() 一遍，保证看到的是最新存量值。 */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fill);
  } else {
    fill();
  }

  bind();

  /* 设置页入口用的是内联 onclick="openPersonaModal()"，
     所以开关函数必须挂到 window 上，否则点击会报未定义 */
  global.openPersonaModal = openModal;
  global.closePersonaModal = closeModal;

  global.UserPersona = {
    read: read,
    fill: fill,
    open: openModal,
    close: closeModal,
    keys: KEYS
  };
})(window);