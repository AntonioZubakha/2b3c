import React from 'react';
import { useTranslation } from '../../../../i18n';
import { Link } from '../../../../routes';
import SEO from '../../../../components/common/SEO/SEO';
import PageContainer from '../../../../components/common/PageContainer/PageContainer';
import styles from './ColorGradingPage.module.css';
import { colorGradingArticleLocales } from '../../content/colorGradingArticleLocales';
import type { Locale } from '../../../../i18n/types';

const ColorGradingPage: React.FC = () => {
  const { t, locale } = useTranslation()
  const c = colorGradingArticleLocales[locale as Locale] ?? colorGradingArticleLocales.en

  const seoByLocale = {
    en: {
      title: 'Color Grading of Lab Grown Diamonds',
      description:
        'Understand how lab-grown diamond color grading works, from hue and saturation to pricing implications in the market.',
    },
    de: {
      title: 'Farbklassifizierung von Labordiamanten',
      description:
        'Verstehen Sie die Farbklassifizierung von Labordiamanten: Farbton, Sättigung und Auswirkungen auf die Preisbildung.',
    },
    fr: {
      title: 'Évaluation de la couleur des diamants de laboratoire',
      description:
        'Comprenez la gradation de la couleur des diamants de laboratoire et son impact sur la valorisation commerciale.',
    },
    zh: {
      title: '培育钻石颜色分级',
      description: '了解培育钻石颜色分级的核心逻辑，以及色调、饱和度与价格之间的关系。',
    },
    ja: {
      title: 'ラボグロウンダイヤモンドのカラーグレーディング',
      description: '色相・彩度・評価基準と、市場価格への影響をわかりやすく解説します。',
    },
    hi: {
      title: 'लैब-ग्रोन डायमंड की कलर ग्रेडिंग',
      description:
        'ह्यू, सैचुरेशन और ग्रेडिंग मानकों के आधार पर लैब-ग्रोन डायमंड की प्राइसिंग को समझें।',
    },
  } as const
  const seo = seoByLocale[locale as keyof typeof seoByLocale] ?? seoByLocale.en

  return (
    <PageContainer>
      <SEO
        title={`${seo.title} – ${t('navigation.forExperts')}`}
        description={seo.description}
        keywords={[
          'diamond color grading',
          'lab-grown diamonds',
          'fancy color diamonds',
          'GIA color grading',
        ]}
        type="website"
      />

      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div className={styles.title}>{t('navigation.forExperts')}</div>
          <Link to="/for-experts" className={styles.backLink}>
            <div>{t('common.back')}</div>
          </Link>
        </div>
        <div className={styles.heroSection}>
          <h1 className={styles.heroTitle}>{t('forExperts.articles.grading.title')}</h1>
        </div>
        <div className={styles.content}>
          <p className={styles.paragraph}>{c.intro}</p>
          <h2 className={styles.heading2}>
            <strong>{c.headingAssess}</strong>
          </h2>
          <p className={styles.paragraphTop}>
            <strong>{c.colorlessTitle}</strong> {c.colorlessBody}
          </p>
          <p className={styles.paragraphTop}>
            <strong>{c.fancyTitle}</strong> {c.fancyBody}
          </p>
          <div className={styles.imageCenter}>
            <img alt={t('forExperts.alt.img6')} src={require('../../../../assets/images/articles/img_6.png')} />
          </div>
          <p className={styles.paragraph}>{c.instrumental}</p>
          <div className={styles.imageContainer}>
            <img alt={t('forExperts.alt.img7')} src={require('../../../../assets/images/articles/img_7.png')} />
            <small>
              {c.fig1Caption}
              <br />
              {c.sourceLabel}: {c.fig1Source}
            </small>
          </div>
          <p className={styles.paragraphTop}>{c.gradation}</p>
          <div className={styles.imageContainer}>
            <img alt={t('forExperts.alt.img8')} src={require('../../../../assets/images/articles/img_8.png')} />
            <small>
              {c.fig2Caption}
              <br />
              {c.sourceLabel}: {c.fig2Source}
            </small>
          </div>
          <h2 className={styles.heading2WithPadding}>
            <strong>{c.headingCost}</strong>
          </h2>
          <p className={styles.paragraph}>{c.cost1}</p>
          <p className={styles.paragraph}>{c.cost2}</p>
          <p className={styles.paragraph}>{c.cost3}</p>
          <div className={styles.imageContainerBottom}>
            <img alt={t('forExperts.alt.img9')} src={require('../../../../assets/images/articles/img_9.png')} />
          </div>
          <p className={styles.paragraph}>{c.closing1}</p>
          <p className={styles.paragraph}>{c.closing2}</p>
          <p className={styles.paragraph}>{c.closing3}</p>
          <p className={styles.authorSection}>
            <span className={styles.bold}>{c.authorLabel} </span>
            <span>{c.author}</span>
          </p>
        </div>
      </div>
    </PageContainer>
  )
}

export default ColorGradingPage
