import React from 'react';

/**
 * Stonee atelier icon set — hand-drawn SVG, no external dependency.
 * Naming intentionally matches lucide-react so call-sites need only swap the import path.
 *
 * Conventions:
 *   - 24×24 viewBox, stroke = currentColor, fill = none unless noted.
 *   - Default stroke-width 1.4 (delicate, on-brand). Override via prop.
 *   - Rounded line caps & joins for the soft luxury feel.
 */

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
}

const Svg = React.forwardRef<SVGSVGElement, IconProps & { children: React.ReactNode }>(
  ({ size = 20, strokeWidth = 1.4, className = '', children, ...rest }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  ),
);
Svg.displayName = 'Svg';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Brand & flora                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export const Flower2: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M12 4c-1.6 0-2.9 1.3-2.9 2.9 0 1 .5 1.8 1.2 2.4-1 .2-1.9.7-2.6 1.5-1.1 1.2-1.1 3 0 4.2 1.1 1.1 3 1.1 4.2 0 .7-.7 1.1-1.6 1.1-2.5 0-.9-.4-1.8-1-2.5.7-.6 1.2-1.5 1.2-2.5 0-.9-.4-1.7-1.1-2.4-.4-.4-.7-.5-.1-.6z" />
    <path d="M12 12c.6.6 1.5 1 2.5 1 1.6 0 2.9-1.3 2.9-2.9 0-.9-.4-1.7-1-2.3" />
    <path d="M12 12c-.6.6-1.5 1-2.5 1-1.6 0-2.9-1.3-2.9-2.9 0-.9.4-1.7 1-2.3" />
    <circle cx="12" cy="11" r="1.7" fill="currentColor" stroke="none" />
  </Svg>
);

export const Gem: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M6 3h12l3 5-9 12L3 8z" />
    <path d="M3 8h18" />
    <path d="M9 3l3 5 3-5" />
    <path d="M9 8l3 12 3-12" />
  </Svg>
);

export const Sparkles: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M12 4c.4 2.5 1.5 3.6 4 4-2.5.4-3.6 1.5-4 4-.4-2.5-1.5-3.6-4-4 2.5-.4 3.6-1.5 4-4z" />
    <path d="M19 14c.2 1.3.8 1.9 2 2-1.3.2-1.9.8-2 2-.2-1.3-.8-1.9-2-2 1.3-.2 1.9-.8 2-2z" />
    <path d="M5 6c.2 1 .6 1.4 1.5 1.5C5.6 7.7 5.2 8.1 5 9c-.2-1-.6-1.4-1.5-1.5C4.4 7.4 4.8 7 5 6z" />
  </Svg>
);

export const Heart: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 7l-1.3-1.4a5 5 0 0 0-7.1 7.1l8.4 8.4 8.4-8.4a5 5 0 0 0 0-7.1z" />
  </Svg>
);

export const Leaf: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M11 20A7 7 0 0 1 4 13c0-7 7-9 16-9 0 9-2 16-9 16z" />
    <path d="M4 20l8-8" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Arrows & chevrons                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export const ArrowRight: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const ArrowLeft: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const ArrowUpRight: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M7 17L17 7M9 7h8v8" />
  </Svg>
);

export const ArrowUpDown: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M7 4v16M3 8l4-4 4 4" />
    <path d="M17 20V4M21 16l-4 4-4-4" />
  </Svg>
);

export const ChevronRight: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const ChevronDown: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Status & checks                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export const Check: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

export const CheckCircle2: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Svg>
);

export const X: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6l-12 12" />
  </Svg>
);

export const Info: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const Eye: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Shopping & commerce                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export const ShoppingBag: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
  </Svg>
);

export const ShoppingCart: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 4h2l2.5 12.5h12L22 8H6" />
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
  </Svg>
);

export const Receipt: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M5 3h14v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5L5 21z" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </Svg>
);

export const CreditCard: React.FC<IconProps> = props => (
  <Svg {...props}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 11h18M7 16h2" />
  </Svg>
);

export const DollarSign: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M12 3v18M16 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7" />
  </Svg>
);

export const Trash2: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    <path d="M10 11v7M14 11v7" />
  </Svg>
);

export const Truck: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 7h11v10H3z" />
    <path d="M14 10h4l3 3v4h-7" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </Svg>
);

