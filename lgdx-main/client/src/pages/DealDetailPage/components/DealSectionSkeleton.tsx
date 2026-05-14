import React from 'react';
import styles from './DealSectionSkeleton.module.css';

interface DealSectionSkeletonProps {
  lines?: number;
  hasButton?: boolean;
}

const DealSectionSkeleton: React.FC<DealSectionSkeletonProps> = ({ lines = 3, hasButton = false }) => {
  return (
    <div className={styles.dealSectionSkeleton}>
      <div className={`${styles.skeletonLine} ${styles.title}`}></div>
      {Array.from({ length: lines - 1 }).map((_, index) => (
        <div key={index} className={styles.skeletonLine}></div>
      ))}
      {hasButton && <div className={`${styles.skeletonLine} ${styles.button}`}></div>}
    </div>
  );
};

export default DealSectionSkeleton; 