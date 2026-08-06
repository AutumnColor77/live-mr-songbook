# Live MR Songbook

시청자용 멀티채널 노래책 — Cloudflare Workers (Hono) + D1 + Vite/Tailwind.

Live MR Manager와는 **별도 리포**입니다. 스트리머는 소셜 로그인으로 본인 채널을 만들고, Manager 앱에서 라이브러리를 **Push** 동기화합니다. 홈(`/`)에서 등록된 노래책 목록을 비로그인으로 둘러볼 수 있고, 시청자 로그인 후 같은 홈으로 복귀합니다. 개별 노래책(`/c/:slug`)에서도 선택 로그인이 가능합니다(프로필 강제 설정 없음).

로드맵·미완 작업은 [`TODO.md`](TODO.md)를 보세요. 치지직 도네·유료 신청 설계는 [`docs/chzzk-paid-requests.md`](docs/chzzk-paid-requests.md).

## Production

| 항목 | 값 |
|------|-----|
| URL | https://live-mr-songbook.boohun2771.workers.dev |
| D1 | `live-mr-songbook` (`e2842118-6029-41bc-b309-f8e0a1b8bed1`) |

시크릿은 Cloudflare Secret으로만 보관합니다 (`wrangler secret put …`).  
채널 **운영 권한의 기본**은 OAuth 세션 + `channel_members`입니다. 채널 Admin Token은 API 폴백·플랫폼 생성용입니다.

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
cp .dev.vars.example .dev.vars   # PLATFORM_ADMIN_TOKEN + Google/Naver OAuth
npm run db:pull                  # 프로덕션 D1 → 로컬 복사 (권장)
# 또는 빈 로컬 DB: npm run db:migrate:local
npm run dev
```

프로덕션 DB를 로컬에서 쓰려면 Cloudflare에 로그인된 상태에서:

```bash
npx wrangler login   # 한 번
npm run db:pull      # 원격 export → 로컬 import (프로덕션은 변경 없음)
npm run dev          # http://localhost:5173
```

`tmp/remote-dump.sql`은 gitignore됩니다. UI/코드 확인은 `npm run dev`로 하고, 배포할 때만 커밋·푸시하면 됩니다.

- 홈(노래책 디렉터리): http://localhost:5173/
- 계정·채널: http://localhost:5173/me
- 채널 예: http://localhost:5173/c/{slug} · 운영: http://localhost:5173/c/{slug}/admin

## OAuth (Google / Naver)

1. 각 콘솔에서 웹 클라이언트 생성 후 콜백 URI 등록  
   - 로컬 Google: `http://localhost:5173/api/auth/google/callback`  
   - 로컬 Naver: `http://localhost:5173/api/auth/naver/callback`  
   - 프로덕션: `https://live-mr-songbook.boohun2771.workers.dev/api/auth/{google|naver}/callback`
2. `.dev.vars`에 클라이언트 ID/Secret 입력 (네이버는 이메일 등 필수 제공 허용)
3. 프로덕션 시크릿:

```bash
npx wrangler secret put PLATFORM_ADMIN_TOKEN
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET
npx wrangler secret put CHZZK_CLIENT_ID
npx wrangler secret put CHZZK_CLIENT_SECRET
```

설정이 비어 있으면 해당 로그인 버튼은 사용할 수 없습니다 (`GET /api/auth/status`).

**데스크톱(Manager)** deep-link: `live-mr-manager://oauth/callback?token=…`  
브라우저 세션 재사용: `GET /api/auth/desktop-connect`, 핸드오프: `GET /api/auth/desktop-handoff`.

## 치지직 실시간 (채팅·후원)

계획·할 일: [docs/chzzk-realtime-integration.md](docs/chzzk-realtime-integration.md)  
설계: [docs/chzzk-paid-requests.md](docs/chzzk-paid-requests.md)

