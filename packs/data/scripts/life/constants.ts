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

// Protection nouveau joueur : pas de perte de vie durant les 3 premières heures de jeu cumulées.
export const PLAYTIME_MS_PROPERTY = "shuuaddons:playtimeMs";
export const NEW_PLAYER_PROTECTION_MS = 3 * 60 * 60 * 1000;
export const PROTECTION_NOTICE_PROPERTY = "shuuaddons:lifeProtectionNotified";
