import { world, system, Player } from "@minecraft/server";

export function startTpChannel(player: Player, seconds: number, onComplete: (p: Player) => void): void {
  const startPos = { x: player.location.x, y: player.location.y, z: player.location.z };
  const pid = player.id;
  let cancelled = false;
  let elapsedTicks = 0;
  player.onScreenDisplay.setActionBar(`§eTéléportation dans §c${seconds}§e... Ne bougez pas !`);
  const checkId = system.runInterval(() => {
    elapsedTicks += 5;
    const p = world.getAllPlayers().find((x) => x.id === pid);
    if (!p) { cancelled = true; system.clearRun(checkId); return; }
    const d = Math.abs(p.location.x - startPos.x) + Math.abs(p.location.z - startPos.z);
    if (d > 0.5) {
      cancelled = true;
      system.clearRun(checkId);
      p.sendMessage("§cTéléportation annulée — vous avez bougé.");
      return;
    }
    const remaining = seconds - Math.floor(elapsedTicks / 20);
    if (remaining > 0) p.onScreenDisplay.setActionBar(`§eTéléportation dans §c${remaining}§e... Ne bougez pas !`);
  }, 5);
  system.runTimeout(() => {
    system.clearRun(checkId);
    if (cancelled) return;
    const p = world.getAllPlayers().find((x) => x.id === pid);
    if (!p) return;
    onComplete(p);
  }, seconds * 20);
}
