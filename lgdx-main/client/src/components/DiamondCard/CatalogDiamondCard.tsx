import React, { useState, useEffect, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import '../../utils/chartInit';
import { useTranslation } from '../../i18n';
import type { I18nContextType } from '../../i18n/types';
import { useNavigate } from '../../routes';
import { Product as BaseProduct } from '../../types';
import { analytics } from '../../utils/analytics';
import { chartColors } from '../../utils/chartColors';
import { getCertificateUrl } from '../../utils/certificateUrls';
import { formatUsd, formatUsdCompact } from '../../utils/currency';
import { formatFluorescenceValue } from '../../utils/fluorescence';
import { shortenGradeValue } from '../../utils/gradeShortcuts';
import { normalizeLocation } from '../../utils/locationMappings';
import { formatMeasurements } from '../../utils/measurements';
import { translateShape } from '../../utils/shapeTranslations';
import { usePriceHistory } from '../../hooks/usePriceHistory';
import { useChartVisibility } from '../../hooks/useChartVisibility';
import { useTheme } from '../../context/ThemeContext';
import Button from '../common/Button/Button';
import { PortalTooltip } from '../common/Tooltip/PortalTooltip';
import CategoryAnalyticsModal from './CategoryAnalyticsModal';
import PriceHistoryModal from './PriceHistoryModal';
import styles from './DiamondCard.module.css';

// Import shape icons - SVG for light theme
import roundIcon from '../../assets/images/1.svg';
import princessIcon from '../../assets/images/2.svg';
import pearIcon from '../../assets/images/3.svg';
import marquiseIcon from '../../assets/images/4.svg';
import radiantIcon from '../../assets/images/5.svg';
import emeraldIcon from '../../assets/images/6.svg';
import ovalIcon from '../../assets/images/7.svg';
import heartIcon from '../../assets/images/8.svg';
import cushionIcon from '../../assets/images/9.svg';
import asscherIcon from '../../assets/images/10.svg';
import baguetteIcon from '../../assets/images/11.svg';
import trillionIcon from '../../assets/images/trillion.svg';

// Import shape icons - PNG for dark theme
import roundIconDark from '../../assets/images/1.png';
import princessIconDark from '../../assets/images/2.png';
import pearIconDark from '../../assets/images/3.png';
import marquiseIconDark from '../../assets/images/4.png';
import radiantIconDark from '../../assets/images/5.png';
import emeraldIconDark from '../../assets/images/6.png';
import ovalIconDark from '../../assets/images/7.png';
import heartIconDark from '../../assets/images/8.png';
import cushionIconDark from '../../assets/images/9.png';
import asscherIconDark from '../../assets/images/10.png';
import baguetteIconDark from '../../assets/images/11.png';
import trillionIconDark from '../../assets/images/trillion.png';

// SHAPE_ICONS mapping - Light theme (SVG)
const SHAPE_ICONS_LIGHT: Record<string, string> = {
  Round: roundIcon,
  Princess: princessIcon,
  Pear: pearIcon,
  Marquise: marquiseIcon,
  Radiant: radiantIcon,
  Emerald: emeraldIcon,
  Oval: ovalIcon,
  Heart: heartIcon,
  Cushion: cushionIcon,
  Asscher: asscherIcon,
  Baguette: baguetteIcon,
  Trillion: trillionIcon,
};

// SHAPE_ICONS mapping - Dark theme (PNG)
const SHAPE_ICONS_DARK: Record<string, string> = {
  Round: roundIconDark,
  Princess: princessIconDark,
  Pear: pearIconDark,
  Marquise: marquiseIconDark,
  Radiant: radiantIconDark,
  Emerald: emeraldIconDark,
  Oval: ovalIconDark,
  Heart: heartIconDark,
  Cushion: cushionIconDark,
  Asscher: asscherIconDark,
  Baguette: baguetteIconDark,
  Trillion: trillionIconDark,
};

// Function to get shape icons based on theme
const getShapeIcons = (theme: 'light' | 'dark'): Record<string, string> => {
  return theme === 'dark' ? SHAPE_ICONS_DARK : SHAPE_ICONS_LIGHT;
};

// Product interface now extends BaseProduct with all diamond-specific properties
// No need for additional interface since all properties are now in BaseProduct
type Product = BaseProduct;

export interface CatalogDiamondCardProps {
  product: Product;
  onFindPair?: (product: Product) => void;
  onViewMedia?: (videoLink: string) => void;
  onAddToCart: (product: Product) => void;
  isProductInCart: boolean;
  onGoToCart: () => void;
  customTitle?: string;
  showActionsBelowImage?: boolean;
  showSliderArrows?: boolean;
  onPreviousProduct?: () => void;
  onNextProduct?: () => void;
  canNavigatePrevious?: boolean;
  canNavigateNext?: boolean;
  isCompanyActive?: boolean; // Новый проп для проверки статуса компании
  isAuthenticated?: boolean; // Проп для проверки аутентификации пользователя
  isLgdealSupervisor?: boolean; // Показывать поставщика (название компании) только супервайзерам LGDEAL
}

// Compact chart options for inline chart display
const getInlineChartOptions = (productTitle: string, t: I18nContextType['t']) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: `${productTitle} - ${t('catalog.marketPriceHistory')}`,
      color: chartColors.primary,
      font: {
        size: 13,
        weight: 'bold' as const,
      },
      padding: {
        top: 10,
        bottom: 20,
      },
    },
    tooltip: {
      enabled: true,
      backgroundColor: chartColors.background,
      titleColor: chartColors.primary,
      bodyColor: chartColors.textPrimary,
      borderColor: chartColors.primary,
      borderWidth: 1,
      callbacks: {
        label: (context: { parsed: { y: number } }) => formatUsd(Number(context.parsed.y))
      }
    }
  },
  scales: {
    y: {
      display: true,
      title: {
        display: true,
        text: t('catalog.pricePerCarat'),
        color: chartColors.primary,
        font: {
          size: 11,
          weight: 'bold' as const,
        },
        padding: {
          top: 0,
          bottom: 10,
        },
      },
      ticks: {
        color: chartColors.textSecondary,
        callback: (value: number | string) => formatUsdCompact(Number(value), 0),
        font: {
          size: 10,
        },
        padding: 5,
      },
      grid: {
        color: chartColors.borderPrimary,
        drawBorder: true,
        borderColor: chartColors.primary,
      },
      beginAtZero: false,
    },
    x: {
      display: true,
      title: {
        display: true,
        text: t('catalog.timePeriod'),
        color: chartColors.primary,
        font: {
          size: 11,
          weight: 'bold' as const,
        },
        padding: {
          top: 10,
          bottom: 0,
        },
      },
      ticks: {
        color: chartColors.textSecondary,
        font: {
          size: 9,
        },
        maxRotation: 0,
        padding: 5,
      },
      grid: {
        display: true,
        color: chartColors.borderSecondary,
        drawBorder: true,
        borderColor: chartColors.primary,
      }
    }
  },
  interaction: {
    intersect: false,
    mode: 'index' as const,
  },
});

