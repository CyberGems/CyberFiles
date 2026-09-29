#[cfg(target_os = "windows")]
mod windows_impl {
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
            Graphics::Gdi::{
                DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
                BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
            },
            Storage::FileSystem::FILE_ATTRIBUTE_NORMAL,
            System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED},
            UI::{
                Shell::{
                    SHGetFileInfoW, SHFILEINFOW, SHGFI_FLAGS, SHGFI_ICON, SHGFI_SMALLICON,
                    SHGFI_USEFILEATTRIBUTES,
                },
                WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
            },
        },
    };

    const MAX_CACHED_ICONS: usize = 1024;
    static FILE_ICON_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

    pub struct ShellApartment;

    impl ShellApartment {
        pub fn initialize() -> Option<Self> {
            unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
                .is_ok()
                .then_some(Self)
        }
    }

    impl Drop for ShellApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    struct OwnedIcon(HICON);

    impl Drop for OwnedIcon {
        fn drop(&mut self) {
            let _ = unsafe { DestroyIcon(self.0) };
        }
    }

    struct OwnedBitmap(windows::Win32::Graphics::Gdi::HBITMAP);

    impl Drop for OwnedBitmap {
        fn drop(&mut self) {
            if !self.0 .0.is_null() {
                let _ = unsafe { DeleteObject(HGDIOBJ(self.0 .0)) };
            }
        }
    }

    fn read_bitmap_bgra(
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
        if width > 512 || height > 512 {
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

    fn load_shell_icon(path: &Path, use_file_attributes: bool, large: bool) -> Option<String> {
        let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut shell_info = SHFILEINFOW::default();
        let mut flags: SHGFI_FLAGS = SHGFI_ICON;
        if !large {
            flags = flags | SHGFI_SMALLICON;
        }
        if use_file_attributes {
            flags = flags | SHGFI_USEFILEATTRIBUTES;
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

    pub fn get_associated_file_icon(path: &str, large: bool) -> Option<String> {
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
        let size_key = if large { "large" } else { "small" };
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
                format!("{size_key}:path:{canonical_text}:{modified}"),
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
                format!("{size_key}:extension:{extension}"),
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

        let icon = load_shell_icon(&icon_path, use_file_attributes, large)?;
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

#[cfg(not(target_os = "windows"))]
pub struct ShellApartment;

#[cfg(not(target_os = "windows"))]
impl ShellApartment {
    pub fn initialize() -> Option<Self> {
        Some(Self)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_associated_file_icon(path: &str, large: bool) -> Option<String> {
    let _ = (path, large);
    None
}
