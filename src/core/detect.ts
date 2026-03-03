export type GlaciasCapability =
  | "full"
  | "reduced-motion"
  | "no-webgl"
  | "low-spec";

let cached: GlaciasCapability | null = null;

export function detectGlaciasCapability(): GlaciasCapability {
  if (cached) return cached;

  // Reduced motion preference
  if (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    cached = "reduced-motion";
    return cached;
  }

  // WebGL2 support
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      cached = "no-webgl";
      return cached;
    }
    // Clean up context
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  } catch {
    cached = "no-webgl";
    return cached;
  }

  // Low-spec hardware
  if (
    typeof navigator !== "undefined" &&
    navigator.hardwareConcurrency <= 2
  ) {
    cached = "low-spec";
    return cached;
  }

  cached = "full";
  return cached;
}

export function shouldFallback(): boolean {
  return detectGlaciasCapability() !== "full";
}
