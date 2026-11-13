export class Loading {
  private bootAt = Date.now();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private show: (loading: boolean) => void, private failed: () => void) {}

  set(loading: boolean) {
    clearTimeout(this.timer);
    const wait = this.bootAt + 2000 - Date.now();
    if (!loading && wait > 0) { this.timer = setTimeout(() => this.set(false), wait); return; }
    this.show(loading);
    if (loading) this.timer = setTimeout(() => { this.show(false); this.failed(); }, 20000);
  }

  dispose() { clearTimeout(this.timer); }
}
