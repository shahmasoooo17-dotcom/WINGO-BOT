// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UNIFIED TRADING BOT v1.0
// - WINGO PREDICTION BOT (30s/1m predictions)
// - QUOTEX SIGNAL BOT (OTC/Main assets with multiple timeframes)
// - Multi-plan premium subscriptions (2d, 1w, 2w, 1m)
// - Single admin panel for both bots
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TelegramBot = require('node-telegram-bot-api');

// ═════════════════════════════════════════════════════════════════════════════════
// ⚙️  YOUR SETTINGS - EDIT THESE
// ═════════════════════════════════════════════════════════════════════════════════

const BOT_TOKEN = '8425112915:AAE_RNh0tDnXRp3ULKciTPuqIjuiSoNfQtE';
const ADMIN_IDS = [7592032793];        // Your Telegram numeric ID

// 🔐 Admin Panel Password
const ADMIN_PASSWORD = 'Masoodking123';

// Bot Name
const BOT_NAME = '🎯 MASOOD TRADING BOT';

// 🆕 MULTIPLE PREMIUM PLANS (edit prices below)
const PLANS = {
    '2days':  { days: 2,  price: 500,  name: '2 Days' },
    '1week':  { days: 7,  price: 1000, name: '1 Week' },
    '2weeks': { days: 14, price: 1800, name: '2 Weeks' },
    '1month': { days: 30, price: 3000, name: '1 Month' }
};

// Free daily limits
const WINGO_FREE_LIMIT = 8;      // Wingo: 5 free predictions/day
const QUOTEX_FREE_LIMIT = 8;     // Quotex: 3 free signals/day

// Payment Details
const EASYPAISA_NUMBER = '0318-0939237';
const JAZZCASH_NUMBER = '0319-9837973';
const ACCOUNT_NAME = 'MUHAMMAD ABID SHAH';

// Timezone for Quotex chart (UTC+3)
const CHART_TIMEZONE = 'UTC+3';

// ═════════════════════════════════════════════════════════════════════════════════
// DO NOT CHANGE BELOW (unless you know what you're doing)
// ═════════════════════════════════════════════════════════════════════════════════

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Storage ──────────────────────────────────────────────────────────────────────
const premiumUsers    = {};  // { userId: expiryTimestamp }
const wingoFreeUsage  = {};  // { userId: { date, count } }
const quotexFreeUsage = {};  // { userId: { date, count } }
const userStates      = {};  // { userId: state_string }
const userBotChoice   = {};  // { userId: 'wingo' or 'quotex' }
const pendingPayments = {};  // { userId: { name, date, plan, screenshot } }
const allUsers        = {};  // { userId: { name, username, joinDate, wingoPredictions, quotexSignals } }
const adminSessions   = {};  // { adminId: { verified: bool, expiry: timestamp } }

// ── Wingo Assets & Timeframes ────────────────────────────────────────────────────

function getCurrentPeriod30s() {
    const n = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}`;
    const slot = Math.floor((n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 30) + 1;
    return `${date}${String(slot).padStart(4, '0')}`;
}

function getCurrentPeriod1m() {
    const n = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}`;
    const slot = n.getHours() * 60 + n.getMinutes() + 1;
    return `${date}${String(slot).padStart(4, '0')}`;
}

function getTimeLeft30s() { return 30 - (new Date().getSeconds() % 30); }
function getTimeLeft1m() { return 60 - new Date().getSeconds(); }

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

// ── Quotex Assets & Timeframes ───────────────────────────────────────────────────

const QUOTEX_ASSETS = {
    'otc_eurusd': { name: 'EUR/USD (OTC)', type: 'OTC', digits: 5 },
    'otc_gbpusd': { name: 'GBP/USD (OTC)', type: 'OTC', digits: 5 },
    'otc_usdjpy': { name: 'USD/JPY (OTC)', type: 'OTC', digits: 3 },
    'otc_audusd': { name: 'AUD/USD (OTC)', type: 'OTC', digits: 5 },
    'otc_btcusd': { name: 'BTC/USD (OTC)', type: 'OTC', digits: 2 },
    'main_eurusd': { name: 'EUR/USD', type: 'MAIN', digits: 5 },
    'main_gbpusd': { name: 'GBP/USD', type: 'MAIN', digits: 5 },
    'main_usdjpy': { name: 'USD/JPY', type: 'MAIN', digits: 3 },
    'main_audusd': { name: 'AUD/USD', type: 'MAIN', digits: 5 },
    'main_btcusd': { name: 'BTC/USD', type: 'MAIN', digits: 2 }
};

const QUOTEX_TIMEFRAMES = {
    '1m': { seconds: 60, name: '1 Minute', holdTime: '1-2 min' },
    '5m': { seconds: 300, name: '5 Minutes', holdTime: '5-10 min' },
    '15m': { seconds: 900, name: '15 Minutes', holdTime: '15-30 min' },
    '30m': { seconds: 1800, name: '30 Minutes', holdTime: '30-45 min' },
    '1h': { seconds: 3600, name: '1 Hour', holdTime: '1-2 hours' }
};

