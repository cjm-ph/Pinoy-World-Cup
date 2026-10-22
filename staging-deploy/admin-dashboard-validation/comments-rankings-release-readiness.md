# Staging 댓글·회원 배지·Rankings 통합 배포 준비

2026-10-23 / 브랜치 staging-render. 사용자가 056~059 설치 및 최종 059-B
검증 완료를 확인했다. 이번 작업에서는 DB 연결/SQL 실행/구조 변경을 하지 않았다.
댓글 DB 플래그와 Render opt-in은 변경하지 않았다. 댓글·회원 배지는 배포 후에도
기존 설정이 비활성화인 동안 열리지 않는다. Production 및 영구 삭제 BLOCKED 유지.

## 구현 완료

- 기존 댓글/회원 배지 구현을 재사용한다. 정상 완주 여부는 배지에만 사용하며
  미완주 Guest/회원도 활성화 이후 댓글을 작성할 수 있는 기존 경로를 유지한다.
- 제목 `Rankings - [실제 토너먼트 이름]`, 중복 부제/누적 범위/공식 설명 제거.
  로딩·실패·재시도 안내는 유지하고 정상 조회에서는 설명 영역을 접는다.
- 회원 Rankings의 분홍 비율·막대 아래 `Played completed_participations / Won titles`,
  주황 비율·막대 아래 `Matches appearances / Wins wins`를 표시한다.
  API 값을 그대로 사용하고 승률·정렬·관리자 KPI·필터는 변경하지 않는다.
  실제 0과 누락된 필드(—)를 구분한다. 관리자 표는 기존 모양을 유지한다.
- 상단/순위 목록 앞 `data-ad-slot=rankings-top` 예약 영역. 미설정 상태에서는
  hidden/empty로 접혀 여백이 생기지 않는다. 나중에 연결할 때 PC 최대 468×60,
  모바일 최대 320×100 및 상하 20px 간격. 광고 SDK/AdSense/유도 문구 없음.
- Play Now/Home/Share/Comments/Close, 순위 페이지·Rank History,
  기존 게임·사진 설정·회원 인증·관리자 기능을 보존한다.

## 검증

- PASS: Node 서버 6개 — 기존 댓글·회원 배지·통계 HTTP 방어와 신규 disabled gate.
  댓글 off에서는 GET/POST 503, auth/RPC 실행 0, 신규 쿠키 발급 0.
  인증 실패 시 회원 배지를 부여하지 않고 기존 통계 RPC 경로는 계속 호출한다.
- PASS: Node collector/표시 정책 7개 — 시작/대결/완료 큐·재시도, 회원/Guest 전환,
  토큰 미저장, 기존 정확한 1:1 승률 정렬과 페이지/미산정/0 구분.
- PASS: 1440×1000·390×844 모의 브라우저 통합. 새 제목/수치/빈 값,
  광고 접힘 및 연결 시 크기·위치, 댓글 off 작성 금지, 기존 실제 게임 4강
  시작 1·대결 3·완료, Play Now만으로 집계 안 됨, 우승 후 통계 진입,
  관리자 로그인·기간·언어·상세/요약·오류/권한 거부, 카드 Details/Share.
- PASS: 기존 댓글/관리자 UI는 격리 mock으로 작성/삭제/신고/배지/제재 흐름을 확인했다.
  실제 사이트 댓글을 켜서 시험하지 않는다.
- PASS: 공개 build·초기화·기존 사진 overlay·Render 경로·비공개 파일 검사 9개.
  최종 미해결 FAIL 없음.
- 056~059 DB 검증은 반복하지 않는다. 과거 SQL/통계 집계 원본 수정 없음.
- 실제 OAuth/Render 배포 후 확인은 SKIP. 실제 서비스 연결을 사용하는 시험은 없다.

## 파일 및 Commit 범위

이번 UI 변경: `scripts/staging-statistics-ui.mjs`,
`templates/staging-play-statistics.css`.
추가/수정 검사: `server/gateway/test/comments-http.test.mjs`
(원본 db_design/v41b_media_prep/server/test), 로컬 `scripts/check_staging_play_statistics.py`.
로컬 manifest 도구: `scripts/sync_staging_comments.py`.

Commit에는 기존 댓글·회원 배지 준비 파일과 이 보고서를 포함한 명시적 27개
manifest만 포함한다. 클론의 기존 미추적 championship 정책 테스트/과거 통계
보고서·임시 로그·비밀정보는 포함하지 않는다. SQL 056~059는 설치 이력 검토용
원본 파일로 버전 관리하며 배포 도구가 실행하거나 공개 파일로 복사하지 않는다.
서버 원본은 clone의 server/gateway 경로에 대응한다.

Commit 대상 전체 목록과 SHA-256은 로컬 comments-clone-sha256.json에 기록한다.
로컬 합성 캡처/테스트 데이터는 실제 Staging 수치가 아니며 Commit 대상이 아니다.

## 다음 단계

사용자가 Commit을 검토하고 별도 Push/Render Staging 배포를 승인한다.
DB/환경 변수 변경 및 SQL 재실행은 필요하지 않다. 배포 후 실제 PC/모바일
Rankings 수치/정렬/버튼과 댓글 비활성 안내만 확인한다.
댓글 활성화·회원 연결 보존 정책·신고 90일 및 유지보수/CAPTCHA 결정은 별도 승인이다.
자동 정리/유료 서비스·광고는 활성화하지 않았다. 인증/완료 수집 지연으로 배지가
생략될 수 있는 기존 안전 동작과 Guest 쿠키 재생성 한계는 이전 보고서를 따른다.
