# Live MR Songbook — TODO

프로젝트 로드맵 체크리스트입니다. 완료 `[x]`, 예정 `[ ]`.

## 1. 인증·계정

- [x] Google OAuth (세션 쿠키, SPA exchange)
- [x] Naver OAuth
- [x] 프로필 최초 설정(`/me/setup`)·이후 수정(`/me`)
- [x] 아바타 압축 업로드(data URL 상한)
- [x] 데스크톱 Manager deep-link 로그인·세션 핸드오프
- [ ] 시청자용 계정 로그인(신청 이력·닉네임 연동 등) — 필요 시

## 2. 채널·권한

- [x] `channel_members` + 세션 기반 채널 admin
- [x] `/me`에서 채널 생성(계정당 1개, slug 자동/직접)
- [x] 채널 이름·슬러그 PATCH
- [x] demo 멤버십 자동 합류(체험용)
- [ ] 채널 멤버 초대·역할 관리(비-demo)
- [ ] 채널 삭제·이전
- [ ] 데모와 본채널 UX/권한 분리 점검

## 3. 곡·시청자 UI

- [x] 시청자 검색·신청·대기열·Now Playing
- [x] 리스트 / 버튼 뷰 모드(선택 저장)
- [x] DB 기반 장르·가수 필터(접이식)
- [x] 썸네일·난이도(★) 표시
- [x] 테마(다크/라이트/핑크/스카이)
- [ ] 웹 관리자용 곡 CRUD UI(현재는 API + Manager Push)
- [ ] 정렬 옵션(제목 외 최신·난이도 등)

## 4. Manager 연동

- [x] Push 동기화(신규 POST / 기존 PATCH)
- [x] 장르·카테고리·태그·키·BPM·난이도 전송
- [x] 썸네일 http(s) + 로컬→JPEG data URL
- [ ] Pull(Songbook → Manager 라이브러리)
- [ ] 원격에만 있는 곡 삭제/정합 정책
- [ ] 썸네일 R2(또는 동등 오브젝트 스토리지)로 data URL 부담 완화
- [ ] Companion 링크·프로모 UX 고도화

## 5. 실시간·인프라

- [ ] 대기열 WebSocket / Durable Objects
- [ ] 커스텀 도메인
- [ ] 관측성(로그·에러 알림)·헬스 대시보드

## 6. 품질·문서

- [x] D1 마이그레이션·`npm run deploy` 파이프라인
- [x] README를 현재 기능에 맞게 정리
- [ ] API/E2E 테스트 최소 세트
- [ ] README·API 표를 코드와 주기적으로 맞추기
