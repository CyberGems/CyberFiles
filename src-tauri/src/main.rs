use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_window_state::{StateFlags, WindowExt as WindowStateExt};

#[derive(Serialize)]
struct RuntimeInfo {
    app_name: &'static str,
    version: &'static str,
    platform: &'static str,
    mode: &'static str,
}

struct TrayMenuState {
    toggle: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
    english: Mutex<bool>,
    shortcut_hint: Mutex<Option<String>>,
    tray: Mutex<Option<TrayIcon<tauri::Wry>>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GlobalShortcutPreferences {
    enabled: bool,
    shortcut: String,
}

impl Default for GlobalShortcutPreferences {
    fn default() -> Self {
        Self {
            enabled: true,
            shortcut: "Alt+Shift+F".to_string(),
        }
    }
}

struct GlobalShortcutState {
    preferences: Mutex<GlobalShortcutPreferences>,
    registered: Mutex<Option<String>>,
    config_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GlobalShortcutStatus {
    enabled: bool,
    shortcut: String,
    registered: bool,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        app_name: "CyberFiles",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        mode: "development",
    }
}

#[tauri::command]
fn show_main_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_main_window(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(path) = window_state_path(&app) {
        let _ = save_window_state(&window, &path);
    }
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn quit_app(window: tauri::WebviewWindow, app: tauri::AppHandle) {
    if let Ok(path) = window_state_path(&app) {
        let _ = save_window_state(&window, &path);
    }
    app.exit(0);
}

fn global_shortcut_config_path<R: tauri::Runtime, M: Manager<R>>(
    app: &M,
) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("cyberfiles-global-shortcut.json"))
        .map_err(|error| error.to_string())
}

fn load_global_shortcut_preferences(path: &Path) -> GlobalShortcutPreferences {
    let Ok(contents) = fs::read(path) else {
        return GlobalShortcutPreferences::default();
    };
    let Ok(preferences) = serde_json::from_slice::<GlobalShortcutPreferences>(&contents) else {
        return GlobalShortcutPreferences::default();
    };
    if preferences.shortcut.contains('+')
        && preferences
            .shortcut
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .is_ok()
    {
        preferences
    } else {
        GlobalShortcutPreferences::default()
    }
}

fn save_global_shortcut_preferences(
    path: &Path,
    preferences: &GlobalShortcutPreferences,
) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Global shortcut config path has no parent directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let contents = serde_json::to_vec(preferences).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn global_shortcut_status(state: &GlobalShortcutState) -> Result<GlobalShortcutStatus, String> {
    let preferences = state
        .preferences
        .lock()
        .map_err(|error| error.to_string())?;
    let registered = state.registered.lock().map_err(|error| error.to_string())?;
    Ok(GlobalShortcutStatus {
        enabled: preferences.enabled,
        shortcut: preferences.shortcut.clone(),
        registered: registered.is_some(),
    })
}

#[tauri::command]
fn get_global_shortcut_settings(app: tauri::AppHandle) -> Result<GlobalShortcutStatus, String> {
    global_shortcut_status(&app.state::<GlobalShortcutState>())
}

