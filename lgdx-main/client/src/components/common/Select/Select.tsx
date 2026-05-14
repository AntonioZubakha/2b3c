import React, { SelectHTMLAttributes, ReactNode } from 'react';
import styles from './Select.module.css';

interface SelectOption {
  value: string | number;
  label: ReactNode;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  variant?: 'default' | 'error' | 'success';
  selectSize?: 'sm' | 'md' | 'lg';
  containerClassName?: string;
  label?: string;
  helperText?: string;
  errorText?: string;
}

const Select: React.FC<SelectProps> = ({
  options,
  className,
  containerClassName,
  variant = 'default',
  selectSize = 'md',
  label,
  helperText,
  errorText,
  id,
  ...props
}) => {
  const selectClasses = [
    styles.select,
    selectSize !== 'md' && styles[selectSize],
    variant !== 'default' && styles[variant],
    className || ''
  ].filter(Boolean).join(' ');

  const wrapperClasses = [
    styles.selectWrapper,
    containerClassName || ''
  ].filter(Boolean).join(' ');

  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={wrapperClasses}>
      {label && (
        <label
          htmlFor={selectId}
          className={styles.selectLabel}
        >
          {label}
        </label>
      )}
      <div className={styles.selectContainer}>
        <select
          id={selectId}
          className={selectClasses}
          {...props}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.selectArrow}></span>
      </div>
      {errorText && variant === 'error' && (
        <span className={styles.errorText}>
          {errorText}
        </span>
      )}
      {helperText && !errorText && (
        <span className={styles.helperText}>
          {helperText}
        </span>
      )}
    </div>
  );
};

export default Select; 