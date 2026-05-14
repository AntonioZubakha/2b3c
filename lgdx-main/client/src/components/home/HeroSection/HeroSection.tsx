import React, { memo, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../context/ThemeContext';
import { useHomeStats } from '../../../hooks/useHomeStats';
import styles from './HeroSection.module.css';
import homeImage from '../../../assets/images/home.png';
import homeImageDark from '../../../assets/images/home1.png';
import ButtonLink from '../../common/Button/ButtonLink';
import Button from '../../common/Button/Button';
import Logo from '../../common/Logo/Logo';
import RequestDemoModal from '../RequestDemoModal/RequestDemoModal';
import HeroMarketChart from '../HeroMarketChart/HeroMarketChart';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';

const HeroSection: React.FC = memo(() => {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { stonesFormatted, loading } = useHomeStats();

  const currentHomeImage = theme === 'dark' ? homeImageDark : homeImage;

  return (
    <section 
      className={styles.heroSection} 
      aria-labelledby="hero-heading"
      role="banner"
    >
      <div className={styles.heroContent}>
        <div className={styles.heroText}>
          <div className={styles.heroLogoBlock}>
            <h1 id="hero-heading" className={styles.heroLogo}>
              <span className={styles.srOnly}>
                LGDeal — Global B2B Lab-Grown Diamond Exchange
              </span>
              <Logo asLink={false} size="lg" alt="LGDeal - Lab-Grown Diamond Exchange" />
            </h1>
          </div>

          <HomeSectionHeader
            className={styles.heroHomeHeader}
            align="left"
            title={
              <>
                <span className={styles.heroTitleLine}>{t('hero.subtitleStrong')}</span>
                <br />
                <span className={styles.heroTitleLine}>
                  {t('hero.subtitleLight')} <span className="homeAccent">{t('hero.accessible')}</span>
                </span>
              </>
            }
            subtitle={t('hero.description')}
          />

          <div className={styles.heroCta} role="group" aria-label={t('accessibility.mainActions')}>
            <ButtonLink to="/catalog" variant="primary" size="lg">
              <span>{t('hero.exploreCollection')}</span>
            </ButtonLink>
            <Button
              variant="secondary"
              size="lg"
              className={styles.heroSecondaryButton}
              onClick={() => setIsDemoModalOpen(true)}
            >
              <span>{t('hero.requestDemo')}</span>
            </Button>
          </div>
        </div>

        <div 
          className={styles.heroVisual} 
          aria-label={t('accessibility.diamondShowcase')}
        >
          <div className={styles.diamondShowcase}>
            <div className={styles.imageGlow}></div>
            <HeroMarketChart
              fallback={
                <img
                  src={currentHomeImage}
                  alt="Global Lab-Grown Diamond Collection showcasing our finest stones"
                  className={styles.heroImage}
                  loading="eager"
                  width={400}
                  height={300}
                  fetchPriority="high"
                  decoding="async"
                />
              }
            />
            <div className={styles.diamondStats} role="region" aria-label="Company statistics">
              <div className={styles.stat}>
                <span className={styles.statValue} aria-label={`${stonesFormatted} certified stones`}>
                  {loading ? t('hero.stats250k') : stonesFormatted}
                </span>
                <span className={styles.statLabel}>{t('hero.premiumStones')}</span>
              </div>
              <span className={styles.statDivider} aria-hidden="true">·</span>
              <div className={styles.stat}>
                <span className={styles.statValue} aria-label="100 plus">{t('hero.statsPartners')}</span>
                <span className={styles.statLabel}>{t('hero.globalPartners')}</span>
              </div>
              <span className={styles.statDivider} aria-hidden="true">·</span>
              <div className={styles.stat}>
                <span className={styles.statValue} aria-label="99 percent">{t('hero.stats99')}</span>
                <span className={styles.statLabel}>{t('hero.clientSuccess')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <RequestDemoModal isOpen={isDemoModalOpen} onClose={() => setIsDemoModalOpen(false)} />
    </section>
  );
});

HeroSection.displayName = 'HeroSection';

export default HeroSection;
