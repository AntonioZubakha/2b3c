import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import '../../utils/chartInit';
import { useTranslation } from '../../i18n';
import { Product as BaseProduct } from '../../types';
import {
  ClarityCategory,
  ColorCategoryEnum,
  determineWeightCategory,
  determineShapeCategory
} from '../../types/constants';
import { getPriceHistory } from '../../api/categoryStatsApi';
import { chartColors, chartColorsWithOpacity } from '../../utils/chartColors';
import { formatUsd } from '../../utils/currency';
import { translateShape } from '../../utils/shapeTranslations';
import { useTheme } from '../../context/ThemeContext';
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

interface Product extends BaseProduct {
  // Дополнительные поля из полной типизации
  sku?: string;
  stockNumber?: string;
  customId?: string;
  certificateId?: string;
  stoneType?: string;
  overtone?: string;
  intensity?: string;
  ha?: string; // Hearts & Arrows
  discount?: number;
  measurements?: string;
  reportLink?: string;
  image360?: string;
  description?: string;
  notes?: string;
  comment?: string;
  details?: string;
  lotNumber?: string;
  additionalInfo?: string;
  lastSync?: string;
  // Поля статуса
  sold?: boolean;
  onDeal?: boolean;
  // Медиа поля
  video?: string;
  // Существующие поля
  photo?: string;
  measurement1?: number;
  measurement2?: number;
  measurement3?: number;
  location?: string;
  technology?: string;
  stockNum?: string;
  tableSize?: number;
  crownHeight?: number;
  pavilionDepth?: number;
  girdle?: string;
  culet?: string;
  totalDepth?: number;
}

export interface InventoryDiamondCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  isProductInCart: boolean;
  onGoToCart: () => void;
}

// Chart options will be defined inside component to use translations

const shortenGradeValue = (value: string | undefined): string => {
  if (!value) return 'N/A';
  
  const gradeMap: { [key: string]: string } = {
    'EXCELLENT': 'EX',
    'VERY GOOD': 'VG',
    'GOOD': 'G',
    'FAIR': 'F',
  };

  return gradeMap[value.toUpperCase()] || value;
};

const formatFluorescenceValue = (value: string | undefined): string => {
  if (!value) return 'N/A';
  
  // Заменяем NONE на NO для лучшего отображения
  if (value.toUpperCase() === 'NONE') {
    return 'NO';
  }
  
  return value;
};

