export type WalkPreferences = {
  role: 'male' | 'female';
  view: 'first' | 'third';
  night: boolean;
  muted: boolean;
  volume: number;
  music: boolean;
  warmth: number;
  reduced: boolean;
  quality: 'high' | 'cinematic' | 'balanced';
  resolution: 'auto' | 'native' | 'quality' | 'performance';
};

const storageKey = 'sakura-walk.preferences.v1';
const percentage = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const boolean = (value: unknown) => typeof value === 'boolean';
const choice = (...choices: string[]) => (value: unknown) => typeof value === 'string' && choices.includes(value);

const validators: Record<keyof WalkPreferences, (value: unknown) => boolean> = {
  role: choice('male', 'female'),
  view: choice('first', 'third'),
  night: boolean,
  muted: boolean,
  volume: percentage,
  music: boolean,
  warmth: percentage,
  reduced: boolean,
  quality: choice('high', 'cinematic', 'balanced'),
  resolution: choice('auto', 'native', 'quality', 'performance')
};

export function loadPreferences(): Partial<WalkPreferences> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const entries = Object.entries(raw).filter(([key, value]) =>
      Object.hasOwn(validators, key) && validators[key as keyof WalkPreferences](value)
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function savePreference<K extends keyof WalkPreferences>(key: K, value: WalkPreferences[K]) {
  if (!validators[key](value)) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...loadPreferences(), [key]: value }));
  } catch {
    // Storage may be blocked or full. In-memory game state has already changed.
  }
}
