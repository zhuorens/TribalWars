// --- UI (Display) ---
const ui = {
    selTile: null, selBuild: null,

    init: function () {
        if (!document.getElementById('map-tooltip')) {
            const tt = document.createElement('div');
            tt.id = 'map-tooltip';
            document.body.appendChild(tt);
        }
        ui.initCheatDropdown();
        ui.updateInterfaceText();
        ui.refresh();
        ui.showTab('hq', document.querySelector('.tab-btn'));
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

    setLang: function (l) {
        if (!STRINGS[l]) { console.error("Language not found:", l); return; }
        LANG = l;
        state.lang = l;
        ui.updateInterfaceText();
        ui.refresh();
        ui.renderMap();
        ui.initCheatDropdown();
    },

    updateInterfaceText: function () {
        const mapping = {
            'tab-hq': 'tab_hq', 'tab-recruit': 'tab_recruit', 'tab-map': 'tab_map', 'tab-reports': 'tab_reports', 'tab-settings': 'tab_settings', 'tab-rankings': 'tab_rankings', 'tab-overview': 'tab_overview',
            'btn-return-home': 'btn_return', 'btn-clear-history': 'btn_clear', 'header-language': 'header_lang',
            'header-debug': 'header_debug', 'header-cheat': 'header_cheat', 'header-save': 'header_save',
            'btn-download': 'btn_download', 'btn-wipe': 'btn_wipe', 'btn-close-build': 'btn_close'
        };
        for (let id in mapping) {
            const el = document.getElementById(id);
            if (el) el.innerText = T(mapping[id]);
        }
    },

    centerMapOnVillage: function () { const v = engine.getCurrentVillage(); state.mapView.x = v.x; state.mapView.y = v.y; ui.renderMap(); },

    showTab: function (id, btn) {
        // 1. Reset all tabs
        document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));

        // 2. Activate the selected tab
        // Try finding ID directly, otherwise try adding 'tab-' prefix (common pattern)
        let target = document.getElementById(id);
        if (!target) target = document.getElementById('tab-' + id);

        if (target) target.classList.add('active');
        if (btn) btn.classList.add('active');

        // 3. Update global state (useful for the game loop to know what to render)
        ui.activeTab = id;

        // 4. Specific Render Logic
        if (id === 'map') {
            ui.renderMap();
        }
        else if (id === 'rankings') {
            ui.renderRankingTab(); // <--- Added this hook
        }
        else if (id === 'overview') {
            ui.renderOverview();
        }

        ui.refresh();
    },

    refresh: function () {
        engine.updatePoints();
        const v = engine.getCurrentVillage();
        ui.renderHeader(v);
        ui.renderVillageInfo(v);

        document.getElementById('village-points').innerText = v.points || 0;
        document.getElementById('res-wood').innerText = Math.floor(v.res[0]);
        document.getElementById('res-clay').innerText = Math.floor(v.res[1]);
        document.getElementById('res-iron').innerText = Math.floor(v.res[2]);

        // --- POPULATION UPDATE (Cleaned Up) ---
        const popUsed = engine.getPopUsed(v);
        const popMax = engine.getPopLimit(v);

        const popElem = document.getElementById('pop-current');
        popElem.innerText = popUsed;
        document.getElementById('pop-max').innerText = popMax;

        // Red color if full
        popElem.style.color = popUsed >= popMax ? "red" : "inherit";

        // Storage
        document.getElementById('storage-max').innerText = engine.getStorage(v);

        // --- Render All Queues ---
        let qHTML = "";

        // Build Queue
        v.queues.build.forEach((item, idx) => {
            let rem;
            if (idx === 0) {
                // First item: Time remaining from NOW
                rem = Math.max(0, item.finish - Date.now());
            } else {
                // Subsequent items: Duration relative to the previous item finishing
                const prevFinish = v.queues.build[idx - 1].finish;
                rem = Math.max(0, item.finish - prevFinish);
            }
            qHTML += `<div class="q-item">🔨 <b>${T_Name(item.building)}</b> <span class="timer">${formatTime(rem)}</span> <button class="btn-x" onclick="game.cancel('build', ${idx})">❌</button></div>`;
        });

        // Research Queue
        v.queues.research.forEach((item, idx) => {
            let rem;
            if (idx === 0) {
                rem = Math.max(0, item.finish - Date.now());
            } else {
                const prevFinish = v.queues.research[idx - 1].finish;
                rem = Math.max(0, item.finish - prevFinish);
            }
            qHTML += `<div class="q-item">🧪 <b>${T_Name(item.unit)}</b> <span class="timer">${formatTime(rem)}</span> <button class="btn-x" onclick="game.cancel('research', ${idx})">❌</button></div>`;
        });

        // Unit Queues
        ['barracks', 'stable', 'workshop', 'academy'].forEach(qName => {
            if (v.queues[qName].length > 0) {
                qHTML += `<div style="font-size:10px; font-weight:bold; color:#666; margin-top:2px; text-transform:uppercase;">${T_Name(qName.charAt(0).toUpperCase() + qName.slice(1))}</div>`;

                v.queues[qName].forEach((item, idx) => {
                    let totalRem = 0;

                    if (idx === 0) {
                        // --- ACTIVE BATCH ---
                        // 1. Time remaining for the ONE unit currently being built
                        // If finish is not set yet (just added), assume full unitTime
                        const nextFinish = item.finish || (Date.now() + item.unitTime);
                        const timeForCurrent = Math.max(0, nextFinish - Date.now());

                        // 2. Time for the remaining units in this stack
                        const timeForRest = Math.max(0, item.count - 1) * item.unitTime;

                        totalRem = timeForCurrent + timeForRest;
                    } else {
                        // --- WAITING BATCH ---
                        // These haven't started, so duration is full count * time per unit
                        totalRem = item.count * item.unitTime;
                    }

                    qHTML += `<div class="q-item">⚔️ <b>${T_Name(item.unit)}</b> (${item.count}) <span class="timer">${formatTime(totalRem)}</span> <button class="btn-x" onclick="game.cancel('${qName}', ${idx})">❌</button></div>`;
                });
            }
        });

        document.getElementById('queues-container').innerHTML = qHTML;

        if (document.getElementById('hq').classList.contains('active')) ui.renderVillage();
        if (document.getElementById('recruit').classList.contains('active')) ui.renderRecruit();
        if (document.getElementById('map').classList.contains('active')) ui.renderMinimap();
        ui.renderReports();
    },

    renderVillageInfo: function (v) {
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
            const soonest = incomingAttacks.sort((a, b) => a.arrival - b.arrival)[0];
            const ms = Math.max(0, soonest.arrival - Date.now());

            warningHtml = `
            <div style="background:#ffebee; border:2px solid #d32f2f; color:#d32f2f; padding:10px; margin-bottom:10px; text-align:center; animation:pulse 1s infinite;">
                <div style="font-size:16px; font-weight:bold;">⚔️ ${T('incoming_attack')}</div>
                <div style="font-size:12px;">Count: ${incomingAttacks.length}</div>
                <div style="font-size:14px; margin-top:5px;">${T('next_in')}: <b>${formatTime(ms)}</b></div>
                <button class="btn btn-red btn-mini" style="margin-top:5px;" onclick="ui.showTab('map', document.getElementById('tab-map'))">${T('view_map')}</button>
            </div>
            `;
        }

        let unitHtml = `<table style="width:100%; font-size:11px; border-collapse:collapse;"><tr><th style="text-align:left">${T('village')}</th><th>${T_Name('Headquarters')}</th><th>${T('troops')}</th></tr>`;

        for (let u in DB.units) {
            const home = v.units[u] || 0;
            let outside = 0;
            state.missions.forEach(m => {
                if (m.originId === v.id && m.units && m.units[u]) outside += m.units[u];
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

        // FIX: Using 60 as base to match your engine.js
        const woodRate = Math.floor(60 * Math.pow(1.16, v.buildings["Timber Camp"]));
        const clayRate = Math.floor(60 * Math.pow(1.16, v.buildings["Clay Pit"]));
        const ironRate = Math.floor(60 * Math.pow(1.16, v.buildings["Iron Mine"]));

        info.innerHTML = `
        ${warningHtml}
        <h4 style="margin-top:0">${T('production')} / hr</h4>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:10px;">
            <span>🌲 ${woodRate}</span> <span>🧱 ${clayRate}</span> <span>🔩 ${ironRate}</span>
        </div>
        <hr>
        <h4 style="margin:5px 0">${T('troops')}</h4>
        ${unitHtml}
        <div style="margin-top:10px;">
            <button class="btn-mini" style="width:100%" onclick="ui.openTroopsModal()">${T('manage_troops')}</button>
        </div>
        `;
    },

    renderRecruit: function () {
        const v = engine.getCurrentVillage();
        const div = document.getElementById('unit-list');
        div.innerHTML = "";

        const groups = { "Barracks": [], "Stable": [], "Workshop": [], "Academy": [] };
        for (let u in DB.units) {
            if (u === "Catapult" && !CONFIG.enableCatapults) continue;
            const b = DB.units[u].building || "Barracks";
            if (groups[b]) groups[b].push(u);
        }

        for (let b in groups) {
            if (groups[b].length === 0) continue;
            const bLvl = v.buildings[b] || 0;
            const isLocked = bLvl === 0;
            const color = isLocked ? "red" : "#666";

            div.innerHTML += `<div style="width:100%; font-weight:bold; margin-top:10px; border-bottom:1px solid #ccc;">
            ${T_Name(b)} <span style="font-size:11px; color:${color}">(Lv ${bLvl})</span>
        </div>`;

            groups[b].forEach(u => {
                const d = DB.units[u];
                const tech = (v.techs && v.techs[u]) ? v.techs[u] : 1;
                const factor = getTechMultiplier(tech);

                // 1. Calculate Boosted Stats
                const att = Math.floor(d.att * factor);
                const def = Math.floor(d.def * factor);
                const defCav = Math.floor((d.defCav || 0) * factor); // Added Cav Def

                const isBoosted = tech > 1 ? "color:green; font-weight:bold;" : "";

                // 2. Calculate Training Time Reduction
                // Formula: BaseTime * 0.9^(Level - 1) (Recruits 10% faster per level)
                const timeMultiplier = Math.pow(0.9, Math.max(0, bLvl - 1));
                const realTime = Math.max(1, Math.floor(d.time * timeMultiplier));

                // Logic for buttons
                const popAvail = engine.getPopLimit(v) - engine.getPopUsed(v);
                const hasSpace = popAvail >= d.pop;

                let btnHtml = "";
                if (isLocked) {
                    btnHtml = `<button class="btn" style="width:100%; background:#ccc; color:#666; border:1px solid #999;" disabled>${T('requires')} ${T_Name(b)}</button>`;
                } else if (!hasSpace) {
                    btnHtml = `<button class="btn" style="width:100%; background:#faa; color:#900;" disabled>Farm Full</button>`;
                } else {
                    btnHtml = `
                    <button class="btn" style="flex:1" onclick="game.recruit('${u}')">${T('recruit')}</button>
                    <button class="btn" style="width:40px;" onclick="game.recruitMax('${u}')">${T('max')}</button>
                `;
                }

                const cardStyle = isLocked ? "background:#eee; opacity:0.7;" : "";

                div.innerHTML += `
            <div class="card" style="${cardStyle}">
                <h3>
                    ${T_Name(u)} 
                    <span style="font-size:11px; color:#444;">(Lv ${tech})</span> 
                    <span style="font-size:12px; float:right; color:#666">${T('troops')}: ${v.units[u]}</span>
                </h3>
                <div class="unit-stats">
                    <span style="${isBoosted}" title="Attack">⚔️ ${att}</span>
                    <span style="${isBoosted}" title="Infantry Defense">🛡️ ${def}</span>
                    <span style="${isBoosted}" title="Cavalry Defense">🐎 ${defCav}</span>
                    <span>👥 ${d.pop}</span> 
                    <span>🎒 ${d.carry}</span>
                    <span>🏃 ${d.spd}m</span> </div>
                <div class="unit-cost">
                    🌲${d.cost[0]} 🧱${d.cost[1]} 🔩${d.cost[2]} | ⏳ ${formatTime(realTime * 1000)}
                </div>
                <div style="display:flex; gap:2px; margin-top:5px;">
                    ${btnHtml}
                </div>
            </div>`;
            });
        }
    },

    openAttackModal: function (t) {
        let target = t;
        // Attempt to find real village data in state
        if (t.id) {
            const found = state.villages.find(v => v.id === t.id);
            if (found) target = found;
        }

        ui.selTile = target;
        const v = engine.getCurrentVillage();

        // Determine Ownership & Profile
        const ownerId = target.owner || target.type; // e.g. 'player', 'barbarian', 'ai_1'
        const isMyVillage = ownerId === 'player' && state.villages.some(vil => vil.id === target.id);
        const profile = engine.getPlayerProfile(ownerId); // Get AI Name/Color

        // 1. Build Header Info (Owner Stats)
        const globalScore = engine.getGlobalScore(ownerId);
        const statusText = !profile.alive ? ` <span style="color:red; font-size:10px;">(DEFEATED)</span>` : "";

        let html = `
        <div style="background:#f4f4f4; padding:5px; margin-bottom:10px; border-bottom:1px solid #ccc; font-size:11px;">
            <div style="display:flex; justify-content:space-between;">
                <span><b>Owner:</b> <span style="color:${profile.color}">${profile.name}</span>${statusText}</span>
                <span><b>Points:</b> ${target.points || 0}</span>
            </div>
            ${ownerId !== 'player' && ownerId !== 'barbarian' ? `<div style="color:#666; margin-top:2px;">Empire Score: ${globalScore.toLocaleString()} pts</div>` : ''}
        </div>
        <div style="margin-bottom:10px; font-weight:bold; text-align:right;">
            ⏱️ ${T('duration')}: <span id="attack-duration">--:--:--</span>
        </div>`;

        // 2. Build Unit Inputs
        // Sort units by speed (fastest first usually helps, or slowest to see bottleneck)
        const unitKeys = Object.keys(v.units).filter(u => v.units[u] > 0);

        if (unitKeys.length === 0) {
            html += `<div style="padding:10px; color:#999; text-align:center;">${T('noTroops')}</div>`;
        } else {
            unitKeys.forEach(u => {
                const speed = DB.units[u].spd; // Updated from 'spd' to 'speed'
                html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <div style="width:110px;">
                    <b>${T_Name(u)}</b> <span style="font-size:10px; color:#666">(${v.units[u]})</span><br>
                    <span style="font-size:9px;">🏃 ${speed} m/tile</span>
                </div>
                <div class="input-group">
                    <input type="number" id="atk-${u}" max="${v.units[u]}" value="0" style="width:50px" oninput="ui.updateTravelTime()">
                    <button class="btn-mini" onclick="document.getElementById('atk-${u}').value = ${v.units[u]}; ui.updateTravelTime();">${T('max')}</button>
                </div>
            </div>`;
            });
        }

        // 3. Recent Reports (Intel)
        if (state.reports) {
            const recent = state.reports.filter(r =>
                r.targetId === target.id && r.missionType === 'attack'
            ).slice(0, 5);

            if (recent.length > 0) {
                html += `<div style="margin-top:15px; padding-top:10px; border-top:1px solid #ddd;">
                <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:5px;">📋 ${T('recent_reports') || "Recent Attacks"}</div>
                <table style="width:100%; font-size:10px; border-collapse:collapse;">`;

                recent.forEach(r => {
                    const dot = r.type === 'win' ? '🟢' : '🔴';

                    // Find the actual index in the main array to pass to the viewer
                    const rIndex = state.reports.indexOf(r);

                    // ADDED: onclick, cursor style, and hover effect
                    html += `
                <tr style="border-bottom:1px solid #eee; cursor:pointer; transition:background 0.1s;" 
                    onclick="ui.previewReport(${rIndex})"
                    onmouseenter="this.style.background='#f0f0f0'" 
                    onmouseleave="this.style.background='transparent'">
                    
                    <td style="padding:4px 5px;">${dot}</td>
                    <td style="padding:4px;">${r.title}</td>
                    <td style="padding:4px; text-align:right; color:#888;">${r.time}</td>
                </tr>`;
                });
                html += `</table></div>`;
            }
        }

        // 4. Modal Title
        const coords = (target.x !== undefined && target.y !== undefined) ? `(${target.x}|${target.y})` : "";
        const titleText = isMyVillage
            ? `${target.name} ${coords}`
            : `${T('target')}: ${target.name} ${coords}`;

        document.getElementById('a-modal-title').innerText = titleText;
        document.getElementById('a-modal-units').innerHTML = html;

        // 5. Action Buttons
        const footer = document.querySelector('#attack-modal .modal-actions');
        const marketLvl = v.buildings["Market"] || 0;
        const resBtn = marketLvl > 0
            ? `<button class="btn btn-blue" onclick="ui.closeAttackModal(); ui.openMarketModal('${target.id}')">💰 ${T('transport')}</button>`
            : '';

        let buttons = `<button class="btn btn-red" onclick="ui.closeAttackModal()">${T('btn_cancel')}</button>`;

        if (isMyVillage) {
            buttons += `<button class="btn" onclick="ui.switchVillage('${target.id}'); ui.closeAttackModal(); ui.showTab('hq', document.querySelector('.tab-btn'));">${T('btn_return') || "Enter Village"}</button>`;
        } else {
            buttons += `<button class="btn" onclick="game.launchAttack('attack')">⚔️ ${T('attack')}</button>`;
        }

        // Support is always available (even to self or enemies)
        buttons += `<button class="btn btn-blue" onclick="game.launchAttack('support')">🛡️ ${T('support')}</button>`;
        buttons += resBtn;

        footer.innerHTML = buttons;
        footer.style.display = 'flex';
        document.getElementById('attack-modal').style.display = 'flex';

        ui.updateTravelTime();
    },

    previewReport: function (index) {
        const r = state.reports[index];
        if (!r) return;

        const container = document.getElementById('a-modal-units');

        // Render Report Content
        const html = `
            <div style="background:#fff; border:1px solid #ccc; padding:10px; border-radius:4px; font-size:12px; max-height:300px; overflow-y:auto;">
                <div style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">
                    <div style="font-weight:bold; font-size:14px; color:${r.type === 'win' ? '#2e7d32' : '#c62828'}">
                        ${r.title}
                    </div>
                    <div style="color:#888; font-size:10px;">${r.time}</div>
                </div>
                <div style="line-height:1.4;">
                    ${r.content}
                </div>
            </div>
            
            <div style="margin-top:15px; text-align:center;">
                <button class="btn" onclick="ui.openAttackModal(ui.selTile)">⬅️ ${T('btn_return') || "Back to Attack"}</button>
            </div>
        `;

        container.innerHTML = html;

        // Update Title to indicate we are viewing a report
        document.getElementById('a-modal-title').innerText = "📋 Report View";

        // Hide the main modal footer actions (Attack/Support buttons) while viewing report
        const footer = document.querySelector('#attack-modal .modal-actions');
        if (footer) footer.style.display = 'none';
    },

    // --- NEW HELPER: Update Time Display ---
    updateTravelTime: function () {
        const display = document.getElementById('attack-duration');

        if (!display) return;

        const origin = engine.getCurrentVillage();
        const target = ui.selTile;
        if (!target) return;

        let slowestSpeed = 0;
        let hasUnits = false;

        // Check all inputs
        for (let u in DB.units) {
            const el = document.getElementById('atk-' + u);
            if (el) {
                const count = parseInt(el.value) || 0;
                if (count > 0) {
                    hasUnits = true;
                    if (DB.units[u].spd > slowestSpeed) slowestSpeed = DB.units[u].spd;
                }
            }
        }

        if (!hasUnits) {
            display.innerText = "--:--:--";
            return;
        }

        // Calc Distance
        const dx = Math.abs(origin.x - target.x);
        const dy = Math.abs(origin.y - target.y);
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Calc Time
        const ms = dist * slowestSpeed * 6 * 1000;
        display.innerText = formatTime(ms);
    },

    openTroopsModal: function () {
        const v = engine.getCurrentVillage();
        let html = `<h3>${T('stationed_here')}</h3>`;

        if (!v.stationed || v.stationed.length === 0) {
            html += `<div>${T('none')}</div>`;
        } else {
            v.stationed.forEach((s, idx) => {
                const originV = state.villages.find(vil => vil.id === s.originId);
                const name = originV ? originV.name : "Unknown";
                let uStr = "";
                for (let u in s.units) if (s.units[u] > 0) uStr += `${T_Name(u)}: ${s.units[u]}, `;
                html += `<div style="background:#eee; padding:5px; margin-bottom:5px; border:1px solid #ccc;">
                    <b>${T('from')}: ${name}</b><br>
                    ${uStr}<br>
                    <button class="btn-mini" onclick="game.sendBackSupport(${idx})">${T('send_back')}</button>
                </div>`;
            });
        }

        html += `<hr><h3>${T('my_troops_elsewhere')}</h3>`;
        let found = false;
        state.villages.forEach(target => {
            if (target.stationed) {
                target.stationed.forEach((s, idx) => {
                    if (s.originId === v.id) {
                        found = true;
                        let uStr = "";
                        for (let u in s.units) if (s.units[u] > 0) uStr += `${T_Name(u)}: ${s.units[u]}, `;
                        html += `<div style="background:#eee; padding:5px; margin-bottom:5px; border:1px solid #ccc;">
                            <b>${T('at')}: ${target.name} (${target.x}|${target.y})</b><br>
                            ${uStr}<br>
                            <button class="btn-mini" onclick="game.withdrawSupport(${target.id})">${T('withdraw')}</button>
                        </div>`;
                    }
                });
            }
        });
        if (!found) html += `<div>${T('none')}</div>`;

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
                opt.innerText = `${pv.name} (${pv.x}|${pv.y}) ${pv.points}`;
                select.appendChild(opt);
            });
        }
        select.value = v.id;
    },

    switchVillage: function (id) {
        state.selectedVillageId = parseFloat(id);
        ui.refresh(); const v = engine.getCurrentVillage(); state.mapView.x = v.x; state.mapView.y = v.y; ui.renderMap();
        const hqBtn = document.querySelector("button[onclick*='hq']");
        ui.showTab('hq', hqBtn);
    },

    renameVillage: function () {
        const v = engine.getCurrentVillage();
        const newName = prompt(T('rename'), v.name);
        if (newName) { v.name = newName; state.mapData[`${v.x},${v.y}`].name = newName; ui.refresh(); requestAutoSave(); }
    },

    renderVillage: function () {
        const v = engine.getCurrentVillage();
        const map = document.getElementById('village-map');
        if (!map) return;

        map.innerHTML = "";
        map.style.position = "relative";
        map.style.height = "550px";
        map.style.border = "1px solid #999";
        map.style.background = "rgba(0,0,0,0.1)";

        // Helper to get Available Pop
        const popAvail = engine.getPopLimit(v) - engine.getPopUsed(v);

        for (let b in DB.positions) {
            const pos = DB.positions[b];
            const d = DB.buildings[b];
            if (!d) continue;

            // 1. Calculate Virtual Level
            const currentLvl = v.buildings[b] || 0;
            const queuedCount = v.queues.build.filter(q => q.building === b).length;
            const virtualLvl = currentLvl + queuedCount;
            const maxLvl = d.maxLevel || 30;

            // Create Spot Div
            const div = document.createElement('div');
            div.className = "b-spot";
            div.style.top = pos.top + "%";
            div.style.left = pos.left + "%";
            div.style.width = pos.width + "%";
            div.style.height = pos.height + "%";
            div.style.zIndex = pos.zIndex || 5;
            div.style.backgroundColor = pos.backgroundColor || pos.color || "rgba(100,100,100,0.5)";
            if (pos.shape) div.style.borderRadius = pos.shape;
            if (pos.border) div.style.border = pos.border;

            // 2. Display Content
            let lvlDisplay = virtualLvl;
            if (virtualLvl >= maxLvl) {
                lvlDisplay = `<span style="color:gold; font-size:10px;">MAX</span>`;
            } else if (queuedCount > 0) {
                lvlDisplay = `${currentLvl}<span style="font-size:9px">+${queuedCount}</span>`;
            }

            if (b !== "Wall") {
                div.innerHTML = `<div class="b-lvl">${lvlDisplay}</div><div>${T_Name(b)}</div>`;
            }

            // 3. Affordability Check
            if (virtualLvl < maxLvl) {
                // Cost for the UPGRADE
                const cost = [
                    Math.floor(d.base[0] * Math.pow(d.factor, virtualLvl)),
                    Math.floor(d.base[1] * Math.pow(d.factor, virtualLvl)),
                    Math.floor(d.base[2] * Math.pow(d.factor, virtualLvl))
                ];

                // --- FIX: INCREMENTAL POPULATION CALCULATION ---
                // Pop Total at Next Level (target)
                // We use virtualLvl because that aligns with the cost formula (base * factor^L)
                const nextTotalPop = Math.round((d.basePop || 0) * Math.pow(d.factor, virtualLvl));

                // Pop Total at Current Level
                // If level is 0, pop is 0. Else use virtualLvl - 1
                const currentTotalPop = (virtualLvl === 0)
                    ? 0
                    : Math.round((d.basePop || 0) * Math.pow(d.factor, virtualLvl - 1));

                // The population needed is just the difference
                const popNeeded = Math.max(0, nextTotalPop - currentTotalPop);

                const hasRes = Math.floor(v.res[0]) >= cost[0] &&
                    Math.floor(v.res[1]) >= cost[1] &&
                    Math.floor(v.res[2]) >= cost[2];

                const hasPop = (b === "Farm" || b === "Warehouse" || popAvail >= popNeeded);

                if (hasRes && hasPop) {
                    div.classList.add('affordable');
                }
            }

            div.onclick = (e) => { e.stopPropagation(); ui.openBuildingModal(b); };
            map.appendChild(div);
        }
    },

    openBuildingModal: function (bName) {
        ui.selBuild = bName;
        const v = engine.getCurrentVillage();
        const d = DB.buildings[bName];
        const maxLvl = d.maxLevel || 30;

        // Helper: Calculate Available Population
        const popAvail = engine.getPopLimit(v) - engine.getPopUsed(v);

        // Helper: Calculate Pop Required for Next Level
        // Logic: (Total Pop at Next Level) - (Total Pop at Current Level)
        const getPopNeeded = (virtualLvl) => {
            const nextTotal = Math.round((d.basePop || 0) * Math.pow(d.factor, virtualLvl));
            const currentTotal = (virtualLvl === 0)
                ? 0
                : Math.round((d.basePop || 0) * Math.pow(d.factor, virtualLvl - 1));
            return Math.max(0, nextTotal - currentTotal);
        };

        // --- SMITHY HANDLING (Research + Upgrade) ---
        if (bName === "Smithy") {
            document.getElementById('b-modal-title').innerText = T_Name("Smithy");
            document.getElementById('b-modal-desc').innerText = d.desc;

            // 1. Render Unit Research List (Unchanged logic, kept for completeness)
            let html = "<div style='display:grid; grid-template-columns: 1fr 1fr; gap:5px; max-height:200px; overflow-y:auto; margin-bottom:10px;'>";
            for (let u in DB.units) {
                if (u === "Catapult" && !CONFIG.enableCatapults) continue;
                if (!v.techs) v.techs = {};
                const curLvl = v.techs[u] || 1;
                const nextLvl = curLvl + 1;
                const uMax = DB.units[u].maxLevel || 3;

                if (curLvl >= uMax) {
                    html += `<div style="background:#eee; padding:5px; font-size:12px; border:1px solid #ccc; opacity:0.7"><b>${T_Name(u)}</b><br><span style="color:gold;">★ ${T('max')} (Lv${curLvl})</span></div>`;
                } else {
                    const rc = DB.units[u].cost.map(x => Math.floor(x * curLvl * 15));
                    const baseTime = DB.units[u].time * 200;
                    const rTime = Math.floor(baseTime * Math.pow(0.9, v.buildings[bName]) * 1000);
                    // Research doesn't cost population, so no check here
                    html += `<div style="background:#eee; padding:5px; font-size:12px; border:1px solid #ccc;"><b>${T_Name(u)}</b><br>Next: Lv${nextLvl}<br>🌲${rc[0]} 🧱${rc[1]} 🔩${rc[2]}<br>⏳ ${formatTime(rTime)}<br><button class="btn" style="padding:2px 5px; font-size:10px; width:100%" onclick="game.research('${u}')">${T('upgrade')}</button></div>`;
                }
            }
            html += "</div>";

            // 2. Check Building Upgrade Status
            const queuedCount = v.queues.build.filter(q => q.building === bName).length;
            const virtualLvl = v.buildings[bName] + queuedCount;

            if (virtualLvl >= maxLvl) {
                html += `<hr><div style="text-align:center; padding:10px; color:#555; background:#f9f9f9; border:1px solid #eee; margin-top:5px;">
                <h4>${T_Name(bName)} (Lv ${virtualLvl})</h4>
                <div style="font-weight:bold; color:#888;">${T('max_level') || "Max Level Reached"}</div>
            </div>`;
                document.getElementById('b-modal-cost').innerHTML = html;
                document.getElementById('b-modal-btn').style.display = 'none';
            } else {
                // Not max level: Show upgrade cost
                const c = [
                    Math.floor(d.base[0] * Math.pow(d.factor, virtualLvl)),
                    Math.floor(d.base[1] * Math.pow(d.factor, virtualLvl)),
                    Math.floor(d.base[2] * Math.pow(d.factor, virtualLvl))
                ];

                // --- NEW: Calculate Pop for Smithy Upgrade ---
                const popNeeded = getPopNeeded(virtualLvl);

                const hqLvl = v.buildings["Headquarters"] || 1;
                const speedMod = Math.pow(0.95, hqLvl);
                const tSeconds = Math.floor(d.time * Math.pow(1.2, virtualLvl) * speedMod);

                let queueStatus = "";
                if (queuedCount > 0) {
                    queueStatus = `<div style="color:blue; font-size:11px; margin-bottom:5px;">${T('check_queue').replace('%s', queuedCount)}</div>`;
                }

                html += `<hr><h4>${T('upgrade')} ${T_Name(bName)} (Lv ${virtualLvl} ➔ ${virtualLvl + 1})</h4>`;
                html += `${queueStatus}`;

                const btnText = `${T('upgrade')} ${T_Name(bName)}`;

                html += `<div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px;">
                            🌲${c[0]} 🧱${c[1]} 🔩${c[2]} 👥${popNeeded}<br> 
                            ⏳ ${formatTime(tSeconds * 1000)}
                        </span>
                        <button id="smithy-upgrade-btn" class="btn">${btnText}</button>
                     </div>`;

                document.getElementById('b-modal-cost').innerHTML = html;
                document.getElementById('b-modal-btn').style.display = 'none';

                setTimeout(() => {
                    const btn = document.getElementById('smithy-upgrade-btn');
                    if (btn) {
                        btn.onclick = () => { game.build(bName); ui.openBuildingModal(bName); };

                        const isQueueFull = v.queues.build.length >= CONFIG.buildQueueLimit;
                        const canAfford = v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2];
                        const hasPop = popAvail >= popNeeded; // Smithy needs pop

                        if (isQueueFull) {
                            btn.innerText = T('queue_full');
                            btn.disabled = true;
                        } else if (!canAfford) {
                            btn.disabled = true;
                        } else if (!hasPop) {
                            btn.innerText = "No Pop";
                            btn.disabled = true;
                        }
                    }
                }, 0);
            }

            document.getElementById('building-modal').style.display = 'flex';
            return;
        }

        // --- STANDARD BUILDING HANDLING ---
        const queuedCount = v.queues.build.filter(q => q.building === bName).length;
        const virtualLvl = v.buildings[bName] + queuedCount;

        document.getElementById('b-modal-title').innerText = `${T_Name(bName)} (Lv ${virtualLvl})`;
        document.getElementById('b-modal-desc').innerText = d.desc;

        if (virtualLvl >= maxLvl) {
            let queueStatus = "";
            if (queuedCount > 0) {
                queueStatus = `<div style="color:blue; font-size:11px; margin-bottom:5px;">${T('check_queue').replace('%s', queuedCount)}</div>`;
            }

            document.getElementById('b-modal-cost').innerHTML = `
            ${queueStatus}
            <div style="text-align:center; padding:15px; font-weight:bold; color:#555; background:#f5f5f5; border:1px solid #eee;">
                ${T('max_level') || "Max Level Reached"}
            </div>
        `;
            document.getElementById('b-modal-btn').style.display = 'none';
        } else {
            // Upgrade UI
            const c = [
                Math.floor(d.base[0] * Math.pow(d.factor, virtualLvl)),
                Math.floor(d.base[1] * Math.pow(d.factor, virtualLvl)),
                Math.floor(d.base[2] * Math.pow(d.factor, virtualLvl))
            ];

            // --- NEW: Calculate Pop for Standard Upgrade ---
            const popNeeded = getPopNeeded(virtualLvl);

            const hqLvl = v.buildings["Headquarters"] || 1;
            const speedMod = Math.pow(0.95, hqLvl);
            const tSeconds = Math.floor(d.time * Math.pow(1.2, virtualLvl) * speedMod);

            let queueStatus = "";
            if (queuedCount > 0) {
                queueStatus = `<div style="color:blue; font-size:11px; margin-bottom:5px;">${T('check_queue').replace('%s', queuedCount)}</div>`;
            }

            // Added Pop Icon and Value to Display
            document.getElementById('b-modal-cost').innerHTML = `
            ${queueStatus}
            ${T('cost')}: 🌲${c[0]} 🧱${c[1]} 🔩${c[2]} 👥${popNeeded} | ⏳ ${formatTime(tSeconds * 1000)}
        `;

            const btn = document.getElementById('b-modal-btn');
            btn.innerText = `${T('upgrade')} ${T_Name(bName)}`;
            btn.style.display = 'inline-block';
            btn.onclick = () => { game.build(bName); ui.openBuildingModal(bName); };

            const isQueueFull = v.queues.build.length >= CONFIG.buildQueueLimit;
            const canAfford = v.res[0] >= c[0] && v.res[1] >= c[1] && v.res[2] >= c[2];

            // Farm and Warehouse bypass population checks
            const ignorePop = (bName === "Farm" || bName === "Warehouse");
            const hasPop = ignorePop || (popAvail >= popNeeded);

            // Combined logic for disabling button
            if (isQueueFull) {
                btn.innerText = T('queue_full');
                btn.disabled = true;
            } else if (!canAfford) {
                btn.disabled = true;
                // Optional: btn.innerText = "No Res";
            } else if (!hasPop) {
                btn.innerText = "No Pop"; // Distinct feedback
                btn.disabled = true;
            } else {
                btn.disabled = false;
            }
        }

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
                let t = state.villages.find(v => v.x === x && v.y === y);
                if (!t) t = state.mapData[`${x},${y}`];

                const d = document.createElement('div');
                d.className = "tile";

                if (t && t.type !== "empty") {
                    // 1. Get Owner & Profile
                    const ownerId = t.owner || (t.type === 'player' ? 'player' : 'barbarian');
                    const profile = engine.getPlayerProfile(ownerId);
                    const color = profile ? profile.color : '#bdbdbd';

                    // 2. APPLY BACKGROUND COLOR
                    d.style.background = color;
                    d.style.border = "1px solid rgba(0,0,0,0.2)";

                    // 3. Icon & Name
                    let icon = "🛖";
                    if (ownerId === 'player') icon = "🏰";
                    else if (ownerId.startsWith('ai_')) icon = "🏯";

                    let displayName = T_Name(t.name);
                    if (!STRINGS[LANG][t.name]) displayName = t.name;

                    const pts = t.points ? `\n<span style='font-size:9px; opacity:0.8'>${t.points}</span>` : "";

                    d.innerHTML = `
                    <div style="font-size:16px; margin-top:2px;">${icon}</div>
                    <div class="tile-name" style="color:white; text-shadow:1px 1px 0 #000; font-weight:bold;">
                        ${displayName}
                    </div>
                    ${pts}
                `;

                    // --- TOOLTIP EVENTS ADDED HERE ---
                    d.onmouseenter = () => ui.showMapTooltip(x, y);
                    d.onmousemove = (e) => ui.moveTooltip(e);
                    d.onmouseleave = () => ui.hideMapTooltip();
                    // ---------------------------------

                    d.onclick = (e) => {
                        e.stopPropagation();
                        // Check if it's a real village object with an ID, if so, check if it's yours
                        if (t.id && t.id === engine.getCurrentVillage().id) {
                            alert(T('managing_alert'));
                            return;
                        }
                        ui.openAttackModal(t);
                    };
                }

                if (x === cx && y === cy) {
                    d.style.border = "2px solid yellow";
                    d.style.boxShadow = "0 0 10px yellow";
                }

                grid.appendChild(d);
            }
        }
        ui.renderMinimap();
    },

    renderMinimap: function () {
        const cvs = document.getElementById('minimap');
        if (!cvs) return;

        const rect = cvs.getBoundingClientRect();

        // Only update if dimensions changed to avoid clearing context unnecessarily
        if (cvs.width !== rect.width || cvs.height !== rect.height) {
            cvs.width = rect.width;
            cvs.height = rect.height;
        }

        const ctx = cvs.getContext('2d');
        const w = cvs.width, h = cvs.height;

        // 1. Draw Background
        ctx.fillStyle = "#8d6e63";
        ctx.fillRect(0, 0, w, h);

        const scale = w / CONFIG.mapSize;

        // 2. Draw Villages with Dynamic Colors
        state.villages.forEach(v => {
            const mx = v.x * scale;
            const my = v.y * scale;

            // Fetch Profile Color
            const profile = engine.getPlayerProfile(v.owner);
            ctx.fillStyle = profile ? profile.color : '#888'; // Default grey if missing

            ctx.fillRect(mx, my, 3, 3);
        });

        // 3. Draw Viewport Rectangle
        const viewTiles = 15;
        const rectSize = viewTiles * scale;
        const vx = state.mapView.x * scale;
        const vy = state.mapView.y * scale;

        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.1;
        ctx.strokeRect(vx - (rectSize / 2) + 1, vy - (rectSize / 2) + 1, rectSize + 1, rectSize + 1);

        // 4. Click Navigation Logic
        cvs.onclick = (e) => {
            const rect = cvs.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            let newX = Math.floor(clickX / scale);
            let newY = Math.floor(clickY / scale);

            newX = Math.max(0, Math.min(CONFIG.mapSize, newX));
            newY = Math.max(0, Math.min(CONFIG.mapSize, newY));

            state.mapView.x = newX;
            state.mapView.y = newY;

            ui.renderMap();
            ui.renderMinimap();
        };
    },

    showMapTooltip: function (x, y) {
        let tt = document.getElementById('map-tooltip');
        if (!tt) {
            tt = document.createElement('div');
            tt.id = 'map-tooltip';
            document.body.appendChild(tt);
        }

        const v = state.villages.find(v => v.x === x && v.y === y);
        if (!v) return;

        const profile = engine.getPlayerProfile(v.owner);
        const ownerName = profile ? profile.name : "Unknown";
        const ownerColor = profile ? profile.color : "#fff";

        // 1. Calculate Distance
        const current = engine.getCurrentVillage();
        const dist = Math.sqrt(Math.pow(x - current.x, 2) + Math.pow(y - current.y, 2)).toFixed(1);

        // 2. Logic: Show Total Points only if NOT Barbarian
        let totalPointsHtml = "";

        if (v.owner !== 'barbarian') {
            const totalPoints = state.villages
                .filter(vil => vil.owner === v.owner)
                .reduce((sum, vil) => sum + (vil.points || 0), 0);

            totalPointsHtml = `
            <div class="tt-row">
                <span style="color:#aaa">Owner Total:</span>
                <span style="color:#f4e4bc">${totalPoints.toLocaleString()}</span>
            </div>`;
        }

        // 3. Render HTML
        tt.innerHTML = `
            <h4>${v.name} (${x}|${y})</h4>
            <div class="tt-row">
                <span style="color:#aaa">Owner:</span>
                <span style="font-weight:bold; color:${ownerColor}">${ownerName}</span>
            </div>
            <div class="tt-row">
                <span style="color:#aaa">Village Points:</span>
                <span>${v.points.toLocaleString()}</span>
            </div>
            ${totalPointsHtml}
            <div class="tt-row">
                <span style="color:#aaa">Distance:</span>
                <span>${dist} fields</span>
            </div>
        `;
        tt.style.display = 'block';
    },

    // Move the tooltip with the mouse
    moveTooltip: function (e) {
        const tt = document.getElementById('map-tooltip');
        // Offset by 15px so it doesn't cover the cursor
        const x = e.clientX + 15;
        const y = e.clientY + 15;

        // Prevent going off-screen (Right/Bottom edges)
        // (Simple check, can be expanded)
        tt.style.left = x + 'px';
        tt.style.top = y + 'px';
    },

    // Hide it
    hideMapTooltip: function () {
        const tt = document.getElementById('map-tooltip');
        if (tt) tt.style.display = 'none';
    },

    updateMissions: function () {
        const el = document.getElementById('active-missions');
        if (!el) return;

        const v = engine.getCurrentVillage();
        if (!v) return;

        // 1. FILTER: Only show missions involving THIS village (as Origin or Target)
        const relevantMissions = state.missions.filter(m =>
            m.originId === v.id || m.targetId === v.id
        );

        // 2. SORT: By arrival time
        const sortedMissions = relevantMissions.sort((a, b) => a.arrival - b.arrival);

        el.innerHTML = sortedMissions.map(m => {
            const ms = Math.max(0, m.arrival - Date.now());
            const timeStr = formatTime(ms);

            // Helpers to resolve names
            const getV = (id) => state.villages.find(vil => vil.id === id);
            const originV = getV(m.originId);
            const targetV = getV(m.targetId);

            const originName = originV ? `${originV.name} (${originV.x}|${originV.y})` : "Unknown";
            const targetName = targetV ? `${targetV.name} (${targetV.x}|${targetV.y})` : "Unknown";

            // Directions
            const isIncoming = m.targetId === v.id; // It is coming TO us
            const isReturn = m.type === 'return';

            let text = "", colorClass = "", icon = "";

            // --- DISPLAY LOGIC ---

            if (m.type === 'attack') {
                if (isIncoming) {
                    // DANGER: We are being attacked!
                    text = `<b>${T('incoming')}</b> ${T('from')} <br>⚔️ ${originName}`;
                    colorClass = "mission-incoming";
                    icon = "🚨";
                } else {
                    // OUTGOING: We are attacking someone
                    text = `${T('attack')} ➔ ${targetName}`;
                    colorClass = "mission-attack";
                    icon = "⚔️";
                }
            }
            else if (m.type === 'support') {
                if (isIncoming) {
                    if (isReturn) {
                        // Logic catch: Returns are usually type='return', but just in case
                        text = `${T('return')} ${T('from')} ${originName}`;
                        colorClass = "mission-return";
                        icon = "🔙";
                    } else {
                        text = `${T('support')} ${T('from')} <br>🛡️ ${originName}`;
                        colorClass = "mission-support";
                        icon = "🛡️";
                    }
                } else {
                    text = `${T('support')} ➔ ${targetName}`;
                    colorClass = "mission-support";
                    icon = "🛡️";
                }
            }
            else if (m.type === 'transport') {
                if (isIncoming) {
                    text = `${T('transport')} ${T('from')} <br>💰 ${originName}`;
                    colorClass = "mission-transport";
                    icon = "📦";
                } else {
                    text = `${T('transport')} ➔ ${targetName}`;
                    colorClass = "mission-transport";
                    icon = "💰";
                }
            }
            else if (m.type === 'return') {
                // Returns always come home (Incoming)
                text = `${T('return')} ${T('from')} <br>${originName}`; // Or "Return from Target" depending on how you stored logic
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

        if (sortedMissions.length === 0) {
            el.innerHTML = `<div style="padding:10px; color:#999; text-align:center; font-size:11px;">${T('no_missions') || "No active movements"}</div>`;
        }
    },

    // Add to your ui object
    renderRankingTab: function () {
        const container = document.getElementById('ranking-list');
        if (!container) return;

        // 1. Calculate Scores
        const scores = [];
        const profiles = state.playerProfiles || {};

        // Initialize scores for all known profiles (except Barbarians usually)
        for (let id in profiles) {
            if (id === 'barbarian') continue; // Skip barbs in ranking
            scores.push({
                id: id,
                name: profiles[id].name,
                color: profiles[id].color,
                alive: profiles[id].alive,
                points: 0,
                villages: 0
            });
        }

        // Sum up points from the map
        state.villages.forEach(v => {
            const owner = v.owner || 'barbarian';
            const entry = scores.find(s => s.id === owner);
            if (entry) {
                entry.points += (v.points || 0);
                entry.villages++;
            }
        });

        scores.forEach(s => {
            if (s.id !== 'player' && s.alive && s.villages === 0) {
                s.alive = false;
                if (state.playerProfiles[s.id]) state.playerProfiles[s.id].alive = false; // Update state too
            }
        });

        // 2. Sort: Active Players > Points > Villages
        scores.sort((a, b) => {
            if (a.alive !== b.alive) return b.alive ? 1 : -1; // Dead players at bottom
            return b.points - a.points; // High score top
        });

        // 3. Build HTML Table
        let html = `
    <div style="padding:10px; font-weight:bold; font-size:14px; border-bottom:1px solid #ccc;">
        🏆 World Leaderboard
    </div>
    <table class="rank-table">
        <thead>
            <tr>
                <th style="width:10%">#</th>
                <th style="width:40%">Name</th>
                <th style="width:15%">Vil</th>
                <th style="width:35%">Points</th>
            </tr>
        </thead>
        <tbody>
    `;

        scores.forEach((s, index) => {
            const isMe = s.id === 'player';
            let rowClass = "rank-row-clickable "; // Add clickable class
            if (isMe) rowClass += "rank-row-player";
            else if (!s.alive) rowClass += "rank-row-dead";

            const dot = `<span class="rank-dot" style="background:${s.color}"></span>`;
            const nameDisplay = isMe ? `${dot} ${s.name} (You)` : `${dot} ${s.name}`;

            // ADD ONCLICK HERE:
            html += `
        <tr class="${rowClass}" onclick="ui.showPlayerVillages('${s.id}')">
            <td>${index + 1}</td>
            <td>${nameDisplay}</td>
            <td>${s.villages}</td>
            <td>${s.points.toLocaleString()}</td>
        </tr>`;
        });

        if (scores.length === 0) {
            html += `<tr><td colspan="4" style="text-align:center; padding:20px;">No players found.</td></tr>`;
        }

        html += `</tbody></table>`;
        container.innerHTML = html;
    },

    renderReports: function () { document.getElementById('report-list').innerHTML = state.reports.map((r, i) => `<div class="report-item report-${r.type}" onclick="ui.openReport(${i})"><span>${r.title}</span><span>${r.time}</span></div>`).join(''); },
    openReport: function (i) { document.getElementById('r-modal-content').innerHTML = state.reports[i].content; document.getElementById('report-modal').style.display = 'flex'; },
    closeBuildingModal: () => document.getElementById('building-modal').style.display = 'none',
    closeAttackModal: () => document.getElementById('attack-modal').style.display = 'none',
    closeReportModal: () => document.getElementById('report-modal').style.display = 'none',

    openMarketModal: function (targetId) {
        const v = engine.getCurrentVillage();
        const tId = Number(targetId);
        const targetV = state.villages.find(vil => vil.id === tId);

        // Safety debug: If this logs "Target not found", you know the ID is still wrong
        if (!targetV) {
            console.error("Market Target not found:", targetId);
            return;
        }
        const marketLvl = v.buildings["Market"] || 0;
        const maxCap = marketLvl * CONFIG.marketCapacityPerLevel;
        if (!targetV) return;

        let html = `
            <div style="padding:10px;">
                <div style="margin-bottom:10px; background:#e0f7fa; padding:5px; border:1px solid #00acc1;">
                    <b>${T('target')}:</b> ${targetV.name} (${targetV.x}|${targetV.y})<br>
                    <b>${T('capacity')}:</b> ${maxCap}
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
                <button class="btn btn-blue" style="width:100%; margin-top:15px;" onclick="game.sendResources()">${T('confirm_transport')}</button>
            </div>
        `;

        document.getElementById('b-modal-title').innerText = `${T_Name('Market')} (Lv ${marketLvl})`;
        document.getElementById('b-modal-desc').innerText = T('transport');
        document.getElementById('b-modal-cost').innerHTML = html;
        document.getElementById('b-modal-btn').style.display = 'none';
        document.getElementById('building-modal').style.display = 'flex';
    },

    setMaxMarket: function (type) {
        const v = engine.getCurrentVillage();
        const marketLvl = v.buildings["Market"] || 0;
        const maxCap = marketLvl * CONFIG.marketCapacityPerLevel;
        const wVal = parseInt(document.getElementById('market-wood').value) || 0;
        const cVal = parseInt(document.getElementById('market-clay').value) || 0;
        const iVal = parseInt(document.getElementById('market-iron').value) || 0;
        let usedByOthers = 0;
        if (type === 'wood') usedByOthers = cVal + iVal;
        else if (type === 'clay') usedByOthers = wVal + iVal;
        else if (type === 'iron') usedByOthers = wVal + cVal;
        const remainingCap = Math.max(0, maxCap - usedByOthers);
        let stock = 0;
        if (type === 'wood') stock = Math.floor(v.res[0]);
        else if (type === 'clay') stock = Math.floor(v.res[1]);
        else if (type === 'iron') stock = Math.floor(v.res[2]);
        document.getElementById('market-' + type).value = Math.min(stock, remainingCap);
    },
    showPlayerVillages: function (playerId) {
        const container = document.getElementById('ranking-list');

        // 1. Get Player Data
        const profile = engine.getPlayerProfile(playerId);
        const villages = state.villages.filter(v => v.owner === playerId);

        // Sort villages by points (highest first)
        villages.sort((a, b) => b.points - a.points);

        // 2. Build Header (Name & Back Button)
        let html = `
        <div style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #ccc; background:#f9f9f9;">
            <button class="btn-mini" onclick="ui.renderRankingTab()" style="margin-right:10px;">⬅️ Back</button>
            <div>
                <div style="font-weight:bold; color:${profile.color}; font-size:14px;">${profile.name}</div>
                <div style="font-size:11px; color:#666;">
                    Total Villages: ${villages.length} | Status: ${profile.alive ? 'Alive' : 'Defeated'}
                </div>
            </div>
        </div>
        <div style="height:400px; overflow-y:auto;">
            <table class="rank-table">
                <thead>
                    <tr>
                        <th>Village Name</th>
                        <th>Coords</th>
                        <th>Points</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
    `;

        // 3. List Villages
        if (villages.length === 0) {
            html += `<tr><td colspan="4" style="text-align:center; padding:20px;">This player has no villages left.</td></tr>`;
        } else {
            villages.forEach(v => {
                html += `
            <tr>
                <td>${v.name}</td>
                <td>(${v.x}|${v.y})</td>
                <td>${v.points.toLocaleString()}</td>
                <td style="text-align:center;">
                    <button class="btn-mini btn-blue" onclick="ui.jumpToVillage(${v.x}, ${v.y})">👀 View</button>
                </td>
            </tr>`;
            });
        }

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    },

    jumpToVillage: function (x, y) {
        // 1. Update Map View Coordinates
        state.mapView = { x: x, y: y };

        // 2. Switch to Map Tab using your existing system
        // We pass the button element as null since we are doing it programmatically
        ui.showTab('map', document.querySelector('button[onclick*="map"]'));

        // 3. Highlight the specific tile (Optional UX touch)
        // We can rely on the renderMap center highlight, 
        // or add a temporary flash effect if you like.
        console.log(`Jumping to ${x},${y}`);
    },

    renderOverview: function () {
        const container = document.getElementById('overview-list');
        if (!container) return;

        const myVillages = state.villages.filter(v => v.owner === 'player');

        // 1. Build Header
        let html = `
        <table class="rank-table" style="width:100%; min-width:1000px;">
            <thead>
                <tr>
                    <th style="width:20%">Village</th>
                    <th style="width:15%">Resources</th>
                    <th style="width:8%">Pop</th>
                    <th style="width:22%">Buildings</th>
                    <th style="width:35%">Troops</th>
                </tr>
            </thead>
            <tbody>
        `;

        // 2. Build Rows
        myVillages.forEach(v => {
            const isSelected = v.id === state.selectedVillageId;
            const bg = isSelected ? "background:#e3f2fd;" : "";
            const border = isSelected ? "border-left: 4px solid #2196F3;" : "";

            // --- Resources ---
            const storage = engine.getStorage(v);
            const resHtml = [0, 1, 2].map(i => {
                const val = Math.floor(v.res[i]);
                const isFull = val >= storage;
                const color = isFull ? "#d32f2f" : "#333";
                const icon = ["🌲", "🧱", "🔩"][i];
                return `<span style="color:${color}; margin-right:5px;">${icon} ${val.toLocaleString()}</span>`;
            }).join("");

            // --- Population ---
            const popUsed = engine.getPopUsed(v);
            const popMax = engine.getPopLimit(v);
            const popPerc = Math.round((popUsed / popMax) * 100);
            const popColor = popPerc > 90 ? "#d32f2f" : "#333";

            // --- Buildings ---
            const b = v.buildings;
            const mkB = (icon, name) => {
                const lvl = b[name] || 0;
                if (lvl === 0 && name !== 'Headquarters') return `<span style="opacity:0.2; margin-right:4px;">${icon}0</span>`;
                return `<span title="${name}" style="margin-right:4px; cursor:help;">${icon}${lvl}</span>`;
            };

            const bldgs = `
                ${mkB('🏛️', 'Headquarters')}
                ${mkB('⚔️', 'Barracks')}
                ${mkB('🐴', 'Stable')}
                ${mkB('🔧', 'Workshop')}
                ${mkB('⚒️', 'Smithy')}
                ${mkB('⚖️', 'Market')}
                ${mkB('🌾', 'Farm')}
                ${mkB('📦', 'Warehouse')}
                ${mkB('🧱', 'Wall')}
            `;

            // --- Troops (Exact Unit Counts) ---
            // Define icons for mapping (fallback to first letter if missing)
            const unitIcons = {
                "Spear": "🔱", "Sword": "🗡️", "Axe": "🪓", "Archer": "🏹",
                "Scout": "♘", "Light Cav": "🐴", "Heavy Cav": "♞",
                "Ram": "🐏", "Catapult": "☄️", "Noble": "👑", "Paladin": "⚜️"
            };

let troopHtml = `<div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">`;
            let hasTroops = false;

            for (let u in DB.units) {
                const count = v.units[u] || 0;
                if (count > 0) {
                    hasTroops = true;
                    const icon = unitIcons[u] || u.substring(0, 2);
                    
                    // Display: Icon + Number inline
                    troopHtml += `
                        <span style="font-size:11px; white-space:nowrap; cursor:help;" title="${u}">
                            ${icon} ${count.toLocaleString()}
                        </span>
                    `;
                }
            }
            troopHtml += `</div>`;

            if (!hasTroops) troopHtml = "<span style='color:#ccc; font-size:10px;'>- Empty -</span>";

            // Queue Indicator
            const busy = v.queues.build.length > 0 ? "🔨" : "";

            html += `
            <tr style="${bg} ${border} cursor:pointer; transition:0.2s; border-bottom:1px solid #eee;" 
                onclick="ui.switchVillage('${v.id}')"
                onmouseenter="this.style.backgroundColor='#f0f0f0'"
                onmouseleave="this.style.backgroundColor='${isSelected ? '#e3f2fd' : 'transparent'}'">
                
                <td style="vertical-align:top; padding:8px;">
                    <span style="font-weight:bold;">${v.name} ${busy}</span>
                    <span style="font-size:10px; color:#666;">(${v.x}|${v.y}) • ${v.points} pts</span>
                </td>
                <td style="vertical-align:top; font-size:11px; padding:8px;">${resHtml}</td>
                <td style="vertical-align:top; font-size:11px; color:${popColor}; padding:8px;">${popUsed}/${popMax}</td>
                <td style="vertical-align:top; font-size:11px; padding:8px;">${bldgs}</td>
                <td style="vertical-align:top; padding:6px;">${troopHtml}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    },
};