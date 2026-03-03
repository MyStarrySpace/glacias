/**
 * Generate a signed distance field texture from an SVG path string.
 *
 * Accepts any SVG `<path d="...">` data. By default, coordinates are
 * treated as objectBoundingBox (0–1). Pass `viewBox` to map from
 * arbitrary SVG coordinate spaces (e.g. `[0, 0, 200, 300]`).
 */

export interface SdfTextureOptions {
  /** Texture resolution (default 256) */
  width?: number;
  /** Texture resolution (default 256) */
  height?: number;
  /**
   * SVG viewBox `[minX, minY, width, height]` for the path data.
   * If omitted, coordinates are assumed to be in the 0–1 range
   * (objectBoundingBox convention).
   */
  viewBox?: [number, number, number, number];
}

export interface SdfTextureResult {
  imageData: ImageData;
  /** Maximum interior distance in texels */
  maxInteriorDist: number;
}

export function generateSdfTexture(
  pathD: string,
  optionsOrWidth?: SdfTextureOptions | number,
  height?: number,
): SdfTextureResult {
  // Support legacy (width, height) positional args and new options object
  let w = 256;
  let h = 256;
  let viewBox: [number, number, number, number] | undefined;

  if (typeof optionsOrWidth === "number") {
    w = optionsOrWidth;
    if (height !== undefined) h = height;
  } else if (optionsOrWidth) {
    w = optionsOrWidth.width ?? 256;
    h = optionsOrWidth.height ?? 256;
    viewBox = optionsOrWidth.viewBox;
  }

  // 1. Render path to offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Map path coordinates to canvas pixels
  if (viewBox) {
    const [vx, vy, vw, vh] = viewBox;
    ctx.scale(w / vw, h / vh);
    ctx.translate(-vx, -vy);
  } else {
    // ObjectBoundingBox: 0–1 coords → full canvas
    ctx.scale(w, h);
  }

  const path = new Path2D(pathD);
  ctx.fillStyle = "white";
  ctx.fill(path);

  // 2. Extract binary mask (inside = 1)
  const imgData = ctx.getImageData(0, 0, w, h);
  const n = w * h;
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    inside[i] = imgData.data[i * 4 + 3] > 128 ? 1 : 0;
  }

  // 3. Compute distance transforms
  //    sqDistToInside[i]  = squared distance from pixel i to nearest INSIDE pixel
  //    sqDistToOutside[i] = squared distance from pixel i to nearest OUTSIDE pixel
  const outsideMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) outsideMask[i] = 1 - inside[i];

  const sqDistToInside = distanceTransform2D(inside, w, h);
  const sqDistToOutside = distanceTransform2D(outsideMask, w, h);

  // 4. Build signed distance field and track max interior distance
  //    Convention: negative = inside, positive = outside, 0 = edge
  const maxRange = Math.max(w, h) / 2;
  let maxInteriorDist = 0;

  const sdf = new ImageData(w, h);
  for (let i = 0; i < n; i++) {
    // Inside pixels: negative distance to nearest outside pixel (edge)
    // Outside pixels: positive distance to nearest inside pixel (edge)
    const dist = inside[i]
      ? -Math.sqrt(sqDistToOutside[i])
      : Math.sqrt(sqDistToInside[i]);

    if (inside[i] && -dist > maxInteriorDist) {
      maxInteriorDist = -dist;
    }

    // Encode: 0.5 = edge, <0.5 = inside, >0.5 = outside
    const normalized = Math.max(0, Math.min(1, 0.5 + dist / (2 * maxRange)));
    const byte = Math.round(normalized * 255);
    sdf.data[i * 4] = byte;
    sdf.data[i * 4 + 1] = byte;
    sdf.data[i * 4 + 2] = byte;
    sdf.data[i * 4 + 3] = 255;
  }

  if (maxInteriorDist === 0) {
    console.warn(
      "[glacias] generateSdfTexture: no interior pixels found. " +
      "Check that the SVG path is valid and coordinates match the viewBox.",
    );
  }

  return { imageData: sdf, maxInteriorDist };
}

// ── Felzenszwalb & Huttenlocher distance transform ──────────────
// Returns squared Euclidean distance to nearest target pixel.

function distanceTransform1D(f: Float64Array, n: number): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }

  return d;
}

function distanceTransform2D(
  mask: Uint8Array,
  width: number,
  height: number,
): Float64Array {
  const INF = 1e20;
  const n = width * height;
  const result = new Float64Array(n);

  // Initialize: 0 for target (mask=1), INF for non-target
  for (let i = 0; i < n; i++) {
    result[i] = mask[i] ? 0 : INF;
  }

  // Transform columns
  const col = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) col[y] = result[y * width + x];
    const d = distanceTransform1D(col, height);
    for (let y = 0; y < height; y++) result[y * width + x] = d[y];
  }

  // Transform rows
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = result[y * width + x];
    const d = distanceTransform1D(row, width);
    for (let x = 0; x < width; x++) result[y * width + x] = d[x];
  }

  return result;
}
