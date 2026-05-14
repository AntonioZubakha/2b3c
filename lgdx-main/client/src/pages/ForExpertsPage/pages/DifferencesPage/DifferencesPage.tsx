import React from 'react';
import { useTranslation } from '../../../../i18n';
import { Link } from '../../../../routes';
import SEO from '../../../../components/common/SEO/SEO';
import PageContainer from '../../../../components/common/PageContainer/PageContainer';
import styles from './DifferencesPage.module.css';
import { differencesArticleLocales } from '../../content/differencesArticleLocales';
import type { Locale } from '../../../../i18n/types';

const DifferencesPage: React.FC = () => {
  const { t, locale } = useTranslation()
  const c = differencesArticleLocales[locale as Locale] ?? differencesArticleLocales.en

  const seoByLocale = {
    en: {
      title: 'Differences Between Natural and Lab Grown Diamonds',
      description:
        'A professional comparison of natural and lab-grown diamonds: structure, inclusions, morphology, and key identification criteria.',
    },
    de: {
      title: 'Unterschiede zwischen natürlichen und Labordiamanten',
      description:
        'Fachlicher Vergleich von natürlichen und gezüchteten Diamanten: Struktur, Einschlüsse, Morphologie und Identifikationsmerkmale.',
    },
    fr: {
      title: 'Différences entre diamants naturels et de laboratoire',
      description:
        'Comparaison professionnelle: structure, inclusions, morphologie et critères d’identification des diamants naturels et de laboratoire.',
    },
    zh: {
      title: '天然钻石与培育钻石差异',
      description: '从结构、包体、形貌与识别标准角度，对天然钻与培育钻进行专业对比。',
    },
    ja: {
      title: '天然ダイヤモンドとラボグロウンの違い',
      description: '構造・包有物・形態・識別基準の観点から、天然石とラボグロウンを専門的に比較します。',
    },
    hi: {
      title: 'प्राकृतिक और लैब-ग्रोन डायमंड के अंतर',
      description: 'संरचना, इंक्लूजन्स, मॉर्फोलॉजी और पहचान मानदंडों के आधार पर प्रोफेशनल तुलना।',
    },
  } as const
  const seo = seoByLocale[locale as keyof typeof seoByLocale] ?? seoByLocale.en

  return (
    <PageContainer>
      <SEO
        title={`${seo.title} – ${t('navigation.forExperts')}`}
        description={seo.description}
        keywords={[
          'natural vs lab-grown diamonds',
          'diamond identification',
          'diamond inclusions',
          'diamond morphology',
        ]}
        type="website"
      />
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div className={styles.sectionTitle}>{t('navigation.forExperts')}</div>
          <Link to="/for-experts" className={styles.backLink}>
            <div>{t('common.back')}</div>
          </Link>
        </div>

        <div className={styles.heroSection}>
          <h1 className={styles.heroTitle}>{t('forExperts.articles.differences.title')}</h1>
        </div>

        <div className={styles.content}>
          <p className={styles.paragraph}>{c.intro1}</p>
          <p className={styles.paragraph}>{c.intro2}</p>
          <div className={styles.tableWrapper}>
            <div className={styles.tableCaption}>{c.tableCaption}</div>
            <table className={styles.table}>
              <tbody>
                <tr>
                  <td>{c.th1}</td>
                  <td>{c.th2}</td>
                  <td>{c.th3}</td>
                  <td>{c.th4}</td>
                  <td>{c.th5}</td>
                  <td>{c.th6}</td>
                </tr>
                <tr>
                  <td>{c.rowDiamond}</td>
                  <td>C</td>
                  <td>2.42</td>
                  <td>3.53</td>
                  <td>{c.crystalCubic}</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td>{c.rowLabDiamond}</td>
                  <td>C</td>
                  <td>2.42</td>
                  <td>3.53</td>
                  <td>{c.crystalCubic}</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td>{c.rowMoissanite}</td>
                  <td>SiC</td>
                  <td>2.65–2.69</td>
                  <td>3.22</td>
                  <td>{c.crystalHexagonal}</td>
                  <td>9</td>
                </tr>
                <tr>
                  <td>{c.rowCz}</td>
                  <td>
                    ZrO<sub>2</sub>
                  </td>
                  <td>2.15–2.18</td>
                  <td>5.65</td>
                  <td>{c.crystalCubic}</td>
                  <td>8</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.paragraph}>{c.afterTable}</p>
          <p className={styles.paragraph}>{c.natureGrowth}</p>
          <p className={styles.paragraph}>{c.labGrowth}</p>
          <div className={styles.figureWrapper}>
            <img src={require('../../../../assets/images/articles/img_10.png')} alt={t('forExperts.alt.img10')} />
            <div>{c.fig1}</div>
          </div>
          <p className={styles.paragraph}>{c.midSection}</p>
          <div className={styles.listWrapper}>
            <ol>
              <li>
                <p>
                  <b>{c.crystalTitle}</b> {c.crystalBody}
                </p>
                <div className={styles.figureWrapperInline}>
                  <img
                    src={require('../../../../assets/images/articles/img_11.png')}
                    alt={t('forExperts.alt.img11')}
                  />
                  <div>{c.fig2}</div>
                </div>
              </li>
              <li>
                <p>
                  <b>{c.inclusionTitle}</b> {c.inclusionBody}
                </p>
                <div className={styles.figureWrapperInline}>
                  <img src={require('../../../../assets/images/articles/img_12.png')} alt={t('forExperts.alt.img12')} />
                  <div>{c.fig3}</div>
                </div>
              </li>
            </ol>
          </div>
          <p className={styles.paragraph}>{c.closing1}</p>
          <p className={styles.paragraph}>{c.closing2}</p>

          <p className={styles.authorSection}>
            <span className={styles.authorLabel}>{c.authorLabel} </span>
            <span>{c.author}</span>
          </p>
        </div>
      </div>
    </PageContainer>
  )
}

export default DifferencesPage
