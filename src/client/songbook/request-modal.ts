import { submitRequest } from "../api";
import type { AuthUser } from "../auth-api";
import { $, escapeHtml } from "../dom";
import type { ToastController } from "../toast";
import type { RequestMode } from "../types";
import type { RequestGate } from "./request-gate";
import { readStoredNickname } from "./filters";
import {
  buildRequestCommand,
  formatMinDonationLabel,
} from "./request-command";
import type { SongbookState } from "./types";

let pendingRequester = "";

function requestMode(state: SongbookState): RequestMode {
  return state.status?.requestMode ?? "both";
}

function minPriceKrw(state: SongbookState, songDonation: number | null | undefined): number {
  if (typeof songDonation === "number" && songDonation >= 0) return songDonation;
  return state.status?.requestPriceKrw ?? 0;
}

function resolveRequester(user: AuthUser | null): string {
  const fromUser = user?.name?.trim() || "";
  return fromUser || readStoredNickname().trim() || "익명";
}

function setHowtoRows(rows: { label: string; text: string }[]) {
  $("#req-command-hint").innerHTML = rows
    .map(
      (r) =>
        `<p><span class="font-extrabold text-main">${escapeHtml(r.label)}</span> ${escapeHtml(r.text)}</p>`,
    )
    .join("");
}

export function openRequestModal(
  state: SongbookState,
  gate: RequestGate,
  toast: ToastController,
  songId: string,
  user: AuthUser | null = null,
) {
  const song = state.songs.find((s) => s.id === songId);
  if (!song) return;
  if (!gate.isAccepting()) {
    toast.show("지금은 신청을 받지 않습니다.");
    return;
  }
  if (gate.blockedSongIds().has(song.id)) {
    toast.show(gate.songRequestToast(song.id));
    return;
  }
  state.selectedSong = song;
  $("#modal-song-title").textContent = song.title;
  $("#modal-song-artist").textContent = song.artist;

  pendingRequester = resolveRequester(user);
  const requesterEl = $("#modal-requester");
  requesterEl.textContent = pendingRequester;
  requesterEl.title = `신청자 · ${pendingRequester}`;

  const mode = requestMode(state);
  const prefix = state.status?.requestCommandPrefix ?? "!신청";
  const separator = state.status?.requestCommandSeparator ?? "-";
  const command = buildRequestCommand(prefix, song.artist, song.title, separator);
  $("#req-command-text").textContent = command;

  const price = minPriceKrw(state, song.donationAmount);
  const paidHint = $("#req-paid-hint");
  const submitBtn = $("#submit-request-btn") as HTMLButtonElement;
  const paidHow =
    price > 0
      ? `명령문 복사 후, 치지직에서 ${formatMinDonationLabel(price)} 후원하며 메시지에 붙여 넣으세요.`
      : "명령문 복사 후, 치지직에서 후원하며 메시지에 붙여 넣으세요.";

  if (mode === "paid") {
    setHowtoRows([{ label: "유료", text: paidHow }]);
    paidHint.hidden = true;
    submitBtn.hidden = true;
  } else if (mode === "free") {
    setHowtoRows([
      {
        label: "무료",
        text: "웹에서 신청하기를 누르거나, 명령문을 복사해 치지직 채팅에 붙여 넣으세요.",
      },
    ]);
    paidHint.hidden = true;
    submitBtn.hidden = false;
  } else {
    setHowtoRows([
      {
        label: "무료",
        text: "웹에서 신청하기를 누르거나, 명령문을 복사해 치지직 채팅에 붙여 넣으세요.",
      },
      { label: "유료", text: paidHow },
    ]);
    paidHint.hidden = true;
    submitBtn.hidden = false;
  }

  $("#request-modal").hidden = false;
}

export function closeRequestModal(state: SongbookState) {
  $("#request-modal").hidden = true;
  state.selectedSong = null;
  pendingRequester = "";
}

export async function copyRequestCommand(toast: ToastController) {
  const text = $("#req-command-text").textContent?.trim() ?? "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.show("명령문을 복사했습니다.");
  } catch {
    toast.show("복사에 실패했습니다. 직접 선택해 복사해 주세요.");
  }
}

export async function handleSubmitRequest(
  state: SongbookState,
  toast: ToastController,
  onDone: () => Promise<void>,
) {
  if (!state.selectedSong || state.submitting) return;
  if (requestMode(state) === "paid") {
    toast.show("이 채널은 치지직 후원으로만 신청할 수 있습니다.");
    return;
  }
  state.submitting = true;
  const btn = $("#submit-request-btn") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const title = state.selectedSong.title;
    await submitRequest({
      songId: state.selectedSong.id,
      nickname: pendingRequester || undefined,
    });
    closeRequestModal(state);
    toast.show(`${title} 신청이 완료되었습니다!`);
    await onDone();
  } catch (err) {
    toast.show(err instanceof Error ? err.message : "신청에 실패했습니다.");
  } finally {
    state.submitting = false;
    btn.disabled = false;
  }
}
