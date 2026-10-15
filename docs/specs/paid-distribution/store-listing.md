# App Store 등록 정보

App Store Connect에 입력할 값의 작업 사본이다. 입력이 끝나면 App Store Connect가 원본이고, 이 파일은 스펙 폴더와 함께 삭제한다.

## 공통

| 항목 | 값 |
|---|---|
| 이름 | Arrowly: Draw on Screen |
| SKU | arrowly-macos |
| 번들 ID | com.oddcorp.arrowly |
| 카테고리 | 주: Productivity, 보조: Education |
| 가격 | USD 14.99, 전체 국가 |
| 저작권 | 2026 ODD Inc. |
| 지원 URL | https://github.com/toy-crane/arrowly/issues |
| 마케팅 URL | https://github.com/toy-crane/arrowly |
| 개인정보 처리방침 URL | https://github.com/toy-crane/arrowly/blob/main/PRIVACY.md |
| 개인정보 항목 | Data Not Collected |
| 연령 등급 | 4+ (모든 설문 항목 "없음") |
| 수출 규정 | 비면제 암호화 사용 안 함 (`ITSAppUsesNonExemptEncryption` = false) |
| 출시 방식 | 수동 출시 |

## 검토 상태

- 한국어·영어 설명 본문과 언어별 스크린샷 5장은 사용자 승인에 따라 App Store Connect에 등록했다. 주요 기능의 상세 전달은 스크린샷이 맡는다.
- 대상은 앱 `6822570522`, macOS 스토어 버전 `1.0`이다. 연결된 빌드 버전은 `1.0.0`이며 이번 작업에서 버전 번호는 바꾸지 않았다.
- 설명 본문을 다시 조회해 작업 사본과 일치함을 확인했다. 부제·프로모션 텍스트·키워드·URL은 기존 등록 값이 이 문서와 같아 유지했다.
- 판매 지역은 175개 전체이며 새 국가·지역 자동 추가가 켜져 있다. 수동 출시를 유지한 채 2026-10-14 15:31 KST에 심사 제출했고, 버전과 제출 모두 `WAITING_FOR_REVIEW`임을 재조회했다. 출시는 수행하지 않았다.
- 개인정보 `Data Not Collected` 응답은 게시 완료(`published: true`). 유료 앱 계약과 은행 계좌는 활성 상태이며 한국 세금 서류는 `Pending`이다.
- 2026-10-15 재제출: 첫 제출 빌드 `202610141301`이 확대 도구 화면 식별 수정(`ce4f155`) 전 코드라 샌드박스에서 확대 도구가 동작하지 않았다. 심사 전 제출 `afc3093a-adf3-4f04-8041-5bc3fd278d34`를 취소하고, `origin/main`(`c7e02f9`)에서 만든 빌드로 13:20 KST에 다시 제출했다. 수동 출시는 유지했다.
- 2026-10-15 두 번째 재제출: 스크린샷 5번이 이전 확대 도구(2배, 작은 렌즈)를 보여 주어 심사 전 제출 `b19f78f5-dd8c-4344-8a4c-4ea0871f188e`를 취소하고, 한국어·영어 5번을 현재 확대 도구로 교체한 뒤 13:53 KST에 다시 제출했다. 빌드와 수동 출시는 그대로다.
- 현재 제출 ID: `5f37da51-1b9b-4a03-ad92-e411f6633db8`. 빌드 ID: `fd06af59-83c4-4c97-acf2-0976b164c54f`, 빌드 번호: `202610151313`.
- 제출 직전 검사 결과는 차단 오류 0건. 부제와 키워드 중복 경고 2건은 비차단 항목이다. 네이티브 동작 인수 조건의 완료를 이 등록·제출 결과로 주장하지 않는다.
- 상태 확인: `asc review status --app 6822570522 --version-id 47cc5afd-304a-469c-8e15-2a2eed7c5492 --platform MAC_OS`. API 접수증과 재조회 결과는 `~/Documents/Arrowly-App-Store-2026-10-14/asc-registration/`에 보존한다.

## English (U.S.)

**Subtitle** (30자 이내)
Annotate any screen, live

**Promotional text** (170자 이내)
Draw arrows, shapes, and notes right on top of whatever you are presenting, then clear the screen in one keystroke.

**Keywords** (100자 이내, 쉼표 구분)
annotate,presentation,teaching,lecture,highlight,arrow,whiteboard,blackboard,magnifier,marker,pen

**Description**
Make your point clear.

Even a well-prepared slide has a detail worth pointing out.
Circle an important number, connect ideas with arrows, and add a short note. Arrowly lets you draw directly on your presentation screen to help your audience follow what matters.

Explain right where it matters
Emphasize with freehand drawing, arrows, shapes, and text. Magnify small text and numbers, or open a blackboard when an idea needs more room.

Easy to correct
Move or remove a single mark, or undo a change. When you have made your point, clear the screen and keep presenting.

Buy once. Keep using it.
No subscription. Future updates are included. No account is required, and Arrowly does not collect or transmit your screen content or drawings.

Requires macOS 14 or later. Drawings disappear when you quit the app; saving and loading drawings are not supported. The magnifier requires Screen Recording permission.

## 한국어

**부제** (30자 이내)
화면 위에 바로 그리는 판서 도구

**프로모션 텍스트**
발표하는 화면 위에 화살표, 도형, 메모를 바로 그리고, 끝나면 키 하나로 화면을 비웁니다.

**키워드**
판서,주석,강의,발표,화면그리기,화살표,형광펜,칠판,돋보기,확대,마커,수업

**설명**
전달할 핵심을, 선명하게.

잘 준비한 슬라이드에도, 지금 짚어줘야 할 부분이 있습니다.
Arrowly로 중요한 숫자에 동그라미를 치고, 화살표로 흐름을 연결하고, 짧은 메모로 설명을 더하세요. 발표 화면 위에 직접 그려 청중이 핵심을 따라오도록 돕는 Mac 앱입니다.

설명이 필요한 곳에 바로
펜, 화살표, 도형, 텍스트로 강조하세요. 작은 글씨와 숫자는 확대하고, 새로운 설명이 필요하면 블랙보드를 펼치세요.

잘못 그려도 간단하게
표시 하나만 옮기거나 지우고, 실행 취소로 되돌리세요. 설명을 마치면 화면을 비우고 발표를 이어가세요.

한 번 구매하고 계속 사용하세요
구독 없이 이후 업데이트까지 포함됩니다. 계정 없이 사용하며, 화면과 그린 내용을 수집하거나 전송하지 않습니다.

macOS 14 이상을 지원합니다. 그린 내용은 앱을 종료하면 사라지며, 저장·불러오기는 제공하지 않습니다. 확대 기능에는 화면 기록 권한이 필요합니다.

## 심사 메모 (App Review Information > Notes)

Arrowly is a menu bar utility; it shows no Dock icon after the first-run tutorial closes. Use the menu bar icon or these shortcuts:
1. Press ⌥Tab (Option+Tab) to start drawing on the current screen. Draw with the mouse. Press Esc to return.
2. The floating marker at the bottom left switches tools (arrows, shapes, text, delete, magnifier).
3. The magnifier tool asks for Screen Recording permission because it displays the area around the pointer at 2×. Screen content is processed in memory only and never stored or transmitted. After granting permission, macOS requires relaunching the app (choose "Quit Arrowly" from the menu bar menu and reopen the app).
4. "Launch at Login" in the menu bar menu is off by default and registers the app as a login item only when the user turns it on.
No account or sign-in is required.

연락처는 사용자가 지정한 값을 App Store Connect에만 입력한다.
