use serde::Serialize;
use std::path::PathBuf;

use crate::windows_portable_devices;

const MAX_PORTABLE_OUTBOUND_STAGE_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OutboundFileDragResult {
    pub outcome: String,
    pub effect: String,
    pub source_paths: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OutboundDragSource {
    LocalPath(PathBuf),
    PortableShellPath(String),
}

#[derive(Clone, Debug)]
pub struct PreparedOutboundDrag {
    pub source_paths: Vec<String>,
    pub items: Vec<OutboundDragSource>,
    pub allow_move: bool,
}

pub fn normalize_outbound_candidate_path(raw: &str) -> Option<String> {
    let mut cleaned = raw.trim().replace('/', "\\");
    if cleaned.is_empty() {
        return None;
    }
    if cleaned.len() >= 8 && cleaned[..8].eq_ignore_ascii_case("\\\\?\\UNC\\") {
        cleaned = format!("\\\\{}", &cleaned[8..]);
    } else if let Some(rest) = cleaned.strip_prefix("\\\\?\\") {
        cleaned = rest.to_string();
    }
    if cleaned.starts_with("::") || cleaned == "\\\\" {
        return None;
    }
    if windows_portable_devices::is_portable_path(&cleaned) {
        let (device_key, rel_segments) = windows_portable_devices::parse_portable_path(&cleaned)?;
        if rel_segments.len() < 2 {
            return None;
        }
        return Some(windows_portable_devices::build_portable_path(
            &device_key,
            &rel_segments,
        ));
    }
    if cleaned.starts_with("\\\\") {
        let trimmed = cleaned.trim_end_matches('\\');
        let parts: Vec<&str> = trimmed[2..].split('\\').filter(|s| !s.is_empty()).collect();
        if parts.len() < 2 {
            return None;
        }
        return Some(format!("\\\\{}", parts.join("\\")));
    }
    let bytes = cleaned.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        let rest = cleaned[2..].trim_end_matches('\\');
        if rest.is_empty() {
            return None;
        }
        return Some(format!("{}{}", &cleaned[..2], rest));
    }
    Some(cleaned.trim_end_matches('\\').to_string())
}

fn same_or_descendant_key(candidate: &str, root: &str) -> bool {
    let cand = candidate.trim_end_matches('\\').to_ascii_lowercase();
    let root = root.trim_end_matches('\\').to_ascii_lowercase();
    cand == root || cand.starts_with(&format!("{root}\\"))
}

pub fn prepare_outbound_drag_items(paths: Vec<String>) -> Result<PreparedOutboundDrag, String> {
    let mut normalized: Vec<String> = Vec::new();
    for raw in paths {
        let Some(clean) = normalize_outbound_candidate_path(&raw) else {
            continue;
        };
        if !normalized
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&clean))
        {
            normalized.push(clean);
        }
    }

    let roots: Vec<String> = normalized
        .iter()
        .enumerate()
        .filter(|(idx, candidate)| {
            !normalized
                .iter()
                .enumerate()
                .any(|(other_idx, other)| *idx != other_idx && same_or_descendant_key(candidate, other))
        })
        .map(|(_, path)| path.clone())
        .collect();

    if roots.is_empty() {
        return Err("Select at least one file or folder that can be dragged out.".to_string());
    }

    let mut source_paths = Vec::with_capacity(roots.len());
    let mut items = Vec::with_capacity(roots.len());
    let mut allow_move = true;
    let mut staged_portable_bytes = 0u64;

    for path in roots {
        if windows_portable_devices::is_portable_path(&path) {
            if windows_portable_devices::is_portable_device_root(&path)
                || windows_portable_devices::is_portable_storage_root(&path)
            {
                return Err("Portable device and storage roots cannot be dragged out.".to_string());
            }
            allow_move = false;
            let (is_folder, size) = windows_portable_devices::inspect_portable_item_metadata(&path)?;
            if !is_folder
                && staged_portable_bytes.saturating_add(size) <= MAX_PORTABLE_OUTBOUND_STAGE_BYTES
            {
                match windows_portable_devices::stage_portable_file_to_temp(
                    &path,
                    Some(MAX_PORTABLE_OUTBOUND_STAGE_BYTES),
                ) {
                    Ok(staged_path) => {
                        staged_portable_bytes = staged_portable_bytes.saturating_add(size);
                        source_paths.push(path);
                        items.push(OutboundDragSource::LocalPath(staged_path));
                    }
                    Err(_) => {
                        source_paths.push(path.clone());
                        items.push(OutboundDragSource::PortableShellPath(path));
                    }
                }
            } else {
                source_paths.push(path.clone());
                items.push(OutboundDragSource::PortableShellPath(path));
            }
            continue;
        }

        let local_path = PathBuf::from(&path);
        std::fs::symlink_metadata(&local_path)
            .map_err(|error| format!("Cannot access {}: {error}", local_path.display()))?;
        source_paths.push(path);
        items.push(OutboundDragSource::LocalPath(local_path));
    }

    Ok(PreparedOutboundDrag {
        source_paths,
        items,
        allow_move,
    })
}

