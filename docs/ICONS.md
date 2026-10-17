# Application icon resources

The editable master is `AppScope/resources/base/media/app_icon.svg`: a square 1024 × 1024 vector with the existing Vela sail mark and a full-bleed green background. No rounded mask, transparent background edge, or additional inset is baked into the resource.

Run `node scripts/build-icons.mjs` to render the master directly at its final size:

- `app_icon_foreground.png`: 1024 × 1024, transparent outside the sail mark.
- `app_icon_background.png`: 1024 × 1024, fully opaque green, including every corner and edge.
- `app_icon_1024.png`: opaque square composite for Windows packaging and the Harmony launch window.

Harmony uses `layered_image.json` for both `AppScope.app.icon` and the launcher ability's `icon`. This avoids the ability overriding the app's layered resource. The launch window uses the composite bitmap.

The module's `PreserveLauncherIcon` build task runs after resource compilation and before compiled resources are packed. The installed restool downsamples layered PNGs to 512px and changes opaque alpha to 254, even with media compression disabled. The task retains restool's compiled resource IDs and restores the two original 1024px PNGs before packaging and signing. Verify both standalone HAP and APP-embedded HAP; do not edit an already signed package.

Android uses its separate adaptive icon foreground vector and opaque `icon_background` color. Its foreground contains only the sail geometry; the launcher applies its own mask. Windows uses the square composite.

`test-results/icon-0.8.3/mask-preview.png` shows simulated square, rounded-square, and circular system masks for visual review. It is not a shipping resource. Real-device launcher review and AppGallery acceptance are separate from source and package validation.

## Planning file icons

OUTLINE and MAP use code-defined 24-unit line icons in `web/icons.mjs`: a branching node diagram and a hexagonal map. They share the existing stroke, inherit theme colors, carry accessible Chinese / English labels, and appear in the file manager and start-page recents. Tabs use the uppercase type labels PCS and VLMP. No third-party icon library is used.

The `simplify` icon represents removal of redundant drawing points and is distinct from the boundary and arrange icons. The Markdown guide references real SVG files under `docs/vela-guide-icons/`; `scripts/build-guide.mjs` generates only referenced icons from the same code definitions and prunes obsolete guide icons. The built-in Markdown renderer resolves these exact guide paths to embedded SVG images, so the first-run guide also displays icons offline without adding arbitrary SVG loading to user documents.
