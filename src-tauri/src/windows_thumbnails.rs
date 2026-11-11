//! Windows shell thumbnails: the same previews Explorer shows, pulled through the Shell's own
//! thumbnail pipeline instead of a bundled decoder. One `IShellItemImageFactory::GetImage` call
//! covers video frames, PDF and Office first pages, camera RAW, and the photo-stack previews
//! Explorer draws for folders that contain images, and the Shell serves repeat lookups from its
//! on-disk thumbnail cache. The flag `SIIGBF_THUMBNAILONLY` keeps icons out of the pipeline:
//! when no provider exists the call simply fails and the frontend falls back to file icons.

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::{
        collections::HashMap,
        io::Cursor,
        os::windows::ffi::OsStrExt,
        path::Path,
        sync::{Mutex, OnceLock},
    };

    use base64::Engine;
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::SIZE,
            System::Com::IBindCtx,
            UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_THUMBNAILONLY},
        },
    };

    use crate::windows_file_icons::{read_bitmap_bgra, OwnedBitmap};

    const MAX_CACHED_THUMBNAILS: usize = 512;
    static SHELL_THUMBNAIL_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

    /// Encodes RGBA pixels as a data URL: JPEG for fully opaque pixels (photos, video frames,
    /// most previews; roughly a quarter of the PNG payload), PNG when transparency survives.
    /// Oversized Shell bitmaps (a provider may hand back a larger cached image) are downscaled
    /// to the requested square, never upscaled.
    fn encode_bgra_data_url(width: u32, height: u32, bgra: Vec<u8>, size: u32) -> Option<String> {
        let mut rgba = Vec::with_capacity(bgra.len());
        for pixel in bgra.chunks_exact(4) {
            rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
        let image = image::RgbaImage::from_raw(width, height, rgba)?;
        let mut dynamic = image::DynamicImage::ImageRgba8(image);
        if width > size || height > size {
            dynamic = dynamic.thumbnail(size, size);
        }
        let has_alpha = bgra.chunks_exact(4).any(|pixel| pixel[3] != 255);
        let mut encoded = Cursor::new(Vec::new());
        if has_alpha {
            dynamic.write_to(&mut encoded, image::ImageFormat::Png).ok()?;
        } else {
            dynamic
                .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut encoded, 85,
                ))
                .ok()?;
        }
        let mime = if has_alpha { "image/png" } else { "image/jpeg" };
        Some(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(encoded.into_inner())
        ))
    }

    fn load_shell_thumbnail(path: &Path, size: u32) -> Option<String> {
        let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let factory: IShellItemImageFactory = unsafe {
            SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None::<&IBindCtx>).ok()?
        };
        // SIIGBF_THUMBNAILONLY keeps icons out of the pipeline; without SIIGBF_BIGGERSIZEOK the
        // Shell resizes its answer to the requested square, which keeps provider quirks from
        // handing back bitmap sizes the caller did not plan for.
        let bitmap = OwnedBitmap::from_handle(unsafe {
            factory
                .GetImage(SIZE { cx: size as i32, cy: size as i32 }, SIIGBF_THUMBNAILONLY)
                .ok()?
        });
        let (width, height, bgra) = read_bitmap_bgra(bitmap.handle())?;
        encode_bgra_data_url(width, height, bgra, size)
    }

    /// Returns the Shell thumbnail for `path` rendered to fit a `size`-pixel square, as a data
    /// URL. `None` when the Shell has no thumbnail provider (the caller falls back to icons).
    pub fn get_shell_thumbnail(path: &str, size: u32) -> Option<String> {
        let file_path = Path::new(path);
        if !file_path.is_absolute() {
            return None;
        }

        let modified = std::fs::metadata(file_path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let cache_key = format!("{size}:{}:{modified}", file_path.to_string_lossy().to_lowercase());

        let cache = SHELL_THUMBNAIL_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some(thumbnail) = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(&cache_key)
            .cloned()
        {
            return Some(thumbnail);
        }

        let thumbnail = load_shell_thumbnail(file_path, size)?;
        let mut cache = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if cache.len() >= MAX_CACHED_THUMBNAILS && !cache.contains_key(&cache_key) {
            if let Some(oldest_key) = cache.keys().next().cloned() {
                cache.remove(&oldest_key);
            }
        }
        cache.insert(cache_key, thumbnail.clone());
        Some(thumbnail)
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::get_shell_thumbnail;

#[cfg(not(target_os = "windows"))]
pub fn get_shell_thumbnail(_path: &str, _size: u32) -> Option<String> {
    None
}
