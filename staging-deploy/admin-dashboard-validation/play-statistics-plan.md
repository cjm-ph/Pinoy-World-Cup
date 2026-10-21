# Staging 실제 플레이 통계 — 조사 및 최소 구현 계획

이번 통계 작업은 소스·로컬 migration·초기화 경로 조사와 계획 작성만 수행했다. 실제 DB 조회, 통계 기능 구현, SQL 실행, 배포는 하지 않았다. 기존 050/FK/RLS 검증을 반복하지 않았다.

## 현재 구현 상태와 근거

| 경로 | 현재 동작 |
| --- | --- |
| `scripts/staging-adapter-bootstrap.js` | Supabase 공개 콘텐츠 준비 후 기존 게임 엔진·VS·우승 모듈 순차 로드. 통계 collector를 연결하지 않음 |
| `scripts/vs_round_selection_test.js`: `begin()` | 중복 시작 클릭 latch, 후보 선택, practice 안내 후 게임 시작. 서버 이벤트 없음 |
| `scripts/modules/engine.js`: `start/render/choose` | `cur/next/i/log/champ` 메모리 상태로 대결 진행. `log`는 이름 기반 `winner|loser` 목록. 매 라운드 서버 저장 없음 |
| 같은 파일 `finish/record` | 결승 완료 후에만 조건부 `db.collection("plays").add({champ,tid,m,ts})` 호출. 고유 요청 ID 없음. 저장 실패는 무시됨 |
| 같은 파일 초기화 | `window.claude`가 있을 때만 `claude.use("db")` 연결. 최근 plays 1,000건/comments 200건 snapshot 조회. Staging 페이지는 이 제공자를 초기화하지 않음. 외부 런타임 주입까지 없다고 단정하지는 않음 |
| `scripts/modules/ranking.js` | 전달받은 wins/losses/titles로 정렬하는 순수 함수. 실제 서버 집계 공급자가 아님 |
| `scripts/vs_round_selection_test.js` | `pinoy-anonymous-visitor-v1` 브라우저 UUID 생성. 현재 서버 이벤트와 연결되지 않음. 회원 또는 실제 사람 고유성 증거가 아님 |
| `scripts/staging-media-ui.mjs` / `admin_staging.html` | 전체 토너먼트·검토 대기·최근 콘텐츠 관리 활동은 연결됨. Total Plays와 Members는 미연결 표시. 관리자 비공개 게임은 공식 통계를 기록하지 않음 |
| 로컬 v41b 스키마·041 dashboard RPC·후속 파일 | 콘텐츠/승인/사진/감사 기록이 존재. 현재 배포 경로가 사용하는 플레이 시작·대결·완료 수집 RPC/테이블은 찾지 못함. 전체 원격 DB의 부재를 조회로 증명한 것은 아님 |

따라서 현재 Staging에서 **공식 플레이 수·완주 수·우승 횟수·인기 순위를 실제 Supabase 데이터로 산출할 수 있다는 근거는 없다**. 인증/프로필 및 콘텐츠 관리 감사 활동은 게임 플레이 이벤트와 다르다. 레거시 snapshot의 최대 1,000건을 전 기간 통계로 표시하거나 과거 미수집 기간을 0회로 표시하면 안 된다. 통계 수집 시작 시점부터 측정해야 한다.

## 현재 중복·새로고침·이탈·게스트 처리

- UI latch는 같은 라운드 선택창의 연속 클릭을 줄일 뿐, 서버 중복 집계 방지는 아니다. legacy `add()`는 동일 결승 결과 재호출을 중복 저장할 수 있다.
- 새로고침은 메모리 대진/로그를 잃는다. 중간 진행 저장·resume·완료 재전송 식별자가 없다.
- 중도 이탈은 현재 기록되지 않는다. 결승 저장만 있다면 시작 수·완주율을 복원할 수 없다.
- 서버가 검증하는 회원/게스트 플레이 식별이 없다. 이름 문자열은 중복·이름 변경에 취약하며 집계 키로 부적절하다.
- 로그/브라우저 시각을 조작할 수 있다. 브라우저가 보낸 숫자를 바로 카운터에 더해서는 안 된다.

## 최소 지표와 범위

1. **접수된 시작 수**: 실제 라운드 선택 후 서버 start가 승인된 고유 게임 수. 카드 클릭/페이지 조회는 제외. 네트워크에서 유실된 시작은 셀 수 없으므로 '모든 실제 플레이'라고 과장하지 않는다.
2. **검증된 완주 수**: 동일 게임에서 검증한 완전한 대진 결과가 서버에 확정된 수. 동일 game ID의 finish는 1회만 반영한다.
3. **우승 횟수/우승 비율**: revision/participant 불변 ID별 완주 집계. 이름과 사진 URL은 키로 사용하지 않는다.
4. **인기 토너먼트**: 명시한 기간의 시작 수 또는 완주 수로 정렬. 정의·분모·동률 규칙을 고정한다. 서로 다른 8/16/32강은 분리 또는 필터 제공한다.
5. **완주율**: 같은 시작 cohort의 완주/시작으로 정의한다. 진행 중/만료 미완료를 구분하고, 임의 기간의 완료 건수를 같은 기간 시작 건수로 단순 나누지 않는다.

