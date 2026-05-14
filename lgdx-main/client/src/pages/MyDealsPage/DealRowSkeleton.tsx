import React from 'react';
import styles from './DealRowSkeleton.module.css';

interface DealRowSkeletonProps {
  columns: number;
}

const DealRowSkeleton: React.FC<DealRowSkeletonProps> = ({ columns }) => {
  return (
    <tr className={styles.skeletonRow}>
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index}>
          <div className={styles.skeletonLine}></div>
        </td>
      ))}
    </tr>
  );
};

export default DealRowSkeleton; 