/**
 * Accessibility Utilities
 * Утилиты для улучшения доступности приложения
 * 
 * @description
 * Набор функций и хуков для работы с accessibility:
 * - Keyboard navigation
 * - Focus management
 * - ARIA attributes
 * - Screen reader support
 */

import React, { useEffect, useRef, RefObject, useState } from 'react';

/* ==========================================================================
   KEYBOARD NAVIGATION UTILITIES
   ========================================================================== */

/**
 * Проверяет, является ли событие активацией через клавиатуру (Enter/Space)
 */
export const isActivationKey = (event: React.KeyboardEvent): boolean => {
  return event.key === 'Enter' || event.key === ' ';
};

/**
 * Проверяет, является ли событие навигацией со стрелками
 */
export const isArrowKey = (event: React.KeyboardEvent): boolean => {
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
};

/**
 * Проверяет, является ли событие клавишей Escape
 */
export const isEscapeKey = (event: React.KeyboardEvent): boolean => {
  return event.key === 'Escape';
};

/**
 * Проверяет, является ли событие клавишей Tab
 */
export const isTabKey = (event: React.KeyboardEvent): boolean => {
  return event.key === 'Tab';
};

/* ==========================================================================
   FOCUS MANAGEMENT
   ========================================================================== */

/**
 * Custom hook для управления фокусом элемента
 * 
 * @param shouldFocus - Условие для установки фокуса
 * @returns ref для элемента
 */
export const useFocusOnMount = <T extends HTMLElement>(shouldFocus = true): RefObject<T | null> => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (shouldFocus && ref.current) {
      ref.current.focus();
    }
  }, [shouldFocus]);

  return ref;
};

/**
 * Сохраняет и восстанавливает фокус
 * Полезно для модальных окон и popup
 */
export const useFocusTrap = <T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  setFocusTrap: (active: boolean) => void;
} => {
  const ref = useRef<T | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const setFocusTrap = (active: boolean) => {
    if (active) {
      // Сохраняем текущий активный элемент
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Устанавливаем фокус на container
      if (ref.current) {
        ref.current.focus();
      }
    } else {
      // Восстанавливаем фокус на предыдущий элемент
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }
  };

  return { ref, setFocusTrap };
};

/**
 * Получает все фокусируемые элементы внутри container
 */
export const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
};

/**
 * Ловушка фокуса внутри элемента (для модальных окон)
 */
export const trapFocus = (container: HTMLElement, event: KeyboardEvent): void => {
  if (event.key !== 'Tab') return;

  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  // Если Shift+Tab на первом элементе -> переходим на последний
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement?.focus();
  }
  // Если Tab на последнем элементе -> переходим на первый
  else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement?.focus();
  }
};

/* ==========================================================================
   ARIA UTILITIES
   ========================================================================== */

/**
 * Генерирует уникальный ID для ARIA attributes
 */
let idCounter = 0;
export const generateId = (prefix = 'aria'): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

/**
 * Создает ARIA attributes для expandable/collapsible элементов
 */
export const getExpandableAriaProps = (
  isExpanded: boolean,
  controlsId: string
): {
  'aria-expanded': boolean;
  'aria-controls': string;
} => ({
  'aria-expanded': isExpanded,
  'aria-controls': controlsId,
});

/**
 * Создает ARIA attributes для selected элементов
 */
export const getSelectableAriaProps = (
  isSelected: boolean
): {
  'aria-selected': boolean;
  role: string;
} => ({
  'aria-selected': isSelected,
  role: 'option',
});

/* ==========================================================================
   LIVE REGIONS
   ========================================================================== */

/**
 * Создает live region для объявлений screen reader
 */
export const createLiveRegion = (
  message: string,
  politeness: 'polite' | 'assertive' = 'polite'
): void => {
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', politeness);
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only';
  liveRegion.textContent = message;

  document.body.appendChild(liveRegion);

  // Удаляем через 1 секунду
  setTimeout(() => {
    document.body.removeChild(liveRegion);
  }, 1000);
};

/**
 * Custom hook для объявлений screen reader
 */
export const useAnnounce = () => {
  const announce = (message: string, politeness: 'polite' | 'assertive' = 'polite') => {
    createLiveRegion(message, politeness);
  };

  return { announce };
};

/* ==========================================================================
   COLOR CONTRAST
   ========================================================================== */

/**
 * Вычисляет контрастность между двумя цветами (WCAG 2.1)
 * 
 * @param foreground - Цвет переднего плана (hex)
 * @param background - Цвет фона (hex)
 * @returns Коэффициент контрастности (1-21)
 */
export const getContrastRatio = (foreground: string, background: string): number => {
  const getLuminance = (hex: string): number => {
    // Убираем # если есть
    hex = hex.replace('#', '');
    
    // Конвертируем в RGB
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    // Применяем sRGB correction
    const [rs, gs, bs] = [r, g, b].map(c => 
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    
    // Вычисляем относительную яркость
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Проверяет, соответствует ли контрастность WCAG AA (4.5:1 для текста)
 */
export const meetsWCAG_AA = (foreground: string, background: string): boolean => {
  return getContrastRatio(foreground, background) >= 4.5;
};

/**
 * Проверяет, соответствует ли контрастность WCAG AAA (7:1 для текста)
 */
export const meetsWCAG_AAA = (foreground: string, background: string): boolean => {
  return getContrastRatio(foreground, background) >= 7;
};

/* ==========================================================================
   MOTION & ANIMATION
   ========================================================================== */

/**
 * Проверяет, предпочитает ли пользователь уменьшенное движение
 */
export const prefersReducedMotion = (): boolean => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Custom hook для отслеживания prefers-reduced-motion
 */
export const usePrefersReducedMotion = (): boolean => {
  const [prefersReduced, setPrefersReduced] = useState(prefersReducedMotion());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const handleChange = () => {
      setPrefersReduced(mediaQuery.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReduced;
};
