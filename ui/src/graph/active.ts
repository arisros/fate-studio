// Active-state matching. The SSE/snapshot `path` is one or more dot-paths
// (parallel regions joined by " | "). A node is active if its path is an
// active leaf OR an ancestor of one (so compound/parallel containers light up).

export interface ActiveSet {
  paths: Set<string>; // every active path incl. ancestors
  leaves: Set<string>; // only the active leaf paths (sendable origins)
}

export function activeFromPath(path: string): ActiveSet {
  const paths = new Set<string>();
  const leaves = new Set<string>();
  if (!path) return { paths, leaves };
  for (const region of path.split(" | ")) {
    const leaf = region.trim();
    if (!leaf) continue;
    leaves.add(leaf);
    const segs = leaf.split(".");
    for (let i = 1; i <= segs.length; i++) {
      paths.add(segs.slice(0, i).join("."));
    }
  }
  return { paths, leaves };
}
