# 코드 서명·공증 — 개념과 Arrowly의 설정

macOS 앱을 Gatekeeper 경고 없이 배포하기 위한 요구사항과 Arrowly CI의 구현을 정리한다.
실행 절차는 `RELEASE.md`, 실제 릴리스는 `/release` 스킬 참조.

## Gatekeeper의 요구사항

macOS는 인터넷에서 내려받은 앱을 처음 실행할 때 다음 두 가지를 검사한다.

| 검사 | 충족 수단 |
|---|---|
| 개발자 신원과 빌드 후 변조 여부 | 코드 서명 (Developer ID 인증서) |
| 알려진 악성코드 포함 여부 | 공증 (Apple 서버의 자동 스캔) |

하나라도 없으면 "확인되지 않은 개발자" 또는 "손상되었기 때문에 열 수 없음" 경고와 함께
실행이 차단된다. macOS 15부터는 우클릭 → 열기 우회가 제거되어, 사용자가 시스템 설정 →
개인정보 보호 및 보안에서 "그래도 열기"를 눌러야만 실행할 수 있다.

## 용어

- **Developer ID Application 인증서** — App Store 외부 배포용 서명 인증서. Apple이
  인증서와 팀(ODD Inc.)의 연결을 보증한다. 유효기간 5년. App Store 제출용 인증서
  (Apple Distribution)와는 별개 종류다.
- **개인키** — 서명 연산에 사용되는 비밀 값. CSR을 생성한 Mac에서 만들어지고, 인증서
  발급 과정에서 외부로 전송되지 않는다. 유출되면 제3자가 ODD Inc. 명의로 서명할 수
  있으므로 인증서를 즉시 폐기해야 한다.
- **.p12** — 인증서와 개인키를 비밀번호로 암호화해 묶은 파일 형식(PKCS#12). CI에
  서명 자격을 전달할 때 사용한다.
- **공증(notarization)** — 빌드 산출물을 Apple 서버에 업로드해 자동 악성코드 스캔을
  받고 승인 티켓을 발급받는 절차. 수동 심사가 아니며 보통 수 분 내에 완료된다.
- **스테이플(staple)** — 공증 티켓을 DMG에 첨부하는 작업. 사용자 Mac이 오프라인이어도
  공증 여부를 검증할 수 있다.
- **앱 암호(app-specific password)** — 이중 인증 코드를 입력할 수 없는 무인 환경용
  보조 비밀번호. 계정 설정 변경 등에는 사용할 수 없고 개별 폐기가 가능하다. 계정 본
  비밀번호를 변경하면 전부 무효화된다.

## 전체 흐름

**설정(1회, 완료됨):**

```
개인키 + CSR 생성 (로컬 Mac)
        │  CSR만 업로드 — 개인키는 로컬에 남는다
        ▼
Apple 포털에서 Developer ID Application 인증서(.cer) 발급
        │
        ▼
개인키 + 인증서 → .p12 (비밀번호 암호화) → base64
        │
        ▼
GitHub Actions secrets 7종 등록 + release.yml env 연결
```

**릴리스(매번, 자동):**

```
태그 push (v*)
   ▼
CI 빌드 (universal)
   ▼
.p12를 임시 키체인에 임포트해 코드 서명      ← APPLE_CERTIFICATE 계열
   ▼
Apple 서버 업로드 → 스캔 → 공증 티켓 발급    ← APPLE_ID 계열
   ▼
티켓을 DMG에 스테이플
   ▼
draft Release에 에셋 첨부
   ▼
사람이 draft 검토 후 Publish                ← 유일한 수동 단계
```

## Secrets 7종

| Secret | 용도 |
|---|---|
| `APPLE_CERTIFICATE` | base64 인코딩된 .p12. CI가 임시 키체인에 임포트 |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 복호화 비밀번호 |
| `KEYCHAIN_PASSWORD` | CI 러너 내 임시 키체인의 비밀번호. 러너 외부에서는 사용되지 않음 |
| `APPLE_SIGNING_IDENTITY` | 서명에 사용할 인증서 이름. `Developer ID Application: ODD Inc. (팀ID)` |
| `APPLE_ID` | 공증 업로드에 사용할 Apple 계정 이메일 |
| `APPLE_PASSWORD` | 해당 계정의 앱 암호 (계정 본 비밀번호 아님) |
| `APPLE_TEAM_ID` | 공증 요청이 귀속되는 팀 ID |

상위 4개는 서명, 하위 3개는 공증에 사용된다. tauri-action은 이 환경 변수들이 설정되어
있으면 서명 → 공증 → 스테이플을 수행한다.

## 유지보수

- **인증서 만료(2031-07)**: 재발급 후 .p12 재생성, `APPLE_CERTIFICATE`와
  `APPLE_CERTIFICATE_PASSWORD` 갱신. 절차는 `RELEASE.md`의 수동 서명 절 참조.
- **공증이 인증 오류로 실패하는 경우**: Apple 계정 본 비밀번호 변경으로 앱 암호가
  무효화됐을 가능성부터 확인한다. 앱 암호를 재발급해 `APPLE_PASSWORD`를 갱신한다.
- **개인키/.p12 유출 의심**: 포털에서 인증서 폐기 → 재발급 → secrets 갱신. 폐기
  이전에 서명·공증된 배포본은 계속 실행된다.
- .p12와 그 비밀번호는 저장소 외부(로컬 + 패스워드 매니저)에 백업한다. 개인키를
  잃으면 복구 방법이 없고 재발급해야 한다.

## draft Release의 역할

빌드 산출물이 검토 없이 공개되는 것을 막는다. 게시 전에 릴리스 노트 수정과 DMG 실행
확인이 가능하고, 문제가 있으면 draft를 삭제하고 다시 빌드하면 된다. draft 상태에서는
알림이 발송되지 않고 `releases/latest`에도 반영되지 않는다. Publish 시점에 watch
사용자 알림 발송과 `releases/latest` 갱신이 일어난다.
