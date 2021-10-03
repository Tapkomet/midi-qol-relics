/**
* This is your TypeScript entry file for Foundry VTT.
* Register custom settings, sheets, and constants using the Foundry API.
* Change this heading to be more descriptive to your module, or remove it.
* Author: [your name]
* Content License: [copyright and-or license] If using an existing system
* 					you may want to put a (link to a) license or copyright
* 					notice here (e.g. the OGL).
* Software License: [your license] Put your desired license here, which
* 					 determines how others may use and modify your module
*/
// Import TypeScript modules
import { registerSettings, fetchParams, configSettings, checkRule } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { checkModules, installedModules, setupModules } from './module/setupModules.js';
import { itemPatching, visionPatching, actorAbilityRollPatching, patchLMRTFY, readyPatching } from './module/patching.js';
import { initHooks, readyHooks } from './module/Hooks.js';
import { initGMActionSetup, setupSocket, socketlibSocket } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow } from './module/workflow.js';
import { applyTokenDamage, checkNearby, findNearby, getDistanceSimple, getTraitMult, MQfromActorUuid, MQfromUuid } from './module/utils.js';
import { ConfigPanel } from './module/apps/ConfigPanel.js';
import { showItemCard, showItemInfo, templateTokens } from './module/itemhandling.js';
import { RollStats } from './module/RollStats.js';
export let debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => { if (debugEnabled > 1)
	console.log("DEBUG: midi-qol-relics | ", ...args); };
export let log = (...args) => console.log("midi-qol-relics | ", ...args);
export let warn = (...args) => { if (debugEnabled > 0)
	console.warn("midi-qol-relics | ", ...args); };
