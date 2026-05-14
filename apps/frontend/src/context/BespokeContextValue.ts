import { createContext } from 'react';
import type { BespokeContextType } from './bespokeTypes';

export const BespokeContext = createContext<BespokeContextType | undefined>(undefined);

