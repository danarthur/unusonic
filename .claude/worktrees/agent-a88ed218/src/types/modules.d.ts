declare module 'canvas-confetti' {
  interface Options {
    particleCount?: number;
    spread?: number;
    origin?: { x?: number; y?: number };
    [key: string]: unknown;
  }
  function confetti(options?: Options): Promise<null>;
  export default confetti;
}

declare module 'culori' {
  type Color = { alpha?: number; [k: string]: unknown };
  export function parse(color: string): Color | undefined;
  export function parseHex(hex: string): Color | undefined;
  export function formatHex(color: Color): string;
  export function formatCss(color: Color): string;
  export function converter(mode: string): (color: Color) => Color;
}
