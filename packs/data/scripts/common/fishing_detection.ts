// ── Détection de pêche (extrait et adapté de "Angler's Desire" v1.0.2) ────────
//
// Ce module réimplémente uniquement la MACHINE À ÉTATS de détection de pêche de
// l'addon "Angler's Desire" par h_YanG_0A / DaL4y (GPL-3.0-or-later) : lancer de
// ligne, stabilisation du bouchon dans l'eau, détection de touche (dip du
// bouchon), fenêtre de ferrage, succès / échec, et reset AFK.
//
// Tout ce qui est spécifique à l'addon d'origine (loot tables custom, particules,
// sons, textes traduits, enchantements custom, upgrades, configuration UI,
// sauvegarde de données) a été retiré : ce module ne fait QUE détecter, il
// n'accorde aucune récompense lui-même. Le reste de l'addon s'abonne via
// onFishBite / onFishEscape / onFishCaught / onFishingAfk pour réagir.
//
// Les seuils, offsets et délais ci-dessous sont IDENTIQUES à l'addon d'origine
// (fishing_system/events/on_wait_hook_stablized.js, on_hook_created.js,
// on_hook_item.js) — ne pas les modifier sans comprendre leur rôle, cf. rapport
// d'extraction fourni séparément.

import {
  world,
  system,
  Player,
  Entity,
  EntityEquippableComponent,
  EntityItemComponent,
  EquipmentSlot,
  TicksPerSecond,
} from "@minecraft/server";
import type { Vector3 } from "@minecraft/server";

// ───────────────────────── Constantes de détection ─────────────────────────

const FISHING_ROD_TYPE  = "minecraft:fishing_rod";
const FISHING_HOOK_TYPE = "minecraft:fishing_hook";
const BUBBLE_COLUMN_TYPE = "minecraft:bubble_column";
const DROPPED_ITEM_TYPE = "minecraft:item";

// Le hameçon vanilla a un composant "minecraft:loot" : au moment de la prise, le
// jeu fait spawn une vraie entité item près du hameçon (qui "vole" ensuite vers
// le joueur). On identifie CETTE entité pour savoir avec certitude ce qui a été
// pêché, plutôt que de déduire un diff d'inventaire — ce qui serait exploitable
// (ramasser un item sans rapport pile pendant la fenêtre de récompense).
const LOOT_MATCH_MAX_DISTANCE_SQ = 2 * 2;

const HOOK_SPAWN_DEBOUNCE_MS  = 150;                  // anti double-déclenchement à la création du hameçon
const HOOK_LANDED_DEBOUNCE_MS = 500;                  // anti relance de la boucle de stabilisation
const STABILIZE_POLL_TICKS    = 0.5 * TicksPerSecond; // fréquence de poll pendant la stabilisation (10 ticks)

const HOOK_SUBMERGE_OFFSET      = 0.1; // delta Y (m) sous la position stabilisée => "touche"
const HOOK_DEEP_SUBMERGE_OFFSET = 1.0; // delta Y (m) sous la position stabilisée => dip "profond" (trésor potentiel)

// Dans l'addon d'origine, cette fenêtre ne vaut 0.25s que sans l'amélioration
// custom "Tempus" (1s avec) — un enchantement payant qu'on a volontairement
// exclu du port. 0.25s est un temps de réaction quasi impossible pour un
// joueur ; on utilise donc directement une valeur confortable (2s).
const BITE_WINDOW_TICKS = TicksPerSecond; // fenêtre pour ferrer après la touche
const AFK_TIMEOUT_TICKS = 300 * TicksPerSecond;  // reset automatique si aucune touche (5 min)

const BITE_EVENT_DEBOUNCE_TICKS   = 20; // anti-spam de l'évènement "touche"
const ESCAPE_EVENT_DEBOUNCE_TICKS = 27; // anti-spam de l'évènement "échec"

// ───────────────────────── Utilitaires internes ─────────────────────────

class StateController<T> {
  private previousValue: T;
  constructor(private currentValue: T) {
    this.previousValue = currentValue;
  }
  setValue(next: T) {
    this.previousValue = this.currentValue;
    this.currentValue = next;
  }
  hasChanged() {
    return this.currentValue !== this.previousValue;
  }
  get current() {
    return this.currentValue;
  }
}

