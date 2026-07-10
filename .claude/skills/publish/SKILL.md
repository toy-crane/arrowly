---
name: publish
description: Arrowly draft Release 검증 후 게시 — 최신 draft를 찾아 에셋·서명·공증을 검증하고, 사용자 확인을 받아 publish한다. "게시해줘", "publish", "릴리스 공개" 요청 시 실행.
---

# Arrowly 릴리스 게시

CI가 만든 draft Release를 검증하고 게시한다. `/release`(태그 push → CI 빌드)의 후속 절차.
배경: `docs/RELEASE.md`(절차), `docs/SIGNING.md`(서명·공증 개념).

## 1. draft 찾기

- `gh release list --json tagName,name,isDraft,createdAt`로 draft를 찾는다.
- **draft가 없으면**: `gh run list --workflow=release.yml --limit 1`로 release 워크플로가
  실행 중인지 확인한다.
  - 실행 중이면 `gh run watch <run-id> --exit-status`를 백그라운드로 걸어 완료 후 재개한다.
  - 실행 중이 아니면 게시할 draft가 없다고 알리고 중단한다.
- draft가 여러 개면 사용자에게 어느 것을 게시할지 확인한다.

## 2. 에셋 확인

- draft에 `Arrowly_<버전>_universal.dmg`와 `Arrowly_<버전>_universal.app.tar.gz`가
  모두 있어야 한다. 버전은 태그와 일치해야 한다.
- 없거나 크기가 비정상(수 KB 이하)이면 빌드 로그를 확인하고 중단한다.

## 3. 서명·공증 검증 — 통과 전에는 게시하지 않는다

스크래치 디렉터리에 DMG를 받아 검증한다:

```bash
gh release download <tag> --pattern "*.dmg" --dir "$SCRATCH"
MOUNT=$(mktemp -d)
hdiutil attach "$SCRATCH/Arrowly_<버전>_universal.dmg" -nobrowse -mountpoint "$MOUNT"
spctl -a -vv -t install "$MOUNT/Arrowly.app"        # 필수: "accepted" + "source=Notarized Developer ID"
xcrun stapler validate "$MOUNT/Arrowly.app"          # 필수: "The validate action worked!"
codesign -dv --verbose=2 "$MOUNT/Arrowly.app" 2>&1 | grep TeamIdentifier   # 필수: STRPJDK4MR
hdiutil detach "$MOUNT"
```

주의:

- **반드시 `-mountpoint`로 전용 경로에 마운트한다.** `/Volumes/Arrowly`가 이미 마운트돼
  있으면 기본 마운트가 `/Volumes/Arrowly 1`로 붙어 이전 버전 앱을 검증하게 된다.
- DMG 파일 자체의 `stapler validate`는 실패할 수 있다(Tauri는 앱에만 스테이플). 판정은
  앱 기준으로 한다.
- `spctl`이 `rejected`면 게시하지 않고 빌드 로그를 확인한다. 로그에
  `MAC verification failed during PKCS12 import (wrong password?)`가 있으면 비밀번호가
  아니라 p12 형식 문제다 — OpenSSL 3 기본 형식은 macOS가 못 읽으므로
  `openssl pkcs12 -export -legacy`로 재생성해 `APPLE_CERTIFICATE`를 갱신한다
  (`docs/RELEASE.md` 참조).

## 4. 릴리스 노트

`gh release view <tag> --json body`로 자동 생성 노트를 사용자에게 보여주고 다듬을지
묻는다. 수정 요청이 있으면 `gh release edit <tag> --notes-file <file>`로 반영한다.

## 5. 게시 — 사용자 확인 필수

검증 결과 요약(에셋 목록, spctl 판정, 스테이플, 서명 주체)을 보여주고 게시 여부를
확인받는다. **확인 없이 게시하지 않는다** — 게시 즉시 watch 사용자에게 알림이 나가고
`releases/latest`가 갱신되므로 되돌리기 어렵다.

승인 시:

```bash
gh release edit <tag> --draft=false --latest
```

## 6. 사후 확인

- `gh release view <tag> --json isDraft,publishedAt,url` — `isDraft: false` 확인
- `gh api repos/{owner}/{repo}/releases/latest` — 방금 게시한 태그인지 확인
- 게시된 URL을 안내한다.

## 제약

- 3의 검증을 통과하지 못한 draft는 게시하지 않는다.
- 재빌드가 필요한 상황(에셋 누락, 서명 실패)이면 원인을 보고하고 중단한다 — 이 스킬은
  게시만 담당하고, 재빌드는 태그 재생성(`/release` 또는 수동)으로 처리한다.
- 게시 실행은 항상 사용자 확인 뒤에만 한다.
