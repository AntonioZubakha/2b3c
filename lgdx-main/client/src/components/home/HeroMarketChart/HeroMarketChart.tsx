import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import type {
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  Plugin,
} from 'chart.js';
import '../../../utils/chartInit';
import { formatUsd } from '../../../utils/currency';
import api from '../../../api';
import styles from './HeroMarketChart.module.css';

// ── Constants ──────────────────────────────────────────────────────────────

const WINDOW_SIZE = 10;
const TICK_MS = 1500;
const ANIMATION_MS = 700;
const DAYS = 30;

const LINE_COLOR_START = '#22d3ee';
const LINE_COLOR_MID = '#818cf8';
const LINE_COLOR_END = '#a78bfa';

/** Shapes: fixed list for hero chart dropdown */
const SHAPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ROUND', label: 'Round' },
  { value: 'OVAL', label: 'Oval' },
  { value: 'PEAR', label: 'Pear' },
  { value: 'CUSHION', label: 'Cushion' },
  { value: 'EMERALD', label: 'Emerald' },
  { value: 'RADIANT', label: 'Radiant' },
  { value: 'PRINCESS', label: 'Princess' },
  { value: 'HEART', label: 'Heart' },
];

/** Colors: D, E, F, G only */
const COLOR_OPTIONS = ['D', 'E', 'F', 'G'] as const;

/** Weights: 0.5, 1, 2, 3, 5, 7 ct (value = API range param) */
const WEIGHT_OPTIONS: { value: string; label: string }[] = [
  { value: '0.3-0.59', label: '0.5 ct' },
  { value: '1-1.39', label: '1 ct' },
  { value: '1.8-2.19', label: '2 ct' },
  { value: '3-3.49', label: '3 ct' },
  { value: '5-5.99', label: '5 ct' },
  { value: '7-7.99', label: '7 ct' },
];

// ── Types ──────────────────────────────────────────────────────────────────

interface PricePoint {
  label: string;
  value: number | null;
  dateKey: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function fetchChartData(
  shape: string,
  weight: string,
  clarity: string,
  color: string
): Promise<PricePoint[] | null> {
  try {
    const res = await api.get<{
      success: boolean;
      data: Array<{ date: string; marketPricePerCarat?: number; avgPricePerCarat?: number }>;
    }>(`/category-stats/chart/${shape}/${weight}/${clarity}/${color}`, {
      params: { days: String(DAYS) },
    });

    if (!res.data?.success || !Array.isArray(res.data.data)) return null;

    const priceMap = new Map<string, number>();
    res.data.data.forEach((stat) => {
      const price = stat.marketPricePerCarat ?? stat.avgPricePerCarat;
      if (price != null && price > 0) {
        const key = typeof stat.date === 'string' ? stat.date.split('T')[0] : '';
        if (key) priceMap.set(key, price);
      }
    });

    const points: PricePoint[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = formatDate(d);
      points.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: priceMap.get(dateKey) ?? null,
        dateKey,
      });
    }

    return points.filter((p) => p.value != null).length >= 2 ? points : null;
  } catch {
    return null;
  }
}

// ── Glow plugin ────────────────────────────────────────────────────────────

function makeGlowPlugin(wsRef: React.RefObject<number>): Plugin<'line'> {
  return {
    id: 'glowLastPoint',
    afterDraw(chart) {
      const ds = chart.data.datasets[0];
      if (!ds?.data) return;

      const ws = wsRef.current ?? 0;
      let lastIdx = -1;
      for (let i = ws + WINDOW_SIZE - 1; i >= ws; i--) {
        const pt = ds.data[i] as { x: number; y: number } | undefined;
        if (pt && Number.isFinite(pt.y)) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx < 0) return;

      const meta = chart.getDatasetMeta(0);
      const point = meta.data[lastIdx];
      if (!point) return;

      const { x, y } = point.getProps(['x', 'y'], true) as { x: number; y: number };
      const { ctx } = chart;

      ctx.save();

      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
      ctx.fill();

      const grad = ctx.createRadialGradient(x, y, 0, x, y, 6);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, '#22d3ee');
      grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.restore();
    },
  };
}

// ── Component ──────────────────────────────────────────────────────────────

interface HeroMarketChartProps {
  // Компонент получает fallback (например, статическую картинку),
  // чтобы корректно отобразиться, если API не вернул данные.
  fallback?: React.ReactNode;
}

