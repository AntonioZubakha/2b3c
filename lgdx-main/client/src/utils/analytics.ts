// ==========================================================================
// ANALYTICS — GA4-oriented (gtag) + internal logging
// B2B funnel: view_item → add_to_cart → view_cart → begin_checkout → generate_lead (deal)
// Mark in GA4 Admin: generate_lead, add_to_cart, begin_checkout as Key events where relevant.
// ==========================================================================

import { logger } from './logger';
import { config } from '../config/environment';
import type { Product } from '../types';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const DEFAULT_CURRENCY = 'USD';

function getGaMeasurementId(): string | undefined {
  const id = process.env.REACT_APP_GA_MEASUREMENT_ID?.trim();
  return id || undefined;
}

/** Drop undefined values so gtag does not receive noisy keys */
function compactParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/** Fire GA4 event when analytics enabled and gtag present */
function gtagEvent(eventName: string, params?: Record<string, unknown>): void {
  if (!config.enableAnalytics || typeof window.gtag === 'undefined') return;
  window.gtag('event', eventName, params ? compactParams(params) : {});
}

// ==========================================================================
// GA4 item builder (Enhanced Ecommerce style)
// ==========================================================================

export function buildGa4ItemFromProduct(product: Product, quantity = 1): Record<string, unknown> {
  const price =
    product.price ??
    product.marketPrice ??
    (product.pricePerCarat != null && product.carat != null
      ? product.pricePerCarat * product.carat
      : undefined) ??
    (product.marketPricePerCarat != null && product.carat != null
      ? product.marketPricePerCarat * product.carat
      : undefined);
  const itemName =
    [product.shape, product.carat != null ? `${product.carat}ct` : '', product.color, product.clarity]
      .filter(Boolean)
      .join(' ')
      .trim() || 'diamond';
  return compactParams({
    item_id: product._id,
    item_name: itemName,
    item_category: product.shape || 'diamond',
    price: price ?? 0,
    quantity
  });
}

function sumItemsValue(items: Array<Record<string, unknown>>): number {
  let v = 0;
  for (const it of items) {
    const p = Number(it.price);
    const q = Number(it.quantity) || 1;
    if (!Number.isNaN(p)) v += p * q;
  }
  return Math.round(v * 100) / 100;
}

// ==========================================================================
// ANALYTICS CLASS
// ==========================================================================

interface AnalyticsEvent {
  event: string;
  category?: string;
  action?: string;
  label?: string;
  value?: number;
  properties?: Record<string, unknown>;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
}

interface PageView {
  path: string;
  title: string;
  referrer?: string;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
}

class Analytics {
  private sessionId: string;
  private userId?: string;
  private isEnabled: boolean;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.isEnabled = config.enableAnalytics;
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  setUserId(userId: string | undefined) {
    this.userId = userId || undefined;
  }

  /**
   * GA4 User-ID — stable pseudonymous id (Mongo ObjectId). Clears on logout.
   * https://support.google.com/analytics/answer/9213390
   */
  setGaUserId(userId: string | null): void {
    if (!this.isEnabled || typeof window.gtag === 'undefined') return;
    const mid = getGaMeasurementId();
    if (!mid) return;
    if (userId) {
      window.gtag('config', mid, { user_id: userId });
    } else {
      window.gtag('config', mid, { user_id: null });
    }
  }

  // --------------------------------------------------------------------------
  // Legacy / internal event (custom names)
  // --------------------------------------------------------------------------

