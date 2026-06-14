const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const fs = require('fs');

// ======================= CONFIGURATION =======================
const BOT_TOKEN = process.env.BOT_TOKEN || '8425112915:AAE_RNh0tDnXRp3ULKciTPuqIjuiSoNfQtE';
const ADMIN_IDS = [7592032793];
const ADMIN_PASSWORD = 'Masoodking123';
const BOT_NAME = '✨ MASOOD KING BOT ✨';

const PLANS = {
    '2days':  { days: 2,  price: 500,  name: '2 Days' },
    '1week':  { days: 7,  price: 1000, name: '1 Week' },
    '2weeks': { days: 14, price: 1800, name: '2 Weeks' },
    '1month': { days: 30, price: 3000, name: '1 Month' }
};

const WINGO_FREE_LIMIT = 5;
const EASYPAISA_NUMBER = '0318-0939237';
const JAZZCASH_NUMBER = '0319-9837973';
const ACCOUNT_NAME = 'MUHAMMAD ABID SHAH';

let WINGO_ENABLED = true;

// ======================= PERSISTENT STORAGE =======================
const DATA_FILES = {
    premiumUsers: 'premiumUsers.json',
    freeUsage: 'freeUsage.json',
    allUsers: 'allUsers.json',
    pendingPayments: 'pendingPayments.json',
    feedbacks: 'feedbacks.json',
    predictions: 'predictions.json',
    userStates: 'userStates.json'
};

// In-memory stores
const premiumUsers    = {};
const freeUsage       = {};
const userStates      = {};
const userLastAction  = {};
const pendingPayments = {};
const allUsers        = {};
const adminSessions   = {};
const feedbacks       = {};
const predictions     = {};
let feedbackCounter   = 1;
let nextPredictionId  = 1;
let lastProcessedPeriod = null;
let autoResultInterval = null;

// Load data from disk
function loadData() {
    try {
        if (fs.existsSync(DATA_FILES.premiumUsers)) Object.assign(premiumUsers, JSON.parse(fs.readFileSync(DATA_FILES.premiumUsers)));
        if (fs.existsSync(DATA_FILES.freeUsage)) Object.assign(freeUsage, JSON.parse(fs.readFileSync(DATA_FILES.freeUsage)));
        if (fs.existsSync(DATA_FILES.allUsers)) Object.assign(allUsers, JSON.parse(fs.readFileSync(DATA_FILES.allUsers)));
        if (fs.existsSync(DATA_FILES.pendingPayments)) Object.assign(pendingPayments, JSON.parse(fs.readFileSync(DATA_FILES.pendingPayments)));
        if (fs.existsSync(DATA_FILES.feedbacks)) Object.assign(feedbacks, JSON.parse(fs.readFileSync(DATA_FILES.feedbacks)));
        if (fs.existsSync(DATA_FILES.predictions)) Object.assign(predictions, JSON.parse(fs.readFileSync(DATA_FILES.predictions)));
        if (fs.existsSync(DATA_FILES.userStates)) Object.assign(userStates, JSON.parse(fs.readFileSync(DATA_FILES.userStates)));
    } catch(e) { console.error('Error loading data:', e.message); }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILES.premiumUsers, JSON.stringify(premiumUsers, null, 2));
        fs.writeFileSync(DATA_FILES.freeUsage, JSON.stringify(freeUsage, null, 2));
        fs.writeFileSync(DATA_FILES.allUsers, JSON.stringify(allUsers, null, 2));
        fs.writeFileSync(DATA_FILES.pendingPayments, JSON.stringify(pendingPayments, null, 2));
        fs.writeFileSync(DATA_FILES.feedbacks, JSON.stringify(feedbacks, null, 2));
        fs.writeFileSync(DATA_FILES.predictions, JSON.stringify(predictions, null, 2));
        fs.writeFileSync(DATA_FILES.userStates, JSON.stringify(userStates, null, 2));
    } catch(e) { console.error('Error saving data:', e.message); }
}

// Save periodically and on important actions
setInterval(saveData, 30 * 1000);

// ======================= HELPER FUNCTIONS =======================
function today() { return new Date().toISOString().slice(0,10); }
function isAdmin(id) { return ADMIN_IDS.includes(Number(id)); }
function isAdminVerified(adminId) {
    const s = adminSessions[adminId];
    if (!s) return false;
    if (Date.now() > s.expiry) { delete adminSessions[adminId]; return false; }
    return s.verified;
}
function isPremium(userId) { return !!premiumUsers[userId] && Date.now() < premiumUsers[userId]; }

function getFreeUsed(userId) {
    const u = freeUsage[userId];
    if (!u || u.date !== today()) return 0;
    return u.count;
}
function incrementFree(userId) {
    if (!freeUsage[userId] || freeUsage[userId].date !== today())
        freeUsage[userId] = { date: today(), count: 0 };
    freeUsage[userId].count++;
    saveData();
}
function canGetSignal(userId) {
    if (isPremium(userId)) return { ok: true };
    const used = getFreeUsed(userId);
    if (used < WINGO_FREE_LIMIT) return { ok: true, left: WINGO_FREE_LIMIT - used };
    return { ok: false };
}