export const Package: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M21 8L12 3 3 8v8l9 5 9-5z" />
    <path d="M3 8l9 5 9-5M12 13v9" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Account & security                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

export const User: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </Svg>
);

export const Users: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    <circle cx="17" cy="6" r="2.5" />
    <path d="M22 18c0-2.9-2.5-4.5-4.7-4.5" />
  </Svg>
);

export const Shield: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M12 3l8 3v6c0 4.4-3.4 8.5-8 9-4.6-.5-8-4.6-8-9V6z" />
  </Svg>
);

export const ShieldCheck: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M12 3l8 3v6c0 4.4-3.4 8.5-8 9-4.6-.5-8-4.6-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const Lock: React.FC<IconProps> = props => (
  <Svg {...props}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

export const LogOut: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

export const ExternalLink: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Communication                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export const Mail: React.FC<IconProps> = props => (
  <Svg {...props}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 7l9 7 9-7" />
  </Svg>
);

export const Phone: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M22 17v3a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 19 19 0 0 1-6-6 19 19 0 0 1-3-8.3A2 2 0 0 1 4.5 3H7a2 2 0 0 1 2 1.7l.6 3a2 2 0 0 1-.5 1.9L8 11a16 16 0 0 0 5 5l1.4-1.1a2 2 0 0 1 1.9-.5l3 .6A2 2 0 0 1 22 17z" />
  </Svg>
);

export const MessageCircle: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M21 12a9 9 0 0 1-13.4 7.9L3 21l1.1-4.6A9 9 0 1 1 21 12z" />
  </Svg>
);

export const MessageSquare: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" />
  </Svg>
);

export const Send: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4z" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  World, time, navigation                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

export const Globe: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Svg>
);

export const MapPin: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);

export const Calendar: React.FC<IconProps> = props => (
  <Svg {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const Clock: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const History: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Search, filter, controls                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export const Search: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </Svg>
);

export const Filter: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 5h18l-7 9v6l-4-2v-4z" />
  </Svg>
);

export const SlidersHorizontal: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 7h11M17 7h4M3 17h5M11 17h10M3 12h7M13 12h8" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
    <circle cx="11" cy="12" r="2" />
  </Svg>
);

export const RotateCcw: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);

export const Menu: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Awards, files, charts                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export const Award: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="9" r="6" />
    <path d="M8.5 14L7 21l5-3 5 3-1.5-7" />
  </Svg>
);

export const Star: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.1 6.6 20l1-6.1L3.2 9.5l6.1-.9z" />
  </Svg>
);

export const FileCheck: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 14l2 2 4-4" />
  </Svg>
);

export const Download: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
);

export const Share2: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 13.3l7.6 4.4M15.8 6.3l-7.6 4.4" />
  </Svg>
);

export const TrendingUp: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </Svg>
);

export const PieChart: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M21 12A9 9 0 1 1 12 3v9z" />
    <path d="M21 12A9 9 0 0 0 12 3v9z" />
  </Svg>
);

export const Activity: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 12h4l3-9 4 18 3-9h4" />
  </Svg>
);

export const Target: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
  </Svg>
);

export const Cpu: React.FC<IconProps> = props => (
  <Svg {...props}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </Svg>
);

export const Ruler: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M3 17l6 6L23 9l-6-6z" />
    <path d="M8 12l2 2M11 9l2 2M14 6l2 2" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Loaders                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

export const Loader2: React.FC<IconProps> = ({ className = '', ...rest }) => (
  <Svg className={`animate-spin ${className}`} {...rest}>
    <path d="M21 12a9 9 0 1 1-6.2-8.5" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Theme toggle ornaments                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

export const Sun: React.FC<IconProps> = props => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Svg>
);

export const Moon: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8z" />
  </Svg>
);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Misc                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export const Pencil: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M14.5 4.5l5 5L8 21l-5 1 1-5z" />
    <path d="M13 6l5 5" />
  </Svg>
);

export const Hammer: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M15 3l6 6-3 3-6-6z" />
    <path d="M11 7L3 15l5 5 8-8" />
  </Svg>
);

export const Zap: React.FC<IconProps> = props => (
  <Svg {...props}>
    <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
  </Svg>
);
