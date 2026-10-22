# Staging 댓글 통합 구현

회원 우승 배지 최종 보완: [member-champion-badges.md](member-champion-badges.md).
아래는 056 단계 구현·검증 이력이다. 회원 배지는 후속 058에서 완성했으며,
최종 실행 순서는 057-A → 056 → 057-B → 059-A → 058 → 059-B이다.
056·057 원본은 변경하지 않았고 자동 적용/활성화/배포는 여전히 하지 않는다.

판정: **로컬 구현 완료 / 실제 활성화·배포 BLOCKED — 사용자 SQL·정책 검토 대기**.
실제 Staging·Production DB, Storage, 기존 기록을 변경하지 않았다.
Commit·Push·Render 배포도 하지 않았다. 영구 삭제 차단은 그대로다.

## 완료한 기능

- 우승 화면/Rankings의 동일 토너먼트 댓글 서비스. PC·모바일, 최신순
  `(created_at,id)` 커서로 서버 15개씩 조회, 마지막 Load More 숨김, 성공 시 prepend.
- 기존 Google 회원 ID·profiles.display_name 재사용, Guest 고정 이름.
  기존 회원가입/인증 코드는 수정하지 않았다.
- NFC 정규화 후 Unicode 코드 포인트 100개. 공백 포함, 일반 emoji 1개,
  ZWJ 가족/국기/피부색 조합은 여러 코드 포인트로 계산한다. 브라우저/Node/SQL이
  같은 기준을 쓰며 `0 / 100` 표시. 사용자 입력은 모든 화면에서 textContent/value.
- 검증된 Guest 통계 쿠키 → 동일 토너먼트의 최신 정상 완료 기록 → 당시 revision의
  우승 이름만 댓글 작성 시 고정. 브라우저가 보내는 임의 우승 ID/이름을 사용하지 않는다.
- 사이트 전체 120초 작성 제한, 회원 UUID·서명 Guest 브라우저 쿠키의 비공개 HMAC
  식별자, 로그인/로그아웃 시 브라우저 제한 유지. DB 잠금으로 프로세스/탭 간 직렬화.
  삭제해도 대기 유지. 동일 내용 24시간 제한, 서명 요청/해시 receipt로 재전송 방지.
- 본인 Delete 즉시 처리·확인창 없음. 새 댓글 테이블의 원본만 물리 삭제.
  미신고 원문 별도 보관 없음. 신고 증거는 원본 FK 없이 독립 보관.
- 원클릭 신고, 같은 작성자/댓글 중복 신고 방지, 본인 신고도 동일 검증 적용.
  신고 수만으로 자동 삭제/제재하지 않는다.
- 관리자 기존 로그인/active admin_members 검증 재사용. 신고 목록/상세/원문,
  검토·기각·숨김·복원·24시간 제한·제한 해제·메모·처리 이력.
  회원 제재는 UUID 기준이고 당시 브라우저에도 적용한다. 삭제 원문은 복원 불가.
- 서버에서 URL·도메인·연락처·SNS·광고/도박·대표 EN/Filipino 욕설·협박·반복 패턴
  검사. 공백/일부 특수문자/일반 leet 우회 검사. 규칙은 별도 server-only 모듈.
- 새 표/함수 최소 권한, 직접 API 역할의 표 접근 차단, service 전용 RPC,
  공개 응답에 회원 ID/비공개 식별자 없음. 공개·비공개·휴지통 접근 검사 유지.
- 정확한 Origin/JSON 검증, HttpOnly/Secure/SameSite 쿠키, 본인 소유권/관리자 재검증,
  서버 생성 요청 ID와 PoW, 요청 크기·시간·동시 수·요청률 제한. 비밀키는 기존
  서버 환경 변수만 사용하며 공개 모듈/DB에 원본 쿠키 비밀을 저장하지 않는다.
- 모바일 카드만 오른쪽 7px 유지·하단 6px·글자 사이 시각 간격 축소,
  44px 터치 영역 유지. PC 및 사진·제목·그라데이션 유지.

## 미완료 또는 보장하지 않는 부분

- **056 단독 설치 시 회원 배지 없음:** 후속 058과 인증 헤더 연동에서 완성했다.
  기존 play_sessions·집계 공식은 유지하고 새 게임의 검증된 회원 연결만 별도 보관한다.
- 실제 SQL 적용, 실서비스 OAuth/쿠키/관리자/모바일 확인은 미실행이다.
- 단어 규칙이 모든 언어·우회·광고 의미를 완벽히 판정하지는 못한다. 운영자 규칙
  검토가 필요하다. PoW는 봇 억제 수단이며 사람 인증이 아니다. 새 브라우저/쿠키 삭제로
  Guest 신원이 새로 생기는 한계가 남는다. 외부 CAPTCHA는 도입하지 않았다.
