import { useCallback, useEffect, useRef, useState } from "react";
import { getAppIcons, getIconsEnabled, setIconsEnabled } from "../lib/tauri";

export interface AppIcons {
  icons: Record<string, string>;
  iconsEnabled: boolean;
  toggleIcons: () => Promise<void>;
  requestIcons: (paths: string[]) => void;
}

const MAX_PATHS_PER_REQUEST = 32;

export function useAppIcons(): AppIcons {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [iconsEnabled, setIconsEnabledState] = useState(true);
  const alreadyRequested = useRef<Set<string>>(new Set());

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
      const batch: string[] = [];
      for (const path of paths) {
        if (alreadyRequested.current.has(path)) continue;
        alreadyRequested.current.add(path);
        batch.push(path);
        if (batch.length === MAX_PATHS_PER_REQUEST) break;
      }
      if (batch.length === 0) return;
      getAppIcons(batch)
        .then((loaded) => {
          if (Object.keys(loaded).length === 0) return;
          setIcons((current) => ({ ...current, ...loaded }));
        })
        .catch(() => {
          for (const path of batch) alreadyRequested.current.delete(path);
        });
    },
    [iconsEnabled],
  );

  return { icons, iconsEnabled, toggleIcons, requestIcons };
}
