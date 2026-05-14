import { useState, useEffect, useRef } from 'react';
import { UseChartVisibilityResult } from '../types/hooks';

/**
 * Custom hook for managing chart visibility with Intersection Observer
 * @param threshold - Intersection threshold (default: 0.1)
 * @param rootMargin - Root margin for intersection (default: '50px')
 * @returns Object with chart visibility state and ref for the chart container
 */
export const useChartVisibility = (
  threshold = 0.1,
  rootMargin = '50px'
): UseChartVisibilityResult => {
  const [isChartVisible, setIsChartVisible] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsChartVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { isChartVisible, chartRef };
};
