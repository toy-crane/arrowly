# Arrowly

macOS 화면 주석 오버레이 앱. 요구사항은 `docs/REQUIREMENTS.md` 참고.

## 스택

Tauri v2 + Vite/React/TypeScript + Bun. 타깃 macOS.

## 프로젝트 구조와 경계

- 파일 배치·레이어 모델·네이밍의 단일 소스는 `docs/ARCHITECTURE.md`다. 새 파일을 만들기 전에 반드시 확인한다.
- 핵심 규칙: 도메인 단위 구성, 의존은 한 방향(역참조·교차 도메인 import 금지), FE 파일명은 kebab-case.
- 프런트 경계는 dependency-cruiser가 강제한다 — 구조를 바꾸면 `bun run depcruise`를 실행한다(위반 = CI 실패).
- Rust↔웹뷰 계약(커맨드·이벤트)은 `src/shared/ipc/`가, settings.json 스키마는 `src/shared/settings.ts` ↔ `src-tauri/src/store.rs` lockstep이 단일 소스다.

## Tauri v2

- 이 프로젝트는 Tauri v2를 쓴다. v1 API를 생성하지 않는다.
- Tauri API는 학습 기억이 아니라 공식 `https://tauri.app/llms-full.txt`를 fetch해 v2 기준으로 확인한 뒤 작성한다.

## 공통 에이전트 운영 규칙

- 이 파일은 Claude Code와 Codex가 함께 읽는 프로젝트 공통 지침의 원본이다.
- 공통 스킬은 `.agents/skills/<skill>/SKILL.md`만 수정한다. Claude Code의 `.claude/skills/`는 이 디렉터리를 가리키는 미러다.
- 에이전트별 설정은 각 도구의 전용 영역에 둔다. Claude Code 전용 설정은 `.claude/`, Codex 전용 설정은 사용자 Codex 설정에 둔다.
- 스킬이나 공통 규칙을 바꾼 뒤에는 `bun run agent:sync-check`를 실행한다.
- 변경을 마치면 관련 검증을 실행하고, 논리적 작업 단위별로 conventional commit을 만든다. 사용자가 요청하지 않은 원격 push는 하지 않는다.

## 기본 명령

- 개발 서버: `bun run dev`
- 프런트엔드 빌드/타입 검사: `bun run build`
- Tauri 개발 실행: `bun run tauri dev`
