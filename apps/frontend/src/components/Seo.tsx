import React from 'react';
import { Helmet } from 'react-helmet-async';
import i18n from '../i18n/config';
import { buildSeoFullTitle, PUBLIC_BRAND_NAME } from '../lib/publicBrand';

type Props = {
  title: string;
  description: string;
  /** Path only, e.g. `/marketplace` */
  path?: string;
  /** Absolute or site-relative image for OG */
  image?: string;
  noIndex?: boolean;
  /** JSON-LD string (already serialized object) */
  jsonLd?: string;
};

const DEFAULT_OG_IMAGE = '/assets/stonee_logo.png';

export const Seo: React.FC<Props> = ({ title, description, path = '', image, noIndex, jsonLd }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const canonical = path ? `${origin}${path.startsWith('/') ? path : `/${path}`}` : origin || undefined;
  const ogImage = image?.startsWith('http') ? image : `${origin}${image ?? DEFAULT_OG_IMAGE}`;

  const fullTitle = buildSeoFullTitle(title);
  const ogLocale = i18n.language === 'en' ? 'en_US' : 'ru_RU';
  const ogLocaleAlternate = i18n.language === 'en' ? 'ru_RU' : 'en_US';

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {noIndex ? <meta name="robots" content="noindex, nofollow" /> : <meta name="robots" content="index, follow" />}

      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:site_name" content={PUBLIC_BRAND_NAME} />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:locale:alternate" content={ogLocaleAlternate} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {ogImage ? <meta name="twitter:image" content={ogImage} /> : null}

      {jsonLd ? (
        <script type="application/ld+json">{jsonLd}</script>
      ) : null}
    </Helmet>
  );
};

export default Seo;
