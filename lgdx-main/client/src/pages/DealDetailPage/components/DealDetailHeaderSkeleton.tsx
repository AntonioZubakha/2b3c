import React from 'react';
import styles from './DealDetailHeader.module.css';

const DealDetailHeaderSkeleton: React.FC = () => {
  return (
    <div className={styles.skeletonHeader}>
      <div className={styles.headerMainContent}>
        <div className={styles.growCenter}>
          <div className={`${styles.skeletonLine} ${styles.dealCommonHeader} h2`}></div>
          <div className={`${styles.skeletonLine} ${styles.dealCreationDate}`}></div>
        </div>
      </div>
      <div className={styles.skeletonStepper}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={styles.skeletonStep}>
            <div className={`${styles.skeletonLine} ${styles.icon}`}></div>
            <div className={`${styles.skeletonLine} ${styles.label}`}></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DealDetailHeaderSkeleton; 