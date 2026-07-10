# 공유 에이전트 설정

이 디렉터리는 Claude Code와 Codex가 함께 사용하는 저장소별 스킬의 원본이다.

## 구조

- `../AGENTS.md`: 두 도구가 공유하는 프로젝트 규칙
- `skills/<name>/SKILL.md`: 공유 스킬의 원본
- `../.claude/skills/<name>`: Claude Code용 심볼릭 링크 미러
- `../.claude/settings.json`, `../.claude/launch.json`: Claude Code 전용 설정

새 스킬을 추가하거나 기존 스킬을 수정할 때는 `.agents/skills/`만 편집한다. Claude Code
미러가 깨졌거나 두 도구의 스킬 목록이 어긋났는지는 다음 명령으로 확인한다.

```bash
bun run agent:sync-check
```
