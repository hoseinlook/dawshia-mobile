export interface Size {
  width: number;
  height: number;
}

/**
 * Maps a point normalized to the upright camera frame into view pixels,
 * for a preview that fills the view with "cover" scaling (center-cropped).
 */
export function frameToViewPoint(
  x: number,
  y: number,
  frame: Size,
  view: Size,
): { x: number; y: number } {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const renderedW = frame.width * scale;
  const renderedH = frame.height * scale;
  return {
    x: x * renderedW - (renderedW - view.width) / 2,
    y: y * renderedH - (renderedH - view.height) / 2,
  };
}
