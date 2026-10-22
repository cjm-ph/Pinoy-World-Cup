# 댓글 시스템 최종 보완 — 회원 우승자 배지

판정: **회원 배지 로컬 구현 완료 / Staging DB 적용·활성화·배포는 승인 대기**.
056·057 원본, 통계 집계 함수/분모, 원본 과거 기록, profiles, 영구 삭제 차단을
수정하지 않았다. SQL 실행·Commit·Push·Render 배포·Production 변경 없음.

## 구현과 보안 경계

1. 브라우저는 게임 시작 당시 로그인 신원을 보관한다. outbox에는 재개용 UUID만
   저장하고 access token은 저장하지 않는다. 매 전송 시 같은 계정의 현재 세션 토큰만
   Authorization 헤더에 넣는다. 로그아웃/다른 계정 전환을 관찰한 기존 게임은
   회원 배지 대상에서 제외한다. 원래 Guest로 시작한 게임/기존 outbox는 나중에
   로그인해도 회원으로 바꾸지 않는다. 인증 준비 전 즉시 시작한 게임도 Guest로 취급한다.
2. 서버는 기존 Supabase auth.verify/getUser로 토큰을 검증하고 회원 UUID를 결정한다.
   요청 JSON의 actor/member_id/우승 이름/연결용 완료 ID는 받지 않는다.
   기존 서명된 통계 쿠키의 caller_hash도 그대로 검증한다. 유효하지 않은 인증은
   배지를 부여하지 않으며 기존 Guest 통계 수집을 계속한다.
3. 신규 service 전용 start wrapper가 기존 052의 전역 잠금을 함께 사용한다.
   원본 start RPC의 새 게임 생성과 새 play_member_links 기록은 한 트랜잭션이다.
   이미 있던 request_id/game은 절대 나중에 귀속하지 않는다. 회원이 바뀐 replay도
   기존 소유자를 바꾸지 않는다. 연결 시점에 comments_control의 두 플래그가 true인
   새 게임만 연결하므로 승인 전의 기록은 새 계정 정보 수집 대상으로 삼지 않는다.
4. events wrapper는 기존 대진 검증 RPC를 그대로 1회 호출한다. 토너먼트 → 게임 →
   연결 행 잠금 순서를 지킨다. 시작 회원과 인증 회원이 같고 검증한 sequence가
   이어질 때만 정상 완료를 연결한다. 다른 계정/로그아웃/누락된 인증 진행이 있으면
   배지 자격을 영구 해제하되 게임 집계는 기존대로 진행한다. 이미 끝난 게임의
   재전송은 회원 배지를 새로 만들거나 타인에게 옮기지 않는다.
5. 댓글은 동일 토너먼트에서 해당 회원의 verified_completed_at이 있는 정상 완료 중
   가장 최근 기록을 조회해 당시 revision의 실제 우승자 ID/이름을 고정 저장한다.
   회원에게는 Guest caller만으로 배지를 부여하지 않는다. 다른 기기에서도 같은
   회원으로 인증하면 자신의 검증된 기록을 사용할 수 있다.
6. Guest는 기존 검증 쿠키/완료 기록을 사용한다. 다만 새 회원 연결이 있는 게임은
   Guest 조회에서 제외해 로그아웃 후 회원 기록을 Guest 배지로 가져가지 못하게 한다.
   연결되지 않은 과거 기록을 회원 것으로 추정하거나 과거 댓글을 보정하지 않는다.

신규 표는 RLS 활성화, anon/authenticated/service_role 직접 접근 금지이며 새 RPC
2개는 service_role만 EXECUTE 가능하다. 배지 조회 helper도 API 역할 실행을 금지한다.
기존 댓글 service RPC는 056의 검토된 body MD5가 일치할 때만 교체하고 배지 조회
구간만 바꾼다. 120초 제한·삭제·신고·관리자 본문은 동일하다. 새 연결 표의 FK는
미래 purge 검토 대상이며 기존 영구 삭제 차단은 유지한다.

