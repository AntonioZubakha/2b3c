import { IDiamond } from '@stonee/shared-types';

/**
 * Advanced Scoring System for Stonee Platform
 * Considers 4Cs + Proportions + Finish + Market Intelligence
 */

export interface ScoringResult {
  score: number;
  badge: 'best-value' | 'fair-deal' | 'premium-cut' | 'overpriced';
}

/**
 * 1. Proportions Analysis (Cut Quality)
 * Ideal ranges for Round diamonds
 */
const evaluateProportions = (depth: number, table: number): number => {
  let penalty = 0;
  // Depth: Ideal is 59% - 62.5%
  if (depth < 59 || depth > 62.5) penalty += 10;
  if (depth < 57 || depth > 64) penalty += 20;

  // Table: Ideal is 54% - 60%
  if (table < 54 || table > 60) penalty += 10;
  if (table < 52 || table > 63) penalty += 20;

  return penalty;
};

/**
 * 2. Finish Evaluation (Polish & Symmetry)
 */
const evaluateFinish = (polish: string, symmetry: string): number => {
  let penalty = 0;
  const grades = ['excellent', 'very good', 'good'];
  
  const pIdx = grades.indexOf(polish.toLowerCase());
  const sIdx = grades.indexOf(symmetry.toLowerCase());

  if (pIdx > 0) penalty += pIdx * 10;
  if (sIdx > 0) penalty += sIdx * 10;

  return penalty;
};

/**
 * 3. Fluorescence Impact
 */
const evaluateFluorescence = (fluorescence: string, color: string): number => {
  const highColors = ['D', 'E', 'F'];
  if (highColors.includes(color)) {
    if (fluorescence.toLowerCase().includes('strong')) return 15;
    if (fluorescence.toLowerCase().includes('medium')) return 5;
  }
  return 0;
};

/**
 * 4. Dynamic Market Price Simulation
 * Estimating "Fair Value" based on Carat, Color, and Clarity
 */
const estimateMarketFairValue = (carat: number, color: string, clarity: string): number => {
  const basePrice = 5000; // Base price for a 1ct G-VS2
  
  const colorMult: Record<string, number> = { 'D': 1.6, 'E': 1.4, 'F': 1.25, 'G': 1.0, 'H': 0.85, 'I': 0.7, 'J': 0.6 };
  const clarityMult: Record<string, number> = { 'FL': 2.0, 'IF': 1.8, 'VVS1': 1.5, 'VVS2': 1.3, 'VS1': 1.1, 'VS2': 1.0, 'SI1': 0.8, 'SI2': 0.65 };
  
  // Exponential carat pricing simulation
  const caratFactor = Math.pow(carat, 1.5);
  
  const cMult = colorMult[color] || 0.5;
  const clMult = clarityMult[clarity] || 0.5;

  return Math.round(basePrice * caratFactor * cMult * clMult);
};

export const calculateDiamondScore = (diamond: IDiamond): ScoringResult => {
  let score = 100;

  // Apply Proportions Penalty
  score -= evaluateProportions(diamond.depthPercentage || 0, diamond.tablePercentage || 0);

  // Apply Finish Penalty
  score -= evaluateFinish(diamond.polish || '', diamond.symmetry || '');

  // Apply Fluorescence Penalty
  score -= evaluateFluorescence(diamond.fluorescence || '', diamond.color);

  // 4Cs Quick Checks
  if (diamond.cut?.toLowerCase() === 'excellent' || diamond.cut?.toLowerCase() === 'ideal') {
    score += 5; // Bonus for top cuts
  } else if (diamond.cut?.toLowerCase() === 'good') {
    score -= 20;
  }

  // Market Price Intelligence vs Fair Value
  const fairValue = estimateMarketFairValue(diamond.carat, diamond.color, diamond.clarity);
  const priceAtFOB = diamond.supplierPrice || diamond.price; // FOB = Price at supplier origin
  const priceDeviation = (priceAtFOB - fairValue) / fairValue;

  if (priceDeviation < -0.1) {
    score += 15; // "Undervalued" gem
  } else if (priceDeviation > 0.15) {
    score -= 25; // "Overpriced"
  }

  // Final normalization
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Badge Logic
  let badge: ScoringResult['badge'] = 'fair-deal';
  if (score >= 93 && priceDeviation < -0.15) badge = 'best-value';
  else if (score > 90 && (diamond.cut?.toLowerCase() === 'excellent' || diamond.cut?.toLowerCase() === 'ideal')) badge = 'premium-cut';
  else if (priceDeviation > 0.25 || score < 40) badge = 'overpriced';

  return { score, badge };
};
