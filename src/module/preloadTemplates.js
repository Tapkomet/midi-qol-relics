export async function preloadTemplates() {
	const templatePaths = [
		// Add paths to "modules/midi-qol-relics/templates" - TODO check these
		"modules/midi-qol-relics/templates/saves.html",
		"modules/midi-qol-relics/templates/hits.html",
		"modules/midi-qol-relics/templates/item-card.html",
		"modules/midi-qol-relics/templates/tool-card.html",
		"modules/midi-qol-relics/templates/config.html",
		"modules/midi-qol-relics/templates/damage-results.html",
		"modules/midi-qol-relics/templates/roll-stats.html"
	];
	return loadTemplates(templatePaths);
}
