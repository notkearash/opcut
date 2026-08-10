export const WIN_W = 640;
export const SHADOW_GUTTER_PX = 14;
export const SEARCH_ROW_PX = 60;
export const RESULT_ROW_PX = 52;
export const LIST_VERTICAL_PADDING_PX = 8;
export const FOOTER_PX = 34;
export const EMPTY_STATE_ROW_PX = 52;
export const MAX_VISIBLE_ROWS = 8;
export const SETTINGS_HEADER_PX = 44;
export const SLOT_ROW_PX = 44;
export const SLOT_COUNT = 9;

export const ROUTE_MENU_ROW_PX = 46;
export const ROUTE_MENU_PADDING_PX = 7;
export const ROUTE_MENU_TOP_GAP_PX = 6;
export const ROUTE_MENU_BOTTOM_GAP_PX = 12;

export function routeMenuWindowHeight(itemCount: number): number {
  return (
    SHADOW_GUTTER_PX * 2 +
    SEARCH_ROW_PX +
    ROUTE_MENU_TOP_GAP_PX +
    ROUTE_MENU_PADDING_PX * 2 +
    itemCount * ROUTE_MENU_ROW_PX +
    ROUTE_MENU_BOTTOM_GAP_PX
  );
}

export function panelHeight(rowCount: number, hasQuery: boolean): number {
  let height = SEARCH_ROW_PX;
  if (rowCount > 0) {
    height +=
      LIST_VERTICAL_PADDING_PX * 2 +
      Math.min(rowCount, MAX_VISIBLE_ROWS) * RESULT_ROW_PX +
      FOOTER_PX;
  } else if (hasQuery) {
    height += EMPTY_STATE_ROW_PX + FOOTER_PX;
  }
  return height;
}

export function windowHeight(rowCount: number, hasQuery: boolean): number {
  return panelHeight(rowCount, hasQuery) + SHADOW_GUTTER_PX * 2;
}

export function settingsWindowHeight(): number {
  return (
    SHADOW_GUTTER_PX * 2 +
    SETTINGS_HEADER_PX +
    LIST_VERTICAL_PADDING_PX * 2 +
    SLOT_COUNT * SLOT_ROW_PX
  );
}
