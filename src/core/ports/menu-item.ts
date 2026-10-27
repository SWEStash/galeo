/** An entry of a native context menu that main builds and shows (ADR-004). */
export interface MenuItem {
  id: string;
  label: string;
  enabled?: boolean;
}
