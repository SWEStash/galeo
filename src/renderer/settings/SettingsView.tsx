import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  ComboBox,
  ColorSwatch,
  ColorSwatchPicker,
  ColorSwatchPickerItem,
  Input,
  Header,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  NumberField,
  Popover,
  RadioButton,
  RadioField,
  RadioGroup,
  SwitchButton,
  SwitchField,
  TextArea,
  TextField,
} from 'react-aria-components';
import { ACCENTS, accentOf } from '../../shared/accents';
import type { ProfileView, SettingsResult, SettingsScope, SettingsState } from '../../shared/contracts';
import type { SeparatorChoice } from '../../shared/csv';
import { TAB_PANEL_MAX, TAB_PANEL_MIN, type Settings, type SettingsOverrides, type TabsPosition, type ThemeMode } from '../../shared/settings';
import type { SystemFont } from '../../shared/fonts';
import type { ReaderWidth } from '../../shared/tabs';
import { fontStack } from './tokens';

const SOURCE_NAMES = { default: 'Default', global: 'All profiles', profile: 'This profile' } as const;

/** The table separators Settings offers (ADR-021), Auto first. */
const SEPARATOR_CHOICES: readonly [SeparatorChoice, string][] = [
  ['auto', 'Auto'],
  [',', 'Comma'],
  [';', 'Semicolon'],
  ['\t', 'Tab'],
  ['|', 'Pipe'],
];

/**
 * The Settings tab (UX §6): the v0.1 settings, for this profile or for all of them. Each shows
 * where its value comes from, and this profile's own values can go back to the shared one.
 */
