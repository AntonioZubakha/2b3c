import { useContext } from 'react';
import { BespokeContext } from './BespokeContextValue';

export const useBespoke = () => {
  const context = useContext(BespokeContext);
  if (!context) throw new Error('useBespoke must be used within BespokeProvider');
  return context;
};

