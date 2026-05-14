import React, { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: 'success' | 'danger' | 'warning' | 'neutral' | 'info' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  outline?: boolean;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  outline = false,
  className,
  ...props
}) => {

  const badgeClasses = [
    styles.badge,
    styles[variant],
    size !== 'md' && styles[size],
    outline && styles.outline,
    className || ''
  ].filter(Boolean).join(' ');

  return (
    <span className={badgeClasses} {...props}>
      {children}
    </span>
  );
};

export default Badge; 