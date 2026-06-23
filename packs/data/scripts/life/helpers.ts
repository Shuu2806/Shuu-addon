import { world, Player, GameMode } from "@minecraft/server";
import {
  LIVES_PROPERTY,
  STARTING_LIVES,
  LIVES_OBJECTIVE,
  PENDING_LIVES_PROPERTY,
  EVENT_MODE_PROPERTY,
  GAME_OVER_ACTION_PROPERTY,
  DEFAULT_GAME_OVER_ACTION,
  type GameOverAction,
} from "./constants.ts";

export function getLivesObjective() {
  return (
    world.scoreboard.getObjective(LIVES_OBJECTIVE) ??
    world.scoreboard.addObjective(LIVES_OBJECTIVE, "Vies")
  );
}

export function getLives(player: Player): number {
  const lives = player.getDynamicProperty(LIVES_PROPERTY);
  return typeof lives === "number" ? lives : STARTING_LIVES;
}

export function setLives(player: Player, lives: number): void {
  player.setDynamicProperty(LIVES_PROPERTY, lives);
  getLivesObjective().setScore(player, lives);
}

export function getGameOverAction(): GameOverAction {
  return world.getDynamicProperty(GAME_OVER_ACTION_PROPERTY) === "kick"
    ? "kick"
    : DEFAULT_GAME_OVER_ACTION;
}

export function setGameOverAction(action: GameOverAction): void {
  world.setDynamicProperty(GAME_OVER_ACTION_PROPERTY, action);
}

export function getPendingLives(): Record<string, number> {
  const raw = world.getDynamicProperty(PENDING_LIVES_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as Record<string, number>) : {};
}

export function addPendingLives(playerName: string, amount: number): void {
  const pending = getPendingLives();
  pending[playerName] = (pending[playerName] ?? 0) + amount;
  world.setDynamicProperty(PENDING_LIVES_PROPERTY, JSON.stringify(pending));
}

export function consumePendingLives(playerName: string): number {
  const pending = getPendingLives();
  const amount = pending[playerName];
  if (amount === undefined) return 0;
  delete pending[playerName];
  world.setDynamicProperty(PENDING_LIVES_PROPERTY, JSON.stringify(pending));
  return amount;
}

export function isEventModeActive(): boolean {
  return world.getDynamicProperty(EVENT_MODE_PROPERTY) === true;
}

export function getWorldSpawnLocation() {
  const dimension = world.getDimension("overworld");
  return { location: { x: -9, y: 73, z: 1 }, dimension };
}

export function reviveFromSpectator(player: Player): void {
  if (player.getGameMode() !== GameMode.Spectator) return;

  const spawnPoint = player.getSpawnPoint();
  if (spawnPoint) {
    player.teleport(spawnPoint, { dimension: spawnPoint.dimension });
  } else {
    const { location, dimension } = getWorldSpawnLocation();
    player.teleport(location, { dimension });
  }
  player.setGameMode(GameMode.Survival);
}

export function eliminatePlayer(player: Player): void {
  if (getGameOverAction() === "kick") {
    player.runCommand(`kick "${player.name}" Vous n'avez plus de vies.`);
    return;
  }
  player.setGameMode(GameMode.Spectator);
  player.sendMessage("§4§lVous n'avez plus de vies ! Vous passez en mode spectateur.");
}