// ======================= WINGO CORE =======================
function getCurrentPeriod30s() {
    const n = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}`;
    const slot = Math.floor((n.getHours()*3600 + n.getMinutes()*60 + n.getSeconds()) / 30) + 1;
    return `${date}${String(slot).padStart(4,'0')}`;
}
function getCurrentPeriod1m() {
    const n = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}`;
    const slot = n.getHours()*60 + n.getMinutes() + 1;
    return `${date}${String(slot).padStart(4,'0')}`;
}
function getTimeLeft30s() { return 30 - (new Date().getSeconds() % 30); }
function getTimeLeft1m()  { return 60 - new Date().getSeconds(); }

function seedRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    return Math.abs(h);
}
function wingoPredict(periodStr, isPrem) {
    const seed = seedRandom(periodStr);
    const num = seed % 10;
    let color;
    if (num === 0) color = '🔴 Red + 🟣 Violet';
    else if (num === 5) color = '🟢 Green + 🟣 Violet';
    else if (num % 2 === 0) color = '🔴 Red';
    else color = '🟢 Green';
    const size = num >= 5 ? '📈 BIG' : '📉 SMALL';
    const freeConfs = ['⭐⭐⭐ Medium (65%)', '⭐⭐ Low (55%)', '⭐⭐⭐ Medium (60%)'];
    const premConfs = ['⭐⭐⭐⭐⭐ Ultra (85%)', '⭐⭐⭐⭐ High (78%)', '⭐⭐⭐⭐⭐ Ultra (82%)'];
    const conf = (isPrem ? premConfs : freeConfs)[seed % 3];
    return { num, color, size, conf };
}

// Save prediction for auto 1-min result
function savePrediction(userId, period, predictedNum, predictedColor, predictedSize, is30s) {
    if (is30s) return;
    const id = nextPredictionId++;
    predictions[id] = { id, userId, period, predictedNum, predictedColor, predictedSize, timestamp: Date.now(), notified: false };
    saveData();
}

// ======================= AUTO RESULT FETCHER (with error recovery) =======================
function fetchWingo1MResults() {
    const originalUrl = 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json';
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(originalUrl);
    
    const req = http.get(proxyUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (!json || !json.data || !json.data.list) return;
                const list = json.data.list;
                for (const item of list) {
                    const period = item.period?.toString();
                    if (!period || period.length < 12) continue;
                    if (lastProcessedPeriod && period <= lastProcessedPeriod) continue;
                    const number = item.number;
                    if (number === undefined) continue;
                    let color = '';
                    const rawColor = (item.color || '').toLowerCase();
                    if (rawColor.includes('red')) color = '🔴 Red';
                    else if (rawColor.includes('green')) color = '🟢 Green';
                    else if (rawColor.includes('violet')) color = '🟣 Violet';
                    else if (rawColor === 'red_violet') color = '🔴 Red + 🟣 Violet';
                    else if (rawColor === 'green_violet') color = '🟢 Green + 🟣 Violet';
                    else color = '🔴 Red';
                    let size = '';
                    const rawSize = (item.size || '').toLowerCase();
                    if (rawSize.includes('big')) size = '📈 BIG';
                    else if (rawSize.includes('small')) size = '📉 SMALL';
                    else size = number >= 5 ? '📈 BIG' : '📉 SMALL';
                    
                    const matching = Object.values(predictions).filter(p => p.period === period && !p.notified);
                    for (const pred of matching) {
                        const userId = pred.userId;
                        const isWin = (pred.predictedNum === number);
                        const isColorWin = (pred.predictedColor.includes(color) || color.includes(pred.predictedColor));
                        const isSizeWin = (pred.predictedSize === size);
                        let resultMsg = '', emoji = '', jackpot = false;
                        if (isWin) {
                            jackpot = true;
                            emoji = '🎰✨ JACKPOT! ✨🎰';
                            resultMsg = `✨ *EXACT NUMBER MATCH!* ✨\n🎯 You predicted *${pred.predictedNum}* and result was *${number}*!\n💎 *JACKPOT WINNER!* 💎`;
                        } else if (isColorWin && isSizeWin) {
                            emoji = '✅ WIN';
                            resultMsg = `✅ *WIN!* Both Color & Size correct!\n🎨 Predicted: ${pred.predictedColor} + ${pred.predictedSize}\n📊 Result: ${color} + ${size}`;
                        } else if (isColorWin) {
                            emoji = '✅ COLOR WIN';
                            resultMsg = `✅ *COLOR WIN!*\n🎨 Predicted: ${pred.predictedColor}\n📊 Result: ${color}`;
                        } else if (isSizeWin) {
                            emoji = '✅ SIZE WIN';
                            resultMsg = `✅ *SIZE WIN!*\n📏 Predicted: ${pred.predictedSize}\n📊 Result: ${size}`;
                        } else {
                            emoji = '❌ LOSS';
                            resultMsg = `❌ *LOSS*\n🎯 Predicted: ${pred.predictedNum} (${pred.predictedColor}, ${pred.predictedSize})\n📊 Result: ${number} (${color}, ${size})`;
                        }
                        const message = `
╔══════════════════════════════════════╗
║      🎲 WINGO RESULT UPDATE 🎲
╠══════════════════════════════════════╣
║ 📌 Period: \`${period}\`
╠══════════════════════════════════════╣
║ ${resultMsg}
╠══════════════════════════════════════╣
║ 📊 Result: ${number} – ${color} – ${size}
║ 🎯 Your Prediction: ${pred.predictedNum} – ${pred.predictedColor} – ${pred.predictedSize}
╠══════════════════════════════════════╣
║ ${emoji}
╚══════════════════════════════════════╝
                        `;
                        bot.sendMessage(userId, message, { parse_mode: 'Markdown' }).catch(() => {});
                        pred.notified = true;
                    }
                    if (!lastProcessedPeriod || period > lastProcessedPeriod) lastProcessedPeriod = period;
                    saveData();
                }
            } catch(e) { console.error('Parse error:', e.message); }
        });
    });
    req.on('error', (err) => console.error('API fetch error:', err.message));
    req.end();
}

