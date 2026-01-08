// --- GAME STATE ---
let state = {
    villages: [], 
    mapData: {}, 
    missions: [], 
    reports: [],
    mapView: { x: 100, y: 100 }, 
    lastTick: Date.now(),
    debugFastTravel: false,
    selectedVillageId: null
};