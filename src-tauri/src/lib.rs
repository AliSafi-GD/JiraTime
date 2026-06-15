mod jira;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Wry, WindowEvent,
};

// keep handles to the tray menu items so their text can follow the UI language
struct TrayItems {
    show: MenuItem<Wry>,
    hide: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

/// Update tray menu labels to match the chosen UI language.
#[tauri::command]
fn set_tray_language(items: tauri::State<'_, TrayItems>, lang: String) {
    let (show, hide, quit) = if lang == "en" {
        ("Show", "Hide", "Quit")
    } else {
        ("نمایش", "مخفی کردن", "خروج")
    };
    let _ = items.show.set_text(show);
    let _ = items.hide.set_text(hide);
    let _ = items.quit.set_text(quit);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "نمایش", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "مخفی کردن", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "خروج", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            app.manage(TrayItems {
                show: show.clone(),
                hide: hide.clone(),
                quit: quit.clone(),
            });

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Jira Time Tracker")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        // closing the window hides it to the tray instead of quitting
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_tray_language,
            jira::test_and_save_credentials,
            jira::has_credentials,
            jira::clear_credentials,
            jira::search_issues,
            jira::get_boards,
            jira::get_board_sprints,
            jira::get_agile_issues,
            jira::get_transitions,
            jira::apply_transition,
            jira::add_worklog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