pub fn allowed_drop_effect_bits(allow_move: bool) -> u32 {
    // DROPEFFECT_COPY = 1, DROPEFFECT_MOVE = 2, DROPEFFECT_LINK = 4
    if allow_move {
        1 | 2 | 4
    } else {
        1
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows::{
        core::{implement, BOOL, HRESULT, PCWSTR},
        Win32::{
            Foundation::{DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, POINT, S_OK},
            System::{
                Com::{CoCreateInstance, IBindCtx, IDataObject, CLSCTX_INPROC_SERVER},
                Ole::{
                    DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, OleUninitialize,
                    DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_MOVE, DROPEFFECT_NONE,
                },
                SystemServices::{MK_LBUTTON, MK_RBUTTON, MODIFIERKEYS_FLAGS},
            },
            UI::{
                Input::KeyboardAndMouse::{GetAsyncKeyState, ReleaseCapture, VK_LBUTTON, VK_RBUTTON},
                Shell::{
                    BHID_DataObject, CLSID_DragDropHelper, Common::ITEMIDLIST, IDragSourceHelper,
                    IDragSourceHelper2, ILFree, SHCreateShellItemArrayFromIDLists,
                    SHParseDisplayName,
                },
                WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON},
            },
        },
    };
    use windows_core::Interface;

    static OUTBOUND_DRAG_ACTIVE: AtomicBool = AtomicBool::new(false);

    struct ActiveDragGuard;

    impl Drop for ActiveDragGuard {
        fn drop(&mut self) {
            OUTBOUND_DRAG_ACTIVE.store(false, Ordering::Release);
        }
    }

    struct OleApartmentGuard;

    impl OleApartmentGuard {
        fn initialize() -> Result<Self, String> {
            unsafe { OleInitialize(None) }
                .map(|()| Self)
                .map_err(|error| format!("Could not initialize Windows OLE drag-and-drop: {error}"))
        }
    }

    impl Drop for OleApartmentGuard {
        fn drop(&mut self) {
            unsafe { OleUninitialize() };
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

    #[implement(IDropSource)]
    struct CyberFilesDropSource;

    impl IDropSource_Impl for CyberFilesDropSource_Impl {
        fn QueryContinueDrag(
            &self,
            fescapepressed: BOOL,
            grfkeystate: MODIFIERKEYS_FLAGS,
        ) -> HRESULT {
            if fescapepressed.as_bool() {
                DRAGDROP_S_CANCEL
            } else if (grfkeystate.0 & (MK_LBUTTON.0 | MK_RBUTTON.0)) == 0 {
                DRAGDROP_S_DROP
            } else {
                S_OK
            }
        }

        fn GiveFeedback(&self, _dweffect: DROPEFFECT) -> HRESULT {
            DRAGDROP_S_USEDEFAULTCURSORS
        }
    }

    pub(crate) fn build_shell_data_object(
        items: &[OutboundDragSource],
    ) -> Result<IDataObject, String> {
        let mut owned_pidls = Vec::with_capacity(items.len());
        for item in items {
            let pidl_ptr = match item {
                OutboundDragSource::LocalPath(path) => {
                    let wide: Vec<u16> = path
                        .as_os_str()
                        .to_string_lossy()
                        .encode_utf16()
                        .chain(Some(0))
                        .collect();
                    let mut raw_pidl: *mut ITEMIDLIST = std::ptr::null_mut();
                    unsafe {
                        SHParseDisplayName(
                            PCWSTR(wide.as_ptr()),
                            None::<&IBindCtx>,
                            &mut raw_pidl,
                            0,
                            None,
                        )
                    }
                    .map_err(|error| {
                        format!(
                            "Windows could not prepare {} for drag-and-drop: {error}",
                            path.display()
                        )
                    })?;
                    raw_pidl
                }
                OutboundDragSource::PortableShellPath(portable_path) => {
                    windows_portable_devices::resolve_portable_shell_pidl_raw(portable_path)?
                }
            };
            if pidl_ptr.is_null() {
                return Err("Windows returned an empty Shell identifier for drag-and-drop.".to_string());
            }
            owned_pidls.push(OwnedPidl(pidl_ptr));
        }

        let raw_pidls: Vec<*const ITEMIDLIST> = owned_pidls
            .iter()
            .map(|pidl| pidl.0.cast_const())
            .collect();
        let shell_array = unsafe { SHCreateShellItemArrayFromIDLists(&raw_pidls) }
            .map_err(|error| format!("Windows could not bundle the dragged items: {error}"))?;
        unsafe { shell_array.BindToHandler::<_, IDataObject>(None::<&IBindCtx>, &BHID_DataObject) }
            .map_err(|error| format!("Windows could not create the drag data object: {error}"))
    }

    fn is_primary_mouse_button_down() -> bool {
        unsafe {
            let primary_vk = if GetSystemMetrics(SM_SWAPBUTTON) != 0 {
                VK_RBUTTON
            } else {
                VK_LBUTTON
            };
            GetAsyncKeyState(i32::from(primary_vk.0)) < 0
        }
    }

    pub fn run_outbound_drag_on_ui_thread(
        prepared: PreparedOutboundDrag,
    ) -> Result<OutboundFileDragResult, String> {
        if OUTBOUND_DRAG_ACTIVE
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Ok(OutboundFileDragResult {
                outcome: "cancelled".to_string(),
                effect: "none".to_string(),
                source_paths: prepared.source_paths,
            });
        }
        let _drag_guard = ActiveDragGuard;
        let _ole = OleApartmentGuard::initialize()?;

        if !is_primary_mouse_button_down() {
            return Ok(OutboundFileDragResult {
                outcome: "cancelled".to_string(),
                effect: "none".to_string(),
                source_paths: prepared.source_paths,
            });
        }

        let _ = unsafe { ReleaseCapture() };

        let data_object = build_shell_data_object(&prepared.items)?;
        if let Ok(helper) = unsafe {
            CoCreateInstance::<_, IDragSourceHelper>(
                &CLSID_DragDropHelper,
                None,
                CLSCTX_INPROC_SERVER,
            )
        } {
            if let Ok(helper2) = helper.cast::<IDragSourceHelper2>() {
                // DSH_ALLOWDROPDESCRIPTIONTEXT (1) enables Explorer-style drop badges.
                let _ = unsafe { helper2.SetFlags(1) };
            }
            let origin = POINT { x: 0, y: 0 };
            let _ = unsafe { helper.InitializeFromWindow(None, Some(&origin), &data_object) };
        }

        let drop_source: IDropSource = CyberFilesDropSource.into();
        let allowed_effects = DROPEFFECT(allowed_drop_effect_bits(prepared.allow_move));
        let mut final_effect = DROPEFFECT_NONE;
        let hr = unsafe { DoDragDrop(&data_object, &drop_source, allowed_effects, &mut final_effect) };

        if hr == DRAGDROP_S_DROP {
            let effect = if (final_effect.0 & DROPEFFECT_MOVE.0) != 0 {
                "move"
            } else if (final_effect.0 & DROPEFFECT_COPY.0) != 0 {
                "copy"
            } else if (final_effect.0 & DROPEFFECT_LINK.0) != 0 {
                "link"
            } else {
                "none"
            };
            return Ok(OutboundFileDragResult {
                outcome: "dropped".to_string(),
                effect: effect.to_string(),
                source_paths: prepared.source_paths,
            });
        }

        if hr == DRAGDROP_S_CANCEL || hr.0 == 0 {
            return Ok(OutboundFileDragResult {
                outcome: "cancelled".to_string(),
                effect: "none".to_string(),
                source_paths: prepared.source_paths,
            });
        }

        Err(format!(
            "Windows drag-and-drop failed (HRESULT 0x{:08X}).",
            hr.0 as u32
        ))
    }
}

#[cfg(not(target_os = "windows"))]
mod non_windows_impl {
    use super::*;

    pub fn run_outbound_drag_on_ui_thread(
        _prepared: PreparedOutboundDrag,
    ) -> Result<OutboundFileDragResult, String> {
        Err("System drag-and-drop is supported only on Windows.".to_string())
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::run_outbound_drag_on_ui_thread;

#[cfg(not(target_os = "windows"))]
pub use non_windows_impl::run_outbound_drag_on_ui_thread;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct TempDirGuard(PathBuf);
    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn prepares_and_prunes_local_outbound_paths() {
        let temp_root = TempDirGuard(
            std::env::temp_dir().join(format!("cyberfiles-outbound-drag-{}", std::process::id())),
        );
        let sub_dir = temp_root.0.join("SubFolder");
        fs::create_dir_all(&sub_dir).expect("create test subfolder");
        let root_file = temp_root.0.join("top.txt");
        let nested_file = sub_dir.join("nested.txt");
        fs::write(&root_file, b"hello").expect("write top file");
        fs::write(&nested_file, b"nested").expect("write nested file");

        let prepared = prepare_outbound_drag_items(vec![
            nested_file.to_string_lossy().into_owned(),
            format!(r"\\?\{}", sub_dir.to_string_lossy()),
            root_file.to_string_lossy().into_owned(),
            root_file.to_string_lossy().into_owned().to_uppercase(),
            "::cyberfiles-this-pc::".to_string(),
            r"\\ServerOnly".to_string(),
            r"mtp:\Carlos P30".to_string(),
            r"mtp:\Carlos P30\Internal storage".to_string(),
        ])
        .expect("prepare local outbound drag paths");

        assert!(prepared.allow_move);
        assert_eq!(prepared.items.len(), 2);
        assert!(prepared
            .items
            .contains(&OutboundDragSource::LocalPath(sub_dir.clone())));
        assert!(prepared
            .items
            .contains(&OutboundDragSource::LocalPath(root_file.clone())));
        assert!(prepare_outbound_drag_items(vec![r"mtp:\Carlos P30".to_string()]).is_err());
        assert!(
            prepare_outbound_drag_items(vec![temp_root.0.join("does-not-exist.txt")
                .to_string_lossy()
                .into_owned()])
            .is_err()
        );
    }

    #[test]
    fn computes_allowed_drop_effects_for_local_vs_portable() {
        assert_eq!(allowed_drop_effect_bits(true), 1 | 2 | 4);
        assert_eq!(allowed_drop_effect_bits(false), 1);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn builds_shell_data_object_with_cf_hdrop_for_temp_file() {
        use windows::Win32::System::{
            Com::{DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL},
            Ole::{OleInitialize, OleUninitialize, CF_HDROP},
        };

        struct OleGuard;
        impl Drop for OleGuard {
            fn drop(&mut self) {
                unsafe { OleUninitialize() };
            }
        }
        unsafe { OleInitialize(None) }.expect("OleInitialize");
        let _ole = OleGuard;

        let temp_root = TempDirGuard(
            std::env::temp_dir().join(format!("cyberfiles-hdrop-test-{}", std::process::id())),
        );
        let sub_dir = temp_root.0.join("Nested");
        fs::create_dir_all(&sub_dir).expect("create nested dir");
        let file_a = temp_root.0.join("alpha.txt");
        let file_b = sub_dir.join("beta.txt");
        fs::write(&file_a, b"alpha").expect("write alpha");
        fs::write(&file_b, b"beta").expect("write beta");

        let prepared = prepare_outbound_drag_items(vec![
            file_a.to_string_lossy().into_owned(),
            file_b.to_string_lossy().into_owned(),
        ])
        .expect("prepare multi-folder items");
        let data_object =
            windows_impl::build_shell_data_object(&prepared.items).expect("build Shell IDataObject");

        let cf_hdrop_format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        unsafe { data_object.QueryGetData(&cf_hdrop_format) }
            .ok()
            .expect("Shell IDataObject should offer CF_HDROP");
    }
}