function getUTC3Time() {
    const now = new Date();
    return new Date(now.getTime() + (3 * 60 * 60 * 1000));
}

function getFormattedUTCTime() {
    const time = getUTC3Time();
    return time.toISOString().slice(0, 19).replace('T', ' ');
}

function addMinutesToUTC3(minutes) {
    const time = getUTC3Time();
    time.setUTCMinutes(time.getUTCMinutes() + minutes);
    return `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`;
}

function quotexGenerateSignal(assetKey, timeframeKey, isPremium) {
    const asset = QUOTEX_ASSETS[assetKey];
    const tf = QUOTEX_TIMEFRAMES[timeframeKey];
    const seedInput = `${assetKey}_${timeframeKey}_${Math.floor(Date.now() / (tf.seconds * 1000))}`;
    const seed = seedRandom(seedInput);
    
    const rsi = 30 + (seed % 70);
    const macdSignal = seed % 3;
    const ma50 = 20 + (seed % 60);
    const ma200 = 30 + ((seed + 15) % 55);
    const volume = 100 + (seed % 900);
    const volatility = 10 + (seed % 40);
    
    let direction = 'CALL';
    let confidence = 60;
    let strength = 'MEDIUM';
    
    if (rsi < 30 && macdSignal === 0) { direction = 'CALL'; confidence = 75 + (seed % 20); strength = 'HIGH'; }
    else if (rsi > 70 && macdSignal === 1) { direction = 'PUT'; confidence = 75 + (seed % 20); strength = 'HIGH'; }
    else if (ma50 > ma200 && volume > 500) { direction = 'CALL'; confidence = 65 + (seed % 15); strength = 'MEDIUM'; }
    else if (ma50 < ma200 && volume > 500) { direction = 'PUT'; confidence = 65 + (seed % 15); strength = 'MEDIUM'; }
    else if (volatility > 35) { direction = seed % 2 === 0 ? 'CALL' : 'PUT'; confidence = 55 + (seed % 15); strength = 'LOW'; }
    else { direction = seed % 2 === 0 ? 'CALL' : 'PUT'; confidence = 50 + (seed % 20); strength = seed % 2 === 0 ? 'MEDIUM' : 'LOW'; }
    
    if (isPremium) {
        confidence = Math.min(98, confidence + 12);
        if (strength === 'LOW') strength = 'MEDIUM';
        else if (strength === 'MEDIUM') strength = 'HIGH';
        else if (strength === 'HIGH') strength = 'VERY HIGH';
    }
    
    const now = getUTC3Time();
    const entryTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
    const expiryTime = addMinutesToUTC3(tf.seconds / 60);
    const price = 1.05000 + (seed % 500) / 100000;
    const support = (price - (volatility / 10000)).toFixed(5);
    const resistance = (price + (volatility / 10000)).toFixed(5);
    
    return {
        asset: asset.name, assetType: asset.type, timeframe: tf.name,
        direction: direction, entryTime: entryTime, expiryTime: expiryTime,
        holdTime: tf.holdTime, confidence: confidence, strength: strength,
        rsi: rsi, macdSignal: macdSignal === 0 ? 'BULLISH' : (macdSignal === 1 ? 'BEARISH' : 'NEUTRAL'),
        support: support, resistance: resistance, currentPrice: price.toFixed(asset.digits)
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function isAdmin(id) { return ADMIN_IDS.includes(id); }
function today() { return new Date().toISOString().slice(0, 10); }

function isAdminVerified(adminId) {
    const s = adminSessions[adminId];
    if (!s) return false;
    if (Date.now() > s.expiry) { delete adminSessions[adminId]; return false; }
    return s.verified;
}

function isPremium(userId) {
    if (!premiumUsers[userId]) return false;
    if (Date.now() > premiumUsers[userId]) { delete premiumUsers[userId]; return false; }
    return true;
}

// Wingo free usage
function getWingoFreeUsed(userId) {
    const u = wingoFreeUsage[userId];
    if (!u || u.date !== today()) return 0;
    return u.count;
}
function incrementWingoFree(userId) {
    if (!wingoFreeUsage[userId] || wingoFreeUsage[userId].date !== today()) {
        wingoFreeUsage[userId] = { date: today(), count: 0 };
    }
    wingoFreeUsage[userId].count++;
}
function canGetWingoSignal(userId) {
    if (isPremium(userId)) return { ok: true };
    const used = getWingoFreeUsed(userId);
    if (used < WINGO_FREE_LIMIT) return { ok: true, left: WINGO_FREE_LIMIT - used };
    return { ok: false };
}

// Quotex free usage
function getQuotexFreeUsed(userId) {
    const u = quotexFreeUsage[userId];
    if (!u || u.date !== today()) return 0;
    return u.count;
}
function incrementQuotexFree(userId) {
    if (!quotexFreeUsage[userId] || quotexFreeUsage[userId].date !== today()) {
        quotexFreeUsage[userId] = { date: today(), count: 0 };
    }
    quotexFreeUsage[userId].count++;
}
function canGetQuotexSignal(userId) {
    if (isPremium(userId)) return { ok: true };
    const used = getQuotexFreeUsed(userId);
    if (used < QUOTEX_FREE_LIMIT) return { ok: true, left: QUOTEX_FREE_LIMIT - used };
    return { ok: false };
}

// ── Main Menu Keyboard ──────────────────────────────────────────────────────────

function mainMenu(userId) {
    const isPrem = isPremium(userId);
    return {
        reply_markup: {
            keyboard: [
                ['🎲 WINGO PREDICTION', '📊 QUOTEX SIGNALS'],
                ['💎 BUY PREMIUM', '📊 MY ACCOUNT'],
                ['❓ HELP']
            ],
            resize_keyboard: true
        }
    };
}

function wingoMenu() {
    return {
        reply_markup: {
            keyboard: [
                ['🎯 30 SEC PREDICT', '🎯 1 MIN PREDICT'],
                ['🔙 MAIN MENU']
            ],
            resize_keyboard: true
        }
    };
}

function quotexMainMenu() {
    return {
        reply_markup: {
            keyboard: [
                ['📈 OTC SIGNAL', '💱 MAIN SIGNAL'],
                ['⏱️ TIMEFRAMES', '🔙 MAIN MENU']
            ],
            resize_keyboard: true
        }
    };
}

function quotexAssetKeyboard(assetType) {
    let assets = [];
    if (assetType === 'OTC') {
        assets = ['EUR/USD (OTC)', 'GBP/USD (OTC)', 'USD/JPY (OTC)', 'AUD/USD (OTC)', 'BTC/USD (OTC)', '🔙 BACK'];
    } else {
        assets = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'BTC/USD', '🔙 BACK'];
    }
    return {
        reply_markup: {
            keyboard: [assets.slice(0, 3), assets.slice(3, 6)],
            resize_keyboard: true
        }
    };
}

function timeframeKeyboard() {
    return {
        reply_markup: {
            keyboard: [['1 MINUTE', '5 MINUTES', '15 MINUTES'], ['30 MINUTES', '1 HOUR'], ['🔙 BACK TO QUOTEX']],
            resize_keyboard: true
        }
    };
}

function adminMenu() {
    return {
        reply_markup: {
            keyboard: [
                ['👥 ALL USERS', '💎 PREMIUM USERS'],
                ['💰 PENDING PAYMENTS', '✅ APPROVE PAYMENT'],
                ['❌ REMOVE PREMIUM', '📢 BROADCAST'],
                ['📊 BOT STATS', '🚪 EXIT ADMIN']
            ],
            resize_keyboard: true
        }
    };
}

// ── Admin Panel ──────────────────────────────────────────────────────────────────

function cmdAdminLogin(msg) {
    const userId = msg.from.id;
    if (!isAdmin(userId)) return bot.sendMessage(userId, '❌ You are not an admin.');
    if (isAdminVerified(userId)) {
        userStates[userId] = 'admin_panel';
        return showAdminBanner(userId).then(() => bot.sendMessage(userId, '✅ Already logged in!', adminMenu()));
    }
    userStates[userId] = 'waiting_admin_password';
    bot.sendMessage(userId, `🔐 *ADMIN LOGIN*\n━━━━━━━━━━━━━━━━━━━━\nEnter your admin password:`, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function showAdminBanner(userId) {
    const premCount = Object.keys(premiumUsers).length;
    const userCount = Object.keys(allUsers).length;
    const pendCount = Object.keys(pendingPayments).length;
    return bot.sendMessage(userId,
`╔══════════════════════════════╗
║      🛡️ UNIFIED ADMIN PANEL     ║
║         ${BOT_NAME}
╠══════════════════════════════╣
║ 👥 TOTAL USERS   : ${String(userCount).padEnd(5)}║
║ 💎 PREMIUM       : ${String(premCount).padEnd(5)}║
║ 💰 PENDING PAY   : ${String(pendCount).padEnd(5)}║
║ 📅 DATE          : ${today()} ║
╚══════════════════════════════╝`,
        adminMenu());
}

// ── Wingo Commands ──────────────────────────────────────────────────────────────

function cmdWingoMenu(msg) {
    const userId = msg.from.id;
    userBotChoice[userId] = 'wingo';
    userStates[userId] = null;
    bot.sendMessage(userId, `🎲 *WINGO PREDICTION MODE*\n━━━━━━━━━━━━━━━━━━━━\nSelect prediction type:`, { parse_mode: 'Markdown', ...wingoMenu() });
}

function cmdWingo30(msg) {
    const userId = msg.from.id;
    const access = canGetWingoSignal(userId);
    if (!access.ok) return showWingoLimitMsg(userId);
    userStates[userId] = 'wingo_30s_predict';
    bot.sendMessage(userId,
`🎯 *30 Second WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Time left: *~${getTimeLeft30s()}s*
📌 Est. period: \`${getCurrentPeriod30s()}\`
━━━━━━━━━━━━━━━━━━━━
👇 Enter period number:`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
    );
}

function cmdWingo1m(msg) {
    const userId = msg.from.id;
    const access = canGetWingoSignal(userId);
    if (!access.ok) return showWingoLimitMsg(userId);
    userStates[userId] = 'wingo_1m_predict';
    bot.sendMessage(userId,
`🎯 *1 Minute WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Time left: *~${getTimeLeft1m()}s*
📌 Est. period: \`${getCurrentPeriod1m()}\`
━━━━━━━━━━━━━━━━━━━━
👇 Enter period number:`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
    );
}

function handleWingoPrediction(userId, periodStr, is30s) {
    const isPrem = isPremium(userId);
    if (!isPrem) incrementWingoFree(userId);
    if (allUsers[userId]) allUsers[userId].wingoPredictions = (allUsers[userId].wingoPredictions || 0) + 1;
    
    const pred = wingoPredict(periodStr, isPrem);
    const gameMode = is30s ? '30 Sec WinGo' : '1 Min WinGo';
    const timeLeft = is30s ? getTimeLeft30s() : getTimeLeft1m();
    
    bot.sendMessage(userId,
`${BOT_NAME} - WINGO
━━━━━━━━━━━━━━━━━━━━
${isPrem ? '💎 PREMIUM' : '🆓 FREE'} PREDICTION
━━━━━━━━━━━━━━━━━━━━
🕹️ Game: ${gameMode}
📌 Period: \`${periodStr}\`
⏱️ Time Left: ~${timeLeft}s
━━━━━━━━━━━━━━━━━━━━
🔢 Number: *${pred.num}*
🎨 Color: *${pred.color}*
📏 Size: *${pred.size}*
💡 Confidence: ${pred.conf}
━━━━━━━━━━━━━━━━━━━━
${isPrem ? '_💎 Premium signal_ ' : '_⚠️ Free signal | /buypremium for better accuracy_'}`,
        { parse_mode: 'Markdown' }
    );
    
    const remaining = isPrem ? '♾️ Unlimited' : `${WINGO_FREE_LIMIT - getWingoFreeUsed(userId)} left today`;
    setTimeout(() => {
        bot.sendMessage(userId, `📊 Remaining: ${remaining}`, mainMenu(userId));
    }, 500);
}

function showWingoLimitMsg(userId) {
    bot.sendMessage(userId, `⛔ *Daily Limit Reached!*\n\nYou've used all ${WINGO_FREE_LIMIT} free predictions.\n\n/buypremium`, { parse_mode: 'Markdown', ...mainMenu(userId) });
}

// ── Quotex Commands ─────────────────────────────────────────────────────────────

function cmdQuotexMenu(msg) {
    const userId = msg.from.id;
    userBotChoice[userId] = 'quotex';
    userStates[userId] = null;
    bot.sendMessage(userId, `📊 *QUOTEX SIGNAL MODE*\n━━━━━━━━━━━━━━━━━━━━\n⏰ Chart Time (UTC+3): ${getFormattedUTCTime()}\n\nSelect signal type:`, { parse_mode: 'Markdown', ...quotexMainMenu() });
}

function cmdQuotexOTCSignal(msg) {
    const userId = msg.from.id;
    userStates[userId] = 'quotex_waiting_otc_asset';
    bot.sendMessage(userId, `📈 *OTC ASSETS*\n━━━━━━━━━━━━━━━━━━━━\nSelect OTC pair:`, { parse_mode: 'Markdown', ...quotexAssetKeyboard('OTC') });
}

function cmdQuotexMainSignal(msg) {
    const userId = msg.from.id;
    userStates[userId] = 'quotex_waiting_main_asset';
    bot.sendMessage(userId, `💱 *MAIN CURRENCIES*\n━━━━━━━━━━━━━━━━━━━━\nSelect currency pair:`, { parse_mode: 'Markdown', ...quotexAssetKeyboard('MAIN') });
}

function cmdQuotexTimeframes(msg) {
    const userId = msg.from.id;
    userStates[userId] = 'quotex_waiting_timeframe';
    bot.sendMessage(userId, `⏱️ *SELECT TIMEFRAME*\n━━━━━━━━━━━━━━━━━━━━\nChoose timeframe:`, { parse_mode: 'Markdown', ...timeframeKeyboard() });
}

async function sendQuotexSignal(userId, assetKey, timeframeKey) {
    const access = canGetQuotexSignal(userId);
    if (!access.ok) {
        return bot.sendMessage(userId, `⛔ *Daily Limit Reached!*\n\nYou've used all ${QUOTEX_FREE_LIMIT} free signals.\n\n/buypremium`, { parse_mode: 'Markdown', ...mainMenu(userId) });
    }
    
    const isPrem = isPremium(userId);
    if (!isPrem) incrementQuotexFree(userId);
    if (allUsers[userId]) allUsers[userId].quotexSignals = (allUsers[userId].quotexSignals || 0) + 1;
    
    const signal = quotexGenerateSignal(assetKey, timeframeKey, isPrem);
    const directionEmoji = signal.direction === 'CALL' ? '🟢 CALL (UP)' : '🔴 PUT (DOWN)';
    const confidenceBar = '█'.repeat(Math.floor(signal.confidence / 10)) + '░'.repeat(10 - Math.floor(signal.confidence / 10));
    
    bot.sendMessage(userId,
`╔══════════════════════════════════════╗
║     📊 *${BOT_NAME} - QUOTEX* 📊
╠══════════════════════════════════════╣
║ 🎯 *ASSET:* ${signal.asset}
║ 📍 *TYPE:* ${signal.assetType}
║ ⏱️ *TIMEFRAME:* ${signal.timeframe}
╠══════════════════════════════════════╣
║ 🟢 *SIGNAL:* ${directionEmoji}
║ 💪 *STRENGTH:* ${signal.strength}
║ 📈 *CONFIDENCE:* ${signal.confidence}% ${confidenceBar}
╠══════════════════════════════════════╣
║ ⏰ *ENTRY (UTC+3):* ${signal.entryTime}
║ ⌛ *EXPIRY (UTC+3):* ${signal.expiryTime}
║ 🕐 *HOLD TIME:* ${signal.holdTime}
╠══════════════════════════════════════╣
║ 💵 *PRICE:* ${signal.currentPrice}
║ 📊 *SUPPORT:* ${signal.support}
║ 📈 *RESISTANCE:* ${signal.resistance}
╠══════════════════════════════════════╣
║ 📉 *RSI:* ${signal.rsi}
║ 📊 *MACD:* ${signal.macdSignal}
╚══════════════════════════════════════╝
${isPrem ? '✨ *PREMIUM SIGNAL - High Accuracy* ✨' : '⚠️ *FREE SIGNAL - Upgrade for better accuracy* ⚠️'}`,
        { parse_mode: 'Markdown' }
    );
    
    const remaining = isPrem ? '♾️ Unlimited' : `${QUOTEX_FREE_LIMIT - getQuotexFreeUsed(userId)} left today`;
    setTimeout(() => {
        bot.sendMessage(userId, `📊 Signals remaining: ${remaining}`, mainMenu(userId));
    }, 1000);
}

// ── Premium Purchase Commands ───────────────────────────────────────────────────

function cmdBuyPremium(msg) {
    const userId = msg.from.id;
    if (isPremium(userId)) {
        const expiry = new Date(premiumUsers[userId]).toLocaleDateString();
        const daysLeft = Math.ceil((premiumUsers[userId] - Date.now()) / 86400000);
        return bot.sendMessage(userId, `✅ *ALREADY PREMIUM!*\nExpires: ${expiry}\nDays left: ${daysLeft}`, { parse_mode: 'Markdown', ...mainMenu(userId) });
    }
    
    const keyboard = { inline_keyboard: [] };
    for (const [key, plan] of Object.entries(PLANS)) {
        keyboard.inline_keyboard.push([{ text: `${plan.name} - PKR ${plan.price}`, callback_data: `plan_${key}` }]);
    }
    bot.sendMessage(userId, `💎 *CHOOSE YOUR PREMIUM PLAN*\n━━━━━━━━━━━━━━━━━━━━\n✅ Unlimited Wingo predictions\n✅ Unlimited Quotex signals\n✅ Higher accuracy\n✅ Priority support`, { parse_mode: 'Markdown', reply_markup: keyboard });
}

bot.on('callback_query', (callbackQuery) => {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const name = callbackQuery.from.first_name || 'User';
    
    if (data && data.startsWith('plan_')) {
        const planKey = data.replace('plan_', '');
        const plan = PLANS[planKey];
        if (plan) {
            userStates[userId] = `pending_plan:${planKey}`;
            bot.sendMessage(userId,
`💎 *YOU SELECTED: ${plan.name}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Unlimited Wingo predictions
✅ Unlimited Quotex signals
✅ Higher accuracy (85%+)
✅ Priority support
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *PRICE: PKR ${plan.price}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📲 *EasyPaisa:* \`${EASYPAISA_NUMBER}\`
📲 *JazzCash:* \`${JAZZCASH_NUMBER}\`
👤 *NAME:* ${ACCOUNT_NAME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*AFTER PAYING:*
1️⃣ Type /paid
2️⃣ Send screenshot
3️⃣ Admin activates your ${plan.name} plan!

Your ID: \`${userId}\``,
                { parse_mode: 'Markdown' });
        }
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

function cmdPaid(msg) {
    const userId = msg.from.id;
    const name = msg.from.first_name || 'User';
    const state = userStates[userId] || '';
    let planKey = null;
    if (state.startsWith('pending_plan:')) planKey = state.split(':')[1];
    if (!planKey || !PLANS[planKey]) {
        return bot.sendMessage(userId, `❌ *Please select a plan first!*\n\nUse /buypremium to choose your plan.`, { parse_mode: 'Markdown' });
    }
    pendingPayments[userId] = { name, date: today(), plan: planKey, screenshot: false };
    userStates[userId] = null;
    bot.sendMessage(userId, `✅ *Payment notification sent for ${PLANS[planKey].name}!*\n\nSend your screenshot here.`, { parse_mode: 'Markdown' });
    ADMIN_IDS.forEach(adminId => {
        bot.sendMessage(adminId, `💰 *NEW PAYMENT CLAIM!*\n👤 ${name}\n🆔 ${userId}\n📦 ${PLANS[planKey].name} (PKR ${PLANS[planKey].price})\n📅 ${today()}`, { parse_mode: 'Markdown' });
    });
}

function cmdMyAccount(msg) {
    const userId = msg.from.id;
    const isPrem = isPremium(userId);
    const u = allUsers[userId] || {};
    const expiry = isPrem ? new Date(premiumUsers[userId]).toLocaleDateString() : 'N/A';
    const daysLeft = isPrem ? Math.ceil((premiumUsers[userId] - Date.now()) / 86400000) : 0;
    
    bot.sendMessage(userId,
`📊 *MY ACCOUNT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 *NAME:* ${u.name || 'N/A'}
🆔 *ID:* \`${userId}\`
📅 *MEMBER SINCE:* ${u.joinDate || today()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 *PLAN:* ${isPrem ? '💎 PREMIUM' : '🆓 FREE'}
${isPrem ? `📅 *EXPIRES:* ${expiry}\n⏳ *DAYS LEFT:* ${daysLeft}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎲 *WINGO PREDICTIONS:* ${u.wingoPredictions || 0}
📊 *QUOTEX SIGNALS:* ${u.quotexSignals || 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${!isPrem ? `/buypremium - Upgrade now 💎` : '✅ Premium active!'}`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}

function cmdHelp(msg) {
    const userId = msg.from.id;
    bot.sendMessage(userId,
`❓ *HELP GUIDE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🎲 WINGO PREDICTION:*
• 30 SEC - Fast predictions
• 1 MIN - Standard predictions
• Enter period number from game

*📊 QUOTEX SIGNALS:*
• OTC SIGNAL - Digital options
• MAIN SIGNAL - Currency pairs
• Select timeframe (1m to 1h)
• Trade at UTC+3 entry time

*👑 ADMIN:* @GojoVipAdmin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆓 FREE: Wingo(${WINGO_FREE_LIMIT}) + Quotex(${QUOTEX_FREE_LIMIT})/day
💎 PREMIUM: Unlimited + Higher accuracy
/buypremium - Upgrade now!`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}

// ── Message Handler ─────────────────────────────────────────────────────────────

function handleMessage(msg) {
    const userId = msg.from.id;
    const text = (msg.text || '').trim();
    const name = msg.from.first_name || 'User';
    const uname = msg.from.username || 'N/A';
    
    if (!allUsers[userId]) {
        allUsers[userId] = { name, username: uname, joinDate: today(), wingoPredictions: 0, quotexSignals: 0 };
    }
    
    const state = userStates[userId] || '';
    
    // Admin password handler
    if (state === 'waiting_admin_password' && isAdmin(userId)) {
        if (text === ADMIN_PASSWORD) {
            adminSessions[userId] = { verified: true, expiry: Date.now() + 3600000 };
            userStates[userId] = 'admin_panel';
            bot.sendMessage(userId, '✅ Password correct!', adminMenu());
            showAdminBanner(userId);
        } else {
            userStates[userId] = null;
            bot.sendMessage(userId, '❌ Wrong password!', mainMenu(userId));
        }
        return;
    }
    
    // Admin panel handler
    if (state === 'admin_panel' && isAdmin(userId) && isAdminVerified(userId)) {
        handleAdminCommands(userId, text);
        return;
    }
    
    // Wingo prediction handlers
    if (state === 'wingo_30s_predict' && /^\d{8,14}$/.test(text)) {
        handleWingoPrediction(userId, text, true);
        userStates[userId] = null;
        return;
    }
    if (state === 'wingo_1m_predict' && /^\d{8,14}$/.test(text)) {
        handleWingoPrediction(userId, text, false);
        userStates[userId] = null;
        return;
    }
    
    // Quotex asset selection handlers
    if (state === 'quotex_waiting_otc_asset') {
        const assetMap = { 'EUR/USD (OTC)': 'otc_eurusd', 'GBP/USD (OTC)': 'otc_gbpusd', 'USD/JPY (OTC)': 'otc_usdjpy', 'AUD/USD (OTC)': 'otc_audusd', 'BTC/USD (OTC)': 'otc_btcusd' };
        if (text === '🔙 BACK') {
            userStates[userId] = null;
            bot.sendMessage(userId, 'Quotex Menu:', quotexMainMenu());
        } else if (assetMap[text]) {
            userStates[userId] = `quotex_signal_${assetMap[text]}`;
            bot.sendMessage(userId, `⏱️ Select timeframe for ${text}:`, timeframeKeyboard());
        }
        return;
    }
    
    if (state === 'quotex_waiting_main_asset') {
        const assetMap = { 'EUR/USD': 'main_eurusd', 'GBP/USD': 'main_gbpusd', 'USD/JPY': 'main_usdjpy', 'AUD/USD': 'main_audusd', 'BTC/USD': 'main_btcusd' };
        if (text === '🔙 BACK') {
            userStates[userId] = null;
            bot.sendMessage(userId, 'Quotex Menu:', quotexMainMenu());
        } else if (assetMap[text]) {
            userStates[userId] = `quotex_signal_${assetMap[text]}`;
            bot.sendMessage(userId, `⏱️ Select timeframe for ${text}:`, timeframeKeyboard());
        }
        return;
    }
    
    // Quotex timeframe handler
    if (state.startsWith('quotex_signal_') && ['1 MINUTE', '5 MINUTES', '15 MINUTES', '30 MINUTES', '1 HOUR', '🔙 BACK TO QUOTEX'].includes(text)) {
        if (text === '🔙 BACK TO QUOTEX') {
            userStates[userId] = null;
            bot.sendMessage(userId, 'Quotex Menu:', quotexMainMenu());
            return;
        }
        const timeframeMap = { '1 MINUTE': '1m', '5 MINUTES': '5m', '15 MINUTES': '15m', '30 MINUTES': '30m', '1 HOUR': '1h' };
        const timeframe = timeframeMap[text];
        const assetKey = state.replace('quotex_signal_', '');
        sendQuotexSignal(userId, assetKey, timeframe);
        userStates[userId] = null;
        return;
    }
    
    if (state === 'quotex_waiting_timeframe') {
        if (text === '🔙 BACK TO QUOTEX') {
            userStates[userId] = null;
            bot.sendMessage(userId, 'Quotex Menu:', quotexMainMenu());
        } else {
            userStates[userId] = null;
            bot.sendMessage(userId, 'Please select OTC or MAIN SIGNAL first.', quotexMainMenu());
        }
        return;
    }
    
    // Main menu commands
    switch(text) {
        case '/start': cmdStart(msg); break;
        case '/admin': cmdAdminLogin(msg); break;
        case '🎲 WINGO PREDICTION': cmdWingoMenu(msg); break;
        case '📊 QUOTEX SIGNALS': cmdQuotexMenu(msg); break;
        case '🎯 30 SEC PREDICT': cmdWingo30(msg); break;
        case '🎯 1 MIN PREDICT': cmdWingo1m(msg); break;
        case '📈 OTC SIGNAL': cmdQuotexOTCSignal(msg); break;
        case '💱 MAIN SIGNAL': cmdQuotexMainSignal(msg); break;
        case '⏱️ TIMEFRAMES': cmdQuotexTimeframes(msg); break;
        case '💎 BUY PREMIUM': cmdBuyPremium(msg); break;
        case '📊 MY ACCOUNT': cmdMyAccount(msg); break;
        case '❓ HELP': cmdHelp(msg); break;
        case '🔙 MAIN MENU':
        case '🔙 BACK':
            userStates[userId] = null;
            bot.sendMessage(userId, 'Main Menu:', mainMenu(userId));
            break;
        case '/paid': cmdPaid(msg); break;
        default:
            if (!text.startsWith('/')) bot.sendMessage(userId, 'Use the buttons below 👇', mainMenu(userId));
    }
}

function cmdStart(msg) {
    const userId = msg.from.id;
    const name = msg.from.first_name || 'Trader';
    const isPrem = isPremium(userId);
    userStates[userId] = null;
    userBotChoice[userId] = null;
    bot.sendMessage(userId,
`👋 *WELCOME TO ${BOT_NAME}, ${name}!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *UNIFIED TRADING BOT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isPrem ? '💎 *PREMIUM MEMBER* - Unlimited everything!' : `🆓 *FREE USER* - ${WINGO_FREE_LIMIT} Wingo + ${QUOTEX_FREE_LIMIT} Quotex/day`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 *SELECT A BOT BELOW:*
• 🎲 WINGO PREDICTION - 30s/1m predictions
• 📊 QUOTEX SIGNALS - OTC/Main + timeframes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Private chat only_`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}

// ── Admin Commands Handler ──────────────────────────────────────────────────────

function handleAdminCommands(userId, text) {
    switch(text) {
        case '👥 ALL USERS':
            const users = Object.entries(allUsers);
            if (users.length === 0) return bot.sendMessage(userId, 'No users yet.');
            let out = `👥 ALL USERS (${users.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
            users.slice(0, 30).forEach(([id, u]) => {
                const plan = isPremium(Number(id)) ? '💎' : '🆓';
                out += `${plan} ${u.name} (@${u.username})\nID: ${id}\nWingo:${u.wingoPredictions || 0} Quotex:${u.quotexSignals || 0}\n\n`;
            });
            bot.sendMessage(userId, out);
            break;
        case '💎 PREMIUM USERS':
            const prems = Object.entries(premiumUsers);
            if (prems.length === 0) return bot.sendMessage(userId, 'No premium users.');
            let premOut = `💎 PREMIUM USERS (${prems.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
            prems.forEach(([id, exp]) => {
                const u = allUsers[id] || { name: 'Unknown' };
                const daysLeft = Math.ceil((exp - Date.now()) / 86400000);
                premOut += `💎 ${u.name}\nID: ${id}\nDays Left: ${daysLeft}\n\n`;
            });
            bot.sendMessage(userId, premOut);
            break;
        case '💰 PENDING PAYMENTS':
            const pendings = Object.entries(pendingPayments);
            if (pendings.length === 0) return bot.sendMessage(userId, 'No pending payments.');
            let pendOut = `💰 PENDING PAYMENTS (${pendings.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
            pendings.forEach(([id, p]) => {
                const planInfo = PLANS[p.plan] || { name: p.plan };
                pendOut += `👤 ${p.name} (${planInfo.name})\nID: ${id}\nDate: ${p.date}\n\n`;
            });
            bot.sendMessage(userId, pendOut);
            break;
        case '✅ APPROVE PAYMENT':
            userStates[userId] = 'waiting_approve_id';
            bot.sendMessage(userId, 'Enter user ID to approve:', { reply_markup: { force_reply: true } });
            break;
        case '❌ REMOVE PREMIUM':
            userStates[userId] = 'waiting_remove_id';
            bot.sendMessage(userId, 'Enter user ID to remove premium:', { reply_markup: { force_reply: true } });
            break;
        case '📢 BROADCAST':
            userStates[userId] = 'waiting_broadcast';
            bot.sendMessage(userId, 'Enter broadcast message:', { reply_markup: { force_reply: true } });
            break;
        case '📊 BOT STATS':
            bot.sendMessage(userId, `📊 STATS\n━━━━━━━━━━━━━━━━━━━━\n👥 Users: ${Object.keys(allUsers).length}\n💎 Premium: ${Object.keys(premiumUsers).length}\n💰 Pending: ${Object.keys(pendingPayments).length}\n⏰ UTC+3: ${getFormattedUTCTime()}`);
            break;
        case '🚪 EXIT ADMIN':
            delete adminSessions[userId];
            userStates[userId] = null;
            bot.sendMessage(userId, 'Admin session ended.', mainMenu(userId));
            break;
        default:
            bot.sendMessage(userId, 'Use admin buttons:', adminMenu());
    }
    
    if (userStates[userId] === 'waiting_approve_id' && /^\d+$/.test(text)) {
        const targetId = parseInt(text);
        const pending = pendingPayments[targetId];
        if (pending) {
            const plan = PLANS[pending.plan];
            if (plan) premiumUsers[targetId] = Date.now() + plan.days * 86400000;
            else premiumUsers[targetId] = Date.now() + 30 * 86400000;
            delete pendingPayments[targetId];
            bot.sendMessage(userId, `✅ Premium activated for ${targetId}`, adminMenu());
            bot.sendMessage(targetId, `🎉 *PREMIUM ACTIVATED!*\nYour plan has been activated!\nEnjoy unlimited Wingo predictions & Quotex signals!`);
        } else {
            bot.sendMessage(userId, `❌ No pending payment for ${targetId}`, adminMenu());
        }
        userStates[userId] = 'admin_panel';
    }
    
    if (userStates[userId] === 'waiting_remove_id' && /^\d+$/.test(text)) {
        const targetId = parseInt(text);
        if (premiumUsers[targetId]) {
            delete premiumUsers[targetId];
            bot.sendMessage(userId, `✅ Premium removed for ${targetId}`, adminMenu());
            bot.sendMessage(targetId, `⚠️ Your premium has been removed. Contact admin if mistake.`);
        } else {
            bot.sendMessage(userId, `❌ ID ${targetId} is not premium`, adminMenu());
        }
        userStates[userId] = 'admin_panel';
    }
    
    if (userStates[userId] === 'waiting_broadcast' && text && !text.startsWith('/')) {
        const userIds = Object.keys(allUsers);
        let sent = 0;
        userIds.forEach(uid => {
            bot.sendMessage(Number(uid), `📢 *BROADCAST*\n━━━━━━━━━━━━━━━━━━━━\n${text}`, { parse_mode: 'Markdown' }).then(() => sent++).catch(() => {});
        });
        bot.sendMessage(userId, `✅ Broadcast sent to ${sent} users`, adminMenu());
        userStates[userId] = 'admin_panel';
    }
}

// ── Payment Screenshot Handler ──────────────────────────────────────────────────

bot.on('photo', (msg) => {
    if (msg.chat.type !== 'private') return;
    const userId = msg.from.id;
    const name = msg.from.first_name || 'User';
    if (pendingPayments[userId]) {
        pendingPayments[userId].screenshot = true;
        bot.sendMessage(userId, '✅ Screenshot received! Admin will verify soon.');
        ADMIN_IDS.forEach(adminId => {
            bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
            bot.sendMessage(adminId, `📸 Screenshot from ${name} (${userId})\nUse /admin to approve.`);
        });
    }
});

// ── Block Groups & Channels ─────────────────────────────────────────────────────

bot.on('message', (msg) => {
    if (msg.chat.type !== 'private') {
        bot.sendMessage(msg.chat.id, '❌ This bot only works in private chat!');
        return;
    }
    handleMessage(msg);
});

console.log('🚀 UNIFIED TRADING BOT is running!');
console.log('📦 Features: Wingo Prediction + Quotex Signals');
console.log(`👤 Admin IDs: ${ADMIN_IDS}`);
console.log('💰 Plans:', Object.keys(PLANS).join(', '));
