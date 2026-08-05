import type { Song, SongRequest, StatusResponse } from "../types";

export type ViewMode = "list" | "button";

export type SongbookState = {
  currentGenre: string;
  currentArtist: string;
  searchQuery: string;
  songs: Song[];
  genres: string[];
  artists: string[];
  queue: SongRequest[];
  status: StatusResponse | null;
  selectedSong: Song | null;
  submitting: boolean;
  viewMode: ViewMode;
  filterOpen: { genre: boolean; artist: boolean };
};
