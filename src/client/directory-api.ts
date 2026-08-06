export type DirectoryChannel = {
  slug: string;
  name: string;
  songCount: number;
  picture: string;
  ownerName: string;
};

export async function fetchDirectoryChannels(
  q = "",
): Promise<DirectoryChannel[]> {
  const qs = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed) qs.set("q", trimmed);
  const url = qs.size
    ? `/api/directory/channels?${qs}`
    : "/api/directory/channels";
  const res = await fetch(url, {
    credentials: "include",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Directory request failed (${res.status})`);
  }
  const data = (await res.json()) as { channels?: DirectoryChannel[] };
  return (data.channels ?? []).map((ch) => ({
    slug: ch.slug,
    name: ch.name,
    songCount: Number(ch.songCount) || 0,
    picture: ch.picture ?? "",
    ownerName: ch.ownerName ?? "",
  }));
}
