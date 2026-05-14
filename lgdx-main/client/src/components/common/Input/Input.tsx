import React, { InputHTMLAttributes, TextareaHTMLAttributes, useState } from 'react';
import styles from './Input.module.css';

// Base props common to both input and textarea
interface BaseInputProps {
  variant?: 'default' | 'error' | 'success';
  inputSize?: 'sm' | 'md' | 'lg';
  containerClassName?: string;
  label?: string;
  helperText?: string;
  errorText?: string;
  className?: string;
  id?: string;
  leftIcon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  /** When true and type="password", shows a toggle to reveal/hide password */
  showPasswordToggle?: boolean;
}

// Props for a standard input element
type InputElementProps = BaseInputProps & {
  type?: React.HTMLInputTypeAttribute;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

// Props for a textarea element
type TextareaElementProps = BaseInputProps & {
  type: 'textarea';
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>;

// Union type for the component's props
type InputProps = InputElementProps | TextareaElementProps;

const Input: React.FC<InputProps> = ({
  className,
  containerClassName,
  variant = 'default',
  inputSize = 'md',
  label,
  helperText,
  errorText,
  id,
  type = 'text',
  leftIcon,
  rightAddon,
  showPasswordToggle = false,
  ...props
}) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPasswordField = type === 'password' && showPasswordToggle;
  const effectiveType = isPasswordField ? (isPasswordVisible ? 'text' : 'password') : type;
  const effectiveRightAddon = isPasswordField ? (
    <button
      type="button"
      className={styles.passwordToggle}
      onClick={() => setIsPasswordVisible((v) => !v)}
      tabIndex={-1}
      aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
      title={isPasswordVisible ? 'Hide password' : 'Show password'}
    >
      <i className={isPasswordVisible ? 'fas fa-eye-slash' : 'fas fa-eye'} aria-hidden />
    </button>
  ) : rightAddon;

  const inputClasses = [
    styles.input,
    effectiveType === 'textarea' && styles.textarea,
    inputSize !== 'md' && styles[inputSize],
    variant !== 'default' && styles[variant],
    leftIcon && styles.withLeft,
    effectiveRightAddon && styles.withRight,
    className || ''
  ].filter(Boolean).join(' ');

  const sizeWrapperClass = inputSize === 'lg' ? styles.sizeLg : inputSize === 'sm' ? styles.sizeSm : '';
  const wrapperClasses = [
    styles.inputWrapper,
    sizeWrapperClass,
    containerClassName || ''
  ].filter(Boolean).join(' ');

  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

  const renderInput = () => {
    if (type === 'textarea') {
      const { ...rest } = props as TextareaElementProps;
      return (
        <textarea
          id={inputId}
          className={inputClasses}
          {...rest}
        />
      );
    }

    if (type === 'file') {
      const { value, ...rest } = props as InputElementProps;
      const fileName = (value as string)?.split('\\').pop() || 'Choose a file...';

      return (
        <div className={styles.fileInputContainer}>
          <input
            id={inputId}
            type="file"
            className={styles.fileInput}
            {...rest}
          />
          <label htmlFor={inputId} className={styles.fileInputLabel}>
            <span className={styles.fileInputButton}>Browse</span>
            <span className={styles.fileName}>{fileName}</span>
          </label>
        </div>
      );
    }

    const { ...rest } = props as InputElementProps;
    return (
      <input
        id={inputId}
        type={effectiveType}
        className={inputClasses}
        {...rest}
      />
    );
  };

  return (
    <div className={wrapperClasses}>
      {label && (
        <label
          htmlFor={inputId}
          className={styles.inputLabel}
        >
          {label}
        </label>
      )}
      <div className={styles.inputInner}>
        {leftIcon && (
          <span className={styles.leftIcon} aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {renderInput()}
        {effectiveRightAddon && (
          <span className={styles.rightAddon}>
            {effectiveRightAddon}
          </span>
        )}
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

export default Input; 