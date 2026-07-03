// ── Loot de pêche custom (remplace la prise vanilla) ────────────────────────
// À chaque prise confirmée par fishing_detection.ts, un tirage pondéré décide
// si la prise reste un poisson vanilla classique, ou si elle est remplacée par
// un item custom, une entité (vanilla), ou un gain de NC pur (jackpot très
// rare) — tout est configuré dans fishing_loot_config.json, uniforme dans tous
// les biomes, comme le faisait l'addon Angler's Desire. Seul consommateur de
// onFishCaught : remplace entièrement l'ancien handler qui vivait dans
// jobs/jobs.ts.

import {
  system,
  Player,
  ItemStack,
  EntityComponentTypes,
  type EntityInventoryComponent,
} from "@minecraft/server";
import type { Vector3 } from "@minecraft/server";
import { onFishCaught, type CaughtItem } from "./fishing_detection.ts";
import { pickWeighted, type WeightedEntry } from "./weighted_random.ts";
import { getCustomJobReward, getDefaultReward, grantReward } from "~/jobs/helpers.ts";
import fishingLootConfigRaw from "./fishing_loot_config.json";

export interface FishingLootVanillaItemEntry {
  label: string;
  xp: number;
  nc: number;
}
export interface FishingLootItemEntry {
  id: string;
  weight: number;
  amount?: number; // défaut 1 si absent
  label: string;
  xp: number;
  nc: number;
}
export interface FishingLootEntityEntry {
  id: string;
  weight: number;
  label: string;
  xp: number;
  nc: number;
  // Certaines entités vanilla (ex: tropical_fish, dont la variante/couleur est
  // assignée par cet évènement) refusent de spawn sans qu'un évènement de
  // création leur soit explicitement déclenché à l'apparition. Optionnel : la
  // plupart des mobs n'en ont pas besoin.
  spawnEvent?: string;
}
export interface FishingLootCurrencyEntry {
  amount: number;
  weight: number;
  label: string;
  xp: number;
}
export interface FishingLootConfig {
  vanillaWeight: number;
  vanillaItems: Record<string, FishingLootVanillaItemEntry>;
  items: FishingLootItemEntry[];
  entities: FishingLootEntityEntry[];
  currency: FishingLootCurrencyEntry[];
}

// Exporté : jobs/forms.tsx s'en sert pour afficher l'écran "Voir les gains" du
// Pêcheur avec les vraies valeurs actuelles (source unique de vérité).
export const fishingLootConfig = fishingLootConfigRaw as FishingLootConfig;
const config = fishingLootConfig;

// DEBUG temporaire — cf. common/fishing_detection.ts pour le même mécanisme.
// const DEBUG_PLAYER_NAME = "Shuu2806";
function debugMsg(_text: string) {
  // world.getAllPlayers().find((p) => p.name === DEBUG_PLAYER_NAME)?.sendMessage(`§7[FishLootDebug] §f${_text}`);
}

type LootOutcome =
  | { kind: "vanilla" }
  | { kind: "item"; entry: FishingLootItemEntry }
  | { kind: "entity"; entry: FishingLootEntityEntry }
  | { kind: "currency"; entry: FishingLootCurrencyEntry };

function rollLootOutcome(): LootOutcome {
  const entries: WeightedEntry<LootOutcome>[] = [
    { weight: config.vanillaWeight, value: { kind: "vanilla" } },
    ...config.items.map((entry): WeightedEntry<LootOutcome> => ({ weight: entry.weight, value: { kind: "item", entry } })),
    ...config.entities.map((entry): WeightedEntry<LootOutcome> => ({ weight: entry.weight, value: { kind: "entity", entry } })),
    ...config.currency.map((entry): WeightedEntry<LootOutcome> => ({ weight: entry.weight, value: { kind: "currency", entry } })),
  ];
  return pickWeighted(entries) ?? { kind: "vanilla" };
}

