import { lazy, type ComponentType } from "react";

export class PageImportError extends Error {
  constructor() {
    super("Não foi possível carregar esta página");
    this.name = "PageImportError";
  }
}

export function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  return lazy(async () => {
    try { return await loader(); }
    catch { throw new PageImportError(); }
  });
}

const ENTRY = /\/assets\/index-[^"'/]+\.js/;
const RELOAD_KEY = "workout-reloaded-for-build";

/** Entry script of a newer published build, or null when unknown or unchanged. */
export async function newerBuildEntry(fetcher: typeof fetch = fetch, doc: Document = document): Promise<string | null> {
  const current = Array.from(doc.scripts).map(script => script.src).find(src => ENTRY.test(src));
  if (!current) return null;
  const response = await fetcher(window.location.pathname, { cache: "no-store" });
  if (!response.ok) return null;
  const published = (await response.text()).match(ENTRY)?.[0];
  return published && !current.endsWith(published) ? published : null;
}

/**
 * After a deploy, open tabs still request chunks of the old build and get 404.
 * Reload once per newer build; a failure without a confirmed new build keeps the manual screen.
 */
export async function reloadIfNewerBuild(reload: () => void, fetcher: typeof fetch = fetch, storage: Storage = sessionStorage): Promise<boolean> {
  try {
    const entry = await newerBuildEntry(fetcher);
    if (!entry || storage.getItem(RELOAD_KEY) === entry) return false;
    storage.setItem(RELOAD_KEY, entry);
    reload();
    return true;
  } catch {
    return false;
  }
}