- IP는 1분 요청 admission에만 사용하고 소유권/120초 식별자로 사용하지 않는다.
  Render 프록시 뒤 socket 주소가 공유되면 180회/분 제한을 여러 사람이 공유할 수 있다.
  신뢰할 수 없는 X-Forwarded-For로 우회하지 않았다. 활성화 전 실제 트래픽 검토 필요.
- 전역 DB 제한은 수락된 post/report 합계 90회/분, 신원별 신규 신고 20회/시간이다.
  댓글 전체 50,000개/토너먼트 5,000개, 신고 100,000개에서 추가 수락을 중단한다.
  이 한도에 도달하면 운영자 점검이 필요하며 기존 자료를 자동 삭제하지 않는다.
- JSON API에는 엄격 CSP/nosniff 적용. 기존 사이트 전체 CSP 강제는 기존 inline
  게임 핸들러에 영향을 주므로 이번에 변경하지 않았다. 새 댓글 DOM에는 HTML 삽입 없음.
- 공개 댓글은 작성자 삭제/관리자 숨김까지 유지한다. 신고 증거·제재 이력 90일,
  기술 receipt 24시간, 만료된 제한 메타데이터 7일 보존을 기본안으로 제시한다.
  receipt는 원문/댓글 ID/토너먼트 ID 없는 SHA-256 재전송·중복 방지 자료이며
  삭제 원문의 별도 보관이 아니다. 해시는 개인정보 관점에서 비공개 관리 대상이다.
  보존 정책과 정기 유지보수 책임자는 사용자 승인이 필요하다.

## DB 변경과 안전 경계

신규 migration:
`C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\056_staging_comments_NOT_RUN.sql`

읽기 전용 검증:
`C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\057_staging_comments_verify_READONLY_NOT_RUN.sql`

새 테이블 6개와 새 함수만 만든다. 041~055/기존 보호 함수/통계 원본/Storage 권한은
변경하지 않는다. 기본 enabled=false, policy_reviewed=false. DB 설치만으로 열리지 않으며
Render도 `PWC_STAGING_COMMENTS=enabled`가 있어야 제공한다. 둘 다 기본 off다.
댓글 원본의 tournaments FK는 미래 purge 검토 대상이며 기존 영구 삭제 차단을 우회하지 않는다.

유지보수 함수 `pwc41_api.comments_maintenance(actor uuid)`는 service 전용이며
매 호출 active 관리자 UUID를 검증한다. 만료된 **신규** 신고/이력/receipt/제한 메타데이터만
정리한다. HTTP 유지보수 endpoint·예약 작업·자동 SQL 실행은 만들지 않았다.
운영자가 신뢰된 서버 작업에서 일 1회 실행하는 방식을 승인·준비해야 한다.
그 전에는 90일이 지나도 물리 삭제가 자동으로 수행된다고 안내해서는 안 된다.

## 검증

- PASS: 신규 Node 5개 — 격리 PGlite SQL 3개, 서버 정책/실제 HTTP 2개.
  기본 비활성, RLS/EXECUTE/IDOR/CSRF, 중복·전역 대기, 회원 전환, Guest 소유권,
  제재, 원문 삭제 후 증거/신고 재시도, 만료 receipt 재삽입 거부, 공개 범위/커서 검증.
- PASS: 별도 로컬 PostgreSQL 18.4 동시성 1개 — 서로 다른 연결에서 토너먼트 간
  동시 작성 1건만 수락, 신고/삭제 경쟁, 대기 중 관리자 active 권한 회수.
- PASS: PC 1440×1000/모바일 390×844 모의 브라우저 — 15/15/2 목록, Guest·회원,
  배지/미표시, 계수, 삭제 후 대기, 직접 신고한 악성 HTML 원문·닉네임·관리자 메모의
  텍스트 출력, 링크/이미지/스크립트 실행 없음, 관리자 검토·제한, 게임 반복 완료.
- PASS: 320/390/767px 메뉴 하단 6px/오른쪽 7px/44px 터치/잘림·제목 겹침 없음.
  1440px 변경 전 PC 디자인 동일. 사진/제목/그라데이션 및 세 버튼 동작 유지.
- PASS: 기존 사진 PC·모바일 — Fit/Fill·zoom·drag·같은 asset 저장·실제 대결/우승·
  대표 사진. 업로드 0건. 통계 PC·모바일 — 정렬/분모/관리자 필터/페이지/우승 진입 유지.