function grantVanillaReward(player: Player, item: CaughtItem): void {
  // Ordre : override runtime (config en jeu, dynamic property) > table du JSON
  // (source principale désormais) > table historique jobs_config.ts (filet de
  // sécurité pour un typeId pas encore migré dans le JSON).
  const customR = getCustomJobReward("fisher", item.typeId);
  const fromConfig = config.vanillaItems[item.typeId];
  const reward = (customR?.category === "pecher" ? customR : null)
    ?? fromConfig
    ?? getDefaultReward("fisher", "pecher", item.typeId);
  if (!reward) {
    debugMsg(`récompense — ${player.name} : source=vanilla id=${item.typeId} AUCUNE config trouvée`);
    return;
  }
  debugMsg(`récompense — ${player.name} : source=vanilla id=${item.typeId} xp=${reward.xp} nc=${reward.nc}`);
  // count fixé à 1, jamais item.amount : l'entité de loot vanilla peut avoir
  // fusionné avec des items du même type déjà au sol à proximité (comportement
  // vanilla automatique), ce qui gonflerait le montant sans rapport avec la
  // prise réelle. Une pêche ne donne jamais plus d'un item à la fois.
  grantReward(player, "fisher", reward, item.typeId, 1);
}

const ITEM_FLY_DURATION_TICKS = 12; // ~0.6s, même esprit que reelHook() de l'addon d'origine

function giveToInventory(player: Player, location: Vector3, stack: ItemStack): void {
  const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
  const leftover = inv?.container?.addItem(stack);
  if (leftover) player.dimension.spawnItem(leftover, location);
  debugMsg(
    `item custom donné : ${stack.typeId} x${stack.amount}${leftover ? " (surplus droppé au sol)" : ""} — ${player.name}`,
  );
}

// Fait "voler" l'item du point de prise jusqu'au joueur (arc simple, téléportation
// progressive à chaque tick) avant de le donner réellement — même principe que
// reelHook() dans l'addon d'origine (Angler's Desire), qui animait le poisson
// pêché en arc de Bézier jusqu'au joueur plutôt que de le donner instantanément.
function throwItemToPlayer(player: Player, stack: ItemStack, from: Vector3): void {
  const itemEntity = player.dimension.spawnItem(stack, from);
  const start = { x: from.x, y: from.y, z: from.z };
  const end = player.getHeadLocation();
  const horizontalDist = Math.hypot(end.x - start.x, end.z - start.z);
  const arcHeight = Math.max(1.2, horizontalDist * 0.5);
  let tick = 0;

  const runId = system.runInterval(() => {
    tick++;
    if (!itemEntity.isValid || !player.isValid) {
      system.clearRun(runId);
      return;
    }
    if (tick >= ITEM_FLY_DURATION_TICKS) {
      system.clearRun(runId);
      itemEntity.remove();
      giveToInventory(player, player.location, stack);
      player.playSound("random.pop");
      return;
    }
    const t = tick / ITEM_FLY_DURATION_TICKS;
    const x = start.x + (end.x - start.x) * t;
    const z = start.z + (end.z - start.z) * t;
    const y = start.y + (end.y - start.y) * t + arcHeight * Math.sin(Math.PI * t);
    try {
      itemEntity.teleport({ x, y, z });
    } catch {
      system.clearRun(runId);
    }
  }, 1);
}

