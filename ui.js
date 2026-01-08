// --- UI (Display) ---
const ui = {
    selTile: null, selBuild: null,

    init: function () {
        ui.initCheatDropdown();
        ui.updateInterfaceText(); // <--- Add this line
        ui.refresh();
        ui.showTab('hq', document.querySelector('.tab-btn')); // Select first tab
    },

    initCheatDropdown: function () {
        const sel = document.getElementById('cheat-building');
        if (!sel) return;
        sel.innerHTML = "";
        for (let b in DB.buildings) {
            const opt = document.createElement('option');
            opt.value = b;
            opt.innerText = T_Name(b);
            sel.appendChild(opt);
        }
    },
    // Add these functions INSIDE the ui object in ui.js

    setLang: function (l) {
        if (!STRINGS[l]) { console.error("Language not found:", l); return; }
        LANG = l;
        ui.updateInterfaceText();
        ui.refresh(); // Refresh UI to update dynamic content like unit cards
        ui.renderMap(); // Refresh map to update tooltips if applicable
    },

    updateInterfaceText: function () {
        // Map HTML IDs to STRINGS keys
        const mapping = {
            // Tabs
            'tab-hq': 'tab_hq',
            'tab-recruit': 'tab_recruit',
            'tab-map': 'tab_map',
            'tab-reports': 'tab_reports',
            'tab-settings': 'tab_settings',

            // Buttons & Headers
            'btn-return-home': 'btn_return',
            'btn-clear-history': 'btn_clear',
            'header-language': 'header_lang',
            'header-debug': 'header_debug',
            'header-cheat': 'header_cheat',
            'header-save': 'header_save',
            'btn-download': 'btn_download',
            'btn-wipe': 'btn_wipe',
            'btn-close-build': 'btn_close'
        };

        for (let id in mapping) {
            const el = document.getElementById(id);
            if (el) {
                // Only update text, preserve existing HTML structure if needed
                // But for buttons/tabs usually pure text replacement is fine
                el.innerText = T(mapping[id]);
            }
        }
    },

    centerMapOnVillage: function () { const v = engine.getCurrentVillage(); state.mapView.x = v.x; state.mapView.y = v.y; ui.renderMap(); },

    showTab: function (id, btn) {
        document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        btn.classList.add('active');
        if (id === 'map') ui.renderMap();
        ui.refresh();
    },

    refresh: function () {
        // 1. Force Point Calculation immediately
        engine.updatePoints();

        const v = engine.getCurrentVillage();
        ui.renderHeader(v);
        ui.renderVillageInfo(v);

        // Note: 'village-points' is now also handled in engine.updatePoints(), 
        // but keeping it here is fine as a redundancy or you can remove this specific line.
        document.getElementById('village-points').innerText = v.points || 0;

        document.getElementById('res-wood').innerText = Math.floor(v.res[0]);
        document.getElementById('res-clay').innerText = Math.floor(v.res[1]);
        document.getElementById('res-iron').innerText = Math.floor(v.res[2]);

        const popUsed = (function () {
            // ... (your existing pop logic) ...
            let p = 0;
            for (let b in v.buildings) p += DB.buildings[b].pop * v.buildings[b];
            for (let u in v.units) p += DB.units[u].pop * v.units[u];
            for (let k in v.queues) {
                if (k === 'build' || k === 'research') continue;
                v.queues[k].forEach(q => p += DB.units[q.unit].pop * q.count);
            }
            state.missions.filter(m => m.originId === v.id).forEach(m => { for (let u in m.units) p += DB.units[u].pop * m.units[u]; });
            state.villages.forEach(vil => {
                if (vil.stationed) {
                    vil.stationed.forEach(s => {
                        if (s.originId === v.id) {
                            for (let u in s.units) p += DB.units[u].pop * s.units[u];
                        }
                    });
                }
            });
            return p;
        })();

        const popMax = Math.floor(240 * Math.pow(1.17, v.buildings["Farm"]));
        const popElem = document.getElementById('pop-current');
        popElem.innerText = popUsed;
        document.getElementById('pop-max').innerText = popMax;
        popElem.style.color = popUsed >= popMax ? "red" : "inherit";
        document.getElementById('storage-max').innerText = engine.getStorage(v);

        // --- Render All Queues ---
        let qHTML = "";

        // Build Queue
        v.queues.build.forEach((item, idx) => {
            const rem = Math.max(0, item.finish - Date.now());
            qHTML += `<div class="q-item">🔨 <b>${T_Name(item.building)}</b> <span class="timer">${formatTime(rem)}</span> <button class="btn-x" onclick="game.cancel('build', ${idx})">❌</button></div>`;
        });

        // Research Queue
        v.queues.research.forEach((item, idx) => {
            const rem = Math.max(0, item.finish - Date.now());
            qHTML += `<div class="q-item">🧪 <b>${T_Name(item.unit)}</b> <span class="timer">${formatTime(rem)}</span> <button class="btn-x" onclick="game.cancel('research', ${idx})">❌</button></div>`;
        });

        // Unit Queues (Barracks, Stable, Workshop, Academy)
        ['barracks', 'stable', 'workshop', 'academy'].forEach(qName => {
            if (v.queues[qName].length > 0) {
                qHTML += `<div style="font-size:10px; font-weight:bold; color:#666; margin-top:2px; text-transform:uppercase;">${T_Name(qName.charAt(0).toUpperCase() + qName.slice(1))}</div>`;
                v.queues[qName].forEach((item, idx) => {
                    const rem = Math.max(0, item.finish - Date.now());
                    qHTML += `<div class="q-item">⚔️ <b>${T_Name(item.unit)}</b> (${item.count}) <span class="timer">${formatTime(rem)}</span> <button class="btn-x" onclick="game.cancel('${qName}', ${idx})">❌</button></div>`;
                });
            }
        });

        document.getElementById('queues-container').innerHTML = qHTML;

        if (document.getElementById('hq').classList.contains('active')) ui.renderVillage();
        if (document.getElementById('recruit').classList.contains('active')) ui.renderRecruit();
        if (document.getElementById('map').classList.contains('active')) ui.renderMinimap();
        ui.renderReports();
    },

    // --- NEW: Village Overview Info ---
    renderVillageInfo: function (v) {
        // 1. Layout Container setup (Keep existing code)
        let container = document.getElementById('hq-layout');
        if (!container) {
            container = document.createElement('div');
            container.id = 'hq-layout';
            container.style.display = 'flex';
            container.style.gap = '10px';
            const mapDiv = document.getElementById('village-map');
            mapDiv.parentNode.insertBefore(container, mapDiv);
            container.appendChild(mapDiv);
        }

        let info = document.getElementById('village-info-panel');
        if (!info) {
            info = document.createElement('div');
            info.id = 'village-info-panel';
            info.className = 'info-panel';
            info.style.flex = '1';
            info.style.minWidth = '200px';
            info.style.background = '#f0f0f0';
            info.style.padding = '10px';
            container.appendChild(info);
        }

        const incomingAttacks = state.missions.filter(m =>
            m.targetId === v.id && m.type === 'attack'
        );
        let warningHtml = "";
        if (incomingAttacks.length > 0) {
            // Find earliest arrival
            const soonest = incomingAttacks.sort((a, b) => a.arrival - b.arrival)[0];
            const ms = Math.max(0, soonest.arrival - Date.now());

            warningHtml = `
            <div style="background:#ffebee; border:2px solid #d32f2f; color:#d32f2f; padding:10px; margin-bottom:10px; text-align:center; animation:pulse 1s infinite;">
                <div style="font-size:16px; font-weight:bold;">⚔️ INCOMING ATTACK!</div>
                <div style="font-size:12px;">Count: ${incomingAttacks.length}</div>
                <div style="font-size:14px; margin-top:5px;">Next in: <b>${formatTime(ms)}</b></div>
                <button class="btn btn-red btn-mini" style="margin-top:5px;" onclick="ui.showTab('map', document.getElementById('tab-map'))">View Map</button>
            </div>
            `;
        }

        // 3. Calculate Unit Counts (Existing Logic)
        let unitHtml = '<table style="width:100%; font-size:11px; border-collapse:collapse;"><tr><th style="text-align:left">Unit</th><th>Home</th><th>Total</th></tr>';

        for (let u in DB.units) {
            const home = v.units[u] || 0;
            let outside = 0;

            state.missions.forEach(m => {
                if (m.originId === v.id && m.units[u]) outside += m.units[u];
            });
            state.villages.forEach(vil => {
                if (vil.stationed) {
                    vil.stationed.forEach(s => {
                        if (s.originId === v.id && s.units[u]) outside += s.units[u];
                    });
                }
            });

            const totalOwn = home + outside;
            let fromOthers = 0;
            if (v.stationed) v.stationed.forEach(s => { if (s.units[u]) fromOthers += s.units[u]; });

            if (totalOwn > 0 || fromOthers > 0) {
                unitHtml += `<tr>
                    <td style="border-bottom:1px solid #ddd; padding:2px;">${T_Name(u)}</td>
                    <td style="border-bottom:1px solid #ddd; padding:2px;">
                        ${home} ${fromOthers > 0 ? `<span style='color:blue; font-size:9px'>(+${fromOthers})</span>` : ''}
                    </td>
                    <td style="border-bottom:1px solid #ddd; padding:2px;">${totalOwn}</td>
                </tr>`;
            }
        }
        unitHtml += '</table>';

        // 4. Render Final HTML
        const woodRate = Math.floor(30 * Math.pow(1.16, v.buildings["Timber Camp"]));
        const clayRate = Math.floor(30 * Math.pow(1.16, v.buildings["Clay Pit"]));
        const ironRate = Math.floor(30 * Math.pow(1.16, v.buildings["Iron Mine"]));

        info.innerHTML = `
        ${warningHtml}
        <h4 style="margin-top:0">Production / hr</h4>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:10px;">
            <span>🌲 ${woodRate}</span> <span>🧱 ${clayRate}</span> <span>🔩 ${ironRate}</span>
        </div>
        <hr>
        <h4 style="margin:5px 0">Troops</h4>
        ${unitHtml}
        <div style="margin-top:10px;">
            <button class="btn-mini" style="width:100%" onclick="ui.openTroopsModal()">Manage Stationed Troops</button>
        </div>
        `;
    },

    renderRecruit: function () {
        const v = engine.getCurrentVillage();
        const div = document.getElementById('unit-list');
        div.innerHTML = "";

        // Group by Building
        const groups = { "Barracks": [], "Stable": [], "Workshop": [], "Academy": [] };
        for (let u in DB.units) {
            if (u === "Catapult" && !CONFIG.enableCatapults) continue;
            const b = DB.units[u].building || "Barracks";
            if (groups[b]) groups[b].push(u);
        }

        for (let b in groups) {
            if (groups[b].length === 0) continue;
            // Header for Building
            div.innerHTML += `<div style="width:100%; font-weight:bold; margin-top:10px; border-bottom:1px solid #ccc;">${T_Name(b)}</div>`;

            groups[b].forEach(u => {
                const d = DB.units[u];
                const tech = (v.techs && v.techs[u]) ? v.techs[u] : 1;
                const factor = getTechMultiplier(tech);
                const att = Math.floor(d.att * factor);
                const def = Math.floor(d.def * factor);
                const isBoosted = tech > 1 ? "color:green; font-weight:bold;" : "";

                div.innerHTML += `
                <div class="card">
                    <h3>${T_Name(u)} <span style="font-size:11px; color:#444;">(Lv ${tech})</span> <span style="font-size:12px; float:right; color:#666">${T('troops')}: ${v.units[u]}</span></h3>
                    <div class="unit-stats">
                        <span style="${isBoosted}">⚔️ ${att}</span>
                        <span style="${isBoosted}">🛡️ ${def}</span>
                        <span>👥 ${d.pop}</span> <span>🎒 ${d.carry}</span>
                    </div>
                    <div class="unit-cost">
                        🌲${d.cost[0]} 🧱${d.cost[1]} 🔩${d.cost[2]} | ⏳ ${formatTime(d.time * 1000)}
                    </div>
                    <div style="display:flex; gap:2px; margin-top:5px;">
                        <button class="btn" style="flex:1" onclick="game.recruit('${u}')">${T('recruit')}</button>
                        <button class="btn" style="width:40px;" onclick="game.recruitMax('${u}')">${T('max')}</button>
                    </div>
                </div>`;
            });
        }
    },

    openAttackModal: function (t) {
        ui.selTile = t;
        const v = engine.getCurrentVillage();

        // Check if the target is one of MY villages
        const isMyVillage = t.type === 'player' && state.villages.some(vil => vil.id === t.id && vil.owner === 'player');

        let html = "";
        for (let u in v.units) {
            if (v.units[u] > 0) {
                html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <div style="width:80px;">${T_Name(u)} (${v.units[u]})</div>
                    <div class="input-group">
                        <input type="number" id="atk-${u}" max="${v.units[u]}" value="0" style="width:50px">
                        <button class="btn-mini" onclick="document.getElementById('atk-${u}').value = ${v.units[u]}">${T('max')}</button>
                    </div>
                </div>`;
            }
        }

        document.getElementById('a-modal-title').innerText = isMyVillage ? `${t.name} (My Village)` : `Target: ${t.name}`;
        document.getElementById('a-modal-units').innerHTML = html || T('noTroops');

        const footer = document.querySelector('#attack-modal .modal-actions');

        // CHECK MARKET
        const marketLvl = v.buildings["Market"] || 0;
        // Create the Resource Button HTML if Market exists
        // It calls openMarketModal with the target ID
        const resBtn = marketLvl > 0
            ? `<button class="btn btn-blue" onclick="ui.closeAttackModal(); ui.openMarketModal(${t.id})">💰 Send Res</button>`
            : '';

        if (isMyVillage) {
            footer.innerHTML = `
        <button class="btn btn-red" onclick="ui.closeAttackModal()">${T('cancel')}</button>
        <button class="btn" onclick="ui.switchVillage(${t.id}); ui.closeAttackModal(); ui.showTab('hq', document.querySelector('.tab-btn'));">Enter Village</button>
        <button class="btn btn-blue" onclick="game.launchAttack('support')">🛡️ Support</button>
        ${resBtn}
    `;
        } else {
            footer.innerHTML = `
        <button class="btn btn-red" onclick="ui.closeAttackModal()">${T('cancel')}</button>
        <button class="btn" onclick="game.launchAttack('attack')">⚔️ ${T('attack')}</button>
        <button class="btn btn-blue" onclick="game.launchAttack('support')">🛡️ Support</button>
        ${resBtn}
    `;
        }

        document.getElementById('attack-modal').style.display = 'flex';
    },

    openTroopsModal: function () {
        const v = engine.getCurrentVillage();
        let html = "<h3>Stationed Here (From Others)</h3>";

        if (!v.stationed || v.stationed.length === 0) {
            html += "<div>None</div>";
        } else {
            v.stationed.forEach((s, idx) => {
                const originV = state.villages.find(vil => vil.id === s.originId);
                const name = originV ? originV.name : "Unknown";
                let uStr = "";
                for (let u in s.units) if (s.units[u] > 0) uStr += `${T_Name(u)}: ${s.units[u]}, `;
                html += `<div style="background:#eee; padding:5px; margin-bottom:5px; border:1px solid #ccc;">
                    <b>From: ${name}</b><br>
                    ${uStr}<br>
                    <button class="btn-mini" onclick="game.sendBackSupport(${idx})">Send Back</button>
                </div>`;
            });
        }

        html += "<hr><h3>My Troops Elsewhere</h3>";
        let found = false;
        state.villages.forEach(target => {
            if (target.stationed) {
                target.stationed.forEach((s, idx) => {
                    if (s.originId === v.id) {
                        found = true;
                        let uStr = "";
                        for (let u in s.units) if (s.units[u] > 0) uStr += `${T_Name(u)}: ${s.units[u]}, `;
                        html += `<div style="background:#eee; padding:5px; margin-bottom:5px; border:1px solid #ccc;">
                            <b>At: ${target.name} (${target.x}|${target.y})</b><br>
                            ${uStr}<br>
                            <button class="btn-mini" onclick="game.withdrawSupport(${target.id})">Withdraw</button>
                        </div>`;
                    }
                });
            }
        });
        if (!found) html += "<div>None</div>";

        document.getElementById('r-modal-content').innerHTML = html;
        document.getElementById('report-modal').style.display = 'flex';
    },

    updateLoop: function () { ui.refresh(); ui.updateMissions(); },
    renderHeader: function (v) {
        const select = document.getElementById('village-select');
        const playerVillages = state.villages.filter(vil => vil.owner === 'player');
        if (select.options.length !== playerVillages.length) {
            select.innerHTML = "";
            playerVillages.forEach(pv => {
                const opt = document.createElement('option');
                opt.value = pv.id;
                opt.innerText = `${pv.name} (${pv.x}|${pv.y})`;
                select.appendChild(opt);
            });
        }
        select.value = v.id;
    },
    switchVillage: function (id) { state.selectedVillageId = parseFloat(id); ui.refresh(); const v = engine.getCurrentVillage(); state.mapView.x = v.x; state.mapView.y = v.y; ui.renderMap(); },
    renameVillage: function () { const v = engine.getCurrentVillage(); const newName = prompt("Name:", v.name); if (newName) { v.name = newName; state.mapData[`${v.x},${v.y}`].name = newName; ui.refresh(); engine.save(); } },
    renderVillage: function () {
        const v = engine.getCurrentVillage();
        const map = document.getElementById('village-map');
        map.innerHTML = "";

        // FIX: Force height and positioning context so absolute children don't collapse it
        map.style.position = "relative";
        map.style.height = "550px";
        map.style.border = "1px solid #999";
        map.style.background = "rgba(0,0,0,0.1)";

        for (let b in DB.positions) {
            const pos = DB.positions[b];
            const div = document.createElement('div');
            div.className = "b-spot";
            div.style.top = pos.top + "%"; div.style.left = pos.left + "%";
            div.style.width = pos.width + "%"; div.style.height = pos.height + "%";
            div.style.zIndex = pos.zIndex || 5;
            div.style.backgroundColor = pos.backgroundColor || pos.color || "rgba(100,100,100,0.5)";
            if (pos.shape) div.style.borderRadius = pos.shape;
            if (pos.border) div.style.border = pos.border;
            const lvl = v.buildings[b];
            if (b !== "Wall") div.innerHTML = `<div class="b-lvl">${lvl}</div><div>${T_Name(b)}</div>`;
            const d = DB.buildings[b];
            const cost = [Math.floor(d.base[0] * Math.pow(d.factor, lvl)), Math.floor(d.base[1] * Math.pow(d.factor, lvl)), Math.floor(d.base[2] * Math.pow(d.factor, lvl))];
            if (v.res[0] >= cost[0] && v.res[1] >= cost[1] && v.res[2] >= cost[2]) div.classList.add('affordable');
            div.onclick = (e) => { e.stopPropagation(); ui.openBuildingModal(b); };
            map.appendChild(div);
        }
    },
    openBuildingModal: function (bName) {
        ui.selBuild = bName;
        const v = engine.getCurrentVillage();
        const d = DB.buildings[bName];

        // --- 1. SMITHY HANDLING ---
        if (bName === "Smithy") {
            document.getElementById('b-modal-title').innerText = T_Name("Smithy");
            document.getElementById('b-modal-desc').innerText = "Research units and upgrade the building.";

            // A. RESEARCH SECTION (Uses current completed level for time calc)
            let html = "<div style='display:grid; grid-template-columns: 1fr 1fr; gap:5px; max-height:200px; overflow-y:auto; margin-bottom:10px;'>";
            for (let u in DB.units) {
                if (u === "Catapult" && !CONFIG.enableCatapults) continue;
                if (!v.techs) v.techs = {};
                const curLvl = v.techs[u] || 1;
                const nextLvl = curLvl + 1;
                const maxLvl = DB.units[u].maxLevel || 3;
                if (curLvl >= maxLvl) {
                    html += `<div style="background:#eee; padding:5px; font-size:12px; border:1px solid #ccc; opacity:0.7"><b>${T_Name(u)}</b><br><span style="color:gold;">★ MAX (Lv${curLvl})</span></div>`;
                } else {
                    const rc = DB.units[u].cost.map(x => Math.floor(x * curLvl * 5));
                    const baseTime = DB.units[u].time * 10;
                    // Research speed depends on COMPLETED level, not virtual
                    const rTime = Math.floor(baseTime * Math.pow(0.9, v.buildings[bName]) * 1000);
                    html += `<div style="background:#eee; padding:5px; font-size:12px; border:1px solid #ccc;"><b>${T_Name(u)}</b><br>Next: Lv${nextLvl}<br>🌲${rc[0]} 🧱${rc[1]} 🔩${rc[2]}<br>⏳ ${formatTime(rTime)}<br><button class="btn" style="padding:2px 5px; font-size:10px; width:100%" onclick="game.research('${u}')">${T('upgrade')}</button></div>`;
                }
            }
            html += "</div>";

            // B. UPGRADE BUILDING SECTION (FIXED: Uses Virtual Level)
            
            // Calculate Virtual Level
            const queuedCount = v.queues.build.filter(q => q.building === bName).length;
            const virtualLvl = v.buildings[bName] + queuedCount;

            const c = [
                Math.floor(d.base[0] * Math.pow(d.factor, virtualLvl)), 
                Math.floor(d.base[1] * Math.pow(d.factor, virtualLvl)), 
                Math.floor(d.base[2] * Math.pow(d.factor, virtualLvl))
            ];
            const tSeconds = Math.floor(d.time * Math.pow(1.2, virtualLvl));

            // Queue Status Text
            let queueStatus = "";
            if (queuedCount > 0) {
                queueStatus = `<div style="color:blue; font-size:11px; margin-bottom:5px;">Check: ${queuedCount} upgrades in queue.</div>`;
            }

            html += `<hr><h4>${T('upgrade')} ${T_Name(bName)} (Lv ${virtualLvl} ➔ ${virtualLvl + 1})</h4>`;
            html += `${queueStatus}`;
            
            const btnText = `${T('upgrade')} ${T_Name(bName)}`;

            html += `<div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>🌲${c[0]} 🧱${c[1]} 🔩${c[2]} | ⏳ ${formatTime(tSeconds * 1000)}</span>
                        <button id="smithy-upgrade-btn" class="btn">${btnText}</button>
                     </div>`;

            document.getElementById('b-modal-cost').innerHTML = html;
            document.getElementById('b-modal-btn').style.display = 'none';

            // Dynamic Button Logic
            setTimeout(() => {
                const btn = document.getElementById('smithy-upgrade-btn');
                if (btn) {
                    btn.onclick = () => { 
                        game.build(bName); 
                        ui.openBuildingModal(bName); // Re-open to update costs
                    };
                    
                    // FIX: Check Queue Limit, not just if queue > 0
                    const isQueueFull = v.queues.build.length >= CONFIG.buildQueueLimit;
                    const canAfford = v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2];
                    
                    if(isQueueFull) {
                        btn.innerText = "Queue Full";
                        btn.disabled = true;
                    } else if (!canAfford) {
                        btn.disabled = true;
                    }
                }
            }, 0);

            document.getElementById('building-modal').style.display = 'flex';
            return;
        }

        // --- 2. STANDARD BUILDING HANDLING (Your existing correct code) ---
        
        // 1. Calculate Virtual Level (Current + Queued)
        const queuedCount = v.queues.build.filter(q => q.building === bName).length;
        const virtualLvl = v.buildings[bName] + queuedCount;

        // 2. Calculate Cost/Time based on Virtual Level
        const c = [
            Math.floor(d.base[0] * Math.pow(d.factor, virtualLvl)),
            Math.floor(d.base[1] * Math.pow(d.factor, virtualLvl)),
            Math.floor(d.base[2] * Math.pow(d.factor, virtualLvl))
        ];

        const tSeconds = Math.floor(d.time * Math.pow(1.2, virtualLvl));

        document.getElementById('b-modal-title').innerText = `${T_Name(bName)} (Lv ${virtualLvl})`;
        document.getElementById('b-modal-desc').innerText = d.desc;

        // Display Queue Status if busy
        let queueStatus = "";
        if (queuedCount > 0) {
            queueStatus = `<div style="color:blue; font-size:11px; margin-bottom:5px;">Check: ${queuedCount} upgrades in queue.</div>`;
        }

        document.getElementById('b-modal-cost').innerHTML = `
            ${queueStatus}
            ${T('cost')}: 🌲${c[0]} 🧱${c[1]} 🔩${c[2]} | ⏳ ${formatTime(tSeconds * 1000)}
        `;

        const btn = document.getElementById('b-modal-btn');
        btn.innerText = `${T('upgrade')} ${T_Name(bName)}`;
        btn.style.display = 'inline-block';

        // 3. Update Button Logic
        btn.onclick = () => {
            game.build(bName);
            ui.openBuildingModal(bName);
        };

        // 4. Disable Condition
        const isQueueFull = v.queues.build.length >= CONFIG.buildQueueLimit;
        const canAfford = v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2];

        btn.disabled = !canAfford || isQueueFull;
        if (isQueueFull) btn.innerText = "Queue Full";

        document.getElementById('building-modal').style.display = 'flex';
    },
    renderMap: function () {
        const cx = state.mapView.x, cy = state.mapView.y;
        document.getElementById('map-center-coords').innerText = `${cx}|${cy}`;
        const grid = document.getElementById('map-grid');
        grid.innerHTML = "";
        engine.generateMapChunk(cx, cy);
        for (let y = cy - 7; y <= cy + 7; y++) {
            for (let x = cx - 7; x <= cx + 7; x++) {
                const t = state.mapData[`${x},${y}`];
                const d = document.createElement('div');
                d.className = "tile";
                if (t && t.type !== "empty") {
                    d.classList.add(t.type);
                    const pts = t.points ? `\n<span style='font-size:7px'>${t.points}</span>` : "";
                    const icon = t.type === "player" ? "🏰" : (t.type === "enemy" ? "🏯" : "🛖");
                    let displayName = T_Name(t.name); if (!STRINGS[LANG][t.name]) displayName = t.name;
                    d.innerHTML = `${icon}<div class="tile-name">${displayName}</div>${pts}`;

                    d.onclick = (e) => {
                        e.stopPropagation();
                        if (t.id === engine.getCurrentVillage().id) {
                            alert("You are currently managing this village.");
                            return;
                        }
                        ui.openAttackModal(t);
                    };
                }
                if (x === cx && y === cy) d.style.border = "2px solid yellow";
                grid.appendChild(d);
            }
        }
        ui.renderMinimap();
    },
    renderMinimap: function () {
        const cvs = document.getElementById('minimap'); if (!cvs) return; const ctx = cvs.getContext('2d');
        const w = cvs.width, h = cvs.height; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        const scale = w / CONFIG.mapSize;
        state.villages.forEach(v => { const mx = v.x * scale; const my = v.y * scale; ctx.fillStyle = v.owner === 'player' ? '#FFFF00' : (v.owner === 'enemy' ? '#FF0000' : '#888888'); ctx.fillRect(mx, my, 2, 2); });
        const vx = state.mapView.x * scale; const vy = state.mapView.y * scale; ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1; ctx.strokeRect(vx - 3, vy - 3, 6, 6);
    },
    updateMissions: function () {
        const el = document.getElementById('active-missions');
        if (!el) return;

        // Sort by arrival time (soonest first)
        const sortedMissions = [...state.missions].sort((a, b) => a.arrival - b.arrival);

        el.innerHTML = sortedMissions.map(m => {
            const ms = Math.max(0, m.arrival - Date.now());
            const timeStr = formatTime(ms);

            // Helper to get names
            const getV = (id) => state.villages.find(v => v.id === id);
            const originV = getV(m.originId);
            const targetV = getV(m.targetId);

            const originName = originV ? `${originV.name} (${originV.x}|${originV.y})` : "Unknown";
            const targetName = targetV ? `${targetV.name} (${targetV.x}|${targetV.y})` : "Unknown";

            // Determine Mission Context
            let text = "";
            let colorClass = "";
            let icon = "";

            if (m.type === 'attack') {
                // Check if *I* am the target
                const myVillages = state.villages.filter(v => v.owner === 'player').map(v => v.id);
                if (myVillages.includes(m.targetId)) {
                    // INCOMING ATTACK
                    text = `⚔️ <b>INCOMING</b> from <br>${originName} <br>➔ ${targetName}`;
                    colorClass = "mission-incoming";
                    icon = "🚨";
                } else {
                    // OUTGOING ATTACK
                    text = `⚔️ Attack on ${targetName}`;
                    colorClass = "mission-attack";
                    icon = "⚔️";
                }
            } else if (m.type === 'support') {
                text = `🛡️ Support ➔ ${targetName}`;
                colorClass = "mission-support";
                icon = "🛡️";
            } else if (m.type === 'transport') {
                text = `💰 Transport ➔ ${targetName}`;
                colorClass = "mission-transport";
                icon = "💰";
            } else {
                text = `🔙 Return`;
                colorClass = "mission-return";
                icon = "🔙";
            }

            return `
            <div class="mission-card ${colorClass}">
                <div class="m-icon">${icon}</div>
                <div class="m-info">
                    <div class="m-text">${text}</div>
                    <div class="m-timer">${timeStr}</div>
                </div>
            </div>`;
        }).join('');
    },
    renderReports: function () { document.getElementById('report-list').innerHTML = state.reports.map((r, i) => `<div class="report-item report-${r.type}" onclick="ui.openReport(${i})"><span>${r.title}</span><span>${r.time}</span></div>`).join(''); },
    openReport: function (i) { document.getElementById('r-modal-content').innerHTML = state.reports[i].content; document.getElementById('report-modal').style.display = 'flex'; },
    closeBuildingModal: () => document.getElementById('building-modal').style.display = 'none',
    closeAttackModal: () => document.getElementById('attack-modal').style.display = 'none',
    closeReportModal: () => document.getElementById('report-modal').style.display = 'none',
    openMarketModal: function (targetId) {
        const v = engine.getCurrentVillage();
        const marketLvl = v.buildings["Market"] || 0;
        const maxCap = marketLvl * CONFIG.marketCapacityPerLevel;

        const targetV = state.villages.find(vil => vil.id === targetId);
        if (!targetV) return;

        // HTML with Max Buttons
        let html = `
            <div style="padding:10px;">
                <div style="margin-bottom:10px; background:#e0f7fa; padding:5px; border:1px solid #00acc1;">
                    <b>Target:</b> ${targetV.name} (${targetV.x}|${targetV.y})<br>
                    <b>Capacity:</b> ${maxCap}
                </div>
                
                <input type="hidden" id="market-target-id" value="${targetId}">

                <div style="display:grid; grid-template-columns: 30px 1fr 50px; gap:5px; align-items:center; margin-bottom:5px;">
                    <span>🌲</span> 
                    <input type="number" id="market-wood" value="0" max="${Math.floor(v.res[0])}" style="width:100%">
                    <button class="btn-mini" onclick="ui.setMaxMarket('wood')">${T('max')}</button>

                    <span>🧱</span> 
                    <input type="number" id="market-clay" value="0" max="${Math.floor(v.res[1])}" style="width:100%">
                    <button class="btn-mini" onclick="ui.setMaxMarket('clay')">${T('max')}</button>

                    <span>🔩</span> 
                    <input type="number" id="market-iron" value="0" max="${Math.floor(v.res[2])}" style="width:100%">
                    <button class="btn-mini" onclick="ui.setMaxMarket('iron')">${T('max')}</button>
                </div>
                
                <button class="btn btn-blue" style="width:100%; margin-top:15px;" onclick="game.sendResources()">Confirm Transport</button>
            </div>
        `;

        document.getElementById('b-modal-title').innerText = `${T_Name('Market')} (Lv ${marketLvl})`;
        document.getElementById('b-modal-desc').innerText = "Send resources.";
        document.getElementById('b-modal-cost').innerHTML = html;
        document.getElementById('b-modal-btn').style.display = 'none';
        document.getElementById('building-modal').style.display = 'flex';
    },
    setMaxMarket: function (type) {
        const v = engine.getCurrentVillage();
        const marketLvl = v.buildings["Market"] || 0;
        const maxCap = marketLvl * CONFIG.marketCapacityPerLevel;

        // Get current values of ALL inputs
        const wVal = parseInt(document.getElementById('market-wood').value) || 0;
        const cVal = parseInt(document.getElementById('market-clay').value) || 0;
        const iVal = parseInt(document.getElementById('market-iron').value) || 0;

        // Calculate how much capacity is used by the *other* two fields
        let usedByOthers = 0;
        if (type === 'wood') usedByOthers = cVal + iVal;
        else if (type === 'clay') usedByOthers = wVal + iVal;
        else if (type === 'iron') usedByOthers = wVal + cVal;

        const remainingCap = Math.max(0, maxCap - usedByOthers);

        // Determine stock for the specific resource
        let stock = 0;
        if (type === 'wood') stock = Math.floor(v.res[0]);
        else if (type === 'clay') stock = Math.floor(v.res[1]);
        else if (type === 'iron') stock = Math.floor(v.res[2]);

        // Set value to the lower of Stock vs Remaining Capacity
        document.getElementById('market-' + type).value = Math.min(stock, remainingCap);
    },
};