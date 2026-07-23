import { Fragment, ReactNode } from "react";

// 영어가 원본. 키 추가·삭제는 여기서 하고 ko가 따라간다.
const en = {
  "onboarding.draw.title": "Draw one mark",
  "onboarding.draw.body": "Draw freely in the area below, just like you would on screen.",
  "onboarding.draw.startShortcut": "Start drawing",
  "onboarding.correct.title": "Fix the mark you just drew",
  "onboarding.correct.body": "Move the same mark, delete it, then bring it back.",
  "onboarding.correct.move": "Move a mark",
  "onboarding.correct.delete": "Delete one mark",
  "onboarding.correct.undo": "Undo",
  "onboarding.correct.drag": "drag",
  "onboarding.correct.click": "click",
  "onboarding.finish.title": "Clear the screen and finish",
  "onboarding.finish.body": "Clear every mark, then finish drawing to complete the tutorial.",
  "onboarding.finish.clear": "Clear all marks",
  "onboarding.finish.clearHint": "Clear the current screen at once",
  "onboarding.finish.exit": "Finish drawing",
  "onboarding.finish.exitHint": "Return to the screen underneath",
  "onboarding.finish.cleared": "The screen is clear",
  "onboarding.finish.escape": "Press Esc to finish onboarding",
  "onboarding.back": "Back",
  "onboarding.next": "Next",
  "shortcut.toggle": "Toggle drawing",
  "shortcut.board": "Toggle blackboard",
  "shortcut.clear": "Clear all",
  "shortcut.text": "Typing text",
  "shortcut.recording": "Press a new shortcut…",
  "shortcut.reset": "Reset",
  "shortcut.error.undo": "This key is used for Undo",
  "shortcut.error.modifierRequired": "Use at least one modifier key",
  "shortcut.error.duplicate": "This shortcut is already assigned",
  "shortcut.error.invalid": "Unrecognized combination",
  "shortcut.error.reservedEsc": "Esc is a reserved key",
  "shortcut.error.reservedDelete": "E is reserved for the mark deletion tool",
  "shortcut.error.inUse": "This combination is already used by another app",
  "shortcut.error.generic": "Couldn't set this shortcut",
  "settings.title": "Shortcuts",
  "settings.undo": "Undo",
  "settings.exit": "Exit",
  "settings.textLarger": "Current tool larger",
  "settings.textSmaller": "Current tool smaller",
  "settings.deleteTool": "Mark deletion tool",
  "settings.fixed": "Fixed",
  "marker.drawingTool": "Drawing tool",
  "marker.textTool": "Text tool",
  "marker.deleteTool": "Mark deletion tool",
  "marker.drawingProperties": "Drawing properties",
  "marker.textProperties": "Text properties",
  "marker.drawingToolsLabel": "Drawing tools",
  "marker.drawingTool.freehand": "Freehand tool",
  "marker.drawingTool.arrow": "Arrow tool",
  "marker.drawingTool.rect": "Rectangle tool",
  "marker.drawingTool.ellipse": "Ellipse tool",
  "marker.drawingTool.triangle": "Triangle tool",
  "marker.colorLabel": "Color",
  "marker.widthLabel": "Thickness",
  "marker.textSizeLabel": "Size",
  "marker.colorValue": "Color {value}",
  "marker.widthValue": "Thickness {value}",
  "marker.colorName.yellow": "yellow",
  "marker.colorName.orange": "orange",
  "marker.colorName.pink": "pink",
  "marker.colorName.green": "green",
  "marker.colorName.blue": "blue",
  "marker.widthName.xthin": "extra thin",
  "marker.widthName.thin": "thin",
  "marker.widthName.medium": "medium",
  "marker.widthName.thick": "thick",
  "marker.widthName.xthick": "extra thick",
  "marker.toggleBoard": "Toggle blackboard",
  "marker.textSizeValue": "Text size {value}px",
} as const;

export type Key = keyof typeof en;

