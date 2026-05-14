import React, { useEffect, useState } from 'react';
import type { ApiDiamond, ApiSetting, BespokeState, BespokeStep } from './bespokeTypes';
import { BespokeContext } from './BespokeContextValue';

const STORAGE_KEY = 'craft_state';
const LEGACY_KEY = 'bespoke_state';

const emptyState: BespokeState = { setting: null, diamond: null, currentStep: 'jewelry' };

// One-time migration: old key (`bespoke_state`) used `currentStep: 'diamond'|'setting'|'preview'`
// where `diamond` was selected first. New flow inverts to jewelry/setting first.
const loadInitial = (): BespokeState => {
  try {
    const fresh = localStorage.getItem(STORAGE_KEY);
    if (fresh) return JSON.parse(fresh) as BespokeState;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { setting?: ApiSetting | null; diamond?: ApiDiamond | null };
      localStorage.removeItem(LEGACY_KEY);
      return {
        setting: parsed.setting ?? null,
        diamond: parsed.diamond ?? null,
        currentStep: parsed.setting ? (parsed.diamond ? 'summary' : 'diamond') : 'jewelry',
      };
    }
  } catch {
    // Corrupt JSON — start clean.
  }
  return emptyState;
};

export const BespokeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<BespokeState>(loadInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // If a stone is already chosen, keep it whenever the new setting can hold its
  // shape — and skip straight to summary. Otherwise drop the now-incompatible
  // stone and route the user back through diamond selection.
  const setSetting = (setting: ApiSetting) =>
    setState(prev => {
      const stoneFits =
        !!prev.diamond && setting.compatibleShapes.includes(prev.diamond.shape);
      return {
        ...prev,
        setting,
        diamond: stoneFits ? prev.diamond : null,
        currentStep: stoneFits ? 'summary' : 'diamond',
      };
    });

  const setDiamond = (diamond: ApiDiamond) =>
    setState(prev => ({ ...prev, diamond, currentStep: 'summary' }));

  const setStep = (currentStep: BespokeStep) =>
    setState(prev => ({ ...prev, currentStep }));

  // Removing the setting alone keeps the chosen stone — the user may want to pair
  // it with a different piece without losing their gem decision.
  const clearSetting = () =>
    setState(prev => ({ ...prev, setting: null, currentStep: 'jewelry' }));

  // Removing the stone keeps the setting — the user simply picks a different gem.
  const clearDiamond = () =>
    setState(prev => ({ ...prev, diamond: null, currentStep: 'diamond' }));

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(emptyState);
  };

  const totalPrice = (state.setting?.price ?? 0) + (state.diamond?.price ?? 0);

  return (
    <BespokeContext.Provider
      value={{
        state,
        setSetting,
        setDiamond,
        setStep,
        clearSetting,
        clearDiamond,
        reset,
        totalPrice,
      }}
    >
      {children}
    </BespokeContext.Provider>
  );
};
