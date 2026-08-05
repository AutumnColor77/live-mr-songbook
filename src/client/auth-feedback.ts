export function authErrorNotice(reason: string): string {
  const messages: Record<string, string> = {
    not_configured: "지금은 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    invalid_state: "로그인 세션이 만료되었습니다. 다시 시도해 주세요.",
    missing_code: "로그인 정보가 없습니다. 다시 시도해 주세요.",
    token_exchange: "로그인에 실패했습니다. 다시 시도해 주세요.",
    userinfo: "프로필을 가져오지 못했습니다. 다시 시도해 주세요.",
    access_denied: "로그인이 취소되었거나 접근이 거부되었습니다.",
    redirect_uri_mismatch: "로그인 설정에 문제가 있습니다. 관리자에게 문의해 주세요.",
    server: "서버 오류로 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  };
  return messages[reason] ?? "로그인에 실패했습니다. 다시 시도해 주세요.";
}

export function consumeAuthQuery(): { toast: string; errorNotice: string } {
  const params = new URLSearchParams(location.search);
  const authStatus = params.get("auth");
  let toast = "";
  let errorNotice = "";
  if (authStatus === "ok") {
    toast = "로그인되었습니다.";
  } else if (authStatus === "error") {
    errorNotice = authErrorNotice(params.get("reason") ?? "unknown");
  }
  if (authStatus) {
    history.replaceState({}, "", location.pathname);
  }
  return { toast, errorNotice };
}

/** Safe relative path from `?next=` (or a fallback). */
export function safeNextPath(fallback = ""): string {
  const raw = new URLSearchParams(location.search).get("next") || fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return fallback;
  }
  return raw;
}
