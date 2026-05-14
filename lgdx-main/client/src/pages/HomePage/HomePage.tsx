import React, { useEffect, useMemo, useCallback } from 'react';
import styles from './HomePage.module.css';
import SEO from '../../components/common/SEO/SEO';
import { getCanonicalOrigin } from '../../utils/urlNormalizer';
import {
  HeroSection,
  FeaturesSection,
  WhyLgdealSection,
  GlobalTradingNetworkSection,
  CollectionSection,
  TestimonialsSection,
  BecomeMemberSection,
  CTASection
} from '../../components/home';

const HomePage: React.FC = () => {
  // Optimized Intersection Observer with memoization
  const observerOptions: IntersectionObserverInit = useMemo(() => ({
    root: null,
    rootMargin: '50px', // Start animation slightly before element is visible
    threshold: 0.1
  }), []);

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, []);

  useEffect(() => {
    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: make all sections visible immediately
      document.querySelectorAll('.animateOnScroll').forEach(el => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(handleIntersection, observerOptions);
    const sections = document.querySelectorAll('.animateOnScroll');
    sections.forEach(section => {
      observer.observe(section);
    });
    
    return () => {
      sections.forEach(section => {
        observer.unobserve(section);
      });
    };
  }, [observerOptions, handleIntersection]);

  // Structured Data for SEO (JSON-LD) - using canonical URLs
  const canonicalOrigin = getCanonicalOrigin();
  const structuredData = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${canonicalOrigin}/#organization`,
    name: 'LGDeal INC',
    alternateName: 'LGDeal',
    description: 'Global B2B Lab-Grown Diamond Exchange revolutionizing diamond trading with cutting-edge AI analytics. Connect with 250,000+ lab-grown diamonds, transparent pricing, and real-time market intelligence.',
    url: canonicalOrigin,
    logo: {
      '@type': 'ImageObject',
      url: `${canonicalOrigin}/web-app-manifest-512x512.png`,
      width: 512,
      height: 512
    },
    image: {
      '@type': 'ImageObject',
      url: `${canonicalOrigin}/og-image.png`,
      width: 1200,
      height: 630
    },
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      availableLanguage: ['English'],
      areaServed: 'Worldwide'
    },
    offers: {
      '@type': 'AggregateOffer',
      offerCount: '250000+',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      itemCondition: 'https://schema.org/NewCondition'
    },
    numberOfEmployees: {
      '@type': 'QuantitativeValue',
      value: 50  // Fixed: must be a number, not a string
    },
    foundingDate: '2020',
    areaServed: {
      '@type': 'Place',
      name: 'Worldwide'
    },
    knowsAbout: [
      'Lab-Grown Diamonds',
      'Diamond Trading',
      'AI Analytics',
      'Jewelry Manufacturing',
      'Diamond Certification'
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Diamond Collection',
      itemListElement: {
        '@type': 'ItemList',
        numberOfItems: 250000
      }
    }
  }), [canonicalOrigin]);

  const websiteStructuredData = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${canonicalOrigin}/#website`,
    name: 'LGDeal',
    url: canonicalOrigin,
    publisher: {
      '@id': `${canonicalOrigin}/#organization`
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${canonicalOrigin}/catalog?search={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    },
    inLanguage: 'en-US'
  }), [canonicalOrigin]);

  const serviceStructuredData = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${canonicalOrigin}/#service`,
    serviceType: 'Lab-Grown Diamond Exchange',
    provider: {
      '@id': `${canonicalOrigin}/#organization`
    },
    areaServed: {
      '@type': 'Place',
      name: 'Worldwide'
    },
    description: 'AI-powered B2B diamond trading platform providing access to global lab-grown diamonds with transparent pricing, market analytics, and perfect pair matching technology.',
    offers: {
      '@type': 'Offer',
      category: 'Diamond Trading Platform',
      availability: 'https://schema.org/InStock'
    }
  }), [canonicalOrigin]);

  const breadcrumbStructuredData = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: canonicalOrigin
      }
    ]
  }), [canonicalOrigin]);

  return (
    <>
      <SEO 
        title="LGDeal — Global B2B Lab-Grown Diamond Exchange"
        description="AI-powered B2B platform for lab-grown diamond trading: 250,000+ stones, transparent pricing, and market analytics for manufacturers and diamond dealers worldwide."
        keywords={[
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
        ]}
        type="website"
        image="/og-image.png"
      />
      {/* Structured Data (JSON-LD) for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <main id="main-content" className={styles.homePage}>
        <HeroSection />
        <WhyLgdealSection />
        <GlobalTradingNetworkSection />
        <BecomeMemberSection />
        <FeaturesSection />
        <CollectionSection />
        <TestimonialsSection />
        <CTASection />
      </main>
    </>
  );
};

export default HomePage;