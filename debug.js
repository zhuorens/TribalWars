const debug = {
    addRes: () => { const v = engine.getCurrentVillage(); v.res = [v.res[0] + 10000, v.res[1] + 10000, v.res[2] + 10000]; ui.refresh(); },
    instantBuild: () => {
        const v = engine.getCurrentVillage();
        ['build', 'research', 'barracks', 'stable', 'workshop', 'academy'].forEach(k => {
            const q = v.queues[k];
            q.forEach(i => i.finish = Date.now());
        });
        ui.refresh();
    },
    maxSelectedBuilding: () => { const v = engine.getCurrentVillage(); const bName = document.getElementById('cheat-building').value; if (v.buildings[bName] !== undefined) { v.buildings[bName] = DB.buildings[bName].maxLevel || 30; ui.refresh(); } },
    spawnEnemy: () => { state.villages.push(engine.createVillage(state.mapView.x + 1, state.mapView.y, "Cheat Enemy", "enemy")); ui.renderMap(); },
    toggleFastTravel: (el) => state.debugFastTravel = el.checked
};