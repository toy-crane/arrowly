# Arrowly 릴리스 가이드 (macOS DMG)

v1 배포는 **DMG 직접 배포**로 확정했다. 투명 웹뷰가 macOS 비공개 API에 의존하고 현재 앱이 비샌드박스 구조라 App Store에는 배포하지 않는다.
자동 업데이트 없음 — 새 버전은 재다운로드.
서명·공증이 왜 필요하고 어떻게 구성돼 있는지는 `SIGNING.md` 참조.

## 자동 릴리스 (권장) — 태그 push

버전 태그를 push하면 GitHub Actions(`.github/workflows/release.yml`)가 macOS 러너에서
**Developer ID 서명·공증된** universal DMG를 빌드하고, draft Release에 첨부하며, 릴리스 노트를
GitHub 내장 자동 생성(지난 태그 이후 머지된 PR 목록)으로 채운다.

> Claude Code에서는 `/release` 스킬(`.claude/skills/release`)이 아래 절차 전체
> (버전 3곳 동기화 → 커밋 → 태그 → push)를 대신한다.

```bash
# 1. 버전을 올리고 커밋 → main에 push (태그와 반드시 일치시킨다)
#    - src-tauri/tauri.conf.json 의 "version"
#    - package.json 의 "version"
#    - src-tauri/Cargo.toml 의 version
git commit -am "chore: bump version to 0.2.0"
git push origin main

# 2. push된 커밋에 같은 버전으로 태그를 찍어 push  ← 이 순간 워크플로 발동
git fetch origin main
git tag v0.2.0 origin/main   # 커밋을 명시 — 워크트리/브랜치 무관하게 안전
git push origin v0.2.0
```

- Actions 탭에서 빌드가 끝나면 **Releases** 탭에 draft가 생긴다: `Arrowly_<version>_universal.dmg` 에셋 + 자동 노트.
- 내용을 확인하고 **Publish** 버튼으로 공개한다(draft는 자동 공개되지 않는다).
  Claude Code에서는 `/publish` 스킬이 게시 전 검증(에셋·서명·공증)과 게시를 대신한다.
- CI가 서명·공증까지 수행하므로 다른 Mac에서도 Gatekeeper 경고 없이 열린다.
- 필요한 저장소 Actions secrets(등록 완료, 인증서 만료 2031-07): `APPLE_CERTIFICATE`(base64 .p12),
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `KEYCHAIN_PASSWORD`,
  `APPLE_ID`, `APPLE_PASSWORD`(앱 암호), `APPLE_TEAM_ID`.
  인증서를 재발급하면 아래 수동 절차로 .p12를 다시 만들어 secrets를 갱신한다.

## 0. 사전 요구 (수동 서명·공증 빌드)

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