class Timer {
  private currentTick = 0;
  constructor(private readonly end: number) {}
  update(step = 1) {
    if (!this.isDone()) this.currentTick += step;
  }
  reset() {
    this.currentTick = 0;
  }
  isDone() {
    return this.currentTick >= this.end;
  }
}

// Signature de vélocité d'un hameçon flottant au repos sur l'eau (0,-0.05,0 arrondi).
// Note : "=== 0" couvre aussi -0 (en JS, -0 === 0), pas besoin de le distinguer ici.
function isHookVelocityStabilized(vx: number, vy: number, vz: number): boolean {
  const roundedY = Math.round(vy * 100) / 100;
  return (
    Math.round(vx * 100) / 100 === 0 &&
    roundedY >= -0.06 &&
    roundedY <= -0.04 &&
    Math.round(vz * 100) / 100 === 0
  );
}

// Vélocité nulle sur les 3 axes = hameçon planté au sol / dans un bloc (pas dans l'eau).
function isHookStuckOnGround(vx: number, vy: number, vz: number): boolean {
  return vx === 0 && vy === 0 && vz === 0;
}

function isHoldingFishingRod(player: Player): boolean {
  const equippable = player.getComponent(
    EntityEquippableComponent.componentId
  ) as EntityEquippableComponent | undefined;
  return equippable?.getEquipment(EquipmentSlot.Mainhand)?.typeId === FISHING_ROD_TYPE;
}

// ───────────────────────── Débug temporaire ─────────────────────────
// À retirer une fois le problème identifié : envoie chaque étape franchie de la
// détection au joueur DEBUG_PLAYER_NAME pour localiser où la chaîne casse.

// const DEBUG_PLAYER_NAME = "Shuu2806";

function debugMsg(_text: string) {
  // const target = world.getAllPlayers().find((p) => p.name === DEBUG_PLAYER_NAME);
  // target?.sendMessage(`§7[FishDebug] §f${_text}`);
}

// ───────────────────────── État de session par joueur ─────────────────────────

export interface CaughtItem {
  typeId: string;
  amount: number;
}

interface FishingSession {
  player: Player;
  hook: Entity | null;
  stabilizedLocation: Vector3 | null;
  isSubmerged: boolean;
  isDeeplySubmerged: boolean;
  canBeReeled: boolean;
  caughtItem: CaughtItem | null;
  // Référence vivante vers l'entité "item" vanilla correspondant à caughtItem,
  // si la corrélation a réussi. Peut devenir invalide entre la corrélation et
  // sa consommation (un autre joueur pourrait la ramasser) — toujours vérifier
  // `.isValid` avant de s'en servir.
  lootEntity: Entity | null;
  // Tick jusqu'auquel une entité de loot proche doit encore être associée à
  // cette session même si canBeReeled vient d'être remis à false (la prise est
  // déjà confirmée, on attend juste que le loot vanilla apparaisse).
  lootCorrelationDeadline: number | null;
}

const sessions = new Map<string, FishingSession>();

function getSession(player: Player): FishingSession {
  let session = sessions.get(player.id);
  if (!session) {
    session = {
      player,
      hook: null,
      stabilizedLocation: null,
      isSubmerged: false,
      isDeeplySubmerged: false,
      canBeReeled: false,
      caughtItem: null,
      lootEntity: null,
      lootCorrelationDeadline: null,
    };
    sessions.set(player.id, session);
  }
  return session;
}

function resetSession(player: Player) {
  const session = getSession(player);
  session.hook = null;
  session.stabilizedLocation = null;
  session.isSubmerged = false;
  session.isDeeplySubmerged = false;
  session.canBeReeled = false;
  session.caughtItem = null;
  session.lootEntity = null;
  session.lootCorrelationDeadline = null;
}

