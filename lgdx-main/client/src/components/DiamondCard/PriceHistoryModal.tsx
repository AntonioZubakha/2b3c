import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions, ChartData } from 'chart.js';
import '../../utils/chartInit';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { chartColors } from '../../utils/chartColors';
import { formatUsd } from '../../utils/currency';
import Button from '../common/Button/Button';
import LoadingSpinner from '../common/LoadingSpinner/LoadingSpinner';
import Modal from '../common/Modal/Modal';
import styles from './PriceHistoryModal.module.css';
import sharedStyles from './SharedModalStyles.module.css';

interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  priceHistory: ChartData<'line'> | null;
  isLoading: boolean;
  error: string | null;
  productTitle: string;
}

const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({
  isOpen,
  onClose,
  priceHistory,
  isLoading,
  error,
  productTitle
}) => {
  const { t } = useTranslation();
  // Subscribe to theme so chart colors (read from CSS variables via chartColors)
  // are refreshed when the user toggles light/dark.
  const { theme } = useTheme();

  const chartOptions = useMemo<ChartOptions<'line'>>(() => ({
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
          size: 16,
          weight: 'bold',
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
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context) => formatUsd(Number(context.parsed.y))
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: chartColors.textSecondary,
          callback: (value) => formatUsd(Number(value)),
          font: {
            size: 12,
          }
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
          font: {
            size: 11,
          }
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
  }), [t, theme]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dealDetail.marketPriceAnalysis')}
      size="xl"
      className={`${sharedStyles.baseModal} ${styles.priceHistoryModal}`}
      footer={
        <div className={sharedStyles.modalFooter}>
          <Button variant="secondary" onClick={onClose}>
            {t('dealDetail.close')}
          </Button>
        </div>
      }
    >
      <div className={`${sharedStyles.modalContent} ${styles.modalContent}`}>
        <div className={styles.productTitle}>
          <i className="fas fa-gem"></i>
          <span>{productTitle}</span>
        </div>

        {isLoading && (
          <div className={sharedStyles.loadingState}>
            <LoadingSpinner size="lg" />
            <p>{t('dealDetail.loadingMarketData')}</p>
          </div>
        )}

        {error && (
          <div className={sharedStyles.errorState}>
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <small>{t('dealDetail.unableToLoadHistory')}</small>
          </div>
        )}

        {!isLoading && !error && priceHistory && (
          <div className={`${sharedStyles.chartContainer} ${styles.chartContainer}`}>
            <Line options={chartOptions} data={priceHistory} />
          </div>
        )}

        {!isLoading && !error && !priceHistory && (
          <div className={sharedStyles.noDataState}>
            <i className="fas fa-database"></i>
            <h3>{t('dealDetail.noHistoricalData')}</h3>
            <p>{t('dealDetail.noHistoricalDataDescription')}</p>
            <div className={sharedStyles.noDataInfo}>
              <p>{t('dealDetail.whyNoData')}</p>
              <ul>
                <li>{t('dealDetail.reason1')}</li>
                <li>{t('dealDetail.reason2')}</li>
                <li>{t('dealDetail.reason3')}</li>
              </ul>
            </div>
          </div>
        )}

        {!isLoading && !error && priceHistory && (
          <div className={styles.chartInfo}>
            <div className={sharedStyles.infoCard}>
              <i className="fas fa-info-circle"></i>
              <div className={sharedStyles.infoText}>
                <h4>{t('dealDetail.aboutMarketPrices')}</h4>
                <p>
                  {t('dealDetail.aboutMarketPricesDescription')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PriceHistoryModal;

