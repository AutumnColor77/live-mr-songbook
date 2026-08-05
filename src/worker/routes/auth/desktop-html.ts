import { DESKTOP_SCHEME } from "./helpers";

export function desktopDoneHtml(token: string): string {
  const deepLink = `${DESKTOP_SCHEME}://oauth/callback?token=${encodeURIComponent(token)}`;
  const safeLink = deepLink
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Live MR Manager 로그인</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0b0b10; color:#f8fafc;
      display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
    .card { max-width:420px; padding:28px; border-radius:16px; background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.1); text-align:center; }
    a { color:#93c5fd; }
    button { margin-top:16px; padding:10px 16px; border-radius:10px; border:0;
      background:#334155; color:#f8fafc; font:inherit; cursor:pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="font-size:1.1rem;margin:0 0 8px">앱으로 돌아가는 중…</h1>
    <p style="color:#94a3b8;font-size:.9rem;line-height:1.5;margin:0 0 16px">
      브라우저에서 “Live MR Manager 열기”를 허용해 주세요.<br />
      앱이 열리면 이 창을 닫아도 됩니다.
    </p>
    <p style="font-size:.85rem;margin:0">
      <a id="deep" href="${safeLink}">앱이 안 열리면 여기를 클릭</a>
    </p>
    <button type="button" id="close-btn">창 닫기</button>
  </div>
  <script>
    (function () {
      var link = ${JSON.stringify(deepLink)};
      // Trigger custom-protocol handoff once — retries open duplicate OS prompts.
      try { window.location.replace(link); } catch (e) {
        try { window.location.href = link; } catch (e2) {}
      }
      var btn = document.getElementById("close-btn");
      if (btn) btn.addEventListener("click", function () {
        try { window.close(); } catch (e) {}
      });
    })();
  </script>
</body>
</html>`;
}
