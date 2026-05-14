import React from 'react';
import { useTranslation } from '../../../../i18n';
import { Link } from '../../../../routes';
import SEO from '../../../../components/common/SEO/SEO';
import PageContainer from '../../../../components/common/PageContainer/PageContainer';
import styles from './ColorsOfLabGrownDiamondsPage.module.css';
import { colorsArticleLocales } from '../../content/colorsArticleLocales';
import type { Locale } from '../../../../i18n/types';

const ColorsOfLabGrownDiamondsPage: React.FC = () => {
  const { t, locale } = useTranslation()
  const c = colorsArticleLocales[locale as Locale] ?? colorsArticleLocales.en

  const seoByLocale = {
    en: {
      title: 'Colors of Lab Grown Diamonds and Its Causes',
      description:
        'Learn how impurity centers and growth conditions form color in lab-grown diamonds and how this affects grading and market value.',
    },
    de: {
      title: 'Farben von Labordiamanten und ihre Ursachen',
      description:
        'Erfahren Sie, wie Verunreinigungen und Wachstumsbedingungen die Farbe von Labordiamanten bestimmen und den Marktwert beeinflussen.',
    },
    fr: {
      title: 'Couleurs des diamants de laboratoire et leurs causes',
      description:
        'Découvrez comment les impuretés et les conditions de croissance influencent la couleur et la valeur des diamants de laboratoire.',
    },
    zh: {
      title: '培育钻石颜色及其成因',
      description: '了解杂质中心与生长条件如何决定培育钻石颜色，并影响分级与市场价值。',
    },
    ja: {
      title: 'ラボグロウンダイヤモンドの色と成因',
      description:
        '不純物中心と成長条件が色形成に与える影響、および評価・市場価値への関係を解説します。',
    },
    hi: {
      title: 'लैब-ग्रोन डायमंड के रंग और उनके कारण',
      description:
        'जानें कि अशुद्धियां और growth conditions लैब-ग्रोन डायमंड के रंग, ग्रेडिंग और मार्केट वैल्यू को कैसे प्रभावित करती हैं।',
    },
  } as const
  const seo = seoByLocale[locale as keyof typeof seoByLocale] ?? seoByLocale.en

  return (
    <PageContainer>
      <SEO
        title={`${seo.title} – ${t('navigation.forExperts')}`}
        description={seo.description}
        keywords={['lab-grown diamonds', 'diamond color', 'HPHT', 'CVD']}
        type="website"
      />

      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div className={styles.title}>{t('navigation.forExperts')}</div>
          <Link to="/for-experts" className={styles.backLink}>
            <div className={styles.backText}>{t('common.back')}</div>
          </Link>
        </div>
        <div className={styles.heroSection}>
          <h1 className={styles.heroTitle}>{t('forExperts.articles.colors.title')}</h1>
        </div>
        <div className={styles.content}>
          <p className={styles.paragraph}>{c.intro1}</p>
          <p className={styles.paragraph}>{c.intro2}</p>
          <div className={styles.imageRow}>
            <div className={styles.imageColumn}>
              <strong>{c.compareLeftTitle}</strong>
              <small>{c.courtesy}</small>
              <a
                className={styles.link}
                target="_blank"
                rel="nofollow noopener noreferrer"
                href="https://www.gia.edu/famous-diamonds"
              >
                <small>
                  {c.sourceLabel}: www.gia.edu/famous-diamonds
                </small>
              </a>
              <img alt={t('forExperts.alt.img1')} src={require('../../../../assets/images/articles/img_1.png')} />
              <strong>{c.leftSpec}</strong>
              <div>{c.compareLeftPrice}</div>
            </div>
            <div className={styles.imageColumnRight}>
              <strong>{c.compareRightTitle}</strong>
              <img
                alt={t('forExperts.alt.img2')}
                className={styles.imageMarginTop}
                src={require('../../../../assets/images/articles/img_2.png')}
              />
              <strong>{c.rightSpec}</strong>
              <div>{c.compareRightPrice}</div>
            </div>
          </div>
          <p className={styles.paragraph}>{c.science1}</p>
          <p className={styles.paragraph}>{c.science2}</p>
          <p>{c.explainIntro}</p>
          <ul className={styles.list}>
            <li>{c.groupI}</li>
            <li>{c.groupII}</li>
          </ul>
          <p className={styles.paragraphTop}>{c.typeIDetailIntro}</p>
          <ul className={styles.list}>
            <li>
              <strong>{c.typeIaLead}</strong>
              <ul className={styles.list}>
                {c.typeIaSubtypes.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </li>
            <li>{c.typeIb}</li>
          </ul>
          <p className={styles.paragraphTop}>{c.typeIIDetailIntro}</p>
          <ul className={styles.list}>
            <li>{c.typeIIa}</li>
            <li>{c.typeIIb}</li>
          </ul>
          <div className={styles.imageContainer}>
            <img alt={t('forExperts.alt.img3')} src={require('../../../../assets/images/articles/img_3.png')} />
            <small>{c.caption3}</small>
          </div>
          <h2 className={styles.heading2}>
            <strong>{c.h2Market}</strong>
          </h2>
          <p className={styles.paragraph}>{c.marketParagraph}</p>
          <div className={styles.imageContainerCenter}>
            <img alt={t('forExperts.alt.img4')} src={require('../../../../assets/images/articles/img_4.png')} />
          </div>
          <div className={styles.paragraphTop}>
            <strong>{c.varietyHeading}</strong>
          </div>
          <ol className={styles.listDecimal}>
            {c.listItems.map((item, index) => (
              <li key={index}>
                <strong>{item.name}</strong> — {item.cause}
                {item.both && (
                  <div>
                    <i>{c.techBoth}</i> — {item.both}
                  </div>
                )}
                {item.hpht && (
                  <div>
                    <i>{c.techHpht}</i> — {item.hpht}
                  </div>
                )}
                {item.cvd && (
                  <div>
                    <i>{c.techCvd}</i> — {item.cvd}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className={styles.paragraphTop}>{c.saturationParagraph}</p>
          <p className={styles.paragraphTop}>{c.chartIntro}</p>
          <div className={styles.imageContainerJustifyCenter}>
            <img alt={t('forExperts.alt.img5')} src={require('../../../../assets/images/articles/img_5.png')} />
          </div>
          <p className={styles.paragraphTop}>{c.ending}</p>
          <p className={styles.authorSection}>
            <span className={styles.bold}>{c.authorLabel} </span>
            <span>{c.author}</span>
          </p>
        </div>
      </div>
    </PageContainer>
  )
}

export default ColorsOfLabGrownDiamondsPage
