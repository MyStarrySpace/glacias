export type ShapeType = "circle" | "roundedRect" | "hexagon" | "clover" | "star";

export interface GlassParams {
  /** Built-in SDF shape (only used when no custom SDF texture is provided) */
  shape?: ShapeType;
  /** Radius in CSS pixels for built-in shapes (only used when no custom SDF texture) */
  radius?: number;
  /** Refraction strength 0–1 */
  refraction: number;
  /** Chromatic aberration 0–1 */
  chromatic: number;
  /** Blur amount 0–1 */
  blur: number;
  /** Surface noise 0–1 */
  noise: number;
  /** Edge glow intensity 0–1 */
  edge: number;
  /** Edge highlight band width 0–1 (fraction of radius for Fresnel/specular) */
  thickness?: number;
  /** Interior distortion breadth 0–1 (widens the active distortion band inward) */
  interior: number;
  /** Center attenuation 0–1 (0 = uniform distortion, 1 = edges only) */
  falloff: number;
  /** Fill tint color as [r, g, b] in 0–1 range */
  fillColor?: [number, number, number];
  /** Fill tint opacity 0–1 (0 = no tint, 1 = solid fill) */
  fillOpacity?: number;
  /** Debug visualization: 0 = off, 1 = vector field, 2 = SDF heatmap */
  debug?: number;
}

/** Fully resolved params used internally (all fields present) */
export type ResolvedGlassParams = Required<GlassParams>;

export interface GlaciasOptions {
  canvas: HTMLCanvasElement;
  backgroundSrc?: string | "procedural";
  initialParams?: Partial<GlassParams>;
  mouseLerp?: number;
  onError?: (message: string) => void;
}

export const SHAPE_INDEX: Record<ShapeType, number> = {
  circle: 0,
  roundedRect: 1,
  hexagon: 2,
  clover: 3,
  star: 4,
};

export const DEFAULT_PARAMS: ResolvedGlassParams = {
  shape: "clover",
  radius: 180,
  refraction: 0.6,
  chromatic: 0.18,
  blur: 0.1,
  noise: 0.35,
  edge: 0.55,
  thickness: 0.65,
  interior: 0.2,
  falloff: 1.0,
  fillColor: [0, 0, 0],
  fillOpacity: 0,
  debug: 0,
};
