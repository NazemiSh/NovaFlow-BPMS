import { useState, useEffect, useRef } from 'react';

/**
 * Computes an auto-fit scale factor and bounding box for fixed-width A4/A5 sheets
 * on mobile viewports (< 768px) while preserving desktop zoom behavior.
 */
export function useResponsiveSheetScale(
  basePxWidth,
  basePxHeight,
  zoomScale,
  sheetCount = 1,
  active = true,
  recheckKey = null
) {
  const wrapperRef = useRef(null);
  const contentRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const [wrapperWidth, setWrapperWidth] = useState(0);
  const [unscaledHeight, setUnscaledHeight] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const wrapperEl = wrapperRef.current;
    const parentEl = wrapperEl?.parentElement;
    const contentEl = contentRef.current;

    const measure = () => {
      if (typeof window !== 'undefined') {
        setViewportWidth(window.innerWidth);
      }
      if (wrapperRef.current && wrapperRef.current.clientWidth > 0) {
        setWrapperWidth(wrapperRef.current.clientWidth);
      }
      if (contentRef.current && contentRef.current.scrollHeight > 0) {
        setUnscaledHeight(contentRef.current.scrollHeight);
      }
    };

    measure();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', measure);
    }

    let obs = null;
    if (typeof ResizeObserver !== 'undefined') {
      obs = new ResizeObserver(measure);
      if (wrapperEl) obs.observe(wrapperEl);
      if (parentEl) obs.observe(parentEl);
      if (contentEl) obs.observe(contentEl);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', measure);
      }
      if (obs) obs.disconnect();
    };
  }, [active, basePxWidth, basePxHeight, sheetCount, recheckKey]);

  const isMobile = viewportWidth < 768;
  const effectiveAvailableWidth = Math.max(
    240,
    (wrapperWidth > 0 ? wrapperWidth : viewportWidth) - (isMobile ? 32 : 40)
  );
  const effectiveScale = isMobile
    ? Math.max(0.22, Math.min(1, effectiveAvailableWidth / Math.max(1, basePxWidth)))
    : zoomScale;

  const fallbackHeight = basePxHeight * Math.max(1, sheetCount);
  const measuredHeight = unscaledHeight > 0 ? unscaledHeight : fallbackHeight;

  return {
    wrapperRef,
    contentRef,
    isMobile,
    effectiveScale,
    scaledWidth: Math.round(basePxWidth * effectiveScale),
    scaledHeight: Math.ceil(measuredHeight * effectiveScale)
  };
}
