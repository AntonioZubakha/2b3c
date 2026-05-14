import React from 'react';
import { Helmet } from 'react-helmet-async';
import { normalizeCanonicalUrl, getCanonicalOrigin } from '../../../utils/urlNormalizer';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  noindex?: boolean;
  nofollow?: boolean;
}

const SEO: React.FC<SEOProps> = ({
  title = 'LGDeal — Global B2B Lab-Grown Diamond Exchange',
  description = 'AI-powered B2B platform for lab-grown diamond trading: 250,000+ stones, transparent pricing, and market analytics for manufacturers and diamond dealers worldwide.',
  keywords = [
    'lab-grown diamonds',
    'synthetic diamonds',
    'B2B Lab-Grown Diamond Exchange',
    'diamond trading platform',
    'AI diamond analytics',
    'global diamonds',
    'diamond certification',
    'diamond procurement',
    'wholesale diamonds',
    'diamond suppliers',
    'jewelry manufacturing',
    'diamond dealers',
    'ethical diamonds',
    'conflict-free diamonds',
    'diamond inventory',
    'diamond matching',
    'diamond pricing intelligence'
  ],
  image = `${window.location.origin}/og-image.png`,
  url = window.location.href,
  type = 'website',
  author,
  publishedTime,
  modifiedTime,
  section,
  tags = [],
  noindex = false,
  nofollow = false
}) => {
  const fullTitle = title.includes('LGDeal') ? title : `${title} | LGDeal`;
  const canonicalOrigin = getCanonicalOrigin();
  const fullImageUrl = image.startsWith('http') ? image : `${canonicalOrigin}${image.startsWith('/') ? image : '/' + image}`;
  
  // Normalize canonical URL
  const canonicalUrl = normalizeCanonicalUrl(url);
  const fullUrl = canonicalUrl;
  
  // Robots meta
  const robotsContent = noindex 
    ? (nofollow ? 'noindex, nofollow' : 'noindex, follow')
    : (nofollow ? 'index, nofollow' : 'index, follow');
  
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      <meta name="author" content={author || 'LGDeal INC'} />
      <meta name="robots" content={robotsContent} />
      <meta name="revisit-after" content="7 days" />
      <meta name="rating" content="general" />
      <meta name="distribution" content="global" />
      <meta name="geo.region" content="US" />
      <meta name="geo.placename" content="United States" />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:alt" content={fullTitle} />
      <meta property="og:site_name" content="LGDeal" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:locale:alternate" content="en_GB" />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />
      <meta name="twitter:image:alt" content={fullTitle} />
      <meta name="twitter:creator" content="@lgdeal" />
      <meta name="twitter:site" content="@lgdeal" />
      
      {/* Article Specific Meta Tags */}
      {type === 'article' && (
        <>
          {publishedTime && <meta property="article:published_time" content={publishedTime} />}
          {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
          {author && <meta property="article:author" content={author} />}
          {section && <meta property="article:section" content={section} />}
          {tags.map((tag, index) => (
            <meta key={index} property="article:tag" content={tag} />
          ))}
        </>
      )}
      
      {/* Product Specific Meta Tags */}
      {type === 'product' && (
        <>
          <meta property="product:price:amount" content="0" />
          <meta property="product:price:currency" content="USD" />
          <meta property="product:availability" content="in stock" />
          <meta property="product:condition" content="new" />
        </>
      )}
      
      {/* Viewport and Theme */}
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      <meta name="theme-color" content="#0a0025" />
      <meta name="msapplication-TileColor" content="#0a0025" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="LGDeal" />
      
      {/* Canonical URL - always normalized */}
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Language and Alternate URLs */}
      <html lang="en" />
      <link rel="alternate" hrefLang="en" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
      
      {/* Preconnect to external domains for performance */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://www.google-analytics.com" />
      <link rel="preconnect" href="https://www.googletagmanager.com" />
      <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      <link rel="dns-prefetch" href="https://www.google-analytics.com" />
      <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
      
      {/* Prefetch critical resources (market-overview is auth-only, no prefetch for guests) */}
      <link rel="prefetch" href="/catalog" as="document" />
      
      {/* Performance hints */}
      <meta httpEquiv="x-dns-prefetch-control" content="on" />
      
      {/* Verification Tags */}
      {/* TODO: Add your Google Search Console verification code here */}
      {/* Get it from: https://search.google.com/search-console */}
      {/* Example: <meta name="google-site-verification" content="your_verification_code_here" /> */}
      
      {/* Uncomment and add your verification codes when ready: */}
      {/* <meta name="facebook-domain-verification" content="YOUR_CODE" /> */}
      {/* <meta name="msvalidate.01" content="YOUR_CODE" /> */}
      {/* <meta name="yandex-verification" content="YOUR_CODE" /> */}
    </Helmet>
  );
};

export default SEO;
