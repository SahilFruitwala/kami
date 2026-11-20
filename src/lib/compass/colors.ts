/** Goal colours, by name; the hex values live in `src/styles/compass.css`. */
export const GOAL_COLORS = ["persimmon", "indigo", "bamboo", "ochre", "plum", "teal"] as const;
export type GoalColor = (typeof GOAL_COLORS)[number];
