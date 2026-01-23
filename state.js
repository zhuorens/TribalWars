// --- GAME STATE ---
let state = {
    villages: [], 
    mapData: {}, 
    missions: [], 
    reports: [],
    playerProfiles: {},
    mapView: { x: 100, y: 100 }, 
    lastTick: Date.now(),
    lastAiUpdate: Date.now(),
    debugFastTravel: false,
    selectedVillageId: null
};