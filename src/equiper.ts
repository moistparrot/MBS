/** Module related to the equiping and removing of wheel of fortune items. */

"use strict";

import { itemSetType } from "type_setting";
import { getBaselineProperty } from "type_setting";
import { deepCopy } from "common";

/**
 * An enum with various strip levels for {@link characterStrip}.
 * All items up to and including the specified levels will be removed.
 */
export const StripLevel = Object.freeze({
    /** Do not strip any items */
    NONE: 0,
    /** All clothes */
    CLOTHES: 1,
    /** All clothes and underwear */
    UNDERWEAR: 2,
    /** All clothes, underwear and cosplay items (if not blocked) */
    COSPLAY: 3,
    /** All clothes, underwear, cosplay items and body (if not blocked) */
    ALL: 4,
});

/** A dummy character without any blocked or limited items. */
const MBSDummy = CharacterLoadSimple("MBSDummy");

/**
 * Return that a callable that returns whether the passed asset satisifies the specified strip {@link StripLevel}
 * @param stripLevel The desired strip level
 * @param character The affected character
 */
export function getStripCondition(stripLevel: StripLevel, character: Character): ((asset: Asset) => boolean) {
    switch (stripLevel) {
        case StripLevel.NONE: {
            return () => false;
        }
        case StripLevel.CLOTHES: {
            return (asset) => (asset.Group.AllowNone && !asset.BodyCosplay && !asset.Group.Underwear);
        }
        case StripLevel.UNDERWEAR: {
            return (asset) => (asset.Group.AllowNone && !asset.BodyCosplay);
        }
        case StripLevel.COSPLAY: {
            return (asset) => {
                const blockBodyCosplay = character.OnlineSharedSettings?.BlockBodyCosplay ?? true;
                return blockBodyCosplay ? (asset.Group.AllowNone && !asset.BodyCosplay) : asset.Group.AllowNone;
            };
        }
        case StripLevel.ALL: {
            return (asset) => {
                const blockBodyCosplay = character.OnlineSharedSettings?.BlockBodyCosplay ?? true;
                return blockBodyCosplay ? (asset.Group.AllowNone && !asset.BodyCosplay) : true;
            };
        }
        default: {
            throw `Invalid "stripLevel" value: ${stripLevel}`;
        }
    }
}

/**
 * Strip the character of all clothes while always ignoring any and all cosplay items.
 * Performs an inplace update of the character's appearance.
 * @param stripLevel An integer denoting which clothes should be removed; see {@link StripLevel}
 * @param character The to-be stripped character, defaults to the {@link Player}
 */
export function characterStrip(stripLevel: StripLevel, character: Character): void {
    if (!character || !(character.IsSimple() || character.IsPlayer())) {
        throw "Expected a simple or player character";
    }

    const stripCondition = getStripCondition(stripLevel, character);
    const appearance = character.Appearance;
    for (let i = appearance.length - 1; i >= 0; i--) {
        const asset = appearance[i].Asset;
        if (
            asset.Group.AllowNone
            && asset.Group.Category === "Appearance"
            && stripCondition(asset)
        ) {
            appearance.splice(i, 1);
        }
    }
}

/** Sorting graph node as used in {@link itemsArgSort}. */
type Node = { readonly block: Readonly<Set<AssetGroupItemName>>, priority?: number };

/** A minimalistic (extended) item representation as used in {@link itemsArgSort}. */
type SimpleItem = Readonly<{ Name: string, Group: AssetGroupName, Type?: string | null }>;

/**
 * Depth-first-search helper function for {@link itemsArgSort}.
 * Note that the node (and graph by extension) are modified inplace.
 * @param graph A graph mapping group names to the asset's blocked groups and its (to-be assigned) sorting priority
 * @param node A node within `graph`
 * @returns The priority of the current `node`
 */
function itemsArgSortDFS(graph: Readonly<Map<AssetGroupName, Node>>, node?: Node): number {
    if (node === undefined) {
        return -1;
    } else if (node.priority !== undefined) {
        return node.priority;
    } else if (node.block.size === 0) {
        node.priority = 0;
        return node.priority;
    } else {
        const priorities = [];
        for (const group of node.block) {
            priorities.push(itemsArgSortDFS(graph, graph.get(group)));
        }
        node.priority = 1 + Math.max(...priorities);
        return node.priority;
    }
}

/**
 * Construct a record that maps group names to sorting priorities in a manner to minimize group slot-blocking.
 * Only groups belonging to the `Item` category will be included.
 * @param itemList The list of items for whom a sorting priority will be created.
 * @param character The intended to-be equiped character.
 */
export function itemsArgSort(
    itemList: readonly SimpleItem[],
    character: Character,
): Partial<Record<AssetGroupName, number>> {
    if (!Array.isArray(<readonly SimpleItem[]>itemList)) {
        throw `Invalid "itemList" type: ${typeof itemList}`;
    }

    // Map all equiped item groups to the groups that they block
    const graph: Map<AssetGroupName, Node> = new Map();
    for (const { Group, Name, Type } of itemList) {
        const asset = AssetGet(character.AssetFamily, Group, Name);
        if (asset == null) {
            throw `Unknown asset: ${Group}${Name}`;
        } else if (asset.Group.Category !== "Item") {
            continue;
        }
        const property = getBaselineProperty(asset, character, Type ?? null);
        const node = <Node>{
            block: new Set(...(asset.Block ?? []), ...(property.Block ?? [])),
        };
        graph.set(Group, node);
    }

    // Traverse the graph, assign priorities and use them for sorting
    for (const [_, node] of graph) {
        itemsArgSortDFS(graph, node);
    }

    // Collect and return all sorting priorities
    const sortRecord: Partial<Record<AssetGroupName, number>> = {};
    for (const [group, node] of graph) {
        sortRecord[group] = node.priority;
    }
    return sortRecord;
}