#[tauri::command]
fn set_global_shortcut_settings(
    enabled: bool,
    shortcut: String,
    app: tauri::AppHandle,
) -> Result<GlobalShortcutStatus, String> {
    if !shortcut.contains('+') {
        return Err("A global shortcut must include at least one modifier key".to_string());
    }
    shortcut
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|error| error.to_string())?;

    let state = app.state::<GlobalShortcutState>();
    let mut preferences = state
        .preferences
        .lock()
        .map_err(|error| error.to_string())?;
    let mut registered = state.registered.lock().map_err(|error| error.to_string())?;
    let previous_preferences = preferences.clone();
    let previous_registered = registered.clone();
    let next_preferences = GlobalShortcutPreferences {
        enabled,
        shortcut: shortcut.clone(),
    };
    let next_registered = enabled.then_some(shortcut.clone());
    let shortcut_manager = app.global_shortcut();
    let mut newly_registered = false;

    if enabled && previous_registered.as_deref() != Some(shortcut.as_str()) {
        shortcut_manager
            .register(shortcut.as_str())
            .map_err(|error| error.to_string())?;
        newly_registered = true;
    }

    if let Err(error) = save_global_shortcut_preferences(&state.config_path, &next_preferences) {
        if newly_registered {
            let _ = shortcut_manager.unregister(shortcut.as_str());
        }
        return Err(error);
    }

    if let Some(previous) = previous_registered.as_deref() {
        if Some(previous) != next_registered.as_deref() {
            if let Err(error) = shortcut_manager.unregister(previous) {
                let _ = save_global_shortcut_preferences(&state.config_path, &previous_preferences);
                if newly_registered {
                    let _ = shortcut_manager.unregister(shortcut.as_str());
                }
                return Err(error.to_string());
            }
        }
    }

    *preferences = next_preferences;
    *registered = next_registered;
    drop(registered);
    drop(preferences);

    update_tray_hotkey_hint(&app, enabled.then_some(shortcut.as_str()))?;

    global_shortcut_status(&state)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFolderEntry {
    name: String,
    path: String,
    is_folder: bool,
    size: u64,
    modified_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryListing {
    root_path: String,
    root_name: String,
    entries: Vec<NativeFolderEntry>,
    has_more: bool,
    next_offset: usize,
}

const DIRECTORY_PAGE_SIZE: usize = 400;

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(target_os = "windows")]
    {
        if let Some(unc_path) = value.strip_prefix("\\\\?\\UNC\\") {
            return format!("\\\\{unc_path}");
        }
        if let Some(drive_path) = value.strip_prefix("\\\\?\\") {
            return drive_path.to_string();
        }
    }
    value.to_string()
}

#[tauri::command]
async fn list_directory(path: String, offset: usize) -> Result<DirectoryListing, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root =
            fs::canonicalize(&path).map_err(|error| format!("Cannot access folder: {error}"))?;
        if !root.is_dir() {
            return Err("The selected location is not a folder.".to_string());
        }

        let root_name = root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string());
        let read_dir =
            fs::read_dir(&root).map_err(|error| format!("Cannot read folder: {error}"))?;
        // Read only one page and do not recurse. The blocking filesystem work runs
        // off the UI thread so slow disks and network folders remain responsive.
        let raw_entries: Vec<_> = read_dir
            .flatten()
            .skip(offset)
            .take(DIRECTORY_PAGE_SIZE + 1)
            .collect();
        let has_more = raw_entries.len() > DIRECTORY_PAGE_SIZE;
        let page_len = raw_entries.len().min(DIRECTORY_PAGE_SIZE);
        let mut entries = Vec::with_capacity(page_len);

        for entry in raw_entries.into_iter().take(page_len) {
            let entry_path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&entry_path) else {
                continue;
            };
            // Do not follow links outside the user-selected workspace.
            if metadata.file_type().is_symlink() {
                continue;
            }

            let is_folder = metadata.is_dir();
            let modified_ms = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|duration| duration.as_millis().try_into().ok());

            entries.push(NativeFolderEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: display_path(&entry_path),
                is_folder,
                size: if is_folder { 0 } else { metadata.len() },
                modified_ms,
            });
        }

        Ok(DirectoryListing {
            root_path: display_path(&root),
            root_name,
            entries,
            has_more,
            next_offset: offset + page_len,
        })
    })
    .await
    .map_err(|error| format!("Folder scan worker failed: {error}"))?
}

#[tauri::command]
async fn image_thumbnail(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_path = Path::new(&path);
        let extension = file_path
            .extension()?
            .to_string_lossy()
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "bmp" | "gif" | "jpeg" | "jpg" | "png" | "webp"
        ) {
            return None;
        }
        if fs::metadata(file_path).ok()?.len() > 64 * 1024 * 1024 {
            return None;
        }

        let mut reader = image::ImageReader::open(file_path)
            .ok()?
            .with_guessed_format()
            .ok()?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(12_000);
        limits.max_image_height = Some(12_000);
        limits.max_alloc = Some(64 * 1024 * 1024);
        reader.limits(limits);

        let thumbnail = reader.decode().ok()?.thumbnail(256, 176);
        let mut png = Cursor::new(Vec::new());
        thumbnail.write_to(&mut png, image::ImageFormat::Png).ok()?;
        Some(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png.into_inner())
        ))
    })
    .await
    .ok()
    .flatten()
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredWindowState {
    monitor_name: Option<String>,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn window_state_path<R: tauri::Runtime, M: Manager<R>>(app: &M) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("cyberfiles-window.json"))
        .map_err(|error| error.to_string())
}

