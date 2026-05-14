import type { TFunction } from 'i18next';
import type { DiamondShape, JewelryCategory, SettingStyle, SettingType } from '@stonee/shared-types';
import type { MetalColor, MetalType } from '@stonee/shared-types';

export function orderStatusLabel(t: TFunction, status: string): string {
  return t(`orders.status.${status}`, { defaultValue: status });
}

export function cartItemTypeLabel(t: TFunction, type: string): string {
  return t(`orders.cartItemType.${type}`, { defaultValue: type });
}

export function settingCatalogName(t: TFunction, sku: string, fallback: string): string {
  return t(`catalog.settings.${sku}.name`, { defaultValue: fallback });
}

export function jewelryCatalogTitle(t: TFunction, sku: string, fallback: string): string {
  return t(`catalog.jewelry.${sku}.title`, { defaultValue: fallback });
}

export function jewelryCatalogDescription(t: TFunction, sku: string, fallback: string): string {
  return t(`catalog.jewelry.${sku}.description`, { defaultValue: fallback });
}

export function jewelryCatalogCollection(t: TFunction, sku: string, fallback: string): string {
  return t(`catalog.jewelry.${sku}.collectionName`, { defaultValue: fallback });
}

export function settingTypeLabel(t: TFunction, st: SettingType): string {
  return t(`catalog.settingType.${st}.label`);
}

export function settingTypeTagline(t: TFunction, st: SettingType): string {
  return t(`catalog.settingType.${st}.tagline`);
}

export function diamondShapeLabel(t: TFunction, shape: DiamondShape): string {
  return t(`catalog.diamondShape.${shape}`);
}

export function jewelryCategoryLabel(t: TFunction, cat: JewelryCategory): string {
  return t(`catalog.jewelryCategory.${cat}`);
}

export function metalLabel(t: TFunction, metal: MetalType): string {
  return t(`catalog.metal.${metal}`);
}

export function metalColorLabel(t: TFunction, color: MetalColor): string {
  return t(`catalog.metalColor.${color}`);
}

export function settingStyleLabel(t: TFunction, style: SettingStyle): string {
  return t(`catalog.settingStyle.${style}`);
}

/** One line: metal · color tone · setting style (matches former API English tuples). */
export function pieceMetalColorStyleLine(
  t: TFunction,
  metal: MetalType,
  color: MetalColor,
  style: SettingStyle,
): string {
  return [metalLabel(t, metal), metalColorLabel(t, color), settingStyleLabel(t, style)].join(' · ');
}

export function dealBadgeLabel(t: TFunction, badge?: string): string {
  if (!badge) return '';
  const n = badge.toUpperCase().replace(/-/g, ' ');
  if (n.includes('BEST')) return t('marketplace.dealBestValue');
  if (n.includes('FAIR')) return t('marketplace.dealFairDeal');
  if (n.includes('PREMIUM')) return t('marketplace.dealPremiumCut');
  if (n.includes('OVER')) return t('marketplace.dealOverpriced');
  return badge;
}