export function SettingsView({
  state,
  profile,
  appImage = false,
  version,
  onAbout,
}: {
  state: SettingsState;
  profile: ProfileView;
  appImage?: boolean;
  /** galeo's version, and the About dialog it opens (version, licence, notices). */
  version: string;
  onAbout: () => void;
}) {
  const [scope, setScope] = useState<SettingsScope>('profile');
  const [refused, setRefused] = useState<string | null>(null);
  const [launcher, setLauncher] = useState<string | null>(null);
  const [accentRefused, setAccentRefused] = useState(false);
  const values = scope === 'profile' ? state.settings : state.shared;
  // The installed fonts, asked for when a font picker first opens (main runs fc-list once).
  const [installed, setInstalled] = useState<readonly SystemFont[] | null>(null);
  const asked = useRef(false);
  const listFonts = () => {
    if (asked.current) return;
    asked.current = true;
    void window.galeo.settings.fonts().then(setInstalled, () => setInstalled([]));
  };

  const done = (result: SettingsResult) => setRefused(result.ok ? null : result.path);
  const set = (change: SettingsOverrides) => void window.galeo.settings.set(scope, change).then(done);
  const reset = (key: keyof Settings) => void window.galeo.settings.reset(key).then(done);

  /** One setting: its control, where its value comes from, and "Reset to global" when this profile overrides it. */
  const setting = (key: keyof Settings, control: ReactNode) => (
    <div className="setting" data-setting={key} key={`${scope}:${key}`}>
      {control}
      {scope === 'profile' && <span className="setting-source">{SOURCE_NAMES[state.sources[key]]}</span>}
      {scope === 'profile' && state.sources[key] === 'profile' && (
        <Button className="setting-reset" onPress={() => reset(key)}>
          Reset to global
        </Button>
      )}
    </div>
  );

  return (
    <section className="settings-view" aria-labelledby="settings-title" data-testid="settings-view">
      <h1 id="settings-title">Settings</h1>
      <RadioGroup className="settings-scope" value={scope} onChange={(value) => setScope(value as SettingsScope)} orientation="horizontal">
        <Label>Change settings for</Label>
        <RadioField value="profile">
          <RadioButton>This profile ({profile.name})</RadioButton>
        </RadioField>
        <RadioField value="global">
          <RadioButton>All profiles</RadioButton>
        </RadioField>
      </RadioGroup>
      {refused && (
        <p className="settings-refused" role="alert">
          <code>{refused}</code> has an error from a hand edit, so it was left untouched. Fix it, then change the setting again.
        </p>
      )}

      <h2>Appearance</h2>
      {setting(
        'themeMode',
        <RadioGroup className="field" value={values.themeMode} onChange={(value) => set({ themeMode: value as ThemeMode })} orientation="horizontal">
          <Label>Theme</Label>
          <RadioField value="system">
            <RadioButton>System</RadioButton>
          </RadioField>
          <RadioField value="light">
            <RadioButton>Light</RadioButton>
          </RadioField>
          <RadioField value="dark">
            <RadioButton>Dark</RadioButton>
          </RadioField>
        </RadioGroup>,
      )}
      <div className="setting" data-setting="accent">
        <span className="field-label" id="settings-accent" data-label>
          Accent colour
        </span>
        <ColorSwatchPicker
          aria-labelledby="settings-accent"
          className="swatches"
          value={accentOf(profile.accent)}
          onChange={(color) =>
            void window.galeo.profiles.update(profile.name, color.toString('hex').toLowerCase()).then((result) => setAccentRefused(!result.ok))
          }
        >
          {ACCENTS.map((each) => (
            <ColorSwatchPickerItem key={each.color} color={each.color} className="swatch-item">
              <ColorSwatch colorName={each.name} className="swatch" />
            </ColorSwatchPickerItem>
          ))}
        </ColorSwatchPicker>
        <span className="setting-source">This profile</span>
        {accentRefused && (
          <p className="settings-refused" role="alert">
            The accent wasn't saved: this profile's profile.json has an error from a hand edit. Fix it, then pick again.
          </p>
        )}
      </div>

      <h2>Reading</h2>
      {setting('proseFont', <FontSetting kind="prose" value={values.proseFont} installed={installed} onOpen={listFonts} onCommit={(proseFont) => set({ proseFont })} />)}
      {setting('codeFont', <FontSetting kind="code" value={values.codeFont} installed={installed} onOpen={listFonts} onCommit={(codeFont) => set({ codeFont })} />)}
      {setting(
        'fontSize',
        <NumberField className="field" value={values.fontSize} minValue={10} maxValue={40} onChange={(fontSize) => !Number.isNaN(fontSize) && fontSize !== values.fontSize && set({ fontSize })}>
          <Label>Font size</Label>
          <Input />
        </NumberField>,
      )}
      {setting('measure', <MeasureSetting value={values.measure} onChange={(measure) => measure !== values.measure && set({ measure })} />)}

      <h2>Window</h2>
      {setting(
        'statusBar',
        <SwitchField className="switch" isSelected={values.statusBar} onChange={(statusBar) => set({ statusBar })}>
          <SwitchButton>
            <span className="switch-track" aria-hidden="true" />
            Status bar
          </SwitchButton>
        </SwitchField>,
      )}
      {setting(
        'tabsPosition',
        <RadioGroup className="field" value={values.tabsPosition} onChange={(value) => set({ tabsPosition: value as TabsPosition })} orientation="horizontal">
          <Label>Tabs</Label>
          <RadioField value="top">
            <RadioButton>Top</RadioButton>
          </RadioField>
          <RadioField value="left">
            <RadioButton>Left</RadioButton>
          </RadioField>
        </RadioGroup>,
      )}
      {setting(
        'tabPanelWidth',
        <NumberField
          className="field"
          value={values.tabPanelWidth}
          minValue={TAB_PANEL_MIN}
          maxValue={TAB_PANEL_MAX}
          step={1}
          onChange={(tabPanelWidth) => !Number.isNaN(tabPanelWidth) && tabPanelWidth !== values.tabPanelWidth && set({ tabPanelWidth })}
        >
          <Label>Tab panel width</Label>
          <Input />
        </NumberField>,
      )}

      <h2>Tables</h2>
      {setting(
        'tableSeparator',
        <RadioGroup className="field" value={values.tableSeparator} onChange={(value) => set({ tableSeparator: value as SeparatorChoice })} orientation="horizontal">
          <Label>Separator</Label>
          {SEPARATOR_CHOICES.map(([value, name]) => (
            <RadioField key={value} value={value}>
              <RadioButton>{name}</RadioButton>
            </RadioField>
          ))}
        </RadioGroup>,
      )}
      {setting(
        'tableHeader',
        <SwitchField className="switch" isSelected={values.tableHeader} onChange={(tableHeader) => set({ tableHeader })}>
          <SwitchButton>
            <span className="switch-track" aria-hidden="true" />
            First row is a header
          </SwitchButton>
        </SwitchField>,
      )}

      <h2>Quick open</h2>
      {setting(
        'quickOpenExclude',
        <ListSetting label="Excluded from quick open" hint="One folder or file name per line, skipped wherever it appears" value={values.quickOpenExclude} onCommit={(quickOpenExclude) => set({ quickOpenExclude })} />,
      )}

      <h2>Custom CSS</h2>
      <p className="field-hint">Your own styles for documents, edited in your editor; saving applies them at once.</p>
      <div className="settings-buttons">
        <Button onPress={() => void window.galeo.settings.openCustomCss('profile')}>Open CSS for this profile</Button>
        <Button onPress={() => void window.galeo.settings.openCustomCss('global')}>Open CSS for all profiles</Button>
      </div>

      {appImage && (
        <>
          <h2>Command line</h2>
          <p className="field-hint">Adds galeo to ~/.local/bin and to your applications, for this AppImage.</p>
          <div className="settings-buttons">
            <Button
              onPress={() =>
                void window.galeo.app
                  .installLauncher()
                  .then((result) => setLauncher(result.ok ? `Installed ${result.bin}. Open a new terminal to use galeo.` : `Not installed: ${result.reason}.`))
                  .catch(() => setLauncher("Not installed: galeo couldn't write the files."))
              }
            >
              Install command-line launcher
            </Button>
          </div>
          <p className="field-hint" role="status" data-testid="launcher-result">
            {launcher}
          </p>
        </>
      )}

      <h2>About</h2>
      <div className="setting settings-about" data-setting="about">
        <span>galeo {version}</span>
        <Button onPress={onAbout}>About galeo</Button>
      </div>
    </section>
  );
}

