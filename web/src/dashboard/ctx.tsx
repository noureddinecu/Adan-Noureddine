import { createContext, useContext } from 'react';
import type { Live } from '../shared/live';
import type { Meta, Settings } from '../shared/types';

export interface Ctx {
  live: Live;
  meta: Meta;
  settings: Settings;
  saveSettings: (patch: Partial<{ [K in keyof Settings]: Partial<Settings[K]> }>) => Promise<void>;
  network: string[];
  signKey: boolean;
  logout: () => void;
}
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;
