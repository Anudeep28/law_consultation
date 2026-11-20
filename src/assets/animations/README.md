# Law Writer micro-animations

These original vector-only Lottie drawings were created for Law Writer: a drawn
success check, a folder for empty lists, and three loading dots. No external
artwork, fonts, images, expressions, scripts, or remote assets are used.

The player uses `lottie-react`'s SVG-only `LottieLight` engine (no expression
evaluator, workers, or WebAssembly in use). Vite resolves the package's engine
imports to the light build so the unused expression evaluators are not bundled.
The player and each JSON are separate
dynamic imports. Decorative playback failures leave the application's text,
status announcements, and controls intact. Reduced motion pauses and seeks to
the last frame; only loading repeats for other users.
