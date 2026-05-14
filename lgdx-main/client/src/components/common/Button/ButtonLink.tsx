import React from 'react';
import styles from './Button.module.css';
import { ButtonProps } from './Button';
import { Link, LinkProps } from '../../../routes';

type ButtonLinkProps = LinkProps & Omit<ButtonProps, 'onClick' | 'disabled' | 'loading'>;

const ButtonLink: React.FC<ButtonLinkProps> = ({
  to,
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  ...props
}) => {
  const buttonClasses = [
    styles.btn,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    className || ''
  ].filter(Boolean).join(' ');

  return (
    <Link to={to} className={buttonClasses} {...props}>
      {children}
    </Link>
  );
};

export default ButtonLink; 