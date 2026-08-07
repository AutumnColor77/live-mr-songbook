export type Song = {
  id: string;
  title: string;
  artist: string;
  category: string;
  genre?: string;
  tags: string[];
  songKey: string | null;
  bpm: number | null;
  difficulty?: number | null;
  donationAmount?: number | null;
  thumbnail?: string;
  originalUrl?: string | null;
};

export type SongRequest = {
  id: string;
  songId: string | null;
  title: string;
  artist: string;
  nickname: string;
  comment: string;
  status: string;
  createdAt: number;
  sortOrder?: number;
  payAmount?: number | null;
};

export type DuplicatePolicy = "allow" | "queue" | "played";

export type RequestMode = "free" | "paid" | "both";

export type StatusResponse = {
  channel?: { slug: string; name: string };
  acceptingRequests: boolean;
  allowDuplicateRequests?: boolean;
  duplicatePolicy?: DuplicatePolicy;
  blockedSongIds?: string[];
  nowPlaying: SongRequest | null;
  pendingCount: number;
  requestMode?: RequestMode;
  requestPriceKrw?: number;
  requestCommandPrefix?: string;
  requestCommandSeparator?: string;
};
