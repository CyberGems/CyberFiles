//! Windows Portable Devices (MTP / PTP) support for CyberFiles.
//!
//! Discovers portable devices via the Windows Shell (`FOLDERID_ComputerFolder`) so the
//! list matches File Explorer's "Devices and drives" 1:1 without duplicating USB mass-storage
//! drive letters, and accesses device contents through WPD (`IPortableDevice`) with
//! per-device serialization because USB MTP sessions are half-duplex.

pub const PORTABLE_PATH_PREFIX: &str = "mtp:\\";

#[derive(Clone, Debug)]
pub struct PortableDeviceSummary {
    pub id: String,
    pub root_path: String,
    pub label: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub device_subtype: String,
    pub device_type_label: Option<String>,
}

#[derive(Clone, Debug)]
pub struct PortableEntry {
    pub name: String,
    pub path: String,
    pub is_folder: bool,
    pub is_hidden: bool,
    pub size: u64,
    pub modified_ms: Option<u64>,
    pub created_ms: Option<u64>,
}

#[derive(Clone, Debug, Default)]
pub struct PortableTreeSummary {
    pub total_bytes: u64,
    pub total_items: u64,
}

pub fn is_portable_path(path: &str) -> bool {
    parse_portable_path(path).is_some()
}

/// Parses `mtp:\<DeviceKey>[\<Storage>[\...]]` into `(device_key, rel_segments)`.
/// Rejects empty device keys and any `.` / `..` traversal segment.
pub fn parse_portable_path(path: &str) -> Option<(String, Vec<String>)> {
    let trimmed = path.trim();
    if trimmed.len() <= 5 {
        return None;
    }
    let normalized = trimmed.replace('/', "\\");
    let lower_prefix = normalized.get(..5)?.to_ascii_lowercase();
    if lower_prefix != PORTABLE_PATH_PREFIX {
        return None;
    }
    let rest = normalized[5..].trim_matches('\\');
    if rest.is_empty() {
        return None;
    }
    let mut parts = Vec::new();
    for segment in rest.split('\\') {
        if segment.is_empty() {
            continue;
        }
        if segment == "." || segment == ".." {
            return None;
        }
        parts.push(segment.to_string());
    }
    if parts.is_empty() {
        return None;
    }
    let device_key = parts.remove(0);
    Some((device_key, parts))
}

pub fn build_portable_path(device_key: &str, segments: &[String]) -> String {
    let mut out = format!("{PORTABLE_PATH_PREFIX}{device_key}");
    for segment in segments {
        if !segment.is_empty() {
            out.push('\\');
            out.push_str(segment);
        }
    }
    out
}

pub fn is_portable_device_root(path: &str) -> bool {
    parse_portable_path(path).is_some_and(|(_, segments)| segments.is_empty())
}

pub fn is_portable_storage_root(path: &str) -> bool {
    parse_portable_path(path).is_some_and(|(_, segments)| segments.len() == 1)
}

