# Glacias

WebGL2 glass distortion engine with SDF shapes, refraction, chromatic aberration, and animated noise. Works standalone or as a React component.

## Install

```bash
npm install github:MyStarrySpace/glacias
```

## Quick Start (React)

```tsx
import { GlaciasCanvas } from "glacias/react";
import type { GlassParams } from "glacias";

const params: GlassParams = {
  refraction: 0.4,
  chromatic: 0.2,
  blur: 0.3,
  noise: 0.2,
  edge: 0.5,
  interior: 0.5,
  falloff: 0.6,
};

function App() {
  return (
    <GlaciasCanvas
      params={params}
      backgroundSrc="/your-background.jpg"
      style={{ width: 400, height: 300 }}
    />
  );
}
```

This renders a glass circle (the default shape) that refracts the background image.

## Quick Start (Vanilla JS)

```js
import { GlaciasEngine, DEFAULT_PARAMS } from "glacias";

const canvas = document.querySelector("canvas");
const engine = new GlaciasEngine({
  canvas,
  backgroundSrc: "/your-background.jpg",
  initialParams: { ...DEFAULT_PARAMS, refraction: 0.5 },
});

engine.start();

// Update params at any time
engine.setParams({ blur: 0.4 });

// Track mouse
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  engine.setMouse(
    (e.clientX - rect.left) / rect.width,
    1 - (e.clientY - rect.top) / rect.height
  );
});
```

## Parameters

All effect parameters live in the `GlassParams` object. Required fields have sensible ranges of 0&ndash;1. Optional fields have defaults.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `refraction` | `number` | `0.6` | Displacement strength (0&ndash;1) |
| `chromatic` | `number` | `0.18` | Chromatic aberration spread (0&ndash;1) |
| `blur` | `number` | `0.1` | Background blur amount (0&ndash;1) |
| `noise` | `number` | `0.35` | Animated surface noise (0&ndash;1) |
| `edge` | `number` | `0.55` | Edge glow / Fresnel intensity (0&ndash;1) |
| `interior` | `number` | `0.2` | Interior distortion breadth (0&ndash;1) |
| `falloff` | `number` | `1.0` | Falloff curve steepness (0 = gentle spread, 1 = edges only) |
| `shape` | `ShapeType` | `"clover"` | Built-in shape (ignored when using custom SDF) |
| `radius` | `number` | `180` | Shape radius in CSS px (ignored when using custom SDF) |
| `thickness` | `number` | `0.65` | Edge highlight band width |
| `strength` | `number` | `1.0` | Overall effect multiplier (scales displacement, blur, and chromatic) |
| `fillColor` | `[r, g, b]` | `[0,0,0]` | Tint color overlay (0&ndash;1 per channel) |
| `fillOpacity` | `number` | `0` | Tint opacity (0 = none, 1 = solid) |
| `debug` | `number` | `0` | 0 = off, 1 = vector field, 2 = SDF heatmap |

### Built-in Shapes

`shape` accepts: `"circle"`, `"roundedRect"`, `"hexagon"`, `"clover"`, `"star"`

### Falloff Curve

Distortion is always strongest at the shape edge and always zero at the center. The `falloff` parameter controls the curve between them:

- `falloff: 0` &mdash; exponent 0.3, gentle ramp, effect reaches deep into interior
- `falloff: 0.5` &mdash; exponent ~2.6, moderate roll-off
- `falloff: 1` &mdash; exponent 5.0, steep, effect concentrated at edges

## Custom Shapes (SDF Textures)

You can use any SVG path as a glass shape by generating an SDF (Signed Distance Field) texture from it.

### React

Pass the SVG path data string via `shapePath`:

```tsx
const cloudPath = "M0.5,0 C0.8,0 1,0.3 1,0.6 ...Z";

<GlaciasCanvas
  params={params}
  backgroundSrc="/bg.jpg"
  shapePath={cloudPath}
/>
```

The path is assumed to use **objectBoundingBox coordinates** (0&ndash;1 range) by default.

### Vanilla JS

Generate the SDF texture and upload it to the engine:

```js
import { GlaciasEngine, generateSdfTexture } from "glacias";

const { imageData, maxInteriorDist } = generateSdfTexture(myPathData);
engine.setSdfTexture(imageData, maxInteriorDist);

// To remove:
engine.clearSdfTexture();
```

