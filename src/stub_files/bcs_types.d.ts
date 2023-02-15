type FortuneWheelOptionBase = WheelFortuneOptionType;

/** Type representing MBS-specific fortune wheel options */
interface FortuneWheelOption extends Required<FortuneWheelOptionBase> {
    /**
     * An optional script that will be executed whenever the option is picked.
     * @param character The to-be affected player- or simple character
     */
    readonly Script: (character?: null | Character) => void,
}

/**
 * A list of with the various {@link FortuneWheelOption} flavors that should be generated
 * for a single {@link FortuneWheelOption}.
 */
type FortuneWheelFlags = "5 Minutes" | "15 Minutes" | "1 Hour" | "4 Hours" | "Exclusive" | "High Security";

/**
 * An enum with various strip levels for {@link characterStrip}.
 * All items up to and including the specified levels will be removed.
 */
type StripLevel = 0 | 1 | 2 | 3 | 4;

type ExitAction = 0 | 1 | 2;

interface FortuneWheelItemBase {
    /** The name of the item */
    Name: string,
    /** The group of the item */
    Group: AssetGroupName,
    /** The optional color of the item */
    Color?: readonly string[],
    /** An optional callback whose output denotes whether the item should be equipped */
    Equip?: (character: Character) => boolean,
    /** Optional crafted item data */
    Craft?: Partial<CraftingItem>,
    /** An optional callback for post-processing the item after it's equipped and its type is set */
    ItemCallback?: FortuneWheelCallback;
    /** Whether this is a custom user-specified item set */
    Custom?: boolean,
    /** The type of the item; should preferably be specified in `Craft.Type` */
    Type?: null | string,
    /**
     * The properties of the item.
     * Note that {@link FortuneWheelItemBase.Type}-specific properties should be excluded from here.
     */
    Property?: ItemProperties,
}

interface FortuneWheelItem extends Readonly<FortuneWheelItemBase> {
    /** Optional crafted item data */
    readonly Craft: undefined | Readonly<CraftingItem>,
    /** Whether this is a custom user-specified item set */
    readonly Custom: boolean,
    /** The type of the item; should preferably be specified in `Craft.Type` */
    readonly Type: null | string,
    /**
     * The properties of the item.
     * Note that {@link FortuneWheelItemBase.Type}-specific properties should be excluded from here.
     */
    readonly Property: Readonly<ItemProperties>,
    /** The optional color of the item */
    readonly Color: undefined | readonly string[],
    /** An optional callback for post-processing the item after it's equipped and its type is set */
    readonly ItemCallback: undefined | FortuneWheelCallback;
    /** An optional callback whose output denotes whether the item should be equipped */
    readonly Equip: undefined | ((character: Character) => boolean),
}

/** A union with the names of all pre-defined MBS item sets. */
type FortuneWheelNames = "leash_candy" | "mummy" | "maid" | "statue";

type FortuneWheelItems = Readonly<Record<FortuneWheelNames, readonly FortuneWheelItem[]>>;

/** Wheel of fortune callbacks that are to-be applied to individual items */
type FortuneWheelCallback = (item: Item, character: Character) => void;

/**
 * Wheel of fortune callbacks that are to-be applied to the entire item list.
 * The callback must return either a new or the original item list.
 */
type FortuneWheelPreRunCallback = (
    itemList: readonly FortuneWheelItem[],
    character: Character,
) => readonly FortuneWheelItem[];

/** A union of valid wheel of fortune button colors */
type FortuneWheelColor = "Blue" | "Gold" | "Gray" | "Green" | "Orange" | "Purple" | "Red" | "Yellow";

/** The MBS settings */
interface MBSSettings {
    /** The MBS version */
    readonly Version: string,
    /** A backup string containing the serialized crafting data of all crafting items beyond the BC default */
    CraftingCache: string,
    /** A sealed array with all custom user-created wheel of fortune item sets */
    FortuneWheelSets: (null | import("common_bc").WheelFortuneItemSet)[],
}