pub fn sanitize_portable_segment(raw: &str) -> String {
    let mut cleaned = String::with_capacity(raw.len());
    for ch in raw.trim().chars() {
        if matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || ch.is_control() {
            cleaned.push('_');
        } else {
            cleaned.push(ch);
        }
    }
    let trimmed = cleaned.trim().trim_end_matches('.').trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        "Device".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use crate::windows_file_icons::ShellApartment;
    use base64::Engine;
    use std::{
        collections::{hash_map::DefaultHasher, HashMap, HashSet},
        fs,
        hash::{Hash, Hasher},
        io::{Cursor, Read, Write},
        path::{Path, PathBuf},
        sync::{Arc, Mutex, OnceLock},
        time::SystemTime,
    };
    use windows::{
        core::{w, Interface, GUID, PCWSTR, PWSTR},
        Win32::{
            Devices::PortableDevices::{
                IEnumPortableDeviceObjectIDs, IPortableDevice, IPortableDeviceContent,
                IPortableDeviceKeyCollection, IPortableDeviceManager, IPortableDeviceProperties,
                IPortableDevicePropVariantCollection, IPortableDeviceResources,
                IPortableDeviceValues, IPortableDeviceDataStream,
                PortableDeviceFTM, PortableDeviceKeyCollection, PortableDeviceManager,
                PortableDevicePropVariantCollection, PortableDeviceValues,
                PORTABLE_DEVICE_DELETE_WITH_RECURSION,
                WPD_CLIENT_DESIRED_ACCESS, WPD_CLIENT_MAJOR_VERSION, WPD_CLIENT_MINOR_VERSION,
                WPD_CLIENT_NAME, WPD_CLIENT_REVISION, WPD_CLIENT_SECURITY_QUALITY_OF_SERVICE,
                WPD_CONTENT_TYPE_AUDIO, WPD_CONTENT_TYPE_DOCUMENT, WPD_CONTENT_TYPE_FOLDER,
                WPD_CONTENT_TYPE_FUNCTIONAL_OBJECT, WPD_CONTENT_TYPE_GENERIC_FILE,
                WPD_CONTENT_TYPE_IMAGE, WPD_CONTENT_TYPE_VIDEO, WPD_DEVICE_OBJECT_ID,
                WPD_DEVICE_TYPE, WPD_DEVICE_TYPE_AUDIO_RECORDER, WPD_DEVICE_TYPE_CAMERA,
                WPD_DEVICE_TYPE_MEDIA_PLAYER, WPD_DEVICE_TYPE_PHONE, WPD_DEVICE_TYPE_VIDEO,
                WPD_FUNCTIONAL_CATEGORY_STORAGE, WPD_FUNCTIONAL_OBJECT_CATEGORY,
                WPD_OBJECT_CONTENT_TYPE, WPD_OBJECT_DATE_CREATED, WPD_OBJECT_DATE_MODIFIED,
                WPD_OBJECT_FORMAT, WPD_OBJECT_FORMAT_EXIF, WPD_OBJECT_FORMAT_MP3,
                WPD_OBJECT_FORMAT_MP4, WPD_OBJECT_FORMAT_PNG, WPD_OBJECT_FORMAT_PROPERTIES_ONLY,
                WPD_OBJECT_FORMAT_TEXT, WPD_OBJECT_FORMAT_UNSPECIFIED, WPD_OBJECT_FORMAT_WMA,
                WPD_OBJECT_FORMAT_WMV, WPD_OBJECT_ISHIDDEN, WPD_OBJECT_NAME,
                WPD_OBJECT_ORIGINAL_FILE_NAME, WPD_OBJECT_PARENT_ID, WPD_OBJECT_SIZE,
                WPD_RESOURCE_DEFAULT, WPD_RESOURCE_THUMBNAIL, WPD_STORAGE_CAPACITY,
                WPD_STORAGE_DESCRIPTION, WPD_STORAGE_FREE_SPACE_IN_BYTES,
            },
            Foundation::{FILETIME, GENERIC_READ, GENERIC_WRITE, PROPERTYKEY, S_FALSE},
            System::{
                Com::{
                    CoCreateInstance, CoTaskMemAlloc, CoTaskMemFree, IBindCtx, IStream,
                    StructuredStorage::{PropVariantClear, PropVariantToFileTime, PROPVARIANT},
                    CLSCTX_INPROC_SERVER, STGC_DEFAULT, STGM_READ,
                },
                SystemServices::{SFGAO_FILESYSTEM, SFGAO_FLAGS, SFGAO_FOLDER},
                Variant::{PSTF_UTC, VT_LPWSTR},
            },
            UI::{
                Shell::{
                    BHID_EnumItems, Common::ITEMIDLIST, FOLDERID_ComputerFolder, IEnumShellItems,
                    ILFree, IShellItem, IShellItem2, SHGetIDListFromObject,
                    SHGetKnownFolderItem, SHParseDisplayName, ShellExecuteExW,
                    KF_FLAG_DEFAULT, SEE_MASK_CLASSNAME, SEE_MASK_IDLIST, SEE_MASK_INVOKEIDLIST,
                    SHELLEXECUTEINFOW, SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_NORMALDISPLAY,
                },
                WindowsAndMessaging::SW_SHOWNORMAL,
            },
        },
    };

    /// Standard Windows property `System.ItemTypeText` (`{B725F130-47EF-101A-A5F1-02608C9EEBAC}, 4`),
    /// which returns Explorer's localized device type string (e.g. "Teléfono celular" / "Mobile phone").
    const PKEY_ITEM_TYPE_TEXT: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0xb725f130_47ef_101a_a5f1_02608c9eebac),
        pid: 4,
    };

    const SECURITY_IMPERSONATION: u32 = 0x0002_0000;
    const FILETIME_UNIX_EPOCH_TICKS: u64 = 116_444_736_000_000_000;
    const MAX_CACHED_PORTABLE_THUMBNAILS: usize = 256;
    const MAX_PORTABLE_CACHE_FILES: usize = 50;
    const MAX_PORTABLE_CACHE_BYTES: u64 = 256 * 1024 * 1024;
    const PORTABLE_THUMBNAIL_FALLBACK_MAX_BYTES: u64 = 2 * 1024 * 1024;

    #[derive(Clone, Debug)]
    struct RegisteredDevice {
        device_key: String,
        friendly_name: String,
        pnp_device_id: String,
        shell_parsing_name: String,
    }

    static DEVICE_REGISTRY: OnceLock<Mutex<HashMap<String, RegisteredDevice>>> = OnceLock::new();
    static DEVICE_LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    static OBJECT_ID_CACHE: OnceLock<Mutex<HashMap<String, HashMap<String, String>>>> =
        OnceLock::new();
    static PORTABLE_THUMBNAIL_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

    struct OwnedPropVariant(PROPVARIANT);

    impl Drop for OwnedPropVariant {
        fn drop(&mut self) {
            unsafe {
                let _ = PropVariantClear(&mut self.0);
            }
        }
    }

    struct OwnedPidl(*mut ITEMIDLIST);

    impl Drop for OwnedPidl {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { ILFree(Some(self.0.cast_const())) };
            }
        }
    }

    struct OpenedPortableDevice(IPortableDevice);

    impl Drop for OpenedPortableDevice {
        fn drop(&mut self) {
            unsafe {
                let _ = self.0.Close();
            }
        }
    }

    fn take_co_task_pwstr(pwstr: PWSTR) -> String {
        if pwstr.0.is_null() {
            return String::new();
        }
        unsafe {
            let mut len = 0usize;
            while *pwstr.0.add(len) != 0 {
                len += 1;
            }
            let slice = std::slice::from_raw_parts(pwstr.0, len);
            let value = String::from_utf16_lossy(slice);
            CoTaskMemFree(Some(pwstr.0.cast()));
            value
        }
    }

    fn propvariant_from_string(value: &str) -> Result<OwnedPropVariant, String> {
        let wide: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
        let byte_len = wide
            .len()
            .checked_mul(std::mem::size_of::<u16>())
            .ok_or_else(|| "String is too long for PROPVARIANT.".to_string())?;
        let raw_ptr = unsafe { CoTaskMemAlloc(byte_len) } as *mut u16;
        if raw_ptr.is_null() {
            return Err("Could not allocate COM memory for string property.".to_string());
        }
        unsafe {
            std::ptr::copy_nonoverlapping(wide.as_ptr(), raw_ptr, wide.len());
            let mut pv = PROPVARIANT::default();
            let inner = &mut *pv.Anonymous.Anonymous;
            inner.vt = VT_LPWSTR;
            inner.Anonymous.pwszVal = PWSTR(raw_ptr);
            Ok(OwnedPropVariant(pv))
        }
    }

    fn filetime_to_unix_ms(ft: FILETIME) -> Option<u64> {
        let ticks = ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64);
        if ticks < FILETIME_UNIX_EPOCH_TICKS {
            return None;
        }
        Some((ticks - FILETIME_UNIX_EPOCH_TICKS) / 10_000)
    }

    fn propvariant_to_unix_ms(pv: &PROPVARIANT) -> Option<u64> {
        let ft = unsafe { PropVariantToFileTime(pv, PSTF_UTC) }.ok()?;
        filetime_to_unix_ms(ft)
    }

    fn device_lock(pnp_device_id: &str) -> Arc<Mutex<()>> {
        let key = pnp_device_id.to_ascii_lowercase();
        let map = DEVICE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut guard = map.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    fn device_registry() -> &'static Mutex<HashMap<String, RegisteredDevice>> {
        DEVICE_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn object_id_cache() -> &'static Mutex<HashMap<String, HashMap<String, String>>> {
        OBJECT_ID_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn cache_object_id(pnp_id: &str, portable_path: &str, object_id: &str) {
        let pnp_key = pnp_id.to_ascii_lowercase();
        let path_key = portable_path.to_ascii_lowercase();
        let mut guard = object_id_cache()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .entry(pnp_key)
            .or_default()
            .insert(path_key, object_id.to_string());
    }

    fn get_cached_object_id(pnp_id: &str, portable_path: &str) -> Option<String> {
        let pnp_key = pnp_id.to_ascii_lowercase();
        let path_key = portable_path.to_ascii_lowercase();
        let guard = object_id_cache()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .get(&pnp_key)
            .and_then(|entries| entries.get(&path_key))
            .cloned()
    }

    fn invalidate_cache_prefix(pnp_id: &str, prefix_path: &str) {
        let pnp_key = pnp_id.to_ascii_lowercase();
        let prefix = prefix_path.trim_end_matches('\\').to_ascii_lowercase();
        let child_prefix = format!("{prefix}\\");
        let mut guard = object_id_cache()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(entries) = guard.get_mut(&pnp_key) {
            entries.retain(|key, _| key != &prefix && !key.starts_with(&child_prefix));
        }
    }

    fn create_client_info(desired_access: u32) -> Result<IPortableDeviceValues, String> {
        unsafe {
            let client_info: IPortableDeviceValues =
                CoCreateInstance(&PortableDeviceValues, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("Could not initialize WPD client info: {error}"))?;
            client_info
                .SetStringValue(&WPD_CLIENT_NAME, w!("CyberFiles"))
                .map_err(|error| format!("Could not set WPD client name: {error}"))?;
            client_info
                .SetUnsignedIntegerValue(&WPD_CLIENT_MAJOR_VERSION, 1)
                .map_err(|error| format!("Could not set WPD client major version: {error}"))?;
            client_info
                .SetUnsignedIntegerValue(&WPD_CLIENT_MINOR_VERSION, 0)
                .map_err(|error| format!("Could not set WPD client minor version: {error}"))?;
            client_info
                .SetUnsignedIntegerValue(&WPD_CLIENT_REVISION, 0)
                .map_err(|error| format!("Could not set WPD client revision: {error}"))?;
            client_info
                .SetUnsignedIntegerValue(
                    &WPD_CLIENT_SECURITY_QUALITY_OF_SERVICE,
                    SECURITY_IMPERSONATION,
                )
                .map_err(|error| format!("Could not set WPD security QoS: {error}"))?;
            client_info
                .SetUnsignedIntegerValue(&WPD_CLIENT_DESIRED_ACCESS, desired_access)
                .map_err(|error| format!("Could not set WPD desired access: {error}"))?;
            Ok(client_info)
        }
    }

    fn open_wpd_device(
        pnp_device_id: &str,
        desired_access: u32,
    ) -> Result<OpenedPortableDevice, String> {
        let wide_id: Vec<u16> = pnp_device_id.encode_utf16().chain(Some(0)).collect();
        let client_info = create_client_info(desired_access)?;
        unsafe {
            let device: IPortableDevice =
                CoCreateInstance(&PortableDeviceFTM, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("Could not create WPD device instance: {error}"))?;
            if let Err(error) = device.Open(PCWSTR(wide_id.as_ptr()), &client_info) {
                if desired_access != GENERIC_READ.0 {
                    let ro_info = create_client_info(GENERIC_READ.0)?;
                    device
                        .Open(PCWSTR(wide_id.as_ptr()), &ro_info)
                        .map_err(|ro_err| {
                            format!(
                                "Could not open portable device session: {error} (read-only fallback: {ro_err})"
                            )
                        })?;
                } else {
                    return Err(format!("Could not open portable device session: {error}"));
                }
            }
            Ok(OpenedPortableDevice(device))
        }
    }

    fn enum_direct_child_ids(
        content: &IPortableDeviceContent,
        parent_id: &str,
    ) -> Result<Vec<String>, String> {
        let parent_wide: Vec<u16> = parent_id.encode_utf16().chain(Some(0)).collect();
        let enum_ids: IEnumPortableDeviceObjectIDs = unsafe {
            content.EnumObjects(0, PCWSTR(parent_wide.as_ptr()), None::<&IPortableDeviceValues>)
        }
        .map_err(|error| format!("Could not enumerate portable device folder: {error}"))?;

        let mut ids = Vec::new();
        loop {
            let mut batch = [PWSTR::null(); 64];
            let mut fetched = 0u32;
            let hr = unsafe { enum_ids.Next(&mut batch, &mut fetched) };
            if hr.is_err() {
                for raw in &batch {
                    if !raw.0.is_null() {
                        let _ = take_co_task_pwstr(*raw);
                    }
                }
                return Err(format!("Failed while reading portable device entries: {hr}"));
            }
            let count = (fetched as usize).min(batch.len());
            for raw in batch.iter().take(count) {
                let id = take_co_task_pwstr(*raw);
                if !id.is_empty() {
                    ids.push(id);
                }
            }
            if count == 0 || (hr == S_FALSE && count < batch.len()) {
                break;
            }
        }
        Ok(ids)
    }

    fn build_object_property_keys(include_storage_keys: bool) -> Result<IPortableDeviceKeyCollection, String> {
        unsafe {
            let keys: IPortableDeviceKeyCollection =
                CoCreateInstance(&PortableDeviceKeyCollection, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("Could not create WPD key collection: {error}"))?;
            keys.Add(&WPD_OBJECT_ORIGINAL_FILE_NAME)
                .map_err(|e| format!("WPD key error: {e}"))?;
            keys.Add(&WPD_OBJECT_NAME)
                .map_err(|e| format!("WPD key error: {e}"))?;
            keys.Add(&WPD_OBJECT_CONTENT_TYPE)
                .map_err(|e| format!("WPD key error: {e}"))?;
            keys.Add(&WPD_OBJECT_SIZE)
                .map_err(|e| format!("WPD key error: {e}"))?;
            keys.Add(&WPD_OBJECT_DATE_MODIFIED)
                .map_err(|e| format!("WPD key error: {e}"))?;
            keys.Add(&WPD_OBJECT_DATE_CREATED)
                .map_err(|e| format!("WPD key error: {e}"))?;
            keys.Add(&WPD_OBJECT_ISHIDDEN)
                .map_err(|e| format!("WPD key error: {e}"))?;
            if include_storage_keys {
                keys.Add(&WPD_FUNCTIONAL_OBJECT_CATEGORY)
                    .map_err(|e| format!("WPD key error: {e}"))?;
                keys.Add(&WPD_STORAGE_DESCRIPTION)
                    .map_err(|e| format!("WPD key error: {e}"))?;
                keys.Add(&WPD_STORAGE_CAPACITY)
                    .map_err(|e| format!("WPD key error: {e}"))?;
                keys.Add(&WPD_STORAGE_FREE_SPACE_IN_BYTES)
                    .map_err(|e| format!("WPD key error: {e}"))?;
            }
            Ok(keys)
        }
    }

    fn read_optional_wpd_string(values: &IPortableDeviceValues, key: &PROPERTYKEY) -> Option<String> {
        let raw = unsafe { values.GetStringValue(key) }.ok()?;
        let text = take_co_task_pwstr(raw);
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    fn read_optional_wpd_time_ms(values: &IPortableDeviceValues, key: &PROPERTYKEY) -> Option<u64> {
        let pv = OwnedPropVariant(unsafe { values.GetValue(key) }.ok()?);
        propvariant_to_unix_ms(&pv.0)
    }

    #[derive(Clone, Debug)]
    struct WpdObjectInfo {
        object_id: String,
        name: String,
        is_folder: bool,
        is_hidden: bool,
        size: u64,
        modified_ms: Option<u64>,
        created_ms: Option<u64>,
    }

    fn read_object_info(
        properties: &IPortableDeviceProperties,
        keys: &IPortableDeviceKeyCollection,
        object_id: &str,
        at_device_root: bool,
    ) -> Option<WpdObjectInfo> {
        let wide_id: Vec<u16> = object_id.encode_utf16().chain(Some(0)).collect();
        let values = unsafe { properties.GetValues(PCWSTR(wide_id.as_ptr()), keys) }.ok()?;
        let content_type = unsafe { values.GetGuidValue(&WPD_OBJECT_CONTENT_TYPE) }.ok()?;

        if at_device_root {
            let is_storage = content_type == WPD_CONTENT_TYPE_FUNCTIONAL_OBJECT
                && unsafe { values.GetGuidValue(&WPD_FUNCTIONAL_OBJECT_CATEGORY) }
                    .is_ok_and(|cat| cat == WPD_FUNCTIONAL_CATEGORY_STORAGE);
            if !is_storage && content_type != WPD_CONTENT_TYPE_FOLDER {
                return None;
            }
            let raw_name = read_optional_wpd_string(&values, &WPD_OBJECT_NAME)
                .or_else(|| read_optional_wpd_string(&values, &WPD_STORAGE_DESCRIPTION))
                .unwrap_or_else(|| object_id.to_string());
            return Some(WpdObjectInfo {
                object_id: object_id.to_string(),
                name: sanitize_portable_segment(&raw_name),
                is_folder: true,
                is_hidden: false,
                size: 0,
                modified_ms: None,
                created_ms: None,
            });
        }

        let is_folder = content_type == WPD_CONTENT_TYPE_FOLDER;
        let raw_name = read_optional_wpd_string(&values, &WPD_OBJECT_ORIGINAL_FILE_NAME)
            .or_else(|| read_optional_wpd_string(&values, &WPD_OBJECT_NAME))
            .unwrap_or_else(|| object_id.to_string());
        let name = sanitize_portable_segment(&raw_name);
        let is_hidden = unsafe { values.GetBoolValue(&WPD_OBJECT_ISHIDDEN) }
            .is_ok_and(|val| val.as_bool())
            || name.starts_with('.');
        let size = if is_folder {
            0
        } else {
            unsafe { values.GetUnsignedLargeIntegerValue(&WPD_OBJECT_SIZE) }.unwrap_or(0)
        };
        let modified_ms = read_optional_wpd_time_ms(&values, &WPD_OBJECT_DATE_MODIFIED);
        let created_ms = read_optional_wpd_time_ms(&values, &WPD_OBJECT_DATE_CREATED);

        Some(WpdObjectInfo {
            object_id: object_id.to_string(),
            name,
            is_folder,
            is_hidden,
            size,
            modified_ms,
            created_ms,
        })
    }

    fn enumerate_folder_objects(
        content: &IPortableDeviceContent,
        parent_id: &str,
        at_device_root: bool,
    ) -> Result<Vec<WpdObjectInfo>, String> {
        let properties = unsafe { content.Properties() }
            .map_err(|error| format!("Could not read portable device properties: {error}"))?;
        let keys = build_object_property_keys(at_device_root)?;
        let child_ids = enum_direct_child_ids(content, parent_id)?;
        let mut items = Vec::with_capacity(child_ids.len());
        let mut seen_names: HashMap<String, usize> = HashMap::new();
        for child_id in child_ids {
            let Some(mut info) = read_object_info(&properties, &keys, &child_id, at_device_root) else {
                continue;
            };
            let key = info.name.to_ascii_lowercase();
            if let Some(count) = seen_names.get_mut(&key) {
                *count += 1;
                info.name = format!("{} ({})", info.name, *count);
            } else {
                seen_names.insert(key, 1);
            }
            items.push(info);
        }
        Ok(items)
    }

    fn infer_subtype_from_label(label: Option<&str>) -> &'static str {
        let lower = label.unwrap_or_default().to_ascii_lowercase();
        if lower.contains("phone")
            || lower.contains("teléfono")
            || lower.contains("telefono")
            || lower.contains("móvil")
            || lower.contains("movil")
            || lower.contains("mobile")
            || lower.contains("celular")
        {
            "phone"
        } else if lower.contains("camera") || lower.contains("cámara") || lower.contains("camara") {
            "camera"
        } else if lower.contains("audio") || lower.contains("media") || lower.contains("reproductor") {
            "media"
        } else {
            "generic"
        }
    }

    fn probe_device_type_and_capacity(
        pnp_device_id: &str,
        label_hint: Option<&str>,
    ) -> (String, u64, u64) {
        let fallback_subtype = infer_subtype_from_label(label_hint).to_string();
        let lock = device_lock(pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let Ok(device) = open_wpd_device(pnp_device_id, GENERIC_READ.0) else {
            return (fallback_subtype, 0, 0);
        };
        let Ok(content) = (unsafe { device.0.Content() }) else {
            return (fallback_subtype, 0, 0);
        };
        let Ok(properties) = (unsafe { content.Properties() }) else {
            return (fallback_subtype, 0, 0);
        };

        let mut subtype = fallback_subtype;
        if let Ok(device_keys) = (|| unsafe {
            let keys: IPortableDeviceKeyCollection =
                CoCreateInstance(&PortableDeviceKeyCollection, None, CLSCTX_INPROC_SERVER)?;
            keys.Add(&WPD_DEVICE_TYPE)?;
            Ok::<_, windows::core::Error>(keys)
        })() {
            if let Ok(vals) = unsafe { properties.GetValues(WPD_DEVICE_OBJECT_ID, &device_keys) } {
                if let Ok(dev_type) = unsafe { vals.GetUnsignedIntegerValue(&WPD_DEVICE_TYPE) } {
                    let code = dev_type as i32;
                    subtype = if code == WPD_DEVICE_TYPE_PHONE.0 {
                        "phone".to_string()
                    } else if code == WPD_DEVICE_TYPE_CAMERA.0 {
                        "camera".to_string()
                    } else if code == WPD_DEVICE_TYPE_MEDIA_PLAYER.0
                        || code == WPD_DEVICE_TYPE_VIDEO.0
                        || code == WPD_DEVICE_TYPE_AUDIO_RECORDER.0
                    {
                        "media".to_string()
                    } else {
                        infer_subtype_from_label(label_hint).to_string()
                    };
                }
            }
        }

        let mut total_bytes = 0u64;
        let mut free_bytes = 0u64;
        if let (Ok(storage_ids), Ok(storage_keys)) = (
            enum_direct_child_ids(&content, "DEVICE"),
            build_object_property_keys(true),
        ) {
            for storage_id in storage_ids {
                let wide_id: Vec<u16> = storage_id.encode_utf16().chain(Some(0)).collect();
                let Ok(vals) =
                    (unsafe { properties.GetValues(PCWSTR(wide_id.as_ptr()), &storage_keys) })
                else {
                    continue;
                };
                let is_storage = unsafe { vals.GetGuidValue(&WPD_OBJECT_CONTENT_TYPE) }
                    .is_ok_and(|ct| ct == WPD_CONTENT_TYPE_FUNCTIONAL_OBJECT)
                    && unsafe { vals.GetGuidValue(&WPD_FUNCTIONAL_OBJECT_CATEGORY) }
                        .is_ok_and(|cat| cat == WPD_FUNCTIONAL_CATEGORY_STORAGE);
                if !is_storage {
                    continue;
                }
                let cap = unsafe { vals.GetUnsignedLargeIntegerValue(&WPD_STORAGE_CAPACITY) }
                    .unwrap_or(0);
                let free =
                    unsafe { vals.GetUnsignedLargeIntegerValue(&WPD_STORAGE_FREE_SPACE_IN_BYTES) }
                        .unwrap_or(0);
                total_bytes = total_bytes.saturating_add(cap);
                free_bytes = free_bytes.saturating_add(free.min(cap));
            }
        }
        let used_bytes = total_bytes.saturating_sub(free_bytes);
        (subtype, total_bytes, used_bytes)
    }

    struct RawShellDevice {
        friendly_name: String,
        pnp_device_id: String,
        shell_parsing_name: String,
        device_type_label: Option<String>,
    }

    fn enumerate_computer_shell_devices() -> Vec<RawShellDevice> {
        let mut found = Vec::new();
        let Ok(computer) =
            (unsafe { SHGetKnownFolderItem::<IShellItem>(&FOLDERID_ComputerFolder, KF_FLAG_DEFAULT, None) })
        else {
            return found;
        };
        let Ok(enum_items) =
            (unsafe { computer.BindToHandler::<_, IEnumShellItems>(None::<&IBindCtx>, &BHID_EnumItems) })
        else {
            return found;
        };

        let mask = SFGAO_FOLDER | SFGAO_FILESYSTEM;
        loop {
            let mut batch: [Option<IShellItem>; 1] = [None];
            let mut fetched = 0u32;
            if unsafe { enum_items.Next(&mut batch, Some(&mut fetched)) }.is_err() || fetched == 0 {
                break;
            }
            let Some(item) = batch[0].take() else {
                continue;
            };
            let Ok(attrs) = (unsafe { item.GetAttributes(mask) }) else {
                continue;
            };
            if (attrs & SFGAO_FOLDER) == SFGAO_FLAGS(0)
                || (attrs & SFGAO_FILESYSTEM) != SFGAO_FLAGS(0)
            {
                continue;
            }
            let Ok(parsing_pwstr) = (unsafe { item.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING) })
            else {
                continue;
            };
            let parsing_name = take_co_task_pwstr(parsing_pwstr);
            let Some(pnp_pos) = parsing_name.find("\\\\?\\") else {
                continue;
            };
            let pnp_device_id = parsing_name[pnp_pos..].to_string();
            if pnp_device_id.to_ascii_lowercase().starts_with("\\\\?\\wpdbusenum#") {
                continue;
            }
            let friendly_name = unsafe { item.GetDisplayName(SIGDN_NORMALDISPLAY) }
                .map(take_co_task_pwstr)
                .unwrap_or_default();
            let device_type_label = item
                .cast::<IShellItem2>()
                .ok()
                .and_then(|item2| unsafe { item2.GetString(&PKEY_ITEM_TYPE_TEXT) }.ok())
                .map(take_co_task_pwstr)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            let display = if friendly_name.trim().is_empty() {
                "Portable Device".to_string()
            } else {
                friendly_name.trim().to_string()
            };
            found.push(RawShellDevice {
                friendly_name: display,
                pnp_device_id,
                shell_parsing_name: parsing_name,
                device_type_label,
            });
        }
        found
    }

    pub fn list_portable_devices() -> Vec<PortableDeviceSummary> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Vec::new();
        };
        let mut raw_devices = enumerate_computer_shell_devices();
        raw_devices.sort_by(|a, b| {
            a.friendly_name
                .to_ascii_lowercase()
                .cmp(&b.friendly_name.to_ascii_lowercase())
                .then_with(|| {
                    a.pnp_device_id
                        .to_ascii_lowercase()
                        .cmp(&b.pnp_device_id.to_ascii_lowercase())
                })
        });

        let mut used_keys: HashMap<String, usize> = HashMap::new();
        let mut next_registry: HashMap<String, RegisteredDevice> = HashMap::new();
        let mut active_pnp_ids = HashSet::new();
        let mut summaries = Vec::with_capacity(raw_devices.len());

        for raw in raw_devices {
            let base_key = sanitize_portable_segment(&raw.friendly_name);
            let lower_base = base_key.to_ascii_lowercase();
            let count = used_keys
                .entry(lower_base)
                .and_modify(|c| *c += 1)
                .or_insert(1);
            let device_key = if *count == 1 {
                base_key
            } else {
                format!("{base_key} ({count})")
            };
            let reg_key = device_key.to_ascii_lowercase();
            active_pnp_ids.insert(raw.pnp_device_id.to_ascii_lowercase());

            let (subtype, total_bytes, used_bytes) = probe_device_type_and_capacity(
                &raw.pnp_device_id,
                raw.device_type_label.as_deref(),
            );
            let root_path = build_portable_path(&device_key, &[]);
            summaries.push(PortableDeviceSummary {
                id: format!("portable-{reg_key}"),
                root_path,
                label: raw.friendly_name.clone(),
                total_bytes,
                used_bytes,
                device_subtype: subtype,
                device_type_label: raw.device_type_label.clone(),
            });
            next_registry.insert(
                reg_key,
                RegisteredDevice {
                    device_key,
                    friendly_name: raw.friendly_name,
                    pnp_device_id: raw.pnp_device_id,
                    shell_parsing_name: raw.shell_parsing_name,
                },
            );
        }

        {
            let mut reg_guard = device_registry()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let mut cache_guard = object_id_cache()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            cache_guard.retain(|pnp_key, _| active_pnp_ids.contains(pnp_key));
            for (k, prev) in reg_guard.iter() {
                if let Some(next) = next_registry.get(k) {
                    if !prev.pnp_device_id.eq_ignore_ascii_case(&next.pnp_device_id) {
                        cache_guard.remove(&prev.pnp_device_id.to_ascii_lowercase());
                    }
                }
            }
            *reg_guard = next_registry;
        }

        summaries
    }

    pub fn portable_devices_signature() -> Vec<String> {
        let Ok(manager) =
            (unsafe { CoCreateInstance::<_, IPortableDeviceManager>(&PortableDeviceManager, None, CLSCTX_INPROC_SERVER) })
        else {
            return Vec::new();
        };
        let _ = unsafe { manager.RefreshDeviceList() };
        let mut count = 0u32;
        if unsafe { manager.GetDevices(std::ptr::null_mut(), &mut count) }.is_err() || count == 0 {
            return Vec::new();
        }
        let mut raw_ids = vec![PWSTR::null(); count as usize];
        if unsafe { manager.GetDevices(raw_ids.as_mut_ptr(), &mut count) }.is_err() {
            for raw in raw_ids {
                if !raw.0.is_null() {
                    let _ = take_co_task_pwstr(raw);
                }
            }
            return Vec::new();
        }
        let actual = (count as usize).min(raw_ids.len());
        let mut signature = Vec::with_capacity(actual);
        for raw in raw_ids.into_iter().take(actual) {
            let id = take_co_task_pwstr(raw).to_ascii_lowercase();
            if !id.is_empty() && !id.starts_with("\\\\?\\wpdbusenum#") {
                signature.push(id);
            }
        }
        signature.sort();
        signature.dedup();
        signature
    }

    fn resolve_registered_device(device_key: &str) -> Result<RegisteredDevice, String> {
        let key = device_key.to_ascii_lowercase();
        if let Some(device) = device_registry()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&key)
            .cloned()
        {
            return Ok(device);
        }
        let _ = list_portable_devices();
        device_registry()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&key)
            .cloned()
            .ok_or_else(|| format!("Portable device \"{device_key}\" is not connected."))
    }

    fn resolve_object_id_locked(
        content: &IPortableDeviceContent,
        device: &RegisteredDevice,
        rel_segments: &[String],
    ) -> Result<(String, String, Vec<String>), String> {
        if rel_segments.is_empty() {
            return Ok(("DEVICE".to_string(), device.device_key.clone(), Vec::new()));
        }

        let mut canonical_segments: Vec<String> = Vec::with_capacity(rel_segments.len());
        let target_full = build_portable_path(&device.device_key, rel_segments);
        if let Some(cached_id) = get_cached_object_id(&device.pnp_device_id, &target_full) {
            // Walk cached canonical casing if possible, or verify parent chain by trying properties.
            let properties = unsafe { content.Properties() }
                .map_err(|error| format!("Could not read portable device properties: {error}"))?;
            let keys = build_object_property_keys(rel_segments.len() == 1)?;
            if read_object_info(&properties, &keys, &cached_id, rel_segments.len() == 1).is_some()
            {
                let label = rel_segments.last().cloned().unwrap_or_else(|| device.device_key.clone());
                return Ok((cached_id, label, rel_segments.to_vec()));
            }
            invalidate_cache_prefix(&device.pnp_device_id, &target_full);
        }

        let mut current_id = "DEVICE".to_string();
        let mut current_label = device.friendly_name.clone();
        for (idx, seg) in rel_segments.iter().enumerate() {
            let probe_prefix = build_portable_path(
                &device.device_key,
                &rel_segments[..=idx],
            );
            let at_device_root = idx == 0;
            if let Some(cached) = get_cached_object_id(&device.pnp_device_id, &probe_prefix) {
                current_id = cached;
                current_label = seg.clone();
                canonical_segments.push(seg.clone());
                continue;
            }
            let children = enumerate_folder_objects(content, &current_id, at_device_root)?;
            for child in &children {
                let mut child_segs = canonical_segments.clone();
                child_segs.push(child.name.clone());
                cache_object_id(
                    &device.pnp_device_id,
                    &build_portable_path(&device.device_key, &child_segs),
                    &child.object_id,
                );
            }
            let matched = children
                .into_iter()
                .find(|child| child.name.eq_ignore_ascii_case(seg))
                .ok_or_else(|| format!("Portable path not found: {}", build_portable_path(&device.device_key, rel_segments)))?;
            current_id = matched.object_id;
            current_label = matched.name.clone();
            canonical_segments.push(matched.name);
        }

        Ok((current_id, current_label, canonical_segments))
    }

    pub fn list_portable_directory(path: &str) -> Result<(String, String, Vec<PortableEntry>), String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not read portable device content: {error}"))?;
        let (parent_id, root_name, canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;
        let at_device_root = canonical_segments.is_empty();
        let children = enumerate_folder_objects(&content, &parent_id, at_device_root)?;

        let canonical_root = build_portable_path(&device.device_key, &canonical_segments);
        let mut entries = Vec::with_capacity(children.len());
        for child in children {
            let mut segs = canonical_segments.clone();
            segs.push(child.name.clone());
            let child_path = build_portable_path(&device.device_key, &segs);
            cache_object_id(&device.pnp_device_id, &child_path, &child.object_id);
            entries.push(PortableEntry {
                name: child.name,
                path: child_path,
                is_folder: child.is_folder,
                is_hidden: child.is_hidden,
                size: child.size,
                modified_ms: child.modified_ms,
                created_ms: child.created_ms,
            });
        }
        let resolved_root_name = if at_device_root {
            device.friendly_name
        } else {
            root_name
        };
        Ok((canonical_root, resolved_root_name, entries))
    }

    fn make_unique_child_name_locked(
        content: &IPortableDeviceContent,
        parent_id: &str,
        at_device_root: bool,
        desired: &str,
    ) -> Result<String, String> {
        let existing = enumerate_folder_objects(content, parent_id, at_device_root)?;
        let existing_lower: HashSet<String> = existing
            .into_iter()
            .map(|entry| entry.name.to_ascii_lowercase())
            .collect();
        if !existing_lower.contains(&desired.to_ascii_lowercase()) {
            return Ok(desired.to_string());
        }
        let (stem, ext) = match desired.rfind('.') {
            Some(idx) if idx > 0 && idx < desired.len() - 1 => (&desired[..idx], &desired[idx..]),
            _ => (desired, ""),
        };
        let mut index = 1u32;
        loop {
            let candidate = format!("{stem} ({index}){ext}");
            if !existing_lower.contains(&candidate.to_ascii_lowercase()) {
                return Ok(candidate);
            }
            index += 1;
        }
    }

    pub fn unique_portable_child_name(parent_path: &str, desired: &str) -> Result<String, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) = parse_portable_path(parent_path)
            .ok_or_else(|| "Invalid portable device parent path.".to_string())?;
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let (parent_id, _, canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;
        make_unique_child_name_locked(&content, &parent_id, canonical_segments.is_empty(), desired)
    }

    pub fn child_exists_on_portable(parent_path: &str, name: &str) -> Result<bool, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) = parse_portable_path(parent_path)
            .ok_or_else(|| "Invalid portable device parent path.".to_string())?;
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let (parent_id, _, canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;
        let existing = enumerate_folder_objects(&content, &parent_id, canonical_segments.is_empty())?;
        Ok(existing
            .into_iter()
            .any(|entry| entry.name.eq_ignore_ascii_case(name)))
    }

    fn create_folder_locked(
        content: &IPortableDeviceContent,
        parent_id: &str,
        name: &str,
    ) -> Result<String, String> {
        let name_wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let parent_wide: Vec<u16> = parent_id.encode_utf16().chain(Some(0)).collect();
        unsafe {
            let props: IPortableDeviceValues =
                CoCreateInstance(&PortableDeviceValues, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("Could not create folder property bag: {error}"))?;
            props
                .SetStringValue(&WPD_OBJECT_PARENT_ID, PCWSTR(parent_wide.as_ptr()))
                .map_err(|error| format!("Could not set parent ID: {error}"))?;
            props
                .SetStringValue(&WPD_OBJECT_NAME, PCWSTR(name_wide.as_ptr()))
                .map_err(|error| format!("Could not set folder name: {error}"))?;
            props
                .SetStringValue(&WPD_OBJECT_ORIGINAL_FILE_NAME, PCWSTR(name_wide.as_ptr()))
                .map_err(|error| format!("Could not set folder filename: {error}"))?;
            props
                .SetGuidValue(&WPD_OBJECT_CONTENT_TYPE, &WPD_CONTENT_TYPE_FOLDER)
                .map_err(|error| format!("Could not set folder content type: {error}"))?;
            props
                .SetGuidValue(&WPD_OBJECT_FORMAT, &WPD_OBJECT_FORMAT_PROPERTIES_ONLY)
                .map_err(|error| format!("Could not set folder format: {error}"))?;

            let mut created_pwstr = PWSTR::null();
            content
                .CreateObjectWithPropertiesOnly(&props, &mut created_pwstr)
                .map_err(|error| format!("Could not create folder on portable device: {error}"))?;
            Ok(take_co_task_pwstr(created_pwstr))
        }
    }

    pub fn create_portable_directory(parent_path: &str, name: &str) -> Result<(String, String), String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(parent_path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.is_empty() {
            return Err("Open a storage volume inside the device before creating folders.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0 | GENERIC_WRITE.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let (parent_id, _, mut canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;
        let final_name = make_unique_child_name_locked(&content, &parent_id, false, name)?;
        let created_id = create_folder_locked(&content, &parent_id, &final_name)?;
        canonical_segments.push(final_name.clone());
        let child_path = build_portable_path(&device.device_key, &canonical_segments);
        cache_object_id(&device.pnp_device_id, &child_path, &created_id);
        Ok((child_path, final_name))
    }

    fn content_type_and_format_for_filename(name: &str) -> (GUID, GUID) {
        let ext = Path::new(name)
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        match ext.as_str() {
            "jpg" | "jpeg" | "jpe" | "jfif" => (WPD_CONTENT_TYPE_IMAGE, WPD_OBJECT_FORMAT_EXIF),
            "png" => (WPD_CONTENT_TYPE_IMAGE, WPD_OBJECT_FORMAT_PNG),
            "gif" | "webp" | "bmp" | "heic" | "heif" | "tif" | "tiff" => {
                (WPD_CONTENT_TYPE_IMAGE, WPD_OBJECT_FORMAT_UNSPECIFIED)
            }
            "mp3" => (WPD_CONTENT_TYPE_AUDIO, WPD_OBJECT_FORMAT_MP3),
            "wma" => (WPD_CONTENT_TYPE_AUDIO, WPD_OBJECT_FORMAT_WMA),
            "wav" | "flac" | "ogg" | "aac" | "m4a" | "opus" => {
                (WPD_CONTENT_TYPE_AUDIO, WPD_OBJECT_FORMAT_UNSPECIFIED)
            }
            "mp4" | "m4v" => (WPD_CONTENT_TYPE_VIDEO, WPD_OBJECT_FORMAT_MP4),
            "wmv" => (WPD_CONTENT_TYPE_VIDEO, WPD_OBJECT_FORMAT_WMV),
            "mkv" | "mov" | "avi" | "webm" | "3gp" => {
                (WPD_CONTENT_TYPE_VIDEO, WPD_OBJECT_FORMAT_UNSPECIFIED)
            }
            "txt" | "md" | "json" | "csv" | "log" | "xml" => {
                (WPD_CONTENT_TYPE_DOCUMENT, WPD_OBJECT_FORMAT_TEXT)
            }
            "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" => {
                (WPD_CONTENT_TYPE_DOCUMENT, WPD_OBJECT_FORMAT_UNSPECIFIED)
            }
            _ => (WPD_CONTENT_TYPE_GENERIC_FILE, WPD_OBJECT_FORMAT_UNSPECIFIED),
        }
    }

    fn upload_reader_to_portable_locked<R: Read>(
        content: &IPortableDeviceContent,
        parent_id: &str,
        name: &str,
        size: u64,
        reader: &mut R,
        mut progress_cb: Option<&mut dyn FnMut(u64) -> Result<(), String>>,
    ) -> Result<String, String> {
        let name_wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let parent_wide: Vec<u16> = parent_id.encode_utf16().chain(Some(0)).collect();
        let (content_type, format_guid) = content_type_and_format_for_filename(name);

        let (stream, optimal_buf) = unsafe {
            let props: IPortableDeviceValues =
                CoCreateInstance(&PortableDeviceValues, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("Could not create file property bag: {error}"))?;
            props
                .SetStringValue(&WPD_OBJECT_PARENT_ID, PCWSTR(parent_wide.as_ptr()))
                .map_err(|error| format!("Could not set parent ID: {error}"))?;
            props
                .SetStringValue(&WPD_OBJECT_NAME, PCWSTR(name_wide.as_ptr()))
                .map_err(|error| format!("Could not set file name: {error}"))?;
            props
                .SetStringValue(&WPD_OBJECT_ORIGINAL_FILE_NAME, PCWSTR(name_wide.as_ptr()))
                .map_err(|error| format!("Could not set original file name: {error}"))?;
            props
                .SetUnsignedLargeIntegerValue(&WPD_OBJECT_SIZE, size)
                .map_err(|error| format!("Could not set file size: {error}"))?;
            props
                .SetGuidValue(&WPD_OBJECT_CONTENT_TYPE, &content_type)
                .map_err(|error| format!("Could not set content type: {error}"))?;
            props
                .SetGuidValue(&WPD_OBJECT_FORMAT, &format_guid)
                .map_err(|error| format!("Could not set object format: {error}"))?;

            let mut out_stream: Option<IStream> = None;
            let mut optimal_buf = 0u32;
            content
                .CreateObjectWithPropertiesAndData(
                    &props,
                    &mut out_stream,
                    &mut optimal_buf,
                    std::ptr::null_mut(),
                )
                .map_err(|error| format!("Could not create file on portable device: {error}"))?;
            let stream = out_stream
                .ok_or_else(|| "Portable device did not return a data stream.".to_string())?;
            (stream, optimal_buf)
        };

        let data_stream: Option<IPortableDeviceDataStream> = stream.cast().ok();
        let cancel_stream = || {
            if let Some(ds) = &data_stream {
                unsafe {
                    let _ = ds.Cancel();
                }
            }
        };

        let chunk_len = (optimal_buf as usize).clamp(64 * 1024, 1024 * 1024);
        let mut buffer = vec![0u8; chunk_len];
        loop {
            if let Some(cb) = progress_cb.as_deref_mut() {
                if let Err(err) = cb(0) {
                    cancel_stream();
                    return Err(err);
                }
            }
            let read_len = match reader.read(&mut buffer) {
                Ok(n) => n,
                Err(error) => {
                    cancel_stream();
                    return Err(format!("Could not read source file: {error}"));
                }
            };
            if read_len == 0 {
                break;
            }
            let mut offset = 0usize;
            while offset < read_len {
                let mut written = 0u32;
                let hr = unsafe {
                    stream.Write(
                        buffer[offset..read_len].as_ptr().cast(),
                        (read_len - offset) as u32,
                        Some(&mut written),
                    )
                };
                if hr.is_err() || written == 0 {
                    cancel_stream();
                    return Err(format!(
                        "Could not write file data to portable device: {hr}"
                    ));
                }
                offset += written as usize;
                if let Some(cb) = progress_cb.as_deref_mut() {
                    if let Err(err) = cb(written as u64) {
                        cancel_stream();
                        return Err(err);
                    }
                }
            }
        }

        if let Err(error) = unsafe { stream.Commit(STGC_DEFAULT) } {
            cancel_stream();
            return Err(format!("Could not commit file to portable device: {error}"));
        }

        let created_id = data_stream
            .and_then(|ds| unsafe { ds.GetObjectID() }.ok())
            .map(take_co_task_pwstr)
            .unwrap_or_default();
        Ok(created_id)
    }

    pub fn create_portable_file_from_bytes(
        parent_path: &str,
        name: &str,
        bytes: &[u8],
    ) -> Result<(String, String, u64), String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(parent_path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.is_empty() {
            return Err("Open a storage volume inside the device before creating files.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0 | GENERIC_WRITE.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let (parent_id, _, mut canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;
        let final_name = make_unique_child_name_locked(&content, &parent_id, false, name)?;
        let mut cursor = Cursor::new(bytes);
        let created_id = upload_reader_to_portable_locked(
            &content,
            &parent_id,
            &final_name,
            bytes.len() as u64,
            &mut cursor,
            None,
        )?;
        canonical_segments.push(final_name.clone());
        let child_path = build_portable_path(&device.device_key, &canonical_segments);
        if !created_id.is_empty() {
            cache_object_id(&device.pnp_device_id, &child_path, &created_id);
        }
        Ok((child_path, final_name, bytes.len() as u64))
    }

    pub fn rename_portable_item(path: &str, new_name: &str) -> Result<String, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.len() < 2 {
            return Err("Portable device and storage roots cannot be renamed.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0 | GENERIC_WRITE.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let parent_segments = &rel_segments[..rel_segments.len() - 1];
        let (parent_id, _, canonical_parent_segments) =
            resolve_object_id_locked(&content, &device, parent_segments)?;
        let (object_id, current_name, canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;
        if current_name == new_name {
            return Ok(build_portable_path(&device.device_key, &canonical_segments));
        }

        let siblings = enumerate_folder_objects(&content, &parent_id, false)?;
        if siblings
            .iter()
            .any(|sibling| sibling.object_id != object_id && sibling.name.eq_ignore_ascii_case(new_name))
        {
            return Err("An item with that name already exists.".to_string());
        }

        let properties = unsafe { content.Properties() }
            .map_err(|error| format!("Could not read portable device properties: {error}"))?;
        let wide_id: Vec<u16> = object_id.encode_utf16().chain(Some(0)).collect();
        let new_name_wide: Vec<u16> = new_name.encode_utf16().chain(Some(0)).collect();

        let try_set_key = |key: &PROPERTYKEY| -> Result<(), String> {
            unsafe {
                let values: IPortableDeviceValues =
                    CoCreateInstance(&PortableDeviceValues, None, CLSCTX_INPROC_SERVER)
                        .map_err(|error| format!("Could not create WPD values bag: {error}"))?;
                values
                    .SetStringValue(key, PCWSTR(new_name_wide.as_ptr()))
                    .map_err(|error| format!("Could not assign new name: {error}"))?;
                let results = properties
                    .SetValues(PCWSTR(wide_id.as_ptr()), &values)
                    .map_err(|error| format!("Could not rename item on portable device: {error}"))?;
                if let Ok(prop_hr) = results.GetErrorValue(key) {
                    if prop_hr.is_err() {
                        return Err(format!("Device rejected rename ({prop_hr})."));
                    }
                }
                Ok(())
            }
        };

        if let Err(primary_err) = try_set_key(&WPD_OBJECT_ORIGINAL_FILE_NAME) {
            try_set_key(&WPD_OBJECT_NAME).map_err(|fallback_err| {
                format!("{primary_err} ({fallback_err})")
            })?;
        } else {
            // Keep WPD_OBJECT_NAME in sync when supported; ignore if device marks it read-only.
            let _ = try_set_key(&WPD_OBJECT_NAME);
        }

        let old_path = build_portable_path(&device.device_key, &canonical_segments);
        invalidate_cache_prefix(&device.pnp_device_id, &old_path);
        let mut next_segments = canonical_parent_segments;
        next_segments.push(new_name.to_string());
        let next_path = build_portable_path(&device.device_key, &next_segments);
        cache_object_id(&device.pnp_device_id, &next_path, &object_id);
        Ok(next_path)
    }

    pub fn delete_portable_item(path: &str) -> Result<(), String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.len() < 2 {
            return Err("Portable device and storage roots cannot be deleted.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0 | GENERIC_WRITE.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let (object_id, _, canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;

        unsafe {
            let collection: IPortableDevicePropVariantCollection = CoCreateInstance(
                &PortableDevicePropVariantCollection,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|error| format!("Could not create WPD deletion list: {error}"))?;
            let pv = propvariant_from_string(&object_id)?;
            collection
                .Add(&pv.0)
                .map_err(|error| format!("Could not queue item for deletion: {error}"))?;
            let mut results: Option<IPortableDevicePropVariantCollection> = None;
            content
                .Delete(
                    PORTABLE_DEVICE_DELETE_WITH_RECURSION.0 as u32,
                    &collection,
                    &mut results,
                )
                .map_err(|error| format!("Could not delete item on portable device: {error}"))?;
            if let Some(res_coll) = results {
                let mut count = 0u32;
                if res_coll.GetCount(&mut count).is_ok() && count > 0 {
                    let mut item_pv = OwnedPropVariant(PROPVARIANT::default());
                    if res_coll.GetAt(0, &mut item_pv.0).is_ok() {
                        let inner = &*item_pv.0.Anonymous.Anonymous;
                        // VT_ERROR (10) holds SCODE / HRESULT in scode.
                        if inner.vt.0 == 10 && inner.Anonymous.scode < 0 {
                            return Err(format!(
                                "Device rejected deletion (HRESULT 0x{:08X}).",
                                inner.Anonymous.scode as u32
                            ));
                        }
                    }
                }
            }
        }

        let deleted_path = build_portable_path(&device.device_key, &canonical_segments);
        invalidate_cache_prefix(&device.pnp_device_id, &deleted_path);
        Ok(())
    }

    pub fn inspect_portable_tree(
        path: &str,
        check_control: &mut dyn FnMut(&str, u64) -> Result<(), String>,
    ) -> Result<PortableTreeSummary, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.len() < 2 {
            return Err("Portable device and storage roots cannot be transferred directly.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let properties = unsafe { content.Properties() }
            .map_err(|error| format!("Could not read portable device properties: {error}"))?;
        let keys = build_object_property_keys(false)?;
        let (root_id, root_name, _) = resolve_object_id_locked(&content, &device, &rel_segments)?;
        let root_info = read_object_info(&properties, &keys, &root_id, false)
            .ok_or_else(|| format!("Could not inspect portable item {root_name}."))?;

        let mut summary = PortableTreeSummary::default();
        let mut stack = vec![(root_info, root_name)];
        while let Some((info, rel_label)) = stack.pop() {
            check_control(&rel_label, info.size)?;
            summary.total_items = summary.total_items.saturating_add(1);
            if info.is_folder {
                let children = enumerate_folder_objects(&content, &info.object_id, false)?;
                for child in children.into_iter().rev() {
                    let child_label = format!("{rel_label}\\{}", child.name);
                    stack.push((child, child_label));
                }
            } else {
                summary.total_bytes = summary.total_bytes.saturating_add(info.size);
            }
        }
        Ok(summary)
    }

    fn stream_object_to_writer<W: Write>(
        resources: &IPortableDeviceResources,
        object_id: &str,
        resource_key: &PROPERTYKEY,
        writer: &mut W,
        max_bytes: Option<u64>,
        mut on_chunk: Option<&mut dyn FnMut(u64) -> Result<(), String>>,
    ) -> Result<u64, String> {
        let wide_id: Vec<u16> = object_id.encode_utf16().chain(Some(0)).collect();
        let (stream, optimal_buf) = unsafe {
            let mut out_stream: Option<IStream> = None;
            let mut optimal_buf = 0u32;
            resources
                .GetStream(
                    PCWSTR(wide_id.as_ptr()),
                    resource_key,
                    STGM_READ.0,
                    &mut optimal_buf,
                    &mut out_stream,
                )
                .map_err(|error| format!("Could not open stream on portable device: {error}"))?;
            let stream = out_stream
                .ok_or_else(|| "Portable device did not provide a readable stream.".to_string())?;
            (stream, optimal_buf)
        };

        let chunk_len = (optimal_buf as usize).clamp(64 * 1024, 1024 * 1024);
        let mut buffer = vec![0u8; chunk_len];
        let mut total_written = 0u64;
        loop {
            if let Some(cb) = on_chunk.as_deref_mut() {
                cb(0)?;
            }
            let mut read = 0u32;
            let hr = unsafe { stream.Read(buffer.as_mut_ptr().cast(), chunk_len as u32, Some(&mut read)) };
            if hr.is_err() {
                return Err(format!("Could not read from portable device stream: {hr}"));
            }
            if read == 0 {
                break;
            }
            total_written = total_written.saturating_add(read as u64);
            if let Some(limit) = max_bytes {
                if total_written > limit {
                    return Err("The portable item exceeds the allowed size limit.".to_string());
                }
            }
            writer
                .write_all(&buffer[..read as usize])
                .map_err(|error| format!("Could not write downloaded file: {error}"))?;
            if let Some(cb) = on_chunk.as_deref_mut() {
                cb(read as u64)?;
            }
            if hr == S_FALSE && (read as usize) < chunk_len {
                break;
            }
        }
        Ok(total_written)
    }

    pub fn download_portable_to_local(
        src_portable: &str,
        dst_local: &Path,
        check_control: &mut dyn FnMut(&str, u64, u64, bool) -> Result<(), String>,
    ) -> Result<(), String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(src_portable).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.len() < 2 {
            return Err("Portable device and storage roots cannot be copied directly.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let properties = unsafe { content.Properties() }
            .map_err(|error| format!("Could not read portable device properties: {error}"))?;
        let resources = unsafe { content.Transfer() }
            .map_err(|error| format!("Could not open portable device transfer channel: {error}"))?;
        let keys = build_object_property_keys(false)?;
        let (root_id, root_name, _) = resolve_object_id_locked(&content, &device, &rel_segments)?;
        let root_info = read_object_info(&properties, &keys, &root_id, false)
            .ok_or_else(|| format!("Could not inspect portable item {root_name}."))?;

        fn copy_node(
            content: &IPortableDeviceContent,
            resources: &IPortableDeviceResources,
            info: &WpdObjectInfo,
            dst_path: &Path,
            check_control: &mut dyn FnMut(&str, u64, u64, bool) -> Result<(), String>,
        ) -> Result<(), String> {
            let label = dst_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| info.name.clone());
            if info.is_folder {
                check_control(&label, 0, 0, false)?;
                fs::create_dir_all(dst_path).map_err(|error| {
                    format!("Could not create {}: {error}", dst_path.display())
                })?;
                check_control(&label, 0, 0, true)?;
                let children = enumerate_folder_objects(content, &info.object_id, false)?;
                for child in children {
                    copy_node(content, resources, &child, &dst_path.join(&child.name), check_control)?;
                }
                return Ok(());
            }

            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Could not create {}: {error}", parent.display())
                })?;
            }
            check_control(&label, 0, info.size, false)?;
            let mut file = fs::File::create(dst_path).map_err(|error| {
                format!("Could not create {}: {error}", dst_path.display())
            })?;
            let mut chunk_cb = |bytes: u64| check_control(&label, bytes, info.size, false);
            let res = stream_object_to_writer(
                resources,
                &info.object_id,
                &WPD_RESOURCE_DEFAULT,
                &mut file,
                None,
                Some(&mut chunk_cb),
            );
            drop(file);
            if let Err(error) = res {
                let _ = fs::remove_file(dst_path);
                return Err(error);
            }
            check_control(&label, 0, info.size, true)?;
            Ok(())
        }

        copy_node(&content, &resources, &root_info, dst_local, check_control)
    }

    pub fn upload_local_to_portable(
        src_local: &Path,
        dst_portable_parent: &str,
        dst_name: &str,
        check_control: &mut dyn FnMut(&str, u64, u64, bool) -> Result<(), String>,
    ) -> Result<String, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) = parse_portable_path(dst_portable_parent)
            .ok_or_else(|| "Invalid portable destination path.".to_string())?;
        if rel_segments.is_empty() {
            return Err("Open a storage volume inside the device before transferring items.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0 | GENERIC_WRITE.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let (parent_id, _, canonical_parent_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;

        fn upload_node(
            content: &IPortableDeviceContent,
            pnp_id: &str,
            device_key: &str,
            src_path: &Path,
            parent_id: &str,
            parent_segments: &[String],
            target_name: &str,
            check_control: &mut dyn FnMut(&str, u64, u64, bool) -> Result<(), String>,
        ) -> Result<String, String> {
            let metadata = fs::symlink_metadata(src_path)
                .map_err(|error| format!("Cannot inspect {}: {error}", src_path.display()))?;
            if metadata.file_type().is_symlink() {
                return Err("Symbolic links cannot be transferred to portable devices.".to_string());
            }
            let clean_name = sanitize_portable_segment(target_name);
            let mut child_segments = parent_segments.to_vec();
            child_segments.push(clean_name.clone());
            let child_portable_path = build_portable_path(device_key, &child_segments);

            if metadata.is_dir() {
                check_control(&clean_name, 0, 0, false)?;
                let folder_id = create_folder_locked(content, parent_id, &clean_name)?;
                cache_object_id(pnp_id, &child_portable_path, &folder_id);
                check_control(&clean_name, 0, 0, true)?;
                let children = fs::read_dir(src_path)
                    .map_err(|error| format!("Cannot read {}: {error}", src_path.display()))?;
                for child in children {
                    let child = child.map_err(|error| error.to_string())?;
                    let child_name = child.file_name().to_string_lossy().into_owned();
                    upload_node(
                        content,
                        pnp_id,
                        device_key,
                        &child.path(),
                        &folder_id,
                        &child_segments,
                        &child_name,
                        check_control,
                    )?;
                }
                return Ok(child_portable_path);
            }

            if !metadata.is_file() {
                return Err(format!("Unsupported item type: {}", src_path.display()));
            }
            let total_size = metadata.len();
            check_control(&clean_name, 0, total_size, false)?;
            let mut file = fs::File::open(src_path)
                .map_err(|error| format!("Cannot open {}: {error}", src_path.display()))?;
            let mut chunk_cb = |bytes: u64| check_control(&clean_name, bytes, total_size, false);
            let created_id = upload_reader_to_portable_locked(
                content,
                parent_id,
                &clean_name,
                total_size,
                &mut file,
                Some(&mut chunk_cb),
            )?;
            if !created_id.is_empty() {
                cache_object_id(pnp_id, &child_portable_path, &created_id);
            }
            check_control(&clean_name, 0, total_size, true)?;
            Ok(child_portable_path)
        }

        upload_node(
            &content,
            &device.pnp_device_id,
            &device.device_key,
            src_local,
            &parent_id,
            &canonical_parent_segments,
            dst_name,
            check_control,
        )
    }

    pub fn move_portable_same_device(
        src_portable: &str,
        dst_portable_parent: &str,
    ) -> Result<Option<String>, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (src_key, src_segments) =
            parse_portable_path(src_portable).ok_or_else(|| "Invalid portable source path.".to_string())?;
        let (dst_key, dst_segments) = parse_portable_path(dst_portable_parent)
            .ok_or_else(|| "Invalid portable destination path.".to_string())?;
        if src_segments.len() < 2 || dst_segments.is_empty() || !src_key.eq_ignore_ascii_case(&dst_key) {
            return Ok(None);
        }
        let device = resolve_registered_device(&src_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0 | GENERIC_WRITE.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let (src_id, src_name, canonical_src_segments) =
            resolve_object_id_locked(&content, &device, &src_segments)?;
        let (dst_parent_id, _, mut canonical_dst_segments) =
            resolve_object_id_locked(&content, &device, &dst_segments)?;
        let siblings = enumerate_folder_objects(&content, &dst_parent_id, false)?;
        if siblings.iter().any(|entry| entry.name.eq_ignore_ascii_case(&src_name)) {
            return Ok(None);
        }

        let dst_wide: Vec<u16> = dst_parent_id.encode_utf16().chain(Some(0)).collect();
        let move_res = unsafe {
            let collection: IPortableDevicePropVariantCollection = CoCreateInstance(
                &PortableDevicePropVariantCollection,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|error| format!("Could not create WPD move list: {error}"))?;
            let pv = propvariant_from_string(&src_id)?;
            collection
                .Add(&pv.0)
                .map_err(|error| format!("Could not queue item for move: {error}"))?;
            let mut results: Option<IPortableDevicePropVariantCollection> = None;
            content.Move(&collection, PCWSTR(dst_wide.as_ptr()), &mut results)
        };
        if move_res.is_err() {
            return Ok(None);
        }

        let old_path = build_portable_path(&device.device_key, &canonical_src_segments);
        invalidate_cache_prefix(&device.pnp_device_id, &old_path);
        canonical_dst_segments.push(src_name);
        let next_path = build_portable_path(&device.device_key, &canonical_dst_segments);
        cache_object_id(&device.pnp_device_id, &next_path, &src_id);
        Ok(Some(next_path))
    }

    pub fn read_portable_file_bytes(path: &str, max_bytes: u64) -> Result<Vec<u8>, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.len() < 2 {
            return Err("Only files inside portable storage can be read.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let properties = unsafe { content.Properties() }
            .map_err(|error| format!("Could not read portable device properties: {error}"))?;
        let resources = unsafe { content.Transfer() }
            .map_err(|error| format!("Could not open portable device transfer channel: {error}"))?;
        let keys = build_object_property_keys(false)?;
        let (object_id, _, _) = resolve_object_id_locked(&content, &device, &rel_segments)?;
        let info = read_object_info(&properties, &keys, &object_id, false)
            .ok_or_else(|| "The selected portable item is unavailable.".to_string())?;
        if info.is_folder {
            return Err("Only regular files can be read.".to_string());
        }
        if info.size > max_bytes {
            return Err("The file is too large to preview.".to_string());
        }
        let mut bytes = Vec::with_capacity(info.size.min(1024 * 1024) as usize);
        stream_object_to_writer(
            &resources,
            &object_id,
            &WPD_RESOURCE_DEFAULT,
            &mut bytes,
            Some(max_bytes),
            None,
        )?;
        Ok(bytes)
    }

    fn portable_staging_dir() -> PathBuf {
        std::env::temp_dir().join("CyberFiles").join("portable-cache")
    }

    fn prune_portable_staging_cache(cache_dir: &Path) {
        let Ok(entries) = fs::read_dir(cache_dir) else {
            return;
        };
        struct CacheEntry {
            path: PathBuf,
            size: u64,
            modified: SystemTime,
        }
        let mut dirs: Vec<CacheEntry> = Vec::new();
        let mut total_size = 0u64;
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if !entry_path.is_dir() {
                continue;
            }
            let Ok(children) = fs::read_dir(&entry_path) else {
                continue;
            };
            let mut dir_size = 0u64;
            let mut latest = SystemTime::UNIX_EPOCH;
            for child in children.flatten() {
                if let Ok(meta) = child.metadata() {
                    dir_size = dir_size.saturating_add(meta.len());
                    if let Ok(mtime) = meta.modified() {
                        if mtime > latest {
                            latest = mtime;
                        }
                    }
                }
            }
            total_size = total_size.saturating_add(dir_size);
            dirs.push(CacheEntry {
                path: entry_path,
                size: dir_size,
                modified: latest,
            });
        }
        if dirs.len() <= MAX_PORTABLE_CACHE_FILES && total_size <= MAX_PORTABLE_CACHE_BYTES {
            return;
        }
        dirs.sort_by_key(|entry| entry.modified);
        let mut remaining_count = dirs.len();
        for dir in dirs {
            if remaining_count <= MAX_PORTABLE_CACHE_FILES && total_size <= MAX_PORTABLE_CACHE_BYTES {
                break;
            }
            if fs::remove_dir_all(&dir.path).is_ok() {
                remaining_count = remaining_count.saturating_sub(1);
                total_size = total_size.saturating_sub(dir.size);
            }
        }
    }

    pub fn stage_portable_file_to_temp(path: &str, max_bytes: Option<u64>) -> Result<PathBuf, String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows COM for portable devices.".to_string());
        };
        let (device_key, rel_segments) =
            parse_portable_path(path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        if rel_segments.len() < 2 {
            return Err("Only files inside portable storage can be opened.".to_string());
        }
        let device = resolve_registered_device(&device_key)?;
        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0)?;
        let content = unsafe { opened.0.Content() }
            .map_err(|error| format!("Could not access portable device content: {error}"))?;
        let properties = unsafe { content.Properties() }
            .map_err(|error| format!("Could not read portable device properties: {error}"))?;
        let resources = unsafe { content.Transfer() }
            .map_err(|error| format!("Could not open portable device transfer channel: {error}"))?;
        let keys = build_object_property_keys(false)?;
        let (object_id, _, canonical_segments) =
            resolve_object_id_locked(&content, &device, &rel_segments)?;
        let info = read_object_info(&properties, &keys, &object_id, false)
            .ok_or_else(|| "The selected portable item is unavailable.".to_string())?;
        if info.is_folder {
            return Err("Only regular files can be opened.".to_string());
        }
        if let Some(limit) = max_bytes {
            if info.size > limit {
                return Err("The file is too large for preview.".to_string());
            }
        }

        let canonical_path = build_portable_path(&device.device_key, &canonical_segments);
        let mut hasher = DefaultHasher::new();
        device.pnp_device_id.to_ascii_lowercase().hash(&mut hasher);
        canonical_path.to_ascii_lowercase().hash(&mut hasher);
        info.modified_ms.hash(&mut hasher);
        let hash_hex = format!("{:016x}", hasher.finish());

        let cache_root = portable_staging_dir();
        let entry_dir = cache_root.join(&hash_hex);
        let staged_path = entry_dir.join(&info.name);
        if let Ok(meta) = fs::metadata(&staged_path) {
            if meta.is_file() && (info.size == 0 || meta.len() == info.size) {
                return Ok(staged_path);
            }
        }

        fs::create_dir_all(&entry_dir)
            .map_err(|error| format!("Could not create staging directory: {error}"))?;
        let tmp_path = entry_dir.join(format!("{}.tmp", info.name));
        let mut file = fs::File::create(&tmp_path)
            .map_err(|error| format!("Could not create staging file: {error}"))?;
        let res = stream_object_to_writer(
            &resources,
            &object_id,
            &WPD_RESOURCE_DEFAULT,
            &mut file,
            max_bytes,
            None,
        );
        drop(file);
        if let Err(error) = res {
            let _ = fs::remove_file(&tmp_path);
            return Err(error);
        }
        if staged_path.exists() {
            let _ = fs::remove_file(&staged_path);
        }
        fs::rename(&tmp_path, &staged_path).map_err(|error| {
            let _ = fs::remove_file(&tmp_path);
            format!("Could not finalize staged file: {error}")
        })?;
        prune_portable_staging_cache(&cache_root);
        Ok(staged_path)
    }

    fn encode_dynamic_thumbnail(dynamic: image::DynamicImage, size: u32) -> Option<String> {
        let resized = if dynamic.width() > size || dynamic.height() > size {
            dynamic.thumbnail(size, size)
        } else {
            dynamic
        };
        let has_alpha = resized.color().has_alpha();
        let mut encoded = Cursor::new(Vec::new());
        if has_alpha {
            resized.write_to(&mut encoded, image::ImageFormat::Png).ok()?;
            Some(format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(encoded.into_inner())
            ))
        } else {
            resized
                .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut encoded, 85,
                ))
                .ok()?;
            Some(format!(
                "data:image/jpeg;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(encoded.into_inner())
            ))
        }
    }

    pub fn get_portable_thumbnail(path: &str, size: u32) -> Option<String> {
        let _apartment = ShellApartment::initialize_background()?;
        let (device_key, rel_segments) = parse_portable_path(path)?;
        if rel_segments.len() < 2 {
            return None;
        }
        let device = resolve_registered_device(&device_key).ok()?;
        let size = size.clamp(32, 512);
        let cache_key = format!(
            "{size}:{}:{}",
            device.pnp_device_id.to_ascii_lowercase(),
            path.to_ascii_lowercase()
        );
        let cache = PORTABLE_THUMBNAIL_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some(cached) = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&cache_key)
            .cloned()
        {
            return Some(cached);
        }

        let lock = device_lock(&device.pnp_device_id);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let opened = open_wpd_device(&device.pnp_device_id, GENERIC_READ.0).ok()?;
        let content = unsafe { opened.0.Content() }.ok()?;
        let properties = unsafe { content.Properties() }.ok()?;
        let resources = unsafe { content.Transfer() }.ok()?;
        let keys = build_object_property_keys(false).ok()?;
        let (object_id, _, _) = resolve_object_id_locked(&content, &device, &rel_segments).ok()?;
        let info = read_object_info(&properties, &keys, &object_id, false)?;
        if info.is_folder {
            return None;
        }

        let mut raw_bytes = Vec::new();
        let got_thumb = stream_object_to_writer(
            &resources,
            &object_id,
            &WPD_RESOURCE_THUMBNAIL,
            &mut raw_bytes,
            Some(PORTABLE_THUMBNAIL_FALLBACK_MAX_BYTES),
            None,
        )
        .is_ok()
            && !raw_bytes.is_empty();

        if !got_thumb {
            raw_bytes.clear();
            let ext = Path::new(&info.name)
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase())
                .unwrap_or_default();
            let is_raster = matches!(
                ext.as_str(),
                "jpg" | "jpeg" | "jpe" | "jfif" | "png" | "gif" | "webp" | "bmp"
            );
            if !is_raster || info.size == 0 || info.size > PORTABLE_THUMBNAIL_FALLBACK_MAX_BYTES {
                return None;
            }
            stream_object_to_writer(
                &resources,
                &object_id,
                &WPD_RESOURCE_DEFAULT,
                &mut raw_bytes,
                Some(PORTABLE_THUMBNAIL_FALLBACK_MAX_BYTES),
                None,
            )
            .ok()?;
        }

        let decoded = image::ImageReader::new(Cursor::new(&raw_bytes))
            .with_guessed_format()
            .ok()?
            .decode()
            .ok()?;
        let data_url = encode_dynamic_thumbnail(decoded, size)?;

        let mut cache = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if cache.len() >= MAX_CACHED_PORTABLE_THUMBNAILS && !cache.contains_key(&cache_key) {
            if let Some(oldest) = cache.keys().next().cloned() {
                cache.remove(&oldest);
            }
        }
        cache.insert(cache_key, data_url.clone());
        Some(data_url)
    }

    fn resolve_portable_shell_pidl(path: &str) -> Result<(String, OwnedPidl), String> {
        let (device_key, rel_segments) =
            parse_portable_path(path).ok_or_else(|| "Invalid portable device path.".to_string())?;
        let device = resolve_registered_device(&device_key)?;
        let wide_parsing: Vec<u16> = device
            .shell_parsing_name
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut root_pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        unsafe {
            SHParseDisplayName(
                PCWSTR(wide_parsing.as_ptr()),
                None::<&IBindCtx>,
                &mut root_pidl,
                0,
                None,
            )
            .map_err(|error| format!("Could not resolve Shell device item: {error}"))?;
        }
        let owned_root = OwnedPidl(root_pidl);
        if rel_segments.is_empty() {
            return Ok((device.shell_parsing_name, owned_root));
        }

        let mut current_item: IShellItem = unsafe {
            windows::Win32::UI::Shell::SHCreateItemFromIDList(owned_root.0)
                .map_err(|error| format!("Could not bind Shell device item: {error}"))?
        };
        for seg in &rel_segments {
            let enum_items: IEnumShellItems = unsafe {
                current_item.BindToHandler(None::<&IBindCtx>, &BHID_EnumItems)
            }
            .map_err(|error| format!("Could not browse portable folder in Shell: {error}"))?;
            let mut matched: Option<IShellItem> = None;
            loop {
                let mut batch: [Option<IShellItem>; 1] = [None];
                let mut fetched = 0u32;
                if unsafe { enum_items.Next(&mut batch, Some(&mut fetched)) }.is_err()
                    || fetched == 0
                {
                    break;
                }
                let Some(child) = batch[0].take() else {
                    continue;
                };
                let name = unsafe { child.GetDisplayName(SIGDN_NORMALDISPLAY) }
                    .map(take_co_task_pwstr)
                    .unwrap_or_default();
                if sanitize_portable_segment(&name).eq_ignore_ascii_case(seg)
                    || name.eq_ignore_ascii_case(seg)
                {
                    matched = Some(child);
                    break;
                }
            }
            current_item = matched.ok_or_else(|| {
                format!("Could not locate \"{seg}\" in the Windows Shell namespace.")
            })?;
        }

        let pidl = unsafe { SHGetIDListFromObject(&current_item) }
            .map_err(|error| format!("Could not obtain Shell item ID list: {error}"))?;
        Ok((device.shell_parsing_name, OwnedPidl(pidl)))
    }

    pub fn open_portable_in_windows_explorer(path: &str) -> Result<(), String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows Shell apartment.".to_string());
        };
        let (parsing_name, pidl) = resolve_portable_shell_pidl(path)?;
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_IDLIST | SEE_MASK_CLASSNAME,
            lpVerb: w!("open"),
            lpIDList: pidl.0.cast(),
            lpClass: w!("Folder"),
            nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };
        if unsafe { ShellExecuteExW(&mut info) }.is_ok() {
            return Ok(());
        }
        std::process::Command::new("explorer.exe")
            .arg(&parsing_name)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not open Windows File Explorer: {error}"))
    }

    pub fn show_portable_properties(path: &str) -> Result<(), String> {
        let Some(_apartment) = ShellApartment::initialize() else {
            return Err("Could not initialize Windows Shell apartment.".to_string());
        };
        let (_parsing_name, pidl) = resolve_portable_shell_pidl(path)?;
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_IDLIST | SEE_MASK_INVOKEIDLIST,
            lpVerb: w!("properties"),
            lpIDList: pidl.0.cast(),
            nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };
        unsafe { ShellExecuteExW(&mut info) }
            .map_err(|error| format!("Windows could not open Properties for this device item: {error}"))
    }
}

