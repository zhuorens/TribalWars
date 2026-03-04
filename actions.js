// --- GAME ACTIONS ---
const game = {
    cancel: function (queueType, idx) {
        const v = engine.getCurrentVillage();
        const q = v.queues[queueType];
        if (!q || !q[idx]) return;

        const item = q[idx];

        // --- LOGIC CHANGE: CASCADE CANCEL ---
        // If this is a building, we must also cancel any LATER upgrades for the same building
        // to prevent "paying for Level 10 but getting Level 5" bugs.
        let indexesToRemove = [idx];

        if (queueType === 'build') {
            // Look ahead in the queue for the same building
            for (let i = idx + 1; i < q.length; i++) {
                if (q[i].building === item.building) {
                    indexesToRemove.push(i);
                }
            }
        }

        // Sort indexes descending (remove from end first to preserve array positions)
        indexesToRemove.sort((a, b) => b - a);

        // Process removals
        indexesToRemove.forEach(remIdx => {
            const targetItem = q[remIdx];
            let cost = [0, 0, 0];

            if (queueType === 'build') {
                const d = DB.buildings[targetItem.building];

                // Calculate level this specific item was aiming for
                // We count how many of this building are in the queue BEFORE this specific item
                const queuedBefore = q.slice(0, remIdx).filter(x => x.building === targetItem.building).length;
                const targetLvl = (v.buildings[targetItem.building] || 0) + queuedBefore;

                cost = [
                    Math.floor(d.base[0] * Math.pow(d.factor, targetLvl)),
                    Math.floor(d.base[1] * Math.pow(d.factor, targetLvl)),
                    Math.floor(d.base[2] * Math.pow(d.factor, targetLvl))
                ];

                // Refund Pop (Use saved value if available, else calc via consistent helper)
                if (targetItem.pop !== undefined) {
                    v.popUsed -= targetItem.pop;
                } else {

                    const bName = targetItem.building;
                    const lvl = targetItem.level; // The level we are cancelling

                    const nextTotal = engine.getBuildingPop(bName, lvl);
                    const prevTotal = engine.getBuildingPop(bName, lvl - 1);

                    v.popUsed -= Math.max(0, nextTotal - prevTotal);
                }

                // Safety: Ensure we never go below zero
                v.popUsed = Math.max(0, v.popUsed);
            }
            else if (queueType === 'research') {
                const u = targetItem.unit;
                const lvl = targetItem.level - 1;
                cost = DB.units[u].cost.map(x => Math.floor(x * lvl * 10));
            }
            else {
                // Units
                const u = DB.units[targetItem.unit];
                cost = [u.cost[0] * targetItem.count, u.cost[1] * targetItem.count, u.cost[2] * targetItem.count];
                const unitPop = u.pop || 1;
                v.popUsed -= (unitPop * targetItem.count);
            }

            // Refund Resources
            v.res[0] += cost[0];
            v.res[1] += cost[1];
            v.res[2] += cost[2];

            // Remove from array
            q.splice(remIdx, 1);
        });

        // Safety clamp
        if (v.popUsed < 0) v.popUsed = 0;

        ui.refresh();
        requestAutoSave();
    },

    build: function (b, targetVillage = null) {
        // 1. Determine Context
        const isMassAction = !!targetVillage; // true if running from Mass Manager
        const v = targetVillage || engine.getCurrentVillage();
        const d = DB.buildings[b];

        // 2. Calculate Virtual Level (Current + Queue)
        const queuedCount = v.queues.build.filter(q => q.building === b).length;
        // This is the level we HAVE (or will have). We are building the NEXT one.
        const currentVirtualLvl = (v.buildings[b] || 0) + queuedCount;
        const targetLvl = currentVirtualLvl + 1;

        // 3. Check Max Level
        if (currentVirtualLvl >= d.maxLevel) {
            if (!isMassAction) alert(T('maxLevel'));
            return false; // FAIL
        }

        // 4. Check Queue Limit
        if (v.queues.build.length >= CONFIG.buildQueueLimit) {
            if (!isMassAction) alert(T('queue_full'));
            return false; // FAIL
        }

        // 5. Calculate Cost
        // Use currentVirtualLvl as exponent (Level 0 -> Base Cost)
        const c = [
            Math.floor(d.base[0] * Math.pow(d.factor, currentVirtualLvl)),
            Math.floor(d.base[1] * Math.pow(d.factor, currentVirtualLvl)),
            Math.floor(d.base[2] * Math.pow(d.factor, currentVirtualLvl))
        ];

        // 6. Check Resources
        if (v.res[0] < c[0] || v.res[1] < c[1] || v.res[2] < c[2]) {
            if (!isMassAction) alert(T('resLimit'));
            return false; // FAIL
        }

        // 7. Check Population
        const popAvail = engine.getPopLimit(v) - engine.getPopUsed(v);

        // Calculate Pop Difference (Level X -> Level X+1)
        // If helper engine.getBuildingPop(name, level) exists:
        const nextTotalPop = engine.getBuildingPop(b, targetLvl);
        const curTotalPop = engine.getBuildingPop(b, currentVirtualLvl);
        const popNeeded = Math.max(0, nextTotalPop - curTotalPop);

        // Allow Farm/Warehouse/Storage to build even if pop is full
        const ignorePop = (b === "Farm" || b === "Warehouse");

        if (!ignorePop && popAvail < popNeeded) {
            if (!isMassAction) alert("Not enough population space!");
            return false; // FAIL
        }

        // --- EXECUTE SUCCESS ---

        // Deduct Resources
        v.res[0] -= c[0];
        v.res[1] -= c[1];
        v.res[2] -= c[2];

        // Deduct Population Immediately (Reserve it)
        if (!v.popUsed) v.popUsed = 0;
        v.popUsed += popNeeded;

        // Calculate Duration
        const hqLvl = v.buildings["Headquarters"] || 1;
        const speedMod = Math.pow(0.95, hqLvl);
        const duration = Math.floor(d.time * Math.pow(1.2, currentVirtualLvl) * speedMod) * 1000;

        // Determine Start Time
        const lastFinish = v.queues.build.length > 0
            ? v.queues.build[v.queues.build.length - 1].finish
            : Date.now();

        // Push to Queue
        v.queues.build.push({
            building: b,
            duration: duration,
            finish: lastFinish + duration,
            pop: popNeeded // Save cost for cancellation
        });

        // UI Updates (Only for current village view)
        if (!isMassAction) {
            ui.refresh();
        }

        requestAutoSave();
        return true; // SUCCESS
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
    processRecruit: function (u, amt, targetVillage = null, suppressUI = false) {
        if (amt <= 0) return;

        // CHANGE 1: Use passed village OR current village
        const v = targetVillage || engine.getCurrentVillage();
        const d = DB.units[u];

        // 1. Calculate Costs (Resources & Pop)
        const unitPop = d.pop || 1;
        const popCost = unitPop * amt;

        // Use engine helpers
        const popAvail = engine.getPopLimit(v) - engine.getPopUsed(v);

        if (popCost > popAvail) {
            if (!suppressUI) alert(T('popLimit')); // Only alert if manual
            return;
        }

        const c = [d.cost[0] * amt, d.cost[1] * amt, d.cost[2] * amt];

        // 2. Resource Check
        if (v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2]) {
            // Deduct Resources
            v.res[0] -= c[0];
            v.res[1] -= c[1];
            v.res[2] -= c[2];

            // Deduct Population Immediately
            if (!v.popUsed) v.popUsed = 0;
            v.popUsed += popCost;

            const qType = d.building.toLowerCase();

            // Safety check for queue existence
            if (!v.queues[qType]) v.queues[qType] = [];
            const q = v.queues[qType];

            // 3. Calculate Time Per Unit
            const bLvl = v.buildings[d.building] || 1;
            const speedFactor = Math.pow(0.96, bLvl);
            const unitTime = d.time * 1000 * speedFactor;

            // 4. Add to Queue
            const lastItem = q.length > 0 ? q[q.length - 1] : null;

            if (lastItem && lastItem.unit === u) {
                lastItem.count += amt;
            } else {
                q.push({
                    unit: u,
                    count: amt,
                    unitTime: unitTime,
                    finish: null // Engine handles processing
                });
            }

            // CHANGE 2: Only refresh if not in mass mode
            if (!suppressUI) {
                ui.refresh();
                requestAutoSave();
            }
        } else {
            if (!suppressUI) alert(T('resLimit'));
        }
    },
    research: function (u, targetVillage = null) {
        // 1. Determine Context
        // If targetVillage is passed, we are in "Mass Mode" (suppress UI updates)
        const isMassAction = !!targetVillage;
        const v = targetVillage || engine.getCurrentVillage();

        if (!v) return false;
        if (!v.techs) v.techs = {};

        // 2. Data Setup
        const curLvl = v.techs[u] || 1;
        const maxLvl = (DB.units[u] && DB.units[u].maxLevel) ? DB.units[u].maxLevel : 3;

        // 3. Checks
        if (curLvl >= maxLvl) {
            if (!isMassAction) alert(T('maxLevel'));
            return false;
        }

        const rc = DB.units[u].cost.map(x => Math.floor(x * curLvl * 10));

        if (v.res[0] < rc[0] || v.res[1] < rc[1] || v.res[2] < rc[2]) {
            if (!isMassAction) alert(T('resLimit'));
            return false;
        }

        if ((v.buildings["Smithy"] || 0) <= 0) {
            if (!isMassAction) alert("Build Smithy!");
            return false;
        }

        // Initialize queue if missing
        if (!v.queues.research) v.queues.research = [];
        const q = v.queues.research;

        if (q.length > 0) {
            if (!isMassAction) alert("Queue full");
            return false;
        }

        // 4. Execute
        v.res[0] -= rc[0];
        v.res[1] -= rc[1];
        v.res[2] -= rc[2];

        const baseTime = DB.units[u].time * 10;
        const reduction = Math.pow(0.9, v.buildings["Smithy"]);
        const duration = Math.floor(baseTime * reduction * 1000);

        const lastFinish = q.length > 0 ? q[q.length - 1].finish : Date.now();

        q.push({
            unit: u,
            level: curLvl + 1,
            duration: duration,
            finish: lastFinish + duration
        });

        // 5. UI Updates (Only if NOT Mass Action)
        if (!isMassAction) {
            if (typeof ui.closeBuildingModal === 'function') ui.closeBuildingModal();
            if (typeof ui.refresh === 'function') ui.refresh();
        }

        // Always save
        requestAutoSave();
        return true; // SUCCESS
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
                    if (CONFIG.debugFastTravel) {
                        slowestSpeed = 2;
                    }
                    else if (DB.units[u].spd > slowestSpeed) {
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

        requestAutoSave();
    },
    sendBackSupport: function (idx) {
        const v = engine.getCurrentVillage();
        const stack = v.stationed[idx];
        const originV = state.villages.find(vil => vil.id === stack.originId);

        // Calculate Euclidean distance: d = \sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}
        const dist = originV ? Math.sqrt(Math.pow(originV.x - v.x, 2) + Math.pow(originV.y - v.y, 2)) : 10;
        const dur = dist * (state.debugFastTravel ? 2 : 60);

        // 🔥 NEW: Sync the cache by subtracting the returning troops
        if (state.outgoingSupport && state.outgoingSupport[stack.originId]) {
            for (let u in stack.units) {
                if (state.outgoingSupport[stack.originId][u]) {
                    state.outgoingSupport[stack.originId][u] -= stack.units[u];

                    // Safety net: ensure we don't accidentally dip into negative numbers
                    if (state.outgoingSupport[stack.originId][u] < 0) {
                        state.outgoingSupport[stack.originId][u] = 0;
                    }
                }
            }
        }

        // Remove the stack and create the return mission
        v.stationed.splice(idx, 1);
        state.missions.push({
            originId: stack.originId,
            targetId: stack.originId,
            units: stack.units,
            type: 'return',
            arrival: Date.now() + (dur * 1000)
        });

        ui.refresh();
        ui.closeReportModal();
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

        // 🔥 NEW: Sync the cache by subtracting the recalled troops
        // In this function, `v.id` is the originId.
        if (state.outgoingSupport && state.outgoingSupport[v.id]) {
            for (let u in stack.units) {
                if (state.outgoingSupport[v.id][u]) {
                    state.outgoingSupport[v.id][u] -= stack.units[u];

                    // Safety net: ensure we don't accidentally dip into negative numbers
                    if (state.outgoingSupport[v.id][u] < 0) {
                        state.outgoingSupport[v.id][u] = 0;
                    }
                }
            }
        }

        // Remove the stack and create the return mission
        target.stationed.splice(idx, 1);

        const dist = Math.sqrt(Math.pow(target.x - v.x, 2) + Math.pow(target.y - v.y, 2));
        const dur = dist * (state.debugFastTravel ? 2 : 60);
        state.missions.push({ originId: v.id, targetId: v.id, units: stack.units, type: 'return', arrival: Date.now() + (dur * 1000) });

        ui.refresh();
        ui.closeReportModal();
        requestAutoSave();
    },
    sendResources: function () {
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