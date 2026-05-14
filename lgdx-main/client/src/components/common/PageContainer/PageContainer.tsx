import React from 'react';
import styles from './PageContainer.module.css';

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  background?: 'transparent' | 'glass' | 'gradient';
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = '',
  maxWidth = '3xl',
  padding = 'lg',
  background = 'transparent'
}) => {
  const containerClasses = [
    styles.pageContainer,
    styles[`maxWidth-${maxWidth}`],
    styles[`padding-${padding}`],
    styles[`background-${background}`],
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {children}
    </div>
  );
};

export default PageContainer;