/** The reading column widths Settings names (UX §6); any other width is Custom. */
const MEASURE_PRESETS: readonly [ReaderWidth, string][] = [
  [60, 'Narrow (60)'],
  [72, 'Normal (72)'],
  [100, 'Wide (100)'],
  ['full', 'Full width'],
];
const isPreset = (value: ReaderWidth) => MEASURE_PRESETS.some(([preset]) => preset === value);

/** The measure: a preset, or Custom with a width in characters, its stepper live only while Custom is chosen. */
function MeasureSetting({ value, onChange }: { value: ReaderWidth; onChange: (value: ReaderWidth) => void }) {
  const [custom, setCustom] = useState(!isPreset(value));
  // A width from main that no preset names (a hand edit, the stepper) is Custom.
  useEffect(() => {
    if (!isPreset(value)) setCustom(true);
  }, [value]);
  const choose = (choice: string) => {
    if (choice === 'custom') return setCustom(true);
    setCustom(false);
    onChange(choice === 'full' ? 'full' : Number(choice));
  };
  return (
    <div className="field measure-field">
      <RadioGroup value={custom ? 'custom' : String(value)} onChange={choose} orientation="horizontal">
        <Label>Measure</Label>
        {MEASURE_PRESETS.map(([preset, name]) => (
          <RadioField key={preset} value={String(preset)}>
            <RadioButton>{name}</RadioButton>
          </RadioField>
        ))}
        <RadioField value="custom">
          <RadioButton>Custom</RadioButton>
        </RadioField>
      </RadioGroup>
      <NumberField
        className="field"
        aria-label="Custom measure"
        value={value === 'full' ? 200 : value}
        minValue={40}
        maxValue={200}
        isDisabled={!custom}
        onChange={(width) => !Number.isNaN(width) && onChange(width)}
      >
        <Input aria-describedby="settings-measure-unit" />
        <span id="settings-measure-unit" className="field-hint">
          characters per line
        </span>
      </NumberField>
    </div>
  );
}