const formatValue = (value: unknown, unit?: string): string => {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'number') {
    if (unit === '$') return `$ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (value === 0 && unit !== '$') return `0${unit || ''}`;
    return unit ? `${value.toLocaleString()}${unit}` : value.toLocaleString();
  }
  return String(value);
};

const InventoryDiamondCard: React.FC<InventoryDiamondCardProps> = ({ 
  product
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [imageError, setImageError] = useState<boolean>(false);
  const [priceHistory, setPriceHistory] = useState<ChartData<'line'> | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Chart options with translations
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: t('catalog.marketPriceHistory'),
        color: chartColors.primary,
        font: {
          size: 14,
        },
        padding: {
          top: 10,
          bottom: 20,
        }
      },
      tooltip: {
        backgroundColor: chartColors.background,
        titleColor: chartColors.primary,
        bodyColor: chartColors.textPrimary,
        borderColor: chartColors.primary,
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        ticks: {
          color: chartColors.textSecondary,
          callback: (value) => formatUsd(Number(value))
        },
        grid: {
          color: chartColors.borderPrimary,
        },
        title: {
          display: true,
          text: t('catalog.pricePerCarat'),
          color: chartColors.primary,
        },
        beginAtZero: false,
      },
      x: {
        ticks: {
          color: chartColors.textSecondary,
        },
        grid: {
          color: chartColors.borderSecondary,
        },
        title: {
          display: true,
          text: t('catalog.timePeriod'),
          color: chartColors.primary,
        },
      }
    }
  };

  // Reset imageError when product changes to allow retry for a new product image
  useEffect(() => {
    setImageError(false);
  }, [product?.photo]);

  useEffect(() => {
    if (!product) {
      return;
    }

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      setHistoryError(null);
      setPriceHistory(null);

      try {
        const { carat, shape, clarity, color } = product;

        if (!carat || !shape || !clarity || !color) {
          // Silently exit, will result in "no history" message
          setIsHistoryLoading(false);
          return;
        }
        
        // Check if the product's category is one that is tracked for stats
        const isTrackedClarity = Object.values(ClarityCategory).includes(clarity as ClarityCategory);
        const isTrackedColor = Object.values(ColorCategoryEnum).includes(color as ColorCategoryEnum);
        
        if (!isTrackedClarity || !isTrackedColor) {
            // This category is not tracked, so no history will be available.
            // We can set the state directly and skip the API calls.
            setPriceHistory(null);
            setIsHistoryLoading(false);
            return; 
        }

        const weightCategory = determineWeightCategory(carat);
        const shapeCategory = determineShapeCategory(shape);
        
        const historyData = await getPriceHistory({
          shape: shapeCategory,
          weight: weightCategory,
          clarity,
          color,
          days: 10
        });

        if (historyData.length > 0) {
            const priceMap = new Map<string, number>();
            historyData.forEach(stat => {
                if (stat.marketPricePerCarat) {
                    const dateStr = stat.date.split('T')[0]; // e.g. "2025-06-07"
                    
                    // Kludge as requested: shift server date by +1 day.
                    // This assumes server data for day X is timestamped as day X-1.
                    const parts = dateStr.split('-').map(Number);
                    // Create date as UTC to avoid timezone shifts
                    const correctDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])); 
                    correctDate.setUTCDate(correctDate.getUTCDate() + 1);
                    
                    const dateKey = `${correctDate.getUTCFullYear()}-${String(correctDate.getUTCMonth() + 1).padStart(2, '0')}-${String(correctDate.getUTCDate()).padStart(2, '0')}`;

                    priceMap.set(dateKey, stat.marketPricePerCarat);
                }
            });

            const labels: string[] = [];
            const dataPoints: (number | null)[] = [];
            const today = new Date();
            
            for (let i = 9; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                
                dataPoints.push(priceMap.get(dateKey) || null);
            }



            if (dataPoints.every(p => p === null)) {
                setPriceHistory(null);
            } else {
                setPriceHistory({
                    labels,
                    datasets: [
                      {
                        label: t('catalog.marketPriceHistory'),
                        data: dataPoints,
                        borderColor: chartColors.primary,
                        backgroundColor: chartColorsWithOpacity.primary.light,
                        pointBackgroundColor: chartColors.primary,
                        pointBorderColor: chartColors.surfacePrimary,
                        pointHoverBackgroundColor: chartColors.surfacePrimary,
                        pointHoverBorderColor: chartColors.primary,
                        tension: 0.3,
                        fill: true,
                        spanGaps: true,
                      },
                    ],
                });
            }
        } else {
          setPriceHistory(null);
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t('catalog.couldNotLoadPriceHistory');
        setHistoryError(errorMessage);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [product, t]);

  if (!product) {
    return null;
  }

  const {
    // Основные идентификаторы
    sku,
    stockNumber,
    stockNum,
    customId,
    certificateId,
    certificateNumber,
    certificateInstitute,
    
    // Основные характеристики
    shape,
    carat,
    color,
    clarity,
    cut,
    polish,
    symmetry,
    fluorescence,
    lab,
    
    // Ценовая информация
    price,
    pricePerCarat,
    marketPrice,
    marketPricePerCarat,
    discount,
    
    // Измерения
    measurement1,
    measurement2,
    measurement3,
    measurements,
    ratio,
    tableSize,
    totalDepth,
    crownHeight,
    pavilionDepth,
    girdle,
    culet,
    
    // Статус и состояние
    status,
    sold,
    onDeal,
    
    // Медиа
    photo,
    videoLink,
    video,
    certificateLink,
    reportLink,
    image360,
    
    // Дополнительная информация
    location,
    technology,
    stoneType,
    overtone,
    intensity,
    ha,
    description,
    notes,
    comment,
    details,
    lotNumber,
    additionalInfo,
    
    // Временные метки
    createdAt,
    updatedAt,
    lastSync
  } = product;

  const formattedMeasurements = measurement1 && measurement2 && measurement3 
    ? `${Number(measurement1).toFixed(2)} x ${Number(measurement2).toFixed(2)} x ${Number(measurement3).toFixed(2)} mm` 
    : measurements || 'N/A';

  // Формируем название без лишнего дефиса/прочерка, если cut отсутствует
  const translatedShape = translateShape(shape, t);
  let cardTitle = `${translatedShape || t('deals.notAvailable')} ${carat || t('deals.notAvailable')}ct ${color || t('deals.notAvailable')} ${clarity || t('deals.notAvailable')}`;
  if (cut) {
    cardTitle += ` ${shortenGradeValue(cut)}`;
  }

  const handleImageError = (): void => {
    setImageError(true);
  };

  const cardClasses = `${styles['diamond-card']} ${styles['main-display']}`;
  const SHAPE_ICONS = getShapeIcons(theme);
  const fallbackIcon = shape ? SHAPE_ICONS[shape] : undefined;

  return (
    <div className={cardClasses}>
      <div className={styles['diamond-main-title-centered']}>{cardTitle}</div>
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
                <img src={fallbackIcon} alt={`${shape} icon`} className={styles['main-diamond-image']} />
              ) : (
                <div className={styles['main-diamond-image-placeholder']}>{t('catalog.noImage')}</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles['main-diamond-details']}>
          {/* Ценовая информация */}
          <div className={`${styles['detail-item']} ${styles['price-per-carat-main']}`}>  
            <span className={styles['detail-label']}>{t('catalog.marketPPC')}</span>  
            <span className={styles['price-value']}>{formatValue(marketPricePerCarat, '$')}</span>  
          </div>  
          <div className={styles['detail-item']}>  
            <span className={styles['detail-label']}>{t('catalog.marketPrice')}</span>  
            <span className={styles['price-value']}>{formatValue(marketPrice, '$')}</span>  
          </div>
          <div className={styles['detail-item']}>  
            <span className={styles['detail-label']}>{t('catalog.yourPrice')}</span>  
            <span className={styles['price-value']}>{formatValue(price, '$')}</span>  
          </div>
          <div className={styles['detail-item']}>  
            <span className={styles['detail-label']}>{t('catalog.pricePerCarat')}</span>  
            <span className={styles['price-value']}>{formatValue(pricePerCarat, '$')}</span>  
          </div>
          {discount && (
            <div className={styles['detail-item']}>  
              <span className={styles['detail-label']}>{t('catalog.discount')}</span>  
              <span className={styles['detail-value']}>{formatValue(discount, '%')}</span>  
            </div>
          )}

          {/* Основные характеристики */}
          <div className={`${styles['additional-details']} ${styles['single-column-details']}`}>  
              {formattedMeasurements && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.measurements')}</span>  
                <span className={styles['detail-value']}>{formattedMeasurements}</span>  
              </div>  
            )}
            {ratio && (
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.ratio')}</span>  
                <span className={styles['detail-value']}>{formatValue(ratio)}</span>  
              </div>
            )}
            {polish && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.polish')}</span>  
                <span className={styles['detail-value']}>{shortenGradeValue(polish)}</span>  
              </div>  
            )}
            {location && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.location')}</span>  
                <span className={styles['detail-value']}>{location}</span>  
              </div>  
            )}
            {tableSize !== undefined && tableSize !== null && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.table')}</span>  
                <span className={styles['detail-value']}>{formatValue(tableSize, '%')}</span>  
              </div>  
            )}
            {totalDepth !== undefined && totalDepth !== null && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.totalDepth')}</span>  
                <span className={styles['detail-value']}>{formatValue(totalDepth, '%')}</span>  
              </div>  
            )}
            {girdle && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.girdle')}</span>  
                <span className={styles['detail-value']}>{girdle}</span>  
              </div>  
            )}
            {culet && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.culet')}</span>  
                <span className={styles['detail-value']}>{culet}</span>  
              </div>  
            )}
            {crownHeight !== undefined && crownHeight !== null && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.crownHeight')}</span>  
                <span className={styles['detail-value']}>{formatValue(crownHeight, '%')}</span>  
              </div>  
            )}
            {pavilionDepth !== undefined && pavilionDepth !== null && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.pavilionDepth')}</span>  
                <span className={styles['detail-value']}>{formatValue(pavilionDepth, '%')}</span>  
              </div>  
            )}
            {symmetry && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.symmetry')}</span>  
                <span className={styles['detail-value']}>{shortenGradeValue(symmetry)}</span>  
              </div>  
            )}
            {fluorescence && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.fluorescence')}</span>  
                <span className={styles['detail-value']}>{formatFluorescenceValue(fluorescence)}</span>  
              </div>  
            )}
            {technology && (  
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.technology')}</span>  
                <span className={styles['detail-value']}>{technology}</span>  
              </div>  
            )}
            {stoneType && (
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.stoneType')}</span>  
                <span className={styles['detail-value']}>{stoneType}</span>  
              </div>
            )}
            {overtone && (
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.overtone')}</span>  
                <span className={styles['detail-value']}>{overtone}</span>  
              </div>
            )}
            {intensity && (
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.intensity')}</span>  
                <span className={styles['detail-value']}>{intensity}</span>  
              </div>
            )}
            {ha && (
              <div className={styles['detail-item']}>  
                <span className={styles['detail-label']}>{t('catalog.heartsArrows')}</span>  
                <span className={styles['detail-value']}>{ha}</span>  
              </div>
            )}
          </div>

          {/* Идентификаторы и сертификаты */}
          <div className={`${styles['additional-details']} ${styles['single-column-details']}`}>
            <div className={`${styles['detail-item']} ${styles['detail-wide']}`}>
              <span className={styles['detail-label']}>{t('catalog.certificateInformation')}</span>
              <span className={styles['detail-value']}>
                {certificateInstitute || lab} - {certificateNumber || certificateId || t('deals.notAvailable')}
              </span>
            </div>
            {sku && (
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.sku')}</span>
                <span className={styles['detail-value']}>{sku}</span>
              </div>
            )}
            {stockNumber && (
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.stockNumber')}</span>
                <span className={styles['detail-value']}>{stockNumber}</span>
              </div>
            )}
            {stockNum && (
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.stockNum')}</span>
                <span className={styles['detail-value']}>{stockNum}</span>
              </div>
            )}
            {customId && (
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.customId')}</span>
                <span className={styles['detail-value']}>{customId}</span>
              </div>
            )}
            {lotNumber && (
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.lotNumber')}</span>
                <span className={styles['detail-value']}>{lotNumber}</span>
              </div>
            )}
          </div>

          {/* Статус и состояние */}
          <div className={`${styles['additional-details']} ${styles['single-column-details']}`}>
            <div className={styles['detail-item']}>
              <span className={styles['detail-label']}>{t('company.status')}</span>
              <span className={styles['detail-value']}>{status || t('company.available')}</span>
            </div>
            <div className={styles['detail-item']}>
              <span className={styles['detail-label']}>{t('company.soldLabel')}</span>
              <span className={styles['detail-value']}>{sold ? t('common.yes') : t('common.no')}</span>
            </div>
            <div className={styles['detail-item']}>
              <span className={styles['detail-label']}>{t('company.onDealLabel')}</span>
              <span className={styles['detail-value']}>{onDeal ? t('common.yes') : t('common.no')}</span>
            </div>
          </div>

          {/* Ссылки и медиа */}
          {(videoLink || video || certificateLink || reportLink || image360) && (
            <div className={`${styles['additional-details']} ${styles['single-column-details']}`}>
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.mediaLinks')}</span>
                <div className={styles['linkStackSm']}>
                  {videoLink && <a href={videoLink} target="_blank" rel="noopener noreferrer" className={styles['linkBrand']}>{t('catalog.video')}</a>}
                  {video && <a href={video} target="_blank" rel="noopener noreferrer" className={styles['linkBrand']}>{t('catalog.videoAlt')}</a>}
                  {certificateLink && <a href={certificateLink} target="_blank" rel="noopener noreferrer" className={styles['linkBrand']}>{t('cart.certificate')}</a>}
                  {reportLink && <a href={reportLink} target="_blank" rel="noopener noreferrer" className={styles['linkBrand']}>{t('catalog.report')}</a>}
                  {image360 && <a href={image360} target="_blank" rel="noopener noreferrer" className={styles['linkBrand']}>{t('catalog.view360')}</a>}
                </div>
              </div>
            </div>
          )}

          {/* Дополнительная информация */}
          {(description || notes || comment || details || additionalInfo) && (
            <div className={`${styles['additional-details']} ${styles['single-column-details']}`}>
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.additionalInformation')}</span>
                <div className={styles['textStackMd']}>
                  {description && <span className={styles['detail-value']}><strong>{t('catalog.descriptionLabel')}</strong> {description}</span>}
                  {notes && <span className={styles['detail-value']}><strong>{t('catalog.notesLabel')}</strong> {notes}</span>}
                  {comment && <span className={styles['detail-value']}><strong>{t('catalog.commentLabel')}</strong> {comment}</span>}
                  {details && <span className={styles['detail-value']}><strong>{t('catalog.detailsLabel')}</strong> {details}</span>}
                  {additionalInfo && <span className={styles['detail-value']}><strong>{t('catalog.additionalInfoLabel')}</strong> {additionalInfo}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Временные метки */}
          {(createdAt || updatedAt || lastSync) && (
            <div className={`${styles['additional-details']} ${styles['single-column-details']}`}>
              <div className={styles['detail-item']}>
                <span className={styles['detail-label']}>{t('catalog.timestamps')}</span>
                <div className={styles['linkStackSm']}>
                  {createdAt && <span className={styles['detail-value']}><strong>{t('catalog.createdLabel')}</strong> {new Date(createdAt).toLocaleString()}</span>}
                  {updatedAt && <span className={styles['detail-value']}><strong>{t('catalog.updatedLabel')}</strong> {new Date(updatedAt).toLocaleString()}</span>}
                  {lastSync && <span className={styles['detail-value']}><strong>{t('catalog.lastSyncLabel')}</strong> {new Date(lastSync).toLocaleString()}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className={styles['price-history-chart-container']}>
        {isHistoryLoading && <div className={styles['chart-loading-overlay']}>{t('catalog.loadingPriceHistory')}</div>}
        {historyError && <div className={styles['chart-error-overlay']}>{t('catalog.couldNotLoadPriceHistory')}</div>}
        {!isHistoryLoading && !historyError && priceHistory && (
          <Line options={chartOptions} data={priceHistory} />
        )}
        {!isHistoryLoading && !historyError && !priceHistory && (
          <div className={styles['chart-no-data-overlay']}>{t('catalog.noPriceHistoryAvailable')}</div>
        )}
      </div>
    </div>
  );
};

export default InventoryDiamondCard;