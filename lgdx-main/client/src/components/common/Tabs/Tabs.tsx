import React, { ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  key: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  closable?: boolean;
  content?: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabKey: string) => void;
  onTabClose?: (tabKey: string) => void;
  className?: string;
  fullWidth?: boolean;
  showContent?: boolean;
  newTabKey?: string | null; // Key of newly created tab for animation
}

const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  onTabClose,
  className = '',
  fullWidth = false,
  showContent = true,
  newTabKey = null,
}) => {
  const handleTabClick = (tabKey: string) => {
    if (onTabChange) {
      onTabChange(tabKey);
    }
  };

  const handleCloseClick = (e: React.MouseEvent, tabKey: string) => {
    e.stopPropagation();
    if (onTabClose) {
      onTabClose(tabKey);
    }
  };

  const getTabButtonClass = (tab: TabItem) => {
    const baseClass = styles.tabButton;
    const activeClass = tab.key === activeTab ? styles.active : '';
    const disabledClass = tab.disabled ? 'disabled' : '';
    return `${baseClass} ${activeClass} ${disabledClass}`.trim();
  };

  const getTabWrapperClass = (tab: TabItem) => {
    const baseClass = styles.tabButtonWrapper;
    const activeClass = tab.key === activeTab ? styles.active : '';
    const newTabClass = newTabKey === tab.key ? styles.newTab : '';
    return `${baseClass} ${activeClass} ${newTabClass}`.trim();
  };

  const getContainerClass = () => {
    const baseClass = styles.tabsContainer;
    const fullWidthClass = fullWidth ? styles.fullWidth : '';
    return `${baseClass} ${fullWidthClass} ${className}`.trim();
  };

  const activeTabContent = tabs.find(tab => tab.key === activeTab)?.content;

  return (
    <div className={getContainerClass()}>
      {tabs.map((tab) => (
        <div key={tab.key} className={getTabWrapperClass(tab)}>
          <button
            className={getTabButtonClass(tab)}
            onClick={() => !tab.disabled && handleTabClick(tab.key)}
            disabled={tab.disabled}
            title={tab.label}
          >
            {tab.icon && <i className={tab.icon}></i>}
            <span className={styles.tabButtonLabel} data-label={tab.label}>
              {tab.label}
            </span>
          </button>
          {tab.closable && onTabClose && (
            <button
              className={styles.closeTabButton}
              onClick={(e) => handleCloseClick(e, tab.key)}
              title={`Close ${tab.label} tab`}
              aria-label={`Close ${tab.label} tab`}
            >
              <i className="fas fa-times" aria-hidden="true"></i>
            </button>
          )}
        </div>
      ))}
      
      {showContent && activeTabContent && (
        <div className={styles.tabContent}>
          {activeTabContent}
        </div>
      )}
    </div>
  );
};

export default Tabs; 