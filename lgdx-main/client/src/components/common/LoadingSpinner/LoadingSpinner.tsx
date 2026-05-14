import React from 'react';
import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  message = 'Loading...',
  fullScreen = false 
}) => {
  const containerClass = fullScreen ? styles.fullScreen : styles.container;
  
  return (
    <div className={containerClass}>
      <div className={styles.spinnerContainer}>
        <div className={`${styles.spinner} ${styles[size]}`}></div>
        {message && <p className={styles.message}>{message}</p>}
      </div>
    </div>
  );
};

export default LoadingSpinner; 