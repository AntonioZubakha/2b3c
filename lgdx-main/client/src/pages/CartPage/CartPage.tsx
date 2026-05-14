import React, { useState, useEffect, ChangeEvent, useCallback, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { useNavigate } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import { Product } from '../../types';
import { isAxiosError } from 'axios';
import { translateShape } from '../../utils/shapeTranslations';
import styles from './CartPage.module.css';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import api from '../../api';
import PageHeader from '../../components/common/PageHeader/PageHeader';
import { analytics } from '../../utils/analytics';

// Import shape icons
import roundIcon from '../../assets/images/1.svg';
import princessIcon from '../../assets/images/2.svg';
import pearIcon from '../../assets/images/3.svg';
import marquiseIcon from '../../assets/images/4.svg';
import radiantIcon from '../../assets/images/5.svg';
import emeraldIcon from '../../assets/images/6.svg';
import ovalIcon from '../../assets/images/7.svg';
import heartIcon from '../../assets/images/8.svg';
import cushionIcon from '../../assets/images/9.svg';
import asscherIcon from '../../assets/images/10.svg';
import baguetteIcon from '../../assets/images/11.svg';
import trillionIcon from '../../assets/images/trillion.svg';

// SHAPE_ICONS mapping
const SHAPE_ICONS: Record<string, string> = {
  Round: roundIcon,
  Princess: princessIcon,
  Pear: pearIcon,
  Marquise: marquiseIcon,
  Radiant: radiantIcon,
  Emerald: emeraldIcon,
  Oval: ovalIcon,
  Heart: heartIcon,
  Cushion: cushionIcon,
  Asscher: asscherIcon,
  Baguette: baguetteIcon,
  Trillion: trillionIcon,
};


interface CartItemProps {
  item: {
    _id: string;
    product: Product;
  };
  onRemove: (itemId: string) => void;
  showCertificate: boolean;
  isCompanyActive: boolean; // Новый проп для проверки статуса компании
}

interface ShippingAddress {
  address: string;
  city: string;
  region: string;
  zipCode: string;
  country: string;
}

interface CartItem {
  _id: string;
  product: Product;
  quantity?: number;
}

const CartItem: React.FC<CartItemProps> = ({ item, onRemove, showCertificate, isCompanyActive }) => {
  const { t, formatCurrency } = useTranslation();
  const [imageError, setImageError] = useState<boolean>(false);

  // Reset imageError when product photo changes
  useEffect(() => {
    if (item?.product?.photo) {
      setImageError(false);
    }
  }, [item?.product?.photo]);

  if (!item || !item.product) return null;

  const product = item.product;

  const titleParts: string[] = [];
  if (product.shape) titleParts.push(translateShape(product.shape, t));
  if (product.carat) titleParts.push(`${product.carat}ct`);
  if (product.color) titleParts.push(product.color);
  if (product.clarity) titleParts.push(product.clarity);
  if (product.cut && product.cut !== '-' && product.cut.toUpperCase() !== 'N/A' && product.cut.trim() !== '' && product.cut.toLowerCase() !== 'none') {
    titleParts.push(product.cut);
  }
  const displayTitle = titleParts.filter(Boolean).join(' ');

  const handleImageError = (): void => {
    setImageError(true);
  };

  const fallbackIcon = product.shape ? SHAPE_ICONS[product.shape] : undefined;

  return (
    <div className={styles['cart-item']}>
      <div className={styles['cart-item-image']}>
        {product.photo && !imageError ? (
          <img
            src={product.photo}
            alt={`${product.shape} diamond`}
            onError={handleImageError}
          />
        ) : fallbackIcon ? (
          <img
            src={fallbackIcon}
            alt={`${product.shape} icon`}
            className={styles['cart-item-fallback-icon']}
          />
        ) : (
          <div className={styles['cart-item-image-placeholder']}>{t('cart.noImage')}</div>
        )}
      </div>
      <div className={styles['cart-item-details']}>
        <div className={styles['cart-item-info']}>
          <h3>{displayTitle}</h3>
          <div className={styles['cart-item-specs']}>
            {showCertificate && (
              <>
                {product.certificateNumber && (
                  <p>{t('cart.certificateNumber')}: {product.certificateNumber}</p>
                )}
                {product.certificateInstitute && (
                  <p>{t('cart.lab')}: {product.certificateInstitute}</p>
                )}
                {!product.certificateInstitute && product.lab && (
                  <p>{t('cart.lab')}: {product.lab}</p>
                )}
                {!product.certificateNumber && !product.certificateInstitute && !product.lab && (
                  <p>{t('cart.certificate')}: {t('cart.certificateNA')}</p>
                )}
              </>
            )}
            {product.pricePerCarat !== undefined && isCompanyActive && (
              <p className={styles['cart-item-ppc']}>{t('cart.pricePerCarat')}: {formatCurrency(product.pricePerCarat, 'USD')}/ct</p>
            )}
          </div>
        </div>
        <div className={styles['cart-item-price-actions']}>
          {isCompanyActive ? (
            <div className={styles['cart-item-price-block']}>
              <span className={styles['cart-item-price']}>{t('cart.totalPrice')}: {product.marketPrice ? formatCurrency(product.marketPrice, 'USD') : t('cart.certificateNA')}</span>
              <span className={styles['tariffs-note']}>{t('common.tariffsNotIncluded')}</span>
            </div>
          ) : (
            <div className={styles['price-blurred-section']}>
              <div className={styles['price-blurred-overlay']}>
                <div className={styles['contact-sales-message']}>
                  <i className="fas fa-lock"></i>
                  <span>{t('cart.contactForPricing')}</span>
                </div>
              </div>
            </div>
          )}
          <Button
            onClick={() => onRemove(item._id)}
            variant="danger"
            size="sm"
          >
            {t('cart.remove')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const CartPage: React.FC = () => {
  const [cartItems, setCartItems] = useState<Array<{ _id: string; product: Product }>>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<boolean>(false);
  const [dealId, setDealId] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    address: '',
    city: '',
    region: '',
    zipCode: '',
    country: ''
  });
  const [isLoadingCompanyData, setIsLoadingCompanyData] = useState<boolean>(false);

  // Mutex через ref — не попадает в замыкание useCallback и не ломает exhaustive-deps
  const cartFetchLockRef = useRef(false);
  const companyFetchLockRef = useRef(false);

  const { t, formatCurrency } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Show certificate to all users in cart (buyers need it to evaluate the product)
  const showCertificate = true;

  const fetchCart = useCallback(async (): Promise<void> => {
    if (cartFetchLockRef.current) {
      return;
    }
    cartFetchLockRef.current = true;
    try {
      setIsLoading(true);

      // Add cache-busting headers to prevent 304 responses
      const response = await api.get<{ items: Array<{ _id: string; product: Product | null }> }>('/cart', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      const items = response.data.items || [];

      // Filter out items where the product is null (e.g., deleted from DB)
      const validItems = items.filter(item => item.product);

      // Notify user if some items were invalid and removed
      if (validItems.length < items.length) {
        setError(t('cart.itemsUnavailable'));
      } else {
        setError(null); // Clear previous errors if cart is now valid
      }

      setCartItems(validItems as Array<{ _id: string; product: Product }>);

      // Force recalculation of total amount on the client side using marketPrice from valid items
      const total = validItems.reduce((sum, item) => {
        // item.product is guaranteed to be non-null here due to the filter
        const price = item.product?.marketPrice ?? item.product?.price ?? 0;
        return sum + price;
      }, 0);
      setTotalAmount(total);

    } catch (err: unknown) {
      // Check if it's a 503 error (Service Unavailable)
      if (isAxiosError(err) && err.response?.status === 503) {
        setError(t('cart.serviceUnavailable'));
      } else if (isAxiosError(err) && err.code === 'ERR_NETWORK') {
        setError(t('cart.networkError'));
      } else {
        setError(t('cart.loadCartError'));
      }
    } finally {
      setIsLoading(false);
      cartFetchLockRef.current = false;
    }
  }, [t]);

  const fetchCompanyShippingAddress = useCallback(async (): Promise<void> => {
    if (companyFetchLockRef.current) {
      return;
    }
    companyFetchLockRef.current = true;
    try {
      setIsLoadingCompanyData(true);
      // Add cache-busting headers to prevent 304 responses
      const response = await api.get<{
        details?: {
          shippingAddress?: {
            addressLine1?: string;
            address?: string;
            street?: string;
            city?: string;
            stateProvinceRegion?: string;
            region?: string;
            state?: string;
            province?: string;
            postalCode?: string;
            zipCode?: string;
            zip?: string;
            country?: string;
          };
        };
      }>('/company/profile', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (response.data &&
          response.data.details &&
          response.data.details.shippingAddress) {

        const companyShippingAddress = response.data.details.shippingAddress;

        // Map the address fields to match the exact MongoDB field names
        const addressMapping: ShippingAddress = {
          // Map to addressLine1 as the primary field name
          address: companyShippingAddress.addressLine1 ||
                   companyShippingAddress.address ||
                   companyShippingAddress.street || '',

          // Map directly to city
          city: companyShippingAddress.city || '',

          // Map to stateProvinceRegion as the primary field name
          region: companyShippingAddress.stateProvinceRegion ||
                  companyShippingAddress.region ||
                  companyShippingAddress.state ||
                  companyShippingAddress.province || '',

          // Map to postalCode as the primary field name
          zipCode: companyShippingAddress.postalCode ||
                   companyShippingAddress.zipCode ||
                   companyShippingAddress.zip || '',

          // Map directly to country
          country: companyShippingAddress.country || ''
        };

        // Update shipping address state with mapped data
        setShippingAddress(addressMapping);
      }
    } catch (err: unknown) {
      // Check if it's a 503 error (Service Unavailable)
      if (isAxiosError(err) && err.response?.status === 503) {
        // Don't show error for 503, just ignore it
      } else if (isAxiosError(err) && err.code === 'ERR_NETWORK') {
        // Don't retry network errors
      }
      // Silent fail for other errors
    } finally {
      setIsLoadingCompanyData(false);
      companyFetchLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchCart();
      void fetchCompanyShippingAddress();
    } else {
      navigate('/login');
    }
  }, [isAuthenticated, fetchCart, fetchCompanyShippingAddress, navigate]);

  // GA4 view_cart when cart has line items
  useEffect(() => {
    if (isLoading || cartItems.length === 0) return;
    const products = cartItems.map((i) => i.product).filter(Boolean) as Product[];
    analytics.trackViewCart(products);
  }, [isLoading, cartItems]);

  // Remove item from cart
  const handleRemoveItem = async (itemId: string): Promise<void> => {
    const removed = cartItems.find((i) => i._id === itemId);
    if (removed?.product) {
      analytics.trackRemoveFromCart(removed.product, 1);
    }
    try {
      const response = await api.delete<{
        success?: boolean;
        items?: CartItem[];
        totalAmount?: number;
        message?: string;
      }>(`/cart/remove/${itemId}`);

      // Update local state with response data
      if (response.data && response.data.items) {
        setCartItems(response.data.items);
        setTotalAmount(response.data.totalAmount || 0);
      } else {
        // Fallback: refresh cart if response structure is unexpected
        fetchCart();
      }

      // Dispatch event to update cart counter in header
      window.dispatchEvent(new CustomEvent('cart-updated'));
    } catch (err) {
      setError(t('cart.loadCartError'));
    }
  };

  // Clear entire cart
  const handleClearCart = async (): Promise<void> => {
    try {
      await api.delete<{
        success?: boolean;
        message?: string;
        items?: CartItem[];
        totalAmount?: number;
      }>('/cart/clear');

      // Update local state immediately
      setCartItems([]);
      setTotalAmount(0);

      // Dispatch event to update cart counter in header
      window.dispatchEvent(new CustomEvent('cart-updated'));
    } catch (err) {
      setError(t('cart.loadCartError'));
    }
  };

  // Handle shipping address input changes
  const handleShippingChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setShippingAddress(prevState => ({ ...prevState, [name]: value }));
  };

  // Handle checkout process
  const handleCheckout = async (): Promise<void> => {
    const cartItemIds = cartItems.map(item => item._id);
    if (cartItemIds.length === 0) {
      setError(t('cart.empty'));
      return;
    }

    // Check user verification and activation status
    if (!user) {
      setError(t('auth.bothRequired'));
      return;
    }

    if (!user.emailVerified) {
      setError(t('auth.registrationSuccessNote'));
      return;
    }

    if (!user.phoneVerified) {
      setError(t('phoneVerification.error'));
      return;
    }

    if (!user.isActive) {
      setError(t('cart.companyInactiveMessage'));
      return;
    }

    // Check company status
    const company = typeof user.company === 'object' ? user.company : null;
    if (company && 'status' in company && company.status !== 'active') {
      setError(t('cart.companyInactive'));
      return;
    }

    const productsForCheckout = cartItems.map((i) => i.product).filter(Boolean) as Product[];
    analytics.trackBeginCheckout(productsForCheckout, totalAmount);

    try {
      const response = await api.post<{ buyerDeal: { _id: string } }>('/deal/initiate-from-cart', {
        cartItemIds,
        shippingAddress,
      });

      if (!response.data || !response.data.buyerDeal || !response.data.buyerDeal._id) {
        throw new Error('Invalid response from server during checkout.');
      }

      const newDealId = response.data.buyerDeal._id;
      analytics.trackDealInitiated(newDealId, totalAmount, cartItemIds.length);

      setDealId(newDealId);
      setCheckoutSuccess(true);
      window.dispatchEvent(new CustomEvent('cart-updated'));

    } catch (err: unknown) {
      // Check if this is an email verification error
      if (isAxiosError(err) && err.response?.data?.requiresEmailVerification) {
        setError(t('emailVerification.errorMessage'));
      } else {
      setError(isAxiosError(err) ? (err.response?.data?.message || t('cart.loadCartError')) : t('cart.loadCartError'));
      }
    }
  };

  if (isLoading) {
    return <div className={styles['loading-spinner']}>{t('cart.loadingCompany')}</div>;
  }

  if (checkoutSuccess && dealId) {
    return (
      <Modal
        isOpen={checkoutSuccess}
        onClose={() => navigate(`/deal/${dealId}`)}
        title={t('cart.dealCreated')}
        footer={
          <>
            <Button variant="secondary" onClick={() => navigate('/catalog')}>{t('navigation.catalog')}</Button>
            <Button variant="primary" onClick={() => navigate(`/deal/${dealId}`)}>{t('deals.viewDetails')}</Button>
          </>
        }
      >
        <p>{t('cart.dealCreatedMessage')}</p>
      </Modal>
    );
  }

  return (
    <>
      <PageHeader
        title={t('cart.title') || 'Your Cart'}
        subtitle={t('cart.subtitle')}
      />
      <div className={styles['cart-page']}>
      <div className={styles['cart-container']}>
        <h2>{t('cart.title')}</h2>

        {error && (
          <div className={styles['error-message']}>
            {error}
            <Button
              onClick={() => {
                setError(null); // Clear error message
                fetchCart(); // Retry
              }}
              variant="secondary"
              size="sm"
              className={styles['retry-button']}
            >
              {t('common.retry')}
            </Button>
          </div>
        )}

        {cartItems.length === 0 ? (
          <div className={styles['empty-cart']}>
            <p>{t('cart.empty')}</p>
            <p className={styles['empty-description']}>{t('cart.emptyDescription')}</p>
            <button onClick={() => navigate('/catalog')} className={styles['continue-shopping-button']}>
              {t('cart.browseCatalog')}
            </button>
          </div>
        ) : (
          <>
            <div className={styles['cart-items']}>
              {cartItems.map(item => (
                                  <CartItem
                    key={item._id}
                    item={item}
                    onRemove={handleRemoveItem}
                    showCertificate={showCertificate}
                    isCompanyActive={!!(user?.company && typeof user.company === 'object' && user.company.status === 'active')}
                  />
              ))}
            </div>

                         <div className={styles['cart-summary']}>
               <div className={styles['cart-total']}>
                 <span>{t('cart.total')}:</span>
                 {(user?.company && typeof user.company === 'object' && user.company.status === 'active') ? (
                   <div className={styles['cart-total-amount-block']}>
                     <span>{formatCurrency(totalAmount, 'USD')}</span>
                     <span className={styles['tariffs-note']}>{t('common.tariffsNotIncluded')}</span>
                   </div>
                 ) : (
                   <div className={styles['price-blurred-section']}>
                     <div className={styles['price-blurred-overlay']}>
                       <div className={styles['contact-sales-message']}>
                         <i className="fas fa-lock"></i>
                         <span>{t('cart.contactForPricing')}</span>
                       </div>
                     </div>
                   </div>
                 )}
               </div>

               <Button onClick={handleClearCart} variant="secondary">
                 {t('common.clear')}
               </Button>
             </div>

            <div className={styles['shipping-address']}>
              <h3>{t('cart.shippingAddress')}</h3>
              {isLoadingCompanyData && <p className={styles['loading-message']}>{t('cart.loadingCompany')}</p>}
              {!isLoadingCompanyData &&
               (shippingAddress.address || shippingAddress.city || shippingAddress.country) &&
               <p className={styles['company-address-note']}>
                 {t('cart.companyAddressNote') || 'Pre-filled with your company\'s shipping address. You can edit if needed.'}
               </p>
              }
              <div className={styles['form-group']}>
                <Input
                  label={`${t('cart.address')}*`}
                  name="address"
                  value={shippingAddress.address}
                  onChange={handleShippingChange}
                  required
                />
              </div>

              <div className={styles['form-row']}>
                <div className={styles['form-group']}>
                  <Input
                    label={`${t('cart.city')}*`}
                    name="city"
                    value={shippingAddress.city}
                    onChange={handleShippingChange}
                    required
                  />
                </div>

                <div className={styles['form-group']}>
                  <Input
                    label={t('cart.region')}
                    name="region"
                    value={shippingAddress.region}
                    onChange={handleShippingChange}
                  />
                </div>
              </div>

              <div className={styles['form-row']}>
                <div className={styles['form-group']}>
                  <Input
                    label={t('cart.zipCode')}
                    name="zipCode"
                    value={shippingAddress.zipCode}
                    onChange={handleShippingChange}
                  />
                </div>

                <div className={styles['form-group']}>
                  <Input
                    label={`${t('cart.country')}*`}
                    name="country"
                    value={shippingAddress.country}
                    onChange={handleShippingChange}
                    required
                  />
                </div>
              </div>
            </div>

            <div className={styles['checkout-actions']}>
              <Button onClick={() => navigate('/catalog')} variant="secondary">
                {t('cart.browseCatalog')}
              </Button>
              <Button
                onClick={handleCheckout}
                variant="primary"
                disabled={Boolean(!user || !user.emailVerified || !user.phoneVerified || !user.isActive ||
                          (user.company && typeof user.company === 'object' && user.company.status !== 'active'))}
                title={
                  !user ? t('auth.bothRequired') :
                  !user.emailVerified ? t('emailVerification.errorMessage') :
                  !user.phoneVerified ? t('phoneVerification.error') :
                  !user.isActive ? t('cart.companyInactiveMessage') :
                  (user.company && typeof user.company === 'object' && user.company.status !== 'active') ? t('cart.companyInactive') :
                  t('cart.createDeal')
                }
              >
                {t('cart.createDeal')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
};

export default CartPage;