const CatalogDiamondCard: React.FC<CatalogDiamondCardProps> = ({ 
  product, 
  onFindPair, 
  onViewMedia, 
  onAddToCart, 
  isProductInCart, 
  onGoToCart,
  customTitle,
  showActionsBelowImage,
  showSliderArrows = false,
  onPreviousProduct,
  onNextProduct,
  canNavigatePrevious = false,
  canNavigateNext = false,
  isCompanyActive = true, // Default to true if not provided
  isAuthenticated = false, // Default to false if not provided
  isLgdealSupervisor = false
}) => {
  const { t, formatCurrency } = useTranslation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [imageError, setImageError] = useState<boolean>(false);

  // Chart modal state for click-to-expand
  const [showChartModal, setShowChartModal] = useState<boolean>(false);
  
  // Category analytics modal state
  const [showCategoryAnalytics, setShowCategoryAnalytics] = useState<boolean>(false);
  
  // Use custom hooks for chart visibility and price history
  const { isChartVisible, chartRef } = useChartVisibility();
  const { priceHistory, isLoading: isHistoryLoading, error: historyError } = usePriceHistory(product, isChartVisible);


  // Reset imageError when product changes to allow retry for a new product image
  useEffect(() => {
    setImageError(false);
  }, [product?.photo]);

  // Reset chart modal when product changes
  useEffect(() => {
    setShowChartModal(false);
  }, [product?._id]);

  // GA4 view_item when product card is shown
  useEffect(() => {
    if (product?._id) {
      analytics.trackViewItem(product);
    }
  }, [product?._id, product?.shape]);

  // Handle chart click to open modal
  const handleChartClick = () => {
    if (priceHistory && !isHistoryLoading && !historyError) {
      setShowChartModal(true);
    }
  };

  // Handle modal close
  const handleCloseChartModal = () => {
    setShowChartModal(false);
  };

  // Handle category analytics modal
  const handleOpenCategoryAnalytics = () => {
    setShowCategoryAnalytics(true);
  };

  const handleCloseCategoryAnalytics = () => {
    setShowCategoryAnalytics(false);
  };

  // Derived card title (null-safe). Kept above the early return so the
  // useMemo that references it runs unconditionally and complies with
  // react-hooks/rules-of-hooks.
  const translatedShape = translateShape(product?.shape, t);
  let cardTitle = `${translatedShape || t('deals.notAvailable')} ${product?.carat || t('deals.notAvailable')}ct ${product?.color || t('deals.notAvailable')} ${product?.clarity || t('deals.notAvailable')}`;
  if (product?.cut) {
    cardTitle += ` ${shortenGradeValue(product.cut)}`;
  }

  // Memoize chart options so Chart.js doesn't rebuild/update on every parent
  // re-render. `theme` is included so colors (read from CSS vars inside
  // getInlineChartOptions → chartColors) refresh on light/dark toggle.
  const inlineChartOptions = useMemo(
    () => getInlineChartOptions(cardTitle, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardTitle, t, theme],
  );

  if (!product) {
    return null;
  }

  const {
    photo,
    shape,
    carat,
    clarity,
    cut,
    polish,
    symmetry,
    measurement1,
    measurement2,
    measurement3,
    fluorescence,
    location,    // e.g., "Antwerp"
    technology,  // e.g., "HPHT"
    videoLink,   // URL to a video
    video,       // Video URL from database
    ratio,       // Ratio value from database
    tableSize,    // Новое поле
    crownHeight,  // Новое поле
    pavilionDepth,// Новое поле
    girdle,       // Новое поле
    culet,        // Новое поле
    totalDepth,    // Новое поле (соответствует totalDepth из данных)
    color,
    intensity,
    overtone,
    certificateNumber,
    certificateInstitute
  } = product;

  const isFancyColor = color && !['D', 'E', 'F', 'G'].includes(color.trim().toUpperCase());

  const formattedMeasurements = formatMeasurements(measurement1, measurement2, measurement3);

  const handleImageError = (): void => {
    setImageError(true);
  };

  // Убрали обработчик шиммера


  const cardClasses = `${styles['diamond-card']} ${styles['main-display']}`;
  const SHAPE_ICONS = getShapeIcons(theme);
  const fallbackIcon = shape ? SHAPE_ICONS[shape] : undefined;

  // Функция для рендера секции цен с блюром для неактивных компаний или незарегистрированных пользователей
  const renderPriceSection = () => {
    // Если пользователь не зарегистрирован, показываем плашку регистрации
    if (!isAuthenticated) {
      return (
        <div className={styles['price-blurred-section']}>
          <div className={styles['price-blurred-overlay']}>
            <div className={styles['contact-sales-message']}>
              <i className="fas fa-user-plus"></i>
              <span>{t('catalog.registerToSeePrices')}</span>
              <Button 
                variant="primary" 
                size="sm"
                onClick={() => {
                  navigate('/register');
                }}
              >
                {t('auth.register')}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Если компания неактивна, показываем плашку контакта
    if (!isCompanyActive) {
      return (
        <div className={styles['price-blurred-section']}>
          <div className={styles['price-blurred-overlay']}>
            <div className={styles['contact-sales-message']}>
              <i className="fas fa-lock"></i>
              <span>{t('catalog.contactForPricing')}</span>
              <Button variant="secondary" size="sm">
                {t('catalog.getQuote')}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles['detail-group']}>
        <div className={styles['group-header']}>
          <i className="fas fa-dollar-sign"></i>
          <span>{t('catalog.marketPricing')}</span>
        </div>
        <div className={`${styles['group-content']} ${styles['price-group-content']}`}>
          <div className={`${styles['detail-item']} ${styles['price-per-carat-main']} ${styles['full-width']}`}>  
            <span className={styles['detail-label']}>
              <PortalTooltip content="Our real-time, data-driven market prices are based on the recent transactions, market demand and actual trends. We track, process and update pricing reflecting the latest market shifts.">
                {t('catalog.marketPPC')}
                <i className="fas fa-info-circle"></i>
              </PortalTooltip>
            </span>  
            <span className={styles['price-value']}>
              {product.marketPricePerCarat ? formatCurrency(product.marketPricePerCarat) : t('deals.notAvailable')}
            </span>  
          </div>  
          <div className={`${styles['detail-item']} ${styles['market-price-main']} ${styles['full-width']}`}>  
            <span className={styles['detail-label']}>
              <PortalTooltip content="Our real-time, data-driven market prices are based on the recent transactions, market demand and actual trends. We track, process and update pricing reflecting the latest market shifts.">
                {t('catalog.marketPrice')}
                <i className="fas fa-info-circle"></i>
              </PortalTooltip>
            </span>  
            <span className={styles['price-value']}>
              {product.marketPrice ? formatCurrency(product.marketPrice) : t('deals.notAvailable')}
            </span>  
          </div>
          {isLgdealSupervisor && (
            <>
              <div className={`${styles['detail-item']} ${styles['full-width']}`}>
                <span className={styles['detail-label']}>{t('catalog.supplierPricePerCarat')}</span>
                <span className={styles['price-value']}>
                  {product.pricePerCarat != null ? formatCurrency(product.pricePerCarat) : t('deals.notAvailable')}
                </span>
              </div>
              <div className={`${styles['detail-item']} ${styles['full-width']}`}>
                <span className={styles['detail-label']}>{t('catalog.supplierPrice')}</span>
                <span className={styles['price-value']}>
                  {product.price != null ? formatCurrency(product.price) : t('deals.notAvailable')}
                </span>
              </div>
            </>
          )}
          <p className={styles['tariffs-note']} aria-label={t('common.tariffsNotIncluded')}>
            {t('common.tariffsNotIncluded')}
          </p>
        </div>
      </div>
    );
  };

  // Generate Schema.org structured data for SEO
  const productStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${shape || 'Diamond'} ${carat ? `${carat}ct` : ''} ${color || ''} ${clarity || ''}`.trim(),
    description: `${shape || 'Lab-grown diamond'}${carat ? `, ${carat} carat` : ''}${color ? `, Color: ${color}` : ''}${clarity ? `, Clarity: ${clarity}` : ''}${cut ? `, Cut: ${cut}` : ''}${certificateInstitute && certificateNumber ? `, Certified by ${certificateInstitute} (${certificateNumber})` : ''}`,
    image: photo ? (photo.startsWith('http') ? photo : `${window.location.origin}${photo}`) : undefined,
    brand: {
      '@type': 'Brand',
      name: 'LGDeal INC'
    },
    category: 'Lab-Grown Diamond',
    offers: {
      '@type': 'Offer',
      price: product.marketPrice || product.price || 0,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: (typeof product.company === 'object' && product.company?.name) || 'LGDeal INC'
      }
    },
    aggregateRating: product.marketPrice ? {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '250',
      bestRating: '5',
      worstRating: '1'
    } : undefined,
    additionalProperty: [
      ...(shape ? [{ '@type': 'PropertyValue', name: 'Shape', value: shape }] : []),
      ...(carat ? [{ '@type': 'PropertyValue', name: 'Carat', value: String(carat) }] : []),
      ...(color ? [{ '@type': 'PropertyValue', name: 'Color', value: color }] : []),
      ...(clarity ? [{ '@type': 'PropertyValue', name: 'Clarity', value: clarity }] : []),
      ...(cut ? [{ '@type': 'PropertyValue', name: 'Cut', value: cut }] : []),
      ...(polish ? [{ '@type': 'PropertyValue', name: 'Polish', value: polish }] : []),
      ...(symmetry ? [{ '@type': 'PropertyValue', name: 'Symmetry', value: symmetry }] : []),
      ...(certificateInstitute ? [{ '@type': 'PropertyValue', name: 'Certification Laboratory', value: certificateInstitute }] : []),
      ...(certificateNumber ? [{ '@type': 'PropertyValue', name: 'Certificate Number', value: certificateNumber }] : []),
      ...(location ? [{ '@type': 'PropertyValue', name: 'Location', value: location }] : [])
    ].filter(Boolean)
  };

  return (
    <>
      {/* Schema.org structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productStructuredData) }}
      />
      <div className={cardClasses}>
        {/* Main card content */}
        <div className={styles['card-content-wrapper']}>
        {customTitle && (
          <div className={styles['diamond-custom-title']}>
            {showSliderArrows && (
              <div className={styles['title-with-arrows']}>
                <button
                  className={styles['slider-arrow']}
                  onClick={onPreviousProduct}
                  disabled={!canNavigatePrevious}
                  aria-label={t('catalog.previousProduct')}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.5 19L9.5 12L15.5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <span className={styles['custom-title-text']}>{customTitle}</span>
                <button
                  className={styles['slider-arrow']}
                  onClick={onNextProduct}
                  disabled={!canNavigateNext}
                  aria-label={t('catalog.nextProduct')}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8.5 5L14.5 12L8.5 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
            {!showSliderArrows && (
              <span className={styles['custom-title-text']}>{customTitle}</span>
            )}
          </div>
        )}
        <div className={styles['diamond-title-section']}>
          <div className={styles['diamond-main-title-centered']}>
            <span
              className={styles['clickable-title']}
              onClick={handleOpenCategoryAnalytics}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenCategoryAnalytics();
                }
              }}
              title={t('catalog.clickToViewAnalytics')}
            >
              {cardTitle}
            </span>
            {(certificateInstitute || certificateNumber) && (
              <>
                <span className={styles['title-separator']}></span>
                {certificateInstitute && (
                  <span className={styles['certificate-info']}>
                    {certificateInstitute}
                  </span>
                )}
                {certificateNumber && (
                  <span className={styles['certificate-info']}>
                    {certificateInstitute && getCertificateUrl(certificateInstitute, certificateNumber) ? (
                      <a 
                        href={getCertificateUrl(certificateInstitute, certificateNumber)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles['certificate-link']}
                        title={t('catalog.verifyCertificateOn', { lab: certificateInstitute })}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {certificateNumber}
                      </a>
                    ) : (
                      certificateNumber
                    )}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      <div className={styles['diamond-card-content']}>
        <div className={styles['main-diamond-left']}>
          <div>
            <div className={styles['main-diamond-image-container']}>
              {photo && !imageError ? (
                <img 
                  src={photo} 
                  alt={`${shape} diamond`} 
                  className={styles['main-diamond-image']} 
                  onError={handleImageError} 
                />
              ) : fallbackIcon ? (
                <img src={fallbackIcon} alt={`${shape} icon`} className={`${styles['main-diamond-image']} ${styles['diamond-shape-fallback']}`} />
              ) : (
                <div className={styles['main-diamond-image-placeholder']}>{t('catalog.noImage')}</div>
              )}
            </div>
          </div>
          {/* Technology, Location, and Supplier (for LGDEAL supervisors) - positioned between image and buttons */}
          {(technology || location || (isLgdealSupervisor && (typeof product.company === 'object' && product.company?.name))) && (
            <div className={styles['tech-location-section']}>
              {technology && (
                <div className={styles['detail-item']}>
                  <span className={styles['detail-label']}>{t('catalog.technology')}</span>
                  <span className={styles['detail-value']}>{technology}</span>
                </div>
              )}
              {location && (
                <div className={styles['detail-item']}>
                  <span className={styles['detail-label']}>{t('catalog.location')}</span>
                  <span className={styles['detail-value']}>{normalizeLocation(location)}</span>
                </div>
              )}
              {isLgdealSupervisor && typeof product.company === 'object' && product.company?.name && (
                <div className={styles['detail-item']}>
                  <span className={styles['detail-label']}>{t('catalog.supplier')}</span>
                  <span className={styles['detail-value']}>{product.company.name}</span>
                </div>
              )}
            </div>
          )}
          {showActionsBelowImage && (
            <div className={`${styles['actions-section']} ${styles['actions-below-image']}`}>
              <div className={styles['actions-section']}>  
                {(video || videoLink) && (  
                  <Button  
                    variant="secondary"  
                    onClick={() => onViewMedia && onViewMedia(video || videoLink || '')}  
                  >  
                    <i className={`fas fa-play-circle ${styles['btn-icon--left']}`}></i>  
                    {t('catalog.viewVideo')}
                  </Button>  
                )}  
                <Button  
                  variant="primary"  
                  onClick={() => onFindPair && onFindPair(product)}  
                >  
                  <i className={`fas fa-search ${styles['btn-icon--left']}`}></i>  
                  {t('catalog.findPerfectPair')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className={styles['main-diamond-details']}>
          {renderPriceSection()}

          {/* Add to Cart button - moved below Market Pricing - only show for authenticated users */}
          {isAuthenticated && (
            <div className={styles['add-to-cart-section']}>
              {isProductInCart ? (  
                <Button  
                  variant="success"  
                  onClick={() => onGoToCart && onGoToCart()}  
                >  
                  <i className={`fas fa-shopping-cart ${styles['btn-icon--left']}`}></i>  
                  {t('catalog.goToCart')}
                </Button>  
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    analytics.trackAddToCart(product, 1);
                    onAddToCart && onAddToCart(product);
                  }}
                >
                  <i className={`fas fa-cart-plus ${styles['btn-icon--left']}`}></i>
                  {t('catalog.addToCart')}
                </Button>
              )}
            </div>
          )}

          {/* Historical price chart – only for white (D–G) stones; hidden for fancy/colored */}
          {!isFancyColor && (
          <div
            ref={chartRef}
            className={`${styles['price-history-chart-container']} ${priceHistory && !isHistoryLoading && !historyError ? styles['chart-clickable'] : ''}`}
            onClick={handleChartClick}
            role={priceHistory && !isHistoryLoading && !historyError ? "button" : undefined}
            tabIndex={priceHistory && !isHistoryLoading && !historyError ? 0 : undefined}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && priceHistory && !isHistoryLoading && !historyError) {
                e.preventDefault();
                handleChartClick();
              }
            }}
          >
            {!isChartVisible && (
              <div className={styles['chart-lazy-loading']}>
                <div className={styles['chart-placeholder']}>
                  <i className="fas fa-chart-line"></i>
                  <span>{t('catalog.marketAnalytics')}</span>
                  <small>{t('catalog.marketAnalyticsDescription')}</small>
                </div>
              </div>
            )}
            {isChartVisible && isHistoryLoading && <div className={styles['chart-loading-overlay']}>
              <i className="fas fa-spinner"></i>
              <span>{t('catalog.loadingMarketData')}</span>
            </div>}
            {isChartVisible && historyError && <div className={styles['chart-error-overlay']}>
              <i className="fas fa-exclamation-triangle"></i>
              <span>{t('catalog.unableToLoadMarketData')}</span>
            </div>}
            {isChartVisible && !isHistoryLoading && !historyError && priceHistory && (
              <>
                <Line options={inlineChartOptions} data={priceHistory} />
                <div className={styles['chart-interaction-hint']}>
                  <i className="fas fa-mouse-pointer"></i>
                  <span>{t('catalog.clickToExpandChart')}</span>
                </div>
              </>
            )}
            {isChartVisible && !isHistoryLoading && !historyError && !priceHistory && (
              <div className={styles['chart-no-data-overlay']}>
                <i className="fas fa-database"></i>
                <span>{t('catalog.noHistoricalData')}</span>
                <small>{t('catalog.noHistoricalDataDescription')}</small>
              </div>
            )}
          </div>
          )}

          <div className={`${styles['additional-details']} ${styles['single-column-details']}`}>
            {/* Measurements & Proportions Group */}
            <div className={styles['detail-group']}>
              <div className={styles['group-header']}>
                <i className="fas fa-ruler-combined"></i>
                <span>{t('catalog.measurementsAndProportions')}</span>
              </div>
              <div className={styles['group-content']}>
                {formattedMeasurements && (  
                  <div className={`${styles['detail-item']} ${styles['full-width']} ${styles['detail-wide']}`}>  
                    <span className={styles['detail-label']} title={t('catalog.measurements')}>{t('catalog.measurements')}</span>  
                    <span className={styles['detail-value']}>{formattedMeasurements}</span>  
                  </div>  
                )}
                {ratio !== undefined && ratio !== null && ratio > 0 && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']} title={t('catalog.ratio')}>{t('catalog.ratio')}</span>  
                    <span className={styles['detail-value']}>{ratio.toFixed(2)}</span>  
                  </div>  
                )}
                {tableSize !== undefined && tableSize !== null && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']} title={t('catalog.tableSize')}>{t('catalog.tableSize')}</span>  
                    <span className={styles['detail-value']}>{tableSize}%</span>  
                  </div>  
                )}
                {totalDepth !== undefined && totalDepth !== null && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']} title={t('catalog.totalDepth')}>{t('catalog.totalDepth')}</span>  
                    <span className={styles['detail-value']}>{totalDepth}%</span>  
                  </div>  
                )}
                {crownHeight !== undefined && crownHeight !== null && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']} title={t('catalog.crownHeight')}>{t('catalog.crownHeight')}</span>  
                    <span className={styles['detail-value']}>{crownHeight}%</span>  
                  </div>  
                )}
                {pavilionDepth !== undefined && pavilionDepth !== null && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']} title={t('catalog.pavilionDepth')}>{t('catalog.pavilionDepth')}</span>  
                    <span className={styles['detail-value']}>{pavilionDepth}%</span>  
                  </div>  
                )}
              </div>
            </div>

            {/* Fancy color: Intensity & Overtone – only for colored stones */}
            {isFancyColor && (intensity || overtone) && (
              <div className={styles['detail-group']}>
                <div className={styles['group-header']}>
                  <i className="fas fa-palette"></i>
                  <span>{t('catalog.intensityAndOvertone')}</span>
                </div>
                <div className={styles['group-content']}>
                  {intensity && (
                    <div className={styles['detail-item']}>
                      <span className={styles['detail-label']}>{t('catalog.intensity')}</span>
                      <span className={styles['detail-value']}>{intensity}</span>
                    </div>
                  )}
                  {overtone && (
                    <div className={styles['detail-item']}>
                      <span className={styles['detail-label']}>{t('catalog.overtone')}</span>
                      <span className={styles['detail-value']}>{overtone}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quality & Finish Group */}
            <div className={styles['detail-group']}>
              <div className={styles['group-header']}>
                <i className="fas fa-gem"></i>
                <span>{t('catalog.qualityAndFinish')}</span>
              </div>
              <div className={styles['group-content']}>
                {polish && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']}>{t('catalog.polish')}</span>  
                    <span className={styles['detail-value']}>{shortenGradeValue(polish)}</span>  
                  </div>  
                )}
                {symmetry && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']} title={t('catalog.symmetry')}>{t('catalog.symmetry')}</span>  
                    <span className={styles['detail-value']}>{shortenGradeValue(symmetry)}</span>  
                  </div>  
                )}
                {fluorescence && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']} title={t('catalog.fluorescence')}>{t('catalog.fluorescence')}</span>  
                    <span className={styles['detail-value']}>{formatFluorescenceValue(fluorescence)}</span>  
                  </div>  
                )}
                {girdle && (  
                  <div className={`${styles['detail-item']} ${styles['full-width']} ${styles['detail-wide']}`}>  
                    <span className={styles['detail-label']}>{t('catalog.girdle')}</span>  
                    <span className={styles['detail-value']} title={girdle}>
                      {girdle}
                    </span>  
                  </div>  
                )}
                {culet && (  
                  <div className={styles['detail-item']}>  
                    <span className={styles['detail-label']}>{t('catalog.culet')}</span>  
                    <span className={styles['detail-value']}>{culet}</span>  
                  </div>  
                )}
              </div>
            </div>
          </div>  
        </div>
        </div>
      </div>

      {/* Price History Modal */}
      <PriceHistoryModal
        isOpen={showChartModal}
        onClose={handleCloseChartModal}
        priceHistory={priceHistory}
        isLoading={isHistoryLoading}
        error={historyError}
        productTitle={cardTitle}
      />

      {/* Category Analytics Modal */}
      <CategoryAnalyticsModal
        isOpen={showCategoryAnalytics}
        onClose={handleCloseCategoryAnalytics}
        category={{
          shape: shape || t('deals.notAvailable'), // Используем оригинальную форму для API запроса
          weight: carat ? `${carat}ct` : t('deals.notAvailable'),
          clarity: clarity || t('deals.notAvailable'),
          color: color || t('deals.notAvailable')
        }}
        displayShape={translatedShape || t('deals.notAvailable')} // Переведенная форма для отображения
      />
    </div>
    </>
  );
};

export default CatalogDiamondCard;