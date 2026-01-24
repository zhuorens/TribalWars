// --- HELPERS (Global) ---

// 1. Round numbers to save space (e.g. 10.33333 -> 10.33)
function recursiveRound(obj) {
    let newObj = Array.isArray(obj) ? [] : {};
    for (let key in obj) {
        let value = obj[key];
        if (typeof value === 'number') {
            newObj[key] = Math.round(value * 100) / 100;
        } else if (typeof value === 'object' && value !== null) {
            newObj[key] = recursiveRound(value);
        } else {
            newObj[key] = value;
        }
    }
    return newObj;
}

// 2. Smart Save Trigger (Prevents lag when clicking fast)
let saveTimeout = null;
function requestAutoSave() {
    // If a save is already queued, cancel it and restart the timer
    if (saveTimeout) clearTimeout(saveTimeout);

    // Wait 2 seconds of inactivity before triggering the heavy save
    saveTimeout = setTimeout(() => {
        engine.save();
    }, 5000);
}

// --- ENGINE (Logic) ---
const engine = {
    init: function () {
        if (localStorage.getItem("tw_v5_save")) {
            try {
                // Load Save
                var raw = localStorage.getItem('tw_v5_save');

                // Try to decompress. If it fails (old save), use raw string.
                var decompressed = LZString.decompressFromUTF16(raw);
                var parsedData = JSON.parse(decompressed || raw);

                state = { ...state, ...parsedData };

                // --- 1. Restore Language Settings ---
                if (state.lang) {
                    LANG = state.lang;
                } else {
                    state.lang = 'en'; // Default
                    LANG = 'en';
                }

                if (!state.selectedVillageId && state.villages.length > 0) {
                    state.selectedVillageId = state.villages[0].id;
                }

                // --- 2. Initialize Profiles (For AI Warlords) ---
                state.playerProfiles = state.playerProfiles || {};

                // Ensure critical profiles exist
                if (!state.playerProfiles['player']) {
                    state.playerProfiles['player'] = { name: "You", color: "#42a5f5", alive: true };
                }
                if (!state.playerProfiles['barbarian']) {
                    state.playerProfiles['barbarian'] = { name: "Barbarians", color: "#bdbdbd", alive: true };
                }

                // --- 3. MIGRATION: Fix old saves ---
                state.villages.forEach(v => {
                    // Fix data structure
                    if (!v.queues) v.queues = { build: [], research: [], barracks: [], stable: [], workshop: [], academy: [] };
                    if (!v.stationed) v.stationed = [];
                    if (v.buildings["Market"] === undefined) v.buildings["Market"] = 0;

                    // Fix Barbarian ID mismatch ('barb' -> 'barbarian')
                    if (v.owner === 'barb') v.owner = 'barbarian';
                });

                // Clean up old 'barb' profile key if present
                if (state.playerProfiles['barb']) delete state.playerProfiles['barb'];

                // Ensure AI Timer exists to prevent instant jumps
                if (!state.lastAiUpdate) state.lastAiUpdate = Date.now();

            } catch (e) { console.error("Save Load Error:", e); }
        } else {
            // --- NEW GAME SETUP ---

            // 1. Initialize Profiles FIRST (Required for Map Generation)
            state.playerProfiles = {
                'player': { name: "You", color: "#42a5f5", alive: true },
                'barbarian': { name: "Barbarians", color: "#bdbdbd", alive: true }
            };

            // 2. Initialize AI Timer
            state.lastAiUpdate = Date.now();

            // 3. Create Player Start
            const v = engine.createVillage(100, 100, "My Village", "player");
            state.villages.push(v);
            state.selectedVillageId = v.id;

            console.log("Generating Map...");
            for (let x = 0; x <= CONFIG.mapSize; x += 15) {
                for (let y = 0; y <= CONFIG.mapSize; y += 15) {
                    engine.generateMapChunk(x, y);
                }
            }
            console.log("Map Generation Complete. Villages: " + state.villages.length);
        }

        ui.init();

        // Start Loops
        if (window.gameLoop) clearInterval(window.gameLoop);
        if (window.saveLoop) clearInterval(window.saveLoop);

        window.gameLoop = setInterval(engine.tick, 1000);

        // Backup Interval: Save every 60 seconds regardless of activity
        window.saveLoop = setInterval(engine.save, 60000);

        // Save on Tab Close
        window.onbeforeunload = function () {
            engine.save();
        };
    },

    // Add these inside your engine object:

    getPopLimit: function (village) {
        const farmLvl = village.buildings["Farm"] || 0;
        if (farmLvl === 0) return 0;

        // Tribal Wars Formula: 240 * (1.172103 ^ (Level - 1))
        // You can adjust the base (240) and factor (1.17) if you want different balance
        return Math.floor(240 * Math.pow(1.172103, farmLvl - 1));
    },

    getPopUsed: function (village) {
        let used = 0;

        // 1. Calculate Pop from Buildings (Existing Levels)
        for (let bName in village.buildings) {
            let level = village.buildings[bName];
            if (level > 0 && DB.buildings[bName]) {
                const b = DB.buildings[bName];
                if (b.basePop > 0) {
                    // Formula: Base * (Factor ^ (Level - 1))
                    // Note: Ensure this formula matches your DB/Excel logic exactly
                    used += Math.round(b.basePop * Math.pow((b.factor - 1) * 3 / 4 + 1, level - 1));
                }
            }
        }

        // --- NEW: Calculate Pop from Building Queue ---
        // We added 'pop' to the queue object in the build() function. Now we sum it.
        if (village.queues.build) {
            village.queues.build.forEach(item => {
                if (item.pop) {
                    used += item.pop;
                } else {
                    // Fallback for old saves or items without 'pop' property
                    // We estimate it, or strictly you could ignore it to prevent bugs
                    // But ideally, the build() function should always save .pop
                }
            });
        }

        // 2. Calculate Pop from Units (Home)
        for (let uName in village.units) {
            if (village.units[uName] > 0 && DB.units[uName]) {
                used += village.units[uName] * DB.units[uName].pop;
            }
        }

        // 3. Calculate Pop from Unit Queues (Troops being built)
        ['barracks', 'stable', 'workshop', 'academy'].forEach(qType => {
            if (village.queues[qType]) {
                village.queues[qType].forEach(item => {
                    if (DB.units[item.unit]) {
                        used += item.count * DB.units[item.unit].pop;
                    }
                });
            }
        });

        // 4. Calculate Pop from Troops Outside
        state.missions.forEach(m => {
            if (m.originId === village.id) {
                for (let u in m.units) {
                    if (DB.units[u]) used += m.units[u] * DB.units[u].pop;
                }
            }
        });

        // 5. Calculate Pop from Stationed Troops
        state.villages.forEach(v => {
            if (v.stationed) {
                v.stationed.forEach(s => {
                    if (s.originId === village.id) {
                        for (let u in s.units) {
                            if (DB.units[u]) used += s.units[u] * DB.units[u].pop;
                        }
                    }
                });
            }
        });

        return used;
    },

    getCurrentVillage: function () {
        return state.villages.find(v => v.id === state.selectedVillageId) || state.villages[0];
    },

    generateEnemyName: function () {
        const adjs = ["Dark", "Red", "Iron", "Black", "Grim", "Savage", "Cruel", "Blood", "Storm", "Chaos", "Vile", "Shadow"];
        const nouns = ["Keep", "Fort", "Tower", "Hold", "Bastion", "Citadel", "Outpost", "Lair", "Den", "Gate", "Dominion", "Empire"];
        const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const suffix = Math.random() > 0.9 ? ` ${Math.floor(Math.random() * 99)}` : "";
        return `${rand(adjs)} ${rand(nouns)}${suffix}`;
    },

    rand: function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

    createVillage: function (x, y, name, owner) {
        let builds = {};
        // Default "Player Start" values
        for (let b in DB.buildings) {
            if (b === "Headquarters") builds[b] = 1;
            else if (b === "Farm" || b === "Warehouse") builds[b] = 3;
            else if (b.includes("Camp") || b.includes("Pit") || b.includes("Mine")) builds[b] = 5;
            else builds[b] = 0;
        }

        let units = {}; for (let u in DB.units) units[u] = 0;
        let techs = {}; for (let u in DB.units) techs[u] = 1;

        // Helper for random numbers
        const r = engine.rand;

        if (owner === "enemy") {
            // --- ENEMY LOGIC (Stronger) ---
            builds["Wall"] = r(1, 3);
            builds["Barracks"] = r(1, 5);
            builds["Headquarters"] = r(2, 10);
            builds["Farm"] = r(2, 10);
            builds["Warehouse"] = r(5, 10);
            builds["Timber Camp"] = r(10, 15);
            builds["Clay Pit"] = r(10, 15);
            builds["Iron Mine"] = r(10, 15);
            builds["Smithy"] = r(0, 2);
            builds["Market"] = r(0, 4);

            units["Spear"] = r(200, 500);
            units["Sword"] = r(200, 500);
            units["Heavy Cav"] = r(20, 80);
            units["Scout"] = r(20, 100);
            if (Math.random() > 0.7) units["Ram"] = r(10, 30);

        } else if (owner === "barbarian") {
            // --- BARB LOGIC (Random, but Weaker than Enemy) ---
            // Resources: 4-10 (Enemy is 10-15)
            builds["Timber Camp"] = r(6, 15);
            builds["Clay Pit"] = r(6, 15);
            builds["Iron Mine"] = r(6, 15);

            // Infrastructure: Lower tier
            builds["Headquarters"] = r(1, 5);
            builds["Farm"] = r(1, 5);
            builds["Warehouse"] = r(5, 10);

            // Military: Barbs rarely have high tech buildings
            builds["Barracks"] = r(0, 2);
            builds["Market"] = r(0, 2);

        }

        const v = {
            id: Date.now() + Math.floor(Math.random() * 100000), x: x, y: y, name: name, owner: owner,
            res: [500, 500, 500], buildings: builds, units: units, techs: techs,
            queues: { build: [], research: [], barracks: [], stable: [], workshop: [], academy: [] },
            stationed: [],
            loyalty: 100, points: 0
        };

        v.points = engine.calculatePoints(v);
        state.mapData[`${x},${y}`] = { type: owner, id: v.id, name: name, points: v.points };
        return v;
    },

    calculatePoints: function (v) {
        let total = 0;
        for (let b in v.buildings) {
            if (v.buildings[b] > 0) total += Math.floor(DB.buildings[b].points * Math.pow(1.2, v.buildings[b] - 1));
        }
        return total;
    },

    generateMapChunk: function (cX, cY) {
        // Ensure profiles object exists
        state.playerProfiles = state.playerProfiles || {};
        // Ensure human player exists
        if (!state.playerProfiles['player']) {
            state.playerProfiles['player'] = { name: "You", color: "#FFFF00", alive: true };
        }

        for (let x = cX - 7; x <= cX + 7; x++) {
            for (let y = cY - 7; y <= cY + 7; y++) {
                // Bounds check
                if (x < 0 || x > CONFIG.mapSize || y < 0 || y > CONFIG.mapSize) continue;
                // Already exists check
                if (state.mapData[`${x},${y}`]) continue;
                // Don't overwrite the player's start position (assuming 100,100)
                if (x === 100 && y === 100) continue;

                const r = Math.random();

                // 1. AI WARLORDS (5% Chance)
                if (r > 0.95) {
                    // Generate Unique ID (e.g., ai_102)
                    // We use villages.length to ensure it increments
                    const aiId = `ai_${state.villages.length}`;

                    // Create their specific Profile (Name + Color)
                    const profile = engine.getPlayerProfile(aiId);

                    // Create Village owned by this specific AI
                    state.villages.push(engine.createVillage(x, y, profile.name, aiId));
                }
                // 2. BARBARIANS (10% Chance)
                else if (r > 0.85) {
                    // Ensure barbarian profile exists
                    engine.getPlayerProfile('barbarian');
                    state.villages.push(engine.createVillage(x, y, "Barbarian", "barbarian"));
                }
                // 3. EMPTY TILE
                else {
                    state.mapData[`${x},${y}`] = { type: "empty" };
                }
            }
        }
    },

    updatePoints: function () {
        state.villages.forEach(v => {
            v.points = engine.calculatePoints(v);
            if (state.mapData[`${v.x},${v.y}`]) {
                state.mapData[`${v.x},${v.y}`].points = v.points;
            }
        });

        let globalPoints = 0;
        state.villages.forEach(v => {
            if (v.owner === 'player') globalPoints += v.points;
        });
        state.playerPoints = globalPoints;

        const gpEl = document.getElementById('global-points');
        if (gpEl) gpEl.innerText = globalPoints;

        const vpEl = document.getElementById('village-points');
        if (vpEl) {
            const current = engine.getCurrentVillage();
            vpEl.innerText = current.points;
        }
    },

    tick: function () {
        const now = Date.now();

        // 1. Run World Simulation (AI Growth/Wars)
        // It has its own internal timer check, so calling it every tick is safe.
        engine.processAiTurn();

        const dt = (now - state.lastTick) / 1000;
        state.lastTick = now;

        // 2. Village Updates (Resources & Queues)
        state.villages.forEach(v => {
            // --- A. Resources & Loyalty ---
            const cap = engine.getStorage(v);
            const wood = (60 * Math.pow(1.16, v.buildings["Timber Camp"])) / 3600 * dt;
            const clay = (60 * Math.pow(1.16, v.buildings["Clay Pit"])) / 3600 * dt;
            const iron = (60 * Math.pow(1.16, v.buildings["Iron Mine"])) / 3600 * dt;

            v.res[0] = Math.min(cap, v.res[0] + wood);
            v.res[1] = Math.min(cap, v.res[1] + clay);
            v.res[2] = Math.min(cap, v.res[2] + iron);

            if (v.loyalty < 100) v.loyalty = Math.min(100, v.loyalty + (dt / 3600));

            // --- B. Queues (Batch Finish) ---
            const processStandardQ = (type, action) => {
                const q = v.queues[type];
                if (q.length === 0) return;

                // Cold Start
                if (!q[0].finish) q[0].finish = now + q[0].duration;

                // Catch Up Loop
                while (q.length > 0 && now >= q[0].finish) {
                    const item = q[0];
                    const previousFinishTime = item.finish;

                    action(item);
                    q.shift();

                    if (type === 'build') {
                        v.points = engine.calculatePoints(v);
                        if (state.mapData[`${v.x},${v.y}`]) state.mapData[`${v.x},${v.y}`].points = v.points;
                    }

                    // Chain Next
                    if (q.length > 0) {
                        q[0].finish = previousFinishTime + q[0].duration;
                        // Ripple update
                        for (let i = 1; i < q.length; i++) {
                            q[i].finish = q[i - 1].finish + q[i].duration;
                        }
                    }

                    ui.refresh();
                    requestAutoSave();
                }
            };

            processStandardQ('build', (item) => v.buildings[item.building]++);
            processStandardQ('research', (item) => {
                if (!v.techs) v.techs = {};
                v.techs[item.unit] = (v.techs[item.unit] || 1) + 1;
            });

            // --- C. Unit Queues ---
            ['barracks', 'stable', 'workshop', 'academy'].forEach(qType => {
                const q = v.queues[qType];
                if (!q || q.length === 0) return;

                let active = q[0];
                if (active.finish === null || active.finish === undefined) active.finish = now + active.unitTime;

                let unitsProduced = false;
                while (active && now >= active.finish) {
                    if (!v.units[active.unit]) v.units[active.unit] = 0;
                    v.units[active.unit]++;
                    unitsProduced = true;
                    active.count--;

                    if (active.count <= 0) {
                        q.shift();
                        if (q.length > 0) {
                            const next = q[0];
                            next.finish = active.finish + next.unitTime;
                            active = next;
                        } else {
                            active = null;
                        }
                    } else {
                        active.finish += active.unitTime;
                    }
                }
                if (unitsProduced) {
                    ui.refresh();
                    requestAutoSave();
                }
            });
        });

        // --- 3. AI Attacks (Player Harassment) ---
        // This targets the PLAYER specifically, separate from World Simulation
        if (CONFIG.aiAttackEnabled) {
            if (!state.nextAiCheck) state.nextAiCheck = now + CONFIG.aiAttackInterval;
            if (now > state.nextAiCheck) {
                state.nextAiCheck = now + CONFIG.aiAttackInterval;
                if (Math.random() < CONFIG.aiAttackChance) {
                    engine.spawnAiAttack();
                }
            }
        }

        // --- 4. Missions ---
        state.missions = state.missions.filter(m => {
            if (now >= m.arrival) { engine.resolveMission(m); return false; }
            return true;
        });

        ui.updateLoop();
    },

    processAiTurn: function () {
        const now = Date.now();
        if (!state.lastAiUpdate) {
            state.lastAiUpdate = now;
            return;
        }
        if (now - state.lastAiUpdate < CONFIG.aiUpdateInterval) return;

        state.lastAiUpdate = now;
        console.log("⚔️ Running AI World Simulation...");

        const activeOwners = new Set();

        state.villages.forEach(v => {
            const isAi = v.owner.startsWith('ai_');
            if (isAi) activeOwners.add(v.owner);

            const isBarb = v.owner === 'barbarian';

            // 1. GROWTH (Buildings)
            if (isAi || isBarb) {
                const growthChance = isAi ? 0.9 : 0.3; // High chance for active world
                if (Math.random() < growthChance) {

                    // 1. Get Storage Capacity
                    const storageCap = engine.getStorage(v);

                    // 2. Filter: Valid Level AND Affordable Storage
                    const validUpgrades = Object.keys(DB.buildings).filter(bKey => {
                        const currentLvl = v.buildings[bKey] || 0;
                        const d = DB.buildings[bKey];
                        const maxLvl = d.maxLevel || 30;

                        // Check Max Level
                        if (currentLvl >= maxLvl) return false;

                        // Check Storage Cap
                        // Calculate cost for the NEXT level (currentLvl)
                        // Note: If level is 0, cost is base. If level is 1, cost is base * factor^1, etc.
                        const nextCost = [
                            Math.floor(d.base[0] * Math.pow(d.factor, currentLvl)),
                            Math.floor(d.base[1] * Math.pow(d.factor, currentLvl)),
                            Math.floor(d.base[2] * Math.pow(d.factor, currentLvl))
                        ];

                        // Find the highest resource cost (e.g., if Wood is 5000 but storage is 4000, we can't build)
                        const maxResNeeded = Math.max(nextCost[0], nextCost[1], nextCost[2]);

                        return maxResNeeded <= storageCap;
                    });

                    // 3. Execute Upgrade
                    if (validUpgrades.length > 0) {
                        const randBuild = validUpgrades[Math.floor(Math.random() * validUpgrades.length)];

                        v.buildings[randBuild] = (v.buildings[randBuild] || 0) + 1;
                        v.points = engine.calculatePoints(v);

                        // Update Map Cache
                        if (state.mapData[`${v.x},${v.y}`]) {
                            state.mapData[`${v.x},${v.y}`].points = v.points;
                        }
                    }
                }
            }

            // 2. RECRUITMENT (Units) - MOVED FROM TICK
            // Only AI Warlords build armies (Barbarians are passive farms)
            if (isAi && Math.random() < 0.25) {
                const MAX_AI_UNITS = v.points / 2; // Simple cap based on points
                const currentSpear = v.units["Spear"] || 0;
                const currentSword = v.units["Sword"] || 0;

                // Add small batches
                if (currentSpear < MAX_AI_UNITS) v.units["Spear"] = currentSpear + 10;
                if (currentSword < MAX_AI_UNITS) v.units["Sword"] = currentSword + 10;

                // Occasional Offensive Units
                if (v.buildings["Stable"] > 0) {
                    v.units["Light Cav"] = (v.units["Light Cav"] || 0) + 2;
                }
            }

            // 3. CONQUEST (The Dice Roll)
            if (isAi && Math.random() < 0.04 && v.buildings["Academy"] > 0) {
                const range = 7;
                const targets = state.villages.filter(t =>
                    Math.abs(t.x - v.x) <= range &&
                    Math.abs(t.y - v.y) <= range &&
                    t.id !== v.id &&
                    t.owner !== v.owner &&
                    t.owner !== 'player' // <--- ADD THIS SAFETY CHECK
                );

                if (targets.length > 0) {
                    const target = targets[Math.floor(Math.random() * targets.length)];

                    const attScore = v.points * (0.8 + Math.random());
                    const wallLvl = target.buildings["Wall"] || 0;
                    const wallBonus = 1 + (wallLvl * 0.1);
                    const defScore = target.points * wallBonus;

                    if (attScore > defScore) {
                        // Success
                        const winnerId = v.owner;
                        target.owner = winnerId;
                        target.loyalty = 25;
                        target.buildings["Wall"] = Math.max(0, wallLvl - 2);

                        // Recalculate points for target just in case
                        target.points = engine.calculatePoints(target);
                    }
                }
            }
        });

        // 4. ELIMINATION CHECK
        for (let id in state.playerProfiles) {
            if (id === 'player' || id === 'barbarian') continue;
            if (!activeOwners.has(id) && state.playerProfiles[id].alive) {
                state.playerProfiles[id].alive = false;
            }
        }

        if (document.getElementById('map').classList.contains('active')) {
            ui.renderMap();
            ui.renderMinimap();
        }
    },

    resolveMission: function (m) {
        const origin = state.villages.find(v => v.id === m.originId);
        const target = state.villages.find(v => v.id === m.targetId);

        // Safety Check
        if (!target && m.type !== 'return') {
            this.pushReport(m, T('targetVanished'), 'neutral', T('targetVanished'));
            return;
        }

        switch (m.type) {
            case 'transport':
                this.handleTransport(m, origin, target);
                break;
            case 'support':
            case 'return':
                this.handleSupport(m, origin, target);
                break;
            case 'attack':
                this.handleAttack(m, origin, target);
                break;
        }

        requestAutoSave();
    },

    // --- HELPER: REPORTING ---
    pushReport: function (m, title, type, content) {
        state.reports.unshift({
            title: title,
            time: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
            type: type,
            content: content,
            originId: m.originId,
            targetId: m.targetId,
            missionType: m.type,
            timestamp: Date.now()
        });
        if (state.reports.length > CONFIG.maxReports) state.reports = state.reports.slice(0, CONFIG.maxReports);
        ui.renderReports();
    },

    formatName: function (v) {
        return v ? `${v.name} (${v.x}|${v.y})` : T('targetVanished');
    },

    // --- HANDLER: TRANSPORT ---
    handleTransport: function (m, origin, target) {
        if (!target || !m.resources) return;

        // 1. Add Resources
        target.res[0] += m.resources.wood || 0;
        target.res[1] += m.resources.clay || 0;
        target.res[2] += m.resources.iron || 0;

        const originName = this.formatName(origin);
        const targetName = this.formatName(target);
        const resHtml = `🌲${m.resources.wood} 🧱${m.resources.clay} 🔩${m.resources.iron}`;

        // 2. Send Reports
        if (target.owner === 'player') {
            this.pushReport(m, `💰 Market: ${originName} ➔ ${targetName}`, 'neutral',
                `<b>${T('from')}:</b> ${originName}<br><b>${T('to')}:</b> ${targetName}<hr>${T('received') || "Received"}: ${resHtml}`);
        } else if (origin && origin.owner === 'player') {
            this.pushReport(m, `💰 Market: ${originName} ➔ ${targetName}`, 'neutral',
                `<b>${T('from')}:</b> ${originName}<br><b>${T('to')}:</b> ${targetName}<hr>${T('delivered') || "Delivered"}: ${resHtml}`);
        }
    },

    // --- HANDLER: SUPPORT / RETURN ---
    handleSupport: function (m, origin, target) {
        // 1. Add Units
        if (m.type === 'return') {
            for (let u in m.units) target.units[u] = (target.units[u] || 0) + m.units[u];
        } else {
            if (!target.stationed) target.stationed = [];
            let stack = target.stationed.find(s => s.originId === m.originId);
            if (!stack) {
                stack = { originId: m.originId, units: {} };
                target.stationed.push(stack);
            }
            for (let u in m.units) stack.units[u] = (stack.units[u] || 0) + m.units[u];
        }

        // 2. Send Report (Only if relevant to player)
        if ((origin && origin.owner === 'player') || (target && target.owner === 'player')) {
            const originName = this.formatName(origin);
            const targetName = this.formatName(target);
            const icon = m.type === 'return' ? "🔙" : "🛡️";
            const msg = m.type === 'return' ? T('troops_returned') : T('troops_arrived');

            this.pushReport(m, `${icon} ${originName} ➔ ${targetName}`, 'neutral',
                `<b>${T('from')}:</b> ${originName}<br><b>${T('to')}:</b> ${targetName}<hr>${msg}`);
        }
    },

    // --- HANDLER: ATTACK (Main Battle Logic) ---
    handleAttack: function (m, origin, target) {
        const startAtt = { ...m.units };

        // 1. Aggregate Defense
        const defTotal = { ...target.units };
        if (target.stationed) {
            target.stationed.forEach(s => {
                for (let u in s.units) defTotal[u] = (defTotal[u] || 0) + s.units[u];
            });
        }
        const startDef = { ...defTotal };

        // 2. Calculate Battle Outcome
        const battleResult = this.calculateBattleOutcome(m, origin, target, defTotal);

        // 3. Apply Casualties
        this.applyCasualties(m, target, battleResult.lossFactor, battleResult.defLossFactor, battleResult.win);

        // 4. Post-Battle Events (Wall, Loyalty, Loot)
        const events = this.processPostBattleEvents(m, origin, target, battleResult, startAtt);

        // 5. Return Survivors to Origin
        if (origin) {
            for (let u in m.units) origin.units[u] += m.units[u];
        }

        // 6. Generate Report
        const reportHTML = this.generateBattleReportHTML(
            origin, target, startAtt, startDef, m.units, battleResult, events
        );

        const originName = this.formatName(origin);
        const targetName = this.formatName(target);
        const title = `⚔️ ${originName} ➔ ${targetName}`;
        const isDefender = target.owner === 'player';
        const playerSuccess = isDefender ? !battleResult.win : battleResult.win;

        this.pushReport(m, title, playerSuccess ? 'win' : 'loss', reportHTML);
    },

    // --- SUB-HELPER: MATH & COMBAT ---
    calculateBattleOutcome: function (m, origin, target, defTotal) {
        // A. Scout Logic
        const attScouts = m.units["Scout"] || 0;
        const defScouts = defTotal["Scout"] || 0;
        let scoutWin = false;

        if (attScouts > 0) {
            let scoutsDied = 0;
            if (defScouts >= attScouts * 2) scoutsDied = attScouts;
            else if (defScouts > 0) scoutsDied = Math.floor(attScouts * Math.pow(defScouts / (attScouts * 2), 1.5));

            m.units["Scout"] -= scoutsDied;
            if (m.units["Scout"] > 0) scoutWin = true;
        }

        // B. Main Battle Logic
        const otherAttackingUnits = Object.keys(m.units).some(u => u !== "Scout" && m.units[u] > 0);

        if (!otherAttackingUnits) {
            return { win: scoutWin, scoutWin, lossFactor: 0, defLossFactor: 0, offInf: 0, offCav: 0, totalOff: 0 };
        }

        // C. Offense Calc
        let offInf = 0, offCav = 0;
        for (let u in m.units) {
            if (u === "Scout") continue;
            const stats = DB.units[u];
            const tech = getTechMultiplier(origin?.techs?.[u] || 1);
            const power = m.units[u] * stats.att * tech;
            if (stats.type === 'cav') offCav += power;
            else offInf += power;
        }
        const totalOff = offInf + offCav;

        // D. Defense Calc
        let defGenTotal = 0, defCavTotal = 0;
        for (let u in defTotal) {
            const stats = DB.units[u];
            const tech = getTechMultiplier(target.techs?.[u] || 1);
            defGenTotal += defTotal[u] * (stats.def || 0) * tech;
            defCavTotal += defTotal[u] * (stats.defCav || 0) * tech;
        }

        // E. Wall Logic
        const currentWallLvl = target.buildings["Wall"] || 0;
        let effectiveWallLvl = currentWallLvl;
        if (m.units["Ram"] > 0) {
            const ramTech = getTechMultiplier(origin?.techs?.["Ram"] || 1);
            const ramPower = m.units["Ram"] * ramTech;
            effectiveWallLvl = Math.max(0, currentWallLvl - Math.floor(ramPower / 20));
        }

        const wallBonus = 1 + (effectiveWallLvl * 0.05);
        const baseDefAdd = effectiveWallLvl * 20;
        defGenTotal = (defGenTotal * wallBonus) + baseDefAdd;
        defCavTotal = (defCavTotal * wallBonus) + baseDefAdd;

        // F. Outcome
        let finalDef = defGenTotal;
        if (totalOff > 0) {
            finalDef = (defGenTotal * (offInf / totalOff)) + (defCavTotal * (offCav / totalOff));
        }

        const win = totalOff > finalDef;
        const ratio = (totalOff === 0 && finalDef === 0) ? 1 : (win ? (finalDef / totalOff) : (totalOff / finalDef));
        const lossFactor = (totalOff === 0 && finalDef === 0) ? 0 : Math.pow(ratio, 1.5);

        return {
            win, scoutWin, lossFactor,
            defLossFactor: win ? 1 : lossFactor,
            offInf, offCav, totalOff
        };
    },

    // --- SUB-HELPER: CASUALTIES ---
    applyCasualties: function (m, target, lossFactor, defLossFactor, win) {
        // Attacker
        for (let u in m.units) {
            if (u !== "Scout") {
                if (win) m.units[u] -= Math.floor(m.units[u] * lossFactor);
                else m.units[u] = 0;
            }
        }
        // Defender
        const killDef = (obj) => {
            for (let u in obj) obj[u] = Math.max(0, obj[u] - Math.floor(obj[u] * defLossFactor));
        };
        killDef(target.units);
        if (target.stationed) target.stationed.forEach(s => killDef(s.units));
    },

    // --- SUB-HELPER: POST BATTLE ---
    processPostBattleEvents: function (m, origin, target, result, startAtt) {
        let wallMsg = "", loyaltyMsg = "", lootText = "";
        let stolen = [0, 0, 0];

        // 1. Wall Destruction
        const currentWallLvl = target.buildings["Wall"] || 0;
        if (m.units["Ram"] > 0 && currentWallLvl > 0) {
            let effectiveRams = m.units["Ram"];
            if (!result.win && result.lossFactor < 0.9) {
                effectiveRams = Math.floor(startAtt["Ram"] * (1 - result.lossFactor));
            }
            const ramTech = getTechMultiplier(origin?.techs?.["Ram"] || 1);
            const levelsDestroyed = Math.floor((effectiveRams * ramTech) / 20);

            if (levelsDestroyed > 0) {
                const newLvl = Math.max(0, currentWallLvl - levelsDestroyed);
                target.buildings["Wall"] = newLvl;
                target.points = engine.calculatePoints(target);
                if (state.mapData[`${target.x},${target.y}`]) state.mapData[`${target.x},${target.y}`].points = target.points;
                wallMsg = `<div style="color:#a00; font-weight:bold;">🚜 ${T('wall_damaged')}: ${currentWallLvl} ➔ ${newLvl} (-${currentWallLvl - newLvl})</div>`;
            }
        }

        // 2. Loyalty
        if (result.win && m.units["Noble"] > 0) {
            const nobleCount = m.units["Noble"];
            let drop = 0;
            for (let i = 0; i < nobleCount; i++) drop += Math.floor(20 + Math.random() * 16);
            target.loyalty -= drop;
            loyaltyMsg = `<div style="color:blue"><b>${T('loyalty')} ${Math.floor(target.loyalty)}!</b> (-${drop})</div>`;

            if (target.loyalty <= 0) {
                const oldOwner = target.owner;
                const newOwner = origin ? origin.owner : 'player';

                // 1. Change Ownership
                target.owner = newOwner;
                target.loyalty = 25;

                // Update Map Data (Visual Type)
                if (state.mapData[`${target.x},${target.y}`]) {
                    state.mapData[`${target.x},${target.y}`].type = (newOwner === 'player') ? "player" : "enemy";
                }

                // Consume Noble
                m.units["Noble"] = Math.max(0, m.units["Noble"] - 1);

                loyaltyMsg += `<div style="background:gold; color:black; padding:5px; text-align:center; margin-top:5px;"><b>🎉 ${T('conquered')} 🎉</b></div>`;

                // 2. ELIMINATION CHECK
                // If the loser was an AI Warlord (not Barbarian, not Player)
                if (oldOwner && oldOwner !== 'barbarian' && oldOwner !== 'player') {
                    // Check if they have any villages left in the entire world
                    const survivorVillage = state.villages.find(v => v.owner === oldOwner);

                    if (!survivorVillage) {
                        // No villages found -> They are dead
                        if (state.playerProfiles[oldOwner]) {
                            state.playerProfiles[oldOwner].alive = false;
                            const deadName = state.playerProfiles[oldOwner].name;
                            loyaltyMsg += `<div style="color:red; font-weight:bold; text-align:center; margin-top:5px; border:1px solid red; padding:2px;">☠️ ${deadName} Eliminated!</div>`;
                        }
                    }
                }

                if (document.getElementById('map').classList.contains('active')) ui.renderMap();
            }
        }

        // 3. Loot
        if (result.win || result.scoutWin) {
            let capacity = 0;
            for (let u in m.units) capacity += m.units[u] * DB.units[u].carry;

            if (capacity > 0) {
                while (capacity > 0 && (target.res[0] > 0 || target.res[1] > 0 || target.res[2] > 0)) {
                    let types = [0, 1, 2].filter(i => target.res[i] > 0);
                    if (types.length === 0) break;
                    let share = Math.ceil(capacity / types.length);
                    let taken = 0;
                    types.forEach(i => {
                        if (capacity <= 0) return;
                        let amt = Math.min(Math.floor(target.res[i]), share, capacity);
                        stolen[i] += amt;
                        target.res[i] -= amt;
                        capacity -= amt;
                        taken += amt;
                    });
                    if (taken === 0) break;
                }
                if (stolen.some(s => s > 0)) {
                    if (origin) { origin.res[0] += stolen[0]; origin.res[1] += stolen[1]; origin.res[2] += stolen[2]; }
                    lootText = `<hr>💰 ${T('loot')}: 🌲${stolen[0]} 🧱${stolen[1]} 🔩${stolen[2]}`;
                }
            }
        }

        return { wallMsg, loyaltyMsg, lootText, stolen };
    },

    // --- SUB-HELPER: HTML GENERATION ---
    generateBattleReportHTML: function (origin, target, startAtt, startDef, endAtt, result, events) {
        const originName = this.formatName(origin);
        const targetName = this.formatName(target);
        const isDefender = target.owner === 'player';
        const playerSuccess = isDefender ? !result.win : result.win;
        const color = playerSuccess ? "green" : "red";
        const resultText = playerSuccess ? T('victory') : T('defeat');

        // Attacker Table
        let attTable = `<table style="width:100%; font-size:10px;"><tr><th>Unit</th><th>Sent</th><th>Lost</th></tr>`;
        for (let u in DB.units) {
            if (startAtt[u] > 0) {
                const lost = startAtt[u] - endAtt[u];
                attTable += `<tr><td>${T_Name(u)}</td><td>${startAtt[u]}</td><td style="color:${lost > 0 ? 'red' : '#999'}">${lost}</td></tr>`;
            }
        }
        attTable += "</table>";

        // Defender Table
        let defTable = "";
        if (result.win || result.scoutWin || isDefender) {
            defTable = `<table style="width:100%; font-size:10px;"><tr><th>Unit</th><th>Start</th><th>Lost</th></tr>`;
            for (let u in DB.units) {
                const start = startDef[u] || 0;
                if (start > 0) {
                    let current = (target.units[u] || 0);
                    if (target.stationed) target.stationed.forEach(s => current += (s.units[u] || 0));
                    const lost = start - current;
                    defTable += `<tr><td>${T_Name(u)}</td><td>${start}</td><td style="color:${lost > 0 ? 'red' : '#999'}">${lost}</td></tr>`;
                }
            }
            defTable += "</table>";
        } else {
            defTable = "<div style='color:#999; padding:5px;'>???</div>";
        }

        // Intel
        let intelHTML = "";
        if (result.scoutWin) {
            // Re-calculate scout survival for intel levels
            const survRatio = endAtt["Scout"] / startAtt["Scout"];
            const sLvl = (origin && origin.techs) ? (origin.techs["Scout"] || 1) : 1;
            const seeRes = survRatio > 0.50 && sLvl >= 1;
            const seeBuild = survRatio > 0.70 && sLvl >= 2;
            const seeOutside = survRatio > 0.90 && sLvl >= 3;

            if (seeRes || seeBuild || seeOutside) {
                intelHTML += `<div style="background:#eee; padding:5px; margin-top:5px; font-size:11px;">`;
                if (seeRes) intelHTML += `<div><b>Res:</b> 🌲${Math.floor(target.res[0])} 🧱${Math.floor(target.res[1])} 🔩${Math.floor(target.res[2])}</div>`;
                if (seeBuild) {
                    const builds = Object.keys(target.buildings).filter(b => target.buildings[b] > 0).map(b => `${T_Name(b)} ${target.buildings[b]}`);
                    intelHTML += `<div><b>Buildings:</b> ${builds.join(", ")}</div>`;
                }
                if (seeOutside) {
                    let outCounts = {};
                    state.missions.forEach(mis => { if (mis.originId === target.id && mis.units) for (let u in mis.units) outCounts[u] = (outCounts[u] || 0) + mis.units[u]; });
                    state.villages.forEach(v => { if (v.stationed) v.stationed.forEach(s => { if (s.originId === target.id) for (let u in s.units) outCounts[u] = (outCounts[u] || 0) + s.units[u]; }); });
                    const outStr = Object.keys(outCounts).map(u => `${T_Name(u)} ${outCounts[u]}`).join(", ");
                    intelHTML += `<div style="border-top:1px solid #ccc; margin-top:2px;"><b>Outside:</b> ${outStr || "None"}</div>`;
                }
                intelHTML += `</div>`;
            }
        }

        return `
            <div style="font-size:11px; margin-bottom:5px; border-bottom:1px solid #eee;">
                <div><b>${T('att')}:</b> ${originName}</div>
                <div><b>${T('def')}:</b> ${targetName}</div>
            </div>
            <h3 style='color:${color}; margin:5px 0;'>${resultText}</h3>
            ${events.loyaltyMsg}
            ${events.wallMsg}
            <div style="display:flex; gap:5px; margin-top:5px;">
                <div style="flex:1; background:#f9f9f9; padding:2px;"><b>${T('att')}</b>${attTable}</div>
                <div style="flex:1; background:#f9f9f9; padding:2px;"><b>${T('def')}</b>${defTable}</div>
            </div>
            ${intelHTML}
            ${events.lootText}
        `;
    },

    // --- SAVE FUNCTION (Hard Save) ---
    save: function () {
        try {
            // 1. Round numbers (Clean)
            const cleanState = recursiveRound(state);
            // 2. Compress (Shrink)
            const compressed = LZString.compressToUTF16(JSON.stringify(cleanState));
            // 3. Write
            localStorage.setItem('tw_v5_save', compressed);
            console.log("Game Saved.");
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.error("Save Failed: Storage Full");
            } else {
                console.error("Save Error:", e);
            }
        }
    },

    exportSave: function () {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", "tribalwars_save_" + Date.now() + ".json");
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
    },

    importSave: function (input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const newState = JSON.parse(e.target.result);
                if (!newState.villages) throw new Error("Invalid Save");
                state = newState;
                engine.save();
                alert("Loaded!");
                location.reload();
            } catch (err) { alert("Error: " + err.message); }
        };
        reader.readAsText(file);
    },

    resetGame: function () {
        if (confirm("Delete progress?")) {
            // 1. Kill the "Save on Exit" trigger (The most likely culprit)
            window.onbeforeunload = null;

            // 2. Neutralize the save function itself 
            // (Prevents auto-save loops from writing data in the milliseconds before reload)
            // Assuming your save function is on this object or global:
            this.saveGame = function () { console.log("Save blocked by reset."); };

            // 3. Wipe the data
            localStorage.removeItem("tw_v5_save");

            // 4. Reload
            location.reload();
        }
    },
    getStorage: function (village) {
        const warehouseLvl = village.buildings["Warehouse"] || 0;
        if (warehouseLvl === 0) return 0;
        // Standard Formula: 1000 * (1.229493 ^ (Level - 1))
        return Math.floor(1000 * Math.pow(1.229493, warehouseLvl - 1));
    },

    spawnAiAttack: function () {
        // 1. Pick a target (Random player village)
        const playerVillages = state.villages.filter(v => v.owner === 'player');
        if (playerVillages.length === 0) return;
        const target = playerVillages[Math.floor(Math.random() * playerVillages.length)];

        // 2. Find a source (Enemy village nearby)
        const potentialSources = state.villages.filter(v => {
            if (v.owner !== 'enemy') return false;
            const dist = Math.sqrt(Math.pow(v.x - target.x, 2) + Math.pow(v.y - target.y, 2));
            return dist <= CONFIG.aiAttackRange;
        });

        if (potentialSources.length === 0) return; // No enemies nearby
        const origin = potentialSources[Math.floor(Math.random() * potentialSources.length)];

        // 3. Generate Army (Scaled by config)
        // Simple formula: 1 Axe per 10 points of the target village * Strength Config
        const armySize = Math.max(10, Math.floor((target.points / 10) * CONFIG.aiAttackStrength));

        const units = { "Axe": Math.floor(this.rand(armySize * 0.9, armySize * 1.1)), "Light Cav": Math.floor(this.rand(armySize * 0.9, armySize * 1.1) / 3) };
        if (Math.random() > 0.5) units["Ram"] = Math.floor(armySize / 10);

        // 4. Launch Mission
        const dist = Math.sqrt(Math.pow(origin.x - target.x, 2) + Math.pow(origin.y - target.y, 2));
        const duration = dist * 60 * 1000; // 1 minute per tile (standard speed)

        state.missions.push({
            originId: origin.id,
            targetId: target.id,
            units: units,
            type: 'attack',
            arrival: Date.now() + duration
        });

        // Optional: Alert the user immediately (Sound or Toast)
        console.log(`AI Attack launched from ${origin.name} to ${target.name}`);
        ui.updateMissions(); // Force immediate refresh
        requestAutoSave();
    },

    getPlayerProfile: function (id) {
        // 1. MATCH YOUR CSS COLORS
        if (id === 'player') return { name: "You", color: "#42a5f5", alive: true }; // Blue
        if (id === 'barbarian') return { name: "Barbarians", color: "#bdbdbd", alive: true }; // Grey

        // 2. EXISTING AI
        if (state.playerProfiles[id]) return state.playerProfiles[id];

        // 3. NEW AI GENERATION (Dynamic Reds/Warm colors for enemies)
        // We generate varied shades of Red/Orange/Pink to keep them looking like "Enemies"
        // or keep full random if you prefer.
        const h = Math.floor(Math.random() * 360);
        const color = `hsl(${h}, 70%, 50%)`;

        // ... name generation logic ...
        state.playerProfiles[id] = {
            name: generateAiName(id),
            color: color,
            alive: true,
            points: 0
        };
        return state.playerProfiles[id];
    },

    getGlobalScore: function (ownerId) {
        if (!ownerId) return 0;
        // Sum points of all villages owned by this ID
        return state.villages
            .filter(v => v.owner === ownerId)
            .reduce((sum, v) => sum + (v.points || 0), 0);
    },
};