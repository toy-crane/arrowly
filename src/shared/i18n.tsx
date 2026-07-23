import { Fragment, ReactNode } from "react";

// 영어가 원본. 키 추가·삭제는 여기서 하고 ko가 따라간다.
const en = {
  "onboarding.draw.title": "Try drawing",
  "onboarding.draw.body": "Draw anything in the box below with your mouse. Once you finish {hi}, you can move on.",
  "onboarding.draw.hi": "one stroke",
  "onboarding.shortcut.title": "Choose your shortcuts",
  "onboarding.shortcut.body": "Click a field, then press the combination you want to use.",
  "onboarding.shortcut.textHint": "Press T then click for new text; double-click text to edit or elsewhere to ping. Hold ⌘ and drag to move; hold ⌥ and click to delete. E locks deletion, and ⌘+/⌘− resizes the current tool.",
  "onboarding.erase.title": "Undo and exit",
  "onboarding.erase.body":
    "Made a mistake? Press {cmd}{z} to undo one stroke at a time. While drawing, {board} turns {hi} — your strokes stay. Press {esc} anytime to exit. Try drawing below, then press {board}.",
  "onboarding.erase.hi": "the screen into a blackboard",
  "onboarding.menubar": "You can change these later from the {arrow} menu bar icon.",
  "onboarding.back": "Back",
  "onboarding.next": "Next",
  "onboarding.start": "Get started",
  "onboarding.arrowIcon": "Arrow icon",
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
  "marker.drawingTool.line": "Line tool",
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
  "onboarding.draw.title": "그려 보기",
  "onboarding.draw.body": "아래 칸에 마우스로 아무거나 그려 보세요. {hi}을 그으면 다음으로 넘어갈 수 있어요.",
  "onboarding.draw.hi": "한 획",
  "onboarding.shortcut.title": "단축키 정하기",
  "onboarding.shortcut.body": "필드를 누른 다음 원하는 키 조합을 입력하세요.",
  "onboarding.shortcut.textHint": "T를 누른 뒤 클릭해 새 텍스트를 쓰고, 텍스트 더블클릭은 편집, 그 밖의 더블클릭은 핑을 표시해요. ⌘ 드래그는 이동, ⌥ 클릭은 삭제예요. E는 삭제를 잠그고, ⌘+/⌘−는 현재 도구 크기를 바꿉니다.",
  "onboarding.erase.title": "지우기와 빠져나가기",
  "onboarding.erase.body":
    "그리다 실수하면 {cmd}{z}로 한 획씩 취소돼요. 그리는 중 {board}를 누르면 {hi}이 되고 그림은 그대로 남아요. {esc}로 언제든 빠져나옵니다. 아래에서 그리고 {board}를 눌러 보세요.",
  "onboarding.erase.hi": "화면이 검은 칠판",
  "onboarding.menubar": "나중에 메뉴바의 {arrow} 아이콘에서 다시 바꿀 수 있어요.",
  "onboarding.back": "이전",
  "onboarding.next": "다음",
  "onboarding.start": "시작하기",
  "onboarding.arrowIcon": "화살표 아이콘",
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
  "marker.drawingTool.line": "직선 도구",
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
