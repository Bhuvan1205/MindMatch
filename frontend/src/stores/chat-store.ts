import { create } from "zustand";
import type { ChatExchange } from "@/lib/api/types";

type ChatState = {
  sessionId: string | null;
  exchanges: ChatExchange[];
  temporary: boolean;
  setSessionId: (id: string) => void;
  addExchange: (exchange: ChatExchange) => void;
  setExchanges: (exchanges: ChatExchange[]) => void;
  clearChat: () => void;
  toggleTemporary: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  exchanges: [],
  temporary: false,

  setSessionId: (id) => set({ sessionId: id }),

  addExchange: (exchange) =>
    set((state) => ({ exchanges: [...state.exchanges, exchange] })),

  setExchanges: (exchanges) => set({ exchanges }),

  clearChat: () => set({ sessionId: null, exchanges: [] }),

  toggleTemporary: () => set((state) => ({ temporary: !state.temporary })),
}));
