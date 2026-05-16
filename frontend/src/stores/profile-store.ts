import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ExtractProfileResponse, SimilarityResponse } from "@/lib/api/types";

type ProfileClientState = {
  profile: ExtractProfileResponse | null;
  matches: SimilarityResponse | null;
  setProfile: (profile: ExtractProfileResponse) => void;
  updateProfilePreview: (profile: ExtractProfileResponse) => void;
  setMatches: (matches: SimilarityResponse) => void;
  clearProfileFlow: () => void;
};

export const useProfileStore = create<ProfileClientState>()(
  persist(
    (set) => ({
      profile: null,
      matches: null,
      setProfile: (profile) => set({ profile }),
      updateProfilePreview: (profile) => set({ profile }),
      setMatches: (matches) => set({ matches }),
      clearProfileFlow: () => set({ profile: null, matches: null }),
    }),
    {
      name: "mindmatch-profile",
      // localStorage persists across tabs and browser restarts
      // (sign-out calls clearProfileFlow which wipes the data)
    },
  ),
);