const HeroMarketChart: React.FC<HeroMarketChartProps> = ({ fallback }) => {
  const chartRef = useRef<ChartJS<'line'> | null>(null);
  const windowStartRef = useRef<number>(0);

  // Clarities from API (shapes and colors are fixed lists)
  const [clarities, setClarities] = useState<string[]>(['VVS1', 'VVS2', 'VS1', 'VS2']);
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .get<string[]>('/marketplace/clarities')
      .then((res) => {
        if (!mounted) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        if (list.length > 0) setClarities(list);
      })
      .catch(() => { /* use default clarities */ })
      .finally(() => {
        if (mounted) setOptionsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Selected filters
  const [shape, setShape] = useState<string>('ROUND');
  const [weight, setWeight] = useState<string>('1-1.39');
  const [clarity, setClarity] = useState<string>('VVS1');
  const [color, setColor] = useState<string>('D');

  // Chart data for current selection
  const [chartData, setChartData] = useState<PricePoint[] | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setDataLoading(true);
    fetchChartData(shape, weight, clarity, color).then((data) => {
      if (!mounted) return;
      setChartData(data);
      setDataLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [shape, weight, clarity, color]);

  // Sliding window
  const [windowStart, setWindowStart] = useState(0);
  useEffect(() => {
    windowStartRef.current = windowStart;
  }, [windowStart]);

  useEffect(() => {
    if (!chartData || chartData.length <= WINDOW_SIZE || dataLoading) return;
    const maxStart = chartData.length - WINDOW_SIZE;
    if (windowStart < maxStart) {
      const t = setTimeout(() => setWindowStart((w) => w + 1), TICK_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setWindowStart(0), 800);
    return () => clearTimeout(t);
  }, [chartData, windowStart, dataLoading]);

  const yRange = useMemo(() => {
    if (!chartData) return null;
    const vals = chartData.filter((p) => p.value != null).map((p) => p.value as number);
    if (vals.length < 2) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.25;
    return { min: min - pad, max: max + pad };
  }, [chartData]);

  const currentPrice = useMemo(() => {
    if (!chartData) return null;
    const end = Math.min(windowStart + WINDOW_SIZE, chartData.length);
    for (let i = end - 1; i >= windowStart; i--) {
      if (chartData[i].value != null) return chartData[i].value as number;
    }
    return null;
  }, [chartData, windowStart]);

  const priceChange = useMemo(() => {
    if (!chartData || currentPrice == null) return null;
    for (let i = windowStart; i < Math.min(windowStart + WINDOW_SIZE, chartData.length); i++) {
      if (chartData[i].value != null) {
        const first = chartData[i].value as number;
        return ((currentPrice - first) / first) * 100;
      }
    }
    return null;
  }, [chartData, windowStart, currentPrice]);

  const lineGradient = useMemo(
    () =>
      (context: { chart: { ctx: CanvasRenderingContext2D; chartArea: { left: number; right: number } | null } }) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return LINE_COLOR_END;
        const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        g.addColorStop(0, LINE_COLOR_START);
        g.addColorStop(0.5, LINE_COLOR_MID);
        g.addColorStop(1, LINE_COLOR_END);
        return g;
      },
    []
  );

  const areaFill = useMemo(
    () =>
      (context: { chart: { ctx: CanvasRenderingContext2D; chartArea: { top: number; bottom: number } | null } }) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return 'rgba(34,211,238,0.08)';
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, 'rgba(34,  211, 238, 0.22)');
        g.addColorStop(0.45, 'rgba(129, 140, 248, 0.10)');
        g.addColorStop(1, 'rgba(167, 139, 250, 0.00)');
        return g;
      },
    []
  );

  const glowPlugin = useMemo(() => makeGlowPlugin(windowStartRef), []);

  const fullChartData: ChartData<'line'> = useMemo(
    () => ({
      datasets: [
        {
          label: 'Market $/ct',
          data: (chartData ?? []).map((p, i) => ({
            x: i,
            y: p.value ?? Number.NaN,
            label: p.label,
          })),
          borderColor: lineGradient,
          backgroundColor: areaFill,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 7,
          pointBackgroundColor: LINE_COLOR_START,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: LINE_COLOR_START,
          pointHoverBorderColor: '#ffffff',
          borderWidth: 2.5,
          spanGaps: false,
        },
      ],
    }),
    [chartData, lineGradient, areaFill]
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: ANIMATION_MS, easing: 'easeInOutCubic' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: 'rgba(6, 7, 18, 0.97)',
          titleColor: LINE_COLOR_START,
          bodyColor: 'rgba(255,255,255,0.88)',
          borderColor: 'rgba(34, 211, 238, 0.35)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              const raw = items[0]?.raw as { label?: string } | undefined;
              return raw?.label ?? '';
            },
            label: (ctx) => {
              const y = Number(ctx.parsed.y);
              return Number.isFinite(y) ? `${formatUsd(y)}/ct` : '';
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: WINDOW_SIZE - 0.5,
          display: true,
          grid: { color: 'rgba(99, 102, 241, 0.07)' },
          border: { display: false },
          ticks: {
            color: 'rgba(148, 163, 184, 0.55)',
            maxTicksLimit: 5,
            font: { size: 10 },
            maxRotation: 0,
            stepSize: 1,
            callback: (value) => {
              const i = Math.round(Number(value));
              return chartData && i >= 0 && i < chartData.length ? chartData[i].label : '';
            },
          },
        },
        y: {
          display: true,
          position: 'right',
          grid: { color: 'rgba(99, 102, 241, 0.07)' },
          border: { display: false },
          ...(yRange ? { min: yRange.min, max: yRange.max } : {}),
          ticks: {
            color: 'rgba(148, 163, 184, 0.55)',
            maxTicksLimit: 4,
            font: { size: 10 },
            callback: (v) => {
              const n = Number(v);
              return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
            },
          },
          beginAtZero: false,
        },
      },
    }),
    [yRange, chartData]
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartData) return;
    const scales = chart.options?.scales;
    const xScale = scales?.x;
    if (!xScale) return;
    const x = xScale as Record<string, unknown>;
    x.min = 0;
    x.max = WINDOW_SIZE - 0.5;
    if (yRange && scales?.y) {
      const y = scales.y as Record<string, unknown>;
      y.min = yRange.min;
      y.max = yRange.max;
    }
    chart.update('none');
  }, [chartData, yRange]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartData || chartData.length === 0) return;
    const xScale = chart.options?.scales?.x;
    if (!xScale) return;
    const x = xScale as Record<string, unknown>;
    x.min = windowStart;
    x.max = windowStart + WINDOW_SIZE - 0.5;
    chart.update(windowStart > 0 ? 'active' : 'none');
  }, [windowStart, chartData]);

  const shapeLabel = useMemo(
    () => SHAPE_OPTIONS.find((s) => s.value === shape)?.label ?? shape,
    [shape]
  );

  if (optionsLoading || dataLoading) {
    return (
      <div className={styles.wrapper} aria-hidden="true">
        <div className={styles.skeleton}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={styles.skeletonBar} />
          ))}
        </div>
      </div>
    );
  }

  const isPositive = priceChange != null && priceChange >= 0;
  const changeAbs = priceChange != null ? Math.abs(priceChange) : null;
  const hasChartData = chartData && chartData.length > 0;

  return (
    <div
      className={styles.wrapper}
      aria-label={`Market price chart — ${weight} ct ${shapeLabel} ${color} ${clarity}`}
    >
      <div className={styles.scanLine} aria-hidden="true" />
      <div className={styles.cornerTL} aria-hidden="true" />
      <div className={styles.cornerBR} aria-hidden="true" />

      {/* Filters row */}
      <div className={styles.filtersRow}>
        <div className={styles.filterGroup}>
          <label htmlFor="hero-chart-shape" className={styles.filterLabel}>
            Shape
          </label>
          <select
            id="hero-chart-shape"
            className={styles.filterSelect}
            value={shape}
            onChange={(e) => setShape(e.target.value)}
            aria-label="Select shape"
          >
            {SHAPE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="hero-chart-clarity" className={styles.filterLabel}>
            Clarity
          </label>
          <select
            id="hero-chart-clarity"
            className={styles.filterSelect}
            value={clarity}
            onChange={(e) => setClarity(e.target.value)}
            aria-label="Select clarity"
          >
            {clarities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="hero-chart-color" className={styles.filterLabel}>
            Color
          </label>
          <select
            id="hero-chart-color"
            className={styles.filterSelect}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Select color"
          >
            {COLOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="hero-chart-weight" className={styles.filterLabel}>
            Weight
          </label>
          <select
            id="hero-chart-weight"
            className={styles.filterSelect}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            aria-label="Select weight range"
          >
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.symbolRow}>
            <span className={styles.liveDot} aria-label="Live data" />
            <span className={styles.liveLabel}>LIVE</span>
          </div>
          <span className={styles.subLabel}>
            {weight} ct · {color} · {clarity} · {shapeLabel}
          </span>
        </div>
        <div className={styles.headerRight}>
          {currentPrice != null && <span className={styles.price}>{formatUsd(currentPrice)}</span>}
          {changeAbs != null && (
            <span className={`${styles.change} ${isPositive ? styles.changePos : styles.changeNeg}`}>
              {isPositive ? '▲' : '▼'} {changeAbs.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {hasChartData ? (
        <div className={styles.chartArea}>
          <Line ref={chartRef} data={fullChartData} options={options} plugins={[glowPlugin]} />
        </div>
      ) : fallback ? (
        <div className={styles.noDataMessage}>{fallback}</div>
      ) : (
        <div className={styles.noDataMessage}>
          <span className={styles.noDataText}>No price history for this category</span>
          <span className={styles.noDataHint}>Try another shape, clarity, color or weight</span>
        </div>
      )}
    </div>
  );
};

export default HeroMarketChart;
