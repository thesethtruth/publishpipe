export const RENDER_PROFILES = ["interactive", "pdf"] as const;
export type RenderProfile = (typeof RENDER_PROFILES)[number];
