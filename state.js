// --- GAME STATE ---
let state = {
    villages: [],
    mapData: {},
    missions: [],
    reports: [],
    playerProfiles: {},
    mapView: { x: 100, y: 100 },
    templates: {
        offense: { "Axe": 6000, "Light Cav": 2000, "Ram": 300 },
        defense: { "Spear": 4000, "Sword": 4000, "Heavy Cav": 1500 }
    },
    lastTick: Date.now(),
    lastAiUpdate: Date.now(),
    debugFastTravel: false,
    selectedVillageId: null,
    lang: "en",
    aiProcessingIndex: 0
};