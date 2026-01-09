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
        ui.refresh(); engine.save();
    },

    build: function (b) {
        const v = engine.getCurrentVillage();
        const d = DB.buildings[b];
        
        // 1. Calculate Virtual Level
        const queuedCount = v.queues.build.filter(q => q.building === b).length;
        const virtualLvl = v.buildings[b] + queuedCount;

        if (virtualLvl >= d.maxLevel) { alert(T('maxLevel')); return; }
        
        // 2. Queue Limit Check
        if (v.queues.build.length >= CONFIG.buildQueueLimit) {
            alert(T('queue_full'));
            return;
        }

        // 3. Cost Calculation
        const c = [
            Math.floor(d.base[0] * Math.pow(d.factor, virtualLvl)), 
            Math.floor(d.base[1] * Math.pow(d.factor, virtualLvl)), 
            Math.floor(d.base[2] * Math.pow(d.factor, virtualLvl))
        ];

        if (v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2]) {
            // Deduct Resources
            v.res[0] -= c[0]; v.res[1] -= c[1]; v.res[2] -= c[2];
            
            // --- NEW: Calculate Duration with HQ Bonus ---
            const hqLvl = v.buildings["Headquarters"] || 1;
            const speedMod = Math.pow(0.95, hqLvl); 
            const duration = Math.floor(d.time * Math.pow(1.2, virtualLvl) * speedMod) * 1000;
            
            // Calculate Start/Finish Time
            const lastFinish = v.queues.build.length > 0 
                ? v.queues.build[v.queues.build.length - 1].finish 
                : Date.now();

            v.queues.build.push({ 
                building: b, 
                duration: duration, 
                finish: lastFinish + duration 
            });
            
            ui.refresh(); 
            engine.save();
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
        const v = engine.getCurrentVillage(); const d = DB.units[u];
        const popCost = d.pop * amt;
        const popCurrent = parseInt(document.getElementById('pop-current').innerText);
        const popMax = parseInt(document.getElementById('pop-max').innerText);
        if (popCurrent + popCost > popMax) { alert(T('popLimit')); return; }
        const c = [d.cost[0] * amt, d.cost[1] * amt, d.cost[2] * amt];
        if (v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2]) {
            v.res[0] -= c[0]; v.res[1] -= c[1]; v.res[2] -= c[2];
            const qType = d.building.toLowerCase();
            const q = v.queues[qType];
            const duration = d.time * amt * 1000;
            const lastFinish = q.length > 0 ? q[q.length - 1].finish : Date.now();
            q.push({ unit: u, count: amt, duration: duration, finish: lastFinish + duration });
            ui.refresh(); engine.save();
        } else { alert(T('resLimit')); }
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
        ui.closeBuildingModal(); ui.refresh(); engine.save();
    },
    moveMap: function (dx, dy) { state.mapView.x += dx; state.mapView.y += dy; ui.renderMap(); },
    launchAttack: function (type = 'attack') {
        const v = engine.getCurrentVillage(), t = ui.selTile;
        let units = {}, hasTroops = false;
        for (let u in v.units) { const val = parseInt(document.getElementById(`atk-${u}`)?.value || 0); if (val > 0) { units[u] = val; v.units[u] -= val; hasTroops = true; } }
        if (!hasTroops) return;
        const targetV = state.villages.find(vil => vil.id === t.id);
        const dist = Math.sqrt(Math.pow(targetV.x - v.x, 2) + Math.pow(targetV.y - v.y, 2));
        const dur = dist * (state.debugFastTravel ? 2 : 60);
        state.missions.push({ originId: v.id, targetId: t.id, units: units, type: type, arrival: Date.now() + (dur * 1000) });
        ui.closeAttackModal(); ui.refresh(); engine.save();
    },
    sendBackSupport: function (idx) {
        const v = engine.getCurrentVillage();
        const stack = v.stationed[idx];
        const originV = state.villages.find(vil => vil.id === stack.originId);
        const dist = originV ? Math.sqrt(Math.pow(originV.x - v.x, 2) + Math.pow(originV.y - v.y, 2)) : 10;
        const dur = dist * (state.debugFastTravel ? 2 : 60);
        v.stationed.splice(idx, 1);
        state.missions.push({ originId: stack.originId, targetId: stack.originId, units: stack.units, type: 'return', arrival: Date.now() + (dur * 1000) });
        ui.refresh(); ui.closeReportModal(); engine.save();
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
        ui.refresh(); ui.closeReportModal(); engine.save();
    },
    sendResources: function() {
        const v = engine.getCurrentVillage();
        
        // CHANGED: Read from hidden input
        const targetId = parseFloat(document.getElementById('market-target-id').value);
        
        const wood = parseInt(document.getElementById('market-wood').value) || 0;
        const clay = parseInt(document.getElementById('market-clay').value) || 0;
        const iron = parseInt(document.getElementById('market-iron').value) || 0;

        if (wood === 0 && clay === 0 && iron === 0) return;

        // 1. Validation: Enough Resources?
        if (v.res[0] < wood || v.res[1] < clay || v.res[2] < iron) {
            alert(T('resLimit'));
            return;
        }

        // 2. Validation: Market Capacity?
        const marketLvl = v.buildings["Market"] || 0;
        // Security check if user somehow opened modal without market
        if (marketLvl === 0) { alert("Build a Market first!"); return; }
        
        const maxCap = marketLvl * CONFIG.marketCapacityPerLevel;
        const total = wood + clay + iron;
        
        if (total > maxCap) {
            alert(`Market capacity exceeded! Max: ${maxCap}`);
            return;
        }

        // 3. Find Target
        const targetV = state.villages.find(vil => vil.id === targetId);
        if (!targetV) { alert(T('targetVanished')); return; }

        // 4. Deduct & Launch
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
        engine.save();
        // Optional: toast notification
        console.log("Merchants sent to " + targetV.name);
    },
};