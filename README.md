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
cp .dev.vars.example .dev.vars   # PLATFORM_ADMIN_TOKEN + (optional) Google OAuth
npm run db:migrate:local
npm run dev
```

- 홈: http://localhost:5173/ (Google 로그인)
- 데모 시청자: http://localhost:5173/c/demo
- 데모 운영: http://localhost:5173/c/demo/admin (토큰 `demo-channel-token`)

### Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)에서 OAuth 2.0 클라이언트(웹) 생성
2. 승인된 리디렉션 URI 추가:
   - 로컬: `http://localhost:5173/api/auth/google/callback`
   - 프로덕션: `https://live-mr-songbook.boohun2771.workers.dev/api/auth/google/callback`
3. `.dev.vars`에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 입력
4. 프로덕션은 시크릿으로 등록:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

값이 비어 있으면 홈의 Google 로그인 버튼은 503을 반환합니다.

## Multi-tenant model

- **channels**: `slug`, `name`, `admin_token_hash` (SHA-256)
- **songs / requests / settings**: `channel_id` 스코프
- **users / sessions**: Google 계정 로그인 (HttpOnly 쿠키 세션)
- 시청자: 로그인 없음
- 스트리머: Google 로그인 → 데모 채널 운영 (`/c/demo/admin`). 채널 Admin Token은 API 폴백용
- 로그인 성공 기본 이동: `/c/demo/admin`

## API

### Auth (Google)

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/auth/google` | Google OAuth 시작 (리다이렉트) |
| `GET` | `/api/auth/google/callback` | OAuth 콜백 → 세션 쿠키 발급 |
| `GET` | `/api/auth/me` | 현재 로그인 사용자 (`{ user }` 또는 `user: null`) |
| `GET` | `/api/auth/status` | `{ googleEnabled }` — OAuth 설정 여부 |
| `POST` | `/api/auth/logout` | 세션 삭제 |

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
| `POST` | `/api/c/:slug/admin/queue/clear` — 대기 중·재생 중 신청을 모두 `rejected`로 정리하고 Now Playing 해제 |

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
- `/` — 랜딩(Google 로그인, 데모 링크)
- `/me` — 로그인 후 계정 화면 (다음 단계 CTA)
- 테마 전환 (다크 / 라이트 / 핑크 / 스카이)

## Design

Live MR Manager 톤앤매너 + 브랜드 에셋(`public/icon-*.png`, `logo-on-*.webp`).

## Deploy

```bash
npx wrangler login
npx wrangler d1 create live-mr-songbook   # database_id → wrangler.toml
npx wrangler secret put PLATFORM_ADMIN_TOKEN
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run db:migrate:remote
npm run deploy
```

## Out of scope (next)

- 채널별 소유권 UI (비-demo 채널 멤버 초대)
- Manager 앱 내 deep-link 세션 동기화
- 시청자 계정 로그인
- 커스텀 도메인, Companion 링크
- Live MR Manager Push/Pull
- Durable Objects / WebSocket
- 스트리머 관리 대시보드 UI
