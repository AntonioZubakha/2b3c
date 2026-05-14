import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Path } from '../../routes';
import { useTranslation } from '../../i18n';
import { Notification } from '../../types/notification';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../../api/notificationApi';
import PageContainer from '../../components/common/PageContainer/PageContainer';
import PageHeader from '../../components/common/PageHeader/PageHeader';
import Button from '../../components/common/Button/Button';
import styles from './NotificationsPage.module.css';
import { logger } from '../../utils/logger';

const PAGE_SIZE = 20;

/** SVG иконка конверта */
const EnvelopeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    aria-hidden
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

const NotificationsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async (skip: number, append: boolean) => {
    if (skip === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const res = await getNotifications(PAGE_SIZE, skip);
      setTotal(res.total);
      setNotifications(prev => append ? [...prev, ...res.notifications] : res.notifications);
    } catch (e) {
      logger.error(
        'Failed to fetch notifications',
        e instanceof Error ? e : new Error(String(e))
      );
      setError(t('common.error', { defaultValue: 'Something went wrong' }));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  useEffect(() => {
    loadNotifications(0, false);
  }, [loadNotifications]);

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      logger.error(
        'Failed to mark all notifications as read',
        e instanceof Error ? e : new Error(String(e))
      );
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.read) {
        await markNotificationAsRead(notification._id);
        setNotifications(prev =>
          prev.map(n => (n._id === notification._id ? { ...n, read: true } : n))
        );
      }
      if (notification.actionUrl) {
        navigate(notification.actionUrl as Path);
      } else if (notification.dealId) {
        navigate(`/deal/${notification.dealId}`);
      }
    } catch (e) {
      logger.error(
        'Failed to mark notification as read',
        e instanceof Error ? e : new Error(String(e))
      );
    }
  };

  const handleLoadMore = () => {
    if (loadingMore || notifications.length >= total) return;
    loadNotifications(notifications.length, true);
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return t('notifications.justNow');
    if (diffMins < 60) return t('notifications.minsAgo', { defaultValue: '{{count}}m ago', count: diffMins });
    if (diffHours < 24) return t('notifications.hoursAgo', { defaultValue: '{{count}}h ago', count: diffHours });
    if (diffDays < 7) return t('notifications.daysAgo', { defaultValue: '{{count}}d ago', count: diffDays });
    return date.toLocaleDateString();
  };

  const getPriorityClass = (priority: string): string => {
    switch (priority) {
      case 'urgent': return styles.priorityUrgent;
      case 'high': return styles.priorityHigh;
      case 'medium': return styles.priorityMedium;
      default: return styles.priorityLow;
    }
  };

  const hasMore = notifications.length < total;

  return (
    <PageContainer maxWidth="2xl" padding="lg">
      <PageHeader
        title={t('notifications.pageTitle')}
        description={t('notifications.pageDescription')}
      >
        {notifications.some(n => !n.read) && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleMarkAllAsRead}
            className={styles.markAllButton}
          >
            {t('notifications.markAllAsRead')}
          </Button>
        )}
      </PageHeader>

      <div className={styles.content}>
        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {loading ? (
          <div className={styles.loading}>{t('common.loading')}</div>
        ) : notifications.length === 0 ? (
          <div className={styles.empty}>
            <EnvelopeIcon className={styles.emptyIcon} />
            <p>{t('notifications.noNotifications')}</p>
          </div>
        ) : (
          <>
            <ul className={styles.list}>
              {notifications.map(notification => (
                <li
                  key={notification._id}
                  className={`${styles.item} ${!notification.read ? styles.unread : ''} ${getPriorityClass(notification.priority)}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNotificationClick(notification);
                    }
                  }}
                >
                  <div className={styles.icon}>
                    <EnvelopeIcon className={styles.iconSvg} />
                  </div>
                  <div className={styles.body}>
                    <div className={styles.title}>{notification.title}</div>
                    <div className={styles.message}>{notification.message}</div>
                    {notification.dealNumber && (
                      <div className={styles.deal}>Deal: {notification.dealNumber}</div>
                    )}
                    <div className={styles.time}>{formatTimestamp(notification.createdAt)}</div>
                  </div>
                  {!notification.read && <div className={styles.unreadDot} aria-hidden />}
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className={styles.loadMoreWrap}>
                <button
                  type="button"
                  className={styles.loadMoreButton}
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? t('common.loading')
                    : t('notifications.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
};

export default NotificationsPage;