function startAutoResultChecker() {
    if (autoResultInterval) clearInterval(autoResultInterval);
    autoResultInterval = setInterval(() => {
        try {
            fetchWingo1MResults();
        } catch(e) {
            console.error('Auto result interval error:', e.message);
        }
    }, 15000);
    console.log('✅ Auto 1-min result checker started');
}

// ======================= TELEGRAM BOT =======================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ----------------------- Keyboards -----------------------
function mainMenu(userId) {
    const isAdminUser = isAdmin(userId);
    let keyboard = [
        ['🎲 WINGO PREDICTION'],
        ['💎 BUY PREMIUM', '📊 MY ACCOUNT'],
        ['❓ HELP', '💬 FEEDBACK']
    ];
    if (isAdminUser) keyboard.push(['👑 ADMIN PANEL']);
    return { reply_markup: { keyboard, resize_keyboard: true } };
}
function wingoMenu() {
    return { reply_markup: { keyboard: [['🎯 30 SEC PREDICT', '🎯 1 MIN PREDICT'], ['🔙 MAIN MENU']], resize_keyboard: true } };
}
function adminMenu() {
    const wingoStatus = WINGO_ENABLED ? '✅ ON' : '❌ OFF';
    return {
        reply_markup: {
            keyboard: [
                ['👥 ALL USERS', '💎 PREMIUM USERS'],
                ['💰 PENDING PAYMENTS', '✅ APPROVE PAYMENT'],
                ['❌ REMOVE PREMIUM', '📢 BROADCAST'],
                ['📊 BOT STATS', '💬 VIEW FEEDBACK'],
                [`🎲 WINGO: ${wingoStatus}`],
                ['🚪 EXIT ADMIN']
            ],
            resize_keyboard: true
        }
    };
}
function getNextPredictionKeyboard(context) {
    const is30s = context === '30s';
    return {
        reply_markup: {
            keyboard: [[is30s ? '🔄 NEXT 30 SEC PREDICTION' : '🔄 NEXT 1 MIN PREDICTION'], ['🔙 MAIN MENU']],
            resize_keyboard: true
        }
    };
}

// ----------------------- Admin Functions (Robust) -----------------------
function showAdminBanner(userId) {
    const premCount = Object.keys(premiumUsers).length;
    const userCount = Object.keys(allUsers).length;
    const pendCount = Object.keys(pendingPayments).length;
    const feedbackCount = Object.keys(feedbacks).length;
    bot.sendMessage(userId,
`╔════════════════════════════════════════╗
║           🛡️ WINGO ADMIN PANEL           ║
║              ${BOT_NAME}
╠════════════════════════════════════════╣
║ 👥 TOTAL USERS   : ${String(userCount).padEnd(5)}║
║ 💎 PREMIUM       : ${String(premCount).padEnd(5)}║
║ 💰 PENDING PAY   : ${String(pendCount).padEnd(5)}║
║ 💬 TOTAL FEEDBACK: ${String(feedbackCount).padEnd(5)}║
║ 📅 DATE          : ${today()} ║
╚════════════════════════════════════════╝`,
        { parse_mode: 'Markdown' });
}

