# Staging 통계 UI/UX 최종 통합

판정: **Staging UI 배포 준비 GO**. 실제 Render 배포 후 화면 확인은 미실행.
SQL 052/053 재실행, 신규 migration, API/RPC 변경은 필요하지 않다.
영구 삭제는 기존 코드 차단 상태를 유지한다.

## 자료와 적용 기준

`어드민 통계 명세서.txt`, `회원 페이지 통계,랭킹 명세서.txt` 전체와
`어드민 통계.png`, `회원 페이지 통계, 랭킹2.png`,
`회원페이지 토너먼트사진 옆 버튼.png`를 검토했다.
관리자 문서의 기본 30일보다 이번 사용자 요청의 **최근 7일**을 우선했다.
이미지의 증감률·샘플 댓글·순위 그래프·자동 갱신 문구는 구현하지 않았다.

## 완료한 화면

- 관리자 Statistics 메뉴 및 대시보드 진입 버튼. 요약/상세 탭, 7/30/90일·직접
  날짜·전체/개별 토너먼트 필터. UTC 시작 cohort와 실제 조회 기간을 명시한다.
- 시작/정상 완주/완주율 KPI, 실제 응답 값만 쓰는 SVG 추이 그래프·범례·키보드
  포커스/마우스 툴팁, 일/주/월 조회, 시작 수 TOP 5 및 기존 대표 이미지.
- 상세 통계는 우승 횟수 → 정확한 대결 승률 → 승리 횟수 → ID 순서.
  후보 사진, 우승 횟수·비율, 1:1 승리·참가·승률. PC 표/모바일 카드,
  분홍·주황 비율 막대. 미산정 `—`와 실제 `0.00%`를 구분한다.
- 관리자 라임/다크 테마와 한국어/영어 전환. 조회 중 이전 결과 유지,
  오류·명시적 재시도, 권한 거부 시 이전 결과 제거, 로그아웃 시 초기화.
- 회원의 카드 Rankings, 시작 전 Rankings, 우승 후 View Statistics는 동일한
  화이트 Rankings 화면을 연다. 정상 우승 직후에는 우승 화면이 유지된다.
- 회원 정렬은 우승 수를 사용하지 않는다. wins/appearances의 **반올림 전 비율**
  → 승리 수 → ID. 미산정은 마지막. API 원본 배열·DB 기록을 수정하지 않는다.
- 후보 10개 단위 페이지/연속 순위, PC 표/모바일 카드, 실제 우승 비율·대결
  승률과 막대, 이미지 실패 대체 아이콘, 로딩·빈 상태·오류·재시도.
- 하단 Play Now/Home/Share. Play Now는 기존 라운드 선택 화면만 열고,
  실제 시작 이벤트는 기존 Start/라운드 선택 동작에서만 기록한다.
- 카드 오른쪽 흰색 밑줄 Rankings/Details/Share 텍스트와 작은 SVG 아이콘,
  44px 터치 높이. 기존 사진·카드 크기·제목 글자 크기·배경·그라데이션을
  보존하고 제목 옆에 버튼 공간만 확보했다. Details의 기존 안내창을 재사용한다.
- 기존 우승 화면 Share 코드는 그대로다. 카드/Rankings 공유는 같은 Web Share /
  clipboard 흐름으로 토너먼트 링크 `#worldcup=<ID>`를 제공한다. 링크 진입도
  기존 시작 화면까지만 연결한다.

## 향후 연결 영역

- Rank History: 별도 렌더 함수·`data-rank-history=pending` 영역에
  `Not enough history yet`만 표시. 스냅샷/예약 작업/저장/가짜 그래프 없음.
- Comments: `data-comments-source=tournament`, `data-tournament-id`와
  `pwc-tournament-comments-mount` 이벤트의 tournamentId로 공유 댓글 어댑터를
  연결할 자리를 준비했다. 현재 우승 화면 댓글도 disconnected 상태이므로
  목록·작성·가짜 댓글·임시 저장을 추가하지 않았다. 페이지 변경은 순위 영역만
  갱신하며 Comments DOM은 유지한다. 실제 댓글 서비스는 후속 작업이다.

