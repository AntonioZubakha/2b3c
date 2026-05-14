/**
 * Chart Colors Utility
 *
 * Uses JavaScript property getters so every access to chartColors.primary
 * (and similar) reads the current CSS variable value from the document.
 * This means chart colors automatically reflect theme changes without
 * requiring a page reload or extra React state.
 */

const getCSSVariable = (variableName: string): string => {
  if (typeof window !== 'undefined') {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(variableName)
      .trim();
    return value || getFallbackColor(variableName);
  }
  return getFallbackColor(variableName);
};

/** SSR / pre-hydration fallbacks (dark-theme defaults) */
const getFallbackColor = (variableName: string): string => {
  const fallbacks: Record<string, string> = {
    '--color-brand-primary':      '#61DAFB',
    '--color-brand-secondary':    '#8F5CFF',
    '--color-text-primary':       '#e6e6f8',
    '--color-text-secondary':     'rgba(230, 230, 248, 0.7)',
    '--color-surface-background': '#0a0025',
    '--color-surface-primary':    'rgba(24, 44, 71, 0.8)',
    '--color-border-primary':     'rgba(97, 218, 251, 0.2)',
    '--color-border-secondary':   'rgba(97, 218, 251, 0.3)',
    '--color-success':            '#00CC66',
    '--color-warning':            '#F7C52D',
    '--color-danger':             '#F44336',
    '--color-info':               '#2196F3',
  };
  return fallbacks[variableName] ?? '#61DAFB';
};

/**
 * Reactive chart color palette.
 * Each property is a getter: it reads the live CSS variable on every access,
 * so charts rendered after a theme switch automatically use the correct color.
 */
export const chartColors = {
  get primary()        { return getCSSVariable('--color-brand-primary'); },
  get secondary()      { return getCSSVariable('--color-brand-secondary'); },
  get textPrimary()    { return getCSSVariable('--color-text-primary'); },
  get textSecondary()  { return getCSSVariable('--color-text-secondary'); },
  get background()     { return getCSSVariable('--color-surface-background'); },
  get surfacePrimary() { return getCSSVariable('--color-surface-primary'); },
  get borderPrimary()  { return getCSSVariable('--color-border-primary'); },
  get borderSecondary(){ return getCSSVariable('--color-border-secondary'); },
  get success()        { return getCSSVariable('--color-success'); },
  get warning()        { return getCSSVariable('--color-warning'); },
  get danger()         { return getCSSVariable('--color-danger'); },
  get info()           { return getCSSVariable('--color-info'); },
};

/** Converts a color to rgba with the given opacity. */
export const getColorWithOpacity = (color: string, opacity: number): string => {
  if (color.startsWith('rgba')) {
    return color.replace(/,\s*[\d.]+\)$/, `, ${opacity})`);
  }
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
};

/**
 * Reactive opacity variants.
 * Because the base values come from getters, these helpers also read
 * fresh CSS variables on every call.
 */
export const chartColorsWithOpacity = {
  get primary() {
    const c = chartColors.primary;
    return { solid: c, light: getColorWithOpacity(c, 0.2), medium: getColorWithOpacity(c, 0.5), dark: getColorWithOpacity(c, 0.8) };
  },
  get secondary() {
    const c = chartColors.secondary;
    return { solid: c, light: getColorWithOpacity(c, 0.2), medium: getColorWithOpacity(c, 0.5), dark: getColorWithOpacity(c, 0.8) };
  },
  get success() {
    const c = chartColors.success;
    return { solid: c, light: getColorWithOpacity(c, 0.2), medium: getColorWithOpacity(c, 0.5), dark: getColorWithOpacity(c, 0.8) };
  },
  get warning() {
    const c = chartColors.warning;
    return { solid: c, light: getColorWithOpacity(c, 0.2), medium: getColorWithOpacity(c, 0.5), dark: getColorWithOpacity(c, 0.8) };
  },
};
