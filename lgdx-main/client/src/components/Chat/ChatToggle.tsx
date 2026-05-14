import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { analytics } from '../../utils/analytics';
import ChatWidget from './ChatWidget';
import styles from './ChatToggle.module.css';

const ONBOARDING_AUTO_OPEN_DISMISSED_PREFIX = 'lgdx_chat_onboarding_auto_open_dismissed_';

function isOnboardingAutoOpenDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(`${ONBOARDING_AUTO_OPEN_DISMISSED_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

function persistOnboardingAutoOpenDismissed(userId: string): void {
  try {
    localStorage.setItem(`${ONBOARDING_AUTO_OPEN_DISMISSED_PREFIX}${userId}`, '1');
  } catch {
    // ignore quota / private mode
  }
}

const ChatToggle: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [autoOpenChat, setAutoOpenChat] = useState(false);
  const onboardingAutoOpenAppliedRef = useRef(false);

  // Init: for newly registered users (<24h) auto-open chat with welcome
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!isAuthenticated) {
        onboardingAutoOpenAppliedRef.current = false;
        setOnboardingChecked(false);
        setAutoOpenChat(false);
        setIsOpen(false);
        setUnreadCount(0);
        setIsVisible(false);
        return;
      }

      try {
        const response = await api.post('/chat/onboarding/init');
        if (cancelled) return;

        const shouldAutoOpen = response.data?.data?.shouldAutoOpenChat === true;
        setAutoOpenChat(shouldAutoOpen);
        setOnboardingChecked(true);
      } catch {
        if (cancelled) return;
        // Fallback: just show the toggle later
        setAutoOpenChat(false);
        setOnboardingChecked(true);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Open chat once for onboarding when the server says so, unless the user dismissed it earlier
  useEffect(() => {
    if (!onboardingChecked || !autoOpenChat || !isAuthenticated || !user?._id) return;
    if (isOnboardingAutoOpenDismissed(user._id)) return;
    if (onboardingAutoOpenAppliedRef.current) return;
    onboardingAutoOpenAppliedRef.current = true;
    setIsVisible(true);
    setIsOpen(true);
    analytics.trackSupportChatOpen('onboarding_auto');
  }, [onboardingChecked, autoOpenChat, isAuthenticated, user?._id]);

  // Show chat toggle: guests after short delay; regular users after a few seconds
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!isAuthenticated) {
      timer = setTimeout(() => setIsVisible(true), 1000);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    // For logged-in users we wait until onboarding check finishes.
    if (!onboardingChecked) return;
    // When onboarding auto-open ran, ref is set and isVisible was set there — skip this timer.
    if (onboardingAutoOpenAppliedRef.current) return;

    timer = setTimeout(() => setIsVisible(true), 3000);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, onboardingChecked]);

  // Check for unread messages
  useEffect(() => {
    if (isAuthenticated && !isOpen) {
      checkUnreadMessages();
      const interval = setInterval(checkUnreadMessages, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, isOpen]);

  const checkUnreadMessages = async () => {
    try {
      const response = await api.get('/chat/unread-count');
      if (response.data.success) {
        setUnreadCount(response.data.data.count);
      }
    } catch (error) {
      // Silent fail
    }
  };

  const handleToggle = () => {
    const opening = !isOpen;
    if (opening) {
      analytics.trackSupportChatOpen('toggle');
    }
    if (isOpen && autoOpenChat && user?._id) {
      persistOnboardingAutoOpenDismissed(user._id);
    }
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0); // Clear unread count when opening chat
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        className={`${styles.chatToggle} ${isOpen ? styles.open : ''}`}
        onClick={handleToggle}
        aria-label={isOpen ? 'Close chat' : 'Open support chat'}
      >
        <div className={styles.toggleIcon}>
          {isOpen ? (
            <i className="fas fa-times"></i>
          ) : (
            <i className="fas fa-comments"></i>
          )}
        </div>
        
        {unreadCount > 0 && !isOpen && (
          <div className={styles.unreadBadge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
        
        <div className={styles.togglePulse}></div>
      </button>

      {/* Chat Widget */}
      <ChatWidget isOpen={isOpen} onToggle={handleToggle} />
    </>
  );
};

export default ChatToggle;