### Arbitrary SVG Coordinates

If your path uses coordinates from a specific SVG viewBox (not 0&ndash;1), pass the `viewBox` option:

```js
import { generateSdfTexture } from "glacias";

// Path from an SVG with viewBox="0 0 200 300"
const pathD = "M10,20 C50,0 150,0 190,20 ...Z";
const { imageData, maxInteriorDist } = generateSdfTexture(pathD, {
  viewBox: [0, 0, 200, 300],
  width: 512,  // optional, default 256
  height: 512, // optional, default 256
});
```

### Crisp Edges with Clip Paths

The shader renders at canvas resolution, so custom shape edges can appear pixelated. For crisp edges, apply a CSS `clip-path` using the same SVG path on a wrapping element:

```html
<!-- Hidden SVG defining the clip path (objectBoundingBox coords) -->
<svg style="position:absolute;width:0;height:0">
  <defs>
    <clipPath id="my-shape" clipPathUnits="objectBoundingBox">
      <path d="M0.5,0 C0.8,0 1,0.3 1,0.6 ...Z" />
    </clipPath>
  </defs>
</svg>

<div style="clip-path: url(#my-shape); overflow: hidden">
  <canvas id="glacias-canvas" />
</div>
```

## Background Tracking

When using Glacias as an overlay on part of a page (e.g., a label on top of a larger image), pass `containerRef` and `labelRef` so the engine can compute the correct background-to-label UV mapping each frame:

```tsx
function GlassLabel({ backgroundSrc, children }) {
  const containerRef = useRef(null);
  const labelRef = useRef(null);

  return (
    <div ref={containerRef}>
      <img src={backgroundSrc} />
      <div ref={labelRef} style={{ position: "absolute", /* ... */ }}>
        <GlaciasCanvas
          params={params}
          backgroundSrc={backgroundSrc}
          containerRef={containerRef}
          labelRef={labelRef}
          className="absolute inset-0 w-full h-full"
        />
        {children}
      </div>
    </div>
  );
}
```

## Engine API

The `GlaciasEngine` class provides full control for non-React usage:

```ts
const engine = new GlaciasEngine({
  canvas,
  backgroundSrc: "/bg.jpg", // or "procedural" for a demo gradient
  initialParams: { refraction: 0.5, blur: 0.3, /* ... */ },
  mouseLerp: 0.08,          // mouse smoothing factor
  onError: (msg) => console.warn(msg),
});

engine.start();                          // begin animation loop
engine.pause();                          // pause rendering
engine.destroy();                        // clean up all WebGL resources

engine.setParams({ blur: 0.5 });         // update any params
engine.getParams();                      // read current params
engine.setMouse(0.5, 0.5);              // normalized [0,1] mouse position
engine.setBackground("/new-bg.jpg");     // swap background image
engine.setBgRect([0, 0, 0.5, 0.5]);     // manual background UV rect
engine.setElements(container, label);    // auto-compute bgRect from DOM
engine.resize();                         // recompute canvas dimensions

// Custom SDF
engine.setSdfTexture(imageData, maxDist);
engine.clearSdfTexture();
```

## Capability Detection

Glacias includes runtime detection for graceful fallbacks:

```ts
import { detectGlaciasCapability, shouldFallback } from "glacias";

const cap = detectGlaciasCapability();
// "full"            — WebGL2 supported, capable hardware
// "reduced-motion"  — user prefers reduced motion
// "no-webgl"        — WebGL2 not available
// "low-spec"        — hardware concurrency <= 2

if (shouldFallback()) {
  // Show a CSS backdrop-filter fallback or static image
}
```

The React `<GlaciasCanvas>` component handles this automatically, rendering a `backdrop-filter: blur()` fallback on unsupported devices.

## Debug Modes

Set `debug` in params to visualize the internal state:

- **`debug: 1`** &mdash; Vector field overlay showing displacement direction (hue) and magnitude (arrow length + brightness) on a grid
- **`debug: 2`** &mdash; SDF heatmap with contour lines (blue = inside, white = edge, red = outside)

## Peer Dependencies

- **React** &ge;18 (optional &mdash; only needed for `glacias/react`)

## License

MIT
