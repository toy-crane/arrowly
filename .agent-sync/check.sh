#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
AGENTS_DIR="$ROOT/.agents/skills"
CLAUDE_DIR="$ROOT/.claude/skills"

failures=0
error() {
  printf 'agent-sync: %s\n' "$1" >&2
  failures=$((failures + 1))
}

if [[ ! -f "$ROOT/AGENTS.md" ]]; then
  error "missing AGENTS.md"
fi

if [[ ! -f "$ROOT/CLAUDE.md" ]] || ! grep -Fq '@AGENTS.md' "$ROOT/CLAUDE.md"; then
  error "CLAUDE.md must import @AGENTS.md"
fi

if [[ ! -d "$AGENTS_DIR" || -L "$AGENTS_DIR" ]]; then
  error ".agents/skills must be a real directory"
fi

if [[ ! -d "$CLAUDE_DIR" || -L "$CLAUDE_DIR" ]]; then
  error ".claude/skills must be a real directory containing skill links"
fi

if [[ -d "$AGENTS_DIR" && ! -L "$AGENTS_DIR" ]]; then
  for source in "$AGENTS_DIR"/*; do
    [[ -d "$source" && ! -L "$source" ]] || continue
    name=$(basename "$source")
    [[ -f "$source/SKILL.md" ]] || error ".agents/skills/$name/SKILL.md is missing"

    mirror="$CLAUDE_DIR/$name"
    expected="../../.agents/skills/$name"
    if [[ ! -L "$mirror" ]]; then
      error ".claude/skills/$name must be a symlink to $expected"
    elif [[ "$(readlink "$mirror")" != "$expected" ]]; then
      error ".claude/skills/$name points to $(readlink "$mirror"), expected $expected"
    elif [[ ! -e "$mirror/SKILL.md" ]]; then
      error ".claude/skills/$name points to a missing skill"
    fi
  done
fi

if [[ -d "$CLAUDE_DIR" && ! -L "$CLAUDE_DIR" ]]; then
  for mirror in "$CLAUDE_DIR"/*; do
    [[ -e "$mirror" || -L "$mirror" ]] || continue
    name=$(basename "$mirror")
    [[ -d "$AGENTS_DIR/$name" ]] || error ".claude/skills/$name has no canonical .agents/skills counterpart"
    [[ -L "$mirror" ]] || error ".claude/skills/$name must be a symlink, not a duplicate directory"
  done
fi

if (( failures > 0 )); then
  printf 'agent-sync: %d check(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'agent-sync: Claude Code and Codex configuration is in sync\n'
