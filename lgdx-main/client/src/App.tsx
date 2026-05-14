import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, useLocation, Route } from './routes';
import { HelmetProvider } from 'react-helmet-async';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import ErrorBoundary from './components/common/ErrorBoundary/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner/LoadingSpinner';
import AdminRoute from './components/AdminRoute/AdminRoute';
import AuthenticatedRoute from './components/AuthenticatedRoute/AuthenticatedRoute';
import EmailVerificationBanner from './components/common/EmailVerificationBanner/EmailVerificationBanner';
import PhoneVerificationBanner from './components/common/PhoneVerificationBanner/PhoneVerificationBanner';
import InactiveUserBanner from './components/common/InactiveUserBanner/InactiveUserBanner';
import InactiveCompanyBanner from './components/common/InactiveCompanyBanner/InactiveCompanyBanner';
import { analytics } from './utils/analytics';

// Lazy-load the chat widget: it pulls react-markdown + remark-gfm + rehype-sanitize,
// which are only needed once the user opens the chat. Keep it out of the main bundle.
const ChatToggle = lazy(() => import('./components/Chat/ChatToggle'));

// Lazy Loading для всех страниц
const HomePage = lazy(() => import('./pages/HomePage/HomePage'));
const AboutUsPage = lazy(() => import('./pages/AboutUsPage/AboutUsPage'));
const ForExpertsPage = lazy(() => import('./pages/ForExpertsPage/ForExpertsPage'));
const ColorsOfLabGrownDiamondsPage = lazy(() => import('./pages/ForExpertsPage/pages/ColorsOfLabGrownDiamondsPage/ColorsOfLabGrownDiamondsPage'));
const ColorGradingPage = lazy(() => import('./pages/ForExpertsPage/pages/ColorGradingPage/ColorGradingPage'));
const DifferencesPage = lazy(() => import('./pages/ForExpertsPage/pages/DifferencesPage/DifferencesPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage/RegisterPage'));
const EmailVerificationPage = lazy(() => import('./pages/EmailVerificationPage/EmailVerificationPage'));
const PhoneVerificationPage = lazy(() => import('./pages/PhoneVerificationPage/PhoneVerificationPage'));
const PasswordResetPage = lazy(() => import('./pages/PasswordResetPage/PasswordResetPage'));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage/AcceptInvitePage'));
const AdminPanelPage = lazy(() => import('./pages/AdminPanelPage/AdminPanelPage'));
const ApiConfigurationEditPage = lazy(() => import('./pages/AdminPanelPage/ApiConfigurationEditPage'));
const MyCompanyPage = lazy(() => import('./pages/MyCompanyPage/MyCompanyPage'));
const CatalogPage = lazy(() => import('./pages/CatalogPage/CatalogPage'));
const CartPage = lazy(() => import('./pages/CartPage/CartPage'));
const MyDealsPage = lazy(() => import('./pages/MyDealsPage/MyDealsPage'));
const DealDetailPage = lazy(() => import('./pages/DealDetailPage/DealDetailPage'));
const MarketOverviewPage = lazy(() => import('./pages/MarketOverviewPage/MarketOverviewPage'));
const CategoryStatsPage = lazy(() => import('./pages/CategoryStatsPage/CategoryStatsPage'));
const TermsOfUsePage = lazy(() => import('./pages/TermsOfUsePage/TermsOfUsePage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage/PrivacyPolicyPage'));
const FAQPage = lazy(() => import('./pages/FAQPage/FAQPage'));
const BenefitsPage = lazy(() => import('./pages/BenefitsPage/BenefitsPage'));
const LogistDashboard = lazy(() => import('./pages/LogistDashboard/LogistDashboard'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage/NotificationsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage'));

// Компонент для управления классами body в зависимости от пути
const AppContent: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const isHomePage = location.pathname === '/';

    if (isHomePage) {
      document.body.classList.add('homepage-full-width');
    } else {
      document.body.classList.remove('homepage-full-width');
    }

    // Track using analytics utility (GA auto-tracking is enabled in index.js)
    analytics.trackPageView({
      path: location.pathname,
      title: document.title,
      referrer: document.referrer
    });

    // Cleanup function
    return () => {
      document.body.classList.remove('homepage-full-width');
    };
  }, [location.pathname, location.search]);

  return (
    <div className="App">
      <Header />
      <EmailVerificationBanner />
      <PhoneVerificationBanner />
      <InactiveUserBanner />
      <InactiveCompanyBanner />
      <div className={`main-content ${location.pathname === '/' ? 'homepage-layout' : ''}`}>
        <Suspense fallback={<LoadingSpinner fullScreen message="Loading page..." />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about-us" element={<AboutUsPage />} />
            <Route path="/for-experts" element={<ForExpertsPage />}/>
            <Route path="/for-experts/colors-of-lab-grown-diamonds" element={<ColorsOfLabGrownDiamondsPage />}/>
            <Route path="/for-experts/color-grading" element={<ColorGradingPage />}/>
            <Route path="/for-experts/differences" element={<DifferencesPage />}/>
            <Route path="/catalog" element={<CatalogPage />} />
            {/* Market Overview — only for authenticated users */}
            <Route path="/market-overview" element={<AuthenticatedRoute />}>
              <Route index element={<MarketOverviewPage />} />
            </Route>
            <Route path="/category-stats" element={<CategoryStatsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<EmailVerificationPage />} />
            <Route path="/verify-phone" element={<PhoneVerificationPage />} />
            <Route path="/reset-password" element={<PasswordResetPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            {/* Admin Panel Route - Protected */}
            <Route path="/admin-panel" element={<AdminRoute />}>
              <Route index element={<AdminPanelPage />} />
              <Route path="/admin-panel/configure-api/:companyId" element={<ApiConfigurationEditPage />} />
            </Route>

            {/* My Company Route - Protected for authenticated users */}
            <Route path="/my-company" element={<AuthenticatedRoute />}>
              <Route index element={<MyCompanyPage />} />
              {/* We can add sub-routes for tabs later if needed e.g. /my-company/team */}
            </Route>

            {/* Cart Route - Protected for authenticated users */}
            <Route path="/cart" element={<AuthenticatedRoute />}>
              <Route index element={<CartPage />} />
            </Route>

            {/* My Deals Route - Protected for authenticated users */}
            <Route path="/my-deals" element={<AuthenticatedRoute />}>
              <Route index element={<MyDealsPage />} />
            </Route>

            {/* Deal Detail Page Route - Protected for authenticated users */}
            <Route path="/deal/:dealId" element={<AuthenticatedRoute />}>
              <Route index element={<DealDetailPage />} />
            </Route>

            {/* Logist Dashboard Route - Protected for authenticated users */}
            <Route path="/logist-dashboard" element={<AuthenticatedRoute />}>
              <Route index element={<LogistDashboard />} />
            </Route>

            {/* Notifications - Protected for authenticated users */}
            <Route path="/notifications" element={<AuthenticatedRoute />}>
              <Route index element={<NotificationsPage />} />
            </Route>

            {/* Legal & Info Pages */}
            <Route path="/terms-of-use" element={<TermsOfUsePage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/for-suppliers" element={<BenefitsPage />} />
            <Route path="/for-buyers" element={<BenefitsPage />} />

            {/* Add other routes here */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
      <Footer />
      <Suspense fallback={null}>
        <ChatToggle />
      </Suspense>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <I18nProvider>
          <ErrorBoundary>
            <Router>
              <AppContent />
            </Router>
          </ErrorBoundary>
        </I18nProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
};

export default App; 