fn save_window_state(window: &tauri::WebviewWindow, path: &PathBuf) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?);
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor = monitor.ok_or("No monitor is available to save window state")?;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let state = StoredWindowState {
        monitor_name: monitor.name().cloned(),
        monitor_x: monitor_position.x,
        monitor_y: monitor_position.y,
        monitor_width: monitor_size.width,
        monitor_height: monitor_size.height,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };

    let parent = path
        .parent()
        .ok_or("Window state path has no parent directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(
        path,
        serde_json::to_vec(&state).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn restore_window_state(window: &tauri::WebviewWindow, path: &PathBuf) -> Result<bool, String> {
    let Ok(encoded_state) = fs::read(path) else {
        return Ok(false);
    };
    let Ok(state) = serde_json::from_slice::<StoredWindowState>(&encoded_state) else {
        return Ok(false);
    };
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Ok(false);
    }

    let monitor = state
        .monitor_name
        .as_ref()
        .and_then(|name| {
            monitors
                .iter()
                .find(|monitor| monitor.name().map(String::as_str) == Some(name.as_str()))
        })
        .or_else(|| {
            monitors.iter().min_by_key(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                i64::from(position.x.saturating_sub(state.monitor_x)).abs()
                    + i64::from(position.y.saturating_sub(state.monitor_y)).abs()
                    + i64::from(size.width.abs_diff(state.monitor_width))
                    + i64::from(size.height.abs_diff(state.monitor_height))
            })
        })
        .ok_or("No monitor is available to restore window state")?;

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let width = state.width.min(monitor_size.width).max(1024);
    let height = state.height.min(monitor_size.height).max(680);
    let max_x = monitor_position
        .x
        .saturating_add(monitor_size.width as i32)
        .saturating_sub(width as i32);
    let max_y = monitor_position
        .y
        .saturating_add(monitor_size.height as i32)
        .saturating_sub(height as i32);
    let x = monitor_position
        .x
        .saturating_add(state.x.saturating_sub(state.monitor_x))
        .clamp(monitor_position.x, max_x.max(monitor_position.x));
    let y = monitor_position
        .y
        .saturating_add(state.y.saturating_sub(state.monitor_y))
        .clamp(monitor_position.y, max_y.max(monitor_position.y));

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    Ok(true)
}

fn refresh_tray_toggle_label(
    app: &tauri::AppHandle,
    toggle: &MenuItem<tauri::Wry>,
    window: &tauri::WebviewWindow,
) {
    let state = app.state::<TrayMenuState>();
    let english = state.english.lock().map(|value| *value).unwrap_or(false);
    let shortcut_hint = state
        .shortcut_hint
        .lock()
        .map(|value| value.clone())
        .unwrap_or(None);
    let visible = window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false);
    let label = match (english, visible) {
        (true, true) => "Hide CyberFiles",
        (true, false) => "Show CyberFiles",
        (false, true) => "Ocultar CyberFiles",
        (false, false) => "Mostrar CyberFiles",
    };
    let text = shortcut_hint.map_or_else(|| label.to_string(), |hint| format!("{label}    {hint}"));
    let _ = toggle.set_text(text);
}

fn update_tray_hotkey_hint(app: &tauri::AppHandle, shortcut: Option<&str>) -> Result<(), String> {
    let state = app.state::<TrayMenuState>();
    *state
        .shortcut_hint
        .lock()
        .map_err(|error| error.to_string())? = shortcut.map(str::to_string);

    if let Some(tray) = state
        .tray
        .lock()
        .map_err(|error| error.to_string())?
        .as_ref()
    {
        let tooltip = shortcut.map_or_else(
            || "CyberFiles".to_string(),
            |key| format!("CyberFiles · {key}"),
        );
        let _ = tray.set_tooltip(Some(tooltip));
    }
    if let Some(window) = app.get_webview_window("main") {
        refresh_tray_toggle_label(app, &state.toggle, &window);
    }
    Ok(())
}