- PASS: 기존 HTTP 회귀 8개, 공개 build/초기화/경로/비공개 파일 검사 13개.
  추가 댓글 Retry 때문에 생긴 테스트 선택자 충돌은 통계 영역으로 한정해 수정했다.
  SQL 검토 파일을 public 밖에서 버전 관리하는 기존 구조에 맞춰 packaging 검사도 보정했다.
- SKIP: 실제 DB·Storage·배포·OAuth 검증. 기존 FK/RLS/통계 수집 전체 suite 재실행 안 함.
  위 RLS 검사는 새 댓글 테이블만 대상이다. 최종 미해결 FAIL 없음.
- PASS: 057-B SELECT 8개를 격리 DB에서 실행해 구문·조회 가능 여부 확인.
  Staging 클론 18개 파일 SHA-256 일치, 클론의 HTTP/정책 테스트 2개 PASS,
  Git diff --check 오류 없음. 보호 대상 14개(050~055·collector·통계 API·사진·우승
  bridge·Gemini·표시 정렬·purge 서버)도 기존 클론과 해시 일치.

## 변경 파일 / GitHub Desktop 예상 목록

Staging 클론 동기화 대상 18개(상세 해시는 comments-clone-sha256.json):

- 신규 SQL 056/057 및 이 보고서.
- 신규 `scripts/staging-comments.mjs`, `scripts/comment-text-policy.mjs`,
  `scripts/comment-proof-worker.mjs`, `templates/staging-comments.css`.
- 수정 `scripts/staging-adapter-bootstrap.js`, `scripts/staging-media-ui.mjs`,
  `scripts/staging-statistics-ui.mjs`, `templates/staging-play-statistics.css`.
- 신규 `server/gateway/comments.mjs`, `server/gateway/comment-policy.mjs`,
  `server/gateway/test/comments-http.test.mjs`.
- 수정 `server/gateway/http.mjs`, `server/gateway/staging-start.mjs`,
  `staging-deploy/public-files.mjs`, `staging-deploy/render-server.mjs`.

로컬 전용: 원본 server/test/comments-{sql,http,native}.test.mjs,
server/test/support/comment-fixture.mjs, scripts/check_staging_comments.py,
scripts/check_staging_mobile_card_actions.py, scripts/check_staging_play_statistics.py,
scripts/sync_staging_comments.py, staging-deploy/prepare-render.mjs,
staging-deploy/{prepare,render}.test.mjs 및 SHA-256 증거 JSON.
기존 클론의 미추적 championship 보고서·정책 테스트는 이번 작업에 포함하지 않았다.

## 승인 후 진행 순서 / 중단 조건

1. 사용자가 **Staging cmnomqsurdwhdbjgnsvw**를 독립 확인하고 057-A 실행.
   새 표가 이미 있거나 profiles/admin 계약·프로젝트가 다르면 중단한다.
2. SQL·90일 신고 보존·24시간 receipt·제한/PoW 정책·유지보수 책임 검토 승인.
3. 사용자 실행 COPY의 BEGIN 직후 056 주석의 프로젝트/승인 SET LOCAL 두 줄을
   넣어 056을 1회 적용. 오류면 ROLLBACK 후 원인을 확인하고 재실행 여부를 검토한다.
4. 057-B: 두 플래그 false, retention 90, 새 표 0행, 6개 RLS true,
   직접 표 접근 모두 false, 공개·인증 역할 RPC EXECUTE false,
   service 역할만 4개 API EXECUTE true, purge false 확인.
   차이가 있으면 활성화/Commit/배포를 중단한다. 041~055는 재실행하지 않는다.
5. 사용자가 결과를 확인한 후 별도 승인으로 staging-render 변경만 Commit/Push/배포.
   정책/유지보수 준비 뒤 DB control의 enabled·policy_reviewed와 Render opt-in을
   사용자 통제하에 활성화한다. 이 보고서는 활성화 SQL을 자동 실행하지 않는다.
6. 실제 HTTPS PC/모바일에서 Guest/회원 작성·120초 전역 제한·삭제·신고·관리자
   증거/제재/비공개 차단·우승/Rankings 공유·게임 진행을 최소 확인.
   DB/서비스 오류·권한 누출·쿠키 실패·성능 이상이면 opt-in을 끄고 원문/증거는 보존한다.

추가 패키지/유료 외부 서비스/새 비밀키 설정은 없다. PoW는 기기 CPU를 사용하며
최대 45초 후 실패 안내를 한다. 실제 저사양 모바일 처리 시간은 배포 전 확인 대상이다.
