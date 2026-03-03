export type ShapeType = "circle" | "roundedRect" | "hexagon" | "clover" | "star";

export interface GlassParams {
  shape: ShapeType;
  /** Radius in CSS pixels (40–400) */
  radius: number;
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
  /** Edge band width 0–1 */
  thickness: number;
  /** Interior distortion 0–1 */
  interior: number;
  /** Center attenuation 0–1 (0 = uniform, 1 = edges only) */
  falloff: number;
}

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

export const DEFAULT_PARAMS: GlassParams = {
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
};
