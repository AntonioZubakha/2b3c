import React from 'react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  className?: string;
  children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  description,
  icon,
  className = '',
  children
}) => {
  return (
    <div className={`${styles.pageHeader} ${className}`}>
      <div className={styles.headerContent}>
        {icon && (
          <div className={styles.headerIcon}>
            <i className={icon}></i>
          </div>
        )}
        
        <div className={styles.headerText}>
          <h1 className={styles.pageTitle}>{title}</h1>
          
          {subtitle && (
            <p className={styles.pageSubtitle}>{subtitle}</p>
          )}
          
          {description && (
            <p className={styles.pageDescription}>{description}</p>
          )}
        </div>
      </div>
      
      {children && (
        <div className={styles.headerActions}>
          {children}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