fn toggle_main_window(app: &tauri::AppHandle, toggle: &MenuItem<tauri::Wry>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false) {
        if let Ok(path) = window_state_path(app) {
            let _ = save_window_state(&window, &path);
        }
        let _ = window.hide();
    } else {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    refresh_tray_toggle_label(app, toggle, &window);
}

#[tauri::command]
fn set_tray_language(language: String, app: tauri::AppHandle) -> Result<(), String> {
    let english = language == "en";
    let state = app.state::<TrayMenuState>();
    *state.english.lock().map_err(|error| error.to_string())? = english;
    if let Some(window) = app.get_webview_window("main") {
        refresh_tray_toggle_label(&app, &state.toggle, &window);
    }
    let _ = state.quit.set_text(if english { "Quit" } else { "Salir" });
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeDrive {
    id: String,
    letter: String,
    label: String,
    total_bytes: u64,
    used_bytes: u64,
    kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeLocation {
    id: String,
    path: String,
}

#[cfg(target_os = "windows")]
fn system_drives() -> Vec<NativeDrive> {
    use windows_sys::Win32::Storage::FileSystem::{
        GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
    };

    let mask = unsafe { GetLogicalDrives() };
    let mut drives = Vec::new();

    for index in 0..26 {
        if mask & (1 << index) == 0 {
            continue;
        }
        let letter = format!("{}:", (b'A' + index as u8) as char);
        let root = format!("{letter}\\");
        let root_wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
        let mut total_bytes = 0_u64;
        let mut free_bytes = 0_u64;
        let has_space = unsafe {
            GetDiskFreeSpaceExW(
                root_wide.as_ptr(),
                std::ptr::null_mut(),
                &mut total_bytes,
                &mut free_bytes,
            ) != 0
        };
        let kind = match unsafe { GetDriveTypeW(root_wide.as_ptr()) } {
            2 => "removable",
            4 => "network",
            5 => "optical",
            3 => "fixed",
            _ => "unknown",
        };
        let mut volume_label = [0_u16; 261];
        let has_label = unsafe {
            GetVolumeInformationW(
                root_wide.as_ptr(),
                volume_label.as_mut_ptr(),
                volume_label.len() as u32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
            ) != 0
        };
        let label = if has_label {
            let length = volume_label
                .iter()
                .position(|character| *character == 0)
                .unwrap_or(volume_label.len());
            let name = String::from_utf16_lossy(&volume_label[..length]);
            if name.trim().is_empty() {
                letter.clone()
            } else {
                name
            }
        } else {
            letter.clone()
        };
        drives.push(NativeDrive {
            id: letter.clone(),
            letter: letter.clone(),
            label,
            total_bytes: if has_space { total_bytes } else { 0 },
            used_bytes: if has_space {
                total_bytes.saturating_sub(free_bytes)
            } else {
                0
            },
            kind: kind.to_string(),
        });
    }
    drives
}

#[cfg(not(target_os = "windows"))]
fn system_drives() -> Vec<NativeDrive> {
    Vec::new()
}

#[tauri::command]
fn list_drives() -> Vec<NativeDrive> {
    system_drives()
}

#[tauri::command]
fn list_system_locations(app: tauri::AppHandle) -> Vec<NativeLocation> {
    let resolver = app.path();
    [
        ("desktop", resolver.desktop_dir()),
        ("documents", resolver.document_dir()),
        ("downloads", resolver.download_dir()),
        ("pictures", resolver.picture_dir()),
        ("music", resolver.audio_dir()),
        ("videos", resolver.video_dir()),
    ]
    .into_iter()
    .filter_map(|(id, path)| {
        path.ok()
            .filter(|path| path.is_dir())
            .map(|path| NativeLocation {
                id: id.to_string(),
                path: path.to_string_lossy().into_owned(),
            })
    })
    .collect()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state("main")
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let toggle = app.state::<TrayMenuState>().toggle.clone();
                        toggle_main_window(app, &toggle);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let shortcut_config_path = global_shortcut_config_path(app)?;
            let shortcut_preferences = load_global_shortcut_preferences(&shortcut_config_path);
            app.manage(GlobalShortcutState {
                preferences: Mutex::new(shortcut_preferences.clone()),
                registered: Mutex::new(None),
                config_path: shortcut_config_path,
            });

            let toggle =
                MenuItem::with_id(app, "toggle", "Ocultar CyberFiles", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            app.manage(TrayMenuState {
                toggle: toggle.clone(),
                quit: quit.clone(),
                english: Mutex::new(false),
                shortcut_hint: Mutex::new(None),
                tray: Mutex::new(None),
            });
            let menu = Menu::with_items(app, &[&toggle, &quit])?;
            let tray_toggle = toggle.clone();
            let click_toggle = toggle.clone();

            let tray_icon = TrayIconBuilder::with_id("cyberfiles-tray")
                .icon(
                    app.default_window_icon()
                        .ok_or("CyberFiles tray icon is missing")?
                        .clone(),
                )
                .tooltip("CyberFiles")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "toggle" => toggle_main_window(app, &tray_toggle),
                    "quit" => {
                        if let (Some(window), Ok(path)) =
                            (app.get_webview_window("main"), window_state_path(app))
                        {
                            let _ = save_window_state(&window, &path);
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => toggle_main_window(tray.app_handle(), &click_toggle),
                    TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            refresh_tray_toggle_label(app, &click_toggle, &window);
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            if let Ok(mut tray) = app.state::<TrayMenuState>().tray.lock() {
                *tray = Some(tray_icon);
            }

            if shortcut_preferences.enabled {
                match app
                    .global_shortcut()
                    .register(shortcut_preferences.shortcut.as_str())
                {
                    Ok(()) => {
                        if let Ok(mut registered) =
                            app.state::<GlobalShortcutState>().registered.lock()
                        {
                            *registered = Some(shortcut_preferences.shortcut.clone());
                        }
                        update_tray_hotkey_hint(
                            app.handle(),
                            Some(shortcut_preferences.shortcut.as_str()),
                        )?;
                    }
                    Err(error) => {
                        eprintln!("Could not register the saved global shortcut: {error}");
                    }
                }
            }

            let main_window = app
                .get_webview_window("main")
                .ok_or("CyberFiles main window is missing")?;
            main_window
                .set_theme(Some(tauri::Theme::Dark))
                .map_err(|error| error.to_string())?;
            let state_path = window_state_path(app)?;
            let has_monitor_state = restore_window_state(&main_window, &state_path)?;
            let restore_flags = StateFlags::SIZE
                | StateFlags::MAXIMIZED
                | if has_monitor_state {
                    StateFlags::empty()
                } else {
                    StateFlags::POSITION
                };
            main_window
                .restore_state(restore_flags)
                .map_err(|error| error.to_string())?;
            let window_for_close = main_window.clone();
            let app_for_window_events = app.handle().clone();
            let toggle_for_window_events = toggle.clone();
            main_window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    let _ = save_window_state(&window_for_close, &state_path);
                }
                tauri::WindowEvent::Focused(_) | tauri::WindowEvent::Resized(_) => {
                    refresh_tray_toggle_label(
                        &app_for_window_events,
                        &toggle_for_window_events,
                        &window_for_close,
                    );
                }
                _ => {}
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            show_main_window,
            hide_main_window,
            quit_app,
            list_directory,
            image_thumbnail,
            list_drives,
            list_system_locations,
            set_tray_language,
            get_global_shortcut_settings,
            set_global_shortcut_settings,
        ])
        .run(tauri::generate_context!())
        .expect("CyberFiles desktop shell failed to start");
}

#[cfg(test)]
mod tests {
    use super::runtime_info;

    #[test]
    fn exposes_development_runtime_metadata() {
        let info = runtime_info();

        assert_eq!(info.app_name, "CyberFiles");
        assert_eq!(info.mode, "development");
        assert!(!info.version.is_empty());
    }
}
