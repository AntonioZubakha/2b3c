/**
 * Centralized Chart.js registration.
 *
 * Side-effect module: importing this file once registers the full superset of
 * Chart.js components used anywhere in the app. Individual chart files should
 * `import '../../utils/chartInit';` (or similar relative path) instead of
 * calling `ChartJS.register(...)` themselves.
 *
 * Chart.js `register` is idempotent, so double-imports are harmless — but
 * keeping the registration in one place avoids each feature duplicating (and
 * occasionally forgetting) an element such as `Filler` or `ArcElement`.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

/**
 * Optional explicit import helper. Most callers can rely on the side-effect
 * import alone; use this when a linter flags unused imports.
 */
export const ensureChartsRegistered = (): void => {
  /* no-op: registration already happened on module load */
};
