// --- CONFIGURATION ---
const CONFIG = {
    enableCatapults: false,
    mapSize: 200,
    maxReports: 50,
    
    marketCapacityPerLevel: 1000, // How many resources 1 level can carry
    buildQueueLimit: 5,
    
    // NEW: AI Attack Settings
    aiAttackEnabled: true,
    aiAttackInterval: 20 * 60 * 1000, // Check for attack every 10 minutes
    aiAttackChance: 0.1, // 30% chance to attack when interval hits
    aiAttackRange: 15, // Max distance tiles
    aiAttackStrength: 0.4 // Multiplier relative to player points (0.5 = 50% of player strength)
};

// --- HELPER: Time Formatting ---
function formatTime(ms) {
    let s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    let m = Math.floor(s / 60);
    s = s % 60;
    if (m < 60) return `${m}m ${s}s`;
    let h = Math.floor(m / 60);
    m = m % 60;
    return `${h}h ${m}m ${s}s`;
}

function getTechMultiplier(level) {
    if (level === 2) return 1.25;
    if (level === 3) return 1.40;
    return 1.0;
}