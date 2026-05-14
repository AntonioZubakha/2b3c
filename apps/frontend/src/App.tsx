import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AppRouteOutlet from './components/AppRouteOutlet';
import HomePage from './pages/HomePage';
import MarketplacePage from './pages/MarketplacePage';
import DiamondDetailPage from './pages/DiamondDetailPage';
import AboutPage from './pages/AboutPage';
import JewelryPage from './pages/JewelryPage';
import BespokePage from './pages/BespokePage';
import CraftPage from './pages/CraftPage';
import AuthPage from './pages/AuthPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import VaultPage from './pages/VaultPage';
import SecurityPage from './pages/SecurityPage';
import WishlistPage from './pages/WishlistPage';
import MerchantDashboard from './pages/MerchantDashboard';
import SupplierPortalPage from './pages/SupplierPortalPage';
import SupplierOrdersPage from './pages/SupplierOrdersPage';
import SupplierOrderDetailPage from './pages/SupplierOrderDetailPage';
import SupplierCompanyPage from './pages/SupplierCompanyPage';
import SupplierInventoryPage from './pages/SupplierInventoryPage';

function App() {
  return (
    <>
      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="bg-orb orb-3"></div>

      <Navbar />

      <div className="relative z-10 flex flex-col min-h-screen">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route element={<AppRouteOutlet />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/collections" element={<JewelryPage />} />
            <Route path="/craft" element={<CraftPage />} />
            <Route path="/bespoke" element={<BespokePage />} />
            <Route path="/diamond/:id" element={<DiamondDetailPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/account/orders" element={<OrdersPage />} />
            <Route path="/account/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/account/vault" element={<VaultPage />} />
            <Route path="/account/security" element={<SecurityPage />} />
            <Route path="/merchant" element={<MerchantDashboard />} />
            <Route path="/supplier/portal" element={<SupplierPortalPage />} />
            <Route path="/supplier/orders" element={<SupplierOrdersPage />} />
            <Route path="/supplier/orders/:orderId" element={<SupplierOrderDetailPage />} />
            <Route path="/supplier/company" element={<SupplierCompanyPage />} />
            <Route path="/supplier/inventory" element={<SupplierInventoryPage />} />
          </Route>
        </Routes>
        <Footer />
      </div>
    </>
  );
}

export default App;
