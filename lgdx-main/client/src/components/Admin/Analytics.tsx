import React, { useState, useEffect } from 'react';
import styles from './Analytics.module.css';
import api from '../../api';

interface UserActivity {
  totalUsers: number;
  activeUsers: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  newRegistrations: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  companies: {
    total: number;
    newThisMonth: number;
  };
  pageViews: {
    total: number;
    byPage: Array<{ page: string; views: number }>;
  };
  engagement: {
    usersWithDeals: number;
    engagementRate: number;
  };
}

function Analytics(): React.ReactElement {
  const [userActivity, setUserActivity] = useState<UserActivity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange]);

  const fetchAnalyticsData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch user activity data
      const userActivityData = (await api.get('/analytics/user-activity')).data;
      const pageViewsData = (await api.get('/analytics/page-views')).data;

      setUserActivity(userActivityData.data);
      
      // Update page views with real data if available
      if (pageViewsData.data && pageViewsData.data.pageViews) {
        setUserActivity(prev => prev ? {
          ...prev,
          pageViews: {
            total: pageViewsData.data.totalViews || 0,
            byPage: pageViewsData.data.pageViews.map((pv: { page: string; views: number }) => ({
              page: pv.page,
              views: pv.views
            }))
          }
        } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getActiveUsersCount = () => {
    if (!userActivity) return 0;
    switch (timeRange) {
      case 'today': return userActivity.activeUsers.today;
      case 'week': return userActivity.activeUsers.thisWeek;
      case 'month': return userActivity.activeUsers.thisMonth;
      default: return 0;
    }
  };

  const getNewRegistrationsCount = () => {
    if (!userActivity) return 0;
    switch (timeRange) {
      case 'today': return userActivity.newRegistrations.today;
      case 'week': return userActivity.newRegistrations.thisWeek;
      case 'month': return userActivity.newRegistrations.thisMonth;
      default: return 0;
    }
  };

  return (
    <div className={styles.analyticsContainer}>
      <div className={styles.analyticsHeader}>
        <h3>User Analytics Dashboard</h3>
        <div className={styles.timeRangeSelector}>
          <button
            className={`${styles.timeButton} ${timeRange === 'today' ? styles.active : ''}`}
            onClick={() => setTimeRange('today')}
          >
            Today
          </button>
          <button
            className={`${styles.timeButton} ${timeRange === 'week' ? styles.active : ''}`}
            onClick={() => setTimeRange('week')}
          >
            This Week
          </button>
          <button
            className={`${styles.timeButton} ${timeRange === 'month' ? styles.active : ''}`}
            onClick={() => setTimeRange('month')}
          >
            This Month
          </button>
        </div>
      </div>

      {error ? (
        <>
          <div className={styles.errorMessage}>Error: {error}</div>
          <button type="button" onClick={fetchAnalyticsData} className={styles.retryButton}>
            Retry
          </button>
        </>
      ) : isLoading ? (
        <div className={styles.loadingMessage}>Loading analytics data...</div>
      ) : (
      <div className={styles.metricsGrid}>
        {/* User Activity Metrics */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <i className="fas fa-users"></i>
            <h4>User Activity</h4>
          </div>
          <div className={styles.metricContent}>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Total Users:</span>
              <span className={styles.metricValue}>{userActivity?.totalUsers || 0}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Active Users:</span>
              <span className={styles.metricValue}>{getActiveUsersCount()}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>New Registrations:</span>
              <span className={styles.metricValue}>{getNewRegistrationsCount()}</span>
            </div>
          </div>
        </div>

        {/* Company Metrics */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <i className="fas fa-building"></i>
            <h4>Company Statistics</h4>
          </div>
          <div className={styles.metricContent}>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Total Companies:</span>
              <span className={styles.metricValue}>{userActivity?.companies?.total || 0}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>New This Month:</span>
              <span className={styles.metricValue}>{userActivity?.companies?.newThisMonth || 0}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Engagement Rate:</span>
              <span className={styles.metricValue}>{userActivity?.engagement?.engagementRate || 0}%</span>
            </div>
          </div>
        </div>

        {/* Engagement Metrics */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <i className="fas fa-handshake"></i>
            <h4>Platform Engagement</h4>
          </div>
          <div className={styles.metricContent}>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Users with Deals:</span>
              <span className={styles.metricValue}>{userActivity?.engagement?.usersWithDeals || 0}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Active Rate:</span>
              <span className={styles.metricValue}>
                {userActivity?.totalUsers && getActiveUsersCount() 
                  ? Math.round((getActiveUsersCount() / userActivity.totalUsers) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Page Views */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <i className="fas fa-chart-line"></i>
            <h4>Page Views</h4>
          </div>
          <div className={styles.metricContent}>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Total Views:</span>
              <span className={styles.metricValue}>{userActivity?.pageViews?.total || 0}</span>
            </div>
            <div className={styles.pageViewsList}>
              {userActivity?.pageViews?.byPage?.slice(0, 5).map((page, index) => (
                <div key={index} className={styles.pageViewItem}>
                  <span className={styles.pageName}>{page.page}</span>
                  <span className={styles.pageViews}>{page.views}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default Analytics; 