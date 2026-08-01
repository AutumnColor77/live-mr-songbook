export type Song = {
  id: string;
  title: string;
  artist: string;
  category: string;
  tags: string[];
  songKey: string | null;
  bpm: number | null;
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
};

export type StatusResponse = {
  channel?: { slug: string; name: string };
  acceptingRequests: boolean;
  nowPlaying: SongRequest | null;
  pendingCount: number;
};
