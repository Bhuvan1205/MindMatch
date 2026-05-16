import { create } from "zustand";

type UiState = {
  isVoicePanelOpen: boolean;
  setVoicePanelOpen: (isVoicePanelOpen: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isVoicePanelOpen: false,
  setVoicePanelOpen: (isVoicePanelOpen) => set({ isVoicePanelOpen }),
}));
