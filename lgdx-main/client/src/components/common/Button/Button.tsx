/**
 * Button Component - Accessible, performant button with golden ratio sizing
 * 
 * @description
 * Универсальная кнопка с поддержкой множественных вариантов,
 * полной accessibility и оптимизированная для производительности.
 * 
 * @example
 * ```tsx
 * <Button variant="primary" size="md" loading={isLoading}>
 *   Submit
 * </Button>
 * ```
 */

import React, { ButtonHTMLAttributes, ReactNode, forwardRef, memo } from 'react';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Содержимое кнопки */
  children: ReactNode;
  
  /** Вариант оформления */
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'neutral';
  
  /** Размер кнопки (на основе golden ratio) */
  size?: 'sm' | 'md' | 'lg';
  
  /** Состояние загрузки */
  loading?: boolean;
  
  /** Полная ширина */
  fullWidth?: boolean;
  
  /** Левая иконка */
  leftIcon?: ReactNode;
  
  /** Правая иконка */
  rightIcon?: ReactNode;
  
  /** Дополнительный CSS класс */
  className?: string;
  
  /** ARIA label для accessibility */
  'aria-label'?: string;
}

/**
 * Button - Доступная и производительная кнопка
 * 
 * Ключевые особенности:
 * - Полная WCAG 2.1 AA compliance
 * - Keyboard navigation support
 * - Loading states с accessibility
 * - Performance optimized (memo, forwardRef)
 * - Golden ratio sizing
 */
const ButtonComponent = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { 
      children, 
      variant = 'primary', 
      size = 'md', 
      loading = false, 
      fullWidth = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      'aria-label': ariaLabel,
      type = 'button',
      ...props 
    },
    ref
  ) => {
    const buttonClasses = [
      styles.btn,
      styles[variant],
      styles[size],
      fullWidth && styles.fullWidth,
      loading && styles.loading,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // Accessibility: кнопка недоступна при loading
    const isDisabled = disabled || loading;
    
    // Accessibility: ARIA attributes
    const ariaAttributes = {
      'aria-label': ariaLabel,
      'aria-busy': loading || undefined,
      'aria-disabled': isDisabled || undefined,
    };

    return (
      <button 
        ref={ref}
        type={type}
        className={buttonClasses}
        disabled={isDisabled}
        {...ariaAttributes}
        {...props}
      >
        {loading ? (
          <>
            <span className={styles.loader} aria-hidden="true"></span>
            <span className={styles.srOnly}>Loading...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className={styles.leftIcon} aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span className={styles.rightIcon} aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

ButtonComponent.displayName = 'Button';

// Мемоизация для оптимизации производительности
export const Button = memo(ButtonComponent);

export default Button; 