onFishCaught(({ player, location, item, lootEntity }) => {
  if (!item) {
    debugMsg(`onFishCaught reçu mais item NON IDENTIFIÉ — aucun tirage — ${player.name}`);
    return;
  }

  const outcome = rollLootOutcome();
  const customWeight = config.items.reduce((s, e) => s + e.weight, 0)
    + config.entities.reduce((s, e) => s + e.weight, 0)
    + config.currency.reduce((s, e) => s + e.weight, 0);
  debugMsg(
    `roll — ${player.name} : vanilla=${config.vanillaWeight} vs total custom=${customWeight} → ` +
    `résultat=${outcome.kind}${outcome.kind !== "vanilla" ? ` (${"id" in outcome.entry ? outcome.entry.id : outcome.entry.amount + " NC"})` : ""}`,
  );

  if (outcome.kind === "vanilla") {
    grantVanillaReward(player, item);
    return;
  }

  // Garde-fou anti-race : le loot vanilla a pu disparaître entre la corrélation
  // et maintenant (ex. ramassé par un autre joueur). Dans ce cas on abandonne
  // la substitution plutôt que de risquer un doublon ou une prise sans rien.
  if (!lootEntity || !lootEntity.isValid) {
    debugMsg(`substitution ABANDONNÉE — lootEntity absent/invalide, repli sur récompense vanilla — ${player.name}`);
    grantVanillaReward(player, item);
    return;
  }

  debugMsg(`retrait du loot vanilla (${item.typeId} x${item.amount}) — ${player.name}`);
  lootEntity.remove();
  // Une prise ne convertit jamais plus d'1 poisson : si l'entité avait fusionné
  // avec d'autres du même type déjà au sol à proximité (comportement vanilla
  // automatique, cf. le fix de grantVanillaReward plus haut), on la retire
  // entièrement (impossible de "diviser" une entité en place) puis on redépose
  // immédiatement le surplus au même endroit, intact.
  if (item.amount > 1) {
    try {
      player.dimension.spawnItem(new ItemStack(item.typeId, item.amount - 1), location);
      debugMsg(`surplus fusionné redéposé : ${item.typeId} x${item.amount - 1} — ${player.name}`);
    } catch (e) {
      debugMsg(`ÉCHEC redépôt surplus ${item.typeId} : ${e} — ${player.name}`);
    }
  }

  if (outcome.kind === "item") {
    const amount = outcome.entry.amount ?? 1;
    // Même raisonnement que pour "entity" juste en dessous : new ItemStack(...)
    // ou container.addItem(...) peuvent lever (id invalide, etc.) — sans
    // try/catch l'erreur serait avalée silencieusement par fishing_detection.ts
    // et le joueur perdrait sa prise sans rien recevoir en échange.
    try {
      throwItemToPlayer(player, new ItemStack(outcome.entry.id, amount), location);
    } catch (e) {
      debugMsg(`ÉCHEC ItemStack(${outcome.entry.id}) : ${e} — récompense accordée quand même — ${player.name}`);
    }
    debugMsg(`récompense — ${player.name} : source=item id=${outcome.entry.id} xp=${outcome.entry.xp} nc=${outcome.entry.nc}`);
    grantReward(player, "fisher", { xp: outcome.entry.xp, nc: outcome.entry.nc }, outcome.entry.id, amount);
  } else if (outcome.kind === "entity") {
    // spawnEntity peut lever (ex: emplacement invalide) — sans try/catch, cette
    // exception serait avalée silencieusement par le emit() de
    // fishing_detection.ts, et le joueur se retrouverait sans rien alors que le
    // loot vanilla vient d'être supprimé juste au-dessus. On log l'erreur réelle
    // ET on accorde quand même la récompense : la prise a déjà été "consommée",
    // ce n'est pas au joueur de payer un bug de spawn.
    try {
      player.dimension.spawnEntity(outcome.entry.id, location, { spawnEvent: outcome.entry.spawnEvent });
      debugMsg(
        `entité custom spawnée : ${outcome.entry.id} @ ${location.x.toFixed(1)},${location.y.toFixed(1)},${location.z.toFixed(1)} — ${player.name}`,
      );
    } catch (e) {
      debugMsg(`ÉCHEC spawnEntity(${outcome.entry.id}) : ${e} — récompense accordée quand même — ${player.name}`);
    }
    debugMsg(`récompense — ${player.name} : source=entity id=${outcome.entry.id} xp=${outcome.entry.xp} nc=${outcome.entry.nc}`);
    grantReward(player, "fisher", { xp: outcome.entry.xp, nc: outcome.entry.nc }, outcome.entry.id, 1);
  } else {
    // Jackpot NC pur : aucun item/entité, juste un gros gain de monnaie.
    debugMsg(`récompense — ${player.name} : source=currency label="${outcome.entry.label}" xp=${outcome.entry.xp} nc=${outcome.entry.amount}`);
    grantReward(player, "fisher", { xp: outcome.entry.xp, nc: outcome.entry.amount }, "fishing_currency_jackpot", 1);
    player.sendMessage(`§6§l✦ ${outcome.entry.label} ! §e+${outcome.entry.amount} NC en pêchant !`);
  }
});
