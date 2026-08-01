# Live MR Songbook

시청자용 노래책 사이트 — Cloudflare Workers (Hono) + D1 + Vite/Tailwind.

Live MR Manager와는 **별도 리포**입니다. 멜로밍 API에 의존하지 않으며, 곡·신청 큐는 D1가 단일 소스입니다.

## Stack

| Layer | Tech |
|-------|------|
| API | Hono on Cloudflare Workers |
| DB | Cloudflare D1 (SQLite) |
| UI | Vite + TypeScript + Tailwind CSS v4 |
| Deploy | Cloudflare Workers + Assets |

## Quick start (local)

```bash
npm install
cp .dev.vars.example .dev.vars   # ADMIN_TOKEN=dev-admin-token
npm run db:migrate:local
npm run dev
```

기본 로컬 URL은 Vite/Wrangler가 안내하는 주소(보통 `http://localhost:5173`)입니다.

관리 API 예시:

```bash
curl -H "Authorization: Bearer dev-admin-token" http://localhost:5173/api/admin/songs
```

## Viewer features

- 곡 검색 / 카테고리 필터 (KPOP, POP, JPOP, OST)
- 신청 (닉네임·메시지 선택, 키 선택 없음)
- NOW PLAYING + 대기열 (모바일: 하단 바·드로어 / 데스크톱: 우측 패널)
- 상태 폴링 (~5초)

## API contract (for Live MR Manager)

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/songs?search=&category=` | Enabled songs |
| `GET` | `/api/status` | `acceptingRequests`, `nowPlaying`, `pendingCount` |
| `GET` | `/api/queue` | Pending + playing requests |
| `POST` | `/api/requests` | Body: `{ songId, nickname?, comment? }` |

### Admin (`Authorization: Bearer <ADMIN_TOKEN>`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/songs` | All songs (incl. disabled) |
| `POST` | `/api/admin/songs` | Create song |
| `PATCH` | `/api/admin/songs/:id` | Update song |
| `DELETE` | `/api/admin/songs/:id` | Delete song |
| `GET` | `/api/admin/requests` | Recent requests |
| `PATCH` | `/api/admin/requests/:id` | Body: `{ status }` — `pending` \| `playing` \| `done` \| `rejected` |
| `PATCH` | `/api/admin/settings` | Body: `{ acceptingRequests?, nowPlayingId? }` |

Song JSON shape:

```json
{
  "id": "song-1",
  "title": "사건의 지평선",
  "artist": "윤하",
  "category": "KPOP",
  "tags": ["MR", "원키"],
  "songKey": "A",
  "bpm": 130,
  "enabled": true,
  "createdAt": 1722470400000,
  "updatedAt": 1722470400000
}
```

## Deploy (Cloudflare)

1. Cloudflare 계정에서 D1 데이터베이스 생성:

   ```bash
   npx wrangler d1 create live-mr-songbook
   ```

2. 출력된 `database_id`를 [`wrangler.toml`](wrangler.toml)의 `database_id`에 넣습니다.

3. 시크릿 설정:

   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```

4. 마이그레이션 + 배포:

   ```bash
   npm run db:migrate:remote
   npm run deploy
   ```

## Out of scope (this MVP)

- Live MR Manager ↔ 이 API Push/Pull UI (다음 단계; admin API는 그에 맞춤)
- WebSocket / Durable Objects 실시간
- 음원·MR 파일 호스팅