## SQL 및 실행 순서

새 migration 전체 경로:
`C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\058_staging_member_champion_badges_NOT_RUN.sql`

새 읽기 전용 검증 전체 경로:
`C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\059_staging_member_champion_badges_verify_READONLY_NOT_RUN.sql`

기존 파일:
`C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\056_staging_comments_NOT_RUN.sql`
`C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\057_staging_comments_verify_READONLY_NOT_RUN.sql`

최종 순서(사용자 수동 실행):

1. Staging cmnomqsurdwhdbjgnsvw 독립 확인 → 057-A → 승인된 056 COPY → 057-B.
   이미 056·057 검증이 끝났다면 재실행하지 않고 다음 단계로 간다.
2. 059-A: reviewed_056=true, play_member_links=NULL, purge=false. 원본 start/events/
   stats_candidates 해시·ACL과 sessions/completions/matches 수를 저장한다.
3. 058 COPY의 BEGIN 직후 주석에 적힌 프로젝트/승인 SET LOCAL 두 줄을 추가해
   1회 적용한다. 함수 해시가 다르거나 객체가 이미 있거나 권한 오류면 ROLLBACK 후 중단한다.
   자동 재실행/056 재설치/해시 조건 완화는 하지 않는다.
4. 059-B: helper_updated=true, initial_links=0, RLS=true, 직접 표 권한 모두 false,
   새 wrapper만 service_execute=true/helper는 모두 false, invalid_verified_links=0,
   원본 함수 해시·ACL 불변, purge=false. 설치만으로 과거 수치가 변하면 중단한다.
   A/B 사이 실제 플레이가 있었다면 그 증가와 구분한다.
5. 기존 두 comments_control 플래그와 Render의 PWC_STAGING_COMMENTS opt-in을
   유지한다. 새 환경 변수/비밀키는 없다. **058 검증 전에는 댓글 opt-in을 켜지 않는다.**
   SQL/정책 검토 및 적용 확인 후 별도 승인된 Staging 배포 절차로 진행한다.
6. 실제 HTTPS에서 A 완주/댓글 → 최신 우승자, B 전환 → A 배지 없음,
   로그아웃 Guest → 회원 배지 없음, 별도 Guest 완주 → Guest 배지 확인.
   기존 수집은 비동기이므로 완료 기록이 서버에 도착한 뒤 확인한다.

## 검증 결과

- PASS: 신규 SQL 집중 검사 1개. 회원 A 완료·최신 완료·이전 댓글 이름 고정,
  B 도용/요청 replay/계정 전환 차단, 로그아웃 Guest 차단, Guest 완료 유지,
  미완주 제외, 다른 브라우저 회원 조회, 다른 caller 차단, 인증 sequence 누락 제외.
- PASS: 적용 전후 기존 세션 JSON 및 원본 start/events 정의 불변. 실제 기존 054
  집계/공개 조회 응답이 설치 전후 동일. 격리 fixture 8개 게임/정상 완료 7/대결 21,
  후보 참가 합계 42/우승 합계 7, 후보 a 우승률 71.43% 및 완료 참가 분모 7 유지.
  중복 완료 요청 후 값 불변. RLS/EXECUTE 신규 경계와 059-B 조회 구문도 확인.
- PASS: 신규 HTTP 집중 검사 1개. UUID/우승 이름/완료 ID 위조 필드 무시,
  검증된 토큰에서만 A/B 결정, Guest·만료 토큰에는 actor=NULL,
  다른 Origin/변조 통계 쿠키 차단. 기존 HTTP 영향 검사 2개 PASS.
- PASS: 신규 collector 검사 2개 및 기존 영향 검사 3개. 시작 신원 고정,
  A→B→A·로그아웃 이후 배지 대상 해제, Guest/과거 큐 소급 귀속 없음,
  같은 계정 새로고침 시 새 토큰 사용, outbox에 토큰 없음, 기존 재시도/순서 유지.
