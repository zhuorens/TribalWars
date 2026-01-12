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

                if (!state.selectedVillageId && state.villages.length > 0) {
                    state.selectedVillageId = state.villages[0].id;
                }

                // MIGRATION: Fix old saves
                state.villages.forEach(v => {
                    if (!v.queues) v.queues = { build: [], research: [], barracks: [], stable: [], workshop: [], academy: [] };
                    if (!v.stationed) v.stationed = [];
                    if (v.buildings["Market"] === undefined) v.buildings["Market"] = 0;
                });

            } catch (e) { console.error("Save Load Error:", e); }
        } else {
            // --- NEW GAME SETUP ---
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

        // 1. Calculate Pop from Buildings
        for (let bName in village.buildings) {
            let level = village.buildings[bName];
            if (level > 0 && DB.buildings[bName]) {
                const b = DB.buildings[bName];
                // Building Pop Formula: Base * (Factor ^ (Level - 1))
                if (b.basePop > 0) {
                    used += Math.round(b.basePop * Math.pow(b.factor, level - 1));
                }
            }
        }

        // 2. Calculate Pop from Units (Home)
        for (let uName in village.units) {
            if (village.units[uName] > 0 && DB.units[uName]) {
                used += village.units[uName] * DB.units[uName].pop;
            }
        }

        // 3. Calculate Pop from Queues (Troops being built reserve pop)
        ['barracks', 'stable', 'workshop', 'academy'].forEach(qType => {
            if (village.queues[qType]) {
                village.queues[qType].forEach(item => {
                    if (DB.units[item.unit]) {
                        used += item.count * DB.units[item.unit].pop;
                    }
                });
            }
        });

        // 4. Calculate Pop from Troops Outside (Attacking/Supporting others)
        state.missions.forEach(m => {
            if (m.originId === village.id) {
                for (let u in m.units) {
                    if (DB.units[u]) used += m.units[u] * DB.units[u].pop;
                }
            }
        });

        // 5. Calculate Pop from Troops Stationed Elsewhere (Support)
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

        } else if (owner === "barb") {
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
        for (let x = cX - 7; x <= cX + 7; x++) {
            for (let y = cY - 7; y <= cY + 7; y++) {
                if (x < 0 || x > CONFIG.mapSize || y < 0 || y > CONFIG.mapSize) continue;
                if (state.mapData[`${x},${y}`]) continue;
                if (x === 100 && y === 100) continue;

                const r = Math.random();
                if (r > 0.95) {
                    const name = engine.generateEnemyName();
                    state.villages.push(engine.createVillage(x, y, name, "enemy"));
                } else if (r > 0.85) {
                    state.villages.push(engine.createVillage(x, y, "Barbarian", "barb"));
                } else {
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
        const dt = (now - state.lastTick) / 1000;
        state.lastTick = now;

        state.villages.forEach(v => {
            // --- 1. Resources & Loyalty ---
            const cap = engine.getStorage(v);
            const wood = (60 * Math.pow(1.16, v.buildings["Timber Camp"])) / 3600 * dt;
            const clay = (60 * Math.pow(1.16, v.buildings["Clay Pit"])) / 3600 * dt;
            const iron = (60 * Math.pow(1.16, v.buildings["Iron Mine"])) / 3600 * dt;

            v.res[0] = Math.min(cap, v.res[0] + wood);
            v.res[1] = Math.min(cap, v.res[1] + clay);
            v.res[2] = Math.min(cap, v.res[2] + iron);

            if (v.loyalty < 100) v.loyalty = Math.min(100, v.loyalty + (dt / 3600));

            // --- 2. Building & Research Queues (Batch Finish) ---
            // These complete ONLY when the full duration is done
            const processStandardQ = (type, action) => {
                const q = v.queues[type];
                if (q.length === 0) return;

                // 1. Initial Start (Cold Start)
                // If the very first item has no finish time, start it now.
                if (!q[0].finish) {
                    q[0].finish = now + q[0].duration;
                }

                // 2. The "Catch Up" Loop
                // We check repeatedly in case multiple items finished while offline.
                while (q.length > 0 && now >= q[0].finish) {

                    const item = q[0];
                    const previousFinishTime = item.finish; // Save exactly when this finished

                    // Execute the Action
                    action(item);

                    // Remove from Queue
                    q.shift();

                    // Update Points (if it was a building)
                    if (type === 'build') {
                        v.points = engine.calculatePoints(v);
                        if (state.mapData[`${v.x},${v.y}`]) state.mapData[`${v.x},${v.y}`].points = v.points;
                    }

                    // 3. Chain the Next Item
                    // The next item starts exactly when the previous one finished.
                    if (q.length > 0) {
                        // Set next item's finish time based on PREVIOUS item's finish time
                        q[0].finish = previousFinishTime + q[0].duration;

                        // Optional: Ripple update the rest of the queue to keep timestamps clean
                        // (Ensures Item 3 knows Item 2's schedule changed)
                        for (let i = 1; i < q.length; i++) {
                            q[i].finish = q[i - 1].finish + q[i].duration;
                        }
                    }

                    // Triggers for every single completion
                    ui.refresh();
                    requestAutoSave();
                }
            };

            processStandardQ('build', (item) => v.buildings[item.building]++);
            processStandardQ('research', (item) => {
                if (!v.techs) v.techs = {};
                v.techs[item.unit] = (v.techs[item.unit] || 1) + 1;
            });

            // --- 3. Unit Queues (Continuous Production) ---
            // These produce 1 unit at a time
            ['barracks', 'stable', 'workshop', 'academy'].forEach(qType => {
                const q = v.queues[qType];
                if (!q || q.length === 0) return;

                let active = q[0];

                // Initialize start time if new
                if (active.finish === null || active.finish === undefined) {
                    active.finish = now + active.unitTime;
                }

                // Catch-up Loop: Process all units that finished since last tick
                let unitsProduced = false;
                while (active && now >= active.finish) {
                    // A. Produce Unit
                    if (!v.units[active.unit]) v.units[active.unit] = 0;
                    v.units[active.unit]++;
                    unitsProduced = true;

                    // B. Decrement Count
                    active.count--;

                    // C. Check if Batch Complete
                    if (active.count <= 0) {
                        q.shift(); // Remove batch

                        if (q.length > 0) {
                            // Start next batch immediately (preserve time overflow)
                            const next = q[0];
                            next.finish = active.finish + next.unitTime;
                            active = next;
                        } else {
                            active = null;
                        }
                    } else {
                        // Batch continues: Set time for NEXT unit
                        active.finish += active.unitTime;
                    }
                }
                if (unitsProduced) {
                    ui.refresh();
                    requestAutoSave();
                }
            });
        });

        // --- 4. AI Growth ---
        if (!state.nextAiGrowth) state.nextAiGrowth = now + CONFIG.aiGrowthInterval;
        if (now > state.nextAiGrowth) {
            state.nextAiGrowth = now + CONFIG.aiGrowthInterval;
            state.villages.forEach(v => {
                if (v.owner === 'enemy' || v.owner === 'barb') {
                    if (Math.random() < CONFIG.aiGrowthChance) {
                        const bKeys = Object.keys(v.buildings);
                        const randBuild = bKeys[Math.floor(Math.random() * bKeys.length)];
                        if (v.buildings[randBuild] < 30) {
                            v.buildings[randBuild]++;
                            v.points = engine.calculatePoints(v);
                            if (state.mapData[`${v.x},${v.y}`]) state.mapData[`${v.x},${v.y}`].points = v.points;
                        }
                    }
                    if (v.owner === 'enemy' && Math.random() < 0.3) {
                        v.units["Spear"] = (v.units["Spear"] || 0) + 10;
                        v.units["Sword"] = (v.units["Sword"] || 0) + 10;
                    }
                }
            });
            if (document.getElementById('map').classList.contains('active')) ui.renderMap();
        }

        // --- 5. AI Attacks ---
        if (CONFIG.aiAttackEnabled) {
            if (!state.nextAiCheck) state.nextAiCheck = now + CONFIG.aiAttackInterval;
            if (now > state.nextAiCheck) {
                state.nextAiCheck = now + CONFIG.aiAttackInterval;
                if (Math.random() < CONFIG.aiAttackChance) {
                    engine.spawnAiAttack();
                }
            }
        }

        // --- 6. Missions ---
        state.missions = state.missions.filter(m => {
            if (now >= m.arrival) { engine.resolveMission(m); return false; }
            return true;
        });

        ui.updateLoop();
    },

    resolveMission: function (m) {
        const origin = state.villages.find(v => v.id === m.originId);
        const target = state.villages.find(v => v.id === m.targetId);
        
        // Helper: Consistent Name Formatting
        const formatName = (v) => v ? `${v.name} (${v.x}|${v.y})` : T('targetVanished');
        const originName = formatName(origin);
        const targetName = formatName(target);
    
        // --- TRANSPORT ---
        if (m.type === 'transport') {
            if (target && m.resources) {
                target.res[0] += m.resources.wood || 0;
                target.res[1] += m.resources.clay || 0;
                target.res[2] += m.resources.iron || 0;
                
                if (target.owner === 'player') {
                    state.reports.unshift({ 
                        title: `💰 Market: ${originName} ➔ ${targetName}`, 
                        time: new Date().toLocaleTimeString(), 
                        type: 'neutral', 
                        content: `<b>${T('from')}:</b> ${originName}<br><b>${T('to')}:</b> ${targetName}<hr>Received: 🌲${m.resources.wood} 🧱${m.resources.clay} 🔩${m.resources.iron}` 
                    });
                }
            }
            if (origin && origin.owner === 'player') {
                state.reports.unshift({ 
                    title: `💰 Market: ${originName} ➔ ${targetName}`, 
                    time: new Date().toLocaleTimeString(), 
                    type: 'neutral', 
                    content: `<b>${T('from')}:</b> ${originName}<br><b>${T('to')}:</b> ${targetName}<hr>Delivered: 🌲${m.resources.wood} 🧱${m.resources.clay} 🔩${m.resources.iron}` 
                });
            }
            if (state.reports.length > CONFIG.maxReports) state.reports = state.reports.slice(0, CONFIG.maxReports);
            ui.renderReports();
            return;
        }
    
        // --- SUPPORT / RETURN ---
        if (m.type === 'support' || m.type === 'return') {
            if (!target) return;
    
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
    
            if (m.originId === state.selectedVillageId || m.targetId === state.selectedVillageId) {
                const icon = m.type === 'return' ? "🔙" : "🛡️";
                const title = `${icon} ${originName} ➔ ${targetName}`;
                const msg = m.type === 'return' ? T('troops_returned') : T('troops_arrived');
    
                state.reports.unshift({ 
                    title: title, 
                    time: new Date().toLocaleTimeString(), 
                    type: 'neutral', 
                    content: `<b>${T('from')}:</b> ${originName}<br><b>${T('to')}:</b> ${targetName}<hr>${msg}` 
                });
                
                if (state.reports.length > CONFIG.maxReports) state.reports = state.reports.slice(0, CONFIG.maxReports);
                ui.renderReports();
            }
            return;
        }
    
        // --- BATTLE RESOLUTION ---
        
        let report = { title: `⚔️ ${originName} ➔ ${targetName}`, time: new Date().toLocaleTimeString(), type: 'neutral', content: '' };
        if (!target) { report.content = T('targetVanished'); state.reports.unshift(report); return; }
    
        const startAtt = { ...m.units };
        
        // Aggregate Defender Units
        const defTotal = { ...target.units };
        if (target.stationed) {
            target.stationed.forEach(s => {
                for (let u in s.units) defTotal[u] = (defTotal[u] || 0) + s.units[u];
            });
        }
        const startDef = { ...defTotal };
    
        // Initialize Flags
        const attScouts = m.units["Scout"] || 0;
        const defScouts = defTotal["Scout"] || 0;
        const otherAttackingUnits = Object.keys(m.units).some(u => u !== "Scout" && m.units[u] > 0);
        const isDefender = target.owner === 'player'; 
    
        let win = false; 
        let scoutWin = false; 
        let lootText = "", loyaltyMsg = "", wallMsg = "";
        let seeRes = false, seeBuild = false, seeOutside = false;
    
        // ===============================================
        // PHASE 1: SCOUT RESOLUTION
        // ===============================================
        if (attScouts > 0) {
            let scoutsDied = 0;
    
            // Only defender scouts kill attacker scouts
            if (defScouts >= attScouts * 2) {
                scoutsDied = attScouts;
            } else if (defScouts > 0) {
                const ratio = Math.pow(defScouts / (attScouts * 2), 1.5);
                scoutsDied = Math.floor(attScouts * ratio);
            }
            
            m.units["Scout"] -= scoutsDied;
            const survivors = m.units["Scout"];
            
            if (survivors > 0) {
                scoutWin = true; 
                const scoutLevel = (origin && origin.techs) ? (origin.techs["Scout"] || 1) : 1;
                const survRatio = survivors / startAtt["Scout"];
                
                if (survRatio > 0.50 && scoutLevel >= 1) seeRes = true;
                if (survRatio > 0.70 && scoutLevel >= 2) seeBuild = true;
                if (survRatio > 0.90 && scoutLevel >= 3) seeOutside = true;
            }
        }
    
        // ===============================================
        // PHASE 2: MAIN COMBAT
        // ===============================================
        if (otherAttackingUnits) {
            let off = 0, def = 0;
    
            // Calculate Offense (Skip Scouts)
            for (let u in m.units) {
                if(u !== "Scout") {
                    off += m.units[u] * DB.units[u].att * getTechMultiplier(origin?.techs?.[u] || 1);
                }
            }
            // Calculate Defense
            for (let u in defTotal) {
                def += defTotal[u] * DB.units[u].def * getTechMultiplier(target.techs?.[u] || 1);
            }
    
            const currentWallLvl = target.buildings["Wall"] || 0;
            let effectiveWallLvl = currentWallLvl;
            
            // Ram Logic (Tactical)
            if (m.units["Ram"] > 0) {
                const bonusReduction = Math.floor(m.units["Ram"] / 20);
                effectiveWallLvl = Math.max(0, currentWallLvl - bonusReduction);
            }
    
            // Wall Bonus
            const wallBonus = 1 + (effectiveWallLvl * 0.05); 
            def *= wallBonus;
            def += (effectiveWallLvl * 20); 
    
            win = off > def;
    
            const ratio = (off === 0 && def === 0) ? 1 : (win ? (def / off) : (off / def));
            const lossFactor = (off === 0 && def === 0) ? 0 : Math.pow(ratio, 1.5);
    
            // Apply Losses to Attacker (Skip Scouts)
            if (win) {
                for (let u in m.units) {
                    if(u !== "Scout") m.units[u] -= Math.floor(m.units[u] * lossFactor);
                }
            } else {
                for (let u in m.units) {
                    if(u !== "Scout") m.units[u] = 0;
                }
            }
    
            // Apply Losses to Defender (Skip Scouts)
            const defLossFactor = win ? 1 : lossFactor;
            const killDef = (obj) => { 
                for (let u in obj) {
                    obj[u] = Math.max(0, obj[u] - Math.floor(obj[u] * defLossFactor)); 
                }
            };
            killDef(target.units);
            if (target.stationed) target.stationed.forEach(s => killDef(s.units));
    
            // Ram Destruction (Permanent)
            if (m.units["Ram"] > 0 && currentWallLvl > 0) {
                let effectiveRams = m.units["Ram"];
                // If lost but close fight, use virtual rams for damage calc
                if (!win && lossFactor < 0.9) {
                     const virtualRams = startAtt["Ram"] * (1 - lossFactor);
                     effectiveRams = Math.floor(virtualRams);
                }
    
                const levelsDestroyed = Math.floor(effectiveRams / 20);
                if (levelsDestroyed > 0) {
                    const newLvl = Math.max(0, currentWallLvl - levelsDestroyed);
                    const lost = currentWallLvl - newLvl;
                    target.buildings["Wall"] = newLvl;
                    
                    // Update Points
                    target.points = engine.calculatePoints(target);
                    if (state.mapData[`${target.x},${target.y}`]) state.mapData[`${target.x},${target.y}`].points = target.points;
    
                    wallMsg = `<div style="color:#a00; font-weight:bold;">🚜 ${T('wall_damaged')}: ${currentWallLvl} ➔ ${newLvl} (-${lost})</div>`;
                }
            }
    
            // Noble Logic
            if (win && m.units["Noble"] > 0) {
                const nobleCount = m.units["Noble"];
                let totalDrop = 0;
                for(let i=0; i<nobleCount; i++) totalDrop += Math.floor(20 + Math.random() * 16);
                
                target.loyalty -= totalDrop;
                loyaltyMsg = `<div style="color:blue"><b>${T('loyalty')} ${Math.floor(target.loyalty)}!</b> (-${totalDrop})</div>`;
    
                if (target.loyalty <= 0) {
                    target.owner = "player"; 
                    target.loyalty = 25; 
                    state.mapData[`${target.x},${target.y}`].type = "player";
                    m.units["Noble"] = Math.max(0, m.units["Noble"] - 1);
                    loyaltyMsg += `<div style="background:gold; color:black; padding:5px; text-align:center; margin-top:5px;"><b>🎉 ${T('conquered')} 🎉</b></div>`;
                    if (document.getElementById('map').classList.contains('active')) ui.renderMap();
                }
            }
        } else {
            // Pure scout mission: Result depends on scout survival
            win = scoutWin;
        }
    
        // ===============================================
        // PHASE 3: LOOT
        // ===============================================
        if (win || scoutWin) {
            let capacity = 0;
            for (let u in m.units) capacity += m.units[u] * DB.units[u].carry;
            
            let stolen = [0, 0, 0];
            
            while (capacity > 0) {
                let availableIndices = [];
                if (target.res[0] > 0) availableIndices.push(0);
                if (target.res[1] > 0) availableIndices.push(1);
                if (target.res[2] > 0) availableIndices.push(2);
    
                if (availableIndices.length === 0) break;
    
                let share = Math.floor(capacity / availableIndices.length);
                if (share === 0) share = 1;
    
                let takenThisRound = 0;
                availableIndices.forEach(i => {
                    if (capacity <= 0) return;
                    let take = Math.min(Math.floor(target.res[i]), share, capacity);
                    stolen[i] += take;
                    target.res[i] -= take;
                    capacity -= take;
                    takenThisRound += take;
                });
                if (takenThisRound === 0) break;
            }
            
            if (stolen[0] + stolen[1] + stolen[2] > 0) {
                lootText = `<hr>💰 ${T('loot')}: 🌲${stolen[0]} 🧱${stolen[1]} 🔩${stolen[2]}`;
                if (origin) { 
                    origin.res[0] += stolen[0]; 
                    origin.res[1] += stolen[1]; 
                    origin.res[2] += stolen[2]; 
                }
            }
        }
    
        if (origin) {
            for (let u in m.units) origin.units[u] += m.units[u];
        }
    
        // --- REPORT GENERATION ---
        const playerSuccess = isDefender ? !win : win;
        const color = playerSuccess ? "green" : "red";
        const resultText = playerSuccess ? T('victory') : T('defeat');
    
        // Attacker Table
        let attTable = `<table style="width:100%; font-size:10px;"><tr><th>Unit</th><th>Sent</th><th>Lost</th></tr>`;
        for (let u in DB.units) {
            if (startAtt[u] > 0) {
                const lost = startAtt[u] - m.units[u];
                attTable += `<tr><td>${T_Name(u)}</td><td>${startAtt[u]}</td><td style="color:${lost > 0 ? 'red' : '#999'}">${lost}</td></tr>`;
            }
        }
        attTable += "</table>";
    
        // Defender Table
        let defTable = "";
        // Only show full defender info if you won, OR scouts succeeded, OR you are the defender
        if (win || scoutWin || isDefender) {
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
        if (scoutWin && (seeRes || seeBuild)) {
            if (seeRes) intelHTML += `<div style="font-size:11px; margin-top:5px;"><b>Res:</b> 🌲${Math.floor(target.res[0])} 🧱${Math.floor(target.res[1])} 🔩${Math.floor(target.res[2])}</div>`;
            if (seeBuild) {
                intelHTML += `<div style="font-size:11px; margin-top:5px;"><b>Buildings:</b> `;
                let bStr = [];
                for(let b in target.buildings) if(target.buildings[b]>0) bStr.push(`${T_Name(b)} ${target.buildings[b]}`);
                intelHTML += bStr.join(", ") + "</div>";
            }
        }
        if (scoutWin && seeOutside) {
                let outsideCount = {};
                let foundOutside = false;
                state.missions.forEach(mis => {
                    if (mis.originId === target.id) {
                        for (let u in mis.units) { outsideCount[u] = (outsideCount[u] || 0) + mis.units[u]; foundOutside = true; }
                    }
                });
                state.villages.forEach(vil => {
                    if (vil.stationed) {
                        vil.stationed.forEach(s => {
                            if (s.originId === target.id) {
                                for (let u in s.units) { outsideCount[u] = (outsideCount[u] || 0) + s.units[u]; foundOutside = true; }
                            }
                        });
                    }
                });
                intelHTML += `<div style="font-size:11px; margin-top:5px; border-top:1px solid #ccc;"><b>Outside:</b> `;
                if (foundOutside) {
                    let uStr = [];
                    for (let u in outsideCount) uStr.push(`${T_Name(u)} ${outsideCount[u]}`);
                    intelHTML += uStr.join(", ");
                } else {
                    intelHTML += "None";
                }
                intelHTML += "</div>";
        }
    
        const headerHTML = `
            <div style="font-size:11px; margin-bottom:5px; padding-bottom:5px; border-bottom:1px solid #eee;">
                <div><b>${T('att')}:</b> ${originName}</div>
                <div><b>${T('def')}:</b> ${targetName}</div>
            </div>
        `;
    
        report.type = playerSuccess ? 'win' : 'loss';
        report.content = `
            ${headerHTML}
            <h3 style='color:${color}'>${resultText}</h3>
            ${loyaltyMsg}
            ${wallMsg}
            <div style="display:flex; gap:5px; margin-top:5px;">
                <div style="flex:1; background:#f9f9f9; padding:2px;"><b>${T('att')}</b>${attTable}</div>
                <div style="flex:1; background:#f9f9f9; padding:2px;"><b>${T('def')}</b>${defTable}</div>
            </div>
            ${intelHTML}
            ${lootText}
        `;
    
        state.reports.unshift(report);
        if (state.reports.length > CONFIG.maxReports) state.reports = state.reports.slice(0, CONFIG.maxReports);
        
        ui.renderReports();
        requestAutoSave(); 
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
};