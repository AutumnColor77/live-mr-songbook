import type { StatusResponse } from "./types";

export function nowPlayingLabel(status: StatusResponse | null | undefined): string {
  const np = status?.nowPlaying;
  return np ? `${np.title} - ${np.artist}` : "재생 중인 곡이 없습니다.";
}
