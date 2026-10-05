# Application icon resources

The editable master is `AppScope/resources/base/media/app_icon.svg`: a square 1024 × 1024 vector with the existing Vela sail mark and a full-bleed green background. No rounded mask, transparent background edge, or additional inset is baked into the resource.

Run `node scripts/build-icons.mjs` to render the master directly at its final size:

- `app_icon_foreground.png`: 1024 × 1024, transparent outside the sail mark.
- `app_icon_background.png`: 1024 × 1024, fully opaque green, including every corner and edge.
- `app_icon_1024.png`: opaque square composite for Windows packaging and the Harmony launch window.

Harmony uses `layered_image.json` for both `AppScope.app.icon` and the launcher ability's `icon`. This avoids the ability overriding the app's layered resource. The launch window uses the composite bitmap.

Android uses its separate adaptive icon foreground vector and opaque `icon_background` color. Its foreground contains only the sail geometry; the launcher applies its own mask. Windows uses the square composite.

`test-results/icon-0.8.3/mask-preview.png` shows simulated square, rounded-square, and circular system masks for visual review. It is not a shipping resource. Real-device launcher review and AppGallery acceptance are separate from source and package validation.
