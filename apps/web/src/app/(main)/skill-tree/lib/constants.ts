/** XP at which constellation edges show an active endpoint. */
export const SKILL_EDGE_ACTIVATION_XP = 5

/** Edge weights in SVG pixels, ordered by endpoint activation. */
export const SKILL_EDGE_WIDTH_PX = {
  bothActive: 3,
  oneActive: 2,
  inactive: 1.6,
} as const

/** Edge opacity for the same endpoint activation states. */
export const SKILL_EDGE_OPACITY = {
  bothActive: 0.6,
  oneActive: 0.45,
  inactive: 0.4,
} as const

/** Dash/gap lengths in SVG pixels for an inactive edge. */
export const SKILL_EDGE_INACTIVE_DASH_PX = '4,6'
