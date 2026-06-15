// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UNIFIED TRADING BOT v2.4 - WITH FEEDBACK SYSTEM
// - Complete payment approval system (FIXED)
// - Feedback system (users can send feedback)
// - Admin can view all feedback
// - WINGO PREDICTION BOT (30s/1m predictions)
// - QUOTEX SIGNAL BOT (with ON/OFF toggle)
// - Multi-plan premium subscriptions (2d, 1w, 2w, 1m)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

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
const WINGO_FREE_LIMIT = 5;
const QUOTEX_FREE_LIMIT = 3;

// Payment Details
const EASYPAISA_NUMBER = '0318-0939237';
const JAZZCASH_NUMBER = '0319-9837973';
const ACCOUNT_NAME = 'MUHAMMAD ABID SHAH';

// Timezone for Quotex chart (UTC+3)
const CHART_TIMEZONE = 'UTC+3';

// ON/OFF TOGGLES
let WINGO_ENABLED = true;
let QUOTEX_ENABLED = false;

// ═════════════════════════════════════════════════════════════════════════════════
// DO NOT CHANGE BELOW
// ═════════════════════════════════════════════════════════════════════════════════

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Storage ──────────────────────────────────────────────────────────────────────
const premiumUsers    = {};
const wingoFreeUsage  = {};
const quotexFreeUsage = {};
const userStates      = {};
const userLastAction  = {};
const pendingPayments = {};
const allUsers        = {};
const adminSessions   = {};
const feedbacks       = {};  // { feedbackId: { userId, name, username, message, date, rating } }
let feedbackCounter   = 1;

// ── Wingo Auto Result Checker Storage ────────────────────────────────────────────
// Stores pending predictions waiting for auto result check
// { userId: { period, gameMode, prediction: { num, color, size } } }
const pendingWingoChecks = {};

// ── Wingo Functions ──────────────────────────────────────────────────────────────

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

// ── Wingo Auto Result Checker ─────────────────────────────────────────────────────

// Fetch JSON from a URL using built-in https
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error('Invalid JSON')); }
            });
        }).on('error', reject);
    });
}

// Fetch current period info from public API
// market: '0.5' = 30sec, '1' = 1min
async function fetchWingoPeriodFromAPI(market) {
    try {
        const data = await fetchJSON(`https://indialotteryapi.com/wp-json/wingo/v1/next?market=${market}`);
        return data; // { period, remain, idx, ymd }
    } catch (err) {
        console.error(`⚠️ Wingo API (next) error market=${market}:`, err.message);
        return null;
    }
}

// Fetch result/prediction for a specific period from public API
async function fetchWingoResultFromAPI(market, period) {
    try {
        const url = period
            ? `https://indialotteryapi.com/wp-json/wingo/v1/predict?market=${market}&period=${period}`
            : `https://indialotteryapi.com/wp-json/wingo/v1/predict?market=${market}`;
        const data = await fetchJSON(url);
        return data; // { digit, color, bigSmall, period, conf }
    } catch (err) {
        console.error(`⚠️ Wingo API (predict) error:`, err.message);
        return null;
    }
}

// Compare user prediction vs API result → return WIN / LOSS / JACKPOT
function compareWingoPrediction(userPred, apiResult) {
    const predNum  = parseInt(userPred.num);
    const realNum  = parseInt(apiResult.digit);
    const realColor = (apiResult.color || '').toLowerCase();
    const realSize  = (apiResult.bigSmall || '').toUpperCase();

    // 🎰 JACKPOT — exact number match
    if (predNum === realNum) {
        return {
            outcome: 'JACKPOT',
            emoji:   '🎰',
            label:   'JACKPOT! 💰🔥',
            detail:  `Your number *${predNum}* matched exactly! Huge win! 🎰`,
            realNum, realColor: apiResult.color, realSize
        };
    }

    // Normalize predicted color string to array for matching
    const predColorStr  = (userPred.color || '').toLowerCase();
    const colorMatch    =
        predColorStr.includes(realColor) ||
        realColor.includes('green') && predColorStr.includes('green') ||
        realColor.includes('red')   && predColorStr.includes('red')   ||
        realColor.includes('violet')&& predColorStr.includes('violet');

    if (colorMatch) {
        return {
            outcome: 'WIN',
            emoji:   '✅',
            label:   'WIN! 🎉',
            detail:  `Color matched! Predicted *${userPred.color}* → Result *${apiResult.color}* 🎉`,
            realNum, realColor: apiResult.color, realSize
        };
    }

    // Size match
    const predSize = (userPred.size || '').replace(/[📈📉]/g, '').trim().toUpperCase();
    if (predSize && predSize === realSize) {
        return {
            outcome: 'WIN',
            emoji:   '✅',
            label:   'WIN! 🎉',
            detail:  `Size matched! Predicted *${predSize}* → Result *${realSize}* 🎉`,
            realNum, realColor: apiResult.color, realSize
        };
    }

    // LOSS
    return {
        outcome: 'LOSS',
        emoji:   '❌',
        label:   'LOSS',
        detail:  `Predicted *${userPred.color} / ${predSize}* → Result *${apiResult.color} / ${realSize}*`,
        realNum, realColor: apiResult.color, realSize
    };
}

