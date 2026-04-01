import { create } from 'zustand';

interface ShoppingStoreState {
  activeListId: string | null;
  filterCategory: string | null;
  showPurchased: boolean;
  setActiveListId: (id: string | null) => void;
  setFilterCategory: (category: string | null) => void;
  toggleShowPurchased: () => void;
}

export const useShoppingStore = create<ShoppingStoreState>((set) => ({
  activeListId: null,
  filterCategory: null,
  showPurchased: false,
  setActiveListId: (id) => set({ activeListId: id }),
  setFilterCategory: (category) => set({ filterCategory: category }),
  toggleShowPurchased: () => set((s) => ({ showPurchased: !s.showPurchased })),
}));
