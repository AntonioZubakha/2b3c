import React, { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../../i18n';
import { trapFocus, getFocusableElements } from '../../../utils/accessibility';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className
}) => {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const titleIdRef = useRef(`modal-title-${Math.random().toString(36).substring(2, 11)}`);
  
  // Save previous active element and restore focus on close
  useEffect(() => {
    if (isOpen) {
      // Save the element that had focus before modal opened
      previousActiveElementRef.current = document.activeElement as HTMLElement;
    } else {
      // Restore focus when modal closes
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
    }
  }, [isOpen]);

  // Focus management: focus first focusable element or modal content on open
  useEffect(() => {
    if (!isOpen || !modalContentRef.current) return;

    const modalContent = modalContentRef.current;
    const focusableElements = getFocusableElements(modalContent);
    
    // Focus first focusable element, or modal content itself if none
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      modalContent.focus();
    }
  }, [isOpen]);

  // Handle ESC key press and Tab key for focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onClose();
        return;
      }

      // Trap focus inside modal
      if (event.key === 'Tab' && modalContentRef.current) {
        trapFocus(modalContentRef.current, event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open (without changing position to avoid white background)
  useEffect(() => {
    if (isOpen) {
      // Simply prevent scrolling without changing position
      // This avoids white background issues
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      // Scroll overlay to top when modal opens to ensure modal is visible
      // With align-items: center, modal will be centered automatically
      setTimeout(() => {
        if (overlayRef.current) {
          overlayRef.current.scrollTop = 0;
        }
      }, 0);
      
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Handle wheel events: allow modal body to scroll, prevent overlay scroll when at boundaries
  useEffect(() => {
    if (!isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const modalContent = modalContentRef.current;

      if (!modalContent) return;

      // Check if event is inside modal content
      const isInsideModal = modalContent.contains(target);
      
      if (isInsideModal) {
        // Inside modal: find modal body (second child after header)
        const modalBody = modalContent.children[1] as HTMLElement;
        
        if (modalBody) {
          // Check if modal body can scroll
          const scrollHeight = modalBody.scrollHeight;
          const clientHeight = modalBody.clientHeight;
          const scrollTop = modalBody.scrollTop;
          
          const canScrollDown = scrollHeight > clientHeight && scrollTop < scrollHeight - clientHeight - 1;
          const canScrollUp = scrollTop > 0;

          // Only prevent overlay scroll if modal body is at boundaries
          // Don't prevent default - let modal body scroll naturally
          if ((!canScrollDown && e.deltaY > 0) || (!canScrollUp && e.deltaY < 0)) {
            e.stopPropagation();
          }
          // Otherwise, let the modal body handle the scroll naturally
        }
      }
    };

    // Use capture phase to handle before it bubbles
    document.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    
    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [isOpen]);

  const handleOverlayClick = closeOnOverlayClick ? onClose : undefined;

  const modalContentClasses = [
    styles.modalContent,
    size !== 'md' && styles[size],
    className
  ].filter(Boolean).join(' ');

  const modalContent = (
    <div 
      ref={overlayRef}
      className={styles.modalOverlay} 
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div 
        ref={modalContentRef}
        className={modalContentClasses} 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleIdRef.current}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <h4 id={titleIdRef.current} className={styles.modalTitle}>{title}</h4>
          <button 
            onClick={onClose} 
            className={styles.modalCloseButton}
            aria-label={t('accessibility.closeModal')}
            type="button"
          >
            &times;
          </button>
        </div>
        <div className={styles.modalBody}>
          {children}
        </div>
        {footer && (
          <div className={styles.modalFooter}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Render modal using Portal directly to body to avoid stacking context issues
  if (!isOpen) {
    return null;
  }

  return createPortal(modalContent, document.body);
};

export default Modal; 