const ko: Record<Key, string> = {
  "onboarding.draw.title": "마크 하나를 그려보세요",
  "onboarding.draw.body": "실제 화면처럼 아래 영역에 마우스로 자유롭게 그려보세요.",
  "onboarding.draw.startShortcut": "그리기 시작",
  "onboarding.correct.title": "방금 그린 마크를 고쳐보세요",
  "onboarding.correct.body": "같은 마크를 옮기고 지운 뒤 되돌리면서 교정 방법을 익힙니다.",
  "onboarding.correct.move": "마크 옮기기",
  "onboarding.correct.delete": "마크 하나 지우기",
  "onboarding.correct.undo": "되돌리기",
  "onboarding.correct.drag": "드래그",
  "onboarding.correct.click": "클릭",
  "onboarding.finish.title": "화면을 비우고 끝내보세요",
  "onboarding.finish.body": "마크를 모두 지운 뒤 그리기를 끝내면 첫 실습이 완료됩니다.",
  "onboarding.finish.clear": "마크 모두 지우기",
  "onboarding.finish.clearHint": "현재 화면을 한 번에 비웁니다",
  "onboarding.finish.exit": "그리기 끝내기",
  "onboarding.finish.exitHint": "원래 화면으로 돌아갑니다",
  "onboarding.finish.cleared": "화면을 비웠습니다",
  "onboarding.finish.escape": "Esc를 누르면 온보딩이 끝납니다",
  "onboarding.back": "이전",
  "onboarding.next": "다음",
  "shortcut.toggle": "그리기 토글",
  "shortcut.board": "블랙보드 토글",
  "shortcut.clear": "전체 지우기",
  "shortcut.text": "텍스트 입력",
  "shortcut.recording": "새 단축키를 누르세요…",
  "shortcut.reset": "기본값",
  "shortcut.error.undo": "실행 취소에 쓰이는 키예요",
  "shortcut.error.modifierRequired": "수식 키를 하나 이상 함께 누르세요",
  "shortcut.error.duplicate": "이미 다른 동작에 지정된 단축키예요",
  "shortcut.error.invalid": "인식할 수 없는 조합",
  "shortcut.error.reservedEsc": "Esc는 예약된 키예요",
  "shortcut.error.reservedDelete": "E는 마크 삭제 도구에 예약된 키예요",
  "shortcut.error.inUse": "이 조합은 다른 곳에서 사용 중이에요",
  "shortcut.error.generic": "단축키를 설정하지 못했어요",
  "settings.title": "단축키",
  "settings.undo": "실행 취소",
  "settings.exit": "빠져나가기",
  "settings.textLarger": "현재 도구 크게",
  "settings.textSmaller": "현재 도구 작게",
  "settings.deleteTool": "마크 삭제 도구",
  "settings.fixed": "고정",
  "marker.drawingTool": "그리기 도구",
  "marker.textTool": "텍스트 도구",
  "marker.deleteTool": "마크 삭제 도구",
  "marker.drawingProperties": "그리기 속성",
  "marker.textProperties": "텍스트 속성",
  "marker.drawingToolsLabel": "그리기 도구",
  "marker.drawingTool.freehand": "자유곡선 도구",
  "marker.drawingTool.arrow": "화살표 도구",
  "marker.drawingTool.rect": "사각형 도구",
  "marker.drawingTool.ellipse": "타원 도구",
  "marker.drawingTool.triangle": "삼각형 도구",
  "marker.colorLabel": "색",
  "marker.widthLabel": "굵기",
  "marker.textSizeLabel": "크기",
  "marker.colorValue": "색 {value}",
  "marker.widthValue": "굵기 {value}",
  "marker.colorName.yellow": "노랑",
  "marker.colorName.orange": "주황",
  "marker.colorName.pink": "분홍",
  "marker.colorName.green": "초록",
  "marker.colorName.blue": "파랑",
  "marker.widthName.xthin": "매우 얇음",
  "marker.widthName.thin": "얇음",
  "marker.widthName.medium": "보통",
  "marker.widthName.thick": "굵음",
  "marker.widthName.xthick": "매우 굵음",
  "marker.toggleBoard": "블랙보드 토글",
  "marker.textSizeValue": "텍스트 크기 {value}px",
};

// 시스템 언어 자동 감지 — Rust 쪽(i18n.rs)과 같은 소스(macOS 선호 언어)·같은 규칙
export const lang: "en" | "ko" = navigator.language?.toLowerCase().startsWith("ko") ? "ko" : "en";

const dict: Record<Key, string> = lang === "ko" ? ko : en;

const TOKEN = /\{(\w+)\}/g;

/** 일반 문자열. {name} 토큰을 params 값으로 치환한다. */
export function t(key: Key, params?: Record<string, string | number>): string {
  return dict[key].replace(TOKEN, (m, name) => (params && name in params ? String(params[name]) : m));
}

/** {name} 토큰을 ReactNode 슬롯으로 치환 — 토큰 반복·언어별 어순 차이를 흡수한다. */
export function tx(key: Key, slots: Record<string, ReactNode>): ReactNode[] {
  // 캡처 그룹이 있는 split은 홀수 인덱스에 토큰 이름을 남긴다
  return dict[key]
    .split(TOKEN)
    .map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{slots[part]}</Fragment> : part));
}

/** Rust invoke 에러(안정 코드 문자열)를 사전 키로 변환. 미매핑 코드는 generic. */
const ERROR_KEYS: Record<string, Key> = {
  "error:invalid_shortcut": "shortcut.error.invalid",
  "error:reserved_escape": "shortcut.error.reservedEsc",
  "error:reserved_delete": "shortcut.error.reservedDelete",
  "error:reserved_undo": "shortcut.error.undo",
  "error:modifier_required": "shortcut.error.modifierRequired",
  "error:duplicate_shortcut": "shortcut.error.duplicate",
  "error:shortcut_in_use": "shortcut.error.inUse",
};

export function shortcutErrorMessage(err: unknown): string {
  return t(ERROR_KEYS[String(err)] ?? "shortcut.error.generic");
}