대결별 승률은 완주 transcript에서만 계산 가능하므로 초기에는 '완주 게임 기준'으로 표기한다. 실시간 라운드 진행 수·부분 대결 승률·정확한 이탈 위치·신뢰할 수 있는 순 이용자 수는 별도 개발 대상으로 제외한다. 만료를 '확인된 이탈'이라고 표시하지 않는다. 봇이 합법적인 대진 결과를 만들어 제출하는 행위까지 막을 수 없으므로 검증된 제출 수와 실제 사람 수는 구별한다.

## 재사용 및 추가 개발

- 후보 선택·대결·우승 연출은 재사용하고 collector를 별도 Staging 모듈로 연결한다. 통계 오류가 게임/공유/재시작을 막지 않게 한다.
- Render의 Staging 프로젝트 제한·요청 검증·Auth 검증 패턴을 재사용하되, 업로드 admission/RPC는 재사용하지 않는다. 통계에 독립된 빈도/본문/요청 시간 제한을 둔다.
- start는 현재 공개 상태, 승인된 published revision, 선택 후보의 소속·활성 여부·중복·라운드 수를 검증하고 game ID와 충분히 무작위인 재개 증표를 발급한다. 회원 UUID는 서버에서 검증하며 게스트는 로그인 강요 없이 서버 발급 가명 세션으로 처리한다. 증표는 로그에 남기지 않는다.
- 완료는 start의 고정 revision/후보 집합을 기준으로 N-1개의 승자·패자 ID를 대진 순서대로 검증한다. 탈락한 후보의 재등장, 잘못된 결승, 타 토너먼트 ID, 누락/추가 대결을 거부한다. 완료 트랜잭션과 지표 반영은 원자적이며 동일 요청 재전송에는 같은 영수증을 반환한다.
- 시작 후 새 공개 revision이 생겨도 그 게임은 start 시점 revision에 귀속한다. 비공개/휴지통으로 바뀌면 신규 시작과 신규 완료 접수를 거부하는 정책을 초기 기본안으로 제안한다. 거부된 완료를 집계에 섞지 않는다. 이미 접수된 역사 통계의 관리자 조회와 공개 노출은 분리한다.
- 로컬 새로고침 재전송은 동일 게임·요청 ID를 사용하고, 명시적인 Again만 새 게임으로 본다. 재개를 지원하려면 pending game/transcript/증표를 TTL을 두고 보관하는 클라이언트 상태가 필요하다. 저장소가 차단된 경우 안정적인 resume/순 이용자 측정은 보장하지 않는다. 계정 변경 시 기존 가명 게임의 소유권을 임의로 바꾸지 않는다.
- 사용자 IP·이메일·사진·전체 UA·핑거프린트는 통계에 저장하지 않는다. 가명 식별자도 개인정보에 준해 보관 기간·목적·접근 정책을 정한다. guest rate limit은 단기간 처리하고 영구 IP 이력을 만들지 않는다.

## DB 변경: 필요, 이번에는 설계 초안만

실행 가능한 migration 파일은 만들지 않았다. 필드/제약 초안은 다음과 같다. 번호는 다음 구현 시 확정하고 050을 수정/재실행하지 않는다.

- `game_sessions`: UUID PK, 시작 idempotency key UNIQUE(호출자 범위), tournament/revision ID, selected participant IDs, round size, 서버 시작 시각, 상태(started/completed/expired), 서버 완료 시각, champion participant ID, 증표 해시, 최소 가명 호출자 정보.
- `game_completions`: game ID UNIQUE FK, 검증된 bounded transcript 또는 결과 검증용 해시/최소 이벤트, 서버 확정 시각. 정확한 원본 보관 필요성과 TTL은 구현 전에 결정한다.
- `game_daily_totals`: UTC 날짜/토너먼트/revision/round size 복합 키의 시작·완료 수. `participant_daily_totals`: 같은 차원+participant ID별 titles/wins/appearances. 원본 ledger에서 재구축할 수 있어야 한다. 완주율 cohort 조회는 세션 자료 기준이다.
- PK/UNIQUE와 원자적 완료 전이로 중복 집계를 막는다. 데이터 테이블은 직접 클라이언트 쓰기를 금지한다. 수집 RPC는 서버 호출 전용, 관리자 summary RPC는 활성 관리자만 허용한다. 게스트에게 service key를 노출하지 않는다.
- 콘텐츠와의 참조는 NO ACTION FK/명시적 보관 정책을 우선 검토한다. CASCADE를 추가하지 않는다. 새 통계 FK는 영구 삭제의 26개 FK 계약과 충돌할 수 있으므로 향후 purge 설계 검토 대상이며, 이를 피하려고 무결성을 약화하지 않는다. 현재 false barrier는 유지한다.

## 속도·최소 관리자 UI

