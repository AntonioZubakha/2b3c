import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './PortalTooltip.module.css';

interface PortalTooltipProps {
  children: React.ReactNode;
  content: string;
  className?: string;
  disabled?: boolean;
  maxWidth?: number;
}

/**
 * Portal-based tooltip component that renders outside the DOM tree
 * to avoid z-index and overflow issues.
 *
 * Accessibility:
 * - Trigger is keyboard-reachable via tabIndex
 * - Tooltip id is linked to trigger via aria-describedby
 * - Tooltip is shown on both hover and focus
 */
export const PortalTooltip: React.FC<PortalTooltipProps> = ({
  children,
  content,
  className = '',
  disabled = false,
  maxWidth = 320,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  const show = () => {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
    setIsVisible(true);
  };

  const hide = () => setIsVisible(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      isVisible ? hide() : show();
    }
    if (e.key === 'Escape') {
      hide();
    }
  };

  // Global Escape dismiss: covers the case where the tooltip was opened via
  // mouseenter (trigger never receives focus), so the local onKeyDown never
  // fires for Escape. Listener is attached only while the tooltip is visible.
  useEffect(() => {
    if (!isVisible) return;
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onDocKeyDown);
    return () => document.removeEventListener('keydown', onDocKeyDown);
  }, [isVisible]);

  const tooltipPortal = isVisible && !disabled
    ? createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          className={`${styles.tooltip} ${className}`}
          style={{
            left: position.x,
            top: position.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div
            className={styles.content}
            style={{ maxWidth }}
          >
            {content}
          </div>
          <div className={styles.arrow} />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? undefined : 0}
        aria-describedby={isVisible ? tooltipId : undefined}
        data-disabled={disabled ? 'true' : undefined}
        className={styles.trigger}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={handleKeyDown}
      >
        {children}
      </span>
      {tooltipPortal}
    </>
  );
};
