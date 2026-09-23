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
    Manager, PhysicalPosition, PhysicalSize,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

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
    #[serde(default)]
    maximized: bool,
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
        maximized: window.is_maximized().unwrap_or(false),
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

fn restore_window_state(window: &tauri::WebviewWindow, path: &PathBuf) -> Result<(), String> {
    let Ok(encoded_state) = fs::read(path) else {
        return Ok(());
    };
    let Ok(state) = serde_json::from_slice::<StoredWindowState>(&encoded_state) else {
        return Ok(());
    };
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Ok(());
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
    let width = state
        .width
        .clamp(1024.min(monitor_size.width), monitor_size.width);
    let height = state
        .height
        .clamp(680.min(monitor_size.height), monitor_size.height);
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
        .set_size(PhysicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    if state.maximized {
        window.maximize().map_err(|error| error.to_string())?;
    }
    Ok(())
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

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecycleBinStatus {
    available: bool,
    item_count: u64,
    total_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecycleBinEntry {
    id: String,
    name: String,
    original_path: Option<String>,
    is_folder: bool,
    size: u64,
    deleted_at_ms: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct LoadedRecycleBin {
    entries: Vec<RecycleBinEntry>,
    has_more: bool,
    next_offset: usize,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecycleBinRestoreResult {
    restored_ids: Vec<String>,
    failures: Vec<RecycleBinFailure>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecycleBinRestoreRequest {
    id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecycleBinFailure {
    path: String,
    error: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecycleBinDeleteResult {
    recycled_paths: Vec<String>,
    failures: Vec<RecycleBinFailure>,
}

#[cfg(target_os = "windows")]
const CLSID_FILE_OPERATION: windows::core::GUID =
    windows::core::GUID::from_u128(0x3ad0557588574850927711b85bdb8e09);

#[cfg(target_os = "windows")]
const RECYCLE_BIN_PAGE_SIZE: usize = 400;

#[cfg(target_os = "windows")]
fn recycle_bin_property_key(name: &str) -> Result<windows::Win32::Foundation::PROPERTYKEY, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::UI::Shell::PropertiesSystem::PSGetPropertyKeyFromName;

    let wide_name: Vec<u16> = std::ffi::OsStr::new(name)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let mut key: PROPERTYKEY = unsafe { std::mem::zeroed() };
    unsafe { PSGetPropertyKeyFromName(PCWSTR(wide_name.as_ptr()), &mut key) }
        .map_err(|error| format!("Could not resolve Windows property {name}: {error}"))?;
    Ok(key)
}

#[cfg(target_os = "windows")]
unsafe fn take_shell_string(value: windows::core::PWSTR) -> Result<String, String> {
    use windows::Win32::System::Com::CoTaskMemFree;

    let pointer = value.0;
    if pointer.is_null() {
        return Err("Windows returned an empty Shell string.".to_string());
    }
    let mut length = 0;
    while unsafe { *pointer.add(length) } != 0 {
        length += 1;
    }
    let text = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(pointer, length) });
    unsafe { CoTaskMemFree(Some(pointer.cast())) };
    Ok(text)
}

#[cfg(target_os = "windows")]
fn filetime_to_unix_millis(filetime: windows::Win32::Foundation::FILETIME) -> Option<u64> {
    const WINDOWS_TO_UNIX_EPOCH_100NS: u64 = 116_444_736_000_000_000;
    let ticks = (u64::from(filetime.dwHighDateTime) << 32) | u64::from(filetime.dwLowDateTime);
    ticks
        .checked_sub(WINDOWS_TO_UNIX_EPOCH_100NS)
        .map(|unix_ticks| unix_ticks / 10_000)
}

#[cfg(target_os = "windows")]
fn list_windows_recycle_bin(offset: usize) -> Result<LoadedRecycleBin, String> {
    use windows::core::{w, Interface};
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::SystemServices::SFGAO_FOLDER;
    use windows::Win32::UI::Shell::{
        BHID_EnumItems, IEnumShellItems, IShellItem, IShellItem2, SHCreateItemFromParsingName,
        SIGDN_DESKTOPABSOLUTEPARSING,
    };

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let recycle_bin: IShellItem =
        unsafe { SHCreateItemFromParsingName(w!("shell:RecycleBinFolder"), None::<&IBindCtx>) }
            .map_err(|error| {
                format!("Could not open the Windows Recycle Bin namespace: {error}")
            })?;
    let enumeration: IEnumShellItems = unsafe {
        recycle_bin.BindToHandler::<_, IEnumShellItems>(None::<&IBindCtx>, &BHID_EnumItems)
    }
    .map_err(|error| format!("Could not enumerate Windows Recycle Bin items: {error}"))?;

    let name_key = recycle_bin_property_key("System.ItemNameDisplay")?;
    let original_location_key = recycle_bin_property_key("System.Recycle.DeletedFrom")?;
    let size_key = recycle_bin_property_key("System.Size")?;
    let deleted_date_key = recycle_bin_property_key("System.Recycle.DateDeleted")?;
    let mut result = LoadedRecycleBin::default();
    let mut skipped = 0_usize;

    loop {
        let mut fetched = 0_u32;
        let mut next_item: [Option<IShellItem>; 1] = [None];
        unsafe { enumeration.Next(&mut next_item, Some(&mut fetched)) }
            .map_err(|error| format!("Could not read Recycle Bin entries: {error}"))?;
        if fetched == 0 {
            break;
        }
        if skipped < offset {
            skipped += 1;
            continue;
        }
        if result.entries.len() == RECYCLE_BIN_PAGE_SIZE {
            result.has_more = true;
            break;
        }

        let shell_item = next_item[0]
            .take()
            .ok_or_else(|| "Windows returned an empty Recycle Bin entry.".to_string())?;
        let shell_item2: IShellItem2 = shell_item
            .cast()
            .map_err(|error| format!("Could not inspect a Recycle Bin entry: {error}"))?;

        let name = unsafe { shell_item2.GetString(&name_key) }
            .map_err(|error| format!("Could not read a Recycle Bin item name: {error}"))?;
        let name = unsafe { take_shell_string(name) }?;
        let parsing_name = unsafe { shell_item2.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING) }
            .map_err(|error| format!("Could not identify a Recycle Bin item: {error}"))?;
        let id = unsafe { take_shell_string(parsing_name) }?;
        let original_location = unsafe { shell_item2.GetString(&original_location_key) }
            .ok()
            .and_then(|value| unsafe { take_shell_string(value) }.ok());
        let original_path = original_location.map(|location| {
            Path::new(&location)
                .join(&name)
                .to_string_lossy()
                .into_owned()
        });
        let is_folder = unsafe { shell_item2.GetAttributes(SFGAO_FOLDER) }
            .map(|attributes| attributes.0 & SFGAO_FOLDER.0 != 0)
            .unwrap_or(false);
        let size = unsafe { shell_item2.GetUInt64(&size_key) }.unwrap_or(0);
        let deleted_at_ms = unsafe { shell_item2.GetFileTime(&deleted_date_key) }
            .ok()
            .and_then(filetime_to_unix_millis);

        result.entries.push(RecycleBinEntry {
            id,
            name,
            original_path,
            is_folder,
            size,
            deleted_at_ms,
        });
    }

    result.next_offset = offset + result.entries.len();
    Ok(result)
}

#[cfg(not(target_os = "windows"))]
fn list_windows_recycle_bin(_offset: usize) -> Result<LoadedRecycleBin, String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[cfg(target_os = "windows")]
fn restore_windows_recycle_bin_item(id: &str) -> Result<(), String> {
    use windows::core::{w, Interface, PCSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        BHID_EnumItems, Common::ITEMIDLIST, IContextMenu, IEnumShellItems, IShellFolder,
        IShellItem, IShellItem2, SHBindToParent, SHCreateItemFromParsingName,
        SHGetIDListFromObject, CMF_NORMAL, CMINVOKECOMMANDINFO, SIGDN_DESKTOPABSOLUTEPARSING,
    };
    use windows::Win32::UI::WindowsAndMessaging::{CreatePopupMenu, DestroyMenu};

    if id.trim().is_empty() || id.len() > 32_768 {
        return Err("The selected Recycle Bin item identifier is invalid.".to_string());
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let recycle_bin: IShellItem =
        unsafe { SHCreateItemFromParsingName(w!("shell:RecycleBinFolder"), None::<&IBindCtx>) }
            .map_err(|error| format!("Could not open the Windows Recycle Bin: {error}"))?;
    let enumeration: IEnumShellItems = unsafe {
        recycle_bin.BindToHandler::<_, IEnumShellItems>(None::<&IBindCtx>, &BHID_EnumItems)
    }
    .map_err(|error| format!("Could not enumerate Windows Recycle Bin items: {error}"))?;
    let mut source: Option<IShellItem> = None;
    loop {
        let mut fetched = 0_u32;
        let mut next_item: [Option<IShellItem>; 1] = [None];
        unsafe { enumeration.Next(&mut next_item, Some(&mut fetched)) }
            .map_err(|error| format!("Could not read Recycle Bin entries: {error}"))?;
        if fetched == 0 {
            break;
        }
        let candidate = next_item[0]
            .take()
            .ok_or_else(|| "Windows returned an empty Recycle Bin entry.".to_string())?;
        let candidate_id = unsafe { candidate.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING) }
            .map_err(|error| format!("Could not identify a Recycle Bin item: {error}"))?;
        let candidate_id = unsafe { take_shell_string(candidate_id) }?;
        if candidate_id.eq_ignore_ascii_case(id) {
            source = Some(candidate);
            break;
        }
    }
    let source =
        source.ok_or_else(|| "The Recycle Bin item is no longer available.".to_string())?;
    let source_metadata: IShellItem2 = source
        .cast()
        .map_err(|error| format!("Could not inspect the Recycle Bin item: {error}"))?;
    let original_location_key = recycle_bin_property_key("System.Recycle.DeletedFrom")?;
    let name_key = recycle_bin_property_key("System.ItemNameDisplay")?;
    let original_location = unsafe { source_metadata.GetString(&original_location_key) }
        .map_err(|error| format!("The original folder could not be read: {error}"))?;
    let original_location = unsafe { take_shell_string(original_location) }?;
    let item_name = unsafe { source_metadata.GetString(&name_key) }
        .map_err(|error| format!("The original item name could not be read: {error}"))?;
    let item_name = unsafe { take_shell_string(item_name) }?;
    let destination = Path::new(&original_location).join(&item_name);
    validate_recycle_source(&destination)?;
    if destination.exists() {
        return Err("The original location already contains an item with that name.".to_string());
    }
    if !destination.parent().is_some_and(|path| path.is_dir()) {
        return Err("The original folder is no longer available.".to_string());
    }
    let absolute_pidl = unsafe { SHGetIDListFromObject(&source) }.map_err(|error| {
        format!("Could not identify the Recycle Bin item for restoration: {error}")
    })?;
    if absolute_pidl.is_null() {
        return Err("Windows returned an empty Recycle Bin item identifier.".to_string());
    }
    struct OwnedItemIdList(*mut ITEMIDLIST);
    impl Drop for OwnedItemIdList {
        fn drop(&mut self) {
            unsafe { CoTaskMemFree(Some(self.0.cast())) };
        }
    }
    let absolute_pidl = OwnedItemIdList(absolute_pidl);
    let mut child_pidl: *mut ITEMIDLIST = std::ptr::null_mut();
    let parent_folder: IShellFolder =
        unsafe { SHBindToParent(absolute_pidl.0.cast_const(), Some(&mut child_pidl)) }
            .map_err(|error| format!("Could not locate the Recycle Bin item parent: {error}"))?;
    if child_pidl.is_null() {
        return Err("Windows returned an empty Recycle Bin child identifier.".to_string());
    }
    let context_menu: IContextMenu =
        unsafe { parent_folder.GetUIObjectOf(HWND::default(), &[child_pidl.cast_const()], None) }
            .map_err(|error| format!("Could not access the Windows restore command: {error}"))?;
    let menu = unsafe { CreatePopupMenu() }
        .map_err(|error| format!("Could not prepare the Windows restore command: {error}"))?;
    let invoke_result = unsafe {
        let query_result = context_menu.QueryContextMenu(menu, 0, 1, 0x7fff, CMF_NORMAL);
        if query_result.is_err() {
            Err(format!(
                "Could not load the Windows restore command: {query_result}"
            ))
        } else {
            let mut command = CMINVOKECOMMANDINFO::default();
            command.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32;
            command.lpVerb = PCSTR(b"undelete\0".as_ptr());
            command.nShow = 1;
            context_menu
                .InvokeCommand(&command)
                .map_err(|error| format!("Windows could not restore the item: {error}"))
        }
    };
    unsafe {
        let _ = DestroyMenu(menu);
    }
    invoke_result?;
    if !destination.exists() {
        return Err("Windows reported success, but the item was not restored.".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn restore_windows_recycle_bin_item(_id: &str) -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[cfg(target_os = "windows")]
fn query_windows_recycle_bin() -> Result<RecycleBinStatus, String> {
    use windows_sys::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};

    let mut info = SHQUERYRBINFO {
        cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
        ..Default::default()
    };
    let result = unsafe { SHQueryRecycleBinW(std::ptr::null(), &mut info) };
    if result < 0 {
        return Err(format!(
            "Windows could not query Recycle Bin status (HRESULT 0x{:08X}).",
            result as u32
        ));
    }

    Ok(RecycleBinStatus {
        available: true,
        item_count: info.i64NumItems.max(0) as u64,
        total_bytes: info.i64Size.max(0) as u64,
    })
}

#[cfg(not(target_os = "windows"))]
fn query_windows_recycle_bin() -> Result<RecycleBinStatus, String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

fn validate_recycle_source(source: &Path) -> Result<(), String> {
    if !source.is_absolute() {
        return Err("Only fully qualified paths can be sent to the Recycle Bin.".to_string());
    }
    if source.components().any(|component| {
        matches!(
            component,
            std::path::Component::Prefix(prefix)
                if matches!(
                    prefix.kind(),
                    std::path::Prefix::UNC(..) | std::path::Prefix::VerbatimUNC(..)
                )
        )
    }) {
        return Err("Network shares cannot be safely sent to the Windows Recycle Bin.".to_string());
    }
    let mut depth = 0_i64;
    for component in source.components() {
        match component {
            std::path::Component::Normal(_) => depth += 1,
            std::path::Component::ParentDir => depth -= 1,
            _ => {}
        }
        if depth < 0 {
            return Err("The path traverses above a filesystem root.".to_string());
        }
    }
    if depth == 0 {
        return Err("A filesystem root cannot be sent to the Recycle Bin.".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn get_recycle_bin_status() -> Result<RecycleBinStatus, String> {
    tauri::async_runtime::spawn_blocking(query_windows_recycle_bin)
        .await
        .map_err(|error| format!("Recycle Bin status worker failed: {error}"))?
}

#[tauri::command]
async fn list_recycle_bin(offset: usize) -> Result<LoadedRecycleBin, String> {
    tauri::async_runtime::spawn_blocking(move || list_windows_recycle_bin(offset))
        .await
        .map_err(|error| format!("Recycle Bin listing worker failed: {error}"))?
}

#[tauri::command]
async fn restore_recycle_bin_items(
    items: Vec<RecycleBinRestoreRequest>,
) -> Result<RecycleBinRestoreResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = RecycleBinRestoreResult::default();
        let mut seen = std::collections::HashSet::new();
        for item in items {
            if !seen.insert(item.id.clone()) {
                continue;
            }
            match restore_windows_recycle_bin_item(&item.id) {
                Ok(()) => result.restored_ids.push(item.id),
                Err(error) => {
                    eprintln!("CyberFiles Recycle Bin restore failed: {error}");
                    result.failures.push(RecycleBinFailure {
                        path: item.id,
                        error,
                    });
                }
            }
        }
        Ok(result)
    })
    .await
    .map_err(|error| format!("Recycle Bin restore worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn recycle_path(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{IUnknown, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IBindCtx, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IFileOperation, IFileOperationProgressSink, IShellItem, SHCreateItemFromParsingName,
        FOFX_RECYCLEONDELETE, FOF_NO_UI,
    };

    let source = Path::new(path);
    validate_recycle_source(source)?;
    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links are not supported for Recycle Bin operations.".to_string());
    }

    let resolved = source.canonicalize().map_err(|error| error.to_string())?;
    validate_recycle_source(&resolved)?;
    let shell_path = display_path(&resolved);
    let path_bytes = shell_path.as_bytes();
    if path_bytes.len() < 3 || path_bytes[1] != b':' || path_bytes[2] != b'\\' {
        return Err(
            "Only local drive-letter paths can be safely sent to the Recycle Bin.".to_string(),
        );
    }
    let root = format!("{}:\\", path_bytes[0] as char);
    let root_wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
    let drive_type =
        unsafe { windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(root_wide.as_ptr()) };
    if drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_FIXED
        && drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_REMOVABLE
    {
        return Err(
            "This drive type cannot be safely sent to the Windows Recycle Bin.".to_string(),
        );
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let wide_path: Vec<u16> = std::ffi::OsStr::new(&shell_path)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let shell_item: IShellItem =
        unsafe { SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None::<&IBindCtx>) }
            .map_err(|error| format!("Could not open the selected Shell item: {error}"))?;
    let operation: IFileOperation = unsafe {
        CoCreateInstance(
            &CLSID_FILE_OPERATION,
            None::<&IUnknown>,
            CLSCTX_INPROC_SERVER,
        )
    }
    .map_err(|error| format!("Could not start the Windows file operation: {error}"))?;
    unsafe {
        operation
            .SetOperationFlags(FOF_NO_UI | FOFX_RECYCLEONDELETE)
            .map_err(|error| format!("Could not configure Recycle Bin deletion: {error}"))?;
        operation
            .DeleteItem(&shell_item, None::<&IFileOperationProgressSink>)
            .map_err(|error| format!("Could not queue Recycle Bin deletion: {error}"))?;
        operation.PerformOperations().map_err(|error| {
            format!("Windows could not move the item to the Recycle Bin: {error}")
        })?;
        if operation
            .GetAnyOperationsAborted()
            .map_err(|error| format!("Could not verify the Recycle Bin operation: {error}"))?
            .as_bool()
        {
            return Err("Windows aborted the Recycle Bin operation.".to_string());
        }
    }
    if resolved.exists() {
        return Err("Windows reported success but the selected item still exists.".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn recycle_path(_path: &str) -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[cfg(target_os = "windows")]
fn recycle_paths(paths: Vec<String>) -> RecycleBinDeleteResult {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{IUnknown, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IBindCtx, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IFileOperation, IFileOperationProgressSink, IShellItem, SHCreateItemFromParsingName,
        FOFX_RECYCLEONDELETE, FOF_NO_UI,
    };

    if paths.len() == 1 {
        let path = &paths[0];
        return match recycle_path(path) {
            Ok(()) => RecycleBinDeleteResult {
                recycled_paths: vec![path.clone()],
                failures: Vec::new(),
            },
            Err(error) => RecycleBinDeleteResult {
                recycled_paths: Vec::new(),
                failures: vec![RecycleBinFailure {
                    path: path.clone(),
                    error,
                }],
            },
        };
    }

    let mut result = RecycleBinDeleteResult::default();
    let mut seen = std::collections::HashSet::new();
    let mut candidates = Vec::new();
    for path in paths {
        if !seen.insert(path.replace('/', "\\").to_lowercase()) {
            continue;
        }
        let source = Path::new(&path);
        let prepared = (|| -> Result<(PathBuf, String), String> {
            validate_recycle_source(source)?;
            let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
            if metadata.file_type().is_symlink() {
                return Err(
                    "Symbolic links are not supported for Recycle Bin operations.".to_string(),
                );
            }
            let resolved = source.canonicalize().map_err(|error| error.to_string())?;
            validate_recycle_source(&resolved)?;
            let shell_path = display_path(&resolved);
            let path_bytes = shell_path.as_bytes();
            if path_bytes.len() < 3 || path_bytes[1] != b':' || path_bytes[2] != b'\\' {
                return Err(
                    "Only local drive-letter paths can be safely sent to the Recycle Bin."
                        .to_string(),
                );
            }
            let root = format!("{}:\\", path_bytes[0] as char);
            let root_wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
            let drive_type = unsafe {
                windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(root_wide.as_ptr())
            };
            if drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_FIXED
                && drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_REMOVABLE
            {
                return Err(
                    "This drive type cannot be safely sent to the Windows Recycle Bin.".to_string(),
                );
            }
            Ok((resolved, shell_path))
        })();
        match prepared {
            Ok((resolved, shell_path)) => candidates.push((path, resolved, shell_path)),
            Err(error) => result.failures.push(RecycleBinFailure { path, error }),
        }
    }
    if candidates.is_empty() {
        return result;
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        let error = format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        );
        result.failures.extend(
            candidates
                .into_iter()
                .map(|(path, _, _)| RecycleBinFailure {
                    path,
                    error: error.clone(),
                }),
        );
        return result;
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let operation: IFileOperation = match unsafe {
        CoCreateInstance(
            &CLSID_FILE_OPERATION,
            None::<&IUnknown>,
            CLSCTX_INPROC_SERVER,
        )
    } {
        Ok(operation) => operation,
        Err(error) => {
            let message = format!("Could not start the Windows file operation: {error}");
            result.failures.extend(
                candidates
                    .into_iter()
                    .map(|(path, _, _)| RecycleBinFailure {
                        path,
                        error: message.clone(),
                    }),
            );
            return result;
        }
    };
    if let Err(error) = unsafe { operation.SetOperationFlags(FOF_NO_UI | FOFX_RECYCLEONDELETE) } {
        let message = format!("Could not configure Recycle Bin deletion: {error}");
        result.failures.extend(
            candidates
                .into_iter()
                .map(|(path, _, _)| RecycleBinFailure {
                    path,
                    error: message.clone(),
                }),
        );
        return result;
    }

    let mut queued = Vec::new();
    for (path, resolved, shell_path) in candidates {
        let wide_path: Vec<u16> = std::ffi::OsStr::new(&shell_path)
            .encode_wide()
            .chain(Some(0))
            .collect();
        let shell_item: IShellItem = match unsafe {
            SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None::<&IBindCtx>)
        } {
            Ok(item) => item,
            Err(error) => {
                result.failures.push(RecycleBinFailure {
                    path,
                    error: format!("Could not open the selected Shell item: {error}"),
                });
                continue;
            }
        };
        match unsafe { operation.DeleteItem(&shell_item, None::<&IFileOperationProgressSink>) } {
            Ok(()) => queued.push((path, resolved)),
            Err(error) => result.failures.push(RecycleBinFailure {
                path,
                error: format!("Could not queue Recycle Bin deletion: {error}"),
            }),
        }
    }
    if queued.is_empty() {
        return result;
    }

    let operation_error = unsafe { operation.PerformOperations() }
        .err()
        .map(|error| format!("Windows could not move the item to the Recycle Bin: {error}"));
    let aborted = match unsafe { operation.GetAnyOperationsAborted() } {
        Ok(value) => value.as_bool(),
        Err(error) => {
            let message = format!("Could not verify the Recycle Bin operation: {error}");
            for (path, resolved) in queued {
                if resolved.exists() {
                    result.failures.push(RecycleBinFailure {
                        path,
                        error: message.clone(),
                    });
                } else {
                    result.recycled_paths.push(path);
                }
            }
            return result;
        }
    };
    for (path, resolved) in queued {
        if !resolved.exists() {
            result.recycled_paths.push(path);
        } else {
            let error = operation_error.clone().unwrap_or_else(|| {
                if aborted {
                    "Windows aborted the Recycle Bin operation.".to_string()
                } else {
                    "Windows reported success but the selected item still exists.".to_string()
                }
            });
            result.failures.push(RecycleBinFailure { path, error });
        }
    }
    result
}

#[cfg(not(target_os = "windows"))]
fn recycle_paths(paths: Vec<String>) -> RecycleBinDeleteResult {
    RecycleBinDeleteResult {
        recycled_paths: Vec::new(),
        failures: paths
            .into_iter()
            .map(|path| RecycleBinFailure {
                path,
                error: "The Windows Recycle Bin is available only in the Windows desktop app."
                    .to_string(),
            })
            .collect(),
    }
}

#[tauri::command]
async fn move_to_recycle_bin(paths: Vec<String>) -> Result<RecycleBinDeleteResult, String> {
    Ok(
        tauri::async_runtime::spawn_blocking(move || recycle_paths(paths))
            .await
            .map_err(|error| format!("Recycle Bin worker failed: {error}"))?,
    )
}

#[cfg(target_os = "windows")]
fn empty_windows_recycle_bin() -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{
        SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
    };

    let result = unsafe {
        SHEmptyRecycleBinW(
            std::ptr::null_mut(),
            std::ptr::null(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
        )
    };
    if result < 0 {
        return Err(format!(
            "Windows could not empty the Recycle Bin (HRESULT 0x{:08X}).",
            result as u32
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn empty_windows_recycle_bin() -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn empty_recycle_bin() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(empty_windows_recycle_bin)
        .await
        .map_err(|error| format!("Recycle Bin worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn show_windows_file_properties(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{SHObjectProperties, SHOP_FILEPATH};

    let item_path = Path::new(path);
    if !item_path.is_absolute() {
        return Err("Windows Properties requires a fully qualified filesystem path.".to_string());
    }
    if !item_path.exists() {
        return Err("The selected item no longer exists.".to_string());
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let wide_path: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let opened = unsafe {
        SHObjectProperties(
            None,
            SHOP_FILEPATH,
            PCWSTR(wide_path.as_ptr()),
            PCWSTR::null(),
        )
    };
    if opened.as_bool() {
        Ok(())
    } else {
        Err("Windows could not open the selected item's Properties dialog.".to_string())
    }
}

#[cfg(not(target_os = "windows"))]
fn show_windows_file_properties(_path: &str) -> Result<(), String> {
    Err("Windows Properties is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn open_windows_file_properties(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || show_windows_file_properties(&path))
        .await
        .map_err(|error| format!("Windows Properties worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn open_image_using_windows_default_app(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let source = Path::new(path);
    if !source.is_absolute() {
        return Err("Only fully qualified image paths can be opened.".to_string());
    }
    let resolved = source
        .canonicalize()
        .map_err(|error| format!("Could not resolve the selected image: {error}"))?;
    if !resolved.is_file() {
        return Err("The selected image is no longer available.".to_string());
    }
    let extension = resolved
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "bmp" | "gif" | "ico" | "jpeg" | "jpg" | "png" | "svg" | "webp"
    ) {
        return Err("The selected file is not a supported image type.".to_string());
    }

    let initialized =
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let wide_path: Vec<u16> = resolved.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(wide_path.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    let result_code = result.0 as isize;
    if result_code > 32 {
        Ok(())
    } else {
        Err(format!(
            "Windows could not open the image with its default app (ShellExecute error {result_code})."
        ))
    }
}

#[cfg(not(target_os = "windows"))]
fn open_image_using_windows_default_app(_path: &str) -> Result<(), String> {
    Err(
        "Opening images with a Windows default app is available only in the Windows desktop app."
            .to_string(),
    )
}

#[tauri::command]
async fn open_image_with_default_app(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_image_using_windows_default_app(&path))
        .await
        .map_err(|error| format!("Windows image-open worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn launch_recycle_bin_in_explorer() -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg("shell:RecycleBinFolder")
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the Windows Recycle Bin: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn launch_recycle_bin_in_explorer() -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn open_recycle_bin_in_explorer() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(launch_recycle_bin_in_explorer)
        .await
        .map_err(|error| format!("Recycle Bin launch worker failed: {error}"))?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            restore_window_state(&main_window, &state_path)?;
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
            get_recycle_bin_status,
            list_recycle_bin,
            restore_recycle_bin_items,
            move_to_recycle_bin,
            empty_recycle_bin,
            open_windows_file_properties,
            open_image_with_default_app,
            open_recycle_bin_in_explorer,
            set_tray_language,
            get_global_shortcut_settings,
            set_global_shortcut_settings,
        ])
        .run(tauri::generate_context!())
        .expect("CyberFiles desktop shell failed to start");
}

#[cfg(test)]
mod tests {
    use super::{runtime_info, validate_recycle_source};
    use std::path::Path;

    #[test]
    fn exposes_development_runtime_metadata() {
        let info = runtime_info();

        assert_eq!(info.app_name, "CyberFiles");
        assert_eq!(info.mode, "development");
        assert!(!info.version.is_empty());
    }

    #[test]
    fn rejects_drive_and_unc_roots_for_recycle_bin_operations() {
        assert!(validate_recycle_source(Path::new(r"C:\")).is_err());
        assert!(validate_recycle_source(Path::new(r"\\server\share")).is_err());
    }

    #[test]
    fn rejects_paths_that_traverse_above_a_filesystem_root() {
        assert!(validate_recycle_source(Path::new(r"C:\folder\..")).is_err());
        assert!(validate_recycle_source(Path::new(r"C:\..\folder")).is_err());
    }

    #[test]
    fn accepts_fully_qualified_paths_below_a_root() {
        assert!(validate_recycle_source(Path::new(r"C:\folder\file.txt")).is_ok());
        assert!(validate_recycle_source(Path::new(r"\\server\share\folder")).is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn reads_recycle_bin_status_without_mutating_files() {
        assert!(super::query_windows_recycle_bin().is_ok());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn enumerates_the_recycle_bin_without_mutating_files() {
        let page =
            super::list_windows_recycle_bin(0).expect("Recycle Bin enumeration should succeed");
        assert!(page.entries.len() <= super::RECYCLE_BIN_PAGE_SIZE);
        assert_eq!(page.next_offset, page.entries.len());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn configures_recycle_on_delete_without_performing_an_operation() {
        use super::CLSID_FILE_OPERATION;
        use windows::core::IUnknown;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{IFileOperation, FOFX_RECYCLEONDELETE, FOF_NO_UI};

        assert!(unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok());
        struct ComApartment;
        impl Drop for ComApartment {
            fn drop(&mut self) {
                unsafe { CoUninitialize() };
            }
        }
        let _apartment = ComApartment;
        let operation: IFileOperation = unsafe {
            CoCreateInstance(
                &CLSID_FILE_OPERATION,
                None::<&IUnknown>,
                CLSCTX_INPROC_SERVER,
            )
        }
        .expect("Windows should create its IFileOperation shell object");
        unsafe {
            operation
                .SetOperationFlags(FOF_NO_UI | FOFX_RECYCLEONDELETE)
                .expect("Windows should accept recycle-on-delete flags");
        }
    }
}
