# Staging Privacy Policy

2026-10-23. Staging 초안 구현 완료. **일반 공개용 완료 판정은 BLOCKED**:
개인정보 문의 이메일과 보존 절차가 최종 확정되지 않았다.

사용자가 제공한 영어 원문의 12개 항목을 요약·생략 없이 privacy.html에 반영했다.
문의 이메일은 원문의 `To be announced before public launch.`를 유지하며 실제
이메일이나 mailto 링크를 추가하지 않았다. 별도 Staging 초안 안내와 noindex,
nofollow를 추가했다. noindex는 접근 통제 기능이 아니며 배포하면 페이지는 접근 가능하다.

기존 홈의 실제 `homeBrand` 텍스트 로고와 세 가지 기존 홈 스타일을 재사용한다.
새 로고·아이콘은 만들지 않았다. 전체 로고/사이트명과 Back to Home은 홈으로 연결한다.
로그인 버튼 옆 링크는 44px 높이의 클릭 영역을 가지며 기존 로그인 버튼 위치를 유지한다.

Staging 배포 대상 5개:

- privacy.html (신규)
- templates/staging-privacy.css (신규)
- index_staging_integrated.html (링크·스타일 연결만 변경)
- staging-deploy/public-files.mjs (위 페이지·CSS를 Staging 공개 allowlist에 추가)
- 이 보고서 (비공개 검토용)

로컬 검사: scripts/check_staging_privacy.py. 빌드용 render-source에도 런타임
4개를 동일하게 반영한다. Production용 index.html은 변경하지 않는다.

PASS: 오프라인 실제 Chromium, 1440×1000 / 390×844 / 320×844.
Privacy Policy 링크, 전체 로고/사이트명 및 Back to Home 이동, 12개 항목/23개
목록 항목, 날짜·보존·미확정 연락처, 가로 넘침 없음, 로그인 버튼 위치 불변.
기존 Rankings 진입과 모의 4강 시작·대결 3회·완료 흐름을 함께 확인했다.
모든 외부 요청은 차단/모의 처리했으며 실제 통계나 DB를 생성하지 않았다.

PASS: Staging integrated/render Node 검사 9개. 공개 의존성·빌드·모듈 순서·경로·
비공개 파일 차단 검사. 최종 잔여 FAIL 없음.

SKIP: 실제 Google OAuth, 실제 Staging 배포 후 확인. 기존 인증·게임·통계·댓글·
관리자 로직, SQL, 환경변수는 변경하지 않았다. Commit/Push/인증/배포도 하지 않았다.

사용자는 GitHub Desktop에서 이 5개 파일만 검토할 수 있다. 기존의 무관한 미추적
파일은 포함하지 않는다. Staging 초안 검토용 준비이며 Production 공개 승인과 다르다.
공개 전 문의 연락처와 실제 90일 유지보수 실행 책임/절차를 확정하고 정책 원문에 대한
최종 승인을 받아야 한다. 이번 작업은 해당 절차를 활성화하거나 법률 적합성을 검증하지 않는다.
