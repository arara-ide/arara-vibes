export interface Surface { id: string; label: string; kind?: string; family?: string; conversationTitle?: string; tab?: boolean; running?: boolean; actions?: string[] }
export const tabLabel = (surface: Surface) => surface.label;
export function initialSurface(surfaces: Surface[], saved: string | null) {
  return surfaces.find(surface => surface.id === saved) ?? surfaces[0];
}
export function needsSelection(surfaces: Surface[], selected: string, signedOut: boolean) {
  return !signedOut && surfaces.length > 0 && !surfaces.some(surface => surface.id === selected);
}

export function moveTab<T extends { id: string }>(tabs: T[], id: string, before?: string): T[] {
  const tab = tabs.find(item => item.id === id);
  if (tabs.length < 2 || !tab || before === id || (before !== undefined && !tabs.some(item => item.id === before))) return tabs;
  const ordered = tabs.filter(item => item !== tab);
  ordered.splice(before === undefined ? ordered.length : ordered.findIndex(item => item.id === before), 0, tab);
  return ordered;
}