export let error = (...args) => console.error("midi-qol-relics | ", ...args);
export let timelog = (...args) => warn("midi-qol-relics | ", Date.now(), ...args);
export function getCanvas() {
	if (!canvas)
		throw new Error("Canvas not ready");
	return canvas;
}
export let i18n = key => {
	return game.i18n.localize(key);
};
export let i18nFormat = (key, data = {}) => {
	return game.i18n.format(key, data);
};
export let setDebugLevel = (debugText) => {
	debugEnabled = { "none": 0, "warn": 1, "debug": 2, "all": 3 }[debugText] || 0;
	// 0 = none, warnings = 1, debug = 2, all = 3
	if (debugEnabled >= 3)
		CONFIG.debug.hooks = true;
};
export let noDamageSaves = [];
export let undoDamageText;
export let savingThrowText;
export let savingThrowTextAlt;
export let MQdefaultDamageType;
export let midiFlags = [];
export let allAttackTypes = [];
export let gameStats;
export let overTimeEffectsToDelete = {};
export const MESSAGETYPES = {
	HITS: 1,
	SAVES: 2,
	ATTACK: 3,
	DAMAGE: 4,
	ITEM: 0
};
export let cleanSpellName = (name) => {
	return name.toLowerCase().replace(/[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９々〆〤]/g, '').replace("'", '').replace(/ /g, '');
};
/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once('init', async function () {
	console.log('midi-qol-relics | Initializing midi-qol-relics');
	initHooks();
	// Assign custom classes and constants here
	// Register custom module settings
	registerSettings();
	fetchParams();
	// Preload Handlebars templates
	preloadTemplates();
	// Register custom sheets (if any)
});
/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
	// Do anything after initialization but before
	// ready
	setupSocket();
	fetchParams();
	itemPatching();
	visionPatching();
	setupModules();
	registerSettings();
	initGMActionSetup();
	patchLMRTFY();
	setupMidiFlags();
	undoDamageText = i18n("midi-qol-relics.undoDamageFrom");
	savingThrowText = i18n("midi-qol-relics.savingThrowText");
	savingThrowTextAlt = i18n("midi-qol-relics.savingThrowTextAlt");
	MQdefaultDamageType = i18n("midi-qol-relics.defaultDamageType");
	//@ts-ignore CONFIG.RELICS
	CONFIG.RELICS.weaponProperties["nodam"] = i18n("midi-qol-relics.noDamageSaveProp");
	//@ts-ignore CONFIG.RELICS
	CONFIG.RELICS.weaponProperties["fulldam"] = i18n("midi-qol-relics.fullDamageSaveProp");
	//@ts-ignore CONFIG.RELICS
	CONFIG.RELICS.weaponProperties["halfdam"] = i18n("midi-qol-relics.halfDamageSaveProp");
	//@ts-ignore CONFIG.RELICS
	CONFIG.RELICS.weaponProperties["critOther"] = i18n("midi-qol-relics.otherCritProp");
	//@ts-ignore CONFIG.RELICS
	CONFIG.RELICS.damageTypes["midi-none"] = i18n("midi-qol-relics.midi-none");
	if (game.system.id === "relics")
		//@ts-ignore CONFIG.RELICS
		CONFIG.RELICS.damageResistanceTypes["spell"] = i18n("midi-qol-relics.spell-damage");
	if (configSettings.allowUseMacro) {
		/*
		CONFIG.RELICS.characterFlags["AttackBonusMacro"] = {
		hint: i18n("midi-qol-relics.AttackMacro.Hint"),
		name: i18n("midi-qol-relics.AttackMacro.Name"),
		placeholder: "",
		section: i18n("midi-qol-relics.DAEMidiQOL"),
		type: String
		};
		*/
		//@ts-ignore CONFIG.RELICS
		CONFIG.RELICS.characterFlags["DamageBonusMacro"] = {
			hint: i18n("midi-qol-relics.DamageMacro.Hint"),
			name: i18n("midi-qol-relics.DamageMacro.Name"),
			placeholder: "",
			section: i18n("midi-qol-relics.DAEMidiQOL"),
			type: String
		};
	}
	;
	//@ts-ignore
	noDamageSaves = i18n("midi-qol-relics.noDamageonSaveSpells").map(name => cleanSpellName(name));
	setupSheetQol();
});
/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function () {
	if (!game.modules.get("lib-wrapper")?.active && game.user?.isGM)
		ui.notifications?.warn("The 'Midi QOL' module recommends to install and activate the 'libWrapper' module.");
	gameStats = new RollStats();
	// Do anything once the module is ready
	actorAbilityRollPatching();
	setupMidiQOLApi();
	//if (game.user?.isGM && !installedModules.get("dae")) {
	//	ui.notifications?.warn("Midi-qol requires DAE to be installed and at least version 0.8.43 or many automation effects won't work");
	//}
	if (game.user?.isGM && game.modules.get("betterrolls5e")?.active && !installedModules.get("betterrolls5e")) {
		ui.notifications?.warn("Midi QOL requires better rolls to be version 1.6.6 or later");
	}
	checkModules();
	checkConcentrationSettings();
	readyHooks();
	readyPatching();
});
// Add any additional hooks if necessary
// Backwards compatability
function setupMidiQOLApi() {
	//@ts-ignore
	window.MinorQOL = {
		doRoll: doRoll,
		applyTokenDamage: applyTokenDamage
	};
	//@ts-ignore
	window.MidiQOL = {
		applyTokenDamage,
		TrapWorkflow,
		DamageOnlyWorkflow,
		Workflow,
		configSettings: () => { return configSettings; },
		ConfigPanel: ConfigPanel,
		getTraitMult: getTraitMult,
		getDistance: getDistanceSimple,
		midiFlags,
		debug,
		log,
		warn,
		findNearby: findNearby,
		checkNearby: checkNearby,
		showItemInfo: showItemInfo,
		showItemCard: showItemCard,
		gameStats,
		MQFromUuid: MQfromUuid,
		MQfromActorUuid: MQfromActorUuid,
		selectTargetsForTemplate: templateTokens,
		socket: () => { return socketlibSocket; },
		checkRule: checkRule
	};
}
export function checkConcentrationSettings() {
	const needToUpdateCubSettings = installedModules.get("combat-utility-belt") && (game.settings.get("combat-utility-belt", "enableConcentrator"));
	if (game.user?.isGM && configSettings.concentrationAutomation && needToUpdateCubSettings) {
		let d = new Dialog({
			// localize this text
			title: i18n("dae.confirm"),
			content: `<p>You have enabled midi-qol-relics concentration automation.</p><p>This requires Combat Utility Belt Concentration to be disabled.</p><p>Choose which concentration automation to disable</p>`,
			buttons: {
				one: {
					icon: '<i class="fas fa-cross"></i>',
					label: "Disable CUB",
					callback: () => {
						game.settings.set("combat-utility-belt", "enableConcentrator", false);
					}
				},
				two: {
					icon: '<i class="fas fa-cross"></i>',
					label: "Disable Midi",
					callback: () => {
						configSettings.concentrationAutomation = false;
						game.settings.set("midi-qol-relics", "ConfigSettings", configSettings);
					}
				}
			},
			default: "one"
		});
		d.render(true);
	}
}
// Minor-qol compatibility patching
function doRoll(event = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, type: "none" }, itemName, options = { type: "", versatile: false }) {
	const speaker = ChatMessage.getSpeaker();
	var actor;
	if (speaker.token) {
		const token = canvas?.tokens?.get(speaker.token);
		actor = token?.actor;
	}
	else {
		actor = game.actors?.get(speaker.actor ?? "");
	}
	if (!actor) {
		if (debugEnabled > 0)
			warn("No actor found for ", speaker);
		return;
	}
	let pEvent = {
		shiftKey: event.shiftKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		metaKey: event.metaKey,
		type: (event?.type === "contextmenu") || options.versatile ? "contextmenu" : ""
	};
	let item = actor?.items?.get(itemName); // see if we got an itemId
	if (!item)
		item = actor?.items?.find(i => i.name === itemName && (!options.type || i.type === options.type));
	if (item) {
		return item.roll({ event: pEvent });
	}
	else {
		ui.notifications?.warn(game.i18n.format("RELICS.ActionWarningNoItem", { item: itemName, name: actor.name }));
	}
}
function setupMidiFlags() {
	midiFlags.push("flags.midi-qol-relics.advantage.all");
	midiFlags.push("flags.midi-qol-relics.disadvantage.all");
	midiFlags.push("flags.midi-qol-relics.advantage.attack.all");
	midiFlags.push("flags.midi-qol-relics.disadvantage.attack.all");
	midiFlags.push("flags.midi-qol-relics.critical.all");
	midiFlags.push("flags.midi-qol-relics.noCritical.all");
	midiFlags.push("flags.midi-qol-relics.fail.all");
	midiFlags.push("flags.midi-qol-relics.fail.attack.all");
	midiFlags.push(`flags.midi-qol-relics.grants.advantage.attack.all`);
	midiFlags.push(`flags.midi-qol-relics.grants.disadvantage.attack.all`);
	midiFlags.push(`flags.midi-qol-relics.grants.critical.all`);
	midiFlags.push(`flags.midi-qol-relics.fail.critical.all`);
	midiFlags.push(`flags.midi-qol-relics.maxDamage.all`);
	midiFlags.push(`flags.midi-qol-relics.grants.maxDamage.all`);
	midiFlags.push(`flags.midi-qol-relics.advantage.concentration`);
	midiFlags.push(`flags.midi-qol-relics.disadvantage.concentration`);
	midiFlags.push("flags.midi-qol-relics.ignoreNearbyFoes");
	midiFlags.push(`flags.midi-qol-relics.concentrationSaveBonus`);
	midiFlags.push(`flags.midi-qol-relics.potentCantrip`);
	allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
	if (game.system.id === "sw5e")
		allAttackTypes = ["rwak", "mwak", "rpak", "mpak"];
	let attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"]);
	attackTypes.forEach(at => {
		midiFlags.push(`flags.midi-qol-relics.advantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol-relics.disadvantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol-relics.fail.attack.${at}`);
		midiFlags.push(`flags.midi-qol-relics.critical.${at}`);
		midiFlags.push(`flags.midi-qol-relics.noCritical.${at}`);
		midiFlags.push(`flags.midi-qol-relics.grants.advantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol-relics.grants.disadvantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol-relics.grants.critical.${at}`);
		midiFlags.push(`flags.midi-qol-relics.fail.critical.${at}`);
		midiFlags.push(`flags.midi-qol-relics.maxDamage.${at}`);
	});
	midiFlags.push("flags.midi-qol-relics.advantage.ability.all");
	midiFlags.push("flags.midi-qol-relics.advantage.ability.check.all");
	midiFlags.push("flags.midi-qol-relics.advantage.ability.save.all");
	midiFlags.push("flags.midi-qol-relics.disadvantage.ability.all");
	midiFlags.push("flags.midi-qol-relics.disadvantage.ability.check.all");
	midiFlags.push("flags.midi-qol-relics.disadvantage.ability.save.all");
	midiFlags.push("flags.midi-qol-relics.fail.ability.all");
	midiFlags.push("flags.midi-qol-relics.fail.ability.check.all");
	midiFlags.push("flags.midi-qol-relics.fail.ability.save.all");
	midiFlags.push("flags.midi-qol-relics.superSaver.all");
	midiFlags.push("flags.midi-qol-relics.MR.ability.save.all");
	//@ts-ignore CONFIG.RELICS
	Object.keys(CONFIG.RELICS.abilities).forEach(abl => {
		midiFlags.push(`flags.midi-qol-relics.advantage.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.disadvantage.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.advantage.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.disadvantage.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.advantage.attack.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.disadvantage.attack.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.fail.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.fail.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.superSaver.${abl}`);
		midiFlags.push(`flags.midi-qol-relics.MR.ability.save.${abl}`);
	});
	midiFlags.push(`flags.midi-qol-relics.advantage.skill.all`);
	midiFlags.push(`flags.midi-qol-relics.disadvantage.skill.all`);
	midiFlags.push(`flags.midi-qol-relics.fail.skill.all`);
	//@ts-ignore CONFIG.RELICS
	Object.keys(CONFIG.RELICS.skills).forEach(skill => {
		midiFlags.push(`flags.midi-qol-relics.advantage.skill.${skill}`);
		midiFlags.push(`flags.midi-qol-relics.disadvantage.skill.${skill}`);
		midiFlags.push(`flags.midi-qol-relics.fail.skill.${skill}`);
	});
	midiFlags.push(`flags.midi-qol-relics.advantage.deathSave`);
	midiFlags.push(`flags.midi-qol-relics.disadvantage.deathSave`);
	if (game.system.id === "relics") {
		//@ts-ignore CONFIG.RELICS
		Object.values(CONFIG.RELICS.spellComponents).forEach((comp) => {
			midiFlags.push(`flags.midi-qol-relics.fail.spell.${comp.toLowerCase()}`);
		});
		midiFlags.push(`flags.midi-qol-relics.DR.all`);
		midiFlags.push(`flags.midi-qol-relics.DR.non-magical`);
		midiFlags.push(`flags.midi-qol-relics.DR.final`);
		midiFlags.push(`flags.midi-qol-relics.DR.non-physical`);
		//@ts-ignore CONFIG.RELICS
		Object.keys(CONFIG.RELICS.damageResistanceTypes).forEach(dt => {
			midiFlags.push(`flags.midi-qol-relics.DR.${dt}`);
		});
	}
	midiFlags.push(`flags.midi-qol-relics.optional.NAME.attack`);
	midiFlags.push(`flags.midi-qol-relics.optional.NAME.check`);
	midiFlags.push(`flags.midi-qol-relics.optional.NAME.save`);
	midiFlags.push(`flags.midi-qol-relics.optional.NAME.label`);
	midiFlags.push(`flags.midi-qol-relics.optional.NAME.skill`);
	midiFlags.push(`flags.midi-qol-relics.optional.NAME.count`);
	midiFlags.push(`flags.midi-qol-relics.uncanny-dodge`);
	midiFlags.push(`flags.midi-qol-relics.OverTime`);
	/*
	midiFlags.push(`flags.midi-qol-relics.grants.advantage.attack.all`);
	midiFlags.push(`flags.midi-qol-relics.grants.disadvantage.attack.all`);
	midiFlags.push(``);

	midiFlags.push(``);
	midiFlags.push(``);
	*/
	if (installedModules.get("dae")) {
		//@ts-ignore
		window.DAE.addAutoFields(midiFlags);
	}
}
