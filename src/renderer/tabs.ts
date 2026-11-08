export interface Surface { id: string; label: string; kind?: string; family?: string; conversationTitle?: string; tab?: boolean; running?: boolean }
export const tabLabel = (surface: Surface) => surface.label;
export function initialSurface(surfaces: Surface[], saved: string | null) {
  return surfaces.find(surface => surface.id === saved) ?? surfaces[0];
}
export function needsSelection(surfaces: Surface[], selected: string, signedOut: boolean) {
  return !signedOut && surfaces.length > 0 && !surfaces.some(surface => surface.id === selected);
}