/**
 * Sort and return the passed itemlist in a manner to minimize group slot blocking.
 * @param itemList The to-be sorted item list. Note that the list is modified inplace.
 * @param character The intended to=be equiped character.
 * Defaults to a simple character without any blacklisted or limited items/options.
 */
export function fortuneItemsSort(
    itemList: FortuneWheelItem[],
    character: Character = MBSDummy,
): FortuneWheelItem[] {
    const sortRecord = itemsArgSort(itemList, character);
    return itemList.sort(item => sortRecord[item.Group] ?? Infinity);
}

/**
 * Return whether the player can unlock the item in question.
 * @param item The item in question
 */
function canUnlock(item: Item): boolean {
    const lock = InventoryGetLock(item)?.Asset;
    if (!InventoryItemHasEffect(item, "Lock")) {
        return true;
    } else if (item.Craft?.Property === "Decoy") {
        // Always disallow the removal of owner-/lovers locked items, even when decoy restraints are used
        return lock === undefined ? false : (!lock.OwnerOnly && !lock.LoverOnly);
    }
    return false;
}

/**
 * Equip the character with all items from the passed fortune wheel item list.
 * @param name The name of the wheel of fortune item list
 * @param itemList The items in question
 * @param stripLevel An integer denoting which clothes should be removed; see {@link StripLevel}
 * @param globalCallbacks A callback (or `null`) that will be applied to all items after they're equiped
 * @param preRunCallback A callback (or `null`) executed before equiping any items from `itemList`
 * @param character The relevant player- or NPC-character
 */
export function fortuneWheelEquip(
    name: string,
    itemList: readonly FortuneWheelItem[],
    stripLevel: StripLevel,
    globalCallback: null | FortuneWheelCallback = null,
    preRunCallback: null | FortuneWheelPreRunCallback = null,
    character: Character = Player,
): void {
    if (!Array.isArray(<readonly FortuneWheelItem[]>itemList)) {
        throw `Invalid "itemList" type: ${typeof itemList}`;
    }
    characterStrip(stripLevel, character);

    if (typeof preRunCallback === "function") {
        itemList = preRunCallback(itemList, character);
    }

    // First pass: remove any old restraints occupying the to-be equiped slots
    const equipFailureRecord: Record<string, string[]> = {};
    const equipCallbackOutputs: Set<AssetGroupName> = new Set();
    for (const {Name, Group, Equip} of itemList) {
        const asset = AssetGet(character.AssetFamily, Group, Name);
        const oldItem = InventoryGet(character, Group);
        const equip = typeof Equip === "function" ? Equip() : true;

        // Check whether the item can actually be equiped
        if (asset == null) {
            equipFailureRecord[Name] = ["Unknown asset"];
            continue;
        } else if (!equip) {
            equipCallbackOutputs.add(Group);
            continue;
        } else if (oldItem == null) {
            continue;
        } else {
            const equipChecks = {
                "Locked item equiped": !canUnlock(oldItem),
                "InventoryBlockedOrLimited": InventoryBlockedOrLimited(character, { Asset: asset }),
                "InventoryAllow": !InventoryAllow(character, asset, asset.Prerequisite, false),
                "InventoryGroupIsBlocked": InventoryGroupIsBlocked(character, Group, false),
            };

            const equipFailure = Object.entries(equipChecks).filter(tup => tup[1]);
            if (equipFailure.length !== 0) {
                equipFailureRecord[asset.Description] = equipFailure.map(tup => tup[0]);
            } else {
                InventoryRemove(character, Group, false);
            }
        }
    }

    // Second pass: equip the new items
    for (const {Name, Group, Craft, ItemCallback, Color, Type, Property} of itemList) {
        const asset = AssetGet(character.AssetFamily, Group, Name);
        const errList = equipFailureRecord[asset?.Description ?? Name];
        if (asset == null || errList !== undefined || equipCallbackOutputs.has(Group)) {
            continue;
        }

        // Equip the item while avoiding refreshes as much as possible until all items are
        CharacterAppearanceSetItem(
            character, Group, asset, Color || asset.DefaultColor,
            SkillGetWithRatio("Bondage"), character.MemberNumber, false,
        );
        const newItem = InventoryGet(character, Group);
        if (newItem == null) {
            continue;
        }
        if (Craft !== undefined) {
            newItem.Craft = { ...Craft };
        }
        itemSetType(newItem, character, Type);
        InventoryCraft(character, character, Group, Craft, false, false);
        if (newItem.Property == null) {
            newItem.Property = deepCopy(Property);
        } else {
            Object.assign(newItem.Property, deepCopy(Property));
        }

        // Fire up any of the provided item-specific dynamic callbacks
        if (typeof ItemCallback === "function") {
            ItemCallback(newItem, character);
        }
        if (typeof globalCallback === "function") {
            globalCallback(newItem, character);
        }
    }

    if (character.IsPlayer()) {
        CharacterRefresh(character, true, false);
        ChatRoomCharacterUpdate(character);
        const nFailures = Object.values(equipFailureRecord).length;
        if (nFailures !== 0) {
            console.log(`MBS: Failed to equip ${nFailures} "${name}" wheel of fortune items`, equipFailureRecord);
        }
    } else {
        CharacterRefresh(character, false, false);
    }
}