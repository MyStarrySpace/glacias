/**
 * Generate a signed distance field texture from an SVG path string.
 * The path should use objectBoundingBox coordinates (0–1).
 */

export interface SdfTextureResult {
  imageData: ImageData;
  /** Maximum interior distance in texels */
  maxInteriorDist: number;
}

export function generateSdfTexture(
  pathD: string,
  width = 256,
  height = 256,
): SdfTextureResult {
  // 1. Render path to offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Path uses 0–1 objectBoundingBox coords; scale to canvas
  ctx.scale(width, height);
  const path = new Path2D(pathD);
  ctx.fillStyle = "white";
  ctx.fill(path);

  // 2. Extract binary mask (inside = 1)
  const imgData = ctx.getImageData(0, 0, width, height);
  const n = width * height;
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    inside[i] = imgData.data[i * 4 + 3] > 128 ? 1 : 0;
  }

  // 3. Compute distance transforms for inside and outside
  const outsideMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) outsideMask[i] = 1 - inside[i];

  const sqDistInside = distanceTransform2D(inside, width, height);
  const sqDistOutside = distanceTransform2D(outsideMask, width, height);

  // 4. Build signed distance field and track max interior distance
  const maxRange = Math.max(width, height) / 2;
  let maxInteriorDist = 0;

  const sdf = new ImageData(width, height);
  for (let i = 0; i < n; i++) {
    const dist = inside[i]
      ? -Math.sqrt(sqDistInside[i])
      : Math.sqrt(sqDistOutside[i]);

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
