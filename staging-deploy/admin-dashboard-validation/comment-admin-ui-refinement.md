# Staging 댓글 신고 관리 UI 개선

로컬 구현/모의 통합 검증 완료. 실제 DB/SQL/서버 API/인증/환경변수/Production
변경 및 Commit/Push/배포 없음. 기존 댓글 활성화 상태는 변경하지 않았다.

## 변경

- 기존 메뉴 navigate에서 댓글 메뉴 진입/재진입 시 기존 admin 조회 API 호출.
  Refresh reports 제거. 폴링/구독/새 API 없음. 늦게 도착한 이전 조회 응답은 무시한다.
- 기존 관리자 언어 설정과 이벤트/translate 재사용. 댓글 전용 번역 키를 분리해
  다른 메뉴 번역은 유지한다. 상세 창의 미저장 메모도 언어 전환 시 보존한다.
- comment_exists/hidden/restricted_until/state 응답으로 버튼 결정. 숨김/복원,
  24시간 제재/해제는 각각 한 개만 표시. 만료된 제재는 제재 없음으로 표시한다.
  원본 삭제 시 숨김/복원 버튼 없음. 성공 후 재조회하며 실패 시 상태를 추정하지 않는다.
- Dismiss UI 제거. 기존 dismissed 데이터는 기각됨으로 그대로 표시한다.
  Reviewed는 초록 체크와 검토 완료, 미처리는 대기. 검토 완료 처리 버튼은 숨긴다.
- PC 목록 44px 목표 한 줄, 이름/댓글 말줄임, 12px 본문/10px 시각/11px 버튼.
  가로 90%를 사용한다. 상세 창 최대 1040px, 조밀한 메타데이터/메모/관리 이력.
  모바일은 행을 나눠 가로 넘침을 막고 주요 버튼 44px 높이를 유지한다.
- 공개 댓글 함수/클라이언트/인증/PoW 본문과 기존 공용 CSS 본문은 동일하게 유지한다.
  새 CSS는 관리자 영역/관리자 전용 상세 dialog에만 적용한다.

## 검증

PASS: 실제 로컬 Chromium 1440×1000, 390×844, 320×844. HTTP/Auth 응답은 모두
mock이며 실제 서비스 데이터 검증이 아니다. 최초/재진입 자동 조회, PC 40~48px
행 높이, 긴 원문/악성 HTML의 텍스트 표시, 가로 넘침 없음, 상태별 버튼 전환,
실패 시 기존 버튼 유지, Pending/Reviewed/중복 검토 버튼 숨김, 즉시 한영 전환,
상세 미저장 메모 유지, 기존 메뉴 이동 확인.

PASS: 기존 일반 댓글 PC/모바일 mock 회귀. 15/15/2 페이지, Guest/회원, 배지,
작성/삭제/신고/삭제 후 제한, 관리자 증거/메모 XSS 방어, 반복 게임 완료 유지.
기존 검사에서 제거된 버튼 선택자와 상세 상태 mock만 새 UI에 맞게 갱신했다.

PASS: Node Staging integrated/render 9개. 공개 의존성/build/초기화/경로/비공개
파일 차단. 공개 댓글 함수 본문/원래 CSS 접두부가 변경 전 클론과 일치함도 확인.
최종 잔여 FAIL 없음. SKIP: 실제 Staging 관리자 로그인/신고/제재/배포, DB 설치 검사.

## GitHub Desktop 선택 파일 (이번 작업 5개)

1. scripts/staging-comments.mjs
2. scripts/staging-media-ui.mjs
3. scripts/staging-admin-i18n.mjs
4. templates/staging-comments.css
5. staging-deploy/admin-dashboard-validation/comment-admin-ui-refinement.md

이 5개를 staging-render 클론에 동기화하고 SHA-256 일치를 확인한다.
로컬 검사 파일: scripts/check_staging_comment_admin.py(신규),
scripts/check_staging_comments.py(검사 갱신). 빌드 render-source의 런타임 4개도 동기화한다.
기존 Privacy Policy 변경/다른 미추적 파일은 이번 선택 목록에 포함하지 않는다.

후속: 사용자가 Commit/Push/배포 후 실제 활성 Staging 관리자 세션에서 메뉴 재진입,
언어 전환, 테스트 신고의 숨김/복원/제재/해제/검토 완료를 소수 건으로 확인한다.
운영자 이력은 보존되므로 실제 제재 테스트는 테스트 작성자에 한정한다.
