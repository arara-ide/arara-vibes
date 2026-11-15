export const SCREENS = ['loading', 'update', 'onboarding', 'recover', 'signin'] as const;
export type Screen = typeof SCREENS[number] | 'chat';
export type ScreenFlags = Record<typeof SCREENS[number], boolean>;

export function visibleScreen(flags: ScreenFlags): Screen {
  return SCREENS.find(screen => flags[screen]) ?? 'chat';
}

export interface ScreenState { target: Screen; shown?: Screen }

export class ScreenSwitcher {
  private target?: Screen;
  private shown?: Screen;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly apply: (state: ScreenState) => void, private readonly duration: () => number, private readonly schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = (callback, delay) => setTimeout(callback, delay), private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void = timer => clearTimeout(timer)) {}

  show(target: Screen) {
    if (target === this.target) return;
    this.target = target;
    if (this.timer !== undefined) { this.apply({ target }); return; }
    const delay = this.duration();
    if (this.shown === undefined || delay <= 0) { this.shown = target; this.apply({ target, shown: target }); return; }
    this.shown = undefined;
    this.apply({ target });
    this.timer = this.schedule(() => {
      this.timer = undefined;
      this.shown = this.target;
      this.apply({ target: this.target!, shown: this.shown });
    }, delay);
  }

  dispose() { if (this.timer !== undefined) this.cancel(this.timer); this.timer = undefined; }
}
