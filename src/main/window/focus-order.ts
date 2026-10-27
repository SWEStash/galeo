/** Window ids, the last focused first, across all profiles. */
export class FocusOrder {
  // Replaced on every change, so an order handed out stays as it was.
  private order: readonly number[] = [];

  /** The window was opened or focused. */
  front(window: number): void {
    this.order = [window, ...this.order.filter((id) => id !== window)];
  }

  remove(window: number): void {
    this.order = this.order.filter((id) => id !== window);
  }

  ids(): readonly number[] {
    return this.order;
  }
}
