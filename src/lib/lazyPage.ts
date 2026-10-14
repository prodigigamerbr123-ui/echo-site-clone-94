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
