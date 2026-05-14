import React from 'react';
import styles from './PageSection.module.css';

export interface PageSectionProps {
  title?: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'glass' | 'transparent';
  spacing?: 'sm' | 'md' | 'lg' | 'xl';
}

const PageSection: React.FC<PageSectionProps> = ({
  title,
  subtitle,
  className = '',
  children,
  variant = 'default',
  spacing = 'lg'
}) => {
  const sectionClasses = [
    styles.pageSection,
    styles[variant],
    styles[`spacing-${spacing}`],
    className
  ].filter(Boolean).join(' ');

  return (
    <section className={sectionClasses}>
      {(title || subtitle) && (
        <div className={styles.sectionHeader}>
          {title && (
            <h2 className={styles.sectionTitle}>{title}</h2>
          )}
          {subtitle && (
            <p className={styles.sectionSubtitle}>{subtitle}</p>
          )}
        </div>
      )}
      
      <div className={styles.sectionContent}>
        {children}
      </div>
    </section>
  );
};

export default PageSection;