function distanceSquared(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

// Anti-spam (mêmes fenêtres que l'original, renommées pour refléter leur rôle réel)
const hookSpawnLog   = new Map<string, number>(); // Date.now() ms
const hookLandedLog  = new Map<string, number>(); // Date.now() ms
const biteEventLog   = new Map<string, number>(); // system.currentTick
const escapeEventLog = new Map<string, number>(); // system.currentTick

// ───────────────────────── Événements publics ─────────────────────────

export interface FishBiteEvent {
  player: Player;
  location: Vector3;
  isDeepBite: boolean; // dip profond (>= HOOK_DEEP_SUBMERGE_OFFSET) : indicateur "trésor" dans l'addon d'origine
}
export interface FishEscapeEvent {
  player: Player;
}
export interface FishCaughtEvent {
  player: Player;
  location: Vector3;
  // Item réellement identifié près du hameçon au moment de la prise (via l'entité
  // de loot que le jeu fait spawn). Absent si la corrélation a échoué (rare) —
  // dans ce cas, aucune récompense ne doit être accordée en aval (mieux vaut
  // rater une prise que de laisser un vecteur d'exploit ouvert).
  item: CaughtItem | null;
  // Référence vivante vers l'entité de loot vanilla correspondant à `item` (null
  // si `item` est null). Permet à un consommateur de la supprimer pour la
  // remplacer par un loot custom. Peut être devenue invalide entre-temps
  // (ramassée par un autre joueur pendant la fenêtre de corrélation) — toujours
  // vérifier `.isValid` avant tout usage. fishing_detection.ts ne fait qu'exposer
  // la meilleure référence connue, aucune décision n'est prise ici.
  lootEntity: Entity | null;
}
export interface FishingAfkEvent {
  player: Player;
}

type Listener<T> = (event: T) => void;
const biteListeners: Listener<FishBiteEvent>[] = [];
const escapeListeners: Listener<FishEscapeEvent>[] = [];
const caughtListeners: Listener<FishCaughtEvent>[] = [];
const afkListeners: Listener<FishingAfkEvent>[] = [];

/** Le bouchon vient de plonger : une touche potentielle démarre. */
export function onFishBite(cb: Listener<FishBiteEvent>) {
  biteListeners.push(cb);
}
/** La fenêtre de ferrage a expiré sans que le joueur ne reprenne la ligne : le poisson s'est échappé. */
export function onFishEscape(cb: Listener<FishEscapeEvent>) {
  escapeListeners.push(cb);
}
/** Le joueur a retiré le hameçon pendant la fenêtre de ferrage : prise réussie. */
export function onFishCaught(cb: Listener<FishCaughtEvent>) {
  caughtListeners.push(cb);
}
/** Aucune touche depuis AFK_TIMEOUT_TICKS : la session de pêche a été reset automatiquement. */
export function onFishingAfk(cb: Listener<FishingAfkEvent>) {
  afkListeners.push(cb);
}

function emit<T>(listeners: Listener<T>[], event: T) {
  for (const cb of listeners) {
    try {
      cb(event);
    } catch {
      // Une erreur dans un listener ne doit pas casser la boucle de détection.
    }
  }
}

// ───────────────────────── Étape 1 : création du hameçon ─────────────────────────
// Équivalent de fishing_system/events/on_hook_created.js

function handleHookSpawned(hookEntity: Entity, player: Player) {
  if (hookEntity.typeId !== FISHING_HOOK_TYPE) return;

  const now = Date.now();
  const oldLog = hookSpawnLog.get(player.id) ?? 0;
  hookSpawnLog.set(player.id, now);
  if (oldLog + HOOK_SPAWN_DEBOUNCE_MS >= now) {
    debugMsg(`[1] hameçon ignoré (debounce spawn) — ${player.name}`);
    return;
  }

  debugMsg(`[1] hameçon créé — ${player.name}`);
  resetSession(player);
  const session = getSession(player);
  session.hook = hookEntity;

  void waitForHookStabilization(player);
}

// ───────────────────────── Étape 2 : stabilisation dans l'eau ─────────────────────────
// Équivalent de la fonction requestHookOnWater() dans on_wait_hook_stablized.js

async function waitForHookStabilization(player: Player): Promise<void> {
  const session = getSession(player);

  const now = Date.now();
  const oldLog = hookLandedLog.get(player.id) ?? 0;
  hookLandedLog.set(player.id, now);
  if (oldLog + HOOK_LANDED_DEBOUNCE_MS >= now) {
    debugMsg(`[2] stabilisation ignorée (debounce landed) — ${player.name}`);
    return;
  }

  debugMsg(`[2] en attente de stabilisation... — ${player.name}`);
  const didStabilize = await new Promise<boolean>((resolve) => {
    const pollId = system.runInterval(() => {
      let stabilized = false;
      try {
        const hook = session.hook;
        if (!hook || !hook.isValid) throw new Error("hook missing");

        const { x: vx, y: vy, z: vz } = hook.getVelocity();

        const positionStillUnset = session.stabilizedLocation === null;
        const notInBubbleColumn =
          hook.dimension.getBlock(hook.location)?.typeId !== BUBBLE_COLUMN_TYPE;

        if (isHookVelocityStabilized(vx, vy, vz) && positionStillUnset && notInBubbleColumn) {
          session.stabilizedLocation = hook.location;
          stabilized = true;
          throw new Error("stabilized");
        } else if (isHookStuckOnGround(vx, vy, vz)) {
          stabilized = false;
          throw new Error("stuck on ground");
        }
      } catch {
        system.clearRun(pollId);
        resolve(stabilized);
      }
    }, STABILIZE_POLL_TICKS);
  });

  if (!didStabilize) {
    debugMsg(`[2] ÉCHEC stabilisation (hameçon perdu ou planté au sol) — ${player.name}`);
    return;
  }
  debugMsg(`[2] hameçon stabilisé sur l'eau — ${player.name}`);
  startBiteMonitoring(player);
}

// ───────────────────────── Étape 3 : surveillance de la touche ─────────────────────────
// Équivalent du corps principal de on_wait_hook_stablized.js (StartFishingInterval)

function startBiteMonitoring(player: Player) {
  const session = getSession(player);
  if (!session.stabilizedLocation) return;

  const expirationTimer = new Timer(AFK_TIMEOUT_TICKS);
  const delayTimer = new Timer(BITE_WINDOW_TICKS);
  const submergeState = new StateController(session.isSubmerged);
  const initialY = session.stabilizedLocation.y;
  let maxDrop = 0; // DEBUG temporaire — calibrage de HOOK_SUBMERGE_OFFSET

  let afkTriggered = false;

  const loopId = system.runInterval(() => {
    try {
      const hook = session.hook;
      if (!hook || !hook.isValid) throw new Error("hook missing");

      const currentDrop = initialY - hook.location.y;
      if (currentDrop > maxDrop) maxDrop = currentDrop;

      if (session.canBeReeled) {
        if (!delayTimer.isDone()) {
          delayTimer.update();
        } else {
          const now = system.currentTick;
          const lastBite = biteEventLog.get(player.id) ?? -Infinity;
          if (lastBite + BITE_EVENT_DEBOUNCE_TICKS >= now) return;

          const lastEscape = escapeEventLog.get(player.id) ?? -Infinity;
          escapeEventLog.set(player.id, now);
          if (lastEscape + ESCAPE_EVENT_DEBOUNCE_TICKS >= now) return;

          delayTimer.reset();
          session.canBeReeled = false;
          debugMsg(`[3] ÉCHEC — fenêtre de ferrage expirée — ${player.name}`);
          emit(escapeListeners, { player });
        }
      } else {
        delayTimer.reset();
      }

      session.isSubmerged = initialY - HOOK_SUBMERGE_OFFSET >= hook.location.y;
      session.isDeeplySubmerged = initialY - HOOK_DEEP_SUBMERGE_OFFSET >= hook.location.y;
      submergeState.setValue(session.isSubmerged);
      expirationTimer.update();

      checkSubmergeTransition();

      if (expirationTimer.isDone()) {
        afkTriggered = true;
        resetSession(player);
        debugMsg(`[3] AFK — reset automatique — ${player.name}`);
        emit(afkListeners, { player });
        throw new Error("afk");
      }
    } catch {
      // Le hameçon a disparu (retiré par le joueur) alors qu'une touche était en cours : prise réussie.
      if (session.canBeReeled && isHoldingFishingRod(player) && session.stabilizedLocation) {
        const location = session.stabilizedLocation;
        const itemAtDetection = session.caughtItem;
        const lootEntityAtDetection = session.lootEntity;
        // La prise est confirmée ici, mais le loot vanilla peut apparaître 1-2
        // ticks plus tard — on garde la fenêtre de corrélation ouverte pour cette
        // session même après avoir remis canBeReeled à false juste en dessous.
        session.lootCorrelationDeadline = system.currentTick + 4;
        // Petit délai : l'entité de loot vanilla peut apparaître 1-2 ticks après
        // la disparition du hameçon selon l'ordre de traitement du moteur — on
        // laisse le temps à la corrélation (cf. entitySpawn plus bas) de finir
        // avant d'émettre l'évènement avec l'item identifié.
        system.runTimeout(() => {
          const item = session.caughtItem ?? itemAtDetection;
          const lootEntity = session.lootEntity ?? lootEntityAtDetection ?? null;
          debugMsg(
            `[4] PRISE — item=${item ? `${item.typeId} x${item.amount}` : "NON IDENTIFIÉ"}, ` +
            `chute Y max=${maxDrop.toFixed(3)}m — ${player.name}`,
          );
          emit(caughtListeners, { player, location, item, lootEntity });
        }, 2);
      } else if (!afkTriggered) {
        debugMsg(
          `[4] hameçon retiré SANS prise (canBeReeled=${session.canBeReeled}, ` +
          `canneEnMain=${isHoldingFishingRod(player)}, chute Y max=${maxDrop.toFixed(3)}m, ` +
          `seuil=${HOOK_SUBMERGE_OFFSET}m) — ${player.name}`,
        );
      }
      system.clearRun(loopId);
      session.isSubmerged = false;
      session.canBeReeled = false;
    }
  }, 1);

  function checkSubmergeTransition() {
    if (!submergeState.hasChanged()) return;

    if (submergeState.current) {
      const now = system.currentTick;
      const lastBite = biteEventLog.get(player.id) ?? -Infinity;
      biteEventLog.set(player.id, now);
      if (lastBite + BITE_EVENT_DEBOUNCE_TICKS >= now) return;

      // La fenêtre de ferrage s'ouvre dès le splash : un joueur qui ferre au
      // moment où il voit le bouchon plonger doit être reconnu comme une prise
      // valide (comportement attendu côté joueur), pas seulement s'il attend un
      // second mouvement du bouchon.
      session.canBeReeled = true;
      session.caughtItem = null; // repart de zéro pour cette touche, cf. corrélation du loot plus bas
      session.lootEntity = null;
      debugMsg(`[3] TOUCHE — fenêtre de ferrage ouverte (profond=${session.isDeeplySubmerged}) — ${player.name}`);
      emit(biteListeners, {
        player,
        location: session.stabilizedLocation as Vector3,
        isDeepBite: session.isDeeplySubmerged,
      });
    } else {
      const hook = session.hook;
      if (!hook) return;
      const { x: vx, y: vy, z: vz } = hook.getVelocity();
      if (!isHookVelocityStabilized(vx, vy, vz)) {
        debugMsg(`[3] bouchon remonté anormalement (poisson toujours accroché) — ${player.name}`);
      } else {
        debugMsg(`[3] bouchon remonté normalement — ${player.name}`);
      }
    }
  }
}

// ───────────────────────── Câblage des évènements moteur ─────────────────────────
// Équivalent du câblage fait dans scripts/main.js

// L'API de scripting ne donne pas de lien direct hameçon -> propriétaire : on
// mémorise qui vient d'utiliser sa canne, puis on associe le hameçon fraîchement
// apparu au joueur "en attente" le plus proche. Un abonnement permanent (plutôt
// que l'abonnement "à usage unique" le temps d'1 tick tenté au départ) évite de
// rater le spawn si celui-ci arrive plus vite qu'un tick après l'itemUse.
const PENDING_CAST_TIMEOUT_TICKS = 10;
const pendingCasts = new Map<string, { player: Player; tick: number }>();

// beforeEvents (pas afterEvents) : le hameçon peut apparaître (entitySpawn) avant
// que l'after-event itemUse ne soit dispatché — il faut enregistrer le joueur
// "en attente" avant que l'action ne s'exécute, sinon le spawn arrive trop tôt
// pour être associé à personne.
world.beforeEvents.itemUse.subscribe((event) => {
  const player = event.source;
  if (event.itemStack.typeId !== FISHING_ROD_TYPE) return;
  if (!isHoldingFishingRod(player)) {
    system.run(() => debugMsg(`[0] itemUse canne détecté mais isHoldingFishingRod=false — ${player.name}`));
    return;
  }

  system.run(() => debugMsg(`[0] itemUse canne détecté — ${player.name}`));
  pendingCasts.set(player.id, { player, tick: system.currentTick });
});

world.afterEvents.entitySpawn.subscribe((spawnEvent) => {
  const entity = spawnEvent.entity;
  if (!entity) return;

  if (entity.typeId === DROPPED_ITEM_TYPE) {
    correlateLootItem(entity);
    return;
  }
  if (entity.typeId !== FISHING_HOOK_TYPE) return;

  const now = system.currentTick;
  let closestPlayer: Player | null = null;
  let closestDist = Infinity;
  for (const [playerId, pending] of pendingCasts) {
    if (now - pending.tick > PENDING_CAST_TIMEOUT_TICKS || !pending.player.isValid) {
      pendingCasts.delete(playerId);
      continue;
    }
    const dist = distanceSquared(pending.player.location, entity.location);
    if (dist < closestDist) {
      closestDist = dist;
      closestPlayer = pending.player;
    }
  }
  if (!closestPlayer) {
    debugMsg(`[0b] hameçon spawné mais AUCUN joueur en attente (ordre d'évènements ?)`);
    return;
  }
  pendingCasts.delete(closestPlayer.id);
  handleHookSpawned(entity, closestPlayer);
});

// Associe une entité "item" fraîchement apparue au hameçon le plus proche parmi
// les sessions en fenêtre de ferrage active (canBeReeled) : c'est la seule
// fenêtre où un loot de pêche légitime peut apparaître près du hameçon.
//
// Important : on compare à "stabilizedLocation" (mémorisée, stable) plutôt qu'à
// "hook.location" — au moment où le loot apparaît, le hameçon vient très
// probablement d'être invalidé dans le même geste moteur (retiré + loot spawné
// ensemble), donc `hook.isValid`/`hook.location` ne sont plus fiables ici.
function correlateLootItem(itemEntity: Entity) {
  debugMsg(
    `[3c] entité item détectée : ${itemEntity.typeId} @ ${Math.round(itemEntity.location.x)},` +
    `${Math.round(itemEntity.location.y)},${Math.round(itemEntity.location.z)}`,
  );

  const now = system.currentTick;
  for (const session of sessions.values()) {
    const correlationOpen = session.canBeReeled ||
      (session.lootCorrelationDeadline !== null && now <= session.lootCorrelationDeadline);
    if (!correlationOpen || !session.stabilizedLocation) continue;
    const distSq = distanceSquared(session.stabilizedLocation, itemEntity.location);
    if (distSq > LOOT_MATCH_MAX_DISTANCE_SQ) {
      debugMsg(`[3c] rejeté pour ${session.player.name} — distance²=${distSq.toFixed(2)}`);
      continue;
    }

    const itemComp = itemEntity.getComponent(EntityItemComponent.componentId) as EntityItemComponent | undefined;
    if (!itemComp) continue;

    session.caughtItem = { typeId: itemComp.itemStack.typeId, amount: itemComp.itemStack.amount };
    session.lootEntity = itemEntity;
    debugMsg(
      `[3b] loot identifié près du hameçon : ${session.caughtItem.typeId} x${session.caughtItem.amount} — ${session.player.name}`,
    );
    return;
  }
}

world.afterEvents.playerLeave.subscribe((event) => {
  sessions.delete(event.playerId);
  pendingCasts.delete(event.playerId);
  hookSpawnLog.delete(event.playerId);
  hookLandedLog.delete(event.playerId);
  biteEventLog.delete(event.playerId);
  escapeEventLog.delete(event.playerId);
});