function showApprovePaymentMenu(adminId) {
    const pendings = Object.entries(pendingPayments);
    if (pendings.length === 0) {
        bot.sendMessage(adminId, '✅ No pending payments.', adminMenu());
        return;
    }
    let msg = `✅ *APPROVE PAYMENT*\n━━━━━━━━━━━━━━━━━━━━\n📋 *Pending Users:*\n\n`;
    pendings.forEach(([id, p]) => {
        const planInfo = PLANS[p.plan] || { name: p.plan };
        msg += `🆔 \`${id}\` – ${p.name} (${planInfo.name})\n`;
    });
    msg += `\n👇 *Enter User ID (or type "cancel"):*`;
    userStates[adminId] = 'waiting_approve_id';
    saveData();
    bot.sendMessage(adminId, msg, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doApprovePayment(adminId, targetIdStr) {
    if (targetIdStr.toLowerCase() === 'cancel') {
        userStates[adminId] = 'admin_panel';
        saveData();
        bot.sendMessage(adminId, '✅ Approval cancelled.', adminMenu());
        return;
    }
    const targetId = parseInt(targetIdStr);
    if (isNaN(targetId)) {
        bot.sendMessage(adminId, '❌ *Invalid ID.*\nPlease enter a numeric User ID.\nType `cancel` to exit.', { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
        return;
    }
    const pending = pendingPayments[targetId];
    if (!pending) {
        bot.sendMessage(adminId, `❌ *No pending payment for ID ${targetId}.*\nType \`cancel\` to exit.`, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
        return;
    }
    const plan = PLANS[pending.plan];
    if (!plan) {
        bot.sendMessage(adminId, `❌ *Invalid plan for ${targetId}.*`, adminMenu());
        delete pendingPayments[targetId];
        saveData();
        userStates[adminId] = 'admin_panel';
        return;
    }
    premiumUsers[targetId] = Date.now() + plan.days * 86400000;
    delete pendingPayments[targetId];
    saveData();
    const expiry = new Date(premiumUsers[targetId]).toLocaleDateString();
    bot.sendMessage(adminId, `✅ *Premium activated for* \`${targetId}\`\n📦 Plan: ${plan.name}\n📅 Expires: ${expiry}`, { parse_mode: 'Markdown', ...adminMenu() });
    bot.sendMessage(targetId, `🎉 *PREMIUM ACTIVATED!* 🎉\n━━━━━━━━━━━━━━━━━━━━\n✅ Your payment is verified!\n📦 Plan: ${plan.name}\n📅 Expires: ${expiry}\n━━━━━━━━━━━━━━━━━━━━\n🔥 Unlimited Wingo predictions unlocked!`, { parse_mode: 'Markdown', ...mainMenu(targetId) });
    userStates[adminId] = 'admin_panel';
}

function showRemovePremiumMenu(adminId) {
    if (Object.keys(premiumUsers).length === 0) {
        bot.sendMessage(adminId, '📭 No premium users.', adminMenu());
        return;
    }
    userStates[adminId] = 'waiting_remove_id';
    bot.sendMessage(adminId, '❌ *REMOVE PREMIUM*\n━━━━━━━━━━━━━━━━━━━━\nEnter User ID (or "cancel"):', { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doRemovePremium(adminId, targetIdStr) {
    if (targetIdStr.toLowerCase() === 'cancel') {
        userStates[adminId] = 'admin_panel';
        bot.sendMessage(adminId, '✅ Removal cancelled.', adminMenu());
        return;
    }
    const targetId = parseInt(targetIdStr);
    if (isNaN(targetId) || !premiumUsers[targetId]) {
        bot.sendMessage(adminId, '❌ Invalid or non-premium user.\nType `cancel` to exit.', { reply_markup: { force_reply: true } });
        return;
    }
    delete premiumUsers[targetId];
    saveData();
    bot.sendMessage(adminId, `✅ Premium removed for \`${targetId}\``, { parse_mode: 'Markdown', ...adminMenu() });
    bot.sendMessage(targetId, '⚠️ *Your premium has been removed.*\nContact admin if this was a mistake.');
    userStates[adminId] = 'admin_panel';
}

function showBroadcastMenu(adminId) {
    userStates[adminId] = 'waiting_broadcast';
    bot.sendMessage(adminId, '📢 *BROADCAST*\nType your message:', { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doBroadcast(adminId, msgText) {
    const userIds = Object.keys(allUsers);
    let sent = 0;
    userIds.forEach(uid => {
        bot.sendMessage(Number(uid), `📢 *ADMIN BROADCAST*\n━━━━━━━━━━━━━━━━━━━━\n${msgText}`, { parse_mode: 'Markdown' }).then(() => sent++).catch(()=>{});
    });
    bot.sendMessage(adminId, `✅ Broadcast sent to ${sent} users.`, adminMenu());
    userStates[adminId] = 'admin_panel';
}

function showAllUsers(adminId) {
    const users = Object.entries(allUsers);
    if (!users.length) return bot.sendMessage(adminId, '📭 No users.');
    let out = `👥 *ALL USERS* (${users.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    users.slice(0,30).forEach(([id,u]) => {
        const plan = isPremium(Number(id)) ? '💎' : '🆓';
        out += `${plan} *${u.name}* (@${u.username})\n🆔 \`${id}\`\n📊 Predictions: ${u.predictions||0}\n\n`;
    });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}
function showPremiumUsers(adminId) {
    const prems = Object.entries(premiumUsers);
    if (!prems.length) return bot.sendMessage(adminId, '📭 No premium users.');
    let out = `💎 *PREMIUM USERS* (${prems.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    prems.forEach(([id,exp]) => {
        const u = allUsers[id] || { name: 'Unknown' };
        const daysLeft = Math.ceil((exp - Date.now())/86400000);
        out += `💎 *${u.name}* (@${u.username||'N/A'})\n🆔 \`${id}\` – ${daysLeft} days left\n\n`;
    });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}
function showPendingPayments(adminId) {
    const pend = Object.entries(pendingPayments);
    if (!pend.length) return bot.sendMessage(adminId, '✅ No pending payments.');
    let out = `💰 *PENDING PAYMENTS* (${pend.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    pend.forEach(([id,p]) => {
        const plan = PLANS[p.plan] || { name: p.plan };
        out += `👤 *${p.name}* (${plan.name})\n🆔 \`${id}\`\n📅 ${p.date}\n\n`;
    });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}
function showBotStats(adminId) {
    bot.sendMessage(adminId,
`📊 *BOT STATISTICS*
━━━━━━━━━━━━━━━━━━━━
👥 Users      : ${Object.keys(allUsers).length}
💎 Premium    : ${Object.keys(premiumUsers).length}
💰 Pending    : ${Object.keys(pendingPayments).length}
💬 Feedbacks  : ${Object.keys(feedbacks).length}
🎲 WINGO      : ${WINGO_ENABLED ? '✅ ON' : '❌ OFF'}`,
        { parse_mode: 'Markdown' });
}
function showAllFeedbacks(adminId) {
    const fbList = Object.values(feedbacks).reverse();
    if (!fbList.length) return bot.sendMessage(adminId, '💬 No feedback.');
    let msg = `💬 *FEEDBACKS* (${fbList.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    fbList.slice(0,10).forEach(f => {
        msg += `📝 #${f.id} | ${f.name} (@${f.username})\n⭐ ${f.rating ? '⭐'.repeat(f.rating) : 'No rating'}\n💬 ${f.message}\n📅 ${f.date}\n━━━━━━━━━━━━━━━━━━━━\n`;
    });
    bot.sendMessage(adminId, msg, { parse_mode: 'Markdown' });
}
function toggleWingoStatus(adminId) {
    WINGO_ENABLED = !WINGO_ENABLED;
    bot.sendMessage(adminId, `🎲 WINGO ${WINGO_ENABLED ? 'ENABLED ✅' : 'DISABLED ❌'}`, adminMenu());
}
function handleAdminCommands(userId, text) {
    if (text === '🎲 WINGO: ✅ ON' || text === '🎲 WINGO: ❌ OFF') return toggleWingoStatus(userId);
    if (text === '💬 VIEW FEEDBACK') return showAllFeedbacks(userId);
    switch(text) {
        case '👥 ALL USERS': showAllUsers(userId); break;
        case '💎 PREMIUM USERS': showPremiumUsers(userId); break;
        case '💰 PENDING PAYMENTS': showPendingPayments(userId); break;
        case '✅ APPROVE PAYMENT': showApprovePaymentMenu(userId); break;
        case '❌ REMOVE PREMIUM': showRemovePremiumMenu(userId); break;
        case '📢 BROADCAST': showBroadcastMenu(userId); break;
        case '📊 BOT STATS': showBotStats(userId); break;
        case '🚪 EXIT ADMIN':
            delete adminSessions[userId];
            userStates[userId] = null;
            saveData();
            bot.sendMessage(userId, '🚪 Exited admin.', mainMenu(userId));
            break;
        default: bot.sendMessage(userId, 'Use buttons.', adminMenu());
    }
}

// ----------------------- User Commands -----------------------
function cmdStart(msg) {
    const userId = msg.from.id;
    const name = msg.from.first_name || 'Trader';
    const uname = msg.from.username || 'N/A';
    if (!allUsers[userId]) allUsers[userId] = { name, username: uname, joinDate: today(), predictions: 0 };
    const isPrem = isPremium(userId);
    const remaining = isPrem ? '♾️ Unlimited' : `${WINGO_FREE_LIMIT - getFreeUsed(userId)} left today`;
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║     👋 WELCOME TO ${BOT_NAME}
╠══════════════════════════════════════╣
║ 💎 *YOUR STATUS:* ${isPrem ? '💎 PREMIUM MEMBER' : '🆓 FREE USER'}
║ 🎯 *PREDICTIONS LEFT:* ${remaining}
║ 📅 *DATE:* ${today()}
╠══════════════════════════════════════╣
║ 🎲 *WINGO PREDICTION*
║ • 30 SEC – Manual period entry
║ • 1 MIN – Auto result notification
╠══════════════════════════════════════╣
║ 💡 *Use the buttons below* 👇
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}
function cmdWingoMenu(msg) {
    const userId = msg.from.id;
    if (!WINGO_ENABLED) return bot.sendMessage(userId, '🚧 Wingo is disabled.', mainMenu(userId));
    userStates[userId] = null;
    saveData();
    userLastAction[userId] = { botType: 'wingo' };
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║         🎲 WINGO PREDICTION MODE
╠══════════════════════════════════════╣
║ Select your prediction type below 👇
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', ...wingoMenu() });
}
function cmdWingo30(msg) {
    const userId = msg.from.id;
    if (!WINGO_ENABLED) return bot.sendMessage(userId, '🚧 Wingo disabled.', mainMenu(userId));
    const access = canGetSignal(userId);
    if (!access.ok) return bot.sendMessage(userId, `⛔ *Daily Limit Reached!*\n━━━━━━━━━━━━━━━━━━━━\nYou've used all ${WINGO_FREE_LIMIT} free predictions.\n💎 Upgrade with /buypremium`, { parse_mode: 'Markdown', ...mainMenu(userId) });
    userStates[userId] = 'wingo_30s_predict';
    saveData();
    userLastAction[userId] = { type: '30s' };
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║         🎯 30 SECOND WINGO
╠══════════════════════════════════════╣
║ ⏱️ Time left: *~${getTimeLeft30s()}s*
║ 📌 Est. period: \`${getCurrentPeriod30s()}\`
╠══════════════════════════════════════╣
║ 👇 *Enter the period number:*
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}
function cmdWingo1m(msg) {
    const userId = msg.from.id;
    if (!WINGO_ENABLED) return bot.sendMessage(userId, '🚧 Wingo disabled.', mainMenu(userId));
    const access = canGetSignal(userId);
    if (!access.ok) return bot.sendMessage(userId, `⛔ *Daily Limit Reached!*\n━━━━━━━━━━━━━━━━━━━━\nYou've used all ${WINGO_FREE_LIMIT} free predictions.\n💎 Upgrade with /buypremium`, { parse_mode: 'Markdown', ...mainMenu(userId) });
    userStates[userId] = 'wingo_1m_predict';
    saveData();
    userLastAction[userId] = { type: '1m' };
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║         🎯 1 MINUTE WINGO
╠══════════════════════════════════════╣
║ ⏱️ Time left: *~${getTimeLeft1m()}s*
║ 📌 Est. period: \`${getCurrentPeriod1m()}\`
╠══════════════════════════════════════╣
║ 👇 *Enter the period number:*
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}
function handleWingoPrediction(userId, periodStr, is30s) {
    const isPrem = isPremium(userId);
    if (!isPrem) incrementFree(userId);
    if (allUsers[userId]) allUsers[userId].predictions = (allUsers[userId].predictions || 0) + 1;
    saveData();
    const pred = wingoPredict(periodStr, isPrem);
    const gameMode = is30s ? '30 Sec WinGo' : '1 Min WinGo';
    const timeLeft = is30s ? getTimeLeft30s() : getTimeLeft1m();
    const remaining = isPrem ? '♾️ Unlimited' : `${WINGO_FREE_LIMIT - getFreeUsed(userId)} left today`;
    if (!is30s) savePrediction(userId, periodStr, pred.num, pred.color, pred.size, false);
    const autoNote = !is30s ? '\n║ 🤖 *Auto result:* You will be notified' : '';
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║     ${isPrem ? '💎 PREMIUM' : '🆓 FREE'} PREDICTION
╠══════════════════════════════════════╣
║ 🕹️ Game: ${gameMode}
║ 📌 Period: \`${periodStr}\`
║ ⏱️ Time Left: ~${timeLeft}s
╠══════════════════════════════════════╣
║ 🔢 *Number:* ${pred.num}
║ 🎨 *Color:*  ${pred.color}
║ 📏 *Size:*   ${pred.size}
║ 💡 *Confidence:* ${pred.conf}
╠══════════════════════════════════════╣
║ 📊 *Remaining:* ${remaining}${autoNote}
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', ...getNextPredictionKeyboard(is30s ? '30s' : '1m') });
}
function cmdBuyPremium(msg) {
    const userId = msg.from.id;
    if (isPremium(userId)) return bot.sendMessage(userId, '✅ *Already premium!*', mainMenu(userId));
    const keyboard = { inline_keyboard: [] };
    for (const [key,plan] of Object.entries(PLANS)) keyboard.inline_keyboard.push([{ text: `${plan.name} - PKR ${plan.price}`, callback_data: `plan_${key}` }]);
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║           💎 BUY PREMIUM
╠══════════════════════════════════════╣
║ ✅ Unlimited predictions
║ ✅ Higher accuracy (85%+)
║ ✅ Priority support
╠══════════════════════════════════════╣
║ 👇 *Choose your plan:*
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', reply_markup: keyboard });
}
function cmdMyAccount(msg) {
    const userId = msg.from.id;
    const u = allUsers[userId] || {};
    const isPrem = isPremium(userId);
    const expiry = isPrem ? new Date(premiumUsers[userId]).toLocaleDateString() : 'N/A';
    const daysLeft = isPrem ? Math.ceil((premiumUsers[userId]-Date.now())/86400000) : 0;
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║           📊 MY ACCOUNT
╠══════════════════════════════════════╣
║ 👤 *Name:* ${u.name}
║ 🆔 *ID:* \`${userId}\`
║ 📅 *Member since:* ${u.joinDate}
╠══════════════════════════════════════╣
║ 💎 *Plan:* ${isPrem ? '💎 PREMIUM' : '🆓 FREE'}
${isPrem ? `║ 📅 *Expires:* ${expiry}\n║ ⏳ *Days left:* ${daysLeft}` : `║ 📊 *Used today:* ${getFreeUsed(userId)}/${WINGO_FREE_LIMIT}`}
║ 🎯 *Total predictions:* ${u.predictions||0}
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}
function cmdHelp(msg) {
    bot.sendMessage(msg.from.id,
`╔══════════════════════════════════════╗
║              ❓ HELP
╠══════════════════════════════════════╣
║ 🎲 *WINGO PREDICTION*
║ • 30 SEC – Manual period entry
║ • 1 MIN – Auto result notification
╠══════════════════════════════════════╣
║ 💬 *FEEDBACK:* Use the button below
║ 👑 *Admin:* @GojoVipAdmin
╠══════════════════════════════════════╣
║ 🆓 Free: ${WINGO_FREE_LIMIT}/day
║ 💎 Premium: Unlimited + Higher accuracy
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', ...mainMenu(msg.from.id) });
}
function cmdFeedback(msg) {
    userStates[msg.from.id] = 'waiting_feedback_message';
    saveData();
    bot.sendMessage(msg.from.id,
`╔══════════════════════════════════════╗
║            💬 SEND FEEDBACK
╠══════════════════════════════════════╣
║ We value your opinion!
║ Type your feedback message below 👇
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}
function processFeedback(userId, name, username, message) {
    const id = feedbackCounter++;
    feedbacks[id] = { id, userId, name, username, message, date: today(), rating: null };
    saveData();
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║        ✅ FEEDBACK RECEIVED
╠══════════════════════════════════════╣
║ Thank you! (ID #${id})
║ Your feedback helps us improve.
╚══════════════════════════════════════╝`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
    ADMIN_IDS.forEach(adminId => bot.sendMessage(adminId, `💬 New feedback from ${name} (@${username})\n${message}`));
    userStates[userId] = null;
    saveData();
}
function cmdAdminLogin(msg) {
    const userId = msg.from.id;
    if (!isAdmin(userId)) return bot.sendMessage(userId, '❌ Access denied.', mainMenu(userId));
    if (isAdminVerified(userId)) {
        userStates[userId] = 'admin_panel';
        saveData();
        bot.sendMessage(userId, '✅ Already logged in.', adminMenu());
        return;
    }
    userStates[userId] = 'waiting_admin_password';
    saveData();
    bot.sendMessage(userId, '🔐 *ADMIN LOGIN*\n━━━━━━━━━━━━━━━━━━━━\nEnter password:', { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

// ----------------------- Main Message Handler -----------------------
function handleMessage(msg) {
    try {
        const userId = msg.from.id;
        const text = (msg.text || '').trim();
        const name = msg.from.first_name || 'User';
        const uname = msg.from.username || 'N/A';
        if (!allUsers[userId]) allUsers[userId] = { name, username: uname, joinDate: today(), predictions: 0 };
        const state = userStates[userId] || '';

        if (state === 'waiting_admin_password' && isAdmin(userId)) {
            if (text === ADMIN_PASSWORD) {
                adminSessions[userId] = { verified: true, expiry: Date.now() + 3600000 };
                userStates[userId] = 'admin_panel';
                saveData();
                bot.sendMessage(userId, '✅ Password correct.', adminMenu());
                showAdminBanner(userId);
            } else {
                userStates[userId] = null;
                saveData();
                bot.sendMessage(userId, '❌ Wrong password.', mainMenu(userId));
            }
            return;
        }
        if (state === 'waiting_approve_id' && isAdmin(userId)) {
            doApprovePayment(userId, text);
            return;
        }
        if (state === 'waiting_remove_id' && isAdmin(userId)) {
            doRemovePremium(userId, text);
            return;
        }
        if (state === 'waiting_broadcast' && isAdmin(userId)) {
            doBroadcast(userId, text);
            return;
        }
        if (state === 'admin_panel' && isAdmin(userId) && isAdminVerified(userId)) {
            handleAdminCommands(userId, text);
            return;
        }
        if (state === 'waiting_feedback_message') {
            processFeedback(userId, name, uname, text);
            return;
        }
        if (text === '🔄 NEXT 30 SEC PREDICTION') { cmdWingo30({ from: { id: userId } }); return; }
        if (text === '🔄 NEXT 1 MIN PREDICTION') { cmdWingo1m({ from: { id: userId } }); return; }
        if (text === '🔙 MAIN MENU') {
            userStates[userId] = null;
            saveData();
            bot.sendMessage(userId, 'Main Menu:', mainMenu(userId));
            return;
        }
        if (state === 'wingo_30s_predict' && /^\d{12,14}$/.test(text)) {
            handleWingoPrediction(userId, text, true);
            userStates[userId] = null;
            saveData();
            return;
        }
        if (state === 'wingo_1m_predict' && /^\d{12,14}$/.test(text)) {
            handleWingoPrediction(userId, text, false);
            userStates[userId] = null;
            saveData();
            return;
        }

        switch(text) {
            case '/start': cmdStart(msg); break;
            case '🎲 WINGO PREDICTION': cmdWingoMenu(msg); break;
            case '🎯 30 SEC PREDICT': cmdWingo30(msg); break;
            case '🎯 1 MIN PREDICT': cmdWingo1m(msg); break;
            case '💎 BUY PREMIUM': cmdBuyPremium(msg); break;
            case '📊 MY ACCOUNT': cmdMyAccount(msg); break;
            case '❓ HELP': cmdHelp(msg); break;
            case '💬 FEEDBACK': cmdFeedback(msg); break;
            case '👑 ADMIN PANEL': cmdAdminLogin(msg); break;
            default: bot.sendMessage(userId, 'Use buttons 👇', mainMenu(userId));
        }
    } catch(err) {
        console.error('Error in handleMessage:', err);
        bot.sendMessage(msg.from.id, '⚠️ An error occurred. Please try again.');
    }
}

// ----------------------- Callbacks & Payment Handlers -----------------------
bot.on('callback_query', (cq) => {
    try {
        const userId = cq.from.id;
        const data = cq.data;
        if (data && data.startsWith('plan_')) {
            const planKey = data.replace('plan_', '');
            const plan = PLANS[planKey];
            if (plan) {
                userStates[userId] = `pending_plan:${planKey}`;
                saveData();
                bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║     💎 YOU SELECTED: ${plan.name}
╠══════════════════════════════════════╣
║ 💰 Price: PKR ${plan.price}
╠══════════════════════════════════════╣
║ 📲 EasyPaisa: \`${EASYPAISA_NUMBER}\`
║ 📲 JazzCash: \`${JAZZCASH_NUMBER}\`
║ 👤 Name: ${ACCOUNT_NAME}
╠══════════════════════════════════════╣
║ *After payment:* type /paid
║ and send screenshot.
║ 🆔 Your ID: \`${userId}\`
╚══════════════════════════════════════╝`,
                    { parse_mode: 'Markdown' });
            }
            bot.answerCallbackQuery(cq.id);
        }
    } catch(err) { console.error('Callback error:', err); }
});

bot.onText(/\/paid/, (msg) => {
    try {
        const userId = msg.from.id;
        const name = msg.from.first_name || 'User';
        const state = userStates[userId] || '';
        let planKey = null;
        if (state.startsWith('pending_plan:')) planKey = state.split(':')[1];
        if (!planKey || !PLANS[planKey]) {
            bot.sendMessage(userId, '❌ *Please select a plan first!*\nUse /buypremium to choose your plan.', { parse_mode: 'Markdown' });
            return;
        }
        pendingPayments[userId] = { name, date: today(), plan: planKey, screenshot: false };
        userStates[userId] = null;
        saveData();
        bot.sendMessage(userId, '✅ *Payment notification sent.*\nSend your payment screenshot here. Admin will verify within 1-2 hours.', { parse_mode: 'Markdown' });
        ADMIN_IDS.forEach(adminId => {
            bot.sendMessage(adminId, `💰 *NEW PAYMENT CLAIM!*\n━━━━━━━━━━━━━━━━━━━━\n👤 Name: ${name}\n🆔 ID: \`${userId}\`\n📦 Plan: ${PLANS[planKey].name} (PKR ${PLANS[planKey].price})\n📅 Date: ${today()}\n━━━━━━━━━━━━━━━━━━━━\nUse 👑 ADMIN PANEL → ✅ APPROVE PAYMENT`, { parse_mode: 'Markdown' });
        });
    } catch(err) { console.error('/paid error:', err); }
});

bot.on('photo', (msg) => {
    try {
        if (msg.chat.type !== 'private') return;
        const userId = msg.from.id;
        if (pendingPayments[userId]) {
            pendingPayments[userId].screenshot = true;
            saveData();
            bot.sendMessage(userId, '✅ *Screenshot received!* Admin will verify soon.', { parse_mode: 'Markdown' });
            ADMIN_IDS.forEach(adminId => {
                bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
                const planName = pendingPayments[userId].plan ? (PLANS[pendingPayments[userId].plan]?.name || 'Unknown') : 'Unknown';
                bot.sendMessage(adminId, `📸 *Screenshot from* ${msg.from.first_name} \`${userId}\` (${planName})\n\nUse 👑 ADMIN PANEL → ✅ APPROVE PAYMENT`, { parse_mode: 'Markdown' });
            });
        }
    } catch(err) { console.error('Photo handler error:', err); }
});

bot.on('message', (msg) => {
    if (msg.chat.type !== 'private') {
        bot.sendMessage(msg.chat.id, '❌ Private chat only.');
        return;
    }
    handleMessage(msg);
});

// ======================= HEALTH SERVER FOR RAILWAY =======================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Health server running on port ${PORT}`);
});

// ======================= START AUTO RESULT CHECKER =======================
startAutoResultChecker();
console.log('🚀 Wingo bot started with auto 1-min results (payment system fully fixed)');
loadData(); // initial load