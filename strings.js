// --- INTERNATIONALIZATION (i18n) ---

let LANG = 'zh'; // Default Language

const STRINGS = {
    'en': {
        // TABS
        'tab_hq': '🏰 Village',
        'tab_recruit': '⚔️ Recruit',
        'tab_map': '🗺️ Map',
        'tab_reports': '📜 Reports',
        'tab_settings': '⚙️ Settings',

        // HEADERS & LABELS
        'header_lang': 'Language',
        'header_debug': 'Debug Tools',
        'header_cheat': 'Building Cheat',
        'header_save': 'Save Data',
        'btn_return': '⌂ Return to Current Village',
        'btn_clear': 'Clear History',
        'btn_download': '💾 Download',
        'btn_wipe': '⚠️ Wipe',
        'btn_close': 'Close',
        'btn_cancel': 'Cancel',
        'btn_upgrade': 'Upgrade',

        // GAME TERMS
        'wood': 'Wood',
        'clay': 'Clay',
        'iron': 'Iron',
        'pop': 'Pop',
        'storage': 'Storage',
        'points': 'Points',
        'village': 'Village',
        
        // DYNAMIC MESSAGES (Used in Logic)
        'upgrade': 'Upgrade',
        'cost': 'Cost',
        'recruit': 'Recruit',
        'max': 'Max',
        'troops': 'Troops',
        'noTroops': 'No troops available',
        'attack': 'Attack',
        'support': 'Support',
        'victory': 'Victory',
        'defeat': 'Defeat',
        'report': 'Report',
        'targetVanished': 'Target Vanished',
        'att': 'Attacker',
        'def': 'Defender',
        'loot': 'Loot',
        'resources': 'Resources',
        'conquered': 'Conquered',
        'loyalty': 'Loyalty',
        'resLimit': 'Not enough resources!',
        'popLimit': 'Not enough population space!',
        'maxLevel': 'Building is at max level!',
        
        // UNIT NAMES
        'Spear': 'Spearman',
        'Sword': 'Swordsman',
        'Axe': 'Axeman',
        'Archer': 'Archer',
        'Scout': 'Scout',
        'Light Cav': 'Light Cavalry',
        'Heavy Cav': 'Heavy Cavalry',
        'Ram': 'Ram',
        'Catapult': 'Catapult',
        'Noble': 'Nobleman',
        
        // BUILDING NAMES
        'Headquarters': 'Headquarters',
        'Barracks': 'Barracks',
        'Stable': 'Stable',
        'Workshop': 'Workshop',
        'Academy': 'Academy',
        'Smithy': 'Smithy',
        'Rally Point': 'Rally Point',
        'Market': 'Market',
        'Timber Camp': 'Timber Camp',
        'Clay Pit': 'Clay Pit',
        'Iron Mine': 'Iron Mine',
        'Farm': 'Farm',
        'Warehouse': 'Warehouse',
        'Wall': 'Wall',
        'Hiding Place': 'Hiding Place'
    },
    'zh': {
        'tab_hq': '🏰 村庄',
        'tab_recruit': '⚔️ 招募',
        'tab_map': '🗺️ 地图',
        'tab_reports': '📜 战报',
        'tab_settings': '⚙️ 设置',

        'header_lang': '语言',
        'header_debug': '调试工具',
        'header_cheat': '建筑作弊',
        'header_save': '存档管理',
        'btn_return': '⌂ 返回当前村庄',
        'btn_clear': '清除记录',
        'btn_download': '💾 下载存档',
        'btn_wipe': '⚠️ 清空存档',
        'btn_close': '关闭',
        'btn_cancel': '取消',
        'btn_upgrade': '升级',

        'wood': '木材',
        'clay': '粘土',
        'iron': '铁矿',
        'pop': '人口',
        'storage': '仓库',
        'points': '分数',
        'village': '村庄',

        'upgrade': '升级',
        'cost': '成本',
        'recruit': '招募',
        'max': '最大',
        'troops': '军队',
        'noTroops': '无可用部队',
        'attack': '攻击',
        'support': '支援',
        'victory': '胜利',
        'defeat': '失败',
        'report': '战报',
        'targetVanished': '目标消失',
        'att': '进攻方',
        'def': '防守方',
        'loot': '掠夺',
        'resources': '资源',
        'conquered': '占领',
        'loyalty': '忠诚度',
        'resLimit': '资源不足！',
        'popLimit': '人口空间不足！',
        'maxLevel': '建筑已达最高级！',

        'Spear': '长矛兵',
        'Sword': '剑士',
        'Axe': '斧头兵',
        'Archer': '弓箭手',
        'Scout': '侦察兵',
        'Light Cav': '轻骑兵',
        'Heavy Cav': '重骑兵',
        'Ram': '冲车',
        'Catapult': '投石车',
        'Noble': '贵族',

        'Headquarters': '大本营',
        'Barracks': '兵营',
        'Stable': '马厩',
        'Workshop': '车间',
        'Academy': '学院',
        'Smithy': '铁匠铺',
        'Rally Point': '集结点',
        'Market': '市场',
        'Timber Camp': '伐木场',
        'Clay Pit': '粘土坑',
        'Iron Mine': '铁矿',
        'Farm': '农场',
        'Warehouse': '仓库',
        'Wall': '城墙',
        'Hiding Place': '隐蔽处'
    }
};

// --- GLOBAL HELPER FUNCTIONS ---

// Translate a key
function T(key) {
    if (!STRINGS[LANG]) return key; // Fallback if lang missing
    return STRINGS[LANG][key] || key; // Return translation or key if missing
}

// Translate a Database Name (Unit/Building)
// Handles cases where the DB key might have spaces or specific casing
function T_Name(dbKey) {
    return T(dbKey);
}