- PASS: PC 1440×1000·모바일 390×844 실제 브라우저/모의 API. 악성 우승 이름을
  Rankings·우승 화면 댓글에 그대로 일반 텍스트 표시, 링크/HTML/스크립트 실행 없음.
  실제 4강 게임 종료/기존 우승 화면 동작 유지.
- PASS: 기존 댓글 본문을 교체하므로 056 기반 SQL 댓글 집중 검사 3개도 영향 범위로 확인했다.
  기존 전체 사진/FK/RLS/통계 수집 suite는 반복하지 않는다.
- PASS: 클론의 신규 HTTP/collector 검사 3개, 서버 composition 검사 1개,
  Git diff --check. 보호 대상 16개 및 클론 동기화 26개 파일 해시 일치.
  최종 미해결 FAIL 없음.
- SKIP: 실제 Staging DB·OAuth·Render·실데이터 검증. 자동 정리/예약 작업 없음.

## 변경 파일

원본 수정 전체 경로:

- `C:\Users\fkrns\OneDrive\Desktop\ai\scripts\staging-play-collector.mjs`
- `C:\Users\fkrns\OneDrive\Desktop\ai\scripts\staging-play-statistics.mjs`
- `C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\server\play-statistics.mjs`
- `C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\server\staging-start.mjs`
- `C:\Users\fkrns\OneDrive\Desktop\ai\staging-deploy\admin-dashboard-validation\comments-implementation.md`
- `C:\Users\fkrns\OneDrive\Desktop\ai\scripts\sync_staging_comments.py`

신규 파일은 위 058·059, 이 보고서와 다음 검사다:

- `C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\server\test\member-badges-sql.test.mjs`
- `C:\Users\fkrns\OneDrive\Desktop\ai\db_design\v41b_media_prep\server\test\member-badges-http.test.mjs`
- `C:\Users\fkrns\OneDrive\Desktop\ai\scripts\staging-member-badges.test.mjs`
- `C:\Users\fkrns\OneDrive\Desktop\ai\scripts\check_staging_member_badges.py`

Staging 클론은 기존 댓글 manifest를 확장해 총 26개 파일을 동일 SHA-256으로
동기화했다. 서버 원본은 clone의 server/gateway 경로에 대응한다. 새 SQL/보고서와
Node HTTP/collector 검사도 포함하며 공개 allowlist에는 테스트·SQL을 넣지 않는다.
최종 증거는 comments-clone-sha256.json. 기존 056/057 및 사진·우승·Gemini·통계
표시 정렬·SQL 050~055는 이전 클론과 해시로 비교한다.

## 승인 사항·남은 운영 위험

- 이번 개발의 회원 배지 미완료 항목은 없다. 실제 적용/배포 확인은 별도 단계다.
- 새 표는 미래 게임과 회원 UUID의 연결을 보관한다. 기본적으로 원본 play_sessions와
  같은 수명으로 유지하며 자동 정리는 만들지 않았다. 이 연결 정보의 수집/보존 정책은
  Staging 활성화 전에 사용자 검토가 필요하다. 신고 90일 보존 정책안은 그대로다.
- 자동 정리 작업은 승인 전 활성화하지 않는다. 056의 수동 유지보수와 봇 방어 한계는
  기존 보고서를 따른다. 유료 서비스/추가 패키지/새 외부 계정 도입 없음.
- 인증 일시 장애·초기 인증 준비 전 시작·토큰 만료·계정 전환·이전 배포 경로에서
  진행된 sequence가 끼면 배지가 생략될 수 있다. 오류를 추정 귀속으로 보정하지 않는다.
  게임은 계속되며 기존 정상 통계 수집 경로를 사용한다.
- 완료 수집이 댓글보다 늦으면 그 댓글에는 당시 서버에서 검증된 최근 기록만
  저장한다. 이후 댓글 배지를 소급 변경하지 않는다. 인증 추가 조회로 통계 전송 지연이
  늘 수 있지만 게임 화면은 기다리지 않는다. 실제 HTTPS/OAuth 지연은 후속 확인 대상이다.
