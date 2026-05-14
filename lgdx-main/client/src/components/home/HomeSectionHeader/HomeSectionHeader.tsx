import React, { memo } from 'react';
import styles from './HomeSectionHeader.module.css';

type Props = {
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
  className?: string;
};

const HomeSectionHeader: React.FC<Props> = memo(({ id, eyebrow, title, subtitle, align = 'center', className }) => {
  return (
    <header
      className={`${styles.header} ${align === 'left' ? styles.alignLeft : styles.alignCenter} ${className ?? ''}`.trim()}
    >
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
});

HomeSectionHeader.displayName = 'HomeSectionHeader';

export default HomeSectionHeader;

