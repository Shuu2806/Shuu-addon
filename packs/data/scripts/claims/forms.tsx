import { world, system, Player, EntityComponentTypes, type EntityInventoryComponent } from "@minecraft/server";
import { Panel, Screen, render, useExit, useState, type JSX } from "@bedrock-core/ui";
import { useCloseOnHurt } from "../common/use-close-on-hurt.ts";
import { CenteredText } from "../common/centered-text.tsx";
import { Scaffold } from "../common/scaffold.tsx";
import { TitleBar, InfoBox, SaBtn, BG_BODY, BG_PANEL } from "../common/ui.tsx";
import { IconBtn, WideIconBtn, TwoColRow, StyledInput, StyledDropdown } from "../common/components.tsx";
import { getBalance, removeBalance, fmtNC } from "../common/economy.ts";
import { recordBackPosition } from "../common/back.ts";
import { startTpChannel } from "../common/tp-channel.ts";
import type { ClaimGroup } from "./data.ts";
import {
  CLAIM_EFFECTS, EFFECT_TYPES,
  CLAIM_SLOT_COUNT, ANCHOR_COSTS, DEFAULT_MAX_MEMBERS,
  TP_SET_COST, TP_USE_COST,
  getClaimGroups, setClaimGroups, getMaxAnchors, getHistory, clearGroupHistory,
  countGroupChunks, chunkCost, findGroupForChunk, isAdjacentToGroup,
  isGroupConnected, entryContainsChunk, splitEntryExcluding,
  validateClaimName, getChunk, getNextMemberUpgrade, getUnlocked, formatTs,
} from "./data.ts";

const W  = 280;
const WC = W - 8;

type ClaimsView =
  | "main"
  | "my_groups"
  | { kind: "confirm_anchor"; newMax: number; cost: number }
  | { kind: "group_editor"; groupId: string }
  | { kind: "rename"; groupId: string }
  | { kind: "members"; groupId: string }
  | { kind: "add_member"; groupId: string }
  | { kind: "remove_member"; groupId: string }
  | { kind: "bans"; groupId: string }
  | { kind: "ban_player"; groupId: string }
  | { kind: "unban_player"; groupId: string }
  | { kind: "effects"; groupId: string }
  | { kind: "effects_shop"; groupId: string }
  | { kind: "tp_menu"; groupId: string }
  | { kind: "confirm_delete"; groupId: string }
  | { kind: "confirm_unclaim"; cx: number; cz: number }
  | { kind: "new_claim"; cx: number; cz: number; cost: number };

function hasBeacons(player: Player, count: number): boolean {
  const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
  let found = 0;
  for (let i = 0; i < inv.container.size; i++) {
    const item = inv.container.getItem(i);
    if (item?.typeId === "minecraft:beacon") found += item.amount;
    if (found >= count) return true;
  }
  return false;
}

function removeBeacons(player: Player, count: number): void {
  const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
  let remaining = count;
  for (let i = 0; i < inv.container.size && remaining > 0; i++) {
    const item = inv.container.getItem(i);
    if (!item || item.typeId !== "minecraft:beacon") continue;
    if (item.amount <= remaining) { remaining -= item.amount; inv.container.setItem(i, undefined); }
    else { item.amount -= remaining; inv.container.setItem(i, item); remaining = 0; }
  }
}

export function executeTpToClaim(player: Player, group: ClaimGroup): void {
  if (!group.tpPoint) return;
  const tpData = { ...group.tpPoint };
  startTpChannel(player, 5, (p) => {
    if (!removeBalance(p, TP_USE_COST)) { p.sendMessage("§cSolde insuffisant pour le TP."); return; }
    recordBackPosition(p);
    const dim = world.getDimension(tpData.dim.replace("minecraft:", ""));
    p.teleport({ x: tpData.x, y: tpData.y, z: tpData.z }, { dimension: dim });
    p.sendMessage(`§aTP vers "§e${group.name}§a" !`);
  });
}