- MVP는 start와 finish **게임당 2회 수집**을 기본으로 하고 매 선택 요청은 보내지 않는다. UI 애니메이션과 네트워크를 분리하고 서버 영수증이 없으면 '통계 반영 안 됨/대기'로 구분한다.
- 전송 실패는 고유 게임 ID를 유지한 제한된 지연 재전송으로만 처리하는 설계이며, 전송 성공을 추정하지 않는다. 종료 이벤트/sendBeacon만으로 정확한 전달을 보장하지 않는다. 큐·TTL·최대 31대결 등 입력 상한을 둔다. 이 로직은 아직 구현하지 않았다.
- 관리자 대시보드가 전체 raw plays를 내려받지 않게 기간/토너먼트/revision/round 필터와 소형 summary RPC·페이지네이션을 둔다. 인덱스와 일별 집계로 공개 목록 요청에 무거운 집계를 섞지 않는다. 집계의 기준 시각/지연을 표시한다.
- PC: 기간 선택 + 시작/완주/완주율 카드 + 인기 토너먼트 표, 상세에서 후보 우승 횟수 표. 모바일: 같은 카드 세로 배치와 간단한 목록. 미연결/수집 전/데이터 없음/조회 오류를 실제 0과 구별한다. 회원/게스트 원본 ID는 기본 UI에 표시하지 않는다.

## 권장 구현 순서·난이도

1. **정의 확정(중)**: start/complete 분모, revision 변경/비공개 처리, 게스트·보관·남용 한계와 수집 시작일 결정.
2. **후속 DB/RPC 초안과 격리 검증(중상)**: idempotency, 소유권, 대진 검증, NO ACTION 참조, 원자적 집계, 관리자 read. 사용자 검토 전 실제 SQL 실행 금지.
3. **독립 Render collector + 클라이언트 연결(중상)**: nonblocking start/finish, 제한 큐, 새로고침/Again 구분. 관리자 preview 제외, 장애가 게임을 멈추지 않는지 검사.
4. **소형 summary RPC·PC/모바일 UI(중)**: 지표 정의와 가용성 표기, 기존 정렬 함수의 재사용은 지표 의미가 같을 때만 허용.
5. **승인된 Staging 검증 후 활성화**: 중복 finish/동시 finish/새로고침/중도 이탈/guest 저장소 차단/미공개/휴지통/과거 revision/실패 재전송을 소수의 격리 시나리오로 확인. 기존 사진·대표·게시·복원 및 영구 삭제 차단은 유지한다.

MVP 전체 난이도는 **중상**이다. 단순 카운터 UI보다 서버의 게임 귀속·검증·중복 방지가 핵심 작업이다. 과거 미수집 실적을 임의로 소급 생성하지 않는다.

## 같은 요청의 우승 사진 정리 — 구현 및 검증

현재 관리자 `photo-card-editor.mjs`는 이미 후보당 PC/모바일 패널만 제공하며 독립된 우승 편집 UI는 없다. 따라서 대결 편집기를 수정하지 않았다. `adapter_presentation_bridge_v2.js`의 Staging `show('end')`가 별도 resultPhotos 대신 vsPhotos를 복사하도록 변경하고, `staging-media-ui.mjs`의 우승 미리보기·리사이즈가 presentations.vs를 읽도록 변경했다. 다른 프로젝트의 bridge 정책은 그대로다.

실제 우승 이미지 소스는 기존처럼 champion의 이미지이며, 기존 result 설정 레코드나 사진 파일을 삭제/변환하지 않는다. `result_immersive_test.js`, `vs_immersive_test.js`, `photo-card-editor.mjs`, `photo-display.js`, SQL 050 및 업로드·교체 코드는 이번에 변경하지 않았다. 과거 result 전용 crop이 vs와 달랐던 항목은 앞으로 Staging에서 vs crop으로 보이는 것이 의도된 변경이다.

변경 파일:

- `scripts/adapter_presentation_bridge_v2.js`
- `scripts/staging-media-ui.mjs`
- `scripts/staging-winner-photo.test.mjs` (신규, 클론에서도 실행 가능)
- `scripts/check_staging_photo_editing.py` (기존 로컬 모의 브라우저 테스트 보강; fixture 의존으로 배포 제외)
- 이 계획/보고서와 `winner-photo-statistics-sha256.json` 로컬 해시 목록.

검증 결과: Node 집중 테스트 3개 통과(Staging vs 재사용·과거 result 값 불변·복사 독립성·다른 환경 유지·별도 우승 편집기 없음). 기존 집중 모의 브라우저 테스트를 보강하여 PC 1440×900/모바일 390×844에서 상충하는 과거 result crop이 있어도 실제 우승 렌더러가 vs의 Fit/Fill·확대·위치로 표시하는지 확인했다. 대표 사진 설정 저장, 대결 편집·재열기·취소도 통과했고 업로드 요청은 0회였다. 실제 Staging 데이터/Render 배포 검증은 미실행이다.

배포는 사용자 검토 후 위 JS 두 파일만 필요하다. 테스트·보고서는 검토용이며 기존 public allowlist를 확대하지 않았다. SQL 적용이나 통계 기능 배포는 필요하지 않다. 영구 삭제는 false/BLOCKED를 유지한다.
