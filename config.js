// --- CONFIGURATION ---
const CONFIG = {
    enableCatapults: false,
    mapSize: 200,
    maxReports: 50,
    
    marketCapacityPerLevel: 1000, // How many resources 1 level can carry
    buildQueueLimit: 5,
    
    aiAttackEnabled: true,
    aiAttackInterval: 100 * 60 * 1000, // Check for attack every 10 minutes
    aiAttackChance: 0.3, // 30% chance to attack when interval hits
    aiAttackRange: 15, // Max distance tiles
    aiAttackStrength: 0.4, // Multiplier relative to player points (0.5 = 50% of player strength)
    aiUpdateInterval: 60 * 60 * 1000, 
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

function roundNumbers(obj) {
    for (let key in obj) {
        if (typeof obj[key] === 'number') {
            // Round to 2 decimal places
            obj[key] = Math.round(obj[key] * 100) / 100; 
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            roundNumbers(obj[key]); // Recurse
        }
    }
    return obj;
}

function getRandomColor() {
    // Generates bright, distinct colors (avoiding darks/blacks)
    const h = Math.floor(Math.random() * 360);
    return `hsl(${h}, 70%, 50%)`;
}

function generateAiName(id) {
    const prefixes = ["Baron", "Duke", "Warlord", "King", "General", "Lady", "Countess"];
    const names = ["Kael", "Vesper", "Gorm", "Thorne", "Ivy", "Ash", "Zane", "Mira", "Rex"];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const n = names[Math.floor(Math.random() * names.length)];
    return `${p} ${n} ${id.split('_')[1]}`; // e.g. "Baron Kael 42"
}