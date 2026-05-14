import React from 'react';
import styles from './SupplyInsightsIcons.module.css';

/** Minimal SVG icons for Supply Insights — no emojis, theme-aware via currentColor */

const size = 20;
const stroke = 2;

export const IconTarget: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const IconTrendUp: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 7l-8.5 8.5-4-4L2 17" />
    <path d="M16 7h6v6" />
  </svg>
);

export const IconChart: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </svg>
);

export const IconAlert: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconTrendDown: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 17l-8.5-8.5-4 4L2 7" />
    <path d="M16 17h6v-6" />
  </svg>
);

export const IconRefresh: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

export const IconEdit: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export const IconTrash: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <path d="M10 11v6M14 11v6M8 6v14M16 6v14" />
  </svg>
);

export const IconWeight: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="5" r="3" />
    <path d="M12 8v11M7 19h10" />
    <path d="M9 14h6" />
  </svg>
);

export const IconGem: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3h12l4 6-10 13L2 9l4-6z" />
    <path d="M6 3l6 9 6-9M6 3L2 9l10 13 10-13-4-6" />
  </svg>
);

export const IconPalette: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className ?? styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="13.5" cy="6.5" r="1.5" />
    <circle cx="17.5" cy="10.5" r="1.5" />
    <circle cx="8.5" cy="7.5" r="1.5" />
    <circle cx="6.5" cy="12.5" r="1.5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.1 2.5-.3" />
  </svg>
);
