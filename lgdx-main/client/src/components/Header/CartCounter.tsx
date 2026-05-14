import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './CartCounter.module.css';
import { Link } from '../../routes';
import { useTranslation } from '../../i18n';
import api from '../../api';
import { isAxiosError } from 'axios';

// Интерфейс для события обновления корзины
interface CartUpdateEvent extends Event {
  detail?: unknown;
}

// Расширяем Window для включения кастомных событий
declare global {
  interface WindowEventMap {
    'cart-updated': CartUpdateEvent;
  }
}

interface CartItem {
  _id: string;
  product: unknown; // Product data not used in CartCounter, only count matters
  quantity: number;
}

interface CartApiResponse {
  items: CartItem[];
  total?: number;
}

const CartCounter: React.FC = () => {
  const { t } = useTranslation();
  const [cartCount, setCartCount] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const prevCountRef = useRef<number>(0);

  const fetchCartCount = useCallback(async () => {
    try {
      const response = await api.get<CartApiResponse>('/cart', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      const items = response.data.items || [];
      
      // Суммируем quantity по всем товарам
      const total = items.reduce((sum: number, item: CartItem) => sum + (item.quantity || 1), 0);
      
      if (total !== prevCountRef.current) {
        setIsUpdating(true);
        setTimeout(() => setIsUpdating(false), 600);
        prevCountRef.current = total;
      }
      setCartCount(total);
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 503) {
        return;
      }
      prevCountRef.current = 0;
      setCartCount(0);
    }
  }, []);

  const handleCartUpdate = useCallback(() => {
    void fetchCartCount();
  }, [fetchCartCount]);

  useEffect(() => {
    void fetchCartCount();
    window.addEventListener('cart-updated', handleCartUpdate);
    return () => {
      window.removeEventListener('cart-updated', handleCartUpdate);
    };
  }, [fetchCartCount, handleCartUpdate]);

  const ariaLabel = cartCount > 0
    ? `${t('navigation.cart')} (${cartCount})`
    : t('navigation.cart');

  return (
    <Link to="/cart" className={styles.cartCounterLink} aria-label={ariaLabel}>
      <div className={`${styles.cartCounter} ${isUpdating ? styles.updated : ''}`}>
        <span className={styles.iconWrapper}>
          <i className="fas fa-shopping-cart" aria-hidden="true"></i>
          {cartCount > 0 && <span className={styles['cart-badge']} aria-hidden="true">{cartCount}</span>}
        </span>
      </div>
    </Link>
  );
};

export default CartCounter; 