import {
  AdminAuthError,
  clearQueue,
  fetchAdminRequests,
  fetchPublicStatus,
  patchAdminSettings,
  patchRequestStatus,
  reorderQueue,
} from "../admin-api";
import { logout, type AuthUser } from "../auth-api";
import { $, escapeHtml } from "../dom";
import { icons } from "../icons";
import { nowPlayingLabel, setDockArt, createNowPlayingArtCache } from "../now-playing";
import { cycleTheme, logoLinkHtml } from "../theme";
import { createToast } from "../toast";
import type { DuplicatePolicy, SongRequest, StatusResponse } from "../types";
import { mountLogin } from "./login";
import { dupPolicyToast, resolveDuplicatePolicy } from "./policy";
import { startAdminPolling, stopAdminPolling } from "./polling";

export async function mountDashboard(
  root: HTMLElement,
  slug: string,
  user: AuthUser,
  inlineNotice = "",
  toastMsg = "",
): Promise<void> {
  stopAdminPolling();
  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            ${logoLinkHtml()}
            <div class="min-w-0">
              <p id="admin-channel-name" class="text-sm font-extrabold text-main truncate">…</p>
              <p class="text-xs font-medium text-dim">운영</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <a href="/me?next=${encodeURIComponent(`/c/${slug}/admin`)}" class="flex items-center gap-2 min-w-0 rounded-lg px-1.5 py-1 hover:bg-[var(--surface-3)] transition-colors" title="프로필 수정">
              ${
                user.picture
                  ? `<img src="${escapeHtml(user.picture)}" alt="" class="w-8 h-8 rounded-full border border-glass-border object-cover shrink-0" referrerpolicy="no-referrer" />`
                  : `<span class="w-8 h-8 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-xs font-extrabold text-main shrink-0">${escapeHtml((user.name || user.email).slice(0, 1).toUpperCase())}</span>`
              }
              <span class="text-xs text-dim hidden md:inline truncate max-w-[140px]" title="${escapeHtml(user.email)}">${escapeHtml(user.name || user.email)}</span>
            </a>
            <a href="/c/${escapeHtml(slug)}" class="secondary-btn btn-sm hidden sm:inline-flex" target="_blank" rel="noopener">노래책 열기</a>
            <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">${icons.palette(18)}</button>
            <button id="admin-logout" type="button" class="secondary-btn btn-sm">로그아웃</button>
          </div>
        </div>
      </header>

      <main class="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4 pb-10">
        ${
          inlineNotice
            ? `<p class="text-sm font-semibold text-center" style="color:#4ade80">${escapeHtml(inlineNotice)}</p>`
            : ""
        }
        <section class="panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-extrabold text-dim tracking-wide mb-1">신청 접수</p>
            <p id="accepting-label" class="text-sm font-bold text-main">…</p>
          </div>
          <button id="accepting-toggle" type="button" class="primary-btn btn-sm">신청 마감하기</button>
        </section>

        <section class="panel p-5">
          <div class="flex items-center gap-3">
            <span id="admin-now-playing-art" class="dock-art">${icons.disc(22)}</span>
            <div class="min-w-0 flex-1">
              <p class="dock-label">지금 재생</p>
              <p id="admin-now-playing" class="song-name text-sm">재생 중인 곡이 없습니다.</p>
            </div>
          </div>
        </section>

        <section class="panel p-5">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-extrabold text-main">대기열</h2>
              <span id="admin-queue-count" class="count-badge">0</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap justify-end">
              <label id="dup-past-wrap" class="dup-past-switch" title="완료된 곡도 이번 방송에서 다시 신청하지 못하게 합니다">
                <span class="dup-past-switch-label">과거 곡도 차단</span>
                <button
                  id="dup-past-toggle"
                  type="button"
                  class="switch"
                  role="switch"
                  aria-checked="false"
                  aria-label="과거 곡도 차단"
                >
                  <span class="switch-thumb"></span>
                </button>
              </label>
              <button id="dup-toggle" type="button" class="secondary-btn btn-sm">중복 신청 허용</button>
              <button id="queue-clear" type="button" class="secondary-btn btn-sm">대기열 비우기</button>
            </div>
          </div>
          <div id="admin-queue-list" class="space-y-2"></div>
        </section>
      </main>
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  let status: StatusResponse | null = null;
  let requests: SongRequest[] = [];
  let busy = false;
  let nowPlayingArt = "";
  /** Remember past-block preference while policy is allow. */
  let preferPlayed = false;
  const toast = createToast(root);
  const resolveNowPlayingArt = createNowPlayingArtCache(async (songId) => {
    const res = await fetch(
      `/api/c/${encodeURIComponent(slug)}/songs/${encodeURIComponent(songId)}`,
    );
    const data = (await res.json().catch(() => ({}))) as {
      song?: { thumbnail?: string };
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data.song?.thumbnail ?? "";
  });

  if (toastMsg) {
    toast.show(toastMsg);
  }

  function queueActionsHtml(item: SongRequest): string {
    const id = escapeHtml(item.id);
    if (item.status === "playing") {
      return `
        <div class="admin-queue-actions">
          <button type="button" class="admin-act primary-btn btn-sm" data-act="done" data-id="${id}">완료</button>
          <button type="button" class="admin-act secondary-btn btn-sm" data-act="rejected" data-id="${id}">거절</button>
        </div>`;
    }
    return `
      <div class="admin-queue-actions">
        <button type="button" class="admin-act primary-btn btn-sm" data-act="playing" data-id="${id}">재생</button>
        <button type="button" class="admin-act secondary-btn btn-sm" data-act="done" data-id="${id}">완료</button>
        <button type="button" class="admin-act secondary-btn btn-sm" data-act="rejected" data-id="${id}">거절</button>
      </div>`;
  }

  function render() {
    const channelName = status?.channel?.name ?? slug;
    $("#admin-channel-name").textContent = channelName;
    document.title = `${channelName} · 운영 · Live MR Songbook`;

    const accepting = Boolean(status?.acceptingRequests);
    $("#accepting-label").textContent = accepting ? "신청 받는 중" : "신청 마감";
    const toggle = $("#accepting-toggle") as HTMLButtonElement;
    toggle.textContent = accepting ? "신청 마감하기" : "신청 다시 열기";
    toggle.classList.toggle("primary-btn", accepting);
    toggle.classList.toggle("secondary-btn", !accepting);

    const dupPolicy = resolveDuplicatePolicy(status);
    if (dupPolicy === "played") preferPlayed = true;
    if (dupPolicy === "queue") preferPlayed = false;

    const blocking = dupPolicy !== "allow";
    const pastOn = dupPolicy === "played";
    const pastWrap = $("#dup-past-wrap");
    const pastToggle = $("#dup-past-toggle") as HTMLButtonElement;
    pastToggle.setAttribute("aria-checked", pastOn ? "true" : "false");
    pastToggle.classList.toggle("is-on", pastOn);
    pastToggle.disabled = !blocking;
    pastWrap.classList.toggle("is-disabled", !blocking);
    pastWrap.title = blocking
      ? "완료된 곡도 이번 방송에서 다시 신청하지 못하게 합니다"
      : "중복 신청을 차단한 뒤에 사용할 수 있습니다";

    const dupToggle = $("#dup-toggle") as HTMLButtonElement;
    dupToggle.textContent = blocking ? "중복 신청 차단" : "중복 신청 허용";
    dupToggle.classList.toggle("primary-btn", blocking);
    dupToggle.classList.toggle("secondary-btn", !blocking);
    dupToggle.title = blocking
      ? "클릭하면 중복 신청을 다시 허용합니다"
      : "클릭하면 대기열 중복을 차단합니다";

    $("#admin-now-playing").textContent = nowPlayingLabel(status);
    setDockArt($("#admin-now-playing-art"), nowPlayingArt, 22);

    const active = requests
      .filter((r) => r.status === "pending" || r.status === "playing")
      .sort((a, b) => {
        const ao = a.sortOrder ?? a.createdAt;
        const bo = b.sortOrder ?? b.createdAt;
        if (ao !== bo) return ao - bo;
        return a.createdAt - b.createdAt;
      });
    $("#admin-queue-count").textContent = String(active.length);
    ($("#queue-clear") as HTMLButtonElement).disabled = false;
    const list = $("#admin-queue-list");

    if (active.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:32px 16px">대기 중인 곡이 없습니다.</div>`;
      return;
    }

    list.innerHTML = active
      .map((item, index) => {
        const playingBadge =
          item.status === "playing"
            ? `<span class="status-badge playing">재생중</span>`
            : "";
        const payBadge =
          typeof item.payAmount === "number" && item.payAmount > 0
            ? `<span class="status-badge">${escapeHtml(item.payAmount.toLocaleString("ko-KR"))}원</span>`
            : "";
        const comment = item.comment
          ? `<p class="text-[11px] font-medium text-dim mt-0.5">${escapeHtml(item.comment)}</p>`
          : "";
        return `
          <div class="queue-row admin-queue-row !items-center" draggable="true" data-id="${escapeHtml(item.id)}">
            <span class="queue-drag-handle" title="드래그하여 순서 변경" aria-hidden="true">⋮⋮</span>
            <span class="queue-index">${index + 1}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="song-name text-sm">${escapeHtml(item.title)}</p>
                ${playingBadge}
                ${payBadge}
              </div>
              <p class="song-artist text-xs">${escapeHtml(item.artist)} · ${escapeHtml(item.nickname)}</p>
              ${comment}
            </div>
            ${queueActionsHtml(item)}
          </div>`;
      })
      .join("");
  }

  async function refresh() {
    try {
      const [s, reqs] = await Promise.all([
        fetchPublicStatus(slug),
        fetchAdminRequests(slug),
      ]);
      status = s;
      requests = reqs;
      nowPlayingArt = await resolveNowPlayingArt(status);
      render();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      console.error(err);
    }
  }

  $("#admin-logout").addEventListener("click", async () => {
    stopAdminPolling();
    await logout();
    mountLogin(root, slug);
  });

  $("#theme-btn").addEventListener("click", () => {
    cycleTheme();
  });

  $("#accepting-toggle").addEventListener("click", async () => {
    if (busy || !status) return;
    busy = true;
    try {
      const next = !status.acceptingRequests;
      await patchAdminSettings(slug, { acceptingRequests: next });
      toast.show(next ? "신청을 열었습니다." : "신청을 마감했습니다.");
      await refresh();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      toast.show(err instanceof Error ? err.message : "설정 변경 실패");
    } finally {
      busy = false;
    }
  });

  $("#dup-toggle").addEventListener("click", async () => {
    if (busy || !status) return;
    busy = true;
    try {
      const current = resolveDuplicatePolicy(status);
      const next: DuplicatePolicy =
        current === "allow" ? (preferPlayed ? "played" : "queue") : "allow";
      await patchAdminSettings(slug, { duplicatePolicy: next });
      toast.show(dupPolicyToast(next));
      await refresh();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      toast.show(err instanceof Error ? err.message : "설정 변경 실패");
    } finally {
      busy = false;
    }
  });

  $("#dup-past-toggle").addEventListener("click", async () => {
    if (busy || !status) return;
    const current = resolveDuplicatePolicy(status);
    if (current === "allow") return;

    busy = true;
    try {
      const next: DuplicatePolicy = current === "played" ? "queue" : "played";
      preferPlayed = next === "played";
      await patchAdminSettings(slug, { duplicatePolicy: next });
      toast.show(dupPolicyToast(next));
      await refresh();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      toast.show(err instanceof Error ? err.message : "설정 변경 실패");
    } finally {
      busy = false;
    }
  });

  $("#queue-clear").addEventListener("click", async () => {
    if (busy) return;
    const count = requests.filter(
      (r) => r.status === "pending" || r.status === "playing",
    ).length;
    const confirmMsg =
      count > 0
        ? `대기열 ${count}곡을 모두 비웁니다.\n부른 곡 중복 기록도 초기화됩니다. 계속할까요?`
        : "부른 곡 중복 기록을 초기화합니다. 계속할까요?";
    if (!window.confirm(confirmMsg)) return;

    busy = true;
    try {
      const cleared = await clearQueue(slug);
      toast.show(
        cleared > 0
          ? `대기열 ${cleared}곡을 비우고 중복 기록을 초기화했습니다.`
          : "부른 곡 중복 기록을 초기화했습니다.",
      );
      await refresh();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      toast.show(err instanceof Error ? err.message : "초기화 실패");
    } finally {
      busy = false;
    }
  });

  const queueList = $("#admin-queue-list");
  let dragId: string | null = null;

  queueList.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".admin-act");
    if (!btn || btn.disabled || busy) return;
    const id = btn.dataset.id ?? "";
    const act = btn.dataset.act as "playing" | "done" | "rejected" | undefined;
    if (!id || !act) return;

    busy = true;
    try {
      await patchRequestStatus(slug, id, act);
      const labels = { playing: "재생 중으로 표시", done: "완료 처리", rejected: "거절 처리" };
      toast.show(labels[act]);
      await refresh();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      toast.show(err instanceof Error ? err.message : "처리 실패");
    } finally {
      busy = false;
    }
  });

  queueList.addEventListener("dragstart", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".admin-queue-row");
    if (!row || busy) {
      e.preventDefault();
      return;
    }
    if ((e.target as HTMLElement).closest("button")) {
      e.preventDefault();
      return;
    }
    dragId = row.dataset.id ?? null;
    row.classList.add("is-dragging");
    e.dataTransfer?.setData("text/plain", dragId ?? "");
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });

  queueList.addEventListener("dragend", () => {
    queueList.querySelectorAll(".admin-queue-row").forEach((el) => {
      el.classList.remove("is-dragging", "drag-over");
    });
    dragId = null;
  });

  queueList.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragId) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>(".admin-queue-row");
    if (!row || row.dataset.id === dragId) return;
    queueList.querySelectorAll(".admin-queue-row.drag-over").forEach((el) => {
      el.classList.remove("drag-over");
    });
    row.classList.add("drag-over");
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  });

  queueList.addEventListener("dragleave", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".admin-queue-row");
    if (row) row.classList.remove("drag-over");
  });

  queueList.addEventListener("drop", async (e) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>(".admin-queue-row");
    queueList.querySelectorAll(".admin-queue-row").forEach((el) => {
      el.classList.remove("drag-over", "is-dragging");
    });
    const fromId = dragId || e.dataTransfer?.getData("text/plain") || "";
    dragId = null;
    if (!fromId || !target || busy) return;
    const toId = target.dataset.id ?? "";
    if (!toId || fromId === toId) return;

    const rows = Array.from(queueList.querySelectorAll<HTMLElement>(".admin-queue-row"));
    const fromEl = rows.find((r) => r.dataset.id === fromId);
    if (!fromEl) return;

    const fromIndex = rows.indexOf(fromEl);
    const toIndex = rows.indexOf(target);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    if (fromIndex < toIndex) {
      target.insertAdjacentElement("afterend", fromEl);
    } else {
      target.insertAdjacentElement("beforebegin", fromEl);
    }

    queueList.querySelectorAll(".admin-queue-row .queue-index").forEach((el, i) => {
      el.textContent = String(i + 1);
    });

    const ids = Array.from(queueList.querySelectorAll<HTMLElement>(".admin-queue-row"))
      .map((r) => r.dataset.id ?? "")
      .filter(Boolean);

    busy = true;
    try {
      await reorderQueue(slug, ids);
      for (let i = 0; i < ids.length; i++) {
        const req = requests.find((r) => r.id === ids[i]);
        if (req) req.sortOrder = i;
      }
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      toast.show(err instanceof Error ? err.message : "순서 변경 실패");
      await refresh();
    } finally {
      busy = false;
    }
  });

  await refresh();
  startAdminPolling(() => void refresh(), 4000);
}

