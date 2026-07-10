---
name: release
description: Arrowly 릴리스 실행 — 버전 3곳 동기화, 커밋, v* 태그 push로 CI 릴리스 빌드(.github/workflows/release.yml)를 발동한다. 사용자가 /release로 직접 호출할 때만 실행.
disable-model-invocation: true
---

# Arrowly 릴리스

버전을 올리고 태그를 push해 CI 릴리스 빌드를 발동한다. 산출물은 draft Release + 서명·공증된 universal DMG
(배경: `docs/RELEASE.md`).

인자(`$ARGUMENTS`, 선택): `patch` | `minor` | `major` 또는 명시 버전(예: `0.3.0`).

## 1. 사전 검증 — 틀린 상태에서 시작하지 않는다

- `git fetch origin main --tags`
- 작업 트리에 미커밋 변경이 있으면 **중단**하고 알린다.
- 마지막 `v*` 태그(prerelease 제외한 최신)와 `origin/main` 사이의 커밋을 확인한다.
  새 커밋이 없으면 "릴리스할 변경이 없다"고 알리고 중단한다.
- 현재 버전을 읽는다: `src-tauri/tauri.conf.json`의 `version`.

## 2. 버전 결정

- 인자가 있으면 그대로 쓴다.
- 없으면 1의 커밋 목록을 분석해 제안한다: `feat:` 커밋이 있으면 **minor**, 그 외(`fix:`/`chore:` 등)만 있으면
  **patch**. major는 사용자가 명시할 때만.
- 제안 근거(커밋 요약)와 함께 AskUserQuestion으로 사용자 확인을 받고 진행한다.

## 3. 버전 동기화 — 세 곳을 반드시 함께

새 버전으로 다음 세 파일을 갱신한다 (하나라도 어긋나면 DMG 파일명·번들 메타데이터가 태그와 어긋난다):

1. `src-tauri/tauri.conf.json` — `"version"` (DMG 파일명 `Arrowly_<version>_universal.dmg`의 출처)
2. `package.json` — `"version"`
3. `src-tauri/Cargo.toml` — `version` (갱신 후 `Cargo.lock`의 arrowly 항목도 함께 바뀌면 포함)

`chore: bump version to X.Y.Z` 커밋을 만들고 `git push origin main`.

## 4. 태그 — 항상 커밋을 명시한다

- bump 커밋이 `origin/main`에 반영된 것을 확인한 뒤:
  ```bash
  git fetch origin main        # 로컬 origin/main ref 최신화
  git tag vX.Y.Z origin/main   # HEAD가 아니라 origin/main에 꽂는다
  git push origin vX.Y.Z
  ```
- `git tag vX.Y.Z`처럼 HEAD에 찍지 않는다 — 워크트리/기능 브랜치에서 실행해도 안전해야 한다.
- 태그 버전과 3의 파일 버전은 반드시 일치해야 한다. prerelease는 `v0.2.0-beta` 형식.

## 5. 사후 확인

- push 직후 Actions의 release 워크플로 실행 링크를 안내한다
  (https://github.com/toy-crane/arrowly/actions/workflows/release.yml).
- 빌드(~10–20분) 완료 후 Releases 탭에 draft가 생긴다: DMG 에셋 + 자동 생성 노트.
- **Publish는 사용자가 직접 누른다** — 스킬이 draft를 자동 공개하지 않는다.

## 원격(웹) 세션 제약

Claude Code 웹/원격 세션의 git 프록시는 `claude/*` 브랜치 외의 ref 쓰기(main push, 태그 push)를
403으로 차단한다. 우회하지 말고 다음으로 대체한다:

- **3의 main push가 403이면**: bump 커밋을 `claude/release-vX.Y.Z` 브랜치로 push하고 PR을 만들어
  사용자가 머지하게 한다.
- **4의 태그 push는 항상 사용자 몫** — bump가 main에 반영된 뒤 로컬 터미널에서 실행할 명령을 건넨다:
  ```bash
  git fetch origin main
  git tag vX.Y.Z origin/main
  git push origin vX.Y.Z
  ```
