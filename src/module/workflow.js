//@ts-ignore
import { warn, debug, log, i18n, MESSAGETYPES, error, MQdefaultDamageType, debugEnabled, timelog, getCanvas } from "../midi-qol-relics.js";
import { selectTargets, showItemCard } from "./itemhandling.js";
import { socketlibSocket } from "./GMAction.js";
import { installedModules } from "./setupModules.js";
import { configSettings, autoRemoveTargets, checkRule, autoFastForwardAbilityRolls } from "./settings.js";
import { createDamageList, processDamageRoll, untargetDeadTokens, getSaveMultiplierForItem, requestPCSave, applyTokenDamage, checkRange, checkIncapcitated, testKey, getAutoRollDamage, isAutoFastAttack, isAutoFastDamage, getAutoRollAttack, itemHasDamage, getRemoveDamageButtons, getRemoveAttackButtons, getTokenPlayerName, checkNearby, hasCondition, getDistance, removeHiddenInvis, expireMyEffects, validTargetTokens, getSelfTargetSet, doReactions, playerFor, addConcentration, getDistanceSimple } from "./utils.js";
export const shiftOnlyEvent = { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, type: "" };
export function noKeySet(event) { return !(event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey); }
export let allDamageTypes;
class damageBonusMacroResult {
}
export const WORKFLOWSTATES = {
	NONE: 0,
	ROLLSTARTED: 1,
	AWAITTEMPLATE: 2,
	TEMPLATEPLACED: 3,
	VALIDATEROLL: 4,
	PREAMBLECOMPLETE: 5,
	WAITFORATTACKROLL: 6,
	ATTACKROLLCOMPLETE: 7,
	WAITFORDAMAGEROLL: 8,
	DAMAGEROLLCOMPLETE: 9,
	WAITFORSAVES: 10,
	SAVESCOMPLETE: 11,
	ALLROLLSCOMPLETE: 12,
	APPLYDYNAMICEFFECTS: 13,
	ROLLFINISHED: 14
};
function stateToLabel(state) {
	let theState = Object.entries(WORKFLOWSTATES).find(a => a[1] === state);
	return theState ? theState[0] : "Bad State";
}
export const defaultRollOptions = {
	advantage: false,
	disadvantage: false,
	versatile: false,
	fastForward: false
};
class TokenDocument {
}
;
class workflowSate {
	constructor(state, undoData) {
		this._state = state;
		this._undoData = undoData;
		this._stateLabel = stateToLabel(state);
	}
}
export class Workflow {
	constructor(actor, item, speaker, targets, options) {
		this.rollOptions = duplicate(defaultRollOptions);
		this.actor = actor;
		this.item = item;
		if (!this.item) {
			this.itemId = randomID();
			this.uuid = this.itemId;
		}
		else {
			this.itemId = item.id;
			this.itemUuid = item.uuid;
			this.uuid = item.uuid;
		}
		if (Workflow.getWorkflow(this.uuid)) {
			Workflow.removeWorkflow(this.uuid);
		}
		this.tokenId = speaker.token;
		const token = getCanvas().tokens?.get(this.tokenId);
		this.tokenUuid = this.tokenId ? token?.document.uuid : undefined; // TODO see if this could be better
		if (installedModules.get("levels") && token) {
			//@ts-ignore
			this.elevation = _levels.getTokenLOSheight(token);
		}
		this.speaker = speaker;
		if (this.speaker.scene)
			this.speaker.scene = canvas?.scene?.id;
		this.targets = new Set(targets);
		this.saves = new Set();
		this.superSavers = new Set();
		this.failedSaves = new Set(this.targets);
		this.hitTargets = new Set(this.targets);
		this.isCritical = false;
		this.isFumble = false;
		this.currentState = WORKFLOWSTATES.NONE;
		this.itemLevel = item?.level || 0;
		this._id = randomID();
		this.displayId = this.id;
		this.itemCardData = {};
		this.attackCardData = undefined;
		this.damageCardData = undefined;
		this.event = options?.event;
		this.capsLock = options?.event?.getModifierState && options?.event.getModifierState("CapsLock");
		this.rollOptions = { disKey: false, advKey: false, versaKey: false, critKey: false, fastForward: false, fasForwardKey: false };
		if (this.item && !this.item.hasAttack)
			this.processDamageEventOptions(options?.event);
		else
			this.processAttackEventOptions(options?.event);
		this.templateId = null;
		this.templateUuid = null;
		this.saveRequests = {};
		this.saveTimeouts = {};
		this.shouldRollOtherDamage = true;
		this.placeTemlateHookId = null;
		this.damageDetail = [];
		this.otherDamageDetail = [];
		this.hideTags = new Array();
		this.displayHookId = null;
		this.onUseCalled = false;
		this.effectsAlreadyExpired = [];
		this.reactionUpdates = new Set();
		Workflow._workflows[this.uuid] = this;
		this.stateList = [];
	}
	get id() { return this._id; }
	static get workflows() { return Workflow._workflows; }
	static getWorkflow(id) {
		if (debugEnabled > 1)
			debug("Get workflow ", id, Workflow._workflows, Workflow._workflows[id]);
		return Workflow._workflows[id];
	}
	get workflowType() { return this.__proto__.constructor.name; }
	;
	get hasSave() {
		if (this.item.hasSave)
			return this.item.hasSave;
		if (configSettings.rollOtherDamage && this.shouldRollOtherDamage)
			return this.otherDamageItem.hasSave;
		return this.item.hasSave;
	}
	get saveItem() {
		if (this.item.hasSave)
			return this.item;
		if (configSettings.rollOtherDamage && this.ammo?.hasSave)
			return this.ammo;
		return this.item;
	}
	get otherDamageItem() {
		if (this.item.data.data.formula ?? "" !== "")
			return this.item;
		if (this.ammo && (this.ammo?.data.data.formula ?? "") !== "")
			return this.ammo;
		return this.item;
		let item = this.item;
		if (!item.hasSave && this.ammo?.hasSave && configSettings.rollOtherDamage && this.shouldRollOtherDamage)
			item = this.ammo;
		return item;
	}
	get otherDamageFormula() {
		return this.otherDamageItem?.data.data.formula;
	}
	get hasDAE() {
		return installedModules.get("dae") && (this.item?.effects?.some(ef => ef.data.transfer === false));
	}
	static initActions(actions) {
		Workflow._actions = actions;
	}
	processAttackEventOptions(event) {
		//TODO see if this can be simplified. Problem is we don't know when the event is injected
		let advKey = this.rollOptions.advKey || event?.altKey;
		let disKey = this.rollOptions.disKey || event?.ctrlKey || event?.metaKey;
		if (this.workflowType === "BetterRollsWorkflow")
			return;
		if (configSettings.speedItemRolls) {
			advKey = testKey(configSettings.keyMapping["RELICS.Advantage"], event);
			disKey = testKey(configSettings.keyMapping["RELICS.Disadvantage"], event);
			this.rollOptions.versaKey = this.rollOptions.versaKey || testKey(configSettings.keyMapping["RELICS.Versatile"], event);
			this.rollOptions.versatile = this.rollOptions.versatile || this.rollOptions.versaKey;
		}
		else {
			advKey = this.rollOptions.advKey || event?.altKey;
			disKey = this.rollOptions.disKey || event?.ctrlKey || event?.metaKey;
		}
		this.rollOptions.fastForwardKey = this.rollOptions.fastForwardKey || (advKey && disKey);
		if (this.capsLock)
			this.rollOptions.fastForwardKey = true;
		this.rollOptions.advKey = this.rollOptions.advKey || (advKey && !disKey);
		this.rollOptions.disKey = this.rollOptions.disKey || (!advKey && disKey);
		this.advantage = this.advantage || this.rollOptions.advKey;
		this.disadvantage = this.disadvantage || this.rollOptions.disKey;
	}
	someEventKeySet() {
		return this.event?.shiftKey || this.event?.altKey || this.event?.ctrlKey || this.event?.metaKey;
	}
	static async removeAttackDamageButtons(id) {
		let workflow = Workflow.getWorkflow(id);
		if (!workflow)
			return;
		let chatMessage = game.messages?.get(workflow.itemCardId ?? "");
		if (!chatMessage)
			return;
		let content = chatMessage && duplicate(chatMessage.data.content);
		// TODO work out what to do if we are a damage only workflow and betters rolls is active - display update wont work.
		const versatileRe = /<button data-action="versatile">[^<]*<\/button>/;
		const damageRe = /<button data-action="damage">[^<]*<\/button>/;
		const formulaRe = /<button data-action="formula">[^<]*<\/button>/;
		content = content?.replace(damageRe, "");
		content = content?.replace(formulaRe, "");
		content = content?.replace(versatileRe, "<div></div>");
		const searchRe = /<button data-action="attack">[^<]*<\/button>/;
		content = content.replace(searchRe, "");
		chatMessage.update({ content });
	}
	static removeWorkflow(id) {
		if (!Workflow._workflows[id] && debugEnabled > 0)
			warn("removeWorkflow: No such workflow ", id);
		else {
			let workflow = Workflow._workflows[id];
			// If the attack roll broke and we did we roll again will have an extra hook laying around.
			if (workflow.displayHookId)
				Hooks.off("preCreateChatMessage", workflow.displayHookId);
			// This can lay around if the template was never placed.
			if (workflow.placeTemlateHookId)
				Hooks.off("createMeasuredTemplate", workflow.placeTemlateHookId);
			// Remove buttons
			this.removeAttackDamageButtons(id);
			delete Workflow._workflows[id];
		}
	}
	async next(nextState) {
		return await this._next(nextState);
	}
	async _next(newState, undoData = {}) {
		timelog("next state ", newState, Date.now());
		this.currentState = newState;
		let state = stateToLabel(newState);
		if (debugEnabled > 0)
			warn("workflow.next ", state, this.id, this);
		// this.stateList.push(new workflowSate(newState, undoData));
		// error(this.stateList);
		switch (newState) {
			case WORKFLOWSTATES.NONE:
				if (debugEnabled > 1)
					debug(" workflow.next ", state, configSettings.autoTarget, this.item.hasAreaTarget);
				if (configSettings.autoTarget !== "none" && this.item.hasAreaTarget) {
					return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
				}
				const targetDetails = this.item.data.data.target;
				if (configSettings.rangeTarget !== "none" && ["ft", "m"].includes(targetDetails?.units) && ["creature", "ally", "enemy"].includes(targetDetails?.type)) {
					this.setRangedTargets(targetDetails);
					this.failedSaves = new Set(this.targets);
					this.hitTargets = new Set(this.targets);
					this.targets = await validTargetTokens(this.targets);
					return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
				}
				return this.next(WORKFLOWSTATES.VALIDATEROLL);
			case WORKFLOWSTATES.AWAITTEMPLATE:
				if (this.item.hasAreaTarget && configSettings.autoTarget !== "none") {
					if (debugEnabled > 1)
						debug("Item has template registering Hook");
					this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
					return undefined;
				}
				return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
			case WORKFLOWSTATES.TEMPLATEPLACED:
				// Some modules stop being able to get the item card id.
				if (!this.itemCardId)
					return this.next(WORKFLOWSTATES.VALIDATEROLL);
				const chatMessage = game.messages?.get(this.itemCardId);
				// remove the place template button from the chat card.
				this.targets = await validTargetTokens(this.targets);
				this.hitTargets = new Set(this.targets);
				let content = chatMessage && duplicate(chatMessage.data.content);
				let buttonRe = /<button data-action="placeTemplate">[^<]*<\/button>/;
				content = content?.replace(buttonRe, "");
				await chatMessage?.update({
					"content": content,
					"flags.midi-qol-relics.playSound": false,
					"flags.midi-qol-relics.type": MESSAGETYPES.ITEM,
					type: CONST.CHAT_MESSAGE_TYPES.OTHER
				});
				return this.next(WORKFLOWSTATES.VALIDATEROLL);
			case WORKFLOWSTATES.VALIDATEROLL:
				// do pre roll checks
				if (checkRule("checkRange")) {
					switch (checkRange(this.actor, this.item, this.tokenId, this.targets)) {
						case "fail": return this.next(WORKFLOWSTATES.ROLLFINISHED);
						case "dis": this.disadvantage = true;
					}
				}
				if (checkRule("incapacitated") && checkIncapcitated(this.actor, this.item, null))
					return this.next(WORKFLOWSTATES.ROLLFINISHED);
				return this.next(WORKFLOWSTATES.PREAMBLECOMPLETE);
			case WORKFLOWSTATES.PREAMBLECOMPLETE:
				this.effectsAlreadyExpired = [];
				return this.next(WORKFLOWSTATES.WAITFORATTACKROLL);
			case WORKFLOWSTATES.WAITFORATTACKROLL:
				if (this.item.data.type === "tool" && autoFastForwardAbilityRolls) {
					this.processAttackEventOptions(this.event);
					const hasAdvantage = this.advantage && !this.disadvantage;
					const hasDisadvantage = this.disadvantage && !this.advantage;
					this.item.rollToolCheck({ fastForward: this.rollOptions.fastForward, advantage: hasAdvantage, disadvantage: hasDisadvantage });
					return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
				}
				if (!this.item.hasAttack) {
					return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
				}
				if (this.noAutoAttack)
					return undefined;
				let shouldRoll = this.someEventKeySet() || getAutoRollAttack();
				// this.processAttackEventOptions(event);
				if (getAutoRollAttack() && isAutoFastAttack() && this.rollOptions.fastForwardKey)
					shouldRoll = false;
				//      if (configSettings.mergeCard) {
				{
					const chatMessage = game.messages?.get(this.itemCardId ?? "");
					const isFastRoll = isAutoFastAttack() || (!isAutoFastAttack() && this.rollOptions.fastForwardKey);
					if (chatMessage && (!shouldRoll || !isFastRoll)) {
						// provide a hint as to the type of roll expected.
						let content = chatMessage && duplicate(chatMessage.data.content);
						let searchRe = /<button data-action="attack">[^<]+<\/button>/;
						const hasAdvantage = this.advantage && !this.disadvantage;
						const hasDisadvantage = this.disadvantage && !this.advantage;
						let attackString = hasAdvantage ? i18n("RELICS.Advantage") : hasDisadvantage ? i18n("RELICS.Disadvantage") : i18n("RELICS.Attack");
						if (isFastRoll)
							attackString += ` ${i18n("midi-qol-relics.fastForward")}`;
						let replaceString = `<button data-action="attack">${attackString}</button>`;
						content = content.replace(searchRe, replaceString);
						await chatMessage?.update({ "content": content });
					}
					else if (!chatMessage)
						error("no chat message");
				}
				if (shouldRoll) {
					this.item.rollAttack({ event: {} });
				}
				else if (isAutoFastAttack() && this.rollOptions.fastForwardKey) {
					this.rollOptions.fastForwardKey = false;
					this.rollOptions.fastForward = false;
				}
				return undefined;
			case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
				Hooks.callAll("midi-qol-relics.preAttackRollComplete", this);
				const attackBonusMacro = getProperty(this.actor.data.flags, `${game.system.id}.AttackBonusMacro`);
				if (configSettings.allowUseMacro && attackBonusMacro) {
					await this.rollAttackBonus(attackBonusMacro);
				}
				this.processAttackRoll();
				if (configSettings.autoCheckHit !== "none") {
					await this.checkHits();
					await this.displayAttackRoll(configSettings.mergeCard);
					const rollMode = game.settings.get("core", "rollMode");
					this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blindroll" || rollMode === "gmroll";
					await this.displayHits(this.whisperAttackCard, configSettings.mergeCard);
				}
				else {
					await this.displayAttackRoll(configSettings.mergeCard);
				}
				if (checkRule("removeHiddenInvis"))
					removeHiddenInvis.bind(this)();
				// We only roll damage on a hit. but we missed everyone so all over, unless we had no one targetted
				Hooks.callAll("midi-qol-relics.AttackRollComplete", this);
				if ((getAutoRollDamage() === "onHit" && this.hitTargets.size === 0 && this.targets.size !== 0)
					|| getAutoRollDamage() === "none" && (this.hitTargets.size === 0 || this.targets.size === 0)) {
					expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);
					// Do special expiries
					await this.expireTargetEffects(["isAttacked"]);
					return this.next(WORKFLOWSTATES.ROLLFINISHED);
				}
				return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
			case WORKFLOWSTATES.WAITFORDAMAGEROLL:
				if (debugEnabled > 1)
					debug(`wait for damage roll has damage ${itemHasDamage(this.item)} isfumble ${this.isFumble} no auto damage ${this.noAutoDamage}`);
				if (!itemHasDamage(this.item))
					return this.next(WORKFLOWSTATES.WAITFORSAVES);
				if (this.isFumble && configSettings.autoRollDamage !== "none") {
					// Auto rolling damage but we fumbled - we failed - skip everything.
					expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);
					return this.next(WORKFLOWSTATES.ROLLFINISHED);
				}
				if (this.noAutoDamage)
					return; // we are emulating the standard card specially.
				let shouldRollDamage = getAutoRollDamage() === "always"
					|| (getAutoRollDamage() !== "none" && !this.item.hasAttack)
					|| (getAutoRollDamage() === "onHit" && (this.hitTargets.size > 0 || this.targets.size === 0));
				// We have used up the fastforward key for this roll
				if (isAutoFastAttack()) {
					this.rollOptions.fastForwardKey = false;
				}
				if (shouldRollDamage) {
					if (debugEnabled > 0)
						warn(" about to roll damage ", this.event, configSettings.autoRollAttack, configSettings.autoFastForward);
					//@ts-ignore
					const storedData = game.messages?.get(this.itemCardId).getFlag(game.system.id, "itemData");
					if (storedData) { // It magic items is being used it fiddles the roll to include the item data
						this.item = new CONFIG.Item.documentClass(storedData, { parent: this.actor });
					}
					this.rollOptions.spellLevel = this.itemLevel;
					this.item.rollDamage(this.rollOptions);
					return undefined;
				}
				this.processDamageEventOptions(event);
				//        if (configSettings.mergeCard && !shouldRollDamage) {
				//if (!shouldRollDamage) {
				{
					const chatMessage = game.messages?.get(this.itemCardId || "");
					if (chatMessage) {
						// provide a hint as to the type of roll expected.
						let content = chatMessage && duplicate(chatMessage.data.content);
						let searchRe = /<button data-action="damage">[^<]+<\/button>/;
						const damageTypeString = (this.item.data?.data?.actionType === "heal") ? i18n("RELICS.Healing") : i18n("RELICS.Damage");
						let damageString = (this.rollOptions.critical) ? i18n("RELICS.Critical") : damageTypeString;
						if (isAutoFastDamage())
							damageString += ` ${i18n("midi-qol-relics.fastForward")}`;
						let replaceString = `<button data-action="damage">${damageString}</button>`;
						content = content.replace(searchRe, replaceString);
						searchRe = /<button data-action="versatile">[^<]+<\/button>/;
						damageString = i18n("RELICS.Versatile");
						if (isAutoFastDamage())
							damageString += ` ${i18n("midi-qol-relics.fastForward")}`;
						replaceString = `<button data-action="versatile">${damageString}</button>`;
						content = content.replace(searchRe, replaceString);
						await chatMessage?.update({ content });
					}
				}
				return undefined; // wait for a damage roll to advance the state.
			case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
				if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
					// we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
					this.targets = await validTargetTokens(game.user?.targets);
					this.hitTargets = await validTargetTokens(game.user?.targets);
					if (debugEnabled > 0)
						warn(" damage roll complete for non auto target area effects spells", this);
				}
				Hooks.callAll("midi-qol-relics.preDamageRollComplete", this);
				// apply damage to targets plus saves plus immunities
				// done here cause not needed for betterrolls workflow
				this.defaultDamageType = this.item.data.data.damage?.parts[0][1] || this.defaultDamageType || MQdefaultDamageType;
				//@ts-ignore CONFIG.RELICS
				if (this.item?.data.data.actionType === "heal" && !Object.keys(CONFIG.RELICS.healingTypes).includes(this.defaultDamageType))
					this.defaultDamageType = "healing";
				this.damageDetail = createDamageList(this.damageRoll, this.rollOptions.versatile ? null : this.item, this.defaultDamageType);
				const damageBonusMacro = getProperty(this.actor.data.flags, `${game.system.id}.DamageBonusMacro`);
				if (damageBonusMacro && this.workflowType === "Workflow") {
					await this.rollBonusDamage(damageBonusMacro);
				}
				// TODO Need to do DSN stuff
				if (this.otherDamageRoll) {
					this.otherDamageDetail = createDamageList(this.otherDamageRoll, null, this.defaultDamageType);
				}
				await this.displayDamageRoll(configSettings.mergeCard);
				Hooks.callAll("midi-qol-relics.DamageRollComplete", this);
				if (this.isFumble) {
					this.expireMyEffects(["1Action", "1Attack", "1Spell"]);
					return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
				}
				expireMyEffects.bind(this)(["1Action", "1Attack", "1Hit", "1Spell"]);
				return this.next(WORKFLOWSTATES.WAITFORSAVES);
			case WORKFLOWSTATES.WAITFORSAVES:
				this.saves = new Set(); // not auto checking assume no saves
				this.failedSaves = new Set(this.hitTargets);
				if (!this.hasSave) {
					return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
				}
				if (configSettings.autoCheckSaves !== "none") {
					//@ts-ignore ._hooks not defined
					if (debugEnabled > 1)
						debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length);
					// setup to process saving throws as generated
					let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
					let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
					let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
					try {
						await this.checkSaves(true);
					}
					finally {
						Hooks.off("renderChatMessage", hookId);
						Hooks.off("renderChatMessage", brHookId);
						Hooks.off("updateChatMessage", monksId);
					}
					if (debugEnabled > 1)
						debug("Check Saves: ", this.saveRequests, this.saveTimeouts, this.saves);
					//@ts-ignore ._hooks not defined
					if (debugEnabled > 1)
						debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length);
					await this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
				}
				else { // has saves but we are not checking so do nothing with the damage
					await this.expireTargetEffects(["isAttacked"]);
					this.applicationTargets = this.failedSaves;
					return this.next(WORKFLOWSTATES.ROLLFINISHED);
				}
				return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
			case WORKFLOWSTATES.SAVESCOMPLETE:
				expireMyEffects.bind(this)(["1Action", "1Spell"]);
				return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
			case WORKFLOWSTATES.ALLROLLSCOMPLETE:
				if (this.damageDetail.length)
					processDamageRoll(this, this.damageDetail[0].type);
				if (debugEnabled > 1)
					debug("all rolls complete ", this.damageDetail);
				// expire effects on targeted tokens as required
				this.applicationTargets = new Set();
				if (this.saveItem.hasSave)
					this.applicationTargets = this.failedSaves;
				else if (this.item.hasAttack)
					this.applicationTargets = this.hitTargets;
				else
					this.applicationTargets = this.targets;
				return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
			case WORKFLOWSTATES.APPLYDYNAMICEFFECTS:
				expireMyEffects.bind(this)(["1Action", "1Spell"]);
				// Do special expiries
				const specialExpiries = [
					"isAttacked",
					"isDamaged",
					"1Reaction",
					"isSaveSuccess",
					"isSaveFailure",
					"isHit"
				];
				await this.expireTargetEffects(specialExpiries);
				if (configSettings.allowUseMacro && !this.onUseMacroCalled && this.item?.data.flags) {
					this.onUseMacroCalled = true;
					const results = await this.callMacros(this.item, getProperty(this.item, "data.flags.midi-qol-relics.onUseMacroName"), "OnUse");
					// Special check for return of {haltEffectsApplication: true} from item macro
					if (results.some(r => r?.haltEffectsApplication))
						return this.next(WORKFLOWSTATES.ROLLFINISHED);
				}
				// no item, not auto effects or not module skip
				if (!this.item || !configSettings.autoItemEffects)
					return this.next(WORKFLOWSTATES.ROLLFINISHED);
				this.applicationTargets = new Set();
				if (this.saveItem.hasSave)
					this.applicationTargets = this.failedSaves;
				else if (this.item.hasAttack)
					this.applicationTargets = this.hitTargets;
				else
					this.applicationTargets = this.targets;
				if (this.hasDAE) {
					await globalThis.DAE.doEffects(this.item, true, this.applicationTargets, { whisper: false, spellLevel: this.itemLevel, damageTotal: this.damageTotal, critical: this.isCritical, fumble: this.isFumble, itemCardId: this.itemCardId, tokenId: this.tokenId });
					this.removeEffectsButton();
				}
				if (installedModules.get("dfreds-convenient-effects") && this.item && configSettings.autoCEEffects && !getProperty(this.item.data.flags, "midi-qol-relics.noCE")) {
					const effectName = this.item.name;
					//@ts-ignore
					if (game.dfreds.effects.all.find(e => e.name === effectName)) {
						for (let token of this.applicationTargets) {
							//@ts-ignore
							if (game.dfreds.effectInterface) {
								//@ts-ignore
								game.dfreds.effectInterface.addEffect(effectName, token.actor.uuid, this.item?.uuid);
							}
							else {
								//@ts-ignore
								game.dfreds.effectHandler.addEffect({ effectName, actor: token.actor, origin: this.item?.uuid });
							}
						}
					}
				}
				return this.next(WORKFLOWSTATES.ROLLFINISHED);
			case WORKFLOWSTATES.ROLLFINISHED:
				if (debugEnabled > 0)
					warn('Inside workflow.rollFINISHED');
				// Add concentration data if required
				let hasConcentration = this.item?.data.data.components?.concentration || this.item?.data.data.activation?.condition?.includes("Concentration");
				hasConcentration = hasConcentration;
				if (this.item &&
					((this.item.hasAttack && this.hitTargets.size === 0) // did  not hit anyone
						|| (this.saveItem.hasSave && this.failedSaves.size === 0) // everyone saved
					))
					hasConcentration = false;
				const checkConcentration = configSettings.concentrationAutomation; // installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
				if (hasConcentration && checkConcentration) {
					await addConcentration({ workflow: this });
					if (this.actor && this.applicationTargets) {
						let targets = [];
						const selfTargetUuid = this.actor.uuid;
						let selfTargeted = false;
						for (let hit of this.applicationTargets) {
							const hitUuid = hit.document?.uuid ?? hit.uuid;
							const actorUuid = hit.actor.uuid;
							targets.push({ tokenUuid: hitUuid, actorUuid });
							if (selfTargetUuid === actorUuid)
								selfTargeted = true;
						}
						if (!selfTargeted)
							targets.push({ tokenUuid: this.tokenUuid, actorUuid: this.actor.uuid });
						let templates = this.templateUuid ? [this.templateUuid] : [];
						await this.actor.setFlag("midi-qol-relics", "concentration-data", { uuid: this.item.uuid, targets: targets, templates: templates });
					}
				}
				// Call onUseMacro if not already called
				if (configSettings.allowUseMacro && !this.onUseMacroCalled) {
					this.onUseMacroCalled = true;
					// A hack so that onUse macros only called once, but for most cases it is evaluated in APPLYDYNAMICEFFECTS
					await this.callMacros(this.item, getProperty(this.item, "data.flags.midi-qol-relics.onUseMacroName"), "OnUse");
				}
				// delete Workflow._workflows[this.itemId];
				Hooks.callAll("minor-qol.RollComplete", this); // just for the macro writers.
				Hooks.callAll("midi-qol-relics.RollComplete", this);
				if (autoRemoveTargets !== "none")
					setTimeout(untargetDeadTokens, 500); // delay to let the updates finish
				//@ts-ignore scrollBottom protected
				ui.chat?.scrollBottom();
				return undefined;
			default:
				error("invalid state in workflow");
				return undefined;
		}
	}
	checkAttackAdvantage() {
		const midiFlags = this.actor?.data.flags["midi-qol-relics"];
		const advantage = midiFlags?.advantage;
		const disadvantage = midiFlags?.disadvantage;
		const actType = this.item?.data.data?.actionType || "none";
		if (advantage) {
			const withAdvantage = advantage.all || advantage.attack?.all || (advantage.attack && advantage.attack[actType]);
			this.advantage = this.advantage || withAdvantage;
		}
		if (disadvantage) {
			const withDisadvantage = disadvantage.all || disadvantage.attack?.all || (disadvantage.attack && disadvantage.attack[actType]);
			this.disadvantage = this.disadvantage || withDisadvantage;
		}
		// TODO Hidden should check the target to see if they notice them?
		if (checkRule("invisAdvantage")) {
			const token = getCanvas().tokens?.get(this.tokenId);
			if (token) {
				const hidden = hasCondition(token, "hidden");
				const invisible = hasCondition(token, "invisible");
				this.advantage = this.advantage || hidden || invisible;
				if (hidden || invisible)
					log(`Advantage given to ${this.actor.name} due to hidden/invisible`);
			}
		}
		// Neaarby foe gives disadvantage on ranged attacks
		if (checkRule("nearbyFoe") && !getProperty(this.actor, "data.flags.midi-qol-relics.ignoreNearbyFoes") && (["rwak", "rsak", "rpak"].includes(actType) || this.item.data.data.properties?.thr)) { // Check if there is a foe near me when doing ranged attack
			let nearbyFoe = checkNearby(-1, getCanvas().tokens?.get(this.tokenId), configSettings.optionalRules.nearbyFoe);
			// special case check for thrown weapons within 5 feet (players will forget to set the property)
			if (this.item.data.data.properties?.thr) {
				const firstTarget = this.targets.values().next().value;
				const me = getCanvas().tokens?.get(this.tokenId);
				if (firstTarget && me && getDistance(me, firstTarget, false, false).distance <= configSettings.optionalRules.nearbyFoe)
					nearbyFoe = false;
			}
			if (nearbyFoe) {
				log(`Ranged attack by ${this.actor.name} at disadvantage due to neabye foe`);
				if (debugEnabled > 0)
					warn(`Ranged attack by ${this.actor.name} at disadvantage due to neabye foe`);
			}
			this.disadvantage = this.disadvantage || nearbyFoe;
		}
		this.checkAbilityAdvantage();
		this.checkTargetAdvantage();
	}
	processDamageEventOptions(event) {
		this.rollOptions.fastForward = this.workflowType === "TrapWorkflow" ? true : isAutoFastDamage();
		// if (!game.user.isGM && ["all", "damage"].includes(configSettings.autoFastForward)) this.rollOptions.fastForward = true;
		// if (game.user.isGM && configSettings.gmAutoFastForwardDamage) this.rollOptions.fastForward = true;
		// if we have an event here it means they clicked on the damage button?
		var critKey;
		var disKey;
		var advKey;
		var fastForwardKey;
		var noCritKey;
		if (configSettings.speedItemRolls && this.workflowType !== "BetterRollsWorkflow") {
			disKey = testKey(configSettings.keyMapping["RELICS.Disadvantage"], event);
			critKey = testKey(configSettings.keyMapping["RELICS.Critical"], event);
			advKey = testKey(configSettings.keyMapping["RELICS.Advantage"], event);
			this.rollOptions.versaKey = testKey(configSettings.keyMapping["RELICS.Versatile"], event);
			noCritKey = disKey;
			fastForwardKey = (advKey && disKey) || this.capsLock;
		}
		else { // use default behaviour
			critKey = event?.altKey || event?.metaKey;
			noCritKey = event?.ctrlKey;
			fastForwardKey = (critKey && noCritKey);
			this.rollOptions.versaKey = false;
		}
		this.rollOptions.critical = undefined;
		this.processCriticalFlags();
		if (fastForwardKey) {
			critKey = false;
			noCritKey = false;
		}
		if (this.noCritFlagSet || noCritKey)
			this.rollOptions.critical = false;
		else if (this.isCritical || critKey || this.critFlagSet) {
			this.rollOptions.critical = true;
			this.isCritical = this.rollOptions.critical;
		}
		this.rollOptions.fastForward = fastForwardKey ? !isAutoFastDamage() : isAutoFastDamage();
		this.rollOptions.fastForward = this.rollOptions.fastForward || critKey || noCritKey;
		// trap workflows are fastforward by default.
		if (this.workflowType === "TrapWorkflow")
			this.rollOptions.fastForward = true;
	}
	processCriticalFlags() {
		if (!this.actor)
			return; // in case a damage only workflow caused this.
		/*
		* flags.midi-qol-relics.critical.all
		* flags.midi-qol-relics.critical.mwak/rwak/msak/rsak/other
		* flags.midi-qol-relics.noCritical.all
		* flags.midi-qol-relics.noCritical.mwak/rwak/msak/rsak/other
		*/
		// check actor force critical/noCritical
		const criticalFlags = getProperty(this.actor.data, `flags.midi-qol-relics.critical`) ?? {};
		const noCriticalFlags = getProperty(this.actor.data, `flags.midi-qol-relics.noCritical`) ?? {};
		const attackType = this.item?.data.data.actionType;
		this.critFlagSet = false;
		this.noCritFlagSet = false;
		this.critFlagSet = criticalFlags.all || criticalFlags[attackType];
		this.noCritFlagSet = noCriticalFlags.all || noCriticalFlags[attackType];
		// check max roll
		const maxFlags = getProperty(this.actor.data, `flags.midi-qol-relics.maxDamage`) ?? {};
		this.rollOptions.maxDamage = (maxFlags.all || maxFlags[attackType]) ?? false;
		// check target critical/nocritical
		if (this.targets.size !== 1)
			return;
		// Change this to TokenDocument
		const firstTarget = this.targets.values().next().value;
		const grants = firstTarget.actor?.data.flags["midi-qol-relics"]?.grants?.critical ?? {};
		const fails = firstTarget.actor?.data.flags["midi-qol-relics"]?.fail?.critical ?? {};
		if (grants?.all || grants[attackType])
			this.critFlagSet = true;
		if (fails?.all || fails[attackType])
			this.noCritFlagSet = true;
	}
	checkAbilityAdvantage() {
		if (!["mwak", "rwak"].includes(this.item?.data.data.actionType))
			return;
		let ability = this.item?.data.data.ability;
		if (ability === "")
			ability = this.item?.data.data.properties?.fin ? "dex" : "str";
		this.advantage = this.advantage || getProperty(this.actor.data, `flags.midi-qol-relics.advantage.attack.${ability}`);
		this.disadvantage = this.disadvantage || getProperty(this.actor.data, `flags.midi-qol-relics.disadvantage.attack.${ability}`);
	}
	checkTargetAdvantage() {
		if (!this.item)
			return;
		if (!this.targets?.size)
			return;
		const actionType = this.item.data.data.actionType;
		const firstTarget = this.targets.values().next().value;
		if (checkRule("nearbyAllyRanged") && ["rwak", "rsak", "rpak"].includes(actionType)) {
			if (firstTarget.data.width * firstTarget.data.height < checkRule("nearbyAllyRanged")) {
				//TODO change this to TokenDocument
				const nearbyAlly = checkNearby(-1, firstTarget, configSettings.optionalRules.nearbyFoe); // targets near a friend that is not too big
				// TODO include thrown weapons in check
				if (nearbyAlly) {
					if (debugEnabled > 0)
						warn("ranged attack with disadvantage because target is near a friend");
					log(`Ranged attack by ${this.actor.name} at disadvantage due to nearby ally`);
				}
				this.disadvantage = this.disadvantage || nearbyAlly;
			}
		}
		const grants = firstTarget.actor?.data.flags["midi-qol-relics"]?.grants;
		if (!grants)
			return;
		if (!["rwak", "mwak", "rsak", "msak", "rpak", "mpak"].includes(actionType))
			return;
		const attackAdvantage = grants.advantage?.attack || {};
		const grantsAdvantage = grants.all || attackAdvantage.all || attackAdvantage[actionType];
		const attackDisadvantage = grants.disadvantage?.attack || {};
		const grantsDisadvantage = grants.all || attackDisadvantage.all || attackDisadvantage[actionType];
		this.advantage = this.advantage || grantsAdvantage;
		this.disadvantage = this.disadvantage || grantsDisadvantage;
	}
	async expireTargetEffects(expireList) {
		for (let target of this.targets) {
			const expiredEffects = target.actor?.effects?.filter(ef => {
				const wasAttacked = this.item?.hasAttack;
				const wasDamaged = itemHasDamage(this.item) && this.hitTargets?.has(target); //TODO this test will fail for damage only workflows - need to check the damage rolled instaed
				const wasHit = this.hitTargets?.has(target);
				const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
				if (!specialDuration)
					return false;
				//TODO this is going to grab all the special damage types as well which is no good.
				if ((expireList.includes("isAttacked") && specialDuration.includes("isAttacked") && wasAttacked)
					|| (expireList.includes("isDamaged") && specialDuration.includes("isDamaged") && wasDamaged)
					|| (expireList.includes("isHit") && specialDuration.includes("isHit") && wasHit))
					return true;
				if ((expireList.includes("1Reaction") && specialDuration.includes("1Reaction")) && target.actor?.uuid !== this.actor.uuid)
					return true;
				for (let dt of this.damageDetail) {
					if (expireList.includes(`isDamaged`) && wasDamaged && specialDuration.includes(`isDamaged.${dt.type}`))
						return true;
				}
				if (!this.item)
					return false;
				if (this.saveItem.hasSave && expireList.includes("isSaveSuccess") && specialDuration.includes(`isSaveSuccess`) && this.saves.has(target))
					return true;
				if (this.saveItem.hasSave && expireList.includes("isSaveFailure") && specialDuration.includes(`isSaveFailure`) && !this.saves.has(target))
					return true;
				const abl = this.item?.data.data.save?.ability;
				if (this.saveItem.hasSave && expireList.includes(`isSaveSuccess`) && specialDuration.includes(`isSaveSuccess.${abl}`) && this.saves.has(target))
					return true;
				if (this.saveItem.hasSave && expireList.includes(`isSaveFailure`) && specialDuration.includes(`isSaveFailure.${abl}`) && !this.saves.has(target))
					return true;
				return false;
			}).map(ef => ef.id);
			if (expiredEffects?.length ?? 0 > 0) {
				await socketlibSocket.executeAsGM("removeEffects", {
					actorUuid: target.actor?.uuid,
					effects: expiredEffects,
				});
			}
		}
	}
	async rollBonusDamage(damageBonusMacro) {
		let formula = "";
		var flavor = "";
		var extraDamages = await this.callMacros(this.item, damageBonusMacro, "DamageBonus");
		for (let extraDamage of extraDamages) {
			if (extraDamage?.damageRoll) {
				formula += (formula ? "+" : "") + extraDamage.damageRoll;
				if (extraDamage.flavor) {
					flavor = `${flavor}${flavor !== "" ? "<br>" : ""}${extraDamage.flavor}`;
				}
				// flavor = extraDamage.flavor ? extraDamage.flavor : flavor;
			}
		}
		if (formula === "")
			return;
		try {
			const roll = await (new Roll(formula, this.actor.getRollData()).evaluate({ async: true }));
			this.bonusDamageRoll = roll;
			this.bonusDamageTotal = roll.total;
			this.bonusDamageHTML = await roll.render();
			this.bonusDamageFlavor = flavor ?? "";
			this.bonusDamageDetail = createDamageList(this.bonusDamageRoll, null, this.defaultDamageType);
		}
		catch (err) {
			console.warn(`midi-qol-relics | error in evaluating${formula} in bonus damage`, err);
			this.bonusDamageRoll = null;
			this.bonusDamageDetail = [];
		}
		if (this.bonusDamageRoll !== null) {
			//@ts-ignore game.dice3d
			const dice3dActive = game.dice3d && (game.settings.get("dice-so-nice", "settings")?.enabled);
			if (dice3dActive && configSettings.mergeCard) {
				let whisperIds = [];
				const rollMode = game.settings.get("core", "rollMode");
				if ((configSettings.hideRollDetails !== "none" && game.user?.isGM) || rollMode === "blindroll") {
					whisperIds = ChatMessage.getWhisperRecipients("GM");
				}
				else if (game.user && (rollMode === "selfroll" || rollMode === "gmroll")) {
					whisperIds = ChatMessage.getWhisperRecipients("GM").concat(game.user);
				}
				else
					whisperIds = ChatMessage.getWhisperRecipients("GM");
				//@ts-ignore game.dice3d
				await game.dice3d.showForRoll(this.bonusDamageRoll, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM);
			}
		}
		return;
	}
	async callMacros(item, macros, tag) {
		if (!macros)
			return [];
		let values = [];
		let results;
		const macroNames = macros.split(",");
		let targets = [];
		let targetUuids = [];
		let failedSaves = [];
		let failedSaveUuids = [];
		let hitTargets = [];
		let hitTargetUuids = [];
		let saves = [];
		let saveUuids = [];
		let superSavers = [];
		let superSaverUuids = [];
		for (let target of this.targets) {
			targets.push(target.document ?? target);
			targetUuids.push(target.document?.uuid ?? target.uuid);
		}
		for (let save of this.saves) {
			saves.push(save.document ?? save);
			saveUuids.push(save.document?.uuid ?? save.uuid);
		}
		for (let hit of this.hitTargets) {
			hitTargets.push(hit.document ?? hit);
			hitTargetUuids.push(hit.document?.uuid ?? hit.uuid);
		}
		for (let failed of this.failedSaves) {
			failedSaves.push(failed.document ?? failed);
			failedSaveUuids.push(failed.document?.uuid ?? failed.uuid);
		}
		for (let save of this.superSavers) {
			superSavers.push(save.document ?? save);
			superSaverUuids.push(save.document?.uuid ?? save.uuid);
		}
		;
		const macroData = {
			actor: this.actor.data,
			actorUuid: this.actor.uuid,
			tokenId: this.tokenId,
			tokenUuid: this.tokenUuid,
			itemUuid: this.item?.uuid,
			item: item?.data.toObject(false),
			targets,
			targetUuids,
			hitTargets,
			hitTargetUuids,
			saves,
			saveUuids,
			superSavers,
			superSaverUuids,
			failedSaves,
			failedSaveUuids,
			damageRoll: this.damageRoll,
			attackRoll: this.attackRoll,
			diceRoll: this.diceRoll,
			attackD20: this.diceRoll,
			attackTotal: this.attackTotal,
			itemCardId: this.itemCardId,
			isCritical: this.rollOptions.critical || this.isCritical,
			isFumble: this.isFumble,
			spellLevel: this.itemLevel,
			powerLevel: this.itemLevel,
			damageTotal: this.damageTotal,
			damageDetail: this.damageDetail,
			damageList: this.damageList,
			otherDamageTotal: this.otherDamageTotal,
			otherDamageDetail: this.otherDamageDetail,
			otherDamageList: this.otherDamageList,
			bonusDamageTotal: this.bonusDamageTotal,
			bonusDamgeDetail: this.bonusDamageDetail,
			bonusDamageRoll: this.bonusDamageRoll,
			bonusDamageFlavor: this.bonusDamageFlavor,
			bonusDamageHTML: this.bonusDamageHTML,
			rollOptions: this.rollOptions,
			advantage: this.advantage,
			disadvantage: this.disadvantage,
			event: this.event,
			id: this.item.id,
			uuid: this.uuid,
			rollData: this.actor.getRollData(),
			tag,
			concentrationData: getProperty(this.actor.data.flags, "midi-qol-relics.concentration-data"),
			templateId: this.templateId,
			templateUuid: this.templateUuid
		};
		if (debugEnabled > 0)
			warn("macro data ", macroData);
		for (let macro of macroNames) {
			values.push(this.callMacro(item, macro, macroData));
		}
		results = await Promise.all(values);
		return results;
	}
	async callMacro(item, macroName, macroData) {
		const name = macroName?.trim();
		// var item;
		if (!name)
			return undefined;
		try {
			if (name.startsWith("ItemMacro")) { // special short circuit eval for itemMacro since it can be execute as GM
				var itemMacro;
				//  item = this.item;
				if (name === "ItemMacro") {
					itemMacro = getProperty(item.data.flags, "itemacro.macro");
					macroData.sourceItemUuid = item?.uuid;
				}
				else {
					const parts = name.split(".");
					const itemName = parts.slice(1).join(".");
					;
					item = this.actor.items.find(i => i.name === itemName && getProperty(i.data.flags, "itemacro.macro"));
					if (item) {
						itemMacro = getProperty(item.data.flags, "itemacro.macro");
						macroData.sourceItemUuid = item.uuid;
					}
					else
						return {};
				}
				const speaker = this.speaker;
				const actor = this.actor;
				const token = getCanvas().tokens?.get(this.tokenId);
				const character = game.user?.character;
				const args = [macroData];
				if (!itemMacro?.data?.command) {
					if (debugEnabled > 0)
						warn(`could not find item macro ${name}`);
					return {};
				}
				return (new Function(`"use strict";
			return (async function ({speaker, actor, token, character, item, args}={}) {
				${itemMacro.data.command}
				});`))().call(this, { speaker, actor, token, character, item, args });
			}
			else {
				const macroCommand = game.macros?.getName(name);
				if (macroCommand) {
					return macroCommand.execute(macroData);
				}
			}
		}
		catch (err) {
			ui.notifications?.error(`There was an error in your macro. See the console (F12) for details`);
			error("Error evaluating macro ", err);
		}
		return {};
	}
	async removeEffectsButton() {
		if (!this.itemCardId)
			return;
		const chatMessage = game.messages?.get(this.itemCardId);
		if (chatMessage) {
			const buttonRe = /<button data-action="applyEffects">[^<]*<\/button>/;
			let content = duplicate(chatMessage.data.content);
			content = content?.replace(buttonRe, "");
			await chatMessage.update({ content });
		}
	}
	async displayAttackRoll(doMerge) {
		const chatMessage = game.messages?.get(this.itemCardId ?? "");
		//@ts-ignore content not definted
		let content = (chatMessage && duplicate(chatMessage.data.content)) || "";
		var rollSound = configSettings.diceSound;
		const flags = chatMessage?.data.flags || {};
		let newFlags = {};
		if (content && getRemoveAttackButtons()) {
			const searchRe = /<button data-action="attack">[^<]*<\/button>/;
			content = content.replace(searchRe, "");
		}
		if (doMerge && chatMessage) { // display the attack roll
			//let searchRe = /<div class="midi-qol-relics-attack-roll">.*?<\/div>/;
			let searchRe = /<div class="midi-qol-relics-attack-roll">[\s\S]*?<div class="end-midi-qol-relics-attack-roll">/;
			let options = this.attackRoll?.terms[0].options;
			this.advantage = options.advantage;
			this.disadvantage = options.disadvantage;
			const attackString = this.advantage ? i18n("RELICS.Advantage") : this.disadvantage ? i18n("RELICS.Disadvantage") : i18n("RELICS.Attack");
			let replaceString = `<div class="midi-qol-relics-attack-roll"><div style="text-align:center" >${attackString}</div>${this.attackRollHTML}<div class="end-midi-qol-relics-attack-roll">`;
			content = content.replace(searchRe, replaceString);
			if (this.attackRoll?.dice.length) {
				const d = this.attackRoll.dice[0]; // should be a dice term but DiceTerm.options not defined
				const isD20 = (d.faces === 20);
				if (isD20) {
					// Highlight successes and failures
					if (isNewerVersion("1.5.0", game.system.data.version)) {
						if ((d.options.critical && (d.total >= (getProperty(this, "item.data.flags.midi-qol-relics.criticalThreshold") ?? d.options.critical)) || this.isCritical)) {
							content = content.replace('dice-total', 'dice-total critical');
						}
					}
					else if ((d.options.critical && d.total >= d.options.critical) || this.isCritical) {
						content = content.replace('dice-total', 'dice-total critical');
					}
					else if ((d.options.fumble && d.total <= d.options.fumble) || this.isFumble) {
						content = content.replace('dice-total', 'dice-total fumble');
					}
					else if (d.options.target) {
						if ((this.attackRoll?.total || 0) >= d.options.target)
							content = content.replace('dice-total', 'dice-total success');
						else
							content = content.replace('dice-total', 'dice-total failure');
					}
					this.d20AttackRoll = d.total;
				}
			}
			//@ts-ignore game.dice3d
			if (!!!game.dice3d?.messageHookDisabled)
				this.hideTags = [".midi-qol-relics-attack-roll", "midi-qol-relics-damage-roll"];
			if (debugEnabled > 0)
				warn("Display attack roll ", this.attackCardData, this.attackRoll);
			newFlags = mergeObject(flags, {
				"midi-qol-relics": {
					type: MESSAGETYPES.ATTACK,
					waitForDiceSoNice: true,
					hideTag: this.hideTags,
					playSound: true,
					roll: this.attackRoll?.roll,
					displayId: this.displayId,
					isCritical: this.isCritical,
					isFumble: this.isFumble,
					isHit: this.hitTargets.size > 0,
					sound: rollSound,
					d20AttackRoll: this.d20AttackRoll
				}
			}, { overwrite: true, inplace: false });
		}
		await chatMessage?.update({ content, flags: newFlags });
	}
	get damageFlavor() {
		if (game.system.id === "relics")
			//@ts-ignore CONFIG.RELICS
			allDamageTypes = mergeObject(CONFIG.RELICS.damageTypes, CONFIG.RELICS.healingTypes, { inplace: false });
		else
			//@ts-ignore CONFIG.SW5E
			allDamageTypes = mergeObject(CONFIG.SW5E.damageTypes, CONFIG.SW5E.healingTypes, { inplace: false });
		return `(${this.item?.data.data.damage.parts
			.map(a => (allDamageTypes[a[1]] || allDamageTypes[this.defaultDamageType ?? ""] || MQdefaultDamageType)).join(",")
			|| this.defaultDamageType || MQdefaultDamageType})`;
	}
	async displayDamageRoll(doMerge) {
		let chatMessage = game.messages?.get(this.itemCardId ?? "");
		let content = (chatMessage && duplicate(chatMessage.data.content)) ?? "";
		// TODO work out what to do if we are a damage only workflow and betters rolls is active - display update wont work.
		if (getRemoveDamageButtons() || this.workflowType !== "Workflow") {
			const versatileRe = /<button data-action="versatile">[^<]*<\/button>/;
			const damageRe = /<button data-action="damage">[^<]*<\/button>/;
			const formulaRe = /<button data-action="formula">[^<]*<\/button>/;
			content = content?.replace(damageRe, "");
			content = content?.replace(formulaRe, "");
			content = content?.replace(versatileRe, "<div></div>");
		}
		var rollSound = configSettings.diceSound;
		var newFlags = chatMessage?.data.flags || {};
		if (doMerge && chatMessage) {
			if (this.damageRollHTML) {
				const dmgHeader = configSettings.mergeCardCondensed ? this.damageFlavor : (this.flavor ?? this.damageFlavor);
				if (!this.useOther) {
					const searchRe = /<div class="midi-qol-relics-damage-roll">[\s\S]*?<div class="end-midi-qol-relics-damage-roll">/;
					const replaceString = `<div class="midi-qol-relics-damage-roll"><div style="text-align:center">${dmgHeader}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-relics-damage-roll">`;
					content = content.replace(searchRe, replaceString);
				}
				else {
					const otherSearchRe = /<div class="midi-qol-relics-other-roll">[\s\S]*?<div class="end-midi-qol-relics-other-roll">/;
					const otherReplaceString = `<div class="midi-qol-relics-other-roll"><div style="text-align:center">${dmgHeader}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-relics-other-roll">`;
					content = content.replace(otherSearchRe, otherReplaceString);
				}
				if (this.otherDamageHTML) {
					const otherSearchRe = /<div class="midi-qol-relics-other-roll">[\s\S]*?<div class="end-midi-qol-relics-other-roll">/;
					const otherReplaceString = `<div class="midi-qol-relics-other-roll"><div style="text-align:center" >${this.item?.name ?? this.damageFlavor}${this.otherDamageHTML || ""}</div><div class="end-midi-qol-relics-other-roll">`;
					content = content.replace(otherSearchRe, otherReplaceString);
				}
				if (this.bonusDamageRoll) {
					const bonusSearchRe = /<div class="midi-qol-relics-bonus-roll">[\s\S]*?<div class="end-midi-qol-relics-bonus-roll">/;
					const bonusReplaceString = `<div class="midi-qol-relics-bonus-roll"><div style="text-align:center" >${this.bonusDamageFlavor}${this.bonusDamageHTML || ""}</div><div class="end-midi-qol-relics-bonus-roll">`;
					content = content.replace(bonusSearchRe, bonusReplaceString);
				}
			}
			else {
				if (this.otherDamageHTML) {
					const otherSearchRe = /<div class="midi-qol-relics-damage-roll">[\s\S]*?<div class="end-midi-qol-relics-damage-roll">/;
					const otherReplaceString = `<div class="midi-qol-relics-damage-roll"><div style="text-align:center"></div>${this.otherDamageHTML || ""}<div class="end-midi-qol-relics-damage-roll">`;
					content = content.replace(otherSearchRe, otherReplaceString);
				}
				if (this.bonusDamageRoll) {
					const bonusSearchRe = /<div class="midi-qol-relics-bonus-roll">[\s\S]*?<div class="end-midi-qol-relics-bonus-roll">/;
					const bonusReplaceString = `<div class="midi-qol-relics-bonus-roll"><div style="text-align:center" >${this.bonusDamageeFlavor}${this.bonusDamageHTML || ""}</div><div class="end-midi-qol-relics-bonus-roll">`;
					content = content.replace(bonusSearchRe, bonusReplaceString);
				}
			}
			//@ts-ignore game.dice3d
			if (!!!game.dice3d?.messageHookDisabled) {
				if (getAutoRollDamage() === "none" || !isAutoFastDamage()) {
					// not auto rolling damage so hits will have been long displayed
					this.hideTags = [".midi-qol-relics-damage-roll", ".midi-qol-relics.other-roll"];
				}
				else
					this.hideTags.push(".midi-qol-relics-damage-roll", ".midi-qol-relics.other-roll");
			}
			this.displayId = randomID();
			newFlags = mergeObject(newFlags, {
				"midi-qol-relics": {
					waitForDiceSoNice: true,
					type: MESSAGETYPES.DAMAGE,
					playSound: false,
					sound: rollSound,
					// roll: this.damageCardData.roll,
					roll: this.damageRoll?.roll,
					damageDetail: this.damageDetail,
					damageTotal: this.damageTotal,
					otherDamageDetail: this.otherDamageDetail,
					otherDamageTotal: this.otherDamageTotal,
					bonusDamageDetail: this.bonusDamageDetail,
					bonusDamageTotal: this.bonusDamageTotal,
					hideTag: this.hideTags,
					displayId: this.displayId
				}
			}, { overwrite: true, inplace: false });
		}
		if (!doMerge && this.bonusDamageRoll) {
			const messageData = {
				flavor: this.bonusDamageFlavor,
				speaker: this.speaker
			};
			setProperty(messageData, "flags.relics.roll.type", "damage");
			setProperty(messageData, "flags.sw5e.roll.type", "damage");
			this.bonusDamageRoll.toMessage(messageData);
		}
		await chatMessage?.update({ "content": content, flags: newFlags });
	}
	async displayHits(whisper = false, doMerge) {
		const templateData = {
			attackType: this.item?.name ?? "",
			attackTotal: this.attackTotal,
			oneCard: configSettings.mergeCard,
			hits: this.hitDisplayData,
			isCritical: this.isCritical,
			isGM: game.user?.isGM,
		};
		if (debugEnabled > 0)
			warn("displayHits ", templateData, whisper, doMerge);
		const hitContent = await renderTemplate("modules/midi-qol-relics/templates/hits.html", templateData) || "No Targets";
		const chatMessage = game.messages?.get(this.itemCardId ?? "");
		if (doMerge && chatMessage) {
			var content = (chatMessage && duplicate(chatMessage.data.content)) ?? "";
			var searchString;
			var replaceString;
			//@ts-ignore game.dice3d
			if (!!!game.dice3d?.messageHookDisabled)
				this.hideTags.push(".midi-qol-relics-hits-display");
			// TODO test if we are doing better rolls rolls for the new chat cards and damageonlyworkflow
			switch (this.workflowType) {
				case "BetterRollsWorkflow":
					// TODO: Move to a place that can also catch a better rolls being edited
					// The BetterRollsWorkflow class should in general be handling this
					const roll = this.roll;
					const html = `<div class="midi-qol-relics-hits-display">${hitContent}</div>`;
					await roll.entries.push({ type: "raw", html, source: "midi" });
					break;
				case "Workflow":
				case "TrapWorkflow":
				case "DamageOnlyWorkflow":
					searchString = /<div class="midi-qol-relics-hits-display">[\s\S]*?<div class="end-midi-qol-relics-hits-display">/;
					replaceString = `<div class="midi-qol-relics-hits-display">${hitContent}<div class="end-midi-qol-relics-hits-display">`;
					content = content.replace(searchString, replaceString);
					await chatMessage.update({
						"content": content,
						timestamp: new Date().getTime(),
						"flags.midi-qol-relics.playSound": this.isCritical || this.isFumble,
						"flags.midi-qol-relics.type": MESSAGETYPES.HITS,
						type: CONST.CHAT_MESSAGE_TYPES.OTHER,
						"flags.midi-qol-relics.waitForDiceSoNice": true,
						"flags.midi-qol-relics.hideTag": this.hideTags,
						"flags.midi-qol-relics.displayId": this.displayId,
						"flags.midi-qol-relics.sound": this.isCritical ? configSettings.criticalSound : configSettings.fumbleSound
					});
					break;
			}
		}
		else {
			let speaker = duplicate(this.speaker);
			speaker.alias = (configSettings.useTokenNames && speaker.token) ? getCanvas().tokens?.get(speaker.token)?.name : speaker.alias;
			speaker.scene = canvas?.scene?.id;
			if ((await validTargetTokens(game.user?.targets ?? new Set())).size > 0) {
				let chatData = {
					messageData: {
						speaker,
						user: game.user?.id
					},
					content: hitContent || "No Targets",
					type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				};
				const rollMode = game.settings.get("core", "rollMode");
				if (whisper || rollMode !== "roll") {
					chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u => u.id);
					if (!game.user?.isGM && rollMode !== "blindroll")
						chatData.whisper.push(game.user?.id); // message is going to be created by GM add self
					chatData.messageData.user = ChatMessage.getWhisperRecipients("GM").find(u => u.active)?.id;
					if (rollMode === "blindroll") {
						chatData["blind"] = true;
					}
					if (debugEnabled > 1)
						debug("Trying to whisper message", chatData);
				}
				if (this.workflowType !== "BetterRollsWorkflow") {
					setProperty(chatData, "flags.midi-qol-relics.waitForDiceSoNice", true);
					if (!whisper)
						setProperty(chatData, "flags.midi-qol-relics.hideTag", "midi-qol-relics-hits-display");
				}
				else { // better rolls workflow
					setProperty(chatData, "flags.midi-qol-relics.waitForDiceSoNice", false);
					// setProperty(chatData, "flags.midi-qol-relics.hideTag", "")
				}
				if (game.users?.get(chatData.messageData.user)?.isGM)
					socketlibSocket.executeAsGM("createChatMessage", { chatData });
				else
					ChatMessage.create(chatData);
			}
		}
	}
	async displaySaves(whisper, doMerge) {
		let chatData = {};
		const noDamage = getSaveMultiplierForItem(this.saveItem) === 0 ? i18n("midi-qol-relics.noDamage") : "";
		let templateData = {
			noDamage,
			saves: this.saveDisplayData,
			// TODO force roll damage
		};
		const chatMessage = game.messages?.get(this.itemCardId ?? "");
		const saveContent = await renderTemplate("modules/midi-qol-relics/templates/saves.html", templateData);
		if (doMerge && chatMessage) {
			let content = duplicate(chatMessage.data.content);
			var searchString;
			var replaceString;
			let saveType = "midi-qol-relics.saving-throws";
			if (this.item.data.data.type === "abil")
				saveType = "midi-qol-relics.ability-checks";
			const saveHTML = `<div class="midi-qol-relics-nobox midi-qol-relics-bigger-text">${this.saveDisplayFlavor}</div>`;
			//@ts-ignore game.dice3d
			if (!!!game.dice3d?.messageHookDisabled)
				this.hideTags = [".midi-qol-relics-saves-display"];
			switch (this.workflowType) {
				case "BetterRollsWorkflow":
					const html = `<div data-item-id="${this.item.id}"></div><div class="midi-qol-relics-saves-display">${saveHTML}${saveContent}</div>`;
					const roll = this.roll;
					await roll.entries.push({ type: "raw", html, source: "midi" });
					return;
					break;
				case "Workflow":
				case "TrapWorkflow":
					searchString = /<div class="midi-qol-relics-saves-display">[\s\S]*?<div class="end-midi-qol-relics-saves-display">/;
					replaceString = `<div class="midi-qol-relics-saves-display"><div data-item-id="${this.item.id}">${saveHTML}${saveContent}</div><div class="end-midi-qol-relics-saves-display">`;
					content = content.replace(searchString, replaceString);
					await chatMessage.update({
						content,
						type: CONST.CHAT_MESSAGE_TYPES.OTHER,
						"flags.midi-qol-relics.type": MESSAGETYPES.SAVES,
						"flags.midi-qol-relics.hideTag": this.hideTags
					});
					chatMessage.data.content = content;
			}
		}
		else {
			const gmUser = game.users?.find((u) => u.isGM && u.active);
			//@ts-ignore _getSpeakerFromuser
			let speaker = ChatMessage._getSpeakerFromUser({ user: gmUser });
			const waitForDSN = configSettings.playerRollSaves !== "none" && this.saveDisplayData.some(data => data.isPC);
			speaker.scene = canvas?.scene?.id ?? "";
			chatData = {
				messageData: {
					user: game.user?.id,
					speaker
				},
				content: `<div data-item-id="${this.item.id}"></div> ${saveContent}`,
				flavor: `<h4>${this.saveDisplayFlavor}</h4>`,
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				flags: { "midi-qol-relics": { type: MESSAGETYPES.SAVES, waitForDiceSoNice: waitForDSN } }
			};
			const rollMode = game.settings.get("core", "rollMode");
			if (configSettings.autoCheckSaves === "whisper" || whisper || rollMode !== "roll") {
				chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
				chatData.messageData.user = game.user?.id; // ChatMessage.getWhisperRecipients("GM").find(u => u.active);
				if (rollMode === "blindroll") {
					chatData["blind"] = true;
				}
				if (debugEnabled > 1)
					debug("Trying to whisper message", chatData);
			}
			await ChatMessage.create(chatData);
			// Non GMS don't have permission to create the message so hand it off to a gm client
			// await socketlibSocket.executeAsGM("createChatMessage", {chatData});
		}
		;
	}
	/**
	* update this.saves to be a Set of successful saves from the set of tokens this.hitTargets and failed saves to be the complement
	*/
	async checkSaves(whisper = false) {
		this.saves = new Set();
		this.failedSaves = this.item?.hasAttack ? new Set(this.hitTargets) : new Set(this.targets);
		this.advantageSaves = new Set();
		this.disadvantageSaves = new Set();
		this.saveDisplayData = [];
		if (debugEnabled > 1)
			debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`);
		if (this.hitTargets.size <= 0) {
			this.saveDisplayFlavor = `<span>${i18n("midi-qol-relics.noSaveTargets")}</span>`;
			return;
		}
		let rollDC = this.saveItem.data.data.save.DC;
		if (this.saveItem.getSaveDC) {
			rollDC = this.saveItem.getSaveDC(); // TODO see if I need to do this for ammo as well
		}
		let rollAbility = this.saveItem.data.data.save.ability;
		let promises = [];
		//@ts-ignore actor.rollAbilitySave
		var rollAction = CONFIG.Actor.documentClass.prototype.rollAbilitySave;
		var rollType = "save";
		if (this.saveItem.data.data.actionType === "abil") {
			rollType = "abil";
			//@ts-ignore actor.rollAbilityTest
			rollAction = CONFIG.Actor.documentClass.prototype.rollAbilityTest;
		}
		// make sure saving throws are renabled.
		const playerMonksTB = installedModules.get("monks-tokenbar") && configSettings.playerRollSaves === "mtb";
		let monkRequests = [];
		let showRoll = configSettings.autoCheckSaves === "allShow";
		try {
			for (let target of this.hitTargets) {
				if (!target.actor)
					continue; // no actor means multi levels or bugged actor - but we won't roll a save
				let advantage = undefined;
				// If spell, check for magic resistance
				if (this.item.data.type === "spell") {
					// check magic resistance in custom damage reduction traits
					//@ts-ignore traits
					advantage = (target?.actor?.data.data.traits?.dr?.custom || "").includes(i18n("midi-qol-relics.MagicResistant"));
					// check magic resistance as a feature (based on the SRD name as provided by the Relics system)
					advantage = advantage || target?.actor?.data.items.find(a => a.type === "feat" && a.name === i18n("midi-qol-relics.MagicResistanceFeat")) !== undefined;
					if (advantage)
						this.advantageSaves.add(target);
					else
						advantage = undefined;
					if (debugEnabled > 1)
						debug(`${target.actor.name} resistant to magic : ${advantage}`);
				}
				if (this.saveItem.data.flags["midi-qol-relics"]?.isConcentrationCheck) {
					if (getProperty(target.actor.data.flags, "midi-qol-relics.advantage.concentration")) {
						advantage = true;
						this.advantageSaves.add(target);
					}
					if (getProperty(target.actor.data.flags, "midi-qol-relics.disadvantage.concentration")) {
						advantage = false;
						this.disadvantageSaves.add(target);
					}
				}
				var player = playerFor(target);
				if (!player)
					player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
				let promptPlayer = (!player?.isGM && configSettings.playerRollSaves !== "none");
				let GMprompt;
				let gmMonksTB;
				if (player?.isGM) {
					const monksTBSetting = target.document.isLinked ? configSettings.rollNPCLinkedSaves === "mtb" : configSettings.rollNPCSaves === "mtb";
					gmMonksTB = installedModules.get("monks-tokenbar") && monksTBSetting;
					GMprompt = (target.document.isLinked ? configSettings.rollNPCLinkedSaves : configSettings.rollNPCSaves);
					promptPlayer = GMprompt !== "auto";
				}
				if ((!player?.isGM && playerMonksTB) || (player?.isGM && gmMonksTB)) {
					promises.push(new Promise((resolve) => {
						let requestId = target.id;
						this.saveRequests[requestId] = resolve;
					}));
					// record the targes to save.
					monkRequests.push(target);
				}
				else if (promptPlayer && player?.active) {
					//@ts-ignore CONFIG.RELICS
					if (debugEnabled > 0)
						warn(`Player ${player?.name} controls actor ${target.actor.name} - requesting ${CONFIG.RELICS.abilities[this.saveItem.data.data.save.ability]} save`);
					promises.push(new Promise((resolve) => {
						let requestId = target.actor?.id ?? randomID();
						const playerId = player?.id;
						if (["letme", "letmeQuery"].includes(configSettings.playerRollSaves) && installedModules.get("lmrtfy"))
							requestId = randomID();
						if (["letme", "letmeQuery"].includes(GMprompt) && installedModules.get("lmrtfy"))
							requestId = randomID();
						this.saveRequests[requestId] = resolve;
						requestPCSave(this.saveItem.data.data.save.ability, rollType, player, target.actor, advantage, this.saveItem.name, rollDC, requestId, GMprompt);
						// set a timeout for taking over the roll
						if (configSettings.playerSaveTimeout > 0) {
							this.saveTimeouts[requestId] = setTimeout(async () => {
								if (this.saveRequests[requestId]) {
									delete this.saveRequests[requestId];
									delete this.saveTimeouts[requestId];
									let result;
									if (!game.user?.isGM && configSettings.autoCheckSaves === "allShow") {
										// non-gm users don't have permission to create chat cards impersonating the GM so hand the role to a GM client
										result = await socketlibSocket.executeAsGM("rollAbility", {
											targetUuid: target.actor?.uuid ?? "",
											request: rollType,
											ability: this.saveItem.data.data.save.ability,
											showRoll,
											options: { messageData: { user: playerId }, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true },
										});
									}
									else {
										result = await rollAction.bind(target.actor)(this.saveItem.data.data.save.ability, { messageData: { user: playerId }, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true });
									}
									resolve(result);
								}
							}, (configSettings.playerSaveTimeout || 1) * 1000);
						}
					}));
				}
				else { // GM to roll save
					// Find a player owner for the roll if possible
					let owner = playerFor(target);
					if (owner)
						showRoll = true; // Always show player save rolls
					// If no player owns the token, find an active GM
					if (!owner)
						owner = game.users?.find((u) => u.isGM && u.active);
					// Fall back to rolling as the current user
					if (!owner)
						owner = game.user ?? undefined;
					promises.push(socketlibSocket.executeAsUser("rollAbility", owner?.id, {
						targetUuid: target.actor.uuid,
						request: rollType,
						ability: this.saveItem.data.data.save.ability,
						showRoll,
						options: { messageData: { user: owner?.id }, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true },
					}));
				}
			}
		}
		catch (err) {
			console.warn(err);
		}
		finally {
		}
		if (monkRequests.length > 0) {
			socketlibSocket.executeAsGM("monksTokenBarSaves", {
				tokens: monkRequests.map(t => t.document.uuid),
				request: `save:${this.saveItem.data.data.save.ability}`,
				silent: true,
				rollMode: "gmroll"
			});
		}
		;
		if (debugEnabled > 1)
			debug("check saves: requests are ", this.saveRequests);
		var results = await Promise.all(promises);
		this.saveResults = results;
		let i = 0;
		for (let target of this.hitTargets) {
			if (!target.actor)
				continue; // these were skipped when doing the rolls so they can be skipped now
			if (!results[i])
				error("Token ", target, "could not roll save/check assuming 0");
			const result = results[i];
			let rollTotal = results[i]?.total || 0;
			let rollDetail = results[i];
			if (result?.terms[0]?.options?.advantage)
				this.advantageSaves.add(target);
			if (result?.terms[0]?.options?.disadvantage)
				this.disadvantageSaves.add(target);
			let isFumble = false;
			let isCritical = false;
			if (rollDetail.terms && checkRule("criticalSaves") && rollDetail.terms[0] instanceof DiceTerm) { // normal d20 roll/lmrtfy/monks roll
				const dterm = rollDetail.terms[0];
				//@ts-ignore
				isFumble = dterm.total <= (dterm.options?.fumble ?? 1);
				//@ts-ignore
				isCritical = dterm.total >= (dterm.options?.critical ?? 20);
			}
			else if (result.isBR && checkRule("criticalSaves"))
				isCritical = result.isCritical;
			let saved = (isCritical || rollTotal >= rollDC) && !isFumble;
			if (this.checkSuperSaver(target.actor, this.saveItem.data.data.save.ability))
				this.superSavers.add(target);
			if (this.item.data.flags["midi-qol-relics"]?.isConcentrationCheck) {
				const checkBonus = getProperty(target, "actor.data.flags.midi-qol-relics.concentrationSaveBonus");
				if (checkBonus) {
					const rollBonus = (await new Roll(checkBonus, target.actor?.getRollData()).evaluate({ async: true })).total;
					rollTotal += rollBonus;
					rollDetail = (await new Roll(`${rollDetail.result} + ${rollBonus}`).evaluate({ async: true }));
					saved = (isCritical || rollTotal >= rollDC) && !isFumble; //TODO see if bonus can change critical/fumble
				}
			}
			if (saved) {
				this.saves.add(target);
				this.failedSaves.delete(target);
			}
			if (game.user?.isGM)
				log(`Ability save/check: ${target.name} rolled ${rollTotal} vs ${rollAbility} DC ${rollDC}`);
			let saveString = i18n(saved ? "midi-qol-relics.save-success" : "midi-qol-relics.save-failure");
			let adv = this.advantageSaves.has(target) ? `(${i18n("RELICS.Advantage")})` : "";
			if (this.disadvantageSaves.has(target))
				adv = `(${i18n("RELICS.Disadvantage")})`;
			if (game.system.id === "sw5e") {
				adv = this.advantageSaves.has(target) ? `(${i18n("SW5E.Advantage")})` : "";
				if (this.disadvantageSaves.has(target))
					adv = `(${i18n("SW5E.Disadvantage")})`;
			}
			let img = target.data.img ?? target.actor.img ?? "";
			if (configSettings.usePlayerPortrait && target.actor.data.type === "character")
				img = target.actor?.img ?? target.data.img ?? "";
			if (VideoHelper.hasVideoExtension(img)) {
				img = await game.video.createThumbnail(img, { width: 100, height: 100 });
			}
			let isPlayerOwned = target.actor.hasPlayerOwner;
			this.saveDisplayData.push({
				gmName: target.name,
				playerName: getTokenPlayerName(target),
				img,
				isPC: isPlayerOwned,
				target,
				saveString,
				rollTotal,
				rollDetail,
				id: target.id,
				adv
			});
			i++;
		}
		if (this.item.data.data.actionType !== "abil")
			//@ts-ignore CONFIG.RELICS
			this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-relics-saveDC">DC ${rollDC}</label> ${CONFIG.RELICS.abilities[rollAbility]} ${i18n(this.hitTargets.size > 1 ? "midi-qol-relics.saving-throws" : "midi-qol-relics.saving-throw")}:`;
		else
			//@ts-ignore CONFIG.RELICS
			this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-relics-saveDC">DC ${rollDC}</label> ${CONFIG.RELICS.abilities[rollAbility]} ${i18n(this.hitTargets.size > 1 ? "midi-qol-relics.ability-checks" : "midi-qol-relics.ability-check")}:`;
	}
	monksSavingCheck(message, update, options, user) {
		if (!update.flags || !update.flags["monks-tokenbar"])
			return true;
		const mflags = update.flags["monks-tokenbar"];
		for (let key of Object.keys(mflags)) {
			if (!key.startsWith("token"))
				continue;
			const requestId = key.replace("token", "");
			let roll;
			try {
				roll = Roll.fromJSON(JSON.stringify(mflags[key].roll));
			}
			catch (err) {
				roll = mflags[key].roll;
			}
			this.saveRequests[requestId](roll);
			delete this.saveRequests[requestId];
		}
		return true;
	}
	processSaveRoll(message, html, data) {
		const isLMRTFY = (installedModules.get("lmrtfy") && message.data.flags?.lmrtfy?.data);
		if (!isLMRTFY && message.data.flags?.relics?.roll?.type !== "save")
			return true;
		const requestId = isLMRTFY ? message.data.flags.lmrtfy.data : message.data?.speaker?.actor;
		if (debugEnabled > 0)
			warn("processSaveToll", isLMRTFY, requestId, this.saveRequests);
		if (!requestId)
			return true;
		if (!this.saveRequests[requestId])
			return true;
		if (this.saveRequests[requestId]) {
			clearTimeout(this.saveTimeouts[requestId]);
			const handler = this.saveRequests[requestId];
			delete this.saveRequests[requestId];
			delete this.saveTimeouts[requestId];
			const brFlags = message.data.flags?.betterrolls5e;
			if (brFlags) {
				const formula = "1d20";
				const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll");
				if (!rollEntry)
					return true;
				let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
				let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
				let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
				handler({ total, formula, isBR: true, isCritical: brFlags.isCrit, terms: [{ options: { advantage, disadvantage } }] });
			}
			else {
				handler(message._roll);
			}
		}
		if (game.user?.id !== message.user.id && ["whisper", "all"].includes(configSettings.autoCheckSaves))
			html.hide();
		return true;
	}
	checkSuperSaver(actor, ability) {
		// TODO workout what this looks like
		const flags = getProperty(actor.data.flags, "midi-qol-relics.superSaver");
		if (!flags)
			return false;
		if (flags?.all)
			return true;
		if (getProperty(flags, `${ability}`))
			return true;
		return false;
	}
	processBetterRollsChatCard(message, html, data) {
		const brFlags = message.data.flags?.betterrolls5e;
		if (!brFlags)
			return true;
		if (debugEnabled > 1)
			debug("processBetterRollsChatCard", message.html, data);
		const requestId = message.data.speaker.actor;
		if (!this.saveRequests[requestId])
			return true;
		const formula = "1d20";
		const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll" && e.rollType === "save");
		if (!rollEntry)
			return true;
		let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
		let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
		let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
		clearTimeout(this.saveTimeouts[requestId]);
		this.saveRequests[requestId]({ total, formula, terms: [{ options: { advantage, disadvantage } }] });
		delete this.saveRequests[requestId];
		delete this.saveTimeouts[requestId];
		if (game.user?.id !== message.user.id && ["whisper", "all"].includes(configSettings.autoCheckSaves))
			html.hide();
		return true;
	}
	processAttackRoll() {
		if (!this.attackRoll)
			return;
		const terms = this.attackRoll.terms;
		if (terms[0] instanceof NumericTerm) {
			this.diceRoll = Number(terms[0].total);
		}
		else {
			this.diceRoll = Number(terms[0].total);
			//TODO find out why this is using results - seems it should just be the total
			// this.diceRoll = terms[0].results.find(d => d.active).result;
		}
		//@ts-ignore
		//@ts-ignore .critical undefined
		this.isCritical = this.diceRoll >= this.attackRoll.terms[0].options.critical;
		if (isNewerVersion("1.5.0", game.system.data.version)) {
			if (getProperty(this, "item.data.flags.midi-qol-relics.criticalThreshold") ?? 20 < 20) {
				this.isCritical = this.isCritical || this.diceRoll >= getProperty(this, "item.data.flags.midi-qol-relics.criticalThreshold");
			}
		}
		//@ts-ignore .fumble undefined
		this.isFumble = this.diceRoll <= this.attackRoll.terms[0].options.fumble;
		this.attackTotal = this.attackRoll.total ?? 0;
		if (debugEnabled > 1)
			debug("processItemRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble);
	}
	async checkHits() {
		let isHit = true;
		let item = this.item;
		// check for a hit/critical/fumble
		this.hitTargets = new Set();
		this.hitDisplayData = [];
		if (item?.data.data.target?.type === "self") {
			this.targets = getSelfTargetSet(this.actor);
		}
		for (let targetToken of this.targets) {
			isHit = false;
			let targetName = configSettings.useTokenNames && targetToken.name ? targetToken.name : targetToken.actor?.name;
			let targetActor = targetToken.actor;
			if (!targetActor)
				continue; // tokens without actors are an abomination and we refuse to deal with them.
			let targetAC = Number.parseInt(targetActor.data.data.attributes.ac.value);
			const bonusAC = getProperty(targetActor.data, "flags.midi-qol-relics.acBonus") || 0;
			targetAC += bonusAC;
			if (!this.isFumble) {
				isHit = this.attackTotal >= targetAC;
				// check to see if the roll hit the target
				if ((isHit || this.iscritical) && this.attackRoll) {
					const result = await doReactions(targetToken, this.tokenUuid, this.attackRoll);
					if (result?.name)
						targetActor.prepareData(); // allow for any items applied to the actor - like shield spell
					targetAC = Number.parseInt(targetActor.data.data.attributes.ac.value) + bonusAC;
					if (result?.ac)
						targetAC = result.ac + bonusAC; // deal with bonus ac if any.
					isHit = this.attackTotal >= targetAC || this.isCritical;
				}
			}
			if (this.isCritical)
				isHit = true;
			if (isHit || this.isCritical)
				this.processCriticalFlags();
			setProperty(targetActor.data, "flags.midi-qol-relics.acBonus", 0);
			if (game.user?.isGM)
				log(`${this.speaker.alias} Rolled a ${this.attackTotal} to hit ${targetName}'s AC of ${targetAC} ${(isHit || this.isCritical) ? "hitting" : "missing"}`);
			// Log the hit on the target
			let attackType = ""; //item?.name ? i18n(item.name) : "Attack";
			let hitString = this.isCritical ? i18n("midi-qol-relics.criticals") : this.isFumble ? i18n("midi-qol-relics.fumbles") : isHit ? i18n("midi-qol-relics.hits") : i18n("midi-qol-relics.misses");
			let img = targetToken.data?.img || targetToken.actor?.img;
			if (configSettings.usePlayerPortrait && targetToken.actor?.data.type === "character")
				img = targetToken.actor?.img || targetToken.data.img;
			if (VideoHelper.hasVideoExtension(img ?? "")) {
				img = await game.video.createThumbnail(img ?? "", { width: 100, height: 100 });
			}
			this.hitDisplayData.push({ isPC: targetToken.actor?.hasPlayerOwner, target: targetToken, hitString, attackType, img, gmName: targetToken.name, playerName: getTokenPlayerName(targetToken), bonusAC });
			// If we hit and we have targets and we are applying damage say so.
			if (isHit || this.isCritical)
				this.hitTargets.add(targetToken);
		}
	}
	setRangedTargets(targetDetails) {
		const token = getCanvas().tokens?.get(this.speaker.token);
		if (!token) {
			ui.notifications?.warn(`${game.i18n.localize("midi-qol-relics.noSelection")}`);
			return true;
		}
		// We have placed an area effect template and we need to check if we over selected
		let dispositions = targetDetails.type === "creature" ? [-1, 0, 1] : targetDetails.type === "ally" ? [token.data.disposition] : [-token.data.disposition];
		// release current targets
		game.user?.targets.forEach(t => {
			//@ts-ignore
			t.setTarget(false, { releaseOthers: false });
		});
		game.user?.targets.clear();
		// min dist is the number of grid squares away.
		let minDist = targetDetails.value;
		const canvas = getCanvas();
		const targetIds = [];
		if (canvas.tokens?.placeables && canvas.grid) {
			for (let target of canvas.tokens.placeables) {
				const ray = new Ray(target.center, token.center);
				const actorData = target.actor?.data;
				if (actorData?.data.details.type?.custom === "NoTarget")
					continue;
				const wallsBlocking = ["wallsBlock", "wallsBlockIgnoreDefeated"].includes(configSettings.rangeTarget);
				let inRange = target.actor && actorData?.data.details.race !== "trigger"
					&& target.actor.id !== token.actor?.id
					&& dispositions.includes(target.data.disposition)
					//@ts-ignore attributes
					&& (["always", "wallsBlock"].includes(configSettings.rangeTarget) || target.actor?.data.data.attributes.hp.value > 0);
				// && (["always", "wallsBlock"].includes(configSettings.rangeTarget) || target.actor?.data.data.attributes.hp.value > 0)
				if (inRange) {
					const distance = getDistanceSimple(target, token, false, wallsBlocking);
					inRange = inRange && distance > 0 && distance <= minDist;
				}
				if (inRange) {
					target.setTarget(true, { user: game.user, releaseOthers: false });
					if (target.document.id)
						targetIds.push(target.document.id);
				}
			}
			this.targets = game.user?.targets ?? new Set();
			this.saves = new Set();
			this.failedSaves = new Set(this.targets);
			this.hitTargets = new Set(this.targets);
			game.user?.broadcastActivity({ targets: targetIds });
		}
		return true;
	}
	async removeActiveEffects(effectIds) {
		if (!Array.isArray(effectIds))
			effectIds = [effectIds];
		this.actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
	}
	async removeItemEffects(uuid = this.item?.uuid) {
		if (!uuid) {
			error("Cannot remove effects when no item specified");
			return;
		}
		if (uuid instanceof Item)
			uuid = uuid.uuid;
		const filtered = this.actor.effects.reduce((filtered, ef) => {
			if (ef.data.origin === uuid)
				filtered.push(ef.id);
			return filtered;
		}, []);
		if (filtered.length > 0)
			this.removeActiveEffects(filtered);
	}
}
Workflow._workflows = {};
/*
export class DamageOnlyWorkflow08 extends Workflow { // WIP don't use
constructor(actor: Actor5e, token: Token, damageParts: [], targets: [Token], options = {
	itemCardId: 0, itemData: null, data: {},
	critical: false, criticalBonusDice: 0, criticalMultiplier: 2, multiplyNumeric: 0, powerfulCritical: false,
	fastForward: false, allowCritical: true, template: null, title: null, dialogOptions: {}, // Dialog configuration
	chatMessage: true, messageData: {}, rollMode: null, speaker: null, flavor: null
}
) {
	super(actor, null, ChatMessage.getSpeaker({ token }), new Set(targets), shiftOnlyEvent);
	// const isFF = options.fastForward;
	const formula = damageParts.join(" + ");
	// const isCritical = options.
	let rollData;
	if (this.item) rollData = this.item.getRollData();
	else if (this.actor) rollData = this.actor.getRollData;
	if (options.data) rollData = rollData.mergeObject(rollData, options.data, { overwrite: true })
	this.roll = new CONFIG.Dice.DamageRoll(formula, rollData, {
	flavor: options.flavor || options.title,
	critical: options.critical,
	criticalBonusDice: options.criticalBonusDice,
	multiplyNumeric: options.multiplyNumeric,
	criticalMultiplier: options.criticalMultiplier,
	powerfulCritical: options.powerfulCritical
	});
	this.options = options;
}

async _next(newState) {
	this.currentState = newState;
	if (debugEnabled > 0) warn("Newstate is ", newState)
	let state = stateToLabel(this.currentState);
	switch (newState) {
	case WORKFLOWSTATES.NONE:
		if (!this.options.fastForward) {
		const configured = await this.roll.configureDialog
		}
	}
}
}
*/
export class DamageOnlyWorkflow extends Workflow {
	constructor(actor, token, damageTotal, damageType, targets, roll, options) {
		super(actor, null, ChatMessage.getSpeaker({ token }), new Set(targets), shiftOnlyEvent);
		this.itemData = options.itemData;
		// Do the supplied damageRoll
		this.damageRoll = roll;
		this.damageDetail = createDamageList(this.damageRoll, this.rollOptions.versatile ? null : this.item, damageType);
		this.damageTotal = damageTotal;
		this.flavor = options.flavor;
		//@ts-ignore CONFIG.RELICS
		this.defaultDamageType = CONFIG.RELICS.damageTypes[damageType] || damageType;
		this.damageList = options.damageList;
		this.itemCardId = options.itemCardId;
		this.useOther = options.useOther ?? true;
		this.isCritical = options.isCritical ?? false;
		this.next(WORKFLOWSTATES.NONE);
		return this;
	}
	get workflowType() { return this.__proto__.constructor.name; }
	;
	get damageFlavor() {
		if (this.useOther && this.flavor)
			return this.flavor;
		else
			return super.damageFlavor;
	}
	async _next(newState) {
		this.currentState = newState;
		if (debugEnabled > 0)
			warn("Newstate is ", newState);
		let state = stateToLabel(this.currentState);
		switch (newState) {
			case WORKFLOWSTATES.NONE:
				this.effectsAlreadyExpired = [];
				if (this.itemData) {
					this.itemData.effects = this.itemData.effects.map(e => duplicate(e));
					this.item = new CONFIG.Item.documentClass(this.itemData, { parent: this.actor });
					setProperty(this.item, "data.flags.midi-qol-relics.onUseMacroName", null);
				}
				else
					this.item = null;
				if (this.itemCardId === "new" && this.itemData) { // create a new chat card for the item
					this.createCount += 1;
					this.itemCard = await showItemCard.bind(this.item)(false, this, true);
					this.itemCardId = this.itemCard.id;
					// Since this could to be the same itfem don't roll the on use macro, since this could loop forever
				}
				// Need to pretend there was an attack roll so that hits can be registered and the correct string created
				// TODO separate the checkHit()/create hit display Data and displayHits() into 3 spearate functions so we don't have to pretend there was a hit to get the display
				this.isFumble = false;
				this.attackTotal = 9999;
				await this.checkHits();
				const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
				await this.displayHits(whisperCard, configSettings.mergeCard && this.itemCardId);
				if (configSettings.mergeCard && this.itemCardId) {
					this.damageRollHTML = await this.damageRoll?.render() ?? "";
					this.damageCardData = {
						//@ts-ignore ? flavor TODO
						flavor: "damage flavor",
						roll: this.damageRoll ?? null,
						speaker: this.speaker
					};
					await this.displayDamageRoll(configSettings.mergeCard && this.itemCardId);
				}
				else
					this.damageRoll?.toMessage({ flavor: this.flavor });
				this.hitTargets = new Set(this.targets);
				this.applicationTargets = new Set(this.targets);
				this.damageList = await applyTokenDamage(this.damageDetail, this.damageTotal, this.targets, this.item, new Set(), { existingDamage: this.damageList, superSavers: new Set() });
				await super._next(WORKFLOWSTATES.ROLLFINISHED);
				Workflow.removeWorkflow(this.uuid);
				return;
			default: return super.next(newState);
		}
	}
}
export class TrapWorkflow extends Workflow {
	constructor(actor, item, targets, templateLocation = undefined, trapSound = undefined, event = null) {
		super(actor, item, ChatMessage.getSpeaker({ actor }), new Set(targets), event);
		// this.targets = new Set(targets);
		if (!this.event)
			this.event = duplicate(shiftOnlyEvent);
		this.trapSound = trapSound;
		this.templateLocation = templateLocation;
		// this.saveTargets = game.user.targets; 
		this.rollOptions.fastForward = true;
		this.next(WORKFLOWSTATES.NONE);
	}
	async _next(newState) {
		this.currentState = newState;
		let state = stateToLabel(newState);
		if (debugEnabled > 0)
			warn("attack workflow.next ", state, this.uuid, this.targets);
		switch (newState) {
			case WORKFLOWSTATES.NONE:
				this.saveTargets = await validTargetTokens(game.user?.targets);
				this.effectsAlreadyExpired = [];
				this.onUseMacroCalled = false;
				this.itemCardId = (await showItemCard.bind(this.item)(false, this, true))?.id;
				//@ts-ignore TOODO this is just wrong fix
				if (this.trapSound)
					AudioHelper.play({ src: this.trapSound }, false);
				if (debugEnabled > 1)
					debug(" workflow.none ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
				// don't support the placement of a tempalte
				return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
			case WORKFLOWSTATES.AWAITTEMPLATE:
				const targetDetails = this.item.data.data.target;
				if (configSettings.rangeTarget !== "none" && ["m", "ft"].includes(targetDetails?.units) && ["creature", "ally", "enemy"].includes(targetDetails?.type)) {
					this.setRangedTargets(targetDetails);
					this.targets = await validTargetTokens(this.targets);
					this.failedSaves = new Set(this.targets);
					this.hitTargets = new Set(this.targets);
					return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
				}
				if (!this.item.hasAreaTarget || !this.templateLocation)
					return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
				//@ts-ignore
				this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
				const TemplateClass = game[game.system.id].canvas.AbilityTemplate;
				const templateData = TemplateClass.fromItem(this.item).data.toObject();
				// template.draw();
				// get the x and y position from the trapped token
				templateData.x = this.templateLocation.x || 0;
				templateData.y = this.templateLocation.y || 0;
				templateData.direction = this.templateLocation.direction || 0;
				// Create the template
				let templates = await getCanvas().scene?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
				if (templates && this.templateLocation?.removeDelay) {
					//@ts-ignore _ids
					let ids = templates.map(td => td._id);
					//TODO test this again
					setTimeout(() => getCanvas().scene?.deleteEmbeddedDocuments("MeasuredTemplate", ids), this.templateLocation.removeDelay * 1000);
				}
				return;
			case WORKFLOWSTATES.TEMPLATEPLACED:
				if (debugEnabled > 1)
					debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
				// perhaps auto place template?
				return this.next(WORKFLOWSTATES.VALIDATEROLL);
			case WORKFLOWSTATES.VALIDATEROLL:
				// do pre roll checks
				if (debugEnabled > 1)
					debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
				return this.next(WORKFLOWSTATES.WAITFORATTACKROLL);
			case WORKFLOWSTATES.WAITFORATTACKROLL:
				if (!this.item.hasAttack) {
					this.hitTargets = new Set(this.targets);
					return this.next(WORKFLOWSTATES.WAITFORSAVES);
				}
				if (debugEnabled > 0)
					warn("attack roll ", this.event);
				this.item.rollAttack({ event: this.event });
				return;
			case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
				this.processAttackRoll();
				await this.displayAttackRoll(configSettings.mergeCard);
				await this.checkHits();
				const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
				await this.displayHits(whisperCard, configSettings.mergeCard);
				return this.next(WORKFLOWSTATES.WAITFORSAVES);
			case WORKFLOWSTATES.WAITFORSAVES:
				if (!this.saveItem.hasSave) {
					this.saves = new Set(); // no saving throw, so no-one saves
					this.failedSaves = new Set(this.hitTargets);
					return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
				}
				let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
				let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
				let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
				try {
					await this.checkSaves(true);
				}
				finally {
					Hooks.off("renderChatMessage", hookId);
					Hooks.off("renderChatMessage", brHookId);
					Hooks.off("updateChatMessage", monksId);
				}
				//@ts-ignore ._hooks not defined
				if (debugEnabled > 1)
					debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length);
				await this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
				return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
			case WORKFLOWSTATES.SAVESCOMPLETE:
				return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
			case WORKFLOWSTATES.WAITFORDAMAGEROLL:
				if (!itemHasDamage(this.item))
					return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
				if (this.isFumble) {
					// fumble means no trap damage/effects
					return this.next(WORKFLOWSTATES.ROLLFINISHED);
				}
				this.rollOptions.critical = this.isCritical;
				if (debugEnabled > 1)
					debug("TrapWorkflow: Rolling damage ", this.event, this.itemLevel, this.rollOptions.versatile, this.targets, this.hitTargets);
				this.rollOptions.critical = this.isCritical;
				this.rollOptions.fastForward = true;
				this.item.rollDamage(this.rollOptions);
				return; // wait for a damage roll to advance the state.
			case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
				if (!this.item.hasAttack) { // no attack roll so everyone is hit
					this.hitTargets = new Set(this.targets);
					if (debugEnabled > 0)
						warn(" damage roll complete for non auto target area effects spells", this);
				}
				// apply damage to targets plus saves plus immunities
				await this.displayDamageRoll(configSettings.mergeCard);
				if (this.isFumble) {
					return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
				}
				// If the item does damage, use the same damage type as the item
				let defaultDamageType = this.item?.data.data.damage?.parts[0][1] || this.defaultDamageType;
				this.damageDetail = createDamageList(this.damageRoll, this.rollOptions.versatile ? null : this.item, defaultDamageType);
				return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
			case WORKFLOWSTATES.ALLROLLSCOMPLETE:
				if (debugEnabled > 1)
					debug("all rolls complete ", this.damageDetail);
				if (this.damageDetail.length)
					processDamageRoll(this, this.damageDetail[0].type);
				return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
			case WORKFLOWSTATES.ROLLFINISHED:
				// area effect trap, put back the targets the way they were
				if (this.saveTargets && this.item.hasAreaTarget) {
					game.user?.targets.forEach(t => {
						t.setTarget(false, { releaseOthers: false });
					});
					game.user?.targets.clear();
					this.saveTargets.forEach(t => {
						t.setTarget(true, { releaseOthers: false });
						game.user?.targets.add(t);
					});
				}
				return super._next(WORKFLOWSTATES.ROLLFINISHED);
			default:
				return super._next(newState);
		}
	}
}
export class BetterRollsWorkflow extends Workflow {
	static get(id) {
		return Workflow._workflows[id];
	}
	/**
	* Retrieves the BetterRolls CustomItemRoll object from the related chat message
	*/
	get roll() {
		if (this._roll)
			return this._roll;
		const message = game.messages?.get(this.itemCardId ?? "");
		if ("BetterRollsCardBinding" in message) {
			this._roll = message["BetterRollsCardBinding"].roll;
			return this._roll;
		}
	}
	async _next(newState) {
		this.currentState = newState;
		let state = stateToLabel(this.currentState);
		if (debugEnabled > 0)
			warn("betterRolls workflow.next ", state, configSettings.speedItemRolls, this);
		switch (newState) {
			case WORKFLOWSTATES.WAITFORATTACKROLL:
				// since this is better rolls as soon as we are ready for the attack roll we have both the attack roll and damage
				if (!this.item.hasAttack) {
					return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
				}
				Hooks.callAll("midi-qol-relics.preAttackRollComplete", this);
				return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);
			case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
				this.effectsAlreadyExpired = [];
				if (checkRule("removeHiddenInvis"))
					removeHiddenInvis.bind(this)();
				if (debugEnabled > 1)
					debug(this.attackRollHTML);
				if (configSettings.autoCheckHit !== "none") {
					await this.checkHits();
					await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
				}
				Hooks.callAll("midi-qol-relics.AttackRollComplete", this);
				return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
			case WORKFLOWSTATES.WAITFORDAMAGEROLL:
				// better rolls always have damage rolled, but we might have to show it
				// todo: shouldRollDamage is somewhat common and should probably be a property on the workflow base class
				let shouldRollDamage = getAutoRollDamage() === "always"
					|| (getAutoRollDamage() !== "none" && !this.item.hasAttack)
					|| (getAutoRollDamage() === "onHit" && (this.hitTargets.size > 0 || this.targets.size === 0));
				if (shouldRollDamage) {
					this.roll?.rollDamage();
				}
				this.failedSaves = new Set(this.hitTargets);
				if (!itemHasDamage(this.item))
					return this.next(WORKFLOWSTATES.WAITFORSAVES);
				else
					return this.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
			case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
				if (this.critflagSet) {
					this.roll?.forceCrit();
				}
				const damageBonusMacro = getProperty(this.actor.data.flags, "relics.DamageBonusMacro");
				if (damageBonusMacro) {
					await this.rollBonusDamage(damageBonusMacro);
				}
				if (this.otherDamageRoll) {
					const messageData = {
						flavor: this.otherDamageFlavor ?? this.damageFlavor,
						speaker: this.speaker
					};
					setProperty(messageData, "flags.relics.roll.type", "damage");
					//  Not required as we pick up the damage from the better rolls data this.otherDamageRoll.toMessage(messageData);
					this.otherDamageDetail = createDamageList(this.otherDamageRoll, null, this.defaultDamageType);
				}
				if (this.bonusDamageRoll) {
					const messageData = {
						flavor: this.bonusDamageFlavor,
						speaker: this.speaker
					};
					setProperty(messageData, "flags.relics.roll.type", "damage");
					this.bonusDamageRoll.toMessage(messageData);
				}
				expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);
				if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
					// we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
					this.targets = await validTargetTokens(game.user?.targets);
					this.hitTargets = await validTargetTokens(game.user?.targets);
				}
				// apply damage to targets plus saves plus immunities
				if (this.isFumble) { //TODO: Is this right?
					return this.next(WORKFLOWSTATES.ROLLFINISHED);
				}
				if (this.saveItem.hasSave)
					return this.next(WORKFLOWSTATES.WAITFORSAVES);
				return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
			case WORKFLOWSTATES.ROLLFINISHED:
				await this.complete();
				super._next(WORKFLOWSTATES.ROLLFINISHED);
				// should remove the apply effects button.
				Workflow.removeWorkflow(this.item.uuid);
				return;
			default:
				return await super._next(newState);
		}
	}
	async complete() {
		if (this._roll) {
			await this._roll.update({
				"flags.midi-qol-relics.playSound": false,
				"flags.midi-qol-relics.type": MESSAGETYPES.HITS,
				"flags.midi-qol-relics.waitForDiceSoNice": false,
				"flags.midi-qol-relics.hideTag": "",
				"flags.midi-qol-relics.displayId": this.displayId
			});
			this._roll = null;
		}
	}
}
export class DummyWorkflow extends BetterRollsWorkflow {
	constructor(actor, item, speaker, targets, options) {
		super(actor, item, speaker, targets, options);
		this.advantage = options?.advantage;
		this.disadvantage = options?.disadvantage;
		this.rollOptions.fastForward = options?.fastForward;
		this.rollOptions.fastForwardKey = options?.fastFowrd;
	}
	async _next(newState) {
		Workflow.removeWorkflow(this.item.id);
		return await 0;
	}
}
