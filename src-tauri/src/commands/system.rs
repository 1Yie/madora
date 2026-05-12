#[tauri::command]
pub async fn show_window(window: tauri::Window) {
    window.show().unwrap();
}