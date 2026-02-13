// --- GAME STATE ---
let state = {
    villages: [],
    mapData: {},
    missions: [],
    reports: [],
    playerProfiles: {},
    mapView: { x: 100, y: 100 },
    templates: {
        offense: { "Axe": 8000, "Scout": 50, "Light Cav": 2500, "Ram": 300, "Noble": 4 },
        defense: { "Spear": 4000, "Sword": 4000, "Scout": 50, "Heavy Cav": 1500 }
    },
    lastTick: Date.now(),
    lastAiUpdate: Date.now(),
    debugFastTravel: false,
    selectedVillageId: null,
    lang: "en",
    aiProcessingIndex: 0
};