/** The fonts galeo ships (fonts.css), offered first: all three for prose, the monospace one for code. */
const BUNDLED_FONTS = { prose: ['Inter', 'Source Serif 4', 'JetBrains Mono'], code: ['JetBrains Mono'] } as const;
const FALLBACKS = { prose: 'system-ui, sans-serif', code: 'ui-monospace, monospace' } as const;
const PREVIEWS = { prose: 'The quick brown fox jumps over the lazy dog.', code: 'const total = items.reduce((sum, n) => sum + n, 0);' } as const;

/**
 * A font setting (UX §6): the bundled fonts, then the installed families (monospace ones for
 * code), each drawn in its own face; any other name can still be typed. Written when an option
 * is chosen, the field is left, or Enter is pressed; a preview line shows the font in use.
 */
function FontSetting({
  kind,
  value,
  installed,
  onOpen,
  onCommit,
}: {
  kind: 'prose' | 'code';
  value: string;
  installed: readonly SystemFont[] | null;
  onOpen: () => void;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (name: string) => {
    const next = name.trim();
    if (next && next !== value) onCommit(next);
  };
  const bundled: readonly string[] = BUNDLED_FONTS[kind];
  const others = (installed ?? []).filter((font) => (kind === 'prose' || font.mono) && !bundled.includes(font.family)).map((font) => font.family);
  const label = kind === 'prose' ? 'Prose font' : 'Code font';
  const item = (family: string) => (
    <ListBoxItem key={family} id={family} textValue={family} className="menu-item" style={{ fontFamily: fontStack(family, FALLBACKS[kind]) }}>
      {family}
    </ListBoxItem>
  );
  return (
    <div className="field font-field">
      <ComboBox
        className="field"
        allowsCustomValue
        menuTrigger="focus"
        inputValue={draft}
        onInputChange={setDraft}
        onOpenChange={(open) => open && onOpen()}
        onFocus={onOpen}
        onSelectionChange={(key) => key !== null && (setDraft(String(key)), commit(String(key)))}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => event.key === 'Enter' && commit(draft)}
      >
        <Label>{label}</Label>
        <div className="font-input">
          <Input />
          <Button className="font-open" aria-label={`Show ${kind} fonts`}>
            ▾
          </Button>
        </div>
        <Popover className="menu-popover font-popover" placement="bottom start">
          <ListBox className="menu font-list">
            <ListBoxSection>
              <Header className="menu-header">Bundled</Header>
              {bundled.map(item)}
            </ListBoxSection>
            {others.length > 0 && (
              <ListBoxSection>
                <Header className="menu-header">Installed</Header>
                {others.map(item)}
              </ListBoxSection>
            )}
          </ListBox>
        </Popover>
      </ComboBox>
      {/* A sample, not content: the field already names the font. */}
      <p className="font-preview" aria-hidden="true" style={{ fontFamily: fontStack(value, FALLBACKS[kind]) }}>
        {PREVIEWS[kind]}
      </p>
    </div>
  );
}

/** A list setting, one entry per line, written when the field is left. */
function ListSetting({ label, hint, value, onCommit }: { label: string; hint: string; value: readonly string[]; onCommit: (value: string[]) => void }) {
  const text = value.join('\n');
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const commit = () => {
    const next = draft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (next.join('\n') !== value.join('\n')) onCommit(next);
  };
  return (
    <TextField className="field" value={draft} onChange={setDraft} onBlur={commit}>
      <Label>{label}</Label>
      <TextArea rows={4} />
      <span className="field-hint">{hint}</span>
    </TextField>
  );
}
