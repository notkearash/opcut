/**
 * Inline SVG glyphs. Stroke-based, 1.5px on a 16px grid, drawn in `currentColor` so they
 * inherit each row's state colour — text glyphs like "⌕" render at whatever weight the
 * system font happens to have, which read blurry next to real app icons.
 */

interface GlyphProps {
  /** Fallback only — the containing rule sets the real size (see `--media-glyph`). */
  size?: number;
}

function Svg({ size = 16, children }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function SearchGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 13.5 13.5" />
    </Svg>
  );
}

export function ShellGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 5.5 6 8l-2.5 2.5" />
      <path d="M8 11h4.5" />
    </Svg>
  );
}

export function CommandGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M6 4.5 9.5 8 6 11.5" />
    </Svg>
  );
}

/** Fallback mark for an app whose icon macOS would not give us. */
export function AppGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="10" height="10" rx="3" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
    </Svg>
  );
}
