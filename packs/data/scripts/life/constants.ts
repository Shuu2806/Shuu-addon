export const STARTING_LIVES = 3;
export const LIVES_PROPERTY = "shuuaddons:lives";
export const LIVES_OBJECTIVE = "lives";
export const EXTRA_LIFE_ITEM = "shuuaddons:extra_life";
export const REVIVE_ITEM = "shuuaddons:revive";
export const PENDING_LIVES_PROPERTY = "shuuaddons:pendingLives";
export const EVENT_MODE_PROPERTY = "shuuaddons:eventMode";

export type GameOverAction = "spectator" | "kick";
export const GAME_OVER_ACTION_PROPERTY = "shuuaddons:gameOverAction";
export const GAME_OVER_ACTION_ENUM = "shuuaddons:gameoveraction";
export const DEFAULT_GAME_OVER_ACTION: GameOverAction = "spectator";
