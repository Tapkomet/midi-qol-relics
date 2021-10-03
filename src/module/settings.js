import { debug, setDebugLevel, warn, i18n, checkConcentrationSettings, debugEnabled } from "../midi-qol-relics.js";
import { ConfigPanel } from "./apps/ConfigPanel.js";
export var itemRollButtons;
export var criticalDamage;
export var itemDeleteCheck;
export var nsaFlag;
export var coloredBorders;
export var saveRequests = {};
export var saveTimeouts = {};
export var addChatDamageButtons;
export var autoFastForwardAbilityRolls;
export var autoRemoveTargets;
export var forceHideRoll;
export var enableWorkflow;
export var dragDropTargeting;
const defaultKeyMapping = {
	"RELICS.Advantage": "altKey",
	"RELICS.Disadvantage": "ctrlKey",
	"RELICS.Critical": "altKey",
	"RELICS.Versatile": "shiftKey"
};
class ConfigSettings {
	constructor() {
		this.gmAutoAttack = false;
		this.gmAutoFastForwardAttack = false;
		this.gmAutoDamage = "none";
		this.gmAutoFastForwardDamage = false;
		this.speedItemRolls = false;
		this.speedAbilityRolls = false;
		this.showItemDetails = "";
		this.itemTypeList = null;
		this.autoRollAttack = false;
		this.autoFastForward = "off";
		this.autoTarget = "none";
		this.autoCheckHit = "none";
		this.autoCheckSaves = "none";
		this.hideRollDetails = "none";
		this.displaySaveDC = true;
		this.checkSaveText = false;
		this.defaultSaveMult = 0.5;
		this.autoRollDamage = "none";
		this.autoApplyDamage = "none";
		this.damageImmunities = "none";
		this.requireMagical = false;
		this.autoCEEffects = false;
		this.rangeTarget = "none";
		this.playerRollSaves = "none";
		this.playerSaveTimeout = 0;
		this.reactionTimeout = 10;
		this.gmDoReactions = "all";
		this.doReactions = "all";
		this.showReactionAttackRoll = "all";
		this.rollNPCSaves = "auto";
		this.rollNPCLinkedSaves = "auto";
		this.mergeCard = false;
		this.mergeCardCondensed = false;
		this.useTokenNames = false;
		this.requiresTargets = "none";
		this.fumbleSound = "";
		this.diceSound = "";
		this.criticalSound = "";
		this.itemUseSound = "";
		this.spellUseSound = "";
		this.weaponUseSound = "";
		this.potionUseSound = "";
		this.fullAuto = false;
		this.useCustomSounds = true;
		this.customSoundsPlaylist = "none";
		this.keyMapping = defaultKeyMapping;
		this.allowUseMacro = false;
		this.rollOtherDamage = "none";
		this.removeButtons = "all";
		this.gmRemoveButtons = "all";
		this.concentrationAutomation = false;
		this.singleConcentrationRoll = true;
		this.removeConcentration = true;
		this.optionalRulesEnabled = false;
		this.itemRollStartWorkflow = false;
		this.usePlayerPortrait = false;
		this.optionalRules = {
			invisAdvantage: true,
			checkRange: true,
			wallsBlockRange: "center",
			nearbyFoe: 5,
			nearbyAllyRanged: 4,
			incapacitated: true,
			removeHiddenInvis: true,
			maxDRValue: false,
			distanceIncludesHeight: false
		};
		this.keepRollStats = false;
		this.saveStatsEvery = 20;
		this.playerStatsOnly = false;
	}
}
export var configSettings = new ConfigSettings();
export function checkRule(rule) {
	return configSettings.optionalRulesEnabled && configSettings.optionalRules[rule];
}
export function collectSettingData() {
	let data = {
		configSettings,
		itemRollButtons,
		criticalDamage,
		itemDeleteCheck,
		nsaFlag,
		coloredBorders,
		addChatDamageButtons,
		autoFastForwardAbilityRolls,
		autoRemoveTargets,
		forceHideRoll,
		enableWorkflow,
		dragDropTargeting,
		flags: {}
	};
	data.flags["exportSource"] = {
		system: game.system.id,
		coreVersion: game.data.version,
		systemVersion: game.system.data.version
	};
	data.flags["modules"] = {
		abouttimeVersion: game.modules.get("about-time")?.data.version,
		betterRollsVersion: game.modules.get("betterrolls5e")?.data.version,
		cubVersion: game.modules.get("combat-utility-belt")?.data.version,
		condvisVersion: game.modules.get("conditional-visibility")?.data.version,
		daeVersion: game.modules.get("dae")?.data.version,
		DSNversion: game.modules.get("dice-so-nice")?.data.version,
		dndhelpersVersions: game.modules.get("relics-helpers")?.data.version,
		itemMacroVersion: game.modules.get("itemacro")?.data.version,
		lmrtfyVersion: game.modules.get("lmrtfy")?.data.version,
		midiQolVerson: game.modules.get("midi-qol-relics")?.data.version,
		monksVersion: game.modules.get("monks-tokenbar")?.data.version,
		socketlibVersion: game.modules.get("socketlib")?.data.version,
		simpleCalendarVersion: game.modules.get("foundryvtt-simple-calendar")?.data.version,
		timesUpVersion: game.modules.get("times-up")?.data.version
	};
	data.flags["all-modules"] =
		//@ts-ignore
		(new Collection(game.modules).filter(m => m.active)).map(m => {
			//@ts-ignore
			const mdata = duplicate(m.data);
			return {
				name: mdata.name,
				title: mdata.title,
				description: mdata.description,
				url: mdata.url,
				version: mdata.version,
				minimumCoreVersion: mdata.minimumCoreVersion,
				compatibleCoreVersion: mdata.compatibleCoreVersion,
				scripts: mdata.scripts,
				esmodules: mdata.esmodules,
				socket: mdata.socket
			};
		});
	return data;
}
export function exportSettingsToJSON() {
	const filename = `fvtt-midi-qol-relics-settings.json`;
	saveDataToFile(JSON.stringify(collectSettingData(), null, 2), "text/json", filename);
}
export async function importSettingsFromJSON(json) {
	const data = JSON.parse(json);
	console.warn("midi-qol-relics | Import settings ", data);
	game.settings.set("midi-qol-relics", "ConfigSettings", data.configSettings);
	game.settings.set("midi-qol-relics", "ItemRollButtons", data.itemRollButtons);
	game.settings.set("midi-qol-relics", "CriticalDamage", data.criticalDamage);
	game.settings.set("midi-qol-relics", "ItemDeleteCheck", data.itemDeleteCheck);
	game.settings.set("midi-qol-relics", "showGM", data.nsaFlag);
	game.settings.set("midi-qol-relics", "ColoredBorders", data.coloredBorders);
	game.settings.set("midi-qol-relics", "AddChatDamageButtons", data.addChatDamageButtons);
	game.settings.set("midi-qol-relics", "AutoFastForwardAbilityRolls", data.autoFastForwardAbilityRolls);
	game.settings.set("midi-qol-relics", "AutoRemoveTargets", data.autoRemoveTargets);
	game.settings.set("midi-qol-relics", "ForceHideRoll", data.forceHideRoll);
	game.settings.set("midi-qol-relics", "EnableWorkflow", data.enableWorkflow);
	game.settings.set("midi-qol-relics", "DragDropTarget", data.dragDropTargeting);
}
export let fetchParams = () => {
	if (debugEnabled > 1)
		debug("Fetch Params Loading");
	//@ts-ignore
	configSettings = game.settings.get("midi-qol-relics", "ConfigSettings");
	if (!configSettings.fumbleSound)
		configSettings.fumbleSound = CONFIG.sounds["dice"];
	if (!configSettings.criticalSound)
		configSettings.criticalSound = CONFIG.sounds["dice"];
	if (!configSettings.diceSound)
		configSettings.diceSound = CONFIG.sounds["dice"];
	if (!configSettings.doReactions)
		configSettings.doReactions = "none";
	if (!configSettings.gmDoReactions)
		configSettings.gmDoReactions = "none";
	if (configSettings.reactionTimeout === undefined)
		configSettings.reactionTimeout = 0;
	if (!configSettings.showReactionAttackRoll === undefined)
		configSettings.showReactionAttackRoll = "all";
	// deal with change of type of rollOtherDamage
	if (configSettings.rollOtherDamage === false)
		configSettings.rollOtherDamage = "none";
	if (configSettings.rollOtherDamage === true)
		configSettings.rollOtherDamage = "ifSave";
	if (configSettings.rollOtherDamage === undefined)
		configSettings.rollOtherDamage = "none";
	if (!configSettings.keyMapping
		|| !configSettings.keyMapping["RELICS.Advantage"]
		|| !configSettings.keyMapping["RELICS.Disadvantage"]
		|| !configSettings.keyMapping["RELICS.Critical"]) {
		configSettings.keyMapping = defaultKeyMapping;
	}
	if (typeof configSettings.requiresTargets !== "string")
		configSettings.requiresTargets = "none";
	if (!configSettings.optionalRules) {
		configSettings.optionalRules = {
			invisAdvantage: true,
			checkRange: true,
			wallsBlockRange: "center",
			nearbyFoe: 5,
			nearbyAllyRanged: 4,
			incapacitated: true,
			removeHiddenInvis: true,
			maxDRValue: false,
			distanceIncludesHeight: false,
			criticalSaves: false
		};
	}
	if (!configSettings.optionalRules.wallsBlockRange)
		configSettings.optionalRules.wallsBlockRange = "center";
	if (typeof configSettings.optionalRules.nearbyFoe !== "number") {
		if (configSettings.optionalRulesEnabled)
			configSettings.optionalRules.nearbyFoe = 5;
		else
			configSettings.optionalRules.nearbyFoe = 0;
	}
	configSettings.itemRollStartWorkflow = false;
	const itemList = Object.keys(CONFIG.Item.typeLabels);
	if (!configSettings.itemTypeList && itemList.length > 0) {
		configSettings.itemTypeList = itemList;
	}
	if (configSettings.defaultSaveMult === undefined)
		configSettings.defaultSaveMult = 0.5;
	enableWorkflow = Boolean(game.settings.get("midi-qol-relics", "EnableWorkflow"));
	if (debugEnabled > 0)
		warn("Fetch Params Loading", configSettings);
	criticalDamage = String(game.settings.get("midi-qol-relics", "CriticalDamage"));
	itemDeleteCheck = Boolean(game.settings.get("midi-qol-relics", "ItemDeleteCheck"));
	nsaFlag = Boolean(game.settings.get("midi-qol-relics", "showGM"));
	coloredBorders = String(game.settings.get("midi-qol-relics", "ColoredBorders"));
	itemRollButtons = Boolean(game.settings.get("midi-qol-relics", "ItemRollButtons"));
	addChatDamageButtons = String(game.settings.get("midi-qol-relics", "AddChatDamageButtons"));
	autoFastForwardAbilityRolls = Boolean(game.settings.get("midi-qol-relics", "AutoFastForwardAbilityRolls"));
	autoRemoveTargets = String(game.settings.get("midi-qol-relics", "AutoRemoveTargets"));
	let debugText = String(game.settings.get("midi-qol-relics", "Debug"));
	forceHideRoll = Boolean(game.settings.get("midi-qol-relics", "ForceHideRoll"));
	dragDropTargeting = Boolean(game.settings.get("midi-qol-relics", "DragDropTarget"));
	setDebugLevel(debugText);
	if (configSettings.concentrationAutomation) {
		// Force on use macro to true
		if (!configSettings.allowUseMacro) {
			console.warn("Concentration requires On Use Macro to be enabled. Enabling");
			configSettings.allowUseMacro = true;
		}
		checkConcentrationSettings();
	}
};
const settings = [
	{
		name: "EnableWorkflow",
		scope: "client",
		default: true,
		config: true,
		type: Boolean,
		onChange: fetchParams
	},
	{
		name: "ItemRollButtons",
		scope: "world",
		default: true,
		type: Boolean,
		onChange: fetchParams
	},
	{
		name: "ItemDeleteCheck",
		scope: "client",
		default: true,
		type: Boolean,
		choices: [],
		config: true,
		onChange: fetchParams
	},
	{
		name: "showGM",
		scope: "world",
		default: false,
		type: Boolean,
		choices: [],
		onChange: fetchParams
	},
	{
		name: "ForceHideRoll",
		scope: "world",
		default: true,
		type: Boolean,
		choices: [],
		config: true,
		onChange: fetchParams
	},
	{
		name: "AutoFastForwardAbilityRolls",
		scope: "world",
		default: false,
		type: Boolean,
		config: true,
		onChange: fetchParams
	},
	{
		name: "CriticalDamage",
		scope: "world",
		choices: { default: "Relics default", maxDamage: "max normal damage", maxCrit: "max critical dice", maxAll: "max all dice", doubleDice: "double rolled damage", baseDamage: "no bonus" },
		default: "default",
		type: String,
		onChange: fetchParams
	},
	{
		name: "DragDropTarget",
		scope: "world",
		default: false,
		type: Boolean,
		onChange: fetchParams,
		config: true
	},
	{
		name: "ConfigSettings",
		scope: "world",
		type: Object,
		default: configSettings,
		onChange: fetchParams,
		config: false
	}
];
export const registerSettings = function () {
	// Register any custom module settings here
	settings.forEach((setting, i) => {
		let MODULE = "midi-qol-relics";
		let options = {
			name: game.i18n.localize(`${MODULE}.${setting.name}.Name`),
			hint: game.i18n.localize(`${MODULE}.${setting.name}.Hint`),
			scope: setting.scope,
			config: (setting.config === undefined) ? true : setting.config,
			default: setting.default,
			type: setting.type,
			onChange: setting.onChange
		};
		//@ts-ignore - too tedious to define undefined in each of the settings defs
		if (setting.choices)
			options.choices = setting.choices;
		game.settings.register("midi-qol-relics", setting.name, options);
	});
	game.settings.register("midi-qol-relics", "AddChatDamageButtons", {
		name: "midi-qol-relics.AddChatDamageButtons.Name",
		hint: "midi-qol-relics.AddChatDamageButtons.Hint",
		scope: "world",
		default: "none",
		type: String,
		config: true,
		choices: Object(i18n("midi-qol-relics.AddChatDamageButtonsOptions")),
		onChange: fetchParams
	});
	game.settings.register("midi-qol-relics", "ColoredBorders", {
		name: "midi-qol-relics.ColoredBorders.Name",
		hint: "midi-qol-relics.ColoredBorders.Hint",
		scope: "world",
		default: "None",
		type: String,
		config: true,
		choices: Object(i18n("midi-qol-relics.ColoredBordersOptions")),
		onChange: fetchParams
	});
	game.settings.register("midi-qol-relics", "AutoRemoveTargets", {
		name: "midi-qol-relics.AutoRemoveTargets.Name",
		hint: "midi-qol-relics.AutoRemoveTargets.Hint",
		scope: "world",
		default: "dead",
		type: String,
		config: true,
		choices: Object(i18n("midi-qol-relics.AutoRemoveTargetsOptions")),
		onChange: fetchParams
	});
	game.settings.registerMenu("midi-qol-relics", "midi-qol-relics", {
		name: i18n("midi-qol-relics.config"),
		label: "midi-qol-relics.WorkflowSettings",
		hint: i18n("midi-qol-relics.Hint"),
		icon: "fas fa-dice-d20",
		type: ConfigPanel,
		restricted: true
	});
	if (isNewerVersion(game.data.version, "0.7.0")) {
		game.settings.register("midi-qol-relics", "playerControlsInvisibleTokens", {
			name: game.i18n.localize("midi-qol-relics.playerControlsInvisibleTokens.Name"),
			hint: game.i18n.localize("midi-qol-relics.playerControlsInvisibleTokens.Hint"),
			scope: "world",
			default: false,
			config: true,
			type: Boolean,
			onChange: (value) => { window.location.reload(); }
		});
	}
	game.settings.register("midi-qol-relics", "Debug", {
		name: "midi-qol-relics.Debug.Name",
		hint: "midi-qol-relics.Debug.Hint",
		scope: "world",
		default: "None",
		type: String,
		config: true,
		choices: { none: "None", warn: "warnings", debug: "debug", all: "all" },
		onChange: fetchParams
	});
	game.settings.register("midi-qol-relics", "notificationVersion", {
		name: "",
		hint: "",
		scope: "world",
		default: "0.0.0",
		type: String,
		config: false,
	});
};
