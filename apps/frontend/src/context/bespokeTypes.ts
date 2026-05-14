import type { IDiamond, ISetting } from '@stonee/shared-types';

/** Canonical purchase path: jewelry/setting → diamond → summary. */
export type BespokeStep = 'jewelry' | 'diamond' | 'summary';

export type ApiDiamond = IDiamond & { _id: string };
export type ApiSetting = ISetting & { _id: string };

export type BespokeState = {
  setting: ApiSetting | null;
  diamond: ApiDiamond | null;
  currentStep: BespokeStep;
};

export type BespokeContextType = {
  state: BespokeState;
  setSetting: (setting: ApiSetting) => void;
  setDiamond: (diamond: ApiDiamond) => void;
  setStep: (step: BespokeStep) => void;
  /** Drop the chosen jewelry piece and bounce the flow back to step one. */
  clearSetting: () => void;
  /** Drop the chosen stone and let the user pick another one. */
  clearDiamond: () => void;
  reset: () => void;
  totalPrice: number;
};
