use crate::i18n;

#[tauri::command]
pub async fn show_window(window: tauri::Window) {
    window.show().unwrap();
}

#[tauri::command]
pub async fn set_app_locale(locale: String) {
    i18n::set_locale(&locale);
}
