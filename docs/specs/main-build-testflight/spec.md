# main 빌드 TestFlight 배포

## 목적

main에 머지된 최신 상태를 개발자 본인이 Mac에서 별도 빌드 없이 받아 설치·업데이트한다. 받는 빌드는 실제 판매하는 App Store 샌드박스 빌드와 같은 종류여서, 샌드박스에서만 생기는 문제와 심사에 걸릴 변경을 출시 전에 발견한다.

## 관련 소스

- [docs/decisions/paid-distribution.md](../../decisions/paid-distribution.md) — 판매를 시작하면 공개 경로에 설치 파일을 두지 않는다는 기준과 저장소 공개 유지. 이 작업의 배포 위치 선택을 제약한다.
- [docs/specs/paid-distribution/spec.md](../paid-distribution/spec.md) — 진행 중인 App Store 심사 게이트, App Store 빌드의 번들 ID·버전, 게이트 동안 무료 DMG·README를 바꾸지 않는다는 약속. 이 작업은 그 약속을 건드리지 않는다.

## 확정된 경험

### 개발자(내부 테스터)

- PR이 main에 머지되면 별도 조작 없이 그 커밋의 App Store 샌드박스 빌드(`com.oddcorp.arrowly`)가 TestFlight에 올라간다.
- Apple 처리가 끝나면 Mac의 TestFlight 앱에 새 빌드가 나타나고, 버튼 한 번으로 설치하거나 자동 업데이트로 받는다.
- 각 TestFlight 빌드가 어느 main 커밋에서 나왔는지 확인할 수 있다.
- 업로드가 실패하면(빌드 실패, 업로드 검사 거부 등) GitHub Actions 실행 결과로 드러난다. Apple 서버 처리 중 발견된 문제(비공개 API 사용 ITMS-90338 등)는 Apple 메일로 온다.

### 다른 사람

- 설치 파일은 GitHub 어디에도(공개 Release, Actions 아티팩트) 올라가지 않는다. 저장소를 보는 사람은 빌드가 돌았다는 것만 알 수 있다.
- 공개 GitHub Release, README, 기존 태그 릴리스 절차와 심사 중인 App Store 제출은 바뀌지 않는다.

## 인수 조건

- main에 머지하면 GitHub Actions가 App Store 샌드박스 빌드를 만들어 App Store Connect에 업로드하고, 실행이 성공으로 끝난다.
- 업로드한 빌드가 App Store Connect의 TestFlight 내부 테스트 그룹에 베타 심사 없이 배정되고, 개발자 Mac의 TestFlight 앱에서 설치된다.
- 설치한 앱이 실행되어 메뉴바에 나타나고, 그 빌드의 출처 커밋을 TestFlight 또는 App Store Connect에서 확인할 수 있다.
- 연속으로 두 번 머지하면 나중 커밋의 빌드가 TestFlight의 최신 빌드가 된다.
- 테스트가 실패한 커밋은 업로드하지 않는다.
- 이 작업 전후로 공개 GitHub Releases의 에셋 목록과 Actions 아티팩트에 `.pkg`·`.dmg`·`.app` 설치 파일이 새로 생기지 않는다.
- 심사 중인 1.0.0 제출의 빌드 선택이 바뀌지 않는다.

## 확정된 제약

- 배포 경로는 TestFlight 내부 테스트다. 공개 저장소의 Actions 아티팩트는 저장소와 무관한 GitHub 계정으로 로그인해도 받을 수 있어(2026-10-15 확인: 비로그인 401, 무관 계정 200) 공개 경로로 본다. 공개 tip Release도 같은 이유로 쓰지 않는다.
- 비공개 draft Release에 Developer ID DMG를 올리는 대안은 판매용 샌드박스 빌드가 아니어서 샌드박스 전용 문제를 잡지 못하고 설치·업데이트가 수동이라 택하지 않았다. 게이트 실패 시의 대체 경로로 남긴다(보류한 결정 참조).
- 저장소는 공개로 유지한다. 공개 저장소의 표준 GitHub 러너는 macOS를 포함해 무료다. 비공개 전환은 결정 계약에서 기각된 대안이며, 스토어의 지원·마케팅·개인정보 처리방침 URL이 이 저장소를 가리키므로 이 작업에서 다루지 않는다.
- 트리거는 main에 머지될 때마다다. 수동 실행만 두는 방식은 택하지 않았다.
- 개발자 Mac의 무료 버전(`com.toycrane.arrowly`)은 지운다. 같은 이름의 두 앱이 함께 설치·실행되는 상황은 이 작업의 검증 대상이 아니다.