1. [개발자 센터](https://developers.chzzk.naver.com/) 앱 등록 · Scope(유저/채팅/후원) · Redirect URI  
   - 로컬: `http://localhost:5173/api/auth/chzzk/callback`  
   - 프로덕션: `https://<worker>.workers.dev/api/auth/chzzk/callback`
2. `.dev.vars` / Workers secrets에 `CHZZK_CLIENT_ID` · `CHZZK_CLIENT_SECRET`
3. `/me`에서 **치지직 연결** (한 번 연결 후 세션 유지)  
4. `npm run db:migrate:remote` (또는 `deploy:with-migrate`)로 `0015`·`0016` 적용

## Multi-tenant model

- **channels** — `slug`, `name`, `admin_token_hash`
- **channel_members** — 사용자↔채널 역할(`admin` 등). 로그인 사용자는 **본인 채널 1개**
- **songs** — `title`, `artist`, `category`(큐레이션), `genre`, `tags`, `song_key`, `bpm`, `difficulty`(1–5), `thumbnail`(http(s) 또는 압축 data URL), `enabled`
- **requests / settings** — 채널 스코프 대기열·신청 수락·Now Playing
- **users / sessions** — Google/Naver 계정, HttpOnly `sb_session` 쿠키
- 시청자: 홈 디렉터리에서 노래책 탐색·선택 로그인  
- 스트리머: 소셜 로그인 → **`/me`**에서 채널 생성·이름/슬러그 수정 → `/c/:slug/admin` 운영  
- 로그인 성공 기본 next: `/me` (시청자 CTA는 `/`)

## API

### Auth

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/auth/{google\|naver}` | OAuth 시작 |
| `GET` | `/api/auth/{google\|naver}/callback` | 콜백 → 세션 쿠키 |
| `POST` | `/api/auth/{google\|naver}/exchange` | SPA code 교환 |
| `GET` | `/api/auth/me` | `{ user, channels }` |
| `PATCH` | `/api/auth/profile` | 닉네임·아바타 |
| `GET` | `/api/auth/desktop-connect` | 앱 로그인 (`?provider=&next=`) |
| `GET` | `/api/auth/desktop-handoff` | 세션 → deep-link 토큰 |
| `GET` | `/api/auth/status` | `{ googleEnabled, naverEnabled }` |
| `POST` | `/api/auth/logout` | 세션 삭제 |

### Me (세션 필수)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/me/channels` | 채널 생성 `{ name, slug? }` (계정당 1개) |
| `PATCH` | `/api/me/channels/:id` | 이름·슬러그 수정 |

### Public (per channel)

| Method | Path |
|--------|------|
| `GET` | `/api/c/:slug/songs?search=&genre=&artist=` → `{ songs, genres, artists }` |
| `GET` | `/api/c/:slug/status` → `{ acceptingRequests, duplicatePolicy, allowDuplicateRequests, blockedSongIds, nowPlaying, pendingCount, … }` |
| `GET` | `/api/c/:slug/queue` |
| `POST` | `/api/c/:slug/requests` body `{ songId, nickname?, comment? }` (`duplicatePolicy`가 `queue`/`played`일 때 차단 곡은 `409`) |

### Channel admin

`Authorization: Bearer <session_token | channel_admin_token>` (쿠키 세션 또는 멤버십/토큰)

| Method | Path |
|--------|------|
| `GET/POST` | `/api/c/:slug/admin/songs` |
| `PATCH/DELETE` | `/api/c/:slug/admin/songs/:id` |
| `GET` | `/api/c/:slug/admin/requests` |
| `PATCH` | `/api/c/:slug/admin/requests/:id` body `{ status }` |
| `PATCH` | `/api/c/:slug/admin/settings` body `{ acceptingRequests?, duplicatePolicy?: 'allow'\|'queue'\|'played', nowPlayingId? }` |
| `POST` | `/api/c/:slug/admin/queue/clear` (대기열 reject + 부른 곡 중복 세션 초기화) |
| `POST` | `/api/c/:slug/admin/queue/reorder` body `{ ids: string[] }` (`pending`/`playing` id 집합과 일치, `sort_order` 갱신) |

### Platform (`Authorization: Bearer <PLATFORM_ADMIN_TOKEN>`)

| Method | Path |
|--------|------|
| `GET` | `/api/platform/channels` |
| `POST` | `/api/platform/channels` body `{ slug, name, adminToken }` (`adminToken` ≥ 16 chars) |

레거시 전역 `/api/songs` 등은 **410 Gone**.

## Viewer & streamer UI

- `/` — 랜딩, 소셜 로그인, 데모·내 채널 CTA
- `/me/setup` — 최초 프로필(닉네임·아바타)
- `/me` — 채널 생성/수정(표시 이름·슬러그), 프로필 편집
- `/c/:slug` — 시청자: 검색, 접이식 **장르·가수** 필터, 리스트/버튼 모드, 썸네일·난이도, 신청·대기열·Now Playing
- `/c/:slug/admin` — 운영: 신청 on/off, 중복 정책(허용/대기열만/부른 곡 포함), 대기열 재생/완료/거절·드래그 순서·비우기(세션 초기화)
- 테마: 다크 / 라이트 / 핑크 / 스카이

## Live MR Manager 연동

Manager 앱에서 Songbook에 로그인한 뒤 라이브러리를 채널로 **Push**합니다.

- 본인 채널만 대상. 없으면 `/api/me/channels`로 생성 유도
- 곡 메타: 제목·아티스트·장르·카테고리·태그·키·BPM·난이도·후원금액·썸네일
- 썸네일: `http(s)` URL 유지, 로컬 이미지는 JPEG data URL로 압축 업로드
- 기존 곡은 title+artist 키로 PATCH
- 로컬에 없는 원격 곡은 Push 시 `enabled=false`(공개 목록 숨김)
- 신청 대기열 순서는 `sort_order` — Manager 신청목록·웹 admin 드래그 → `POST .../queue/reorder`

구현 위치(Manager 리포): `src/js/songbook-sync.js`, `songbook-requests.js`, `songbook-thumbnail.js`, 데스크톱 OAuth/세션 스토어.

## Design

Live MR Manager 톤앤매너 + 브랜드 에셋(`public/icon-*.png`, `logo-on-*.webp`).

## Deploy

`main` 브랜치에 push하면 GitHub Actions가 자동으로 `npm run deploy`를 실행합니다 (`.github/workflows/deploy.yml`).

저장소 **Settings → Secrets and variables → Actions**에 아래 시크릿을 등록하세요.

| Secret | 설명 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare 대시보드 → **Edit Cloudflare Workers** 템플릿으로 생성한 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Workers 개요 페이지 URL의 계정 ID |

D1 마이그레이션은 자동 배포에 포함되지 않습니다. 스키마 변경 시 수동 실행:

```bash
npm run db:migrate:remote
```

최초 1회·로컬 수동 배포:

```bash
npx wrangler login
npx wrangler d1 create live-mr-songbook   # database_id → wrangler.toml (최초 1회)
npx wrangler secret put PLATFORM_ADMIN_TOKEN
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET
npm run db:migrate:remote
npm run deploy
```

프로덕션 콜백 URL을 Google/네이버 콘솔에 등록하세요.

## Roadmap

향후 작업·체크리스트는 [`TODO.md`](TODO.md)를 참고하세요.
