import { create } from 'zustand';

export const useUiStore = create((set) => ({
  selectedPeriodId: null,
  sidebarCollapsed: false,
  mobileNavOpen: false,

  setSelectedPeriodId: (selectedPeriodId) => set({ selectedPeriodId }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));

