//! App icon extraction.
//!
//! macOS keeps an app's icon inside its bundle as a multi-resolution `.icns`. Rather than
//! parsing that, we ask `NSWorkspace` for the composed icon (which also covers apps whose
//! icon comes from a document type or the generic app placeholder), downscale it once, and
//! hand the frontend a PNG data URI it can drop straight into an `<img>`.
//!
//! Rendering is memoized per bundle path for the life of the process: the launcher re-scans
//! apps on every show, and re-rasterizing ~100 icons each time would be wasteful.
//!
//! Rasterizing costs ~15ms per icon, so this must never run on the main thread — the
//! command is `async` (Tauri runs those on the async runtime) and a lock serializes the
//! AppKit calls, keeping the panel responsive while icons stream in.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

/// Logical size we rasterize at. The row renders the icon at 26px, so 64pt covers 2x
/// displays with headroom and still keeps the base64 payload small.
const ICON_POINTS: f64 = 64.0;

/// Backing-store scale. Rasterizing at 2x keeps the icon crisp on Retina displays.
#[cfg(target_os = "macos")]
const SCALE: f64 = 2.0;

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Serializes rasterization: AppKit icon lookups shouldn't run concurrently, and there is
/// nothing to gain from parallelism here anyway.
fn render_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// PNG data URIs for `paths`, keyed by path. Paths whose icon can't be rendered are
/// omitted rather than reported as an error — the frontend falls back to a monogram.
pub fn icons_for_paths(paths: &[String]) -> HashMap<String, String> {
    let mut out = HashMap::with_capacity(paths.len());
    for path in paths {
        if let Some(uri) = icon_for_path(path) {
            out.insert(path.clone(), uri);
        }
    }
    out
}

fn icon_for_path(path: &str) -> Option<String> {
    if let Ok(cache) = cache().lock() {
        if let Some(hit) = cache.get(path) {
            return hit.clone();
        }
    }

    let rendered = {
        let _guard = render_lock().lock();
        render_icon(path)
    };

    if let Ok(mut cache) = cache().lock() {
        cache.insert(path.to_string(), rendered.clone());
    }
    rendered
}

#[cfg(target_os = "macos")]
fn render_icon(path: &str) -> Option<String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use objc2::rc::autoreleasepool;
    use objc2::ClassType;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSCompositingOperation, NSDeviceRGBColorSpace,
        NSGraphicsContext, NSWorkspace,
    };
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

    autoreleasepool(|_| unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let icon = workspace.iconForFile(&NSString::from_str(path));

        let size = NSSize::new(ICON_POINTS, ICON_POINTS);
        let rect = NSRect::new(NSPoint::new(0.0, 0.0), size);
        let pixels = (ICON_POINTS * SCALE) as isize;

        // A backing bitmap sized in pixels but measured in points, so drawing into it
        // downsamples the icon's largest representation at 2x for crisp Retina output.
        let rep = NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(),
            std::ptr::null_mut(),
            pixels,
            pixels,
            8,
            4,
            true,
            false,
            NSDeviceRGBColorSpace,
            0,
            0,
        )?;
        rep.setSize(size);

        let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&rep)?;
        NSGraphicsContext::saveGraphicsState_class();
        NSGraphicsContext::setCurrentContext(Some(&context));
        icon.setSize(size);
        icon.drawInRect_fromRect_operation_fraction(
            rect,
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0)),
            NSCompositingOperation::SourceOver,
            1.0,
        );
        context.flushGraphics();
        NSGraphicsContext::restoreGraphicsState_class();

        let data = rep
            .representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())?;
        Some(format!(
            "data:image/png;base64,{}",
            STANDARD.encode(data.bytes())
        ))
    })
}

#[cfg(not(target_os = "macos"))]
fn render_icon(_path: &str) -> Option<String> {
    None
}
