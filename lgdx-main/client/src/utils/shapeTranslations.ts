/**
 * Utility functions for translating diamond shapes
 */

import { I18nContextType } from '../i18n'
import { DiamondShape } from '../i18n/types'

/**
 * Translates diamond shape from English to current locale
 * @param shape - The shape string from database (e.g., "Round", "Oval", "Princess")
 * @param t - Translation function from useTranslation hook
 * @returns Translated shape name or original if translation not found
 */
export const translateShape = (shape: DiamondShape | undefined | null, t: I18nContextType['t']): string => {
  if (!shape) return ''

  // Try to get translation from catalog.shapes
  const shapeKey = `catalog.shapes.${shape}` as const
  const translated = t(shapeKey)

  // If translation exists and is different from key, return it
  if (translated && translated !== shapeKey) {
    return translated
  }

  // Fallback to original shape if translation not found
  return shape
}
