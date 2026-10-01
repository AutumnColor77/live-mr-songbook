import {
  AdminAuthError,
  createAdminSong,
  fetchAdminSongs,
  fetchPublicStatus,
  patchAdminSong,
} from "../admin-api";
import { logout } from "../auth-api";
import { $, escapeHtml } from "../dom";
import { icons } from "../icons";
import { cycleTheme, logoLinkHtml } from "../theme";
import { createToast } from "../toast";
import type { AdminSong, SongEditInput } from "../types";
import { mountLogin } from "./login";
import { stopAdminPolling } from "./polling";

type VisibilityFilter = "all" | "shown" | "hidden";

/** Same convention as the viewer songbook and Manager Push: an "MR" tag marks an instrumental. */
function hasMrTag(tags: string[] | undefined): boolean {
  return (tags ?? []).some((t) => String(t).toUpperCase() === "MR");
}

function withMrTag(tags: string[] | undefined, mr: boolean): string[] {
  const rest = (tags ?? []).filter((t) => String(t).toUpperCase() !== "MR");
  return mr ? ["MR", ...rest] : rest;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function songKey(title: string, artist: string): string {
  const part = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  return `${part(title)}\0${part(artist)}`;
}

function thumbHtml(src: string): string {
  return src
    ? `<span class="dock-art has-image admin-song-art"><img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>`
    : `<span class="dock-art admin-song-art">${icons.disc(18)}</span>`;
}

export async function mountSongLibrary(root: HTMLElement, slug: string): Promise<void> {
  stopAdminPolling();
  root.innerHTML = `
    <div class="admin-ops relative z-10 min-h-screen flex flex-col">
      <div class="admin-ops-stage" aria-hidden="true"></div>
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            ${logoLinkHtml()}
            <div class="min-w-0">
              <p id="library-channel-name" class="text-sm font-extrabold text-main truncate">…</p>
              <p class="text-xs font-medium text-dim">곡 관리</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <a href="/c/${escapeHtml(slug)}/admin" class="secondary-btn btn-sm">운영으로</a>
            <a href="/c/${escapeHtml(slug)}" class="secondary-btn btn-sm hidden sm:inline-flex" target="_blank" rel="noopener">노래책 열기</a>
            <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">${icons.palette(18)}</button>
            <button id="library-logout" type="button" class="secondary-btn btn-sm hidden sm:inline-flex">로그아웃</button>
          </div>
        </div>
      </header>

      <main class="admin-ops-main flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-12 space-y-4">
        <section class="admin-ops-card admin-library">
          <div class="admin-ops-queue-head">
            <div class="flex items-center gap-2 min-w-0">
              <h1 class="admin-ops-queue-title">노래책 곡</h1>
              <span id="library-count" class="count-badge">0</span>
            </div>
            <button id="library-add" type="button" class="primary-btn btn-sm">곡 추가</button>
          </div>
          <p class="admin-library-note">
            Live MR Manager에서 라이브러리를 올리면, 앱에 없는 곡은 숨겨질 수 있습니다. 웹에서 넣은 곡은 유지됩니다.
          </p>
          <div class="admin-library-toolbar">
            <div class="search-box flex-1 min-w-0">
              ${icons.search(18)}
              <input id="library-search" type="search" class="search-input" autocomplete="off" placeholder="제목 또는 가수 검색..." />
            </div>
            <div class="view-modes" role="group" aria-label="표시 상태">
              <button type="button" class="admin-library-filter view-btn" data-filter="all">전체</button>
              <button type="button" class="admin-library-filter view-btn" data-filter="shown">표시</button>
              <button type="button" class="admin-library-filter view-btn" data-filter="hidden">숨김</button>
            </div>
          </div>
          <div id="library-list" class="space-y-2">
            <div class="admin-ops-empty">불러오는 중…</div>
          </div>
        </section>
      </main>

      <div id="song-modal" class="modal-overlay" hidden>
        <div id="song-modal-overlay" class="absolute inset-0"></div>
        <form id="song-form" class="modal-content relative max-h-[92vh] overflow-y-auto" novalidate>
          <div class="modal-grip"></div>
          <p id="song-modal-eyebrow" class="modal-eyebrow mb-4">곡 추가</p>
          <div class="space-y-3">
            <label class="block space-y-1.5">
              <span class="admin-ops-kicker">제목 *</span>
              <input id="song-title" type="text" maxlength="200" required class="cm-input" autocomplete="off" />
            </label>
            <label class="block space-y-1.5">
              <span class="admin-ops-kicker">가수 *</span>
              <input id="song-artist" type="text" maxlength="200" required class="cm-input" autocomplete="off" />
            </label>
            <p id="song-dup-warning" class="text-xs font-semibold text-accent" hidden></p>
            <div class="grid grid-cols-2 gap-3">
              <label class="block space-y-1.5">
                <span class="admin-ops-kicker">장르</span>
                <input id="song-genre" type="text" maxlength="40" list="song-genre-options" class="cm-input" placeholder="미분류" autocomplete="off" />
                <datalist id="song-genre-options"></datalist>
              </label>
              <label class="block space-y-1.5">
                <span class="admin-ops-kicker">난이도</span>
                <select id="song-difficulty" class="cm-input">
                  <option value="">없음</option>
                  <option value="1">★</option>
                  <option value="2">★★</option>
                  <option value="3">★★★</option>
                  <option value="4">★★★★</option>
                  <option value="5">★★★★★</option>
                </select>
              </label>
            </div>
            <label class="block space-y-1.5">
              <span class="admin-ops-kicker">최소 후원 금액 (원)</span>
              <input id="song-donation" type="number" min="0" max="100000000" step="1000" inputmode="numeric" class="cm-input" placeholder="비우면 무료 신청" />
            </label>
            <div class="space-y-1.5">
              <label for="song-play-url" class="admin-ops-kicker block">재생 링크</label>
              <div class="flex items-center gap-3">
                <input id="song-play-url" type="url" maxlength="2048" class="cm-input flex-1 min-w-0" placeholder="https://youtu.be/..." autocomplete="off" />
                <label class="admin-song-mr-check">
                  <input id="song-mr" type="checkbox" />
                  MR
                </label>
              </div>
            </div>
            <p id="song-form-error" class="text-sm font-semibold text-center" style="color:#f87171" hidden></p>
          </div>
          <div class="flex gap-2.5 mt-5">
            <button id="song-cancel" type="button" class="secondary-btn flex-1">취소</button>
            <button id="song-submit" type="submit" class="primary-btn flex-1">저장</button>
          </div>
        </form>
      </div>

      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  const toast = createToast(root);
  let songs: AdminSong[] = [];
  let query = "";
  let filter: VisibilityFilter = "all";
  let busy = false;
  let editingId: string | null = null;

  function onAuthError(err: unknown): boolean {
    if (err instanceof AdminAuthError) {
      mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
      return true;
    }
    return false;
  }

  function visibleSongs(): AdminSong[] {
    const q = query.trim().toLowerCase();
    return songs.filter((song) => {
      if (filter === "shown" && !song.enabled) return false;
      if (filter === "hidden" && song.enabled) return false;
      if (!q) return true;
      return song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q);
    });
  }

  function render() {
    $("#library-count").textContent = String(songs.length);
    root.querySelectorAll<HTMLButtonElement>(".admin-library-filter").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.filter === filter);
    });

    const list = $("#library-list");
    if (songs.length === 0) {
      list.innerHTML = `<div class="admin-ops-empty">아직 등록된 곡이 없습니다. <b>곡 추가</b>로 첫 곡을 넣어 보세요.</div>`;
      return;
    }
    const rows = visibleSongs();
    if (rows.length === 0) {
      list.innerHTML = `<div class="admin-ops-empty">조건에 맞는 곡이 없습니다.</div>`;
      return;
    }

    list.innerHTML = rows
      .map((song) => {
        const id = escapeHtml(song.id);
        const badges = [
          song.enabled ? "" : `<span class="admin-song-badge is-hidden">숨김</span>`,
          song.origin === "web" ? `<span class="admin-song-badge">웹</span>` : "",
          hasMrTag(song.tags) ? `<span class="admin-song-badge">MR</span>` : "",
          song.originalUrl ? `<span class="admin-song-badge">링크</span>` : "",
          song.genre ? `<span class="admin-song-badge">${escapeHtml(song.genre)}</span>` : "",
          song.difficulty ? `<span class="admin-song-badge">${"★".repeat(song.difficulty)}</span>` : "",
          song.donationAmount
            ? `<span class="admin-song-badge">${escapeHtml(song.donationAmount.toLocaleString("ko-KR"))}원</span>`
            : "",
        ].join("");
        return `
          <div class="queue-row admin-song-row${song.enabled ? "" : " is-disabled"}">
            ${thumbHtml(song.thumbnail ?? "")}
            <div class="min-w-0 flex-1">
              <p class="song-name text-sm truncate">${escapeHtml(song.title)}</p>
              <p class="song-artist text-xs truncate">${escapeHtml(song.artist)}</p>
              <div class="admin-song-badges">${badges}</div>
            </div>
            <div class="admin-song-actions">
              <button type="button" class="secondary-btn btn-sm" data-act="edit" data-id="${id}">수정</button>
              <button type="button" class="secondary-btn btn-sm" data-act="toggle" data-id="${id}">${song.enabled ? "숨기기" : "표시"}</button>
            </div>
          </div>`;
      })
      .join("");
  }

  async function refresh() {
    try {
      songs = await fetchAdminSongs(slug);
      render();
    } catch (err) {
      if (onAuthError(err)) return;
      $("#library-list").innerHTML =
        `<div class="admin-ops-empty">${escapeHtml(err instanceof Error ? err.message : "곡 목록을 불러오지 못했습니다.")}</div>`;
    }
  }

  const titleInput = $("#song-title") as HTMLInputElement;
  const artistInput = $("#song-artist") as HTMLInputElement;
  const genreInput = $("#song-genre") as HTMLInputElement;
  const difficultyInput = $("#song-difficulty") as unknown as { value: string };
  const donationInput = $("#song-donation") as HTMLInputElement;
  const playUrlInput = $("#song-play-url") as HTMLInputElement;
  const mrCheck = $("#song-mr") as HTMLInputElement;
  const formError = $("#song-form-error");
  const dupWarning = $("#song-dup-warning");
  const submitBtn = $("#song-submit") as HTMLButtonElement;

  function showFormError(message: string) {
    formError.textContent = message;
    formError.hidden = !message;
  }

  function updateDupWarning() {
    const title = titleInput.value.trim();
    const artist = artistInput.value.trim();
    if (!title || !artist) {
      dupWarning.hidden = true;
      return;
    }
    const key = songKey(title, artist);
    const dup = songs.find((s) => s.id !== editingId && songKey(s.title, s.artist) === key);
    dupWarning.hidden = !dup;
    if (dup) {
      dupWarning.textContent = dup.enabled
        ? "같은 제목·가수의 곡이 이미 있습니다."
        : "같은 제목·가수의 숨긴 곡이 있습니다. 새로 추가하는 대신 그 곡을 표시해도 됩니다.";
    }
  }

  function openModal(song: AdminSong | null) {
    editingId = song?.id ?? null;
    $("#song-modal-eyebrow").textContent = song ? "곡 수정" : "곡 추가";
    submitBtn.textContent = song ? "저장" : "추가";
    titleInput.value = song?.title ?? "";
    artistInput.value = song?.artist ?? "";
    genreInput.value = song?.genre && song.genre !== "미분류" ? song.genre : "";
    difficultyInput.value = song?.difficulty ? String(song.difficulty) : "";
    donationInput.value = song?.donationAmount ? String(song.donationAmount) : "";
    playUrlInput.value = song?.originalUrl ?? "";
    mrCheck.checked = hasMrTag(song?.tags);
    showFormError("");
    updateDupWarning();

    const genres = [...new Set(songs.map((s) => s.genre).filter((g): g is string => Boolean(g)))].sort();
    $("#song-genre-options").innerHTML = genres
      .map((g) => `<option value="${escapeHtml(g)}"></option>`)
      .join("");

    $("#song-modal").hidden = false;
    titleInput.focus();
  }

  function closeModal() {
    $("#song-modal").hidden = true;
    editingId = null;
  }

  function readForm(): SongEditInput | null {
    const title = titleInput.value.trim();
    const artist = artistInput.value.trim();
    if (!title || !artist) {
      showFormError("제목과 가수를 입력해 주세요.");
      return null;
    }
    const donationRaw = donationInput.value.trim();
    const donation = donationRaw ? Number(donationRaw) : null;
    if (donation !== null && (!Number.isFinite(donation) || donation < 0 || donation > 100_000_000)) {
      showFormError("후원 금액은 0 ~ 100,000,000원 사이로 입력해 주세요.");
      return null;
    }
    const playUrl = playUrlInput.value.trim();
    if (playUrl && !isHttpUrl(playUrl)) {
      showFormError("재생 링크는 http:// 또는 https:// 주소로 입력해 주세요.");
      return null;
    }
    const existingTags = songs.find((s) => s.id === editingId)?.tags;
    return {
      title,
      artist,
      genre: genreInput.value.trim(),
      difficulty: difficultyInput.value ? Number(difficultyInput.value) : null,
      donationAmount: donation && donation > 0 ? Math.round(donation) : null,
      originalUrl: playUrl || null,
      tags: withMrTag(existingTags, mrCheck.checked),
    };
  }

  $("#song-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const input = readForm();
    if (!input) return;
    busy = true;
    submitBtn.disabled = true;
    try {
      if (editingId) {
        const updated = await patchAdminSong(slug, editingId, input);
        songs = songs.map((s) => (s.id === updated.id ? updated : s));
        toast.show(`${updated.title} 저장했습니다.`);
      } else {
        const created = await createAdminSong(slug, input);
        songs = [...songs, created].sort((a, b) =>
          a.title.localeCompare(b.title, "ko", { sensitivity: "base" }),
        );
        toast.show(`${created.title} 추가했습니다.`);
      }
      closeModal();
      render();
    } catch (err) {
      if (onAuthError(err)) return;
      showFormError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      busy = false;
      submitBtn.disabled = false;
    }
  });

  titleInput.addEventListener("input", updateDupWarning);
  artistInput.addEventListener("input", updateDupWarning);

  $("#song-cancel").addEventListener("click", closeModal);
  $("#song-modal-overlay").addEventListener("click", closeModal);
  $("#song-modal").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  $("#library-add").addEventListener("click", () => openModal(null));

  $("#library-search").addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    render();
  });

  root.querySelectorAll<HTMLButtonElement>(".admin-library-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = (btn.dataset.filter as VisibilityFilter) ?? "all";
      render();
    });
  });

  $("#library-list").addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!btn || busy) return;
    const song = songs.find((s) => s.id === btn.dataset.id);
    if (!song) return;
    if (btn.dataset.act === "edit") {
      openModal(song);
      return;
    }
    busy = true;
    btn.disabled = true;
    try {
      const updated = await patchAdminSong(slug, song.id, { enabled: !song.enabled });
      songs = songs.map((s) => (s.id === updated.id ? updated : s));
      toast.show(updated.enabled ? `${updated.title}을(를) 노래책에 표시합니다.` : `${updated.title}을(를) 숨겼습니다.`);
      render();
    } catch (err) {
      if (onAuthError(err)) return;
      toast.show(err instanceof Error ? err.message : "변경 실패");
      btn.disabled = false;
    } finally {
      busy = false;
    }
  });

  $("#library-logout").addEventListener("click", async () => {
    await logout();
    mountLogin(root, slug);
  });

  $("#theme-btn").addEventListener("click", () => {
    cycleTheme();
  });

  void fetchPublicStatus(slug)
    .then((status) => {
      const name = status.channel?.name ?? slug;
      $("#library-channel-name").textContent = name;
      document.title = `${name} · 곡 관리 · Live MR Songbook`;
    })
    .catch(() => {
      $("#library-channel-name").textContent = slug;
    });

  await refresh();
}