## 변경 파일

배포·검토용 클론 동기화 대상 8개:

1. `scripts/staging-play-statistics.mjs` — 기존 collector hooks는 동일하게 보존,
   UI만 새 모듈로 위임.
2. `scripts/staging-statistics-ui.mjs` — 신규 관리자/회원 UI.
3. `scripts/staging-statistics-presentation.mjs` — 신규 표시 정렬·페이지·UTC 범위.
4. `scripts/staging-statistics-presentation.test.mjs` — 신규 Node 집중 테스트.
5. `scripts/staging-media-ui.mjs` — Statistics 경로·언어·기존 private preview 주입.
6. `templates/staging-play-statistics.css` — 통계 화면/카드 작업 버튼 전용 스타일.
7. `staging-deploy/public-files.mjs` — 신규 UI 모듈 2개만 공개 allowlist에 추가.
8. 이 보고서 `staging-deploy/admin-dashboard-validation/statistics-ui-ux-report.md`.

로컬 전용 변경: `scripts/check_staging_play_statistics.py`.
로컬 증거: `statistics-ui/`의 6개 PC·모바일 캡처와
`statistics-ui-ux-sha256.json`. 캡처 수치는 격리 테스트 fixture이며 실제 Staging
통계가 아니다. 테스트/보고서는 공개 allowlist에 포함하지 않는다.

## 검증

- **PASS:** Node 14개 — 신규 표시 정책 2개, 영향 관련 기존 우승/Gemini 8개,
  allowlist·초기화 순서·공개 overlay·Render routing 4개.
- **PASS:** 1440×1000 / 390×844 모의 브라우저 통합. 최근 7일 기본·90일·직접
  날짜의 UTC 경계, 일/주/월 RPC 인자, TOP 5, 실제 썸네일 연결, 그래프 툴팁,
  언어 전환/필터 보존, 서로 다른 관리자/회원 정렬, 23개 후보 10/10/3 페이지,
  미산정·0%, Comments DOM 유지, 오류/재시도/권한 거부, 카드 겹침·크기·Details·
  Share, 집계 없는 Play Now, 실제 게임/우승 후 통계 진입을 확인했다.
- **PASS:** 기존 사진 편집 PC·모바일 브라우저 회귀 — Fit/Fill, 독립 zoom, drag,
  재업로드 없는 저장, 대표 사진, 실제 대결/우승 렌더링. 업로드 요청 0회.
- **PASS:** 기존 collector hooks 문자열 일치 및 SQL 050/052/053, collector,
  통계 서버 API, 사진/우승/Gemini 소스가 변경 전 클론과 SHA-256 일치.
- **FAIL:** 최종 잔여 없음.
- **SKIP:** 실제 Staging/Production SQL·배포·실데이터 변경, 실제 브라우저 공유
  권한 및 배포 후 UI 확인. 이미 통과한 수집·FK·RLS·대진 DB 테스트는 반복하지 않았다.

## 적용과 남은 사항

사용자가 GitHub Desktop에서 위 8개 파일을 검토한 뒤 기존 절차로 Staging만
배포한다. **추가 SQL이나 환경 변수 변경은 없다.** 기존 통계 활성화 설정과
영구 삭제 BLOCKED 설정을 유지한다.

배포 후 최소 확인: 기존 데이터로 관리자 요약·개별 상세/7일 필터/언어 전환,
PC·모바일 Rankings 정렬·막대·10개 페이지, 카드 Details/Share, 우승 화면의
View Statistics 진입을 확인한다. Play Now만 눌러 시작 수가 늘지 않는지도
확인한다. 신규 대량 플레이 실험은 필요하지 않다.

남은 작업은 실제 Rank History 스냅샷 정책(필리핀 시간)과 공용 댓글 백엔드다.
이번 버전은 두 기능이 연결된 것처럼 표시하지 않는다. 실제 공유 권한은
HTTPS/브라우저 지원에 따라 달라질 수 있으며, 실패 안내를 제공한다.
