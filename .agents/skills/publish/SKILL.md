---
name: publish
description: Arrowly draft Release 검증 후 게시 — 최신 draft를 찾아 설치 파일이 없는지와 CI 빌드 성공을 확인하고, 사용자 확인을 받아 publish한다. "게시해줘", "publish", "릴리스 공개" 요청 시 실행.
---

# Arrowly 릴리스 게시

CI가 만든 변경 내역 전용 draft Release를 검증하고 게시한다. 앱 출시는 App Store 심사로 따로 한다(`docs/RELEASE.md`의 Mac App Store 빌드). `/release`(태그 push → CI 빌드)의 후속 절차.
배경: `docs/RELEASE.md`(절차), `docs/SIGNING.md`(서명·공증 개념).

## 1. draft 찾기

- `gh release list --json tagName,name,isDraft,createdAt`로 draft를 찾는다.
- **draft가 없으면**: `gh run list --workflow=release.yml --limit 1`로 release 워크플로가
  실행 중인지 확인한다.
  - 실행 중이면 `gh run watch <run-id> --exit-status`를 백그라운드로 걸어 완료 후 재개한다.
  - 실행 중이 아니면 게시할 draft가 없다고 알리고 중단한다.
- draft가 여러 개면 사용자에게 어느 것을 게시할지 확인한다.

## 2. 설치 파일이 없는지 확인 — 있으면 게시하지 않는다

판매 중에는 공개 Release에 설치 파일을 두지 않는다(`docs/decisions/paid-distribution.md`).
공개 Release는 변경 내역만 보여 준다. 사용자는 Mac App Store에서 설치·업데이트한다.

- `gh release view <tag> --json assets -q '.assets[].name'` 결과가 비어 있어야 한다.
- `.dmg`, `.app.tar.gz`, `.pkg`, `.zip` 등 에셋이 하나라도 있으면 게시하지 않고 사용자에게 알린다.
  사용자 승인 뒤 `gh release delete-asset <tag> <name> -y`로 지운 다음 다시 확인한다.

## 3. CI 빌드 확인

- `gh run list --workflow=release.yml --branch <tag> --limit 1 --json conclusion,url`로
  해당 태그의 release 워크플로가 `success`인지 확인한다. 이 실행은 Developer ID 서명·공증
  빌드를 러너 안에서만 만들고 `spctl`·`stapler`로 검증한다(게이트 실패 대비 경로 점검).
- 실패면 게시하지 않고 빌드 로그를 확인한다. 로그에
  `MAC verification failed during PKCS12 import (wrong password?)`가 있으면 비밀번호가
  아니라 p12 형식 문제다 — OpenSSL 3 기본 형식은 macOS가 못 읽으므로
  `openssl pkcs12 -export -legacy`로 재생성해 `APPLE_CERTIFICATE`를 갱신한다
  (`docs/RELEASE.md` 참조).

## 4. 릴리스 노트

`gh release view <tag> --json body`로 자동 생성 노트를 사용자에게 보여주고 다듬을지
묻는다. 수정 요청이 있으면 `gh release edit <tag> --notes-file <file>`로 반영한다.

## 5. 게시 — 사용자 확인 필수

검증 결과 요약(에셋 없음, CI 실행 결과)을 보여주고 게시 여부를
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

- 2·3의 확인을 통과하지 못한 draft는 게시하지 않는다.
- 재빌드가 필요한 상황(서명·공증 실패)이면 원인을 보고하고 중단한다 — 이 스킬은
  게시만 담당하고, 재빌드는 태그 재생성(`/release` 또는 수동)으로 처리한다.
- 게시 실행은 항상 사용자 확인 뒤에만 한다.
