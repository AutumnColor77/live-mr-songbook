import { submitRequest } from "../api";
import type { AuthUser } from "../auth-api";
import { $ } from "../dom";
import type { ToastController } from "../toast";
import type { RequestMode } from "../types";
import type { RequestGate } from "./request-gate";
import { readStoredNickname, storeNickname } from "./filters";
import {
  buildRequestCommand,
  formatMinDonationLabel,
} from "./request-command";
import type { SongbookState } from "./types";

function requestMode(state: SongbookState): RequestMode {
  return state.status?.requestMode ?? "both";
}

function minPriceKrw(state: SongbookState, songDonation: number | null | undefined): number {
  if (typeof songDonation === "number" && songDonation >= 0) return songDonation;
  return state.status?.requestPriceKrw ?? 0;
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

  const mode = requestMode(state);
  const prefix = state.status?.requestCommandPrefix ?? "!신청";
  const separator = state.status?.requestCommandSeparator ?? "-";
  const command = buildRequestCommand(prefix, song.artist, song.title, separator);
  $("#req-command-text").textContent = command;

  const price = minPriceKrw(state, song.donationAmount);
  const paidHint = $("#req-paid-hint");
  const webFields = $("#req-web-fields");
  const submitBtn = $("#submit-request-btn") as HTMLButtonElement;

  if (mode === "paid") {
    $("#req-command-hint").textContent =
      "아래 명령문을 복사한 뒤, 치지직에서 최소 금액 이상 후원하며 메시지에 붙여 넣으세요.";
    paidHint.hidden = false;
    paidHint.textContent = formatMinDonationLabel(price);
    webFields.hidden = true;
    submitBtn.hidden = true;
  } else if (mode === "free") {
    $("#req-command-hint").textContent =
      "웹에서 바로 신청하거나, 명령문을 복사해 치지직 채팅에 붙여 넣으세요.";
    paidHint.hidden = true;
    webFields.hidden = false;
    submitBtn.hidden = false;
  } else {
    $("#req-command-hint").textContent =
      "웹 신청, 채팅 명령, 또는 후원 메시지 중 편한 방법을 쓰세요.";
    paidHint.hidden = price > 0 ? false : true;
    paidHint.textContent = price > 0 ? `후원 시 ${formatMinDonationLabel(price)}` : "";
    webFields.hidden = false;
    submitBtn.hidden = false;
  }

  const fromUser = user?.name?.trim() || "";
  ($("#req-nickname") as HTMLInputElement).value = fromUser || readStoredNickname();
  ($("#req-comment") as HTMLInputElement).value = "";
  $("#request-modal").hidden = false;
}

export function closeRequestModal(state: SongbookState) {
  $("#request-modal").hidden = true;
  state.selectedSong = null;
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
    const nickname = ($("#req-nickname") as HTMLInputElement).value.trim();
    const comment = ($("#req-comment") as HTMLInputElement).value.trim();
    const title = state.selectedSong.title;
    await submitRequest({
      songId: state.selectedSong.id,
      nickname: nickname || undefined,
      comment: comment || undefined,
    });
    storeNickname(nickname);
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
