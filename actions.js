// --- GAME ACTIONS ---
const game = {
    cancel: function (queueType, idx) {
        const v = engine.getCurrentVillage();
        const q = v.queues[queueType];
        if (!q || !q[idx]) return;

        const item = q[idx];
        let cost = [0, 0, 0];
        if (queueType === 'build') {
            const d = DB.buildings[item.building];
            const lvl = v.buildings[item.building];
            cost = [Math.floor(d.base[0] * Math.pow(d.factor, lvl)), Math.floor(d.base[1] * Math.pow(d.factor, lvl)), Math.floor(d.base[2] * Math.pow(d.factor, lvl))];
        } else if (queueType === 'research') {
            const u = item.unit;
            const lvl = item.level - 1;
            cost = DB.units[u].cost.map(x => Math.floor(x * lvl * 5));
        } else {
            const u = DB.units[item.unit];
            cost = [u.cost[0] * item.count, u.cost[1] * item.count, u.cost[2] * item.count];
        }

        v.res[0] += cost[0]; v.res[1] += cost[1]; v.res[2] += cost[2];
        q.splice(idx, 1);
        ui.refresh(); 
        
        // CHANGED: Use soft save
        requestAutoSave();
    },

    build: function (b) {
        const v = engine.getCurrentVillage();
        const d = DB.buildings[b];
        
        const queuedCount = v.queues.build.filter(q => q.building === b).length;
        const virtualLvl = v.buildings[b] + queuedCount;

        if (virtualLvl >= d.maxLevel) { alert(T('maxLevel')); return; }
        
        if (v.queues.build.length >= CONFIG.buildQueueLimit) {
            alert(T('queue_full'));
            return;
        }

        const c = [
            Math.floor(d.base[0] * Math.pow(d.factor, virtualLvl)), 
            Math.floor(d.base[1] * Math.pow(d.factor, virtualLvl)), 
            Math.floor(d.base[2] * Math.pow(d.factor, virtualLvl))
        ];

        if (v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2]) {
            v.res[0] -= c[0]; v.res[1] -= c[1]; v.res[2] -= c[2];
            
            const hqLvl = v.buildings["Headquarters"] || 1;
            const speedMod = Math.pow(0.95, hqLvl); 
            const duration = Math.floor(d.time * Math.pow(1.2, virtualLvl) * speedMod) * 1000;
            
            const lastFinish = v.queues.build.length > 0 
                ? v.queues.build[v.queues.build.length - 1].finish 
                : Date.now();

            v.queues.build.push({ 
                building: b, 
                duration: duration, 
                finish: lastFinish + duration 
            });
            
            ui.refresh(); 
            // CHANGED: Use soft save
            requestAutoSave();
        } else {
            alert(T('resLimit'));
        }
    },
    recruit: function (u) { const amt = parseInt(prompt("Amount?") || 0); game.processRecruit(u, amt); },
    recruitMax: function (u) {
        const v = engine.getCurrentVillage(); const d = DB.units[u];
        const maxWood = d.cost[0] > 0 ? Math.floor(v.res[0] / d.cost[0]) : 99999;
        const maxClay = d.cost[1] > 0 ? Math.floor(v.res[1] / d.cost[1]) : 99999;
        const maxIron = d.cost[2] > 0 ? Math.floor(v.res[2] / d.cost[2]) : 99999;
        const popCurrent = parseInt(document.getElementById('pop-current').innerText); const popMax = parseInt(document.getElementById('pop-max').innerText);
        const maxPop = d.pop > 0 ? Math.floor((popMax - popCurrent) / d.pop) : 99999;
        const amt = Math.min(maxWood, maxClay, maxIron, maxPop);
        if (amt > 0) game.processRecruit(u, amt); else alert(T('resLimit'));
    },
    processRecruit: function (u, amt) {
        if (amt <= 0) return;
        const v = engine.getCurrentVillage();
        const d = DB.units[u];
    
        // 1. Calculate Costs
        const popCost = d.pop * amt;
        const popCurrent = parseInt(document.getElementById('pop-current').innerText);
        const popMax = parseInt(document.getElementById('pop-max').innerText);
    
        if (popCurrent + popCost > popMax) { alert(T('popLimit')); return; }
    
        const c = [d.cost[0] * amt, d.cost[1] * amt, d.cost[2] * amt];
    
        // 2. Resource Check
        if (v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2]) {
            // Deduct Resources
            v.res[0] -= c[0]; v.res[1] -= c[1]; v.res[2] -= c[2];
    
            const qType = d.building.toLowerCase();
            const q = v.queues[qType];
    
            // 3. Calculate Time Per Unit (Applying Building Speed)
            const bLvl = v.buildings[d.building] || 1;
            // Example: Standard speed formula (0.96 ^ level). Adjust as needed.
            const speedFactor = Math.pow(0.96, bLvl); 
            const unitTime = d.time * 1000 * speedFactor; 
    
            // 4. Add to Queue
            // Check if the last item is the same unit. If so, just add to the pile.
            const lastItem = q.length > 0 ? q[q.length - 1] : null;
    
            if (lastItem && lastItem.unit === u) {
                lastItem.count += amt;
            } else {
                // We set 'finish' to NULL initially. 
                // The engine loop will set the start time when this batch reaches the front.
                q.push({ 
                    unit: u, 
                    count: amt, 
                    unitTime: unitTime, 
                    finish: null 
                });
            }
    
            ui.refresh();
            requestAutoSave();
        } else {
            alert(T('resLimit'));
        }
    },
    research: function (u) {
        const v = engine.getCurrentVillage(); if (!v.techs) v.techs = {}; const curLvl = v.techs[u] || 1; const maxLvl = DB.units[u].maxLevel || 3;
        if (curLvl >= maxLvl) { alert(T('maxLevel')); return; }
        const rc = DB.units[u].cost.map(x => Math.floor(x * curLvl * 5));
        if (v.res[0] < rc[0] || v.res[1] < rc[1] || v.res[2] < rc[2]) { alert(T('resLimit')); return; }
        if (v.buildings["Smithy"] <= 0) { alert("Build Smithy!"); return; }
        const q = v.queues.research;
        if (q.length > 0) { alert("Queue full"); return; }
        v.res[0] -= rc[0]; v.res[1] -= rc[1]; v.res[2] -= rc[2];
        const baseTime = DB.units[u].time * 10;
        const reduction = Math.pow(0.9, v.buildings["Smithy"]);
        const duration = Math.floor(baseTime * reduction * 1000);
        const lastFinish = q.length > 0 ? q[q.length - 1].finish : Date.now();
        q.push({ unit: u, level: curLvl + 1, duration: duration, finish: lastFinish + duration });
        ui.closeBuildingModal(); ui.refresh(); 
        // CHANGED: Use soft save
        requestAutoSave();
    },
    moveMap: function (dx, dy) { state.mapView.x += dx; state.mapView.y += dy; ui.renderMap(); },
    launchAttack: function (type) {
        const origin = engine.getCurrentVillage();
        const target = ui.selTile;
        
        if (!target) return;
        if (origin.id === target.id) { alert(T('cant_attack_self')); return; }
    
        // 1. Gather Units & Find Slowest Speed
        let unitsToSend = {};
        let slowestSpeed = 0;
        let totalCount = 0;
    
        for (let u in DB.units) {
            const input = document.getElementById('atk-' + u);
            if (input) {
                const count = parseInt(input.value) || 0;
                if (count > 0) {
                    if (origin.units[u] < count) { alert(T('not_enough_troops')); return; }
                    unitsToSend[u] = count;
                    totalCount += count;
                    
                    // HIGHER number = SLOWER unit (minutes per tile)
                    if (DB.units[u].spd > slowestSpeed) {
                        slowestSpeed = DB.units[u].spd;
                    }
                }
            }
        }
    
        if (totalCount === 0) return;
    
        // 2. Calculate Distance (Pythagorean theorem)
        const dx = Math.abs(origin.x - target.x);
        const dy = Math.abs(origin.y - target.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
    
        // 3. Calculate Duration
        // Duration (ms) = Distance * Speed (min/tile) * 60 * 1000
        // We normally use milliseconds for game timing
        const durationMs = dist * slowestSpeed * 6 * 1000;
    
        // 4. Create Mission
        const m = {
            id: Date.now() + Math.floor(Math.random() * 100000),
            type: type,
            originId: origin.id,
            targetId: target.id,
            units: unitsToSend,
            startTime: Date.now(),
            arrival: Date.now() + durationMs,
            
            // Optional: Store original resources if this is transport
            resources: { wood: 0, clay: 0, iron: 0 } 
        };
    
        // Remove units from village immediately
        for (let u in unitsToSend) {
            origin.units[u] -= unitsToSend[u];
        }
    
        state.missions.push(m);
        
        // UI Feedback
        ui.closeAttackModal();
        ui.refresh();
        ui.updateMissions();
        
        engine.requestAutoSave();
    },
    sendBackSupport: function (idx) {
        const v = engine.getCurrentVillage();
        const stack = v.stationed[idx];
        const originV = state.villages.find(vil => vil.id === stack.originId);
        const dist = originV ? Math.sqrt(Math.pow(originV.x - v.x, 2) + Math.pow(originV.y - v.y, 2)) : 10;
        const dur = dist * (state.debugFastTravel ? 2 : 60);
        v.stationed.splice(idx, 1);
        state.missions.push({ originId: stack.originId, targetId: stack.originId, units: stack.units, type: 'return', arrival: Date.now() + (dur * 1000) });
        ui.refresh(); ui.closeReportModal(); 
        // CHANGED: Use soft save
        requestAutoSave();
    },
    withdrawSupport: function (targetId) {
        const v = engine.getCurrentVillage();
        const target = state.villages.find(vil => vil.id === targetId);
        if (!target || !target.stationed) return;
        const idx = target.stationed.findIndex(s => s.originId === v.id);
        if (idx === -1) return;
        const stack = target.stationed[idx];
        target.stationed.splice(idx, 1);
        const dist = Math.sqrt(Math.pow(target.x - v.x, 2) + Math.pow(target.y - v.y, 2));
        const dur = dist * (state.debugFastTravel ? 2 : 60);
        state.missions.push({ originId: v.id, targetId: v.id, units: stack.units, type: 'return', arrival: Date.now() + (dur * 1000) });
        ui.refresh(); ui.closeReportModal(); 
        // CHANGED: Use soft save
        requestAutoSave();
    },
    sendResources: function() {
        const v = engine.getCurrentVillage();
        const targetId = parseFloat(document.getElementById('market-target-id').value);
        
        const wood = parseInt(document.getElementById('market-wood').value) || 0;
        const clay = parseInt(document.getElementById('market-clay').value) || 0;
        const iron = parseInt(document.getElementById('market-iron').value) || 0;

        if (wood === 0 && clay === 0 && iron === 0) return;

        if (v.res[0] < wood || v.res[1] < clay || v.res[2] < iron) {
            alert(T('resLimit'));
            return;
        }

        const marketLvl = v.buildings["Market"] || 0;
        if (marketLvl === 0) { alert("Build a Market first!"); return; }
        
        const maxCap = marketLvl * CONFIG.marketCapacityPerLevel;
        const total = wood + clay + iron;
        
        if (total > maxCap) {
            alert(`Market capacity exceeded! Max: ${maxCap}`);
            return;
        }

        const targetV = state.villages.find(vil => vil.id === targetId);
        if (!targetV) { alert(T('targetVanished')); return; }

        v.res[0] -= wood; v.res[1] -= clay; v.res[2] -= iron;

        const dist = Math.sqrt(Math.pow(targetV.x - v.x, 2) + Math.pow(targetV.y - v.y, 2));
        const dur = dist * 60 * 1000; 

        state.missions.push({
            originId: v.id,
            targetId: targetId,
            type: 'transport',
            resources: { wood: wood, clay: clay, iron: iron },
            arrival: Date.now() + dur
        });

        ui.closeBuildingModal(); 
        ui.refresh();
        // CHANGED: Use soft save
        requestAutoSave();
        console.log("Merchants sent to " + targetV.name);
    },
};