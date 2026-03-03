"use client";

import { useRef, useEffect, useCallback, useState, type RefObject } from "react";
import type { GlassParams } from "../core/types";
import { GlaciasEngine } from "../core/engine";
import { detectGlaciasCapability, shouldFallback } from "../core/detect";

export interface GlaciasCanvasProps {
  params: GlassParams;
  backgroundSrc?: string;
  bgRect?: [number, number, number, number];
  /** Ref to the element whose bounds represent the full background image */
  containerRef?: RefObject<HTMLElement | null>;
  /** Ref to the label element (glass surface) */
  labelRef?: RefObject<HTMLElement | null>;
  className?: string;
  style?: React.CSSProperties;
  paused?: boolean;
  onWebGLError?: (message: string) => void;
}

export function GlaciasCanvas({
  params,
  backgroundSrc = "procedural",
  bgRect,
  containerRef,
  labelRef,
  className,
  style,
  paused,
  onWebGLError,
}: GlaciasCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GlaciasEngine | null>(null);
  const webglSupported = useRef(true);
  const readyRef = useRef(false);
  const [fallback, setFallback] = useState(false);

  // Initialize engine (or fall back)
  useEffect(() => {
    if (shouldFallback()) {
      setFallback(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: GlaciasEngine | null = null;

    try {
      engine = new GlaciasEngine({
        canvas,
        backgroundSrc,
        initialParams: params,
        onError: (msg) => {
          webglSupported.current = false;
          onWebGLError?.(msg);
        },
      });
      engineRef.current = engine;
      readyRef.current = true;

      if (containerRef?.current && labelRef?.current) {
        engine.setElements(containerRef.current, labelRef.current);
      }

      engine.start();
    } catch {
      webglSupported.current = false;
      setFallback(true);
    }

    return () => {
      engine?.destroy();
      engineRef.current = null;
      readyRef.current = false;
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync params
  useEffect(() => {
    engineRef.current?.setParams(params);
  }, [params]);

  // Sync background
  useEffect(() => {
    engineRef.current?.setBackground(backgroundSrc);
  }, [backgroundSrc]);

  // Sync bgRect (manual override)
  useEffect(() => {
    if (bgRect) engineRef.current?.setBgRect(bgRect);
  }, [bgRect]);

  // Auto-track DOM elements for per-frame bgRect
  useEffect(() => {
    if (readyRef.current && containerRef?.current && labelRef?.current) {
      engineRef.current?.setElements(containerRef.current, labelRef.current);
    }
  }, [containerRef, labelRef]);

  // Pause/resume
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (paused) engine.pause();
    else engine.start();
  }, [paused]);

  // IntersectionObserver auto-pause
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paused !== undefined) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const engine = engineRef.current;
        if (!engine) return;
        if (entry.isIntersecting) engine.start();
        else engine.pause();
      },
      { threshold: 0.05 },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paused]);

  // ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      engineRef.current?.resize();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Mouse tracking
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      engineRef.current?.setMouse(x, y);
    },
    [],
  );

  if (fallback || !webglSupported.current) {
    const capability = detectGlaciasCapability();
    const usePlainFill = capability === "low-spec";
    return (
      <div
        className={className}
        style={{
          ...style,
          backgroundColor: usePlainFill
            ? "rgba(250, 248, 253, 0.65)"
            : "rgba(250, 248, 253, 0.55)",
          ...(usePlainFill
            ? {}
            : {
                backdropFilter: "blur(12px) saturate(1.2)",
                WebkitBackdropFilter: "blur(12px) saturate(1.2)",
              }),
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      className={className}
      style={style}
    />
  );
}