// Auto checker — runs every 32 seconds
// Checks all pending wingo predictions and sends result to user
async function runWingoAutoChecker() {
    const entries = Object.entries(pendingWingoChecks);
    if (!entries.length) return;

    for (const [userId, check] of entries) {
        try {
            const market    = check.gameMode === '30s' ? '0.5' : '1';
            const apiResult = await fetchWingoResultFromAPI(market, check.period);

            if (apiResult && apiResult.digit !== undefined) {
                const outcome  = compareWingoPrediction(check.prediction, apiResult);
                const gameName = check.gameMode === '30s' ? '30 Sec WinGo' : '1 Min WinGo';

                bot.sendMessage(Number(userId),
`${outcome.emoji} *RESULT — Period ${check.period}*
━━━━━━━━━━━━━━━━━━━━
🕹️ Game: *${gameName}*
━━━━━━━━━━━━━━━━━━━━
📊 *REAL RESULT:*
🔢 Number : *${apiResult.digit}*
🎨 Color  : *${apiResult.color}*
📏 Size   : *${apiResult.bigSmall}*
━━━━━━━━━━━━━━━━━━━━
🎯 *YOUR PREDICTION:*
🔢 Number : *${check.prediction.num}*
🎨 Color  : *${check.prediction.color}*
📏 Size   : *${check.prediction.size}*
━━━━━━━━━━━━━━━━━━━━
${outcome.emoji} *${outcome.label}*
${outcome.detail}`,
                    { parse_mode: 'Markdown', ...mainMenu(Number(userId)) }
                ).catch(() => {});

                // Remove from pending after result sent
                delete pendingWingoChecks[userId];
            }
        } catch (err) {
            console.error(`⚠️ Auto-check error userId=${userId}:`, err.message);
        }
    }
}

// Start the auto checker loop
setInterval(runWingoAutoChecker, 32000);
console.log('🔄 Wingo auto result checker started (every 32s)');

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

function isAdmin(id) { 
    return ADMIN_IDS.includes(Number(id)); 
}

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

// ── Feedback Functions ──────────────────────────────────────────────────────────

function saveFeedback(userId, name, username, message, rating = null) {
    const feedbackId = feedbackCounter++;
    feedbacks[feedbackId] = {
        id: feedbackId,
        userId: userId,
        name: name,
        username: username || 'N/A',
        message: message,
        rating: rating,
        date: today(),
        time: new Date().toLocaleString()
    };
    return feedbackId;
}

function getAllFeedbacks() {
    return Object.values(feedbacks).reverse();
}

function deleteFeedback(feedbackId) {
    if (feedbacks[feedbackId]) {
        delete feedbacks[feedbackId];
        return true;
    }
    return false;
}

// ── Keyboards ────────────────────────────────────────────────────────────────────

function mainMenu(userId) {
    const isAdminUser = isAdmin(userId);
    let keyboard = [
        ['🎲 WINGO PREDICTION', '📊 QUOTEX SIGNALS'],
        ['💎 BUY PREMIUM', '📊 MY ACCOUNT'],
        ['❓ HELP', '💬 FEEDBACK']
    ];
    if (isAdminUser) {
        keyboard.push(['👑 ADMIN PANEL']);
    }
    return { reply_markup: { keyboard: keyboard, resize_keyboard: true } };
}

function wingoMenu() {
    return {
        reply_markup: {
            keyboard: [['🎯 30 SEC PREDICT', '🎯 1 MIN PREDICT'], ['🔙 MAIN MENU']],
            resize_keyboard: true
        }
    };
}

function feedbackRatingKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['⭐ 1 Star', '⭐⭐ 2 Stars', '⭐⭐⭐ 3 Stars'],
                ['⭐⭐⭐⭐ 4 Stars', '⭐⭐⭐⭐⭐ 5 Stars'],
                ['🔙 MAIN MENU']
            ],
            resize_keyboard: true
        }
    };
}

function adminMenu() {
    const wingoStatus = WINGO_ENABLED ? '✅ ON' : '❌ OFF';
    const quotexStatus = QUOTEX_ENABLED ? '✅ ON' : '❌ OFF';
    return {
        reply_markup: {
            keyboard: [
                ['👥 ALL USERS', '💎 PREMIUM USERS'],
                ['💰 PENDING PAYMENTS', '✅ APPROVE PAYMENT'],
                ['❌ REMOVE PREMIUM', '📢 BROADCAST'],
                ['📊 BOT STATS', '💬 VIEW FEEDBACK'],
                [`🎲 WINGO: ${wingoStatus}`, `📊 QUOTEX: ${quotexStatus}`],
                ['🚪 EXIT ADMIN']
            ],
            resize_keyboard: true
        }
    };
}

function getNextPredictionKeyboard(botType, context) {
    if (botType === 'wingo') {
        const is30s = context === '30s';
        return {
            reply_markup: {
                keyboard: [
                    [is30s ? '🔄 NEXT 30 SEC PREDICTION' : '🔄 NEXT 1 MIN PREDICTION'],
                    ['🔙 BACK TO WINGO MENU', '🏠 MAIN MENU']
                ],
                resize_keyboard: true
            }
        };
    } else if (botType === 'quotex') {
        return {
            reply_markup: {
                keyboard: [
                    ['🔄 NEXT SAME SIGNAL'],
                    ['🔙 BACK TO QUOTEX MENU', '🏠 MAIN MENU']
                ],
                resize_keyboard: true
            }
        };
    }
    return null;
}

// ── Admin Panel Functions ────────────────────────────────────────────────────────

