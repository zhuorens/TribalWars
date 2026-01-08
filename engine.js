// --- ENGINE (Logic) ---
const engine = {
    init: function () {
        if (localStorage.getItem("tw_v5_save")) {
            try {
                state = { ...state, ...JSON.parse(localStorage.getItem("tw_v5_save")) };
                if (!state.selectedVillageId && state.villages.length > 0) {
                    state.selectedVillageId = state.villages[0].id;
                }
                // Migration: Ensure new queue structures exist for old saves
                state.villages.forEach(v => {
                    if (!v.queues) v.queues = { build: [], research: [], barracks: [], stable: [], workshop: [], academy: [] };
                    if (!v.stationed) v.stationed = []; // Troops from others supporting me
                });
            } catch (e) { console.error(e); }
        } else {
            const v = engine.createVillage(100, 100, "My Village", "player");
            state.villages.push(v);
            state.selectedVillageId = v.id;
            engine.generateMapChunk(100, 100);
        }
        ui.init();
        setInterval(engine.tick, 1000);
        setInterval(engine.save, 5000);
    },

    getCurrentVillage: function () {
        return state.villages.find(v => v.id === state.selectedVillageId) || state.villages[0];
    },

    generateEnemyName: function() {
        const adjs = ["Dark", "Red", "Iron", "Black", "Grim", "Savage", "Cruel", "Blood", "Storm", "Chaos", "Vile", "Shadow"];
        const nouns = ["Keep", "Fort", "Tower", "Hold", "Bastion", "Citadel", "Outpost", "Lair", "Den", "Gate", "Dominion", "Empire"];
        
        const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
        // Optional: Append a random number 10% of the time for extra variety
        const suffix = Math.random() > 0.9 ? ` ${Math.floor(Math.random() * 99)}` : "";
        
        return `${rand(adjs)} ${rand(nouns)}${suffix}`;
    },

    createVillage: function (x, y, name, owner) {
        let builds = {};
        for (let b in DB.buildings) builds[b] = (b === "Headquarters" || b.includes("Camp") || b.includes("Pit") || b.includes("Mine") || b === "Farm" || b === "Warehouse") ? 1 : 0;
        let units = {}; for (let u in DB.units) units[u] = 0;
        let techs = {}; for (let u in DB.units) techs[u] = 1;

        if (owner === "enemy") {
            builds["Wall"] = 5; builds["Barracks"] = 5; builds["Headquarters"] = 10; builds["Farm"] = 15; builds["Warehouse"] = 15;
            builds["Timber Camp"] = 12; builds["Clay Pit"] = 12; builds["Iron Mine"] = 12;
            units["Spear"] = 300; units["Sword"] = 300; units["Heavy Cav"] = 50; units["Scout"] = 50;
        }

        const v = {
            id: Date.now() + Math.random(), x: x, y: y, name: name, owner: owner,
            res: [500, 500, 500], buildings: builds, units: units, techs: techs,
            // NEW: Separate Queues
            queues: { build: [], research: [], barracks: [], stable: [], workshop: [], academy: [] },
            // NEW: Stationed troops (Support from others)
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
                // 1. Check Bounds
                if (x < 0 || x > CONFIG.mapSize || y < 0 || y > CONFIG.mapSize) continue;

                // 2. Check Existing
                if (state.mapData[`${x},${y}`]) continue;
                
                // 3. Protect Player Start (100, 100)
                if (x === 100 && y === 100) continue;

                const r = Math.random();
                
                if (r > 0.95) {
                    // CHANGED: Generate unique name
                    const name = engine.generateEnemyName(); 
                    state.villages.push(engine.createVillage(x, y, name, "enemy"));
                } 
                else if (r > 0.85) {
                    state.villages.push(engine.createVillage(x, y, "Barbarian", "barb"));
                } 
                else {
                    state.mapData[`${x},${y}`] = { type: "empty" };
                }
            }
        }
    },

    updatePoints: function() {
        // 1. Recalculate Individual Village Points
        state.villages.forEach(v => {
            v.points = engine.calculatePoints(v);
            // Sync with Map Data
            if (state.mapData[`${v.x},${v.y}`]) {
                state.mapData[`${v.x},${v.y}`].points = v.points;
            }
        });
    
        // 2. Recalculate Global Player Points
        let globalPoints = 0;
        state.villages.forEach(v => {
            if (v.owner === 'player') globalPoints += v.points;
        });
        state.playerPoints = globalPoints;
    
        // 3. Update DOM Elements Immediately
        const gpEl = document.getElementById('global-points');
        if (gpEl) gpEl.innerText = globalPoints;
        
        // Also update the specific village point display if it exists
        const vpEl = document.getElementById('village-points');
        if (vpEl) {
            const current = engine.getCurrentVillage();
            vpEl.innerText = current.points;
        }
    },

    tick: function () {
        const dt = (Date.now() - state.lastTick) / 1000;
        state.lastTick = Date.now();
    
        state.villages.forEach(v => {
            // Production
            const cap = engine.getStorage(v);
            const wood = (30 * Math.pow(1.16, v.buildings["Timber Camp"])) / 3600 * dt;
            const clay = (30 * Math.pow(1.16, v.buildings["Clay Pit"])) / 3600 * dt;
            const iron = (30 * Math.pow(1.16, v.buildings["Iron Mine"])) / 3600 * dt;
    
            v.res[0] = Math.min(cap, v.res[0] + wood);
            v.res[1] = Math.min(cap, v.res[1] + clay);
            v.res[2] = Math.min(cap, v.res[2] + iron);
    
            if (v.loyalty < 100) v.loyalty = Math.min(100, v.loyalty + (dt / 3600));
    
            // Queue Processing
            const processQ = (type, action) => {
                const q = v.queues[type];
                if (q.length > 0) {
                    const item = q[0];
                    if (!item.finish) item.finish = Date.now() + item.duration;
                    if (Date.now() >= item.finish) {
                        action(q.shift());
                        // Force point update immediately when a building finishes
                        if(type === 'build') engine.updatePoints(); 
                        ui.refresh();
                    }
                }
            };
    
            processQ('build', (item) => v.buildings[item.building]++);
            processQ('research', (item) => { if (!v.techs) v.techs = {}; v.techs[item.unit] = (v.techs[item.unit] || 1) + 1; });
            ['barracks', 'stable', 'workshop', 'academy'].forEach(q => {
                 processQ(q, (item) => v.units[item.unit] += item.count);
            });
        });
    
        // --- POINTS UPDATE ---
        // Moved the manual calc logic into the shared function
        engine.updatePoints(); 
    
        if (CONFIG.aiAttackEnabled) {
            const now = Date.now();
            // Initialize timer if missing
            if (!state.nextAiCheck) state.nextAiCheck = now + CONFIG.aiAttackInterval;

            if (now > state.nextAiCheck) {
                state.nextAiCheck = now + CONFIG.aiAttackInterval;
                
                // Only attack if random check passes
                if (Math.random() < CONFIG.aiAttackChance) {
                    engine.spawnAiAttack();
                }
            }
        }

        // Missions
        state.missions = state.missions.filter(m => {
            if (Date.now() >= m.arrival) { engine.resolveMission(m); return false; }
            return true;
        });

        ui.updateLoop();
    },

    resolveMission: function (m) {
        const origin = state.villages.find(v => v.id === m.originId);
        const target = state.villages.find(v => v.id === m.targetId);
        const targetName = target ? `${target.name} (${target.x}|${target.y})` : T('targetVanished');

        // --- TRANSPORT ---
        if (m.type === 'transport') {
            if (target) {
                // Add resources to target
                if (m.resources) {
                    target.res[0] += m.resources.wood || 0;
                    target.res[1] += m.resources.clay || 0;
                    target.res[2] += m.resources.iron || 0;
                }
                // Report for Target (if player owns it)
                if (target.owner === 'player') {
                    state.reports.unshift({ 
                        title: `Market: Received from ${origin ? origin.name : 'Unknown'}`, 
                        time: new Date().toLocaleTimeString(), 
                        type: 'neutral', 
                        content: `Received: 🌲${m.resources.wood} 🧱${m.resources.clay} 🔩${m.resources.iron}` 
                    });
                }
            }
            // Report for Sender (if player owns it)
            if (origin && origin.owner === 'player') {
                state.reports.unshift({ 
                    title: `Market: Delivered to ${targetName}`, 
                    time: new Date().toLocaleTimeString(), 
                    type: 'neutral', 
                    content: `Delivered: 🌲${m.resources.wood} 🧱${m.resources.clay} 🔩${m.resources.iron}` 
                });
            }
            
            // Limit and Render
            if (state.reports.length > CONFIG.maxReports) state.reports = state.reports.slice(0, CONFIG.maxReports);
            ui.renderReports();
            return;
        }

        // --- SUPPORT / RETURN ---
        if (m.type === 'support' || m.type === 'return') {
            if (!target) return;
            if (!target.stationed) target.stationed = [];
            
            let stack = target.stationed.find(s => s.originId === m.originId);
            if (!stack) {
                stack = { originId: m.originId, units: {} };
                target.stationed.push(stack);
            }
            for (let u in m.units) stack.units[u] = (stack.units[u] || 0) + m.units[u];

            if (m.originId === state.selectedVillageId || m.targetId === state.selectedVillageId) {
                const title = m.type === 'return' ? "Return" : "Support";
                state.reports.unshift({ title: `${title}: ${targetName}`, time: new Date().toLocaleTimeString(), type: 'neutral', content: `Troops arrived at ${targetName}.` });
                if (state.reports.length > CONFIG.maxReports) state.reports = state.reports.slice(0, CONFIG.maxReports);
                ui.renderReports();
            }
            return;
        }

        // --- BATTLE PREP ---
        let report = { title: `${T('report')}: ${targetName}`, time: new Date().toLocaleTimeString(), type: 'neutral', content: '' };
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

        // Context Flags
        const attScouts = m.units["Scout"] || 0;
        const otherAttackingUnits = Object.keys(m.units).some(u => u !== "Scout" && m.units[u] > 0);
        const isPureScout = (attScouts > 0) && !otherAttackingUnits;
        const isDefender = target.owner === 'player'; // Are we defending?

        let win = false; // "win" means ATTACKER WON
        let scoutWin = false; 
        let lootText = "", loyaltyMsg = "", wallMsg = "", scoutInfo = "";
        let seeRes = false, seeBuild = false, seeOutside = false;

        // --- SCENARIO A: PURE SCOUT MISSION ---
        if (isPureScout) {
            const defScouts = defTotal["Scout"] || 0;
            let scoutsDied = 0;

            if (defScouts >= attScouts * 2) {
                scoutsDied = attScouts;
            } else if (defScouts > 0) {
                const ratio = Math.pow(defScouts / (attScouts * 2), 1.5);
                scoutsDied = Math.floor(attScouts * ratio);
            }
            m.units["Scout"] -= scoutsDied;
            
            const survivors = m.units["Scout"];
            if (survivors >= 1) {
                win = true; // Attacker succeeded in scouting
                scoutWin = true;
            }

            const scoutLevel = (origin && origin.techs) ? (origin.techs["Scout"] || 1) : 1;
            const survRatio = startAtt["Scout"] > 0 ? (survivors / startAtt["Scout"]) : 0;
            
            if (scoutWin) {
                if (survRatio > 0.50 && scoutLevel >= 1) seeRes = true;
                if (survRatio > 0.70 && scoutLevel >= 2) seeBuild = true;
                if (survRatio > 0.90 && scoutLevel >= 3) seeOutside = true;
            }

            const resultColor = survivors === 0 ? "red" : (survivors === startAtt["Scout"] ? "green" : "orange");
            scoutInfo = `<div style="border:1px solid #ccc; background:#eee; padding:5px; margin-bottom:5px;">
                <h4>🕵️ Result</h4>
                <div>Sent: ${attScouts} | Died: <span style="color:red">${scoutsDied}</span> | Survivors: <span style="color:${resultColor}">${survivors}</span></div>
            </div>`;
        } 
        
        // --- SCENARIO B: NORMAL COMBAT ---
        else {
            let off = 0, def = 0;
            
            // Attacker Offense (Scouts don't fight walls)
            for (let u in m.units) {
                if(u !== "Scout") {
                    off += m.units[u] * DB.units[u].att * getTechMultiplier(origin?.techs?.[u] || 1);
                }
            }
            // Defender Defense (Scouts defend)
            for (let u in defTotal) {
                def += defTotal[u] * DB.units[u].def * getTechMultiplier(target.techs?.[u] || 1);
            }

            // Wall
            const currentWallLvl = target.buildings["Wall"] || 0;
            let effectiveWallLvl = currentWallLvl;
            if (m.units["Ram"] > 0) {
                const bonusReduction = Math.floor(m.units["Ram"] / 20);
                effectiveWallLvl = Math.max(0, currentWallLvl - bonusReduction);
            }
            def *= (1 + (effectiveWallLvl * 0.05));

            // Resolve
            win = off > def;
            
            // Scout Intel if Win
            if(win && m.units["Scout"] > 0) {
                scoutWin = true;
                seeRes = true;
            }

            // Losses
            const ratio = (off === 0 && def === 0) ? 1 : (win ? (def / off) : (off / def));
            const lossFactor = (off === 0 && def === 0) ? 0 : Math.pow(ratio, 1.5);

            if (win) {
                for (let u in m.units) m.units[u] -= Math.floor(m.units[u] * lossFactor);
            } else {
                for (let u in m.units) m.units[u] = 0;
            }

            const defLossFactor = win ? 1 : lossFactor;
            const killDef = (obj) => { 
                for (let u in obj) {
                    obj[u] = Math.max(0, obj[u] - Math.floor(obj[u] * defLossFactor)); 
                }
            };
            killDef(target.units);
            if (target.stationed) target.stationed.forEach(s => killDef(s.units));

            // Rams Damage
            if (win && m.units["Ram"] > 0 && currentWallLvl > 0) {
                const ramsSurviving = m.units["Ram"];
                const levelsDestroyed = Math.floor(ramsSurviving / 20);
                if (levelsDestroyed > 0) {
                    const newLvl = Math.max(0, currentWallLvl - levelsDestroyed);
                    target.buildings["Wall"] = newLvl;
                    wallMsg = `<div style="color:#a00; font-weight:bold;">🚜 Wall damaged: ${currentWallLvl} ➔ ${newLvl}</div>`;
                }
            }

            // Nobles
            if (win && m.units["Noble"] > 0) {
                const nobleCount = m.units["Noble"];
                let totalDrop = 0;
                for(let i=0; i<nobleCount; i++) totalDrop += Math.floor(20 + Math.random() * 16);
                
                target.loyalty -= totalDrop;
                loyaltyMsg = `<div style="color:blue"><b>${T('loyalty')} ${Math.floor(target.loyalty)}!</b> (-${totalDrop})</div>`;

                if (target.loyalty <= 0) {
                    target.owner = "player"; // Or AI/Attacker ID
                    target.loyalty = 25; 
                    state.mapData[`${target.x},${target.y}`].type = "player";
                    m.units["Noble"] = Math.max(0, m.units["Noble"] - 1);
                    loyaltyMsg += `<div style="background:gold; color:black; padding:5px; text-align:center; margin-top:5px;"><b>🎉 ${T('conquered')} 🎉</b></div>`;
                    if (document.getElementById('map').classList.contains('active')) ui.renderMap();
                }
            }

            // Loot
            if (win) {
                let carry = 0; 
                for (let u in m.units) carry += m.units[u] * DB.units[u].carry;
                let stolen = [0, 0, 0];
                for (let i = 0; i < 3; i++) {
                    let take = Math.min(Math.floor(target.res[i]), Math.floor(carry / 3));
                    stolen[i] = take; target.res[i] -= take; carry -= take;
                }
                for (let i = 0; i < 3; i++) {
                    if(carry<=0) break;
                    let take = Math.min(Math.floor(target.res[i]), carry);
                    stolen[i] += take; target.res[i] -= take; carry -= take;
                }
                
                if (stolen[0] + stolen[1] + stolen[2] > 0) {
                    lootText = `<hr>💰 ${T('loot')}: 🌲${stolen[0]} 🧱${stolen[1]} 🔩${stolen[2]}`;
                    if (origin) { origin.res[0] += stolen[0]; origin.res[1] += stolen[1]; origin.res[2] += stolen[2]; }
                }
            }
        }

        // Return Troops
        if (origin) {
            for (let u in m.units) origin.units[u] += m.units[u];
        }

        // --- REPORT GENERATION ---
        
        // 1. Determine Success from Player Perspective
        // If I am defending: Success = Attacker NOT Winning (!win)
        // If I am attacking: Success = Attacker Winning (win)
        const playerSuccess = isDefender ? !win : win;
        const color = playerSuccess ? "green" : "red";
        const resultText = playerSuccess ? T('victory') : T('defeat');

        let attTable = `<table style="width:100%; font-size:10px;"><tr><th>Unit</th><th>Sent</th><th>Lost</th></tr>`;
        for (let u in DB.units) {
            if (startAtt[u] > 0) {
                const lost = startAtt[u] - m.units[u];
                attTable += `<tr><td>${T_Name(u)}</td><td>${startAtt[u]}</td><td style="color:${lost > 0 ? 'red' : '#999'}">${lost}</td></tr>`;
            }
        }
        attTable += "</table>";

        let defTable = "";
        // Show defenders if: Attacker Won OR Scout Won OR WE ARE THE DEFENDER
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
             // Scan missions from target
             state.missions.forEach(mis => {
                 if (mis.originId === target.id) {
                     for (let u in mis.units) { outsideCount[u] = (outsideCount[u] || 0) + mis.units[u]; foundOutside = true; }
                 }
             });
             // Scan stationed troops in other villages
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

        report.type = playerSuccess ? 'win' : 'loss';
        report.content = `
            <h3 style='color:${color}'>${resultText}</h3>
            ${scoutInfo}
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
        engine.save();
    },

    save: function () { localStorage.setItem("tw_v5_save", JSON.stringify(state)); },
        
    exportSave: function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "tribalwars_save_" + Date.now() + ".json");
        document.body.appendChild(downloadAnchorNode); // Required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    importSave: function(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const contents = e.target.result;
                const newState = JSON.parse(contents);
                
                // Simple validation
                if (!newState.villages) throw new Error("Invalid Save File");
                
                state = newState;
                engine.save(); // Save to local storage immediately
                alert("Save loaded successfully!");
                location.reload(); // Reload to refresh state
            } catch (err) {
                console.error(err);
                alert("Error loading save file: " + err.message);
            }
        };
        reader.readAsText(file);
    },

    resetGame: function() {
        if(confirm("Are you sure? This will delete your current progress.")) {
            localStorage.removeItem("tw_v5_save");
            location.reload();
        }
    },
    getStorage: function (v) { return Math.floor(DB.buildings.Warehouse.base[0] * Math.pow(DB.buildings.Warehouse.factor, v.buildings["Warehouse"])); },
    spawnAiAttack: function() {
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
        
        const units = { "Axe": armySize, "Light Cav": Math.floor(armySize / 3) };
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
    },
};