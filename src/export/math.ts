import type { Picture } from "./dom";
import { drawn } from "./dom";

/**
 * Equations as pictures, for Word and PowerPoint, which don't read TeX.
 * The equation is set as an SVG of outlines, with no fonts to load, and
 * drawn to a PNG. The typesetter loads only when an export needs it.
 */

type Typeset = (tex: string, display: boolean) => string;
let typesetter: Promise<Typeset> | null = null;

function load(): Promise<Typeset> {
  typesetter ??= (async () => {
    const [
      { mathjax },
      { TeX },
      { SVG },
      { liteAdaptor },
      { RegisterHTMLHandler },
      { AllPackages },
    ] = await Promise.all([
      import("mathjax-full/js/mathjax.js"),
      import("mathjax-full/js/input/tex.js"),
      import("mathjax-full/js/output/svg.js"),
      import("mathjax-full/js/adaptors/liteAdaptor.js"),
      import("mathjax-full/js/handlers/html.js"),
      import("mathjax-full/js/input/tex/AllPackages.js"),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const document = mathjax.document("", {
      InputJax: new TeX({
        packages: AllPackages.filter((name) => name !== "bussproofs"),
      }),
      OutputJax: new SVG({ fontCache: "none" }),
    });
    return (tex: string, display: boolean) =>
      adaptor.innerHTML(document.convert(tex, { display }) as never);
  })();
  return typesetter;
}

/** How many CSS pixels an `ex` of the equation takes, at a font size. */
const EX = 0.442;

/** The SVG of an equation, sized for text of `fontSize` pixels. */
export async function equationSvg(
  tex: string,
  display: boolean,
  fontSize: number,
  color = "000000",
): Promise<{ svg: string; width: number; height: number; depth: number } | null> {
  const typeset = await load();
  let svg: string;
  try {
    svg = typeset(tex, display);
  } catch {
    return null;
  }
  if (!svg.startsWith("<svg") || svg.includes("data-mjx-error")) return null;
  const ex = fontSize * EX;
  const size = (name: string) => {
    const match = new RegExp(`${name}="([\\d.]+)ex"`).exec(svg);
    return match ? Number(match[1]) * ex : 0;
  };
  const width = size("width");
  const height = size("height");
  const depth = Number(/vertical-align:\s*(-?[\d.]+)ex/.exec(svg)?.[1] ?? 0) * -ex;
  if (!width || !height) return null;
  const sized = svg
    .replace(/width="[\d.]+ex"/, `width="${width}"`)
    .replace(/height="[\d.]+ex"/, `height="${height}"`)
    .replace(/currentColor/g, `#${color}`);
  return { svg: sized, width, height, depth };
}

/**
 * An equation as a PNG, drawn three times as sharp as its size so it
 * prints well. `width` and `height` are its size in CSS pixels.
 */
export async function equationPicture(
  tex: string,
  display: boolean,
  fontSize: number,
  color?: string,
): Promise<(Picture & { depth: number }) | null> {
  const set = await equationSvg(tex, display, fontSize, color);
  if (!set) return null;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(set.svg)}`;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const sharp = await drawn(image, set.width * 3, set.height * 3);
  return sharp && { ...sharp, width: set.width, height: set.height, depth: set.depth };
}
