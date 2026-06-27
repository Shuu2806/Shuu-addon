# Shuu-addon `v1.0.1`

Addon Minecraft Bedrock pour serveur survie communautaire. Fournit un système de métiers, d'économie, de claims, de shop, de vies et bien plus.

---

## Sommaire

- [Économie (NC)](#économie-nc)
- [Métiers](#métiers)
- [Shop & Cagnottes](#shop--cagnottes)
- [Claims](#claims)
- [Player Shop](#player-shop)
- [Vies](#vies)
- [Kits](#kits)
- [Holograms](#holograms)
- [Divers](#divers)

---

## Économie (NC)

Monnaie interne : les **Nonocoins (NC)**. Utilisés pour toutes les transactions en jeu.

| Commande | Paramètres | Permission | Description |
|----------|-----------|-----------|-------------|
| `/shuuaddons:balance` | — | Tous | Affiche son solde NC |
| `/shuuaddons:pay` | `<joueur> <montant>` | Tous | Envoie des NC à un autre joueur en ligne |
| `/shuuaddons:givemoney` | `<joueur> <montant>` | Admin | Donne des NC à un joueur |
| `/shuuaddons:setmoney` | `<joueur> <montant>` | Admin | Définit le solde exact d'un joueur |
| `/shuuaddons:takemoney` | `<joueur> <montant>` | Admin | Retire des NC d'un joueur |

---

## Métiers

5 métiers disponibles, chacun avec un système d'XP, de niveaux (0–200) et de récompenses en NC.

| Clé | Nom | Actions récompensées |
|-----|-----|----------------------|
| `hunter` | Chasseur | Tuer des mobs |
| `lumberjack` | Bûcheron | Couper des arbres |
| `miner` | Mineur | Casser des minerais / fondre des lingots |
| `fisher` | Pêcheur | Pêcher / tuer des créatures aquatiques |
| `farmer` | Fermier | Récolter des cultures matures |

### Mécanique

- Un joueur peut activer plusieurs métiers simultanément (slots débloquables).
- Chaque action rapporte de l'**XP métier** et des **NC** (scalés par le niveau).
- À **niveau max (200)**, l'XP n'est plus gagnée mais les NC continuent d'être versés.
- Un **salaire** est versé périodiquement (défaut : toutes les 20 min) selon le niveau.
- Des **upgrades** par niveau appliquent des multiplicateurs sur certains items/actions.
- L'anti-exploit empêche de farmer les blocs posés par les joueurs.

### Boosts

| Type | Comportement |
|------|-------------|
| **Boost global** | Multiplicateur sur un ou tous les métiers, permanent ou expirant |
| **Boost personnel** | Accordé aux top 3 contributeurs d'une cagnotte complétée (hors type boost) |

Formule : `total = upgradeMult × (globalBoost + personalBoost − 1)`

**Boost personnel (top contributeurs) :**
| Rang | Multiplicateur | Durée |
|------|---------------|-------|
| 1er | ×2 | 3 h (dès connexion) |
| 2e | ×1.5 | 3 h (dès connexion) |
| 3e | ×1.3 | 3 h (dès connexion) |

L'indicateur s'affiche dans l'action bar : `§d[×2.5]`

### Commandes métiers

| Commande | Paramètres | Permission | Description |
|----------|-----------|-----------|-------------|
| `/shuuaddons:jobs` | — | Tous | Ouvre le menu des métiers |
| `/shuuaddons:setjoblevel` | `<joueur> <metier> <niveau>` | Admin | Définit le niveau d'un métier |
| `/shuuaddons:setjobboost` | `<metier\|all> <multiplicateur>` | Admin | Applique un boost (décimaux OK, 1 = retire) |
| `/shuuaddons:setjobsalary` | `<metier> <salaire>` | Admin | Définit le salaire de base |
| `/shuuaddons:setjobfrequency` | `<minutes>` | Admin | Fréquence du salaire |
| `/shuuaddons:addjobitem` | `<metier> <itemId> <categorie> <xp> <nc>` | Admin | Ajoute/modifie une récompense |
| `/shuuaddons:removejobitem` | `<metier> <itemId>` | Admin | Retire une récompense custom |
| `/shuuaddons:listjobitems` | `<metier>` | Admin | Liste les récompenses custom |
| `/shuuaddons:addjobupgrade` | `<metier> <niveau> <mult> <label> [match]` | Admin | Ajoute un upgrade |
| `/shuuaddons:removejobupgrade` | `<metier> <niveau>` | Admin | Retire un upgrade |
| `/shuuaddons:listjobupgrades` | `<metier>` | Admin | Liste les upgrades |
| `/shuuaddons:resetjobupgrades` | `<metier>` | Admin | Remet les upgrades par défaut |

**Noms de métiers acceptés :** `hunter`, `bucheron`, `mineur`, `pecheur`, `fermier`  
**Catégories :** `casser`, `cuire`, `pecher`, `tuer`

---

## Shop & Cagnottes

### Shop

Boutique administrative avec achat d'items en NC.

| Commande | Paramètres | Permission | Description |
|----------|-----------|-----------|-------------|
| `/shuuaddons:shop` | — | Tous | Ouvre le shop |
| `/shuuaddons:addshopitem` | `<itemId> <categorie> <achat> <vente> [quantite]` | Admin | Ajoute/modifie un item |
| `/shuuaddons:removeshopitem` | `<itemId>` | Admin | Retire un item |

### Cagnottes

Objectifs communautaires financés par les joueurs en NC. À la complétion, un effet est déclenché selon le type.

| Type | Effet à la complétion |
|------|-----------------------|
| `nether` | Objectif communautaire Nether |
| `end` | Objectif communautaire End |
| `event` | Événement personnalisé |
| `boost` | **Boost ×2 XP & NC sur tous les métiers pendant 24 h** |

Pour tout type sauf `boost`, les **top 3 contributeurs** reçoivent un boost personnel à leur prochaine connexion.

| Commande | Paramètres | Permission | Description |
|----------|-----------|-----------|-------------|
| `/shuuaddons:createcagnotte` | `<nom> <objectif> <type> [evenement]` | Admin | Crée une cagnotte |
| `/shuuaddons:deletecagnotte` | `<nom>` | Admin | Supprime une cagnotte |

---

## Claims

Système de revendication de chunks. Chaque claim est un **groupe** avec owner, membres, et chunks associés.

### Fonctionnalités

- **Protection** : seuls l'owner et les membres peuvent modifier les blocs. Les admins (tag `admin`) sont exemptés.
- **Membres & Bans** : ajout/retrait de membres, interdiction de joueurs.
- **Point de TP** : définir un point de téléportation dans le claim (coût NC).
- **Effets de claim** : effets de statut actifs pour **tous les joueurs** présents dans le claim.
- **Historique** : suivi des entrées dans le claim.

### Effets disponibles (achetables en NC + balise selon le niveau)

| Effet | Niveau max |
|-------|-----------|
| Vitesse | II |
| Célérité | II |
| Force | II |
| Résistance | II |
| Régénération | II |
| Saut | I |

Les effets s'appliquent à **tous les joueurs** dans le chunk (membres ou non), toutes les 10 secondes.

---

## Player Shop

Boutiques joueurs placées dans leurs claims, utilisant l'entité `shuuaddons:shop_display`.

- Poser un `shuuaddons:shop_chest` dans son claim crée une vitrine interactive.
- **Owner/Admin** : configure l'item vendu, le stock (max 10 000) et le prix unitaire en NC.
- **Acheteurs** : interagissent avec la vitrine pour acheter.
- Les gains s'accumulent et doivent être collectés manuellement par le vendeur.
- Impossible de placer un shop en dehors de son propre claim.

---

## Vies

Système de vies limitées. Chaque joueur démarre avec **3 vies**.

- Chaque mort consomme 1 vie.
- À 0 vie : le joueur est mis en **spectateur** ou **expulsé** (configurable).
- **Mode événement** : désactive la perte de vies (pour les events non-survie).
- Item `shuuaddons:extra_life` : donne +1 vie instantanément.
- Item `shuuaddons:revive` : permet de ressusciter un joueur en spectateur.

| Commande | Paramètres | Permission | Description |
|----------|-----------|-----------|-------------|
| `/shuuaddons:givelife` | `<joueur> [quantite]` | Admin | Donne des vies (fonctionne hors ligne) |
| `/shuuaddons:setgameoveraction` | `<spectator\|kick>` | Admin | Définit la pénalité à 0 vie |
| `/shuuaddons:toggleevent` | — | Admin | Active/désactive le mode événement |

---

## Kits

Kits d'items utilisables **une fois par vie** par joueur.

- Le kit est créé depuis l'inventaire actuel de l'admin.
- Supporte les noms custom et les enchantements.
- Après la mort d'un joueur, ses kits sont réinitialisés (réutilisables à la vie suivante).
- Si l'inventaire est plein, les items excédentaires tombent au sol.

| Commande | Paramètres | Permission | Description |
|----------|-----------|-----------|-------------|
| `/shuuaddons:kit` | `<nom>` | Tous | Utilise un kit |
| `/shuuaddons:createkit` | `<nom>` | Admin | Crée un kit depuis l'inventaire |
| `/shuuaddons:deletekit` | `<nom>` | Admin | Supprime un kit |

---

## Holograms

Gestion des holograms via menu interactif.

| Commande | Paramètres | Permission | Description |
|----------|-----------|-----------|-------------|
| `/shuuaddons:hologram` | — | Admin | Ouvre le menu de gestion des holograms |

---

## Divers

### Bundles désactivés

Tous les bundles Minecraft sont automatiquement retirés des inventaires joueurs. Leur utilisation est bloquée.

---

## Informations techniques

| Champ | Valeur |
|-------|--------|
| Version | 1.0.1 |
| Engine minimum | 1.21.80 (BP) |
| API | `@minecraft/server` 2.1.0, `@minecraft/server-ui` 2.0.0 |
| Langage | TypeScript (compilé via Regolith + esbuild) |
