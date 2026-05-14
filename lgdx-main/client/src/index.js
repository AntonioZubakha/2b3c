import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { AuthProvider } from './context/AuthContext';
import './utils/consoleCleanup'; // Очистка console.log в продакшене
import { logger } from './utils/logger';
import * as serviceWorker from './serviceWorker';
import * as Sentry from "@sentry/react";
import { getConfig } from './config/environment'

// ==========================================================================
// GOOGLE ANALYTICS INITIALIZATION
// ==========================================================================

const initGoogleAnalytics = () => {
  // Читаем GA Measurement ID из:
  // 1. Runtime конфигурации (window.env) - для Docker secrets
  // 2. Build-time переменной окружения (process.env) - для fallback
  const gaMeasurementId = (window.env && window.env.REACT_APP_GA_MEASUREMENT_ID) 
    || process.env.REACT_APP_GA_MEASUREMENT_ID 
    || '';
  
  if (!gaMeasurementId || gaMeasurementId.trim() === '') {
    // Silent skip - это нормально для prod.local или если GA не настроен
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    logger.debug('[Analytics] Google Analytics disabled in development mode');
    return;
  }

  // Initialize dataLayer and gtag first
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  // Load gtag script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`;

  // Configure GA when script loads
  script.onload = () => {
    gtag('js', new Date());
    gtag('config', gaMeasurementId, {
      send_page_view: true,
      cookie_flags: 'SameSite=None;Secure',
      // Enhanced settings for better tracking
      anonymize_ip: true, // GDPR compliance
      allow_google_signals: true, // Demographic data
      allow_ad_personalization_signals: false, // Privacy
      page_title: document.title,
      page_location: window.location.href
    });
  };

  document.head.appendChild(script);

  logger.info('[Analytics] Google Analytics initialized', { gaMeasurementId });
};

// Инициализируем Sentry асинхронно
const initSentry = async () => {
  try {
    const config = await getConfig();
    if (config.sentryDsn) {
      Sentry.init({
        dsn: config.sentryDsn,
        // Setting this option to true will send default PII data to Sentry.
        // For example, automatic IP address collection on events
        sendDefaultPii: true,
      });
    }
  } catch (error) {
    // Sentry initialization failed - app will continue without error tracking
  }
};

// Инициализируем Google Analytics
initGoogleAnalytics();

// Инициализируем Sentry
initSentry();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Service Worker: disabled by default to avoid 404 when no generated SW is present.
// Enable only when building with REACT_APP_ENABLE_SW=true
const enableServiceWorker =
  process.env.NODE_ENV === 'production' && process.env.REACT_APP_ENABLE_SW === 'true';

if (enableServiceWorker) {
  serviceWorker.register();
} else {
  serviceWorker.unregister();
}
