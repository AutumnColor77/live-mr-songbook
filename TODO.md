# Live MR Songbook — TODO

프로젝트 로드맵 체크리스트입니다. 완료 `[x]`, 예정 `[ ]`.

## 1. 인증·계정

- [x] Google OAuth (세션 쿠키, SPA exchange)
- [x] Naver OAuth
- [x] 프로필 설정(`/me/setup` 선택·`/me`에서 수정) — 웹 강제 게이트 없음(데스크톱 Manager는 setup 유지)
- [x] 아바타 압축 업로드(data URL 상한)
- [x] 데스크톱 Manager deep-link 로그인·세션 핸드오프
- [x] 시청자 선택 로그인(`/c/:slug`·홈 `/` 복귀, 닉네임 프리필)
- [x] 시청자 홈 디렉터리(`GET /api/directory/channels`, 정사각 카드·소유자 프로필)
- [x] demo 채널 제거(`migrations/0014_delete_demo.sql`)
- [ ] 시청자 신청 이력·`requests.user_id` 연동

## 2. 채널·권한

- [x] `channel_members` + 세션 기반 채널 admin
- [x] `/me`에서 채널 생성(계정당 1개, slug 자동/직접)
- [x] 채널 이름·슬러그 PATCH
- [ ] 채널 멤버 초대·역할 관리
- [ ] 채널 삭제·이전

## 3. 곡·시청자 UI

- [x] 시청자 검색·신청·대기열·Now Playing
- [x] 리스트 / 버튼 뷰 모드(선택 저장)
- [x] DB 기반 장르·가수 필터(접이식)
- [x] 썸네일·난이도(★) 표시
- [x] 테마(다크/라이트/핑크/스카이)
- [x] 운영 admin 대기열 드래그 순서(`sort_order`)
- [ ] 웹 관리자용 곡 CRUD UI(현재는 API + Manager Push)
- [ ] 정렬 옵션(제목 외 최신·난이도 등)

## 4. Manager 연동

- [x] Push 동기화(신규 POST / 기존 PATCH)
- [x] 장르·카테고리·태그·키·BPM·난이도 전송
- [x] 썸네일 http(s) + 로컬→JPEG data URL
- [x] Push 시 로컬에 없는 곡 `enabled=false`(웹 숨김)
- [x] 대기열 `sort_order` + `POST /admin/queue/reorder` (앱·웹 운영 드래그 동기화)
- [ ] Pull(Songbook → Manager 라이브러리)
- [ ] 원격 hard-delete·ID 기반 양방향 정합
- [x] 썸네일 KV(`/api/media/thumbs/...`)로 data URL 부담 완화 (R2는 계정 활성화 후 이전 가능)
- [ ] Companion 링크·프로모 UX 고도화

## 5. 실시간·인프라

- [x] 신청 대기열 폴링(공개 `/queue` · admin 목록) — WebSocket은 미도입
- [x] 공개 신청·ingest rate limit + 6시간 cron 유지보수(세션/요청 이력 purge·썸네일 마이그레이션)
- [ ] 대기열 WebSocket / Durable Objects
- [ ] 치지직 채팅·후원 세션용 Durable Object(`ChzzkSessionDO`) — [docs/chzzk-paid-requests.md](docs/chzzk-paid-requests.md)
- [ ] 커스텀 도메인
- [ ] 관측성(로그·에러 알림)·헬스 대시보드

## 6. 품질·문서

- [x] D1 마이그레이션·`npm run deploy` 파이프라인
- [x] README를 현재 기능에 맞게 정리
- [x] 치지직 채팅·도네 신청 설계 메모 ([docs/chzzk-paid-requests.md](docs/chzzk-paid-requests.md))
- [ ] API/E2E 테스트 최소 세트
- [ ] README·API 표를 코드와 주기적으로 맞추기

## 7. 치지직 채팅·도네 신청곡

설계: [docs/chzzk-paid-requests.md](docs/chzzk-paid-requests.md) · 실시간 연동: [docs/chzzk-realtime-integration.md](docs/chzzk-realtime-integration.md)  
방향: 공식 Session **채팅(무료) + 도네(유료)** + `!신청 가수-제목` DB 매칭. 결제 대행은 하지 않음. 짧은 checkout 코드는 쓰지 않음.

- [x] 가격/`request_mode`/`request_command_prefix` 설정·`requests.pay_amount`·`donation_ref`/`chat_message_ref` 스키마
- [x] 명령 파서 + 곡(artist/title) 매칭 + 시청자 복붙 모달 + 운영 가격·모드 설정
- [x] (검증용) `chzzk/ingest` 수동·호스트 확인으로 플로우 먼저 검증
- [x] 치지직 OAuth 연결(후원·채팅 관련 Scope) + 토큰 보관 — 골격 ([docs/chzzk-realtime-integration.md](docs/chzzk-realtime-integration.md); 앱 시크릿·E2E는 사용자)
- [x] ChzzkSessionDO 도네·채팅 구독 → ingest — 골격 (실소켓 검증 필요)
- [ ] 유료 전용 모드·동명곡/하이픈 표기 옵션 등 고도화
