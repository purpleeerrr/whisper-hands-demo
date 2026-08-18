(function () {
  "use strict";

  const embedded = new URLSearchParams(window.location.search).get("embedded") === "1";

  const style = document.createElement("style");
  style.textContent = `
    #whBackToGarden{position:fixed;right:18px;bottom:18px;z-index:10050;border:1px solid rgba(216,240,255,.28);border-radius:999px;background:rgba(5,8,23,.78);color:#eaf7ff;padding:10px 15px;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.08em;cursor:pointer;box-shadow:0 12px 34px rgba(0,0,0,.28);backdrop-filter:blur(10px);transition:transform .2s ease,background .2s ease}
    #whBackToGarden:hover{transform:translateY(-2px);background:rgba(17,25,58,.92)}
    @media(max-width:640px){#whBackToGarden{right:12px;bottom:12px}}
  `;
  document.head.appendChild(style);

  const button = document.createElement("button");
  button.id = "whBackToGarden";
  button.type = "button";
  button.textContent = "← 宇宙花园";
  button.title = "返回完整网站起点";
  button.addEventListener("click", () => {
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ type: "whisper:return-to-garden" }, window.location.origin === "null" ? "*" : window.location.origin);
      return;
    }
    window.location.href = "index.html";
  });
  document.body.appendChild(button);
})();