  trackEvent(event: AnalyticsEvent) {
    if (!this.isEnabled) return;

    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      userId: event.userId || this.userId,
      sessionId: event.sessionId || this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', enrichedEvent.event, {
        event_category: enrichedEvent.category,
        event_label: enrichedEvent.label,
        value: enrichedEvent.value,
        ...enrichedEvent.properties
      });
    }

    logger.info('Analytics Event', enrichedEvent);
  }

  trackPageView(pageView: PageView) {
    if (!this.isEnabled) return;

    const enrichedPageView = {
      ...pageView,
      timestamp: pageView.timestamp || Date.now(),
      userId: pageView.userId || this.userId,
      sessionId: pageView.sessionId || this.sessionId,
      referrer: pageView.referrer || document.referrer
    };

    if (typeof window.gtag !== 'undefined') {
      const gaMeasurementId = getGaMeasurementId();
      if (gaMeasurementId) {
        window.gtag('config', gaMeasurementId, {
          page_path: enrichedPageView.path,
          page_title: enrichedPageView.title
        });
      }
    }

    logger.info('Page View', enrichedPageView);
  }

  // --------------------------------------------------------------------------
  // GA4 recommended — auth
  // --------------------------------------------------------------------------

  trackLogin(method = 'email_or_phone') {
    if (!this.isEnabled) return;
    gtagEvent('login', { method });
  }

  trackSignUp(method = 'email_or_phone') {
    if (!this.isEnabled) return;
    gtagEvent('sign_up', { method });
  }

  // --------------------------------------------------------------------------
  // GA4 recommended — catalog & cart
  // --------------------------------------------------------------------------

  /** GA4 view_item — product card visible / tracked when card mounts */
  trackViewItem(product: Product) {
    if (!this.isEnabled) return;
    const item = buildGa4ItemFromProduct(product, 1);
    const value = Number(item.price) || 0;
    gtagEvent('view_item', {
      currency: DEFAULT_CURRENCY,
      value,
      items: [item]
    });
  }

  /** GA4 add_to_cart */
  trackAddToCart(product: Product, quantity = 1) {
    if (!this.isEnabled) return;
    const item = buildGa4ItemFromProduct(product, quantity);
    const value = sumItemsValue([item]);
    gtagEvent('add_to_cart', {
      currency: DEFAULT_CURRENCY,
      value,
      items: [item]
    });
  }

  /** GA4 add_to_cart — remove line item */
  trackRemoveFromCart(product: Product, quantity = 1) {
    if (!this.isEnabled) return;
    const item = buildGa4ItemFromProduct(product, quantity);
    const value = sumItemsValue([item]);
    gtagEvent('remove_from_cart', {
      currency: DEFAULT_CURRENCY,
      value,
      items: [item]
    });
  }

  /** GA4 search — uses search_term */
  trackSearchGA4(searchTerm: string, resultsCount?: number) {
    if (!this.isEnabled) return;
    gtagEvent('search', {
      search_term: searchTerm,
      ...(resultsCount != null ? { results_count: resultsCount } : {})
    });
  }

  /** GA4 view_cart — full cart snapshot */
  trackViewCart(products: Product[]) {
    if (!this.isEnabled || products.length === 0) return;
    const items = products.map((p) => buildGa4ItemFromProduct(p, 1));
    const value = sumItemsValue(items);
    gtagEvent('view_cart', {
      currency: DEFAULT_CURRENCY,
      value,
      items
    });
  }

  /**
   * User committed to checkout (Create deal) — after validation, before API.
   * GA4 begin_checkout
   */
  trackBeginCheckout(products: Product[], totalValue?: number) {
    if (!this.isEnabled || products.length === 0) return;
    const items = products.map((p) => buildGa4ItemFromProduct(p, 1));
    const value = totalValue ?? sumItemsValue(items);
    gtagEvent('begin_checkout', {
      currency: DEFAULT_CURRENCY,
      value,
      items
    });
  }

  /**
   * Deal created from cart — B2B lead. Mark as Key event in GA4.
   * Uses generate_lead + custom deal_initiated for Explore / BigQuery.
   */
  trackDealInitiated(dealId: string, value: number, itemCount: number) {
    if (!this.isEnabled) return;
    gtagEvent('generate_lead', {
      currency: DEFAULT_CURRENCY,
      value,
      lead_source: 'cart_checkout',
      deal_id: dealId,
      items_in_deal: itemCount
    });
    gtagEvent('deal_initiated', {
      currency: DEFAULT_CURRENCY,
      value,
      deal_id: dealId,
      items_in_deal: itemCount
    });
  }

  /** Support widget opened (custom — mark as Key event if desired) */
  trackSupportChatOpen(source: 'toggle' | 'onboarding_auto' = 'toggle') {
    if (!this.isEnabled) return;
    gtagEvent('support_chat_open', { chat_source: source });
  }

  trackUserInteraction(action: string, element: string, value?: unknown) {
    this.trackEvent({
      event: 'user_interaction',
      category: 'engagement',
      action,
      label: element,
      value: typeof value === 'number' ? value : undefined,
      properties: { element, value }
    });
  }

  trackButtonClick(buttonName: string, page?: string) {
    this.trackUserInteraction('click', buttonName, page);
  }

  trackFormSubmission(formName: string, success: boolean) {
    this.trackEvent({
      event: 'form_submission',
      category: 'engagement',
      action: success ? 'success' : 'error',
      label: formName,
      properties: { formName, success }
    });
  }

  trackError(error: Error, context?: Record<string, unknown>) {
    this.trackEvent({
      event: 'error',
      category: 'error',
      action: 'occurred',
      label: error.message,
      properties: {
        errorName: error.name,
        errorStack: error.stack,
        context
      }
    });
  }

  trackPerformance(metric: string, value: number, context?: Record<string, unknown>) {
    this.trackEvent({
      event: 'performance',
      category: 'performance',
      action: metric,
      value,
      properties: context
    });
  }

  /** @deprecated Use trackViewItem + GA4 events */
  trackDealCreated(dealId: string, amount: number, dealType: string) {
    this.trackEvent({
      event: 'deal_created',
      category: 'business',
      action: 'created',
      label: dealType,
      value: amount,
      properties: { dealId, dealType, amount }
    });
  }

  /** @deprecated Use trackViewItem */
  trackProductViewed(productId: string, category: string) {
    this.trackEvent({
      event: 'product_viewed',
      category: 'engagement',
      action: 'viewed',
      label: category,
      properties: { productId, category }
    });
  }

  /** @deprecated Use trackSearchGA4 */
  trackSearch(query: string, resultsCount: number) {
    this.trackSearchGA4(query, resultsCount);
  }

  trackSessionEnd(duration: number) {
    this.trackEvent({
      event: 'session_end',
      category: 'session',
      action: 'ended',
      value: duration,
      properties: {
        sessionId: this.sessionId,
        duration
      }
    });
  }
}

export const performanceMonitor = {
  trackPageLoad: () => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            analytics.trackPerformance('page_load_time', navigation.loadEventEnd - navigation.loadEventStart);
            analytics.trackPerformance('dom_content_loaded', navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart);
          }
        }, 0);
      });
    }
  },

  trackUserTiming: (name: string, startTime: number) => {
    const duration = performance.now() - startTime;
    analytics.trackPerformance(name, duration);
  }
};

export const analytics = new Analytics();

if (typeof window !== 'undefined') {
  performanceMonitor.trackPageLoad();
}
