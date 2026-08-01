# Live MR Songbook

시청자용 멀티채널 노래책 — Cloudflare Workers (Hono) + D1 + Vite/Tailwind.

Live MR Manager와는 **별도 리포**입니다. 스트리머마다 채널(`slug`)이 분리되고, 시청자는 비로그인으로 `/c/:slug`에서 신청합니다.

## Production

| 항목 | 값 |
|------|-----|
| URL | https://live-mr-songbook.boohun2771.workers.dev |
| 데모 노래책 | https://live-mr-songbook.boohun2771.workers.dev/c/demo |
| 데모 운영 | https://live-mr-songbook.boohun2771.workers.dev/c/demo/admin |
| D1 | `live-mr-songbook` (`e2842118-6029-41bc-b309-f8e0a1b8bed1`) |

데모 채널 관리 토큰(시드, 프로덕션에서도 동일 해시): `demo-channel-token`  
운영 화면(`/c/:slug/admin`)에 위 토큰을 입력하면 됩니다 (탭 `sessionStorage`에만 저장).  
채널 생성용 `PLATFORM_ADMIN_TOKEN`은 Cloudflare Secret으로만 보관합니다 (`wrangler secret put PLATFORM_ADMIN_TOKEN`).

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
cp .dev.vars.example .dev.vars   # PLATFORM_ADMIN_TOKEN=dev-platform-token
npm run db:migrate:local
npm run dev
```

- 홈: http://localhost:5173/
- 데모 시청자: http://localhost:5173/c/demo
- 데모 운영: http://localhost:5173/c/demo/admin (토큰 `demo-channel-token`)

## Multi-tenant model

- **channels**: `slug`, `name`, `admin_token_hash` (SHA-256)
- **songs / requests / settings**: `channel_id` 스코프
- 시청자: 로그인 없음
- 스트리머: 채널별 Bearer 토큰 (계정 로그인은 이후)

## API

### Public (per channel)

| Method | Path |
|--------|------|
| `GET` | `/api/c/:slug/songs?search=&category=` |
| `GET` | `/api/c/:slug/status` |
| `GET` | `/api/c/:slug/queue` |
| `POST` | `/api/c/:slug/requests` body `{ songId, nickname?, comment? }` |

### Channel admin (`Authorization: Bearer <channel_admin_token>`)

| Method | Path |
|--------|------|
| `GET/POST` | `/api/c/:slug/admin/songs` |
| `PATCH/DELETE` | `/api/c/:slug/admin/songs/:id` |
| `GET` | `/api/c/:slug/admin/requests` |
| `PATCH` | `/api/c/:slug/admin/requests/:id` body `{ status }` |
| `PATCH` | `/api/c/:slug/admin/settings` body `{ acceptingRequests?, nowPlayingId? }` |

### Platform (`Authorization: Bearer <PLATFORM_ADMIN_TOKEN>`)

| Method | Path |
|--------|------|
| `GET` | `/api/platform/channels` |
| `POST` | `/api/platform/channels` body `{ slug, name, adminToken }` (`adminToken` ≥ 16 chars) |

레거시 `/api/songs` 등 전역 경로는 **410 Gone**.

채널 생성 예시:

```bash
curl -X POST https://live-mr-songbook.boohun2771.workers.dev/api/platform/channels \
  -H "Authorization: Bearer <PLATFORM_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"slug\":\"my-stream\",\"name\":\"My Songbook\",\"adminToken\":\"replace-with-long-secret\"}"
```

## Viewer & streamer UI

- `/c/:slug` — 시청자: 검색·카테고리·신청·대기열·NOW PLAYING
- `/c/:slug/admin` — 스트리머 운영: 신청 on/off, 대기열 재생/완료/거절
- `/` — 랜딩(데모 시청자·운영 링크)
- 테마 전환 (다크 / 라이트 / 핑크 / 스카이)

## Design

Live MR Manager 톤앤매너 + 브랜드 에셋(`public/icon-*.png`, `logo-on-*.webp`).

## Deploy

```bash
npx wrangler login
npx wrangler d1 create live-mr-songbook   # database_id → wrangler.toml
npx wrangler secret put PLATFORM_ADMIN_TOKEN
npm run db:migrate:remote
npm run deploy
```

## Out of scope (next)

- 스트리머/시청자 계정 로그인
- 커스텀 도메인, Companion 링크
- Live MR Manager Push/Pull
- Durable Objects / WebSocket
- 스트리머 관리 대시보드 UI
