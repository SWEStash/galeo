/** A font family installed on the system, as Settings' pickers list it. */
export interface SystemFont {
  family: string;
  /** Every character the same width (fontconfig's mono, dual or charcell spacing). */
  mono: boolean;
}

/** The longest font name a setting holds (the settings schema's limit). */
export const FONT_NAME_MAX = 100;
