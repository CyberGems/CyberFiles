use serde::Deserialize;

/// The system icon sizes CyberFiles requests. Small and Large go through SHGetFileInfoW
/// (16px and 32px); Jumbo pulls the 256px icon from the system image list, the same source
/// Explorer's extra-large view uses, so scaled-up icons stay crisp instead of blurry.
#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ShellIconSize {
    Small,
    Large,
    Jumbo,
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::ShellIconSize;
    use std::{
        collections::HashMap,
        io::Cursor,
        mem::size_of,
        os::windows::ffi::OsStrExt,
        path::Path,
        sync::{Mutex, OnceLock},
    };

    use base64::Engine;
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::RPC_E_CHANGED_MODE,
            Graphics::Gdi::{
                DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
                BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
            },
            Storage::FileSystem::FILE_ATTRIBUTE_NORMAL,
            System::Com::{CoInitializeEx, CoUninitialize, COINIT, COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED},
            UI::{
                Controls::{IImageList, ILD_TRANSPARENT},
                Shell::{
                    SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_FLAGS, SHGFI_ICON,
                    SHGFI_SMALLICON, SHGFI_SYSICONINDEX, SHGFI_USEFILEATTRIBUTES, SHIL_JUMBO,
                },
                WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
            },
        },
    };

    const MAX_CACHED_ICONS: usize = 1024;
    static FILE_ICON_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

    pub struct ShellApartment {
        initialized_here: bool,
    }

    impl ShellApartment {
        /// Initializes COM for the calling worker thread. `CoInitializeEx` answers
        /// RPC_E_CHANGED_MODE when a pooled thread already runs the other apartment type; COM
        /// is still usable there, so the guard is kept without owning a reference count.
        pub fn initialize_with(coinit: COINIT) -> Option<Self> {
            let result = unsafe { CoInitializeEx(None, coinit) };
            if result.is_ok() {
                Some(Self { initialized_here: true })
            } else if result == RPC_E_CHANGED_MODE {
                Some(Self { initialized_here: false })
            } else {
                None
            }
        }

        pub fn initialize() -> Option<Self> {
            Self::initialize_with(COINIT_APARTMENTTHREADED)
        }

        /// Background-thumbnail workers run on the multi-threaded COM apartment, matching how
        /// Windows itself extracts thumbnails outside the UI thread.
        pub fn initialize_background() -> Option<Self> {
            Self::initialize_with(COINIT_MULTITHREADED)
        }
    }

    impl Drop for ShellApartment {
        fn drop(&mut self) {
            if self.initialized_here {
                unsafe { CoUninitialize() };
            }
        }
    }

    struct OwnedIcon(HICON);

    impl Drop for OwnedIcon {
        fn drop(&mut self) {
            let _ = unsafe { DestroyIcon(self.0) };
        }
    }

    pub(crate) struct OwnedBitmap(windows::Win32::Graphics::Gdi::HBITMAP);

    impl OwnedBitmap {
        pub(crate) fn from_handle(value: windows::Win32::Graphics::Gdi::HBITMAP) -> Self {
            Self(value)
        }

        pub(crate) fn handle(&self) -> windows::Win32::Graphics::Gdi::HBITMAP {
            self.0
        }
    }

    impl Drop for OwnedBitmap {
        fn drop(&mut self) {
            if !self.0 .0.is_null() {
                let _ = unsafe { DeleteObject(HGDIOBJ(self.0 .0)) };
            }
        }
    }

    /// Reads a 32-bit top-down DIB out of an HBITMAP. Shared with the shell thumbnail
    /// extractor, which receives its bitmaps through the same GDI path.
    pub(crate) fn read_bitmap_bgra(
        handle: windows::Win32::Graphics::Gdi::HBITMAP,
    ) -> Option<(u32, u32, Vec<u8>)> {
        if handle.0.is_null() {
            return None;
        }
        let mut bitmap = BITMAP::default();
        let object_type = unsafe {
            GetObjectW(
                HGDIOBJ(handle.0),
                size_of::<BITMAP>() as i32,
                Some((&mut bitmap as *mut BITMAP).cast()),
            )
        };
        if object_type == 0 || bitmap.bmWidth <= 0 || bitmap.bmHeight == 0 {
            return None;
        }

        let width = bitmap.bmWidth as u32;
        let height = bitmap.bmHeight.unsigned_abs();
        // 2048 covers the largest entries Windows keeps in its thumbnail cache; anything
        // beyond that would not be a shell-provided bitmap worth decoding.
        if width > 2048 || height > 2048 {
            return None;
        }
        let byte_count = width.checked_mul(height)?.checked_mul(4)?;
        let mut pixels = vec![0u8; byte_count as usize];
        let mut bitmap_info = BITMAPINFO::default();
        bitmap_info.bmiHeader = BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: byte_count,
            ..Default::default()
        };

        let device_context = unsafe { GetDC(None) };
        if device_context.0.is_null() {
            return None;
        }
        let lines = unsafe {
            GetDIBits(
                device_context,
                handle,
                0,
                height,
                Some(pixels.as_mut_ptr().cast()),
                &mut bitmap_info,
                DIB_RGB_COLORS,
            )
        };
        unsafe { ReleaseDC(None, device_context) };
        (lines == height as i32).then_some((width, height, pixels))
    }

    fn icon_to_data_url(icon: HICON) -> Option<String> {
        let mut icon_info = ICONINFO::default();
        unsafe { GetIconInfo(icon, &mut icon_info).ok()? };
        let color_bitmap = OwnedBitmap(icon_info.hbmColor);
        let mask_bitmap = OwnedBitmap(icon_info.hbmMask);
        let (width, height, bgra) = read_bitmap_bgra(color_bitmap.0)?;
        let alpha_is_missing = bgra.chunks_exact(4).all(|pixel| pixel[3] == 0);
        let mask = if alpha_is_missing {
            let (mask_width, mask_height, pixels) = read_bitmap_bgra(mask_bitmap.0)?;
            if mask_width != width || mask_height != height {
                return None;
            }
            Some(pixels)
        } else {
            None
        };

        let mut rgba = Vec::with_capacity(bgra.len());
        for (index, pixel) in bgra.chunks_exact(4).enumerate() {
            let alpha =
                mask.as_ref().map_or(
                    pixel[3],
                    |mask| {
                        if mask[index * 4] >= 128 {
                            0
                        } else {
                            255
                        }
                    },
                );
            let channels = if alpha == 0 {
                [0, 0, 0]
            } else if alpha == 255 || alpha_is_missing {
                [pixel[2], pixel[1], pixel[0]]
            } else {
                let unpremultiply = |channel: u8| {
                    ((u16::from(channel) * 255 + u16::from(alpha) / 2) / u16::from(alpha)).min(255)
                        as u8
                };
                [
                    unpremultiply(pixel[2]),
                    unpremultiply(pixel[1]),
                    unpremultiply(pixel[0]),
                ]
            };
            rgba.extend_from_slice(&[channels[0], channels[1], channels[2], alpha]);
        }

        let image = image::RgbaImage::from_raw(width, height, rgba)?;
        let mut png = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut png, image::ImageFormat::Png)
            .ok()?;
        Some(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png.into_inner())
        ))
    }

    fn load_shell_icon(path: &Path, use_file_attributes: bool, size: ShellIconSize) -> Option<String> {
        let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut shell_info = SHFILEINFOW::default();
        let mut flags: SHGFI_FLAGS = SHGFI_ICON;
        if size == ShellIconSize::Small {
            flags |= SHGFI_SMALLICON;
        }
        if use_file_attributes {
            flags |= SHGFI_USEFILEATTRIBUTES;
        }
        let result = unsafe {
            SHGetFileInfoW(
                PCWSTR(wide_path.as_ptr()),
                FILE_ATTRIBUTE_NORMAL,
                Some(&mut shell_info),
                size_of::<SHFILEINFOW>() as u32,
                flags,
            )
        };
        if result == 0 || shell_info.hIcon.0.is_null() {
            return None;
        }
        let icon = OwnedIcon(shell_info.hIcon);
        icon_to_data_url(icon.0)
    }

    /// Pulls the 256px icon from the system image list, the source Explorer uses for its
    /// extra-large view. Returns None when the system has no jumbo variant, in which case the
    /// frontend keeps the 32px icon.
    fn load_jumbo_icon(path: &Path, use_file_attributes: bool) -> Option<String> {
        let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut shell_info = SHFILEINFOW::default();
        let mut flags: SHGFI_FLAGS = SHGFI_SYSICONINDEX;
        if use_file_attributes {
            flags |= SHGFI_USEFILEATTRIBUTES;
        }
        let result = unsafe {
            SHGetFileInfoW(
                PCWSTR(wide_path.as_ptr()),
                FILE_ATTRIBUTE_NORMAL,
                Some(&mut shell_info),
                size_of::<SHFILEINFOW>() as u32,
                flags,
            )
        };
        if result == 0 {
            return None;
        }
        let image_list: IImageList = unsafe { SHGetImageList(SHIL_JUMBO as i32) }.ok()?;
        let icon = unsafe { image_list.GetIcon(shell_info.iIcon, ILD_TRANSPARENT.0) }.ok()?;
        let owned = OwnedIcon(icon);
        icon_to_data_url(owned.0)
    }

    impl ShellIconSize {
        fn key(self) -> &'static str {
            match self {
                ShellIconSize::Small => "small",
                ShellIconSize::Large => "large",
                ShellIconSize::Jumbo => "jumbo",
            }
        }
    }

    pub fn get_associated_file_icon(path: &str, size: ShellIconSize) -> Option<String> {
        let file_path = Path::new(path);
        if !file_path.is_absolute() {
            return None;
        }

        let extension = file_path
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        let path_specific = matches!(
            extension.as_str(),
            "com" | "dll" | "exe" | "ico" | "lnk" | "ocx" | "scr"
        );
        let (cache_key, icon_path, use_file_attributes) = if path_specific {
            let metadata = std::fs::symlink_metadata(file_path).ok()?;
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return None;
            }
            let canonical_path = file_path.canonicalize().ok()?;
            let modified = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|value| value.as_nanos())
                .unwrap_or_default();
            let canonical_text = canonical_path.to_string_lossy().to_lowercase();
            (
                format!("{}:path:{canonical_text}:{modified}", size.key()),
                file_path.to_path_buf(),
                false,
            )
        } else {
            let icon_path = if extension.is_empty() {
                "CyberFilesIcon".to_string()
            } else {
                format!("CyberFilesIcon.{extension}")
            };
            (
                format!("{}:extension:{extension}", size.key()),
                icon_path.into(),
                true,
            )
        };

        let cache = FILE_ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some(icon) = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&cache_key)
            .cloned()
        {
            return Some(icon);
        }

        let icon = match size {
            ShellIconSize::Jumbo => load_jumbo_icon(&icon_path, use_file_attributes)?,
            _ => load_shell_icon(&icon_path, use_file_attributes, size)?,
        };
        let mut cache = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if cache.len() >= MAX_CACHED_ICONS && !cache.contains_key(&cache_key) {
            if let Some(oldest_key) = cache.keys().next().cloned() {
                cache.remove(&oldest_key);
            }
        }
        cache.insert(cache_key, icon.clone());
        Some(icon)
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::{get_associated_file_icon, ShellApartment};
#[cfg(target_os = "windows")]
pub(crate) use windows_impl::{read_bitmap_bgra, OwnedBitmap};

#[cfg(not(target_os = "windows"))]
pub struct ShellApartment;

#[cfg(not(target_os = "windows"))]
impl ShellApartment {
    pub fn initialize() -> Option<Self> {
        Some(Self)
    }

    pub fn initialize_background() -> Option<Self> {
        Some(Self)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_associated_file_icon(path: &str, size: ShellIconSize) -> Option<String> {
    let _ = (path, size);
    None
}
