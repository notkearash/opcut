// Single source of truth for launcher geometry. The window is resized from the
// frontend (see App.tsx), so these numbers must match the CSS that renders the rows.
// CSS mirrors them via the custom properties defined in App.css.

export const WIN_W = 640; // full window width (logical px)
export const MARGIN = 14; // transparent gutter around the glass panel (room for shadow)
export const SEARCH_H = 60; // search input row
export const ROW_H = 52; // a single result row
export const LIST_VPAD = 8; // vertical padding inside the results list
export const FOOTER_H = 34; // hint footer
export const EMPTY_H = 52; // "no results" placeholder row
export const MAX_VISIBLE = 8; // rows shown before the list scrolls

/** Height of the glass panel for a given number of result rows. */
export function panelHeight(rowCount: number, hasQuery: boolean): number {
  let h = SEARCH_H;
  if (rowCount > 0) {
    h += LIST_VPAD * 2 + Math.min(rowCount, MAX_VISIBLE) * ROW_H + FOOTER_H;
  } else if (hasQuery) {
    h += EMPTY_H + FOOTER_H;
  }
  return h;
}

/** Full window height including the shadow gutter. */
export function windowHeight(rowCount: number, hasQuery: boolean): number {
  return panelHeight(rowCount, hasQuery) + MARGIN * 2;
}

export const SETTINGS_HEADER_H = 44;
export const SLOT_ROW_H = 44;

/** Fixed window height for the quick-slot settings view (9 slots). */
export function settingsWindowHeight(): number {
  return MARGIN * 2 + SETTINGS_HEADER_H + LIST_VPAD * 2 + 9 * SLOT_ROW_H;
}
