export const queryKeys = {
  profile: (profileId: string) => ["profile", profileId] as const,
  matches: (profileId: string) => ["matches", profileId] as const,
  userSearch: (query: string) => ["user-search", query] as const,
};
