import "server-only";

import bwipjs from "bwip-js/node";

/**
 * The online code as a Code 128 barcode, drawn as SVG so it prints sharp at
 * any size. Code 128 is what the photo day cards and scanners use. Returns
 * null when the code cannot be drawn.
 */
export function barcodeSvg(code: string): string | null {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(code)) return null;
  try {
    return bwipjs.toSVG({ bcid: "code128", text: code, height: 14, scale: 2, includetext: false, paddingwidth: 6, paddingheight: 0 });
  } catch {
    return null;
  }
}
