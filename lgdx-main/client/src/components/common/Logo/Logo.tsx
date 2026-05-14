import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { Link } from '../../../routes';
import styles from './Logo.module.css';

import logoLightImg from '../../../assets/images/logo for light.png';
import logoDarkImg from '../../../assets/images/logo for dark.webp';

interface LogoProps {
  /** Link to home - if false, renders as span */
  asLink?: boolean;
  /** Additional class name for image/wrapper */
  className?: string;
  /** Class name for the Link when asLink is true */
  linkClassName?: string;
  /** Alt text for image */
  alt?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = { sm: 56, md: 120, lg: 160, xl: 320 };

const Logo: React.FC<LogoProps> = ({ asLink = true, className = '', linkClassName = '', alt = 'LGDeal - Lab-Grown Diamond Exchange', size = 'md' }) => {
  const { theme } = useTheme();
  const logoSrc = theme === 'dark' ? logoDarkImg : logoLightImg;
  const height = sizeMap[size];
  const fetchPriority: 'auto' | 'high' = size === 'lg' || size === 'xl' ? 'high' : 'auto';

  const image = (
    <img
      src={logoSrc}
      alt={alt}
      className={`${styles.logo} ${className}`}
      height={height}
      width={height}
      style={{ height }}
      loading={size === 'lg' || size === 'xl' ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={fetchPriority}
    />
  );

  if (asLink) {
    return (
      <Link to="/" className={`${styles.logoLink} ${linkClassName}`}>
        {image}
      </Link>
    );
  }

  return <span className={styles.logoWrapper}>{image}</span>;
};

export default Logo;