## 가정

다음은 사용자가 바꿀 수 있는 에이전트 기본값이다.

- 빌드 번호는 기존 App Store 빌드 절차와 같은 규칙(실행 시각)을 따르고, 앱 버전은 App Store 설정의 버전을 그대로 쓴다.
- 짧은 간격으로 여러 번 머지되어 앞선 빌드가 아직 진행 중이면 앞선 빌드를 끝까지 올리지 않고 최신 커밋만 올려도 된다.
- 내부 테스트 그룹은 자동 배포를 켜 둔다.
- 심사 대기 중인 버전에 같은 버전 번호로 새 빌드를 올려도 제출된 빌드는 바뀌지 않는다(App Store Connect의 제출은 선택한 빌드에 고정된다).

## 비범위

- 외부 테스터, 공개 TestFlight 링크, 베타 심사.
- 태그 릴리스(`release.yml`)와 `/publish` 절차 변경.
- 앱 기능 변경, 앱 안의 업데이트 확인.
- 저장소 비공개 전환과 스토어 URL 이전.
- 무료 버전과 TestFlight 버전의 공존 지원.

## 보류한 결정

- App Store 게이트 실패 시: TestFlight 경로를 쓸 수 없게 된다. 보류 동안(interim) 게이트 결과가 실패로 확정되면 이 업로드를 멈춘다. 대체 경로(비공개 draft Release의 Developer ID DMG 등)는 그때 정한다.
- 1.0.0 출시 뒤 TestFlight 빌드의 버전 번호: 출시된 버전 번호로는 새 빌드를 받지 않을 가능성이 있다(공식 문서로 확인하지 못함). 보류 동안(interim) 업로드가 버전 번호 때문에 거부되면 실행 실패로 드러나게 둔다. 실제로 거부되면 다음 버전 번호를 언제 올릴지 정한다.

## 남은 위험

- 업로드마다 Apple의 비공개 API 검사를 거치므로, 게이트와 같은 이유(투명 웹뷰 설정)로 TestFlight 빌드도 처리 단계에서 거부될 수 있다. 이것은 게이트 판정의 조기 신호로도 쓰인다.
- 머지 뒤 설치까지 Apple 처리 시간 10–30분이 걸린다.
- 빌드 번호가 분 단위 실행 시각이라 같은 분에 두 번 업로드하면 번호가 겹쳐 뒤 업로드가 거부될 수 있다.
- TestFlight 빌드는 90일 뒤 만료된다. 머지가 90일 넘게 없으면 설치한 빌드가 실행되지 않는다.
- 인증서·프로필·API 키를 CI에 두면 만료·교체 때 secrets도 함께 갱신해야 한다. 인증서 p12는 macOS 키체인이 읽을 수 있는 형식이어야 하며, 형식이 맞지 않으면 비밀번호 오류처럼 보이는 실패가 난다.
- 화면 기록 권한은 서명 신원 기준으로 기억되므로, TestFlight 빌드에서 확대 도구 권한을 처음 한 번 다시 허용해야 할 수 있다.
- Apple 쪽 문제로 내부 테스터에게 빌드가 나타나지 않는 사례가 보고되어 있다.

## Setup before implementation

- Apple Distribution 인증서와 3rd Party Mac Developer Installer 인증서의 p12 내보내기 — CI에서 샌드박스 빌드 서명과 설치 패키지 생성 — 이 Mac에서 내보낸 각 p12를 임시 키체인에 가져와 `security find-identity -v`에 두 신원이 보인다.
- `Arrowly Mac App Store` 프로비저닝 프로필 파일 — CI 빌드에 포함 — 개발자 포털에서 프로필이 유효로 표시되고 만료일이 확인된다.
- App Store Connect API 키(App Manager 권한)의 키 ID, 발급자 ID, p8 파일 — CI 업로드 — 이 Mac에서 `bash scripts/appstore.sh validate`가 그 키로 통과한다.
- 위 값들을 `toy-crane/arrowly` 저장소 Actions secrets로 등록 — CI 접근 — 저장소 설정의 Actions secrets 목록에 항목이 나타난다(값은 저장소에 기록하지 않는다).
- App Store Connect의 TestFlight 내부 테스트 그룹(자동 배포 켬)에 개발자 계정 추가 — 빌드 배정 — 그룹 테스터 목록에 개발자가 보인다.
- 개발자 Mac에 TestFlight 앱 설치와 무료 버전 Arrowly 삭제 — 설치 확인 — TestFlight 앱이 로그인되어 있고 /Applications에 `com.toycrane.arrowly` 앱이 없다.
