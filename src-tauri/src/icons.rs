use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const RASTER_POINTS: f64 = 64.0;

#[cfg(target_os = "macos")]
const RETINA_BACKING_SCALE: f64 = 2.0;

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn render_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

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

        let size = NSSize::new(RASTER_POINTS, RASTER_POINTS);
        let rect = NSRect::new(NSPoint::new(0.0, 0.0), size);
        let pixels_per_side = (RASTER_POINTS * RETINA_BACKING_SCALE) as isize;

        let rep = NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(),
            std::ptr::null_mut(),
            pixels_per_side,
            pixels_per_side,
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