#[cfg(not(target_os = "windows"))]
mod non_windows_impl {
    use super::*;
    use std::path::{Path, PathBuf};

    pub fn list_portable_devices() -> Vec<PortableDeviceSummary> {
        Vec::new()
    }
    pub fn portable_devices_signature() -> Vec<String> {
        Vec::new()
    }
    pub fn list_portable_directory(
        _path: &str,
    ) -> Result<(String, String, Vec<PortableEntry>), String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn unique_portable_child_name(_parent_path: &str, desired: &str) -> Result<String, String> {
        Ok(desired.to_string())
    }
    pub fn child_exists_on_portable(_parent_path: &str, _name: &str) -> Result<bool, String> {
        Ok(false)
    }
    pub fn create_portable_directory(
        _parent_path: &str,
        _name: &str,
    ) -> Result<(String, String), String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn create_portable_file_from_bytes(
        _parent_path: &str,
        _name: &str,
        _bytes: &[u8],
    ) -> Result<(String, String, u64), String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn rename_portable_item(_path: &str, _new_name: &str) -> Result<String, String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn delete_portable_item(_path: &str) -> Result<(), String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn inspect_portable_tree(
        _path: &str,
        _check_control: &mut dyn FnMut(&str, u64) -> Result<(), String>,
    ) -> Result<PortableTreeSummary, String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn download_portable_to_local(
        _src_portable: &str,
        _dst_local: &Path,
        _check_control: &mut dyn FnMut(&str, u64, u64, bool) -> Result<(), String>,
    ) -> Result<(), String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn upload_local_to_portable(
        _src_local: &Path,
        _dst_portable_parent: &str,
        _dst_name: &str,
        _check_control: &mut dyn FnMut(&str, u64, u64, bool) -> Result<(), String>,
    ) -> Result<String, String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn move_portable_same_device(
        _src_portable: &str,
        _dst_portable_parent: &str,
    ) -> Result<Option<String>, String> {
        Ok(None)
    }
    pub fn read_portable_file_bytes(_path: &str, _max_bytes: u64) -> Result<Vec<u8>, String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn stage_portable_file_to_temp(
        _path: &str,
        _max_bytes: Option<u64>,
    ) -> Result<PathBuf, String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn get_portable_thumbnail(_path: &str, _size: u32) -> Option<String> {
        None
    }
    pub fn open_portable_in_windows_explorer(_path: &str) -> Result<(), String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
    pub fn show_portable_properties(_path: &str) -> Result<(), String> {
        Err("Portable devices are supported only on Windows.".to_string())
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::*;

#[cfg(not(target_os = "windows"))]
pub use non_windows_impl::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_portable_paths() {
        assert!(is_portable_path(r"mtp:\Carlos P30"));
        assert!(is_portable_path(r"MTP:/Carlos P30/Almacenamiento interno/DCIM/"));
        assert_eq!(
            parse_portable_path(r"mtp:\Carlos P30"),
            Some(("Carlos P30".to_string(), vec![]))
        );
        assert_eq!(
            parse_portable_path(r"mtp:\Carlos P30\Almacenamiento interno\DCIM"),
            Some((
                "Carlos P30".to_string(),
                vec!["Almacenamiento interno".to_string(), "DCIM".to_string()]
            ))
        );
        assert!(is_portable_device_root(r"mtp:\Carlos P30"));
        assert!(!is_portable_device_root(r"mtp:\Carlos P30\Almacenamiento interno"));
        assert!(is_portable_storage_root(r"mtp:\Carlos P30\Almacenamiento interno"));
        assert!(!is_portable_storage_root(r"mtp:\Carlos P30\Almacenamiento interno\DCIM"));
    }

    #[test]
    fn rejects_invalid_or_non_portable_paths() {
        assert!(!is_portable_path(r"C:\Users\Carlos"));
        assert!(!is_portable_path(r"\\NAS01\Media"));
        assert!(!is_portable_path("::cyberfiles-this-pc::"));
        assert!(!is_portable_path(r"mtp:\"));
        assert!(!is_portable_path(r"mtp:\Carlos P30\..\Other"));
        assert!(!is_portable_path(r"mtp:\.\Storage"));
    }

    #[test]
    fn builds_and_sanitizes_portable_segments() {
        assert_eq!(
            build_portable_path("Carlos P30", &["Internal".to_string(), "DCIM".to_string()]),
            r"mtp:\Carlos P30\Internal\DCIM"
        );
        assert_eq!(sanitize_portable_segment("  Photo: 01/02*?.jpg. "), "Photo_ 01_02__.jpg");
        assert_eq!(sanitize_portable_segment(".."), "Device");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn enumerates_live_portable_devices_without_duplicating_drive_letters() {
        let devices = list_portable_devices();
        eprintln!("Detected portable devices: {devices:?}");
        let sig = portable_devices_signature();
        for id in &sig {
            assert!(!id.starts_with(r"\\?\wpdbusenum#"));
        }
        for dev in &devices {
            assert!(dev.root_path.starts_with(PORTABLE_PATH_PREFIX));
            assert!(!dev.label.is_empty());
            assert!(list_portable_directory(&dev.root_path).is_ok());
        }
    }
}