function cmdAdminLogin(msg) {
    const userId = msg.from.id;
    if (!isAdmin(userId)) {
        return bot.sendMessage(userId, '❌ *ACCESS DENIED!*\n\nYou are not authorized.', { parse_mode: 'Markdown', ...mainMenu(userId) });
    }
    if (isAdminVerified(userId)) {
        userStates[userId] = 'admin_panel';
        showAdminBanner(userId);
        return bot.sendMessage(userId, '✅ Already logged in!', adminMenu());
    }
    userStates[userId] = 'waiting_admin_password';
    bot.sendMessage(userId, '🔐 *ADMIN LOGIN*\n━━━━━━━━━━━━━━━━━━━━\nEnter your admin password:', { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function showAdminBanner(userId) {
    const premCount = Object.keys(premiumUsers).length;
    const userCount = Object.keys(allUsers).length;
    const pendCount = Object.keys(pendingPayments).length;
    const feedbackCount = Object.keys(feedbacks).length;
    bot.sendMessage(userId,
`╔════════════════════════════════════════╗
║           🛡️ UNIFIED ADMIN PANEL           ║
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

// ── Payment Approval Functions ───────────────────────────────────────────────────

function showApprovePaymentMenu(adminId) {
    const pendings = Object.entries(pendingPayments);
    if (pendings.length === 0) {
        return bot.sendMessage(adminId, '✅ No pending payments to approve!', adminMenu());
    }
    
    let message = `✅ *APPROVE PAYMENT*\n━━━━━━━━━━━━━━━━━━━━\n📋 *Pending Users:*\n\n`;
    pendings.forEach(([id, p]) => {
        const planInfo = PLANS[p.plan] || { name: p.plan, price: '?' };
        message += `🆔 *ID:* \`${id}\`\n👤 *Name:* ${p.name}\n📦 *Plan:* ${planInfo.name} (PKR ${planInfo.price})\n📅 *Date:* ${p.date}\n━━━━━━━━━━━━━━━━━━━━\n`;
    });
    message += `\n👇 *Enter the User ID to approve payment:*`;
    
    userStates[adminId] = 'waiting_approve_id';
    bot.sendMessage(adminId, message, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doApprovePayment(adminId, userIdToApprove) {
    const targetId = parseInt(userIdToApprove);
    
    if (isNaN(targetId)) {
        bot.sendMessage(adminId, '❌ Invalid ID! Please enter a numeric User ID.', adminMenu());
        userStates[adminId] = 'admin_panel';
        return;
    }
    
    const pending = pendingPayments[targetId];
    
    if (!pending) {
        bot.sendMessage(adminId, `❌ No pending payment found for ID: ${targetId}\n\nMake sure the user has sent /paid command first.`, adminMenu());
        userStates[adminId] = 'admin_panel';
        return;
    }
    
    const planKey = pending.plan;
    const plan = PLANS[planKey];
    
    if (!plan) {
        bot.sendMessage(adminId, `❌ Invalid plan for user ${targetId}`, adminMenu());
        userStates[adminId] = 'admin_panel';
        return;
    }
    
    const expiryTimestamp = Date.now() + (plan.days * 24 * 60 * 60 * 1000);
    premiumUsers[targetId] = expiryTimestamp;
    const expiryDate = new Date(expiryTimestamp).toLocaleDateString();
    
    delete pendingPayments[targetId];
    
    bot.sendMessage(adminId, 
        `✅ *PREMIUM ACTIVATED SUCCESSFULLY!*\n━━━━━━━━━━━━━━━━━━━━\n🆔 *User ID:* \`${targetId}\`\n📦 *Plan:* ${plan.name}\n📅 *Expires:* ${expiryDate}\n⏳ *Duration:* ${plan.days} days`,
        { parse_mode: 'Markdown', ...adminMenu() }
    );
    
    bot.sendMessage(targetId,
        `🎉 *PREMIUM ACTIVATED!* 🎉\n━━━━━━━━━━━━━━━━━━━━\n✅ Your payment has been verified!\n\n📦 *Plan:* ${plan.name}\n📅 *Expires:* ${expiryDate}\n⏳ *Duration:* ${plan.days} days\n━━━━━━━━━━━━━━━━━━━━\n🎲 *Wingo Predictions:* Unlimited\n📊 *Quotex Signals:* Unlimited\n━━━━━━━━━━━━━━━━━━━━\nThank you for your purchase! 🙏`,
        { parse_mode: 'Markdown', ...mainMenu(targetId) }
    ).catch(err => console.log('Error notifying user:', err.message));
    
    userStates[adminId] = 'admin_panel';
}

// ── Other Admin Functions ────────────────────────────────────────────────────────

function showRemovePremiumMenu(adminId) {
    const prems = Object.entries(premiumUsers);
    if (prems.length === 0) {
        return bot.sendMessage(adminId, '📭 No premium users to remove!', adminMenu());
    }
    
    let message = `❌ *REMOVE PREMIUM*\n━━━━━━━━━━━━━━━━━━━━\n📋 *Premium Users:*\n\n`;
    prems.forEach(([id, exp]) => {
        const u = allUsers[id] || { name: 'Unknown' };
        const daysLeft = Math.ceil((exp - Date.now()) / 86400000);
        message += `🆔 *ID:* \`${id}\`\n👤 *Name:* ${u.name}\n⏳ *Days Left:* ${daysLeft}\n━━━━━━━━━━━━━━━━━━━━\n`;
    });
    message += `\n👇 *Enter the User ID to remove premium:*`;
    
    userStates[adminId] = 'waiting_remove_id';
    bot.sendMessage(adminId, message, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doRemovePremium(adminId, userIdToRemove) {
    const targetId = parseInt(userIdToRemove);
    
    if (isNaN(targetId)) {
        bot.sendMessage(adminId, '❌ Invalid ID! Please enter a numeric User ID.', adminMenu());
        userStates[adminId] = 'admin_panel';
        return;
    }
    
    if (!premiumUsers[targetId]) {
        bot.sendMessage(adminId, `❌ User ID ${targetId} is not a premium user.`, adminMenu());
        userStates[adminId] = 'admin_panel';
        return;
    }
    
    delete premiumUsers[targetId];
    
    bot.sendMessage(adminId, `✅ Premium removed for user \`${targetId}\``, { parse_mode: 'Markdown', ...adminMenu() });
    bot.sendMessage(targetId, `⚠️ *Your premium has been removed.*\n\nContact admin if you think this is a mistake.`, mainMenu(targetId));
    
    userStates[adminId] = 'admin_panel';
}

function showBroadcastMenu(adminId) {
    userStates[adminId] = 'waiting_broadcast';
    bot.sendMessage(adminId, '📢 *BROADCAST MESSAGE*\n━━━━━━━━━━━━━━━━━━━━\n👇 Type your message to send to ALL users:', { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doBroadcast(adminId, message) {
    const userIds = Object.keys(allUsers);
    let sent = 0;
    
    userIds.forEach(uid => {
        bot.sendMessage(Number(uid), `📢 *ADMIN BROADCAST*\n━━━━━━━━━━━━━━━━━━━━\n${message}`, { parse_mode: 'Markdown' })
            .then(() => sent++)
            .catch(() => {});
    });
    
    setTimeout(() => {
        bot.sendMessage(adminId, `✅ Broadcast sent to *${sent}* out of ${userIds.length} users.`, { parse_mode: 'Markdown', ...adminMenu() });
    }, 2000);
    
    userStates[adminId] = 'admin_panel';
}

// ── Feedback Admin Functions ─────────────────────────────────────────────────────

function showAllFeedbacks(adminId) {
    const allFeedbacks = getAllFeedbacks();
    
    if (allFeedbacks.length === 0) {
        return bot.sendMessage(adminId, '💬 *No feedback received yet!*\n\nUsers can send feedback using the 💬 FEEDBACK button.', { parse_mode: 'Markdown', ...adminMenu() });
    }
    
    let message = `💬 *ALL FEEDBACKS* (${allFeedbacks.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    allFeedbacks.forEach((fb, index) => {
        const ratingStars = fb.rating ? '⭐'.repeat(fb.rating) : 'No rating';
        message += `📝 *Feedback #${fb.id}*\n`;
        message += `👤 *User:* ${fb.name} (@${fb.username})\n`;
        message += `🆔 *ID:* \`${fb.userId}\`\n`;
        message += `⭐ *Rating:* ${ratingStars}\n`;
        message += `📅 *Date:* ${fb.date}\n`;
        message += `💬 *Message:*\n${fb.message}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if ((index + 1) % 5 === 0 && index + 1 < allFeedbacks.length) {
            bot.sendMessage(adminId, message, { parse_mode: 'Markdown' });
            message = '';
        }
    });
    
    if (message) {
        bot.sendMessage(adminId, message, { parse_mode: 'Markdown' });
    }
    
    bot.sendMessage(adminId, `💡 *Total Feedbacks:* ${allFeedbacks.length}\n\nTo delete feedback, use the button below 👇`, { parse_mode: 'Markdown' });
    
    // Show delete option
    const deleteKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🗑️ DELETE SPECIFIC FEEDBACK', callback_data: 'admin_delete_feedback' }]
            ]
        }
    };
    bot.sendMessage(adminId, `🗑️ *Delete Feedback*`, deleteKeyboard);
}

function showDeleteFeedbackMenu(adminId) {
    const allFeedbacks = getAllFeedbacks();
    if (allFeedbacks.length === 0) {
        return bot.sendMessage(adminId, 'No feedback to delete.', adminMenu());
    }
    
    let message = `🗑️ *DELETE FEEDBACK*\n━━━━━━━━━━━━━━━━━━━━\nEnter the feedback ID number to delete:\n\n`;
    allFeedbacks.forEach(fb => {
        message += `📝 ID: *${fb.id}* - from ${fb.name} (${fb.date})\n`;
    });
    message += `\n👇 *Enter Feedback ID to delete:*`;
    
    userStates[adminId] = 'waiting_delete_feedback';
    bot.sendMessage(adminId, message, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doDeleteFeedback(adminId, feedbackId) {
    const id = parseInt(feedbackId);
    if (isNaN(id)) {
        bot.sendMessage(adminId, '❌ Invalid ID! Please enter a numeric Feedback ID.', adminMenu());
        userStates[adminId] = 'admin_panel';
        return;
    }
    
    if (deleteFeedback(id)) {
        bot.sendMessage(adminId, `✅ Feedback #${id} deleted successfully!`, adminMenu());
    } else {
        bot.sendMessage(adminId, `❌ Feedback #${id} not found!`, adminMenu());
    }
    
    userStates[adminId] = 'admin_panel';
}

function toggleWingoStatus(adminId) {
    WINGO_ENABLED = !WINGO_ENABLED;
    const status = WINGO_ENABLED ? 'ENABLED ✅' : 'DISABLED ❌';
    bot.sendMessage(adminId, `🎲 *WINGO BOT ${status}*`, { parse_mode: 'Markdown' });
    showAdminBanner(adminId);
    bot.sendMessage(adminId, 'Admin Panel:', adminMenu());
}

function toggleQuotexStatus(adminId) {
    QUOTEX_ENABLED = !QUOTEX_ENABLED;
    const status = QUOTEX_ENABLED ? 'ENABLED ✅' : 'DISABLED ❌';
    bot.sendMessage(adminId, `📊 *QUOTEX BOT ${status}*`, { parse_mode: 'Markdown' });
    showAdminBanner(adminId);
    bot.sendMessage(adminId, 'Admin Panel:', adminMenu());
}

function showAllUsers(adminId) {
    const users = Object.entries(allUsers);
    if (users.length === 0) return bot.sendMessage(adminId, '📭 No users yet.');
    let out = `👥 *ALL USERS* (${users.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    users.slice(0, 30).forEach(([id, u]) => {
        const plan = isPremium(Number(id)) ? '💎' : '🆓';
        out += `${plan} *${u.name}* (@${u.username})\n🆔 \`${id}\`\n📊 Wingo:${u.wingoPredictions || 0} Quotex:${u.quotexSignals || 0}\n\n`;
    });
    if (users.length > 30) out += `_... and ${users.length - 30} more_`;
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}

function showPremiumUsers(adminId) {
    const prems = Object.entries(premiumUsers);
    if (prems.length === 0) return bot.sendMessage(adminId, '📭 No premium users.');
    let out = `💎 *PREMIUM USERS* (${prems.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    prems.forEach(([id, exp]) => {
        const u = allUsers[id] || { name: 'Unknown' };
        const daysLeft = Math.ceil((exp - Date.now()) / 86400000);
        out += `💎 *${u.name}* (@${u.username || 'N/A'})\n🆔 \`${id}\`\n⏳ ${daysLeft} days left\n\n`;
    });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}

function showPendingPayments(adminId) {
    const pendings = Object.entries(pendingPayments);
    if (pendings.length === 0) return bot.sendMessage(adminId, '✅ No pending payments!');
    let out = `💰 *PENDING PAYMENTS* (${pendings.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    pendings.forEach(([id, p]) => {
        const planInfo = PLANS[p.plan] || { name: p.plan, price: '?' };
        out += `👤 *${p.name}*\n🆔 \`${id}\`\n📦 ${planInfo.name} (PKR ${planInfo.price})\n📅 ${p.date}\n\n`;
    });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}

function showBotStats(adminId) {
    const premCount = Object.keys(premiumUsers).length;
    const userCount = Object.keys(allUsers).length;
    const pendCount = Object.keys(pendingPayments).length;
    const feedbackCount = Object.keys(feedbacks).length;
    bot.sendMessage(adminId,
`📊 *BOT STATISTICS*
━━━━━━━━━━━━━━━━━━━━
👥 Total Users    : *${userCount}*
💎 Premium Users  : *${premCount}*
🆓 Free Users     : *${userCount - premCount}*
💰 Pending Pay    : *${pendCount}*
💬 Total Feedbacks: *${feedbackCount}*
━━━━━━━━━━━━━━━━━━━━
🎲 WINGO Status   : *${WINGO_ENABLED ? 'ACTIVE ✅' : 'DISABLED ❌'}*
📊 QUOTEX Status  : *${QUOTEX_ENABLED ? 'ACTIVE ✅' : 'DISABLED ❌'}*
━━━━━━━━━━━━━━━━━━━━
⏰ UTC+3 Time     : ${getFormattedUTCTime()}`,
        { parse_mode: 'Markdown' });
}

// ── Admin Panel Handler ─────────────────────────────────────────────────────────

function handleAdminCommands(userId, text) {
    if (text === '🎲 WINGO: ✅ ON' || text === '🎲 WINGO: ❌ OFF') {
        toggleWingoStatus(userId);
        return;
    }
    if (text === '📊 QUOTEX: ✅ ON' || text === '📊 QUOTEX: ❌ OFF') {
        toggleQuotexStatus(userId);
        return;
    }
    if (text === '💬 VIEW FEEDBACK') {
        showAllFeedbacks(userId);
        return;
    }
    
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
            bot.sendMessage(userId, '🚪 Admin session ended.', mainMenu(userId));
            break;
        default:
            bot.sendMessage(userId, '👇 Please use admin buttons.', adminMenu());
    }
}

// ── User Feedback Commands ──────────────────────────────────────────────────────

function cmdFeedback(msg) {
    const userId = msg.from.id;
    userStates[userId] = 'waiting_feedback_message';
    bot.sendMessage(userId,
`💬 *SEND FEEDBACK*
━━━━━━━━━━━━━━━━━━━━
We value your opinion! Please share your feedback about the bot:

• What do you like?
• What can be improved?
• Any issues you faced?
• Suggestions for new features?

👇 *Type your feedback message below:*`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function processFeedbackMessage(userId, name, username, message) {
    // Save feedback first
    const feedbackId = saveFeedback(userId, name, username, message);
    
    // Ask for rating
    userStates[userId] = `waiting_feedback_rating:${feedbackId}`;
    bot.sendMessage(userId,
`✅ *Thank you for your feedback!* (ID: #${feedbackId})
━━━━━━━━━━━━━━━━━━━━
📝 Your feedback has been recorded.

⭐ *Would you like to rate the bot?*
Select your rating below:`,
        { parse_mode: 'Markdown', ...feedbackRatingKeyboard() });
}

function processFeedbackRating(userId, ratingText, feedbackId) {
    let rating = null;
    if (ratingText.includes('1 Star')) rating = 1;
    else if (ratingText.includes('2 Stars')) rating = 2;
    else if (ratingText.includes('3 Stars')) rating = 3;
    else if (ratingText.includes('4 Stars')) rating = 4;
    else if (ratingText.includes('5 Stars')) rating = 5;
    
    if (rating && feedbacks[feedbackId]) {
        feedbacks[feedbackId].rating = rating;
        bot.sendMessage(userId,
`⭐ *Rating saved!* (${rating} Stars)
━━━━━━━━━━━━━━━━━━━━
✅ Thank you for your valuable feedback!

💡 Your feedback helps us improve the bot.
━━━━━━━━━━━━━━━━━━━━
*Admin will review your feedback soon.*`,
            { parse_mode: 'Markdown', ...mainMenu(userId) });
        
        // Notify admin about new feedback
        ADMIN_IDS.forEach(adminId => {
            bot.sendMessage(adminId,
`💬 *NEW FEEDBACK RECEIVED!*
━━━━━━━━━━━━━━━━━━━━
📝 *ID:* #${feedbackId}
👤 *User:* ${name} (@${username || 'N/A'})
🆔 *ID:* \`${userId}\`
⭐ *Rating:* ${rating} Stars
💬 *Message:* 
${feedbacks[feedbackId].message}
━━━━━━━━━━━━━━━━━━━━
Use 👑 ADMIN PANEL → 💬 VIEW FEEDBACK`,
                { parse_mode: 'Markdown' });
        });
    } else {
        bot.sendMessage(userId, `✅ Thank you for your feedback!`, { parse_mode: 'Markdown', ...mainMenu(userId) });
    }
    
    userStates[userId] = null;
}

// ── User Commands ───────────────────────────────────────────────────────────────

function cmdStart(msg) {
    const userId = msg.from.id;
    const name = msg.from.first_name || 'Trader';
    const uname = msg.from.username || 'N/A';
    const isPrem = isPremium(userId);
    
    if (!allUsers[userId]) {
        allUsers[userId] = { name, username: uname, joinDate: today(), wingoPredictions: 0, quotexSignals: 0 };
    }
    
    userStates[userId] = null;
    
    bot.sendMessage(userId,
`👋 *WELCOME TO ${BOT_NAME}, ${name}!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *UNIFIED TRADING BOT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isPrem ? '💎 *PREMIUM MEMBER* - Unlimited everything!' : `🆓 *FREE USER* - ${WINGO_FREE_LIMIT} Wingo + ${QUOTEX_FREE_LIMIT} Quotex/day`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 *SELECT A BOT BELOW:*
• 🎲 WINGO PREDICTION ${WINGO_ENABLED ? '✅' : '🚧'}
• 📊 QUOTEX SIGNALS ${QUOTEX_ENABLED ? '✅' : '🚧 (Updating)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 *Have feedback?* Use the 💬 FEEDBACK button!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Private chat only_`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}

function cmdWingoMenu(msg) {
    const userId = msg.from.id;
    if (!WINGO_ENABLED) {
        return bot.sendMessage(userId, '🚧 *WINGO PREDICTION - COMING SOON!*\n━━━━━━━━━━━━━━━━━━━━\nSystem is currently being updated.', { parse_mode: 'Markdown', ...mainMenu(userId) });
    }
    userStates[userId] = null;
    userLastAction[userId] = { botType: 'wingo' };
    bot.sendMessage(userId, '🎲 *WINGO PREDICTION MODE*\n━━━━━━━━━━━━━━━━━━━━\nSelect prediction type:', { parse_mode: 'Markdown', ...wingoMenu() });
}

async function cmdWingo30(msg) {
    const userId = msg.from.id;
    if (!WINGO_ENABLED) return bot.sendMessage(userId, '🚧 Wingo is disabled.', mainMenu(userId));
    const access = canGetWingoSignal(userId);
    if (!access.ok) return bot.sendMessage(userId, `⛔ *Daily Limit Reached!*\n\nYou've used all ${WINGO_FREE_LIMIT} free predictions.\n\n/buypremium`, { parse_mode: 'Markdown', ...mainMenu(userId) });

    // Fetch live period from API
    const apiData  = await fetchWingoPeriodFromAPI('0.5');
    const period   = apiData?.period   || getCurrentPeriod30s();
    const timeLeft = apiData?.remain   || getTimeLeft30s();

    userStates[userId] = 'wingo_30s_predict';
    userLastAction[userId] = { botType: 'wingo', type: '30s' };
    bot.sendMessage(userId,
`🎯 *30 Second WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Time left: *~${timeLeft}s*
📌 Current period: \`${period}\`
━━━━━━━━━━━━━━━━━━━━
👇 Enter period number from game
_(or just tap Send to use current period)_`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

async function cmdWingo1m(msg) {
    const userId = msg.from.id;
    if (!WINGO_ENABLED) return bot.sendMessage(userId, '🚧 Wingo is disabled.', mainMenu(userId));
    const access = canGetWingoSignal(userId);
    if (!access.ok) return bot.sendMessage(userId, `⛔ *Daily Limit Reached!*\n\nYou've used all ${WINGO_FREE_LIMIT} free predictions.\n\n/buypremium`, { parse_mode: 'Markdown', ...mainMenu(userId) });

    // Fetch live period from API
    const apiData  = await fetchWingoPeriodFromAPI('1');
    const period   = apiData?.period   || getCurrentPeriod1m();
    const timeLeft = apiData?.remain   || getTimeLeft1m();

    userStates[userId] = 'wingo_1m_predict';
    userLastAction[userId] = { botType: 'wingo', type: '1m' };
    bot.sendMessage(userId,
`🎯 *1 Minute WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Time left: *~${timeLeft}s*
📌 Current period: \`${period}\`
━━━━━━━━━━━━━━━━━━━━
👇 Enter period number from game
_(or just tap Send to use current period)_`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function handleWingoPrediction(userId, periodStr, is30s) {
    const isPrem = isPremium(userId);
    if (!isPrem) incrementWingoFree(userId);
    if (allUsers[userId]) allUsers[userId].wingoPredictions = (allUsers[userId].wingoPredictions || 0) + 1;
    
    const pred = wingoPredict(periodStr, isPrem);
    const gameMode = is30s ? '30 Sec WinGo' : '1 Min WinGo';
    const timeLeft = is30s ? getTimeLeft30s() : getTimeLeft1m();
    const remaining = isPrem ? '♾️ Unlimited' : `${WINGO_FREE_LIMIT - getWingoFreeUsed(userId)} left today`;

    // ── Save to pending checks for auto result ──
    pendingWingoChecks[userId] = {
        period:   periodStr,
        gameMode: is30s ? '30s' : '1min',
        prediction: {
            num:   pred.num,
            color: pred.color,
            size:  pred.size
        }
    };
    
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
📊 Remaining: ${remaining}
━━━━━━━━━━━━━━━━━━━━
🔔 *Result will be sent automatically!*
⏳ _You'll get WIN / LOSS / JACKPOT alert_`,
        { parse_mode: 'Markdown', ...getNextPredictionKeyboard('wingo', is30s ? '30s' : '1m') });
}

function cmdQuotexMenu(msg) {
    const userId = msg.from.id;
    if (!QUOTEX_ENABLED) {
        return bot.sendMessage(userId, '🚧 *QUOTEX SIGNALS - COMING SOON!*\n━━━━━━━━━━━━━━━━━━━━\nSystem is currently being updated.\n\n🎲 Meanwhile, try WINGO PREDICTION!', { parse_mode: 'Markdown', ...mainMenu(userId) });
    }
    userStates[userId] = null;
    userLastAction[userId] = { botType: 'quotex' };
    bot.sendMessage(userId, `📊 *QUOTEX SIGNAL MODE*\n━━━━━━━━━━━━━━━━━━━━\n⏰ Chart Time (UTC+3): ${getFormattedUTCTime()}`, { parse_mode: 'Markdown', ...mainMenu(userId) });
}

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
    bot.sendMessage(userId,
`💎 *CHOOSE YOUR PREMIUM PLAN*
━━━━━━━━━━━━━━━━━━━━
✅ Unlimited Wingo predictions
✅ Unlimited Quotex signals
✅ Higher accuracy (85%+)
✅ Priority support`,
        { parse_mode: 'Markdown', reply_markup: keyboard });
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
💰 *PRICE: PKR ${plan.price}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📲 *EasyPaisa:* \`${EASYPAISA_NUMBER}\`
📲 *JazzCash:* \`${JAZZCASH_NUMBER}\`
👤 *NAME:* ${ACCOUNT_NAME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*AFTER PAYING:*
1️⃣ Type /paid
2️⃣ Send screenshot
3️⃣ Admin will verify

Your ID: \`${userId}\``,
                { parse_mode: 'Markdown' });
        }
        bot.answerCallbackQuery(callbackQuery.id);
    }
    
    if (data === 'admin_delete_feedback' && isAdmin(userId)) {
        showDeleteFeedbackMenu(userId);
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

function cmdPaid(msg) {
    const userId = msg.from.id;
    const name = msg.from.first_name || 'User';
    const state = userStates[userId] || '';
    let planKey = null;
    
    if (state.startsWith('pending_plan:')) {
        planKey = state.split(':')[1];
    }
    
    if (!planKey || !PLANS[planKey]) {
        return bot.sendMessage(userId, '❌ *Please select a plan first!*\n\nUse /buypremium to choose your plan.', { parse_mode: 'Markdown' });
    }
    
    pendingPayments[userId] = { name, date: today(), plan: planKey, screenshot: false };
    userStates[userId] = null;
    
    bot.sendMessage(userId, `✅ *Payment notification sent for ${PLANS[planKey].name}!*\n\nSend your payment screenshot here. Admin will verify within 1-2 hours.`, { parse_mode: 'Markdown' });
    
    ADMIN_IDS.forEach(adminId => {
        bot.sendMessage(adminId, `💰 *NEW PAYMENT CLAIM!*\n━━━━━━━━━━━━━━━━━━━━\n👤 Name: ${name}\n🆔 ID: \`${userId}\`\n📦 Plan: ${PLANS[planKey].name} (PKR ${PLANS[planKey].price})\n📅 Date: ${today()}\n━━━━━━━━━━━━━━━━━━━━\nUse 👑 ADMIN PANEL → ✅ APPROVE PAYMENT`, { parse_mode: 'Markdown' });
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
${!isPrem ? '/buypremium - Upgrade now 💎' : '✅ Premium active!'}`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}

function cmdHelp(msg) {
    const userId = msg.from.id;
    bot.sendMessage(userId,
`❓ *HELP GUIDE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🎲 WINGO PREDICTION:* ${WINGO_ENABLED ? '✅ ACTIVE' : '🚧 COMING SOON'}
• Enter period number from WinGo game
• Get number, color, size prediction

*📊 QUOTEX SIGNALS:* ${QUOTEX_ENABLED ? '✅ ACTIVE' : '🚧 COMING SOON'}
• OTC & Main currency pairs
• Multiple timeframes (1m to 1h)

*💬 FEEDBACK:*
• Use 💬 FEEDBACK button
• Share your experience
• Help us improve the bot

*👑 ADMIN CONTACT:* @GojoVipAdmin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆓 FREE: Wingo(${WINGO_FREE_LIMIT}) + Quotex(${QUOTEX_FREE_LIMIT})/day
💎 PREMIUM: Unlimited + Higher accuracy
/buypremium - Upgrade now!`,
        { parse_mode: 'Markdown', ...mainMenu(userId) });
}

// ── Main Message Handler ────────────────────────────────────────────────────────

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
            bot.sendMessage(userId, '✅ *Password Correct!*\n\n🔐 Admin session active for 1 hour.', { parse_mode: 'Markdown' });
            showAdminBanner(userId);
            bot.sendMessage(userId, 'Admin Panel:', adminMenu());
        } else {
            userStates[userId] = null;
            bot.sendMessage(userId, '❌ *Wrong password!*', { parse_mode: 'Markdown', ...mainMenu(userId) });
        }
        return;
    }
    
    // Admin approval handler
    if (state === 'waiting_approve_id' && isAdmin(userId)) {
        doApprovePayment(userId, text);
        return;
    }
    
    // Admin remove handler
    if (state === 'waiting_remove_id' && isAdmin(userId)) {
        doRemovePremium(userId, text);
        return;
    }
    
    // Admin broadcast handler
    if (state === 'waiting_broadcast' && isAdmin(userId)) {
        doBroadcast(userId, text);
        return;
    }
    
    // Admin delete feedback handler
    if (state === 'waiting_delete_feedback' && isAdmin(userId)) {
        doDeleteFeedback(userId, text);
        return;
    }
    
    // Admin panel handler
    if (state === 'admin_panel' && isAdmin(userId) && isAdminVerified(userId)) {
        handleAdminCommands(userId, text);
        return;
    }
    
    // Feedback message handler
    if (state === 'waiting_feedback_message') {
        if (text.length > 500) {
            bot.sendMessage(userId, '❌ Feedback is too long! Please keep it under 500 characters.', mainMenu(userId));
            userStates[userId] = null;
            return;
        }
        processFeedbackMessage(userId, name, uname, text);
        return;
    }
    
    // Feedback rating handler
    if (state && state.startsWith('waiting_feedback_rating:')) {
        const feedbackId = parseInt(state.split(':')[1]);
        if (text.includes('Star') || text.includes('BACK')) {
            if (text === '🔙 MAIN MENU') {
                userStates[userId] = null;
                bot.sendMessage(userId, 'Main Menu:', mainMenu(userId));
                return;
            }
            processFeedbackRating(userId, text, feedbackId);
        } else {
            userStates[userId] = null;
            bot.sendMessage(userId, 'Main Menu:', mainMenu(userId));
        }
        return;
    }
    
    // Next prediction handler
    if (text === '🔄 NEXT 30 SEC PREDICTION') {
        cmdWingo30({ from: { id: userId } });
        return;
    }
    if (text === '🔄 NEXT 1 MIN PREDICTION') {
        cmdWingo1m({ from: { id: userId } });
        return;
    }
    if (text === '🔙 BACK TO WINGO MENU') {
        cmdWingoMenu({ from: { id: userId } });
        return;
    }
    
    // Main menu navigation
    if (text === '🏠 MAIN MENU' || text === '🔙 MAIN MENU') {
        userStates[userId] = null;
        bot.sendMessage(userId, 'Main Menu:', mainMenu(userId));
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
    
    // Main menu commands
    switch(text) {
        case '/start': cmdStart(msg); break;
        case '🎲 WINGO PREDICTION': cmdWingoMenu(msg); break;
        case '📊 QUOTEX SIGNALS': cmdQuotexMenu(msg); break;
        case '🎯 30 SEC PREDICT': cmdWingo30(msg); break;
        case '🎯 1 MIN PREDICT': cmdWingo1m(msg); break;
        case '💎 BUY PREMIUM': cmdBuyPremium(msg); break;
        case '📊 MY ACCOUNT': cmdMyAccount(msg); break;
        case '❓ HELP': cmdHelp(msg); break;
        case '💬 FEEDBACK': cmdFeedback(msg); break;
        case '👑 ADMIN PANEL': cmdAdminLogin(msg); break;
        case '/paid': cmdPaid(msg); break;
        default:
            if (!text.startsWith('/')) {
                bot.sendMessage(userId, 'Use the buttons below 👇', mainMenu(userId));
            }
    }
}

// ── Payment Screenshot Handler ──────────────────────────────────────────────────

bot.on('photo', (msg) => {
    if (msg.chat.type !== 'private') return;
    const userId = msg.from.id;
    const name = msg.from.first_name || 'User';
    
    if (pendingPayments[userId]) {
        pendingPayments[userId].screenshot = true;
        bot.sendMessage(userId, '✅ *Screenshot received!* Admin will verify within 1-2 hours. Thank you! 🙏', { parse_mode: 'Markdown' });
        
        ADMIN_IDS.forEach(adminId => {
            bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
            const planName = pendingPayments[userId].plan ? (PLANS[pendingPayments[userId].plan]?.name || 'Unknown') : 'Unknown';
            bot.sendMessage(adminId, `📸 *Screenshot from* ${name} \`${userId}\` (${planName})\n\nUse 👑 ADMIN PANEL → ✅ APPROVE PAYMENT`, { parse_mode: 'Markdown' });
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

console.log('🚀 UNIFIED TRADING BOT v2.4 (WITH FEEDBACK SYSTEM) is running!');
console.log(`👑 Admin IDs: ${ADMIN_IDS.join(', ')}`);
console.log(`💰 Plans: ${Object.keys(PLANS).join(', ')}`);
console.log(`🎲 WINGO: ${WINGO_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log(`📊 QUOTEX: ${QUOTEX_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log(`💬 Feedback system: ACTIVE`);
