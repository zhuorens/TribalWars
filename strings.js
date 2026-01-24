// --- INTERNATIONALIZATION (i18n) ---

let LANG = 'zh'; // Default Language

const STRINGS = {
    'en': {
        // --- TABS & HEADERS ---
        'tab_hq': '🏰 Village',
        'tab_recruit': '⚔️ Recruit',
        'tab_map': '🗺️ Map',
        'tab_reports': '📜 Reports',
        'tab_settings': '⚙️ Settings',
        'tab_rankings': '🏆 Rankings',
        'tab_overview': '📊 Overview',
        'header_lang': 'Language',
        'header_debug': 'Debug Tools',
        'header_cheat': 'Building Cheat',
        'header_save': 'Save Data',

        // --- BUTTONS ---
        'btn_return': '⌂ Return to Current Village',
        'btn_clear': 'Clear History',
        'btn_download': '💾 Download',
        'btn_wipe': '⚠️ Wipe',
        'btn_close': 'Close',
        'btn_cancel': 'Cancel',
        'btn_upgrade': 'Upgrade',

        // --- GAME TERMS ---
        'wood': 'Wood', 'clay': 'Clay', 'iron': 'Iron',
        'pop': 'Pop', 'storage': 'Storage', 'points': 'Points',
        'village': 'Village',
        'upgrade': 'Upgrade', 'cost': 'Cost', 'recruit': 'Recruit', 'max': 'Max',
        'troops': 'Troops', 'noTroops': 'No troops available',
        
        // --- COMBAT & REPORTS ---
        'attack': 'Attack', 'support': 'Support', 'transport': 'Transport', 'return': 'Return',
        'victory': 'Victory', 'defeat': 'Defeat', 'report': 'Report',
        'targetVanished': 'Target Vanished',
        'att': 'Attacker', 'def': 'Defender',
        'loot': 'Loot', 'resources': 'Resources',
        'conquered': 'Conquered', 'loyalty': 'Loyalty',
        'wall_damaged': "Wall Damaged",
        'troops_returned': "Troops have returned home.",
        'troops_arrived': "Stationed troops arrived.",
        'recent_reports': "Recent Reports",

        // --- ERRORS & LIMITS ---
        'resLimit': 'Not enough resources!',
        'popLimit': 'Not enough population space!',
        'maxLevel': 'Building is at max level!',
        'queue_full': 'Queue Full',
        'max_level': "Max Level",

        // --- UI LABELS ---
        'production': 'Production',
        'incoming_attack': 'INCOMING ATTACK!',
        'next_in': 'Next in',
        'view_map': 'View Map',
        'manage_troops': 'Manage Stationed Troops',
        'stationed_here': 'Stationed Here',
        'my_troops_elsewhere': 'My Troops Elsewhere',
        'send_back': 'Send Back', 'withdraw': 'Withdraw',
        'none': 'None',
        'from': 'From', 'to': "To", 'at': 'At',
        'incoming': 'INCOMING',
        'requires': 'Requires',
        'check_queue': 'Check: %s upgrades in queue.', 
        'target': 'Target',
        'capacity': 'Capacity',
        'confirm_transport': 'Confirm Transport',
        'managing_alert': 'You are currently managing this village.',
        'rename': 'Name:',
        'received': 'Received',
        'delivered': 'Delivered',
        'duration': 'Duration',
        'no_missions': 'No active movements',
        
        // --- NAMES ---
        'Spear': 'Spearman', 'Sword': 'Swordsman', 'Axe': 'Axeman', 'Archer': 'Archer', 'Scout': 'Scout', 'Light Cav': 'Light Cavalry', 'Heavy Cav': 'Heavy Cavalry', 'Ram': 'Ram', 'Catapult': 'Catapult', 'Noble': 'Nobleman',
        'Headquarters': 'Headquarters', 'Barracks': 'Barracks', 'Stable': 'Stable', 'Workshop': 'Workshop', 'Academy': 'Academy', 'Smithy': 'Smithy', 'Rally Point': 'Rally Point', 'Market': 'Market', 'Timber Camp': 'Timber Camp', 'Clay Pit': 'Clay Pit', 'Iron Mine': 'Iron Mine', 'Farm': 'Farm', 'Warehouse': 'Warehouse', 'Wall': 'Wall', 'Hiding Place': 'Hiding Place'
    },
    'zh': {
        // --- TABS & HEADERS ---
        'tab_hq': '🏰 村庄', 'tab_recruit': '⚔️ 招募', 'tab_map': '🗺️ 地图', 'tab_reports': '📜 战报', 'tab_settings': '⚙️ 设置', 'tab_rankings': '🏆 排名', 'tab_overview': '📊 总览',
        'header_lang': '语言', 'header_debug': '调试工具', 'header_cheat': '建筑作弊', 'header_save': '存档管理',

        // --- BUTTONS ---
        'btn_return': '⌂ 返回当前村庄', 'btn_clear': '清除记录', 'btn_download': '💾 下载存档', 'btn_wipe': '⚠️ 清空存档', 
        'btn_close': '关闭', 'btn_cancel': '取消', 'btn_upgrade': '升级',

        // --- GAME TERMS ---
        'wood': '木材', 'clay': '粘土', 'iron': '铁矿',
        'pop': '人口', 'storage': '仓库', 'points': '分数', 'village': '村庄',
        'upgrade': '升级', 'cost': '成本', 'recruit': '招募', 'max': '最大',
        'troops': '军队', 'noTroops': '无可用部队',

        // --- COMBAT & REPORTS ---
        'attack': '攻击', 'support': '支援', 'transport': '运输', 'return': '返回',
        'victory': '胜利', 'defeat': '失败', 'report': '战报',
        'targetVanished': '目标消失',
        'att': '进攻方', 'def': '防守方',
        'loot': '掠夺', 'resources': '资源',
        'conquered': '占领', 'loyalty': '忠诚度',
        'wall_damaged': "城墙受损",
        'troops_returned': "部队已返回大本营。",
        'troops_arrived': "增援部队已抵达。",
        'recent_reports': "近期战报",

        // --- ERRORS & LIMITS ---
        'resLimit': '资源不足！', 
        'popLimit': '人口空间不足！', 
        'maxLevel': '建筑已达最高级！',
        'queue_full': '队列已满',
        'max_level': "满级",

        // --- UI LABELS ---
        'production': '产量',
        'incoming_attack': '敌军来袭！',
        'next_in': '抵达倒计时',
        'view_map': '查看地图',
        'manage_troops': '管理驻军',
        'stationed_here': '驻扎于此',
        'my_troops_elsewhere': '我方外派军队',
        'send_back': '遣返', 'withdraw': '召回',
        'none': '无',
        'from': '来自', 'to': "前往", 'at': '位于',
        'incoming': '来袭',
        'requires': '需要',
        'check_queue': '提示: 队列中已有 %s 个升级任务。',
        'target': '目标',
        'capacity': '运载量',
        'confirm_transport': '确认运输',
        'managing_alert': '你正在管理该村庄。',
        'rename': '名称:',
        'received': '收到',
        'delivered': '送达',
        'duration': '时长',
        'no_missions': '无部队移动',

        // --- NAMES ---
        'Spear': '长矛兵', 'Sword': '剑士', 'Axe': '斧头兵', 'Archer': '弓箭手', 'Scout': '侦察兵', 'Light Cav': '轻骑兵', 'Heavy Cav': '重骑兵', 'Ram': '冲车', 'Catapult': '投石车', 'Noble': '贵族',
        'Headquarters': '大本营', 'Barracks': '兵营', 'Stable': '马厩', 'Workshop': '车间', 'Academy': '学院', 'Smithy': '铁匠铺', 'Rally Point': '集结点', 'Market': '市场', 'Timber Camp': '伐木场', 'Clay Pit': '粘土坑', 'Iron Mine': '铁矿', 'Farm': '农场', 'Warehouse': '仓库', 'Wall': '城墙', 'Hiding Place': '隐蔽处'
    }
};

// Helper Functions
function T(key) { if (!STRINGS[LANG]) return key; return STRINGS[LANG][key] || key; }
function T_Name(dbKey) { return T(dbKey); }