export function showMainMenu(player: Player, initialView?: ClaimsView): void {
  render(function ClaimsForm() {
    const exit = useExit();
    useCloseOnHurt(player, exit);
    const [view,       setView]       = useState<ClaimsView>(initialView ?? "main");
    const [newName,    setNewName]    = useState("");
    const [addMbrName, setAddMbrName] = useState("");
    const [banName,    setBanName]    = useState("");

    const groups      = getClaimGroups();
    const bal         = getBalance(player);
    const maxAnchors  = getMaxAnchors(player);
    const { cx: pcx, cz: pcz } = getChunk(player.location.x, player.location.z);

    // ── Nouveau claim ──────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "new_claim") {
      const { cx, cz, cost } = view;
      const confirm = () => {
        const err = validateClaimName(newName);
        if (err) { player.sendMessage(`§c${err}`); return; }
        system.run(() => {
          const gs = getClaimGroups();
          if (findGroupForChunk(cx, cz, gs)) { player.sendMessage("§cCe chunk vient d'être claimé !"); return; }
          if (gs.some(g => g.owner === player.name && g.name.toLowerCase() === newName.toLowerCase())) {
            player.sendMessage(`§cVous avez déjà un claim nommé "§e${newName}§c".`); return;
          }
          const curCost = chunkCost(0);
          if (!removeBalance(player, curCost)) { player.sendMessage(`§cSolde insuffisant (§e${fmtNC(curCost)}§c requis).`); return; }
          const id = `${Date.now()}_${cx}_${cz}`;
          gs.push({ id, owner: player.name, name: newName, chunks: [{ cx, cz }], members: [], banned: [] });
          if (!setClaimGroups(gs)) { player.sendMessage("§cImpossible de claimer : stockage plein."); return; }
          player.sendMessage(`§aNouvel espace claimé : "§e${newName}§a" ! (§e-${fmtNC(curCost)}§a)`);
        });
        exit();
      };
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Nouveau claim" w={W} onClose={exit} onBack={() => setView("main")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Coût : §e${fmtNC(cost)}`} w={WC} />,
                    <StyledInput
                      width={WC}
                      label="Nom du claim (lettres, chiffres, - et _)"
                      placeholder="Mon-Terrain"
                      value={newName} onChange={setNewName}
                    />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aClaimer" onPress={confirm} />,
                        <SaBtn label="Annuler" onPress={exit} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Confirmation unclaim ───────────────────────────────────────
    if (typeof view === "object" && view.kind === "confirm_unclaim") {
      const { cx, cz } = view;
      const group = findGroupForChunk(cx, cz, groups);
      const doUnclaim = () => {
        system.run(() => {
          const gs = getClaimGroups();
          const g = gs.find(x => x.id === group?.id);
          if (!g) return;
          const idx = g.chunks.findIndex(e => entryContainsChunk(e, cx, cz));
          if (idx === -1) { player.sendMessage("§cDéjà libéré."); return; }
          const newEntries = splitEntryExcluding(g.chunks[idx], cx, cz);
          const testChunks = [...g.chunks.slice(0, idx), ...newEntries, ...g.chunks.slice(idx + 1)];
          if (testChunks.length > 0 && !isGroupConnected({ ...g, chunks: testChunks })) {
            player.sendMessage("§cImpossible : ce chunk connecte d'autres parties du claim."); return;
          }
          g.chunks = testChunks;
          if (countGroupChunks(g) === 0) {
            gs.splice(gs.findIndex(x => x.id === g.id), 1);
            setClaimGroups(gs);
            player.sendMessage(`§aClaim "§e${g.name}§a" supprimé (plus aucun chunk).`);
          } else {
            setClaimGroups(gs);
            player.sendMessage(`§aChunk libéré du claim "§e${g.name}§a".`);
          }
        });
        exit();
      };
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Unclaimer" w={W} onClose={exit} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Libérer ce chunk du claim "§e${group?.name ?? "?"}§r" ?`} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cLibérer" onPress={doUnclaim} />,
                        <SaBtn label="Annuler" onPress={() => setView("main")} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Confirmation achat ancre ───────────────────────────────────
    if (typeof view === "object" && view.kind === "confirm_anchor") {
      const { newMax, cost } = view;
      const canAfford = bal >= cost;
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Acheter une ancre" w={W} onClose={exit} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Ancres après achat : §f${newMax}`} w={WC} />,
                    <InfoBox text={`Coût : §e${fmtNC(cost)}`} w={WC} />,
                    <InfoBox text={canAfford ? "§aVous pouvez acheter cette ancre." : "§cSolde insuffisant."} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aAcheter" onPress={() => {
                          if (!canAfford) return;
                          exit();
                          system.run(() => {
                            if (!removeBalance(player, cost)) { player.sendMessage("§cSolde insuffisant."); return; }
                            const cur = getMaxAnchors(player);
                            player.setDynamicProperty("shuuaddons:maxAnchors", cur + 1);
                            player.sendMessage(`§aAncre achetée ! Vous pouvez avoir §e${cur + 1} §aclaim(s).`);
                            showMainMenu(player, "my_groups");
                          });
                        }} />,
                        <SaBtn label="Annuler" onPress={() => setView("my_groups")} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Trouver le group par ID ────────────────────────────────────
    function getGroup(groupId: string): ClaimGroup | undefined {
      return groups.find(g => g.id === groupId);
    }

    // ── Éditeur de claim ──────────────────────────────────────────
    if (typeof view === "object" && view.kind === "group_editor") {
      const group = getGroup(view.groupId);
      if (!group) return <Scaffold>{[<InfoBox text="Claim introuvable." w={W} />] as unknown as JSX.Element}</Scaffold>;
      const maxMem   = group.maxMembers ?? DEFAULT_MAX_MEMBERS;
      const effCount = (group.effects ?? []).length;
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={group.name} w={W} onClose={exit} onBack={() => setView("my_groups")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Chunks : §e${countGroupChunks(group)} | Membres : §e${group.members.length}§f/§e${maxMem} | Effets : §e${effCount}`} w={WC} />,
                    <WideIconBtn label="§e§lGérer les membres" icon="textures/ui/permissions_member_star" width={WC} onPress={() => setView({ kind: "members", groupId: group.id })} />,
                    <TwoColRow width={WC}>
                      {[
                        <IconBtn label={`§b§lEffets\n§f${effCount} actif(s)`} icon="textures/items/potion_bottle_drinkable" width={Math.floor(WC/2)-1} onPress={() => setView({ kind: "effects", groupId: group.id })} />,
                        <IconBtn label={group.tpPoint ? "§e§lTP\n§7modifier" : "§b§lDéfinir TP"} icon="textures/ui/worldsIcon" width={Math.floor(WC/2)-1} onPress={() => setView({ kind: "tp_menu", groupId: group.id })} />,
                      ] as unknown as JSX.Element}
                    </TwoColRow>,
                    <TwoColRow width={WC}>
                      {[
                        <IconBtn label="§fRenommer" icon="textures/ui/editIcon" width={Math.floor(WC/2)-1} onPress={() => { setNewName(group.name); setView({ kind: "rename", groupId: group.id }); }} />,
                        <IconBtn label="§fBans" icon="textures/ui/permissions_visitor_hand" width={Math.floor(WC/2)-1} onPress={() => setView({ kind: "bans", groupId: group.id })} />,
                      ] as unknown as JSX.Element}
                    </TwoColRow>,
                    <TwoColRow width={WC}>
                      {[
                        <IconBtn label="§cUnclaim" icon="textures/ui/cancel" width={Math.floor(WC/2)-1} onPress={() => setView({ kind: "confirm_unclaim", cx: pcx, cz: pcz })} />,
                        <IconBtn label="§c§lAbandonner" icon="textures/ui/trash_default" width={Math.floor(WC/2)-1} onPress={() => setView({ kind: "confirm_delete", groupId: group.id })} />,
                      ] as unknown as JSX.Element}
                    </TwoColRow>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Renommer ───────────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "rename") {
      const gid = view.groupId;
      const group = getGroup(gid);
      const back = () => setView({ kind: "group_editor", groupId: gid });
      const doRename = () => {
        const err = validateClaimName(newName);
        if (err) { player.sendMessage(`§c${err}`); return; }
        exit();
        system.run(() => {
          const gs = getClaimGroups();
          const g = gs.find(x => x.id === gid);
          if (!g) return;
          if (gs.some(x => x.owner === player.name && x.id !== g.id && x.name.toLowerCase() === newName.toLowerCase())) {
            player.sendMessage(`§cVous avez déjà un claim nommé "§e${newName}§c".`); return;
          }
          g.name = newName; setClaimGroups(gs);
          player.sendMessage(`§aClaim renommé en "§e${newName}§a".`);
          showMainMenu(player, { kind: "group_editor", groupId: gid });
        });
      };
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Renommer — ${group?.name ?? ""}`} w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <StyledInput width={WC} label="Nouveau nom" placeholder={group?.name ?? "Mon-Terrain"} value={newName} onChange={setNewName} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aConfirmer" onPress={doRename} />,
                        <SaBtn label="Annuler" onPress={back} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Membres ────────────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "members") {
      const gid = view.groupId;
      const group = getGroup(gid);
      if (!group) return <Scaffold>{[<InfoBox text="Claim introuvable." w={W} />] as unknown as JSX.Element}</Scaffold>;
      const maxMem = group.maxMembers ?? DEFAULT_MAX_MEMBERS;
      const nextUpg = getNextMemberUpgrade(group);
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Membres — ${group.name}`} w={W} onClose={exit} onBack={() => setView({ kind: "group_editor", groupId: gid })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Membres : §e${group.members.length}§f/§e${maxMem}${group.members.length > 0 ? ` — §f${group.members.join(", ")}` : ""}`} w={WC} />,
                    <Panel width={WC} flexDirection="column" gap={4} marginTop={4}>
                      {[
                        <SaBtn label="§aAjouter un membre" width={WC} onPress={() => { setAddMbrName(""); setView({ kind: "add_member", groupId: gid }); }} />,
                        <SaBtn label="§cRetirer un membre" width={WC} onPress={() => {
                          if (group.members.length === 0) { player.sendMessage("§7Aucun membre à retirer."); return; }
                          setView({ kind: "remove_member", groupId: gid });
                        }} />,
                        nextUpg
                          ? <SaBtn label={`§e§lUpgrade membres §e${maxMem}→${nextUpg.slots} §f${fmtNC(nextUpg.nc)}`} width={WC} onPress={() => {
                            if (getBalance(player) < nextUpg.nc) { player.sendMessage(`§cSolde insuffisant (${fmtNC(nextUpg.nc)} requis).`); return; }
                            exit();
                            system.run(() => {
                              const gs = getClaimGroups();
                              const g = gs.find(x => x.id === gid);
                              if (!g) return;
                              const upg = getNextMemberUpgrade(g);
                              if (!upg) return;
                              if (!removeBalance(player, upg.nc)) return;
                              g.maxMembers = upg.slots; setClaimGroups(gs);
                              player.sendMessage(`§aCapacité mise à jour : §e${upg.slots} membres§a !`);
                              showMainMenu(player, { kind: "members", groupId: gid });
                            });
                          }} />
                          : <SaBtn label="§a§lCapacité MAX (5/5)" width={WC} onPress={() => {}} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Ajouter membre ─────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "add_member") {
      const gid = view.groupId;
      const back = () => setView({ kind: "members", groupId: gid });
      const doAdd = () => {
        if (!addMbrName.trim()) return;
        exit();
        system.run(() => {
          const gs = getClaimGroups();
          const g = gs.find(x => x.id === gid);
          if (!g) return;
          const maxMem = g.maxMembers ?? DEFAULT_MAX_MEMBERS;
          if (maxMem !== -1 && g.members.length >= maxMem) { player.sendMessage(`§cLimite atteinte (${g.members.length}/${maxMem}).`); return; }
          if (g.members.includes(addMbrName)) { player.sendMessage(`§e${addMbrName}§7 est déjà membre.`); return; }
          g.members.push(addMbrName); setClaimGroups(gs);
          player.sendMessage(`§a${addMbrName} ajouté comme membre de "§e${g.name}§a".`);
          showMainMenu(player, { kind: "members", groupId: gid });
        });
      };
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Ajouter un membre" w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <StyledInput width={WC} label="Nom du joueur" placeholder="Joueur123" value={addMbrName} onChange={setAddMbrName} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aAjouter" onPress={doAdd} />,
                        <SaBtn label="Retour" onPress={back} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Retirer membre ─────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "remove_member") {
      const gid = view.groupId;
      const group = getGroup(gid);
      const back = () => setView({ kind: "members", groupId: gid });
      const [selIdx, setSelIdx] = useState(0);
      if (!group || group.members.length === 0) { back(); return <Scaffold>{[] as unknown as JSX.Element}</Scaffold>; }
      const doRemove = () => {
        exit();
        system.run(() => {
          const gs = getClaimGroups();
          const g = gs.find(x => x.id === gid);
          if (!g || selIdx >= g.members.length) return;
          const removed = g.members.splice(selIdx, 1)[0];
          setClaimGroups(gs);
          player.sendMessage(`§a${removed} retiré des membres de "§e${g.name}§a".`);
          showMainMenu(player, { kind: "members", groupId: gid });
        });
      };
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Retirer un membre" w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <StyledDropdown width={WC} label="Membre à retirer" options={group.members} value={group.members[selIdx]} onChange={(_, i) => setSelIdx(i)} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cRetirer" onPress={doRemove} />,
                        <SaBtn label="Annuler" onPress={back} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Bans ───────────────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "bans") {
      const gid = view.groupId;
      const group = getGroup(gid);
      if (!group) return <Scaffold>{[<InfoBox text="Claim introuvable." w={W} />] as unknown as JSX.Element}</Scaffold>;
      const back = () => setView({ kind: "group_editor", groupId: gid });
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Bans — ${group.name}`} w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={group.banned.length > 0 ? group.banned.join(", ") : "Aucun joueur banni."} w={WC} />,
                    <Panel width={WC} flexDirection="column" gap={4} marginTop={4}>
                      {[
                        <SaBtn label="§c§lBannir un joueur" width={WC} onPress={() => { setBanName(""); setView({ kind: "ban_player", groupId: gid }); }} />,
                        <SaBtn label="§aDébannir un joueur" width={WC} onPress={() => {
                          if (group.banned.length === 0) { player.sendMessage("§7Aucun joueur banni."); return; }
                          setView({ kind: "unban_player", groupId: gid });
                        }} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Bannir ─────────────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "ban_player") {
      const gid = view.groupId;
      const back = () => setView({ kind: "bans", groupId: gid });
      const doBan = () => {
        if (!banName.trim()) return;
        exit();
        system.run(() => {
          const gs = getClaimGroups();
          const g = gs.find(x => x.id === gid);
          if (!g) return;
          if (g.banned.includes(banName)) { player.sendMessage(`§e${banName}§7 est déjà banni.`); return; }
          g.banned.push(banName); g.members = g.members.filter(m => m !== banName);
          setClaimGroups(gs); player.sendMessage(`§a${banName} banni du claim "§e${g.name}§a".`);
          showMainMenu(player, { kind: "bans", groupId: gid });
        });
      };
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Bannir un joueur" w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <StyledInput width={WC} label="Nom du joueur à bannir" placeholder="Joueur123" value={banName} onChange={setBanName} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cBannir" onPress={doBan} />,
                        <SaBtn label="Annuler" onPress={back} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Débannir ───────────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "unban_player") {
      const gid = view.groupId;
      const group = getGroup(gid);
      const back = () => setView({ kind: "bans", groupId: gid });
      const [selIdx, setSelIdx] = useState(0);
      if (!group || group.banned.length === 0) { back(); return <Scaffold>{[] as unknown as JSX.Element}</Scaffold>; }
      const doUnban = () => {
        exit();
        system.run(() => {
          const gs = getClaimGroups();
          const g = gs.find(x => x.id === gid);
          if (!g || selIdx >= g.banned.length) return;
          const unbanned = g.banned.splice(selIdx, 1)[0];
          setClaimGroups(gs); player.sendMessage(`§a${unbanned} débanni du claim "§e${g.name}§a".`);
          showMainMenu(player, { kind: "bans", groupId: gid });
        });
      };
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Débannir un joueur" w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <StyledDropdown width={WC} label="Joueur à débannir" options={group.banned} value={group.banned[selIdx]} onChange={(_, i) => setSelIdx(i)} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aDébannir" onPress={doUnban} />,
                        <SaBtn label="Annuler" onPress={back} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Effets ─────────────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "effects") {
      const gid = view.groupId;
      const group = getGroup(gid);
      if (!group) return <Scaffold>{[<InfoBox text="Claim introuvable." w={W} />] as unknown as JSX.Element}</Scaffold>;
      const unlocked = getUnlocked(group);
      const active   = group.effects ?? [];
      const back     = () => setView({ kind: "group_editor", groupId: gid });
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Effets — ${group.name}`} w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={unlocked.length === 0 ? "Aucun effet débloqué." : `${active.length} effet(s) actif(s)`} w={WC} />,
                    <WideIconBtn label="§e§lAcheter des effets" icon="textures/items/potion_bottle_drinkable" width={WC} onPress={() => setView({ kind: "effects_shop", groupId: gid })} />,
                    ...(() => {
                      const fxW = Math.floor(WC / 2) - 1;
                      const fxBtns = unlocked.map(eff => {
                        const isActive = active.some(e => e.id === eff.id && e.level === eff.level);
                        const def = CLAIM_EFFECTS.find(e => e.id === eff.id && e.level === eff.level);
                        const label = isActive ? `§a§l${def?.label ?? eff.id}` : `§c${def?.label ?? eff.id}`;
                        return (
                          <IconBtn label={label} icon="textures/items/potion_bottle_drinkable" width={fxW} onPress={() => {
                            exit();
                            system.run(() => {
                              const gs = getClaimGroups();
                              const g = gs.find(x => x.id === gid);
                              if (!g) return;
                              const act = g.effects ?? [];
                              const isAct = act.some(e => e.id === eff.id && e.level === eff.level);
                              if (isAct) { g.effects = act.filter(e => !(e.id === eff.id && e.level === eff.level)); }
                              else {
                                if (!g.effects) g.effects = [];
                                g.effects = g.effects.filter(e => e.id !== eff.id);
                                g.effects.push({ id: eff.id, level: eff.level });
                              }
                              setClaimGroups(gs);
                              showMainMenu(player, { kind: "effects", groupId: gid });
                            });
                          }} />
                        );
                      });
                      const fxRows: JSX.Element[] = [];
                      for (let i = 0; i < fxBtns.length; i += 2) {
                        fxRows.push(<TwoColRow width={WC}>{fxBtns.slice(i, i + 2) as unknown as JSX.Element}</TwoColRow>);
                      }
                      return fxRows;
                    })(),
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Boutique Effets ────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "effects_shop") {
      const gid = view.groupId;
      const group = getGroup(gid);
      if (!group) return <Scaffold>{[<InfoBox text="Claim introuvable." w={W} />] as unknown as JSX.Element}</Scaffold>;
      const unlocked = getUnlocked(group);
      const back     = () => setView({ kind: "effects", groupId: gid });
      const buyable  = EFFECT_TYPES.map(type => {
        const curLevel = unlocked.find(e => e.id === type)?.level ?? 0;
        if (curLevel >= 2) return null;
        return CLAIM_EFFECTS.find(e => e.id === type && e.level === curLevel + 1) ?? null;
      }).filter(Boolean) as typeof CLAIM_EFFECTS;

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Boutique Effets — ${group.name}`} w={W} onClose={exit} onBack={back} />,
                <InfoBox text={`Votre solde : §e${fmtNC(bal)}`} w={W} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    buyable.length === 0
                      ? <InfoBox text="Tous les effets sont débloqués !" w={WC} />
                      : <></>,
                    ...buyable.map(eff => {
                      const curLevel = unlocked.find(e => e.id === eff.id)?.level ?? 0;
                      const isUpgrade = curLevel > 0;
                      const line1 = `§e§l${isUpgrade ? "Upgrade : " : ""}${eff.label}`;
                      const line2 = `§f${fmtNC(eff.nc)}${eff.needsBeacon ? " §8+ 1 balise" : ""}`;
                      return (
                        <WideIconBtn label={`${line1}\n${line2}`} icon="textures/items/potion_bottle_drinkable" width={WC} height={36} onPress={() => {
                          if (eff.needsBeacon && !hasBeacons(player, 1)) { player.sendMessage("§cIl vous faut §f1 balise§c."); return; }
                          if (getBalance(player) < eff.nc) { player.sendMessage(`§cSolde insuffisant (${fmtNC(eff.nc)} requis).`); return; }
                          exit();
                          system.run(() => {
                            const gs = getClaimGroups();
                            const g = gs.find(x => x.id === gid);
                            if (!g) return;
                            if (!removeBalance(player, eff.nc)) return;
                            if (eff.needsBeacon) removeBeacons(player, 1);
                            if (!g.unlockedEffects) g.unlockedEffects = [...(g.effects ?? [])];
                            g.unlockedEffects = g.unlockedEffects.filter(e => e.id !== eff.id);
                            g.unlockedEffects.push({ id: eff.id, level: eff.level });
                            if (!g.effects) g.effects = [];
                            g.effects = g.effects.filter(e => e.id !== eff.id);
                            g.effects.push({ id: eff.id, level: eff.level });
                            setClaimGroups(gs);
                            player.sendMessage(`§aEffet §f${eff.label} §adébloqué et activé !`);
                            showMainMenu(player, { kind: "effects_shop", groupId: gid });
                          });
                        }} />
                      );
                    }),
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── TP Menu ────────────────────────────────────────────────────
    if (typeof view === "object" && view.kind === "tp_menu") {
      const gid = view.groupId;
      const group = getGroup(gid);
      if (!group) return <Scaffold>{[<InfoBox text="Claim introuvable." w={W} />] as unknown as JSX.Element}</Scaffold>;
      const hasTp   = !!group.tpPoint;
      const isOwner = group.owner === player.name;
      const back    = () => setView({ kind: "group_editor", groupId: gid });
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`TP — ${group.name}`} w={W} onClose={exit} onBack={back} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    hasTp
                      ? <InfoBox text={`TP : §e${Math.floor(group.tpPoint!.x)}, ${Math.floor(group.tpPoint!.y)}, ${Math.floor(group.tpPoint!.z)}`} w={WC} />
                      : <InfoBox text="Aucun point de TP défini." w={WC} />,
                    <Panel width={WC} flexDirection="column" gap={4} marginTop={4}>
                      {[
                        isOwner && <SaBtn label={`§a§lDéfinir TP ici §f${fmtNC(TP_SET_COST)}`} width={WC} onPress={() => {
                          exit();
                          system.run(() => {
                            const gs = getClaimGroups();
                            const g = gs.find(x => x.id === gid);
                            if (!g) return;
                            const { cx: lx, cz: lz } = getChunk(player.location.x, player.location.z);
                            if (!g.chunks.some(e => entryContainsChunk(e, lx, lz))) { player.sendMessage("§cVous devez être dans votre claim."); return; }
                            if (!removeBalance(player, TP_SET_COST)) { player.sendMessage("§cSolde insuffisant."); return; }
                            g.tpPoint = { x: player.location.x, y: player.location.y, z: player.location.z, dim: player.dimension.id };
                            setClaimGroups(gs); player.sendMessage(`§aPoint de TP défini pour "§e${g.name}§a".`);
                            showMainMenu(player, { kind: "tp_menu", groupId: gid });
                          });
                        }} />,
                        hasTp && <SaBtn label={`§e§lSe TP §f${fmtNC(TP_USE_COST)}`} width={WC} onPress={() => {
                          const g = getGroup(gid);
                          if (g) executeTpToClaim(player, g);
                          exit();
                        }} />,
                        isOwner && hasTp && <SaBtn label="§cSupprimer TP" width={WC} onPress={() => {
                          exit();
                          system.run(() => {
                            const gs = getClaimGroups();
                            const g = gs.find(x => x.id === gid);
                            if (!g) return;
                            delete g.tpPoint; setClaimGroups(gs);
                            player.sendMessage("§aPoint de TP supprimé.");
                            showMainMenu(player, { kind: "tp_menu", groupId: gid });
                          });
                        }} />,
                      ].filter(Boolean) as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Confirmation supprimer claim ───────────────────────────────
    if (typeof view === "object" && view.kind === "confirm_delete") {
      const gid = view.groupId;
      const group = getGroup(gid);
      const back = () => setView({ kind: "group_editor", groupId: gid });
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Abandonner le claim" w={W} onClose={exit} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Abandonner "§e${group?.name ?? "?"}§r" ? §cCette action est irréversible.`} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§c§lAbandonner" onPress={() => {
                          system.run(() => {
                            const gs = getClaimGroups();
                            const idx = gs.findIndex(g => g.id === gid);
                            if (idx === -1) return;
                            gs.splice(idx, 1); setClaimGroups(gs);
                            player.sendMessage(`§aClaim "§e${group?.name ?? "?"}§a" abandonné.`);
                          });
                          setView("my_groups");
                        }} />,
                        <SaBtn label="Annuler" onPress={back} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Mes claims — grille 2 colonnes ────────────────────────────
    if (view === "my_groups") {
      const playerGroups   = groups.filter(g => g.owner === player.name);
      const nextAnchorCost = maxAnchors < 5 ? (ANCHOR_COSTS[maxAnchors + 1] ?? null) : null;
      const sW = Math.floor(WC / 2) - 1;
      const slotBtns: JSX.Element[] = [];
      for (let i = 0; i < CLAIM_SLOT_COUNT; i++) {
        if (i < playerGroups.length) {
          const g = playerGroups[i];
          slotBtns.push(<IconBtn label={`§e§l${g.name}\n§f${countGroupChunks(g)} chunk(s)`} icon="textures/ui/worldsIcon" width={sW} onPress={() => setView({ kind: "group_editor", groupId: g.id })} />);
        } else if (i < maxAnchors) {
          slotBtns.push(<IconBtn label="§a§l+ Ajouter\n§fSlot libre" icon="textures/custom_ui/cadenas_open" width={sW} onPress={() => setView("main")} />);
        } else if (i === maxAnchors && nextAnchorCost !== null) {
          slotBtns.push(<IconBtn label={`§e§lDéverrouiller\n§f${fmtNC(nextAnchorCost)}`} icon="textures/custom_ui/cadenas_open" width={sW} onPress={() => setView({ kind: "confirm_anchor", newMax: maxAnchors + 1, cost: nextAnchorCost })} />);
        } else {
          slotBtns.push(<IconBtn label="§7Slot\n§7verrouillé" icon="textures/custom_ui/cadenas_close" width={sW} onPress={() => {}} />);
        }
      }
      const slotRows: JSX.Element[] = [];
      for (let i = 0; i < slotBtns.length; i += 2) {
        slotRows.push(<TwoColRow width={WC}>{slotBtns.slice(i, i + 2) as unknown as JSX.Element}</TwoColRow>);
      }
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Mes Claims" w={W} onClose={exit} onBack={() => setView("main")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {slotRows as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Menu principal ─────────────────────────────────────────────
    const currentGroup = findGroupForChunk(pcx, pcz, groups);
    const nearGroup    = groups.find(g => g.owner === player.name && isAdjacentToGroup(pcx, pcz, g));
    const cost         = chunkCost(nearGroup ? countGroupChunks(nearGroup) : 0);
    const playerGroups = groups.filter(g => g.owner === player.name);
    const canClaim     = !currentGroup && (nearGroup || playerGroups.length < maxAnchors);
    const isOwnClaim   = !!currentGroup && currentGroup.owner === player.name;

    let claimLabel: string;
    let claimIcon: string;
    if (canClaim) {
      claimLabel = `§a§lClaimer\n§f${fmtNC(cost)}`;
      claimIcon  = "textures/ui/worldsIcon";
    } else if (isOwnClaim) {
      claimLabel = `§a§l${currentGroup!.name}\n§fVotre claim`;
      claimIcon  = "textures/ui/worldsIcon";
    } else if (currentGroup) {
      claimLabel = `§cZone réclamée\n§e${currentGroup.owner}`;
      claimIcon  = "textures/ui/cancel";
    } else {
      claimLabel = "§cPlus d'ancre\ndisponible";
      claimIcon  = "textures/custom_ui/cadenas_close";
    }

    const bigW  = Math.floor(WC * 0.6) - 1;
    const sideW = WC - bigW - 2;
    const sideH = Math.floor((120 - 4) / 2);

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Claim Tool" w={W} onClose={exit} />,
              <InfoBox text={`Votre solde : §e${fmtNC(bal)}`} w={W} />,
              <Panel width={W} background={BG_BODY} padding={4}>
                {[
                  <Panel width={WC} height={120} flexDirection="row" gap={2}>
                    {[
                      <IconBtn
                        label={claimLabel}
                        icon={claimIcon}
                        iconSize={36}
                        width={bigW} height={120}
                        onPress={() => {
                          if (canClaim) {
                            if (bal < cost) { player.sendMessage(`§cSolde insuffisant. Ce chunk coûte §e${fmtNC(cost)}§c.`); exit(); return; }
                            if (nearGroup) {
                              system.run(() => {
                                const gs = getClaimGroups();
                                const adj = gs.find(g => g.owner === player.name && isAdjacentToGroup(pcx, pcz, g));
                                if (!adj) return;
                                adj.chunks.push({ cx: pcx, cz: pcz });
                                if (!setClaimGroups(gs)) { player.sendMessage("§cImpossible de claimer : stockage plein."); return; }
                                removeBalance(player, cost);
                                player.sendMessage(`§aChunk ajouté au claim "§e${adj.name}§a" ! (§e-${fmtNC(cost)}§a)`);
                              });
                              exit();
                            } else {
                              setNewName(""); setView({ kind: "new_claim", cx: pcx, cz: pcz, cost });
                            }
                          } else if (isOwnClaim) {
                            setView({ kind: "group_editor", groupId: currentGroup!.id });
                          }
                        }}
                      />,
                      <Panel width={sideW} height={120} flexDirection="column" gap={4}>
                        {[
                          <IconBtn label="§e§lMes Claims" icon="textures/ui/icon_book_writable"
                                   width={sideW} height={sideH}
                                   onPress={() => setView("my_groups")} />,
                          <IconBtn label="§cUnclaimer" icon="textures/ui/cancel"
                                   width={sideW} height={sideH}
                                   onPress={() => setView({ kind: "confirm_unclaim", cx: pcx, cz: pcz })} />,
                        ] as unknown as JSX.Element}
                      </Panel>,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}

export function showAdminMenu(player: Player): void {
  render(function AdminClaimsForm() {
    const exit = useExit();
    useCloseOnHurt(player, exit);
    const [view, setView] = useState<"menu" | "history">("menu");
    const { cx, cz } = getChunk(player.location.x, player.location.z);
    const groups = getClaimGroups();
    const group  = findGroupForChunk(cx, cz, groups);

    if (view === "history") {
      const entries = group ? (getHistory()[group.id] ?? []) : [];
      const historyText = entries.length === 0
        ? "Aucun intrus enregistré."
        : entries.map((e, i) => `§7${i + 1}. §e${e.n} §8(${formatTs(e.t)})`).join("  |  ");
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Intrus — ${group?.name ?? "?"}`} w={W} onClose={exit} onBack={() => setView("menu")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`${entries.length}/30 intrus enregistrés`} w={WC} />,
                    <Panel width={WC} background={BG_PANEL} padding={4}>
                      {[<CenteredText scale={0.5}>{historyText}</CenteredText>] as unknown as JSX.Element}
                    </Panel>,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        entries.length > 0 && <SaBtn label="§cEffacer l'historique" onPress={() => {
                          if (group) system.run(() => { clearGroupHistory(group.id); player.sendMessage(`§aHistorique effacé pour "§e${group.name}§a".`); });
                          setView("menu");
                        }} />,
                        <SaBtn label="Retour" onPress={() => setView("menu")} />,
                      ].filter(Boolean) as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    const info = group
      ? `Claim : §e${group.name} §f(${group.owner}) — §e${countGroupChunks(group)} chunk(s)`
      : "§7Ce chunk n'est pas claimé.";

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Admin — Claim Tool" w={W} onClose={exit} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {[
                  <InfoBox text={info} w={WC} />,
                  <Panel width={WC} flexDirection="column" gap={4} marginTop={4}>
                    {[
                      <SaBtn label="§cForce unclaim ce chunk" width={WC} onPress={() => {
                        if (!group) { player.sendMessage("§7Ce chunk n'est pas claimé."); return; }
                        system.run(() => {
                          const gs = getClaimGroups();
                          const g = gs.find(x => x.id === group.id);
                          if (!g) return;
                          const entryIdx = g.chunks.findIndex(e => entryContainsChunk(e, cx, cz));
                          if (entryIdx === -1) return;
                          const newEntries = splitEntryExcluding(g.chunks[entryIdx], cx, cz);
                          g.chunks = [...g.chunks.slice(0, entryIdx), ...newEntries, ...g.chunks.slice(entryIdx + 1)];
                          if (countGroupChunks(g) === 0) gs.splice(gs.findIndex(x => x.id === g.id), 1);
                          setClaimGroups(gs);
                          player.sendMessage(`§aChunk libéré (admin).`);
                        });
                        exit();
                      }} />,
                      <SaBtn label="§eHistorique des intrus" width={WC} onPress={() => setView("history")} />,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}

export function showHomeMenu(player: Player, claimGroups: ClaimGroup[]): void {
  render(function HomeForm() {
    const exit = useExit();
    useCloseOnHurt(player, exit);
    const bal = getBalance(player);
    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Téléportation" w={W} onClose={exit} />,
              <InfoBox text={`Solde : §e${fmtNC(bal)} | TP : §e${fmtNC(TP_USE_COST)}`} w={W} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {claimGroups.map(g => (
                  <SaBtn
                    label={g.tpPoint ? `§e§l${g.name}  §f${fmtNC(TP_USE_COST)}` : `§7${g.name}  §4Pas de TP`}
                    width={WC}
                    onPress={() => {
                      if (!g.tpPoint) { player.sendMessage(`§cLe claim "§e${g.name}§c" n'a pas de point de TP.`); return; }
                      executeTpToClaim(player, g);
                      exit();
                    }}
                  />
                )) as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}
