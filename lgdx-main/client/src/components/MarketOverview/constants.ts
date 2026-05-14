import { TabData } from './types';

export const TABS: TabData[] = [
  {
    id: 'overview',
    label: 'Dashboard',
    description: 'General market statistics and distribution'
  },
  {
    id: 'demand',
    label: 'Demand Analysis',
    description: 'What customers are buying and searching for'
  },
  {
    id: 'supply',
    label: 'Supply Insights',
    description: 'What products are profitable to produce'
  },
  {
    id: 'trends',
    label: 'Price Trends',
    description: 'Price movements and market dynamics'
  },
  {
    id: 'news',
    label: 'Market News',
    description: 'Latest industry news and insights'
  },
  {
    id: 'compare',
    label: 'Compare',
    description: 'Compare two diamond categories side by side'
  }
];

export const MAIN_SHAPES = [
  'ROUND', 'OVAL', 'PEAR', 'CUSHION', 'EMERALD', 'RADIANT', 'PRINCESS', 'MARQUISE',
  'HEART', 'ASSCHER',
  'Round', 'Oval', 'Pear', 'Cushion', 'Emerald', 'Radiant', 'Princess', 'Marquise',
  'Heart', 'Asscher'
];

export const DEMAND_INTENSITY_THRESHOLD = 80; // percentage for "HOT" label
export const LOW_CONFIDENCE_THRESHOLD = 0.5; // for sales confidence warning
export const SMALL_SAMPLE_WARNING = 20; // for statistical significance
