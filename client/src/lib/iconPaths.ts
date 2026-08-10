const PATH_SEPARATOR = "\u0000";

export function joinIconPaths(paths: string[]): string {
  return paths.join(PATH_SEPARATOR);
}

export function splitIconPaths(joined: string): string[] {
  return joined.split(PATH_SEPARATOR);
}
