import { world, system, Player, EntityComponentTypes, EntityInventoryComponent } from "@minecraft/server";
import { EXTRA_LIFE_ITEM, REVIVE_ITEM, NEW_PLAYER_PROTECTION_MS } from "./constants.ts";
import {
  getLives,
  setLives,
  eliminatePlayer,
  isEventModeActive,
  reviveFromSpectator,
  consumePendingLives,
  getPlaytimeMs,
  addPlaytimeMs,
  hasBeenNotifiedProtectionEnded,
  markProtectionEndedNotified,
} from "./helpers.ts";
import { openReviveForm } from "./forms.tsx";
import "./commands.ts";

// DEBUG temporaire — broadcast à tout le monde pour comparer plusieurs joueurs en test.
function debugMsg(_text: string) {
  // world.sendMessage(`§7[LifeDebug] §f${_text}`);
}

// ── Suivi du temps de jeu cumulé (protection nouveau joueur) ──────────────────

const sessionStart = new Map<string, number>();
const PLAYTIME_FLUSH_TICKS = 20 * 30; // toutes les ~30s (persistance seulement, pas la vérité en direct)

// Temps de jeu réel de CE joueur à l'instant présent : la valeur déjà persistée
// (flush précédent ou sessions passées) + le temps écoulé depuis le début de SA
// session en cours. Ne dépend jamais du dernier flush périodique — deux joueurs
// arrivés à des moments différents ont donc chacun leur propre échéance exacte,
// jamais synchronisée l'un sur l'autre ni sur la cadence du flush.
function getLivePlaytimeMs(player: Player): number {
  const stored = getPlaytimeMs(player);
  const start = sessionStart.get(player.id);
  if (start === undefined) return stored;
  return stored + Math.max(0, Date.now() - start);
}

function flushPlaytime(player: Player, now: number): number {
  const start = sessionStart.get(player.id) ?? now;
  sessionStart.set(player.id, now);
  return addPlaytimeMs(player, Math.max(0, now - start));
}

function notifyIfProtectionJustEnded(player: Player, totalPlaytimeMs: number): void {
  if (totalPlaytimeMs < NEW_PLAYER_PROTECTION_MS) return;
  if (hasBeenNotifiedProtectionEnded(player)) return;
  markProtectionEndedNotified(player);
  debugMsg(`notify — ${player.name} : notification de fin de protection envoyée`);
  player.sendMessage(
    "§e§lFin de la protection nouveau joueur : la perte de vie en cas de mort est désormais active !",
  );
  player.playSound("random.orb");
}

system.runInterval(() => {
  const now = Date.now();
  for (const player of world.getAllPlayers()) {
    // Protection déjà définitivement terminée pour ce joueur : le temps de jeu
    // ne fait qu'augmenter, donc ça ne redeviendra jamais pertinent — inutile de
    // continuer à lire/écrire sa propriété toutes les 30s indéfiniment.
    if (hasBeenNotifiedProtectionEnded(player)) {
      sessionStart.delete(player.id);
      continue;
    }
    const total = flushPlaytime(player, now);
    debugMsg(`flush — ${player.name} : total stocké=${(total / 1000).toFixed(1)}s`);
    notifyIfProtectionJustEnded(player, total);
  }
}, PLAYTIME_FLUSH_TICKS);

world.beforeEvents.playerLeave.subscribe((event) => {
  if (!hasBeenNotifiedProtectionEnded(event.player)) {
    flushPlaytime(event.player, Date.now());
  }
  sessionStart.delete(event.player.id);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  let lives = getLives(player);

  if (initialSpawn) {
    if (!hasBeenNotifiedProtectionEnded(player)) {
      sessionStart.set(player.id, Date.now());
      debugMsg(`initialSpawn — ${player.name} : session démarrée, stocké déjà=${(getPlaytimeMs(player) / 1000).toFixed(1)}s`);
    }

    const pending = consumePendingLives(player.name);
    if (pending > 0) {
      lives += pending;
      player.sendMessage(
        `§a+${pending} vie(s) reçue(s) pendant votre absence ! Vous avez maintenant §c${lives}§a vie(s).`,
      );
    }
    setLives(player, lives);

    if (lives > 0) reviveFromSpectator(player);
  }

  if (lives <= 0) {
    eliminatePlayer(player);
  } else if (!initialSpawn) {
    player.onScreenDisplay.setActionBar(`§c${lives} vie(s) restante(s)`);
  }
});

world.afterEvents.entityDie.subscribe((event) => {
  const player = event.deadEntity;
  if (!(player instanceof Player)) return;
  if (isEventModeActive()) return;

  // Court-circuit : une fois notifiée, la protection ne redevient jamais active
  // (le temps de jeu ne fait qu'augmenter) — pas besoin de recalculer le live.
  if (!hasBeenNotifiedProtectionEnded(player)) {
    const livePlaytimeMs = getLivePlaytimeMs(player);
    debugMsg(
      `entityDie — ${player.name} : live=${(livePlaytimeMs / 1000).toFixed(1)}s / ` +
      `seuil=${(NEW_PLAYER_PROTECTION_MS / 1000).toFixed(1)}s → ` +
      `${livePlaytimeMs < NEW_PLAYER_PROTECTION_MS ? "PROTÉGÉ" : "vie perdue"}`,
    );
    if (livePlaytimeMs < NEW_PLAYER_PROTECTION_MS) {
      const minutesLeft = Math.ceil((NEW_PLAYER_PROTECTION_MS - livePlaytimeMs) / 60_000);
      player.sendMessage(
        `§bVous êtes un nouveau joueur : aucune vie perdue (protection encore active ${minutesLeft} min).`,
      );
      return;
    }
  }

  const lives = Math.max(getLives(player) - 1, 0);
  setLives(player, lives);

  if (lives <= 0) {
    player.sendMessage("§4§lC'était votre dernière vie...");
  } else {
    player.sendMessage(`§eIl vous reste §c${lives}§e vie(s).`);
  }
});

world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;

  if (itemStack.typeId === EXTRA_LIFE_ITEM) {
    const lives = getLives(player) + 1;
    setLives(player, lives);
    player.sendMessage(`§a+1 vie ! Vous avez maintenant §c${lives}§a vie(s).`);
    player.playSound("random.levelup");

    const inventory = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
    const slot = player.selectedSlotIndex;
    const item = inventory.container.getItem(slot);
    if (!item) return;
    if (item.amount > 1) {
      item.amount -= 1;
      inventory.container.setItem(slot, item);
    } else {
      inventory.container.setItem(slot, undefined);
    }
    return;
  }

  if (itemStack.typeId === REVIVE_ITEM) {
    system.run(async () => openReviveForm(player));
  }
});
