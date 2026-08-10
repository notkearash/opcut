import { useCallback, useEffect, useRef, useState } from "react";
import { getAppIcons, getIconsEnabled, setIconsEnabled } from "../lib/tauri";

export interface AppIcons {
  /** Bundle path → PNG data URI, for every icon fetched so far this session. */
  icons: Record<string, string>;
  /** Whether rows should show real app icons at all. */
  iconsEnabled: boolean;
  /** Flip the persisted preference. */
  toggleIcons: () => Promise<void>;
  /** Ask for the icons of `paths`; already-known and in-flight paths are skipped. */
  requestIcons: (paths: string[]) => void;
}

/** Rasterizing happens on the Rust main thread, so only ask for what a screenful needs. */
const MAX_PER_REQUEST = 32;

/**
 * Lazily loads app icons, keyed by bundle path, and caches them for the window's lifetime
 * (the Rust side memoizes the rasterization too, so a re-request after a refresh is cheap).
 */
export function useAppIcons(): AppIcons {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [iconsEnabled, setIconsEnabledState] = useState(true);
  // Paths already requested — resolved or not, missing or not. Kept in a ref so requesting
  // never re-renders and never re-asks for an icon macOS could not give us.
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    getIconsEnabled().then(setIconsEnabledState);
  }, []);

  const toggleIcons = useCallback(async () => {
    const next = await setIconsEnabled(!iconsEnabled);
    setIconsEnabledState(next);
  }, [iconsEnabled]);

  const requestIcons = useCallback(
    (paths: string[]) => {
      if (!iconsEnabled) return;
      const missing: string[] = [];
      for (const path of paths) {
        if (requested.current.has(path)) continue;
        requested.current.add(path);
        missing.push(path);
        if (missing.length === MAX_PER_REQUEST) break;
      }
      if (missing.length === 0) return;
      getAppIcons(missing)
        .then((batch) => {
          if (Object.keys(batch).length === 0) return;
          setIcons((current) => ({ ...current, ...batch }));
        })
        .catch(() => {
          // Let a failed batch be retried the next time those rows are shown.
          for (const path of missing) requested.current.delete(path);
        });
    },
    [iconsEnabled],
  );

  return { icons, iconsEnabled, toggleIcons, requestIcons };
}
