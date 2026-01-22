const DB = {
    buildings: {
        "Headquarters": {
            base: [90, 80, 70],
            factor: 1.26,
            basePop: 5,   // Renamed from 'pop' to 'basePop' for engine compatibility
            time: 90,
            points: 10,
            maxLevel: 30,
            desc: "减少建筑时间"
        },
        "Timber Camp": {
            base: [50, 60, 40],
            factor: 1.25,
            basePop: 5,   // Increased slightly (Standard: 5)
            time: 60,
            points: 6,
            maxLevel: 30,
            desc: "生产木材"
        },
        "Clay Pit": {
            base: [65, 50, 40],
            factor: 1.25,
            basePop: 5,   // Increased slightly
            time: 60,
            points: 6,
            maxLevel: 30,
            desc: "生产粘土"
        },
        "Iron Mine": {
            base: [75, 65, 70],
            factor: 1.25,
            basePop: 5,   // Increased slightly
            time: 60,
            points: 6,
            maxLevel: 30,
            desc: "生产铁矿"
        },
        "Farm": {
            base: [45, 40, 30],
            factor: 1.30,
            basePop: 0,   // Must be 0 (It gives pop, doesn't use it)
            time: 120,
            points: 5,
            maxLevel: 30,
            desc: "增加人口上限"
        },
        "Warehouse": {
            base: [60, 50, 40],
            factor: 1.27,
            basePop: 0,   // Must be 0
            time: 100,
            points: 6,
            maxLevel: 30,
            desc: "增加资源存储上限"
        },
        "Barracks": {
            base: [200, 170, 90],
            factor: 1.26,
            basePop: 7,
            time: 300,
            points: 16,
            maxLevel: 25,
            desc: "训练步兵"
        },
        "Stable": {
            base: [270, 240, 260],
            factor: 1.26,
            basePop: 8,
            time: 600,
            points: 20,
            maxLevel: 20,
            desc: "训练骑兵"
        },
        "Workshop": {
            base: [300, 240, 260],
            factor: 1.26,
            basePop: 8,
            time: 600,
            points: 24,
            maxLevel: 15,
            desc: "训练攻城器械"
        },
        "Smithy": {
            base: [220, 180, 240],
            factor: 1.26,
            basePop: 20,
            time: 400,
            points: 19,
            maxLevel: 10,
            desc: "研究单位科技"
        },
        "Academy": {
            base: [15000, 25000, 10000],
            factor: 2.0,
            basePop: 80,
            time: 3600,
            points: 512,
            maxLevel: 3,
            desc: "培养贵族"
        },
        "Wall": {
            base: [50, 100, 20],
            factor: 1.28,
            basePop: 5,
            time: 180,
            points: 8,
            maxLevel: 20,
            desc: "提升村庄防御"
        },
        "Market": {
            base: [100, 100, 100],
            factor: 1.2,
            basePop: 20,
            time: 60,
            points: 10,
            maxLevel: 25,
            desc: "运输资源"
        },
    },
units: {
        "Spear": { 
            type: "inf", 
            cost: [50, 30, 10], 
            pop: 1, 
            att: 10, 
            def: 15,       // General Defense (vs Infantry)
            defCav: 45,    // Cavalry Defense (vs Horses) - Spears are strong vs Cav
            spd: 18,     // Renamed 'spd' to 'spd' for code consistency
            carry: 25, 
            time: 20, 
            maxLevel: 3, 
            building: "Barracks" 
        },
        "Sword": { 
            type: "inf", 
            cost: [30, 30, 70], 
            pop: 1, 
            att: 25, 
            def: 50,       // Strong vs Infantry
            defCav: 15,    // Weak vs Cavalry
            spd: 22, 
            carry: 15, 
            time: 25, 
            maxLevel: 3, 
            building: "Barracks" 
        },
        "Axe": { 
            type: "inf", 
            cost: [60, 30, 40], 
            pop: 1, 
            att: 40, 
            def: 10, 
            defCav: 5, 
            spd: 18, 
            carry: 10, 
            time: 22, 
            maxLevel: 3, 
            building: "Barracks" 
        },
        "Scout": { 
            type: "cav", 
            cost: [50, 50, 20], 
            pop: 2, 
            att: 0, 
            def: 2, 
            defCav: 1, 
            spd: 9, 
            carry: 0, 
            time: 30, 
            maxLevel: 3, 
            building: "Stable" 
        },
        "Light Cav": { 
            type: "cav", 
            cost: [125, 100, 250], 
            pop: 4, 
            att: 130, 
            def: 30, 
            defCav: 40, 
            spd: 10, 
            carry: 80, 
            time: 40, 
            maxLevel: 3, 
            building: "Stable" 
        },
        "Heavy Cav": { 
            type: "cav", 
            cost: [200, 150, 600], 
            pop: 6, 
            att: 150, 
            def: 200, 
            defCav: 80,    // Good hybrid defense
            spd: 11, 
            carry: 50, 
            time: 60, 
            maxLevel: 3, 
            building: "Stable" 
        },
        "Ram": { 
            type: "inf", 
            cost: [300, 200, 200], 
            pop: 5, 
            att: 2, 
            def: 20, 
            defCav: 50, 
            spd: 30, 
            carry: 0, 
            time: 90, 
            maxLevel: 3, 
            building: "Workshop" 
        },
        "Catapult": { 
            type: "inf", 
            cost: [320, 400, 100], 
            pop: 8, 
            att: 100, 
            def: 100, 
            defCav: 50, 
            spd: 30, 
            carry: 0, 
            time: 120, 
            maxLevel: 3, 
            building: "Workshop" 
        },
        "Noble": { 
            type: "inf", 
            cost: [40000, 50000, 50000], 
            pop: 100, 
            att: 30, 
            def: 100, 
            defCav: 50, 
            spd: 35, 
            carry: 0, 
            time: 3600, 
            maxLevel: 1, 
            building: "Academy" 
        }
    },
    positions: {
        "Headquarters": { top: 40, left: 45, width: 12, height: 12, color: "#5d4037", zIndex: 10 },
        "Timber Camp": { top: 10, left: 10, width: 8, height: 8, color: "#3e2723", shape: "50%", zIndex: 10 },
        "Clay Pit": { top: 25, left: 10, width: 8, height: 8, color: "#d84315", shape: "50%", zIndex: 10 },
        "Iron Mine": { top: 40, left: 10, width: 8, height: 8, color: "#546e7a", shape: "50%", zIndex: 10 },
        "Farm": { top: 15, left: 80, width: 10, height: 10, color: "#a1887f", zIndex: 10 },
        "Warehouse": { top: 30, left: 80, width: 10, height: 10, color: "#795548", zIndex: 10 },
        "Barracks": { top: 60, left: 60, width: 10, height: 8, color: "#4e342e", zIndex: 10 },
        "Stable": { top: 60, left: 75, width: 10, height: 8, color: "#4e342e", zIndex: 10 },
        "Workshop": { top: 75, left: 70, width: 10, height: 8, color: "#4e342e", zIndex: 10 },
        "Smithy": { top: 45, left: 70, width: 12, height: 10, color: "#3e2723", border: "2px solid #aaa", zIndex: 10 },
        "Academy": { top: 20, left: 45, width: 10, height: 10, color: "#aaa", border: "2px solid gold", zIndex: 10 },
        "Market": { top: 60, left: 20, width: 10, height: 10, color: '#fdd835', shape: '50%' }, // Yellow circle
        "Wall": { top: 6, left: 5, width: 88, height: 84, border: "15px solid #5d4037", backgroundColor: "transparent", zIndex: 1 }
    }
};