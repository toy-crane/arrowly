//! 트레이 메뉴 로컬라이즈. 시스템 언어가 ko*면 한국어, 그 외는 영어.
//! 웹뷰 쪽은 navigator.language로 같은 소스를 독립 감지한다(src/shared/i18n.tsx).
//! 단축키 에러는 안정 코드 문자열로 반환해 웹뷰 사전이 번역한다(shortcuts.rs 참조).

use std::sync::OnceLock;

pub struct TrayText {
    pub start_drawing: &'static str,
    pub stop_drawing: &'static str,
    pub blackboard: &'static str,
    pub clear_all: &'static str,
    pub hide_marker: &'static str,
    pub launch_at_login: &'static str,
    pub shortcut_settings: &'static str,
    pub replay_tutorial: &'static str,
    pub quit: &'static str,
}

static EN: TrayText = TrayText {
    start_drawing: "Start Drawing",
    stop_drawing: "Stop Drawing",
    blackboard: "Blackboard",
    clear_all: "Clear All",
    hide_marker: "Hide Marker",
    launch_at_login: "Launch at Login",
    shortcut_settings: "Shortcut Settings…",
    replay_tutorial: "Replay Tutorial",
    quit: "Quit Arrowly",
};

static KO: TrayText = TrayText {
    start_drawing: "그리기 시작",
    stop_drawing: "그리기 중지",
    blackboard: "블랙보드",
    clear_all: "전체 지우기",
    hide_marker: "마커 숨기기",
    launch_at_login: "로그인 시 실행",
    shortcut_settings: "단축키 설정…",
    replay_tutorial: "튜토리얼 다시 보기",
    quit: "Arrowly 종료",
};

pub fn tray() -> &'static TrayText {
    // 로케일 변경은 macOS에서도 앱 재시작이 필요하므로 1회만 감지한다
    static IS_KO: OnceLock<bool> = OnceLock::new();
    let ko = *IS_KO.get_or_init(|| {
        sys_locale::get_locale()
            .map(|l| l.to_lowercase().starts_with("ko"))
            .unwrap_or(false)
    });
    select(if ko { Some("ko") } else { Some("en") })
}

fn select(locale: Option<&str>) -> &'static TrayText {
    if locale.is_some_and(|value| value.to_lowercase().starts_with("ko")) {
        &KO
    } else {
        &EN
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_selection_is_korean_only_for_ko_prefix() {
        assert_eq!(select(Some("ko-KR")).start_drawing, "그리기 시작");
        assert_eq!(select(Some("KO_kr")).quit, "Arrowly 종료");
        assert_eq!(select(Some("en-US")).start_drawing, "Start Drawing");
        assert_eq!(select(None).quit, "Quit Arrowly");
    }

    #[test]
    fn both_dictionaries_define_every_tray_label() {
        for text in [&EN, &KO] {
            assert!(!text.start_drawing.is_empty());
            assert!(!text.stop_drawing.is_empty());
            assert!(!text.blackboard.is_empty());
            assert!(!text.clear_all.is_empty());
            assert!(!text.hide_marker.is_empty());
            assert!(!text.launch_at_login.is_empty());
            assert!(!text.shortcut_settings.is_empty());
            assert!(!text.replay_tutorial.is_empty());
            assert!(!text.quit.is_empty());
        }
    }
}
