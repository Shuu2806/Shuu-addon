// ── Indicateur visuel de ferrage ────────────────────────────────────────────
// Affiche la particule "!" (reprise de l'asset "fish_caught_2" de l'addon
// Angler's Desire, cf. packs/RP/particles/fish_bite_indicator.particle.json)
// au-dessus du bouchon au moment précis où le joueur peut ferrer — à chaque
// touche (si le poisson s'échappe et qu'il y a une nouvelle touche sur le même
// hameçon, l'indicateur réapparaît aussi).
// Objectif : donner un signal clair du bon moment pour reeler, pour éviter que
// les joueurs ne ferrent trop tôt à l'aveugle (ce qui, en plus de ne jamais
// compter comme une prise, peut faire disparaître le loot vanilla avant que
// notre détection n'ait eu le temps de l'identifier).

import type { Vector3 } from "@minecraft/server";
import { onFishBite } from "./fishing_detection.ts";

const INDICATOR_PARTICLE = "shuuaddons:fish_bite_indicator";

onFishBite(({ player, location }) => {
  const spawnPoint: Vector3 = { x: location.x, y: location.y + 0.3, z: location.z };
  player.dimension.spawnParticle(INDICATOR_PARTICLE, spawnPoint);
});
