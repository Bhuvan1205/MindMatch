import type { CognitiveProfile } from "@/lib/api/types";

export type ProfileCategoryKey = Exclude<keyof CognitiveProfile, "name">;

export const profileCategories: Array<{
  key: ProfileCategoryKey;
  label: string;
}> = [
  { key: "interests", label: "Interests" },
  { key: "goals", label: "Goals" },
  { key: "learning_preferences", label: "Learning Preferences" },
  { key: "collaboration_preferences", label: "Collaboration Preferences" },
  { key: "execution_patterns", label: "Execution Patterns" },
  { key: "discussion_topics", label: "Discussion Topics" },
];
