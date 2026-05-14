import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Path } from '../../routes';
import { Notification, NotificationType } from '../../types/notification';
import {
  getUnreadCount,
  getUnreadNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../../api/notificationApi';
import { useTranslation } from '../../i18n';
import { useSocket } from '../../hooks/useSocket';
import notificationIcon from '../../assets/images/notification.png';
import styles from './NotificationBell.module.css';

/** SVG иконка конверта для пустого состояния */
const EnvelopeIcon: React.FC<{ className?: string; 'aria-hidden'?: boolean }> = ({ className, 'aria-hidden': ariaHidden }) => (
  <svg
    className={className}
    aria-hidden={ariaHidden}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <path d="M22 6l-10 7L2 6" />
  </svg>
);

/** Emoji-иконка по типу уведомления */
const getNotificationEmoji = (type: NotificationType): string => {
  switch (type) {
    case 'deal_created':        return '🆕';
    case 'deal_assigned':       return '📌';
    case 'deal_reassigned':     return '🔄';
    case 'request_approved':    return '✅';
    case 'request_rejected':    return '❌';
    case 'invoice_uploaded':    return '📄';
    case 'invoice_accepted':    return '✅';
    case 'invoice_rejected':    return '❌';
    case 'payment_confirmed':   return '💰';
    case 'order_shipped':       return '🚚';
    case 'delivery_confirmed':  return '📦';
    case 'alternative_proposed':                    return '🔄';
    case 'alternative_accepted':                    return '✅';
    case 'alternative_rejected':                    return '❌';
    case 'quality_rejected':                        return '❌';
    case 'quality_rejected_alternative_selected':   return '🔁';
    case 'quality_approved':                        return '✅';
    case 'alternative_auto_assigned':               return '🔁';
    case 'no_alternatives_available':               return '⚠️';
    case 'ready_for_shipping':  return '📦';
    case 'stone_received':      return '💎';
    case 'shipping_cost_updated': return '📦';
    case 'import_tariff_updated': return '📋';
    case 'deal_cancelled':      return '❌';
    default:                    return '📬';
  }
};

/**
 * NotificationBell — bell icon + real-time dropdown.
 * Real-time delivery via Socket.IO (`new_notification`); REST polling every 30 s as fallback.
 */
const NotificationBell: React.FC = () => {
  const [unreadCount, setUnreadCount]       = useState<number>(0);
  const [notifications, setNotifications]   = useState<Notification[]>([]);
  const [isOpen, setIsOpen]                 = useState(false);
  const [isLoading, setIsLoading]           = useState(false);
  const dropdownRef                         = useRef<HTMLDivElement>(null);
  const mountedRef                          = useRef(true);
  const navigate                            = useNavigate();
  const { t, formatDate }                = useTranslation();
  const socket                              = useSocket('/');

  // Track mounted state to avoid setState after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ─── REST polling: unread count every 30 s (acts as reconciliation) ───────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await getUnreadCount();
      if (mountedRef.current) setUnreadCount(response.count);
    } catch {
      // Silent — polling failures shouldn't surface as errors
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // ─── Socket.IO: real-time new_notification ────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification: Notification) => {
      if (!mountedRef.current) return;
      setUnreadCount(prev => prev + 1);
      // Prepend so it's visible immediately if dropdown is open
      setNotifications(prev => [notification, ...prev]);
    };

    socket.on('new_notification', handleNewNotification);
    return () => { socket.off('new_notification', handleNewNotification); };
  }, [socket]);

  // ─── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // ─── Fetch full unread list + sync count when dropdown opens ─────────────
  const fetchUnreadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getUnreadNotifications();
      if (!mountedRef.current) return;
      setNotifications(response.notifications);
      // Sync badge with DB truth (reconciles any WS drift)
      setUnreadCount(response.count);
    } catch {
      // Keep stale data on error
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const handleBellClick = () => {
    if (!isOpen) fetchUnreadNotifications();
    setIsOpen(prev => !prev);
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.read) {
        await markNotificationAsRead(notification._id);
        if (mountedRef.current) {
          setUnreadCount(prev => Math.max(0, prev - 1));
          setNotifications(prev =>
            prev.map(n => n._id === notification._id ? { ...n, read: true } : n)
          );
        }
      }
      if (notification.actionUrl) {
        setIsOpen(false);
        navigate(notification.actionUrl as Path);
      } else if (notification.dealId) {
        setIsOpen(false);
        navigate(`/deal/${notification.dealId}`);
      }
    } catch {
      // Silent — mark-as-read failures shouldn't block navigation
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      if (mountedRef.current) {
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch {
      // Silent
    }
  };

  const getPriorityClass = (priority: string): string => {
    switch (priority) {
      case 'urgent': return styles.priorityUrgent;
      case 'high':   return styles.priorityHigh;
      case 'medium': return styles.priorityMedium;
      default:       return styles.priorityLow;
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date    = new Date(timestamp);
    const now     = new Date();
    const diffMs  = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffH   = Math.floor(diffMs / 3_600_000);
    const diffD   = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1)  return t('notifications.justNow');
    if (diffMin < 60) return t('notifications.minsAgo', { count: diffMin });
    if (diffH   < 24) return t('notifications.hoursAgo', { count: diffH });
    if (diffD   < 7)  return t('notifications.daysAgo', { count: diffD });
    return formatDate(date, 'short');
  };

  return (
    <div className={styles.notificationBell} ref={dropdownRef}>
      <button
        className={styles.bellButton}
        onClick={handleBellClick}
        aria-label={t('notifications.bellTitle')}
        type="button"
      >
        <span className={styles.bellIconWrapper} aria-hidden>
          <span
            className={styles.bellIcon}
            style={{ maskImage: `url(${notificationIcon})`, WebkitMaskImage: `url(${notificationIcon})` }}
          />
        </span>
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h3>{t('notifications.bellTitle')}</h3>
            {notifications.some(n => !n.read) && (
              <button className={styles.markAllButton} onClick={handleMarkAllAsRead}>
                {t('notifications.markAllAsRead')}
              </button>
            )}
          </div>

          <div className={styles.notificationList}>
            {isLoading ? (
              <div className={styles.loading}>{t('notifications.loading')}</div>
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>
                <EnvelopeIcon className={styles.emptyIcon} aria-hidden />
                <p>{t('notifications.noNewNotifications')}</p>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification._id}
                  className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''} ${getPriorityClass(notification.priority)}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={styles.notificationIcon} aria-hidden>
                    {getNotificationEmoji(notification.type)}
                  </div>
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationTitle}>
                      {notification.title}
                    </div>
                    <div className={styles.notificationMessage}>
                      {notification.message}
                    </div>
                    {notification.dealNumber && (
                      <div className={styles.notificationDeal}>
                        {t('notifications.dealLabel', { dealNumber: notification.dealNumber })}
                      </div>
                    )}
                    <div className={styles.notificationTime}>
                      {formatTimestamp(notification.createdAt)}
                    </div>
                  </div>
                  {!notification.read && (
                    <div className={styles.unreadIndicator} />
                  )}
                </div>
              ))
            )}
          </div>

          <div className={styles.dropdownFooter}>
            <button
              className={styles.viewAllButton}
              onClick={() => {
                setIsOpen(false);
                navigate('/notifications');
              }}
            >
              {t('notifications.viewAllNotifications')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
