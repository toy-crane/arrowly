# Arrowly 릴리스 가이드 (macOS DMG)

v1 배포는 **DMG 직접 배포**로 확정 (App Store는 비공개 API·비샌드박스 구조라 불가 — REQUIREMENTS 배포 절 참조).
자동 업데이트 없음 — 새 버전은 재다운로드.

## 0. 사전 요구

- **Apple Developer Program 가입** (연 $99) — 서명·공증에 필수. 가입 전에는 3장의 무서명 빌드까지만 가능.
- Xcode 설치, rustup 타깃 2종:
  ```bash
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  ```

## 1. 인증서 발급 (최초 1회)

1. [developer.apple.com](https://developer.apple.com/account/resources/certificates/list) → Certificates → **Developer ID Application** 인증서 생성
   (키체인 접근 → 인증서 지원 → 인증 기관에서 인증서 요청으로 CSR 생성 후 업로드)
2. 발급된 인증서를 더블클릭해 키체인에 설치
3. 확인:
   ```bash
   security find-identity -v -p codesigning
   # "Developer ID Application: 이름 (팀ID)" 가 보여야 함
   ```

## 2. 환경변수 (서명 + 공증)

Tauri가 빌드 중 서명하고 공증 업로드·스테이플까지 자동으로 수행한다.

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: 이름 (팀ID)"
export APPLE_ID="apple-id@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com → 앱 암호 생성
export APPLE_TEAM_ID="팀ID"
```

## 3. 빌드 (universal: Apple Silicon + Intel)

```bash
bun tauri build --target universal-apple-darwin
```

산출물:
- `src-tauri/target/universal-apple-darwin/release/bundle/macos/Arrowly.app`
- `src-tauri/target/universal-apple-darwin/release/bundle/dmg/Arrowly_<버전>_universal.dmg`

공증은 업로드·심사 대기 때문에 수 분 걸릴 수 있다. 로그에 `Notarizing` → `notarization succeeded` 확인.

## 4. 공증 검증

```bash
spctl -a -vv -t install src-tauri/target/universal-apple-darwin/release/bundle/macos/Arrowly.app
# → "accepted", "source=Notarized Developer ID" 여야 함

xcrun stapler validate src-tauri/target/universal-apple-darwin/release/bundle/dmg/Arrowly_*_universal.dmg
# → "The validate action worked!"
```

다른 Mac(또는 새 사용자 계정)에서 DMG를 받아 열었을 때 Gatekeeper 경고 없이 실행되면 최종 통과.

## 5. 배포

- DMG를 GitHub Releases 등에 업로드. 파일명 규칙: `Arrowly_<버전>_universal.dmg`
- 버전 올리기: `src-tauri/tauri.conf.json`의 `version` (+ `package.json` 동기화)
- 업데이트 안내는 수동(v1). 자동 업데이터는 비목표.

## 참고

- **TCC 권한은 코드 서명 기준으로 기억된다** — 서명된 빌드끼리는 교체해도 권한 유지, 무서명 dev 빌드는 리빌드마다 리셋될 수 있다.
- 로컬 검증용 무서명 빌드: `bun tauri build --debug --bundles app` → `/Applications`에 복사해 사용.
- 아이콘 재생성: `scripts/gen-icons.sh` (ImageMagick 필요).
