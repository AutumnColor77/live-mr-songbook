import { submitRequest } from "../api";
import type { AuthUser } from "../auth-api";
import { $ } from "../dom";
import type { ToastController } from "../toast";
import type { RequestGate } from "./request-gate";
import { readStoredNickname, storeNickname } from "./filters";
import type { SongbookState } from "./types";

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
  const fromUser = user?.name?.trim() || "";
  ($("#req-nickname") as HTMLInputElement).value = fromUser || readStoredNickname();
  ($("#req-comment") as HTMLInputElement).value = "";
  $("#request-modal").hidden = false;
}

export function closeRequestModal(state: SongbookState) {
  $("#request-modal").hidden = true;
  state.selectedSong = null;
}

export async function handleSubmitRequest(
  state: SongbookState,
  toast: ToastController,
  onDone: () => Promise<void>,
) {
  if (!state.selectedSong || state.submitting) return;
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
