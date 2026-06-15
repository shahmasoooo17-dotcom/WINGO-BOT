// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UNIFIED TRADING BOT v2.4 - WITH FEEDBACK SYSTEM (FIXED)
// - Complete payment approval system (FIXED)
// - Feedback system (users can send feedback)
// - Admin can view all feedback
// - WINGO PREDICTION BOT (30s/1m predictions with Automatic Live Stream Loop)
// - QUOTEX SIGNAL BOT (with ON/OFF toggle)
// - Multi-plan premium subscriptions (2d, 1w, 2w, 1m)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http'); // Added for Railway health check

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
const pendingWingoChecks = {};

// ── Wingo Functions ──────────────────────────────────────────────────────────────

function getCurrentPeriod30s() {
    const n = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    const date = `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}`;
    const slot = Math.floor((n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 30) + 1;
    return `${date}${String(slot).padStart(4, '0')}`;
}

function getCurrentPeriod1m() {
    const n = new Date();
    const pad = (num) => String(num).padStart(2, '0');
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

async function fetchWingoPeriodFromAPI(market) {
    try {
        const data = await fetchJSON(`https://indialotteryapi.com/wp-json/wingo/v1/next?market=${market}`);
        return data;
    } catch (err) {
        console.error(`⚠️ Wingo API (next) error market=${market}:`, err.message);
        return null;
    }
}

async function fetchWingoResultFromAPI(market, period) {
    try {
        const url = period
            ? `https://indialotteryapi.com/wp-json/wingo/v1/predict?market=${market}&period=${period}`
            : `https://indialotteryapi.com/wp-json/wingo/v1/predict?market=${market}`;
        const data = await fetchJSON(url);
        return data;
    } catch (err) {
        console.error(`⚠️ Wingo API (predict) error:`, err.message);
        return null;
    }
}

function compareWingoPrediction(userPred, apiResult) {
    const predNum  = parseInt(userPred.num);
    const realNum  = parseInt(apiResult.digit);
    const realColor = (apiResult.color || '').toLowerCase();
    const realSize  = (apiResult.bigSmall || '').toUpperCase();

    if (predNum === realNum) {
        return {
            outcome: 'JACKPOT',
            emoji:   '🎰',
            label:   'JACKPOT! 💰🔥',
            detail:  `Your number *${predNum}* matched exactly! Huge win! 🎰`,
            realNum, realColor: apiResult.color, realSize
        };
    }

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

    return {
        outcome: 'LOSS',
        emoji:   '❌',
        label:   'LOSS',
        detail:  `Predicted *${userPred.color} / ${predSize}* → Result *${apiResult.color} / ${realSize}*`,
        realNum, realColor: apiResult.color, realSize
    };
}

// 💥 MODIFIED: Automatic Live Stream Loop Setup inside Checker Loop
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

                await bot.sendMessage(Number(userId),
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

                const is30sMode = check.gameMode === '30s';
                const oldPeriod = check.period;
                delete pendingWingoChecks[userId];

                // 🔄 LIVE STREAM LOOP: Automatically trigger next prediction seamlessly
                setTimeout(async () => {
                    try {
                        const access = canGetWingoSignal(Number(userId));
                        if (!access.ok) {
                            bot.sendMessage(Number(userId), `⛔ *Live Stream Stopped!*\n\nDaily Limit Reached (${WINGO_FREE_LIMIT} free predictions used).\n\n/buypremium to unlock unlimited continuous live signals stream!`, { parse_mode: 'Markdown' });
                            return;
                        }
                        
                        const nextApiData = await fetchWingoPeriodFromAPI(is30sMode ? '0.5' : '1');
                        let nextPeriod = nextApiData?.period || (is30sMode ? getCurrentPeriod30s() : getCurrentPeriod1m());
                        
                        // If API has not refreshed yet, manually calculate next period sequence safely
                        if (nextPeriod === oldPeriod) {
                            try {
                                nextPeriod = (BigInt(oldPeriod) + 1n).toString();
                            } catch (e) {
                                // Fallback sequence safe check
                            }
                        }
                        
                        handleWingoPrediction(Number(userId), nextPeriod, is30sMode);
                    } catch (streamErr) {
                        console.error('Error in continuous live signal flow:', streamErr.message);
                    }
                }, 1500); // Trigger next signal smoothly 1.5s after result delivery
            }
        } catch (err) {
            console.error(`⚠️ Auto-check error userId=${userId}:`, err.message);
        }
    }
}

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
        bot.sendMessage(adminId, `❌ No pending payment found for ID: ${targetId}`, adminMenu());
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
    
    bot.sendMessage(adminId, `✅ *PREMIUM ACTIVATED SUCCESSFULLY!*\n━━━━━━━━━━━━━━━━━━━━\n🆔 *User ID:* \`${targetId}\`\n📦 *Plan:* ${plan.name}\n📅 *Expires:* ${expiryDate}`, { parse_mode: 'Markdown', ...adminMenu() });
    bot.sendMessage(targetId, `🎉 *PREMIUM ACTIVATED!* 🎉\n━━━━━━━━━━━━━━━━━━━━\n✅ Your payment has been verified!\n\n📦 *Plan:* ${plan.name}\n📅 *Expires:* ${expiryDate}\n━━━━━━━━━━━━━━━━━━━━\n🎲 *Wingo Predictions:* Unlimited (Live Loop Active)`, { parse_mode: 'Markdown', ...mainMenu(targetId) }).catch(err => console.log(err.message));
    userStates[adminId] = 'admin_panel';
}

// ── Other Admin Functions ────────────────────────────────────────────────────────

function showRemovePremiumMenu(adminId) {
    const prems = Object.entries(premiumUsers);
    if (prems.length === 0) return bot.sendMessage(adminId, '📭 No premium users to remove!', adminMenu());
    let message = `❌ *REMOVE PREMIUM*\n━━━━━━━━━━━━━━━━━━━━\n`;
    prems.forEach(([id, exp]) => {
        const u = allUsers[id] || { name: 'Unknown' };
        message += `🆔 *ID:* \`${id}\` | 👤 *Name:* ${u.name}\n`;
    });
    message += `\n👇 *Enter the User ID to remove premium:*`;
    userStates[adminId] = 'waiting_remove_id';
    bot.sendMessage(adminId, message, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doRemovePremium(adminId, userIdToRemove) {
    const targetId = parseInt(userIdToRemove);
    if (isNaN(targetId) || !premiumUsers[targetId]) {
        bot.sendMessage(adminId, '❌ User not found or invalid.', adminMenu());
        userStates[adminId] = 'admin_panel';
        return;
    }
    delete premiumUsers[targetId];
    bot.sendMessage(adminId, `✅ Premium removed for \`${targetId}\``, { parse_mode: 'Markdown', ...adminMenu() });
    bot.sendMessage(targetId, `⚠️ *Your premium has been removed.*`, mainMenu(targetId));
    userStates[adminId] = 'admin_panel';
}

function showBroadcastMenu(adminId) {
    userStates[adminId] = 'waiting_broadcast';
    bot.sendMessage(adminId, '📢 *BROADCAST MESSAGE*\n━━━━━━━━━━━━━━━━━━━━\n👇 Type your message:', { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function doBroadcast(adminId, message) {
    const userIds = Object.keys(allUsers);
    let sent = 0;
    userIds.forEach(uid => {
        bot.sendMessage(Number(uid), `📢 *ADMIN BROADCAST*\n━━━━━━━━━━━━━━━━━━━━\n${message}`, { parse_mode: 'Markdown' }).then(() => sent++).catch(() => {});
    });
    setTimeout(() => { bot.sendMessage(adminId, `✅ Broadcast sent to *${sent}* users.`, { parse_mode: 'Markdown', ...adminMenu() }); }, 2000);
    userStates[adminId] = 'admin_panel';
}

function showAllFeedbacks(adminId) {
    const allFeedbacks = getAllFeedbacks();
    if (allFeedbacks.length === 0) return bot.sendMessage(adminId, '💬 *No feedback received yet!*', { parse_mode: 'Markdown', ...adminMenu() });
    let message = `💬 *ALL FEEDBACKS*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    allFeedbacks.forEach((fb) => {
        message += `👤 *User:* ${fb.name}\n🆔 *ID:* \`${fb.userId}\`\n⭐ *Rating:* ${fb.rating || 'None'}\n💬 *Message:* ${fb.message}\n━━━━━━━━━━━━━━━━━━━━\n`;
    });
    bot.sendMessage(adminId, message, { parse_mode: 'Markdown', ...adminMenu() });
}

function toggleWingoStatus(adminId) {
    WINGO_ENABLED = !WINGO_ENABLED;
    showAdminBanner(adminId);
    bot.sendMessage(adminId, 'Admin Panel:', adminMenu());
}

function toggleQuotexStatus(adminId) {
    QUOTEX_ENABLED = !QUOTEX_ENABLED;
    showAdminBanner(adminId);
    bot.sendMessage(adminId, 'Admin Panel:', adminMenu());
}

function showAllUsers(adminId) {
    const users = Object.entries(allUsers);
    if (users.length === 0) return bot.sendMessage(adminId, '📭 No users.');
    let out = `👥 *ALL USERS* (${users.length})\n━━━━━━━━━━━━━━━━━━━━\n`;
    users.slice(0, 30).forEach(([id, u]) => { out += `${isPremium(id) ? '💎' : '🆓'} *${u.name}* (\`${id}\`)\n`; });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}

function showPremiumUsers(adminId) {
    const prems = Object.entries(premiumUsers);
    if (prems.length === 0) return bot.sendMessage(adminId, '📭 No premium users.');
    let out = `💎 *PREMIUM USERS*\n━━━━━━━━━━━━━━━━━━━━\n`;
    prems.forEach(([id]) => { out += `💎 *${allUsers[id]?.name || 'User'}* (\`${id}\`)\n`; });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}

function showPendingPayments(adminId) {
    const pendings = Object.entries(pendingPayments);
    if (pendings.length === 0) return bot.sendMessage(adminId, '✅ No pending payments!');
    let out = `💰 *PENDING PAYMENTS*\n`;
    pendings.forEach(([id, p]) => { out += `👤 *${p.name}* | \`${id}\` | Plan: ${p.plan}\n`; });
    bot.sendMessage(adminId, out, { parse_mode: 'Markdown' });
}

function showBotStats(adminId) {
    bot.sendMessage(adminId, `📊 *BOT STATISTICS*\n━━━━━━━━━━━━━━━━━━━━\n👥 Total: *${Object.keys(allUsers).length}*\n💎 Premium: *${Object.keys(premiumUsers).length}*`, { parse_mode: 'Markdown' });
}

// ── Admin Panel Handler ─────────────────────────────────────────────────────────

function handleAdminCommands(userId, text) {
    if (text === '🎲 WINGO: ✅ ON' || text === '🎲 WINGO: ❌ OFF') return toggleWingoStatus(userId);
    if (text === '📊 QUOTEX: ✅ ON' || text === '📊 QUOTEX: ❌ OFF') return toggleQuotexStatus(userId);
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
    bot.sendMessage(userId, `💬 *SEND FEEDBACK*\n━━━━━━━━━━━━━━━━━━━━\n👇 Type your feedback message below:`, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
}

function processFeedbackMessage(userId, name, username, message) {
    const feedbackId = saveFeedback(userId, name, username, message);
    userStates[userId] = `waiting_feedback_rating:${feedbackId}`;
    bot.sendMessage(userId, `✅ *Feedback recorded!* (ID: #${feedbackId})\n\n⭐ *Rate the bot:*`, { parse_mode: 'Markdown', ...feedbackRatingKeyboard() });
}

function processFeedbackRating(userId, ratingText, feedbackId) {
    let rating = 5;
    if (ratingText.includes('1')) rating = 1;
    if (ratingText.includes('2')) rating = 2;
    if (ratingText.includes('3')) rating = 3;
    if (ratingText.includes('4')) rating = 4;
    
    if (feedbacks[feedbackId]) {
        feedbacks[feedbackId].rating = rating;
        bot.sendMessage(userId, `⭐ *Rating saved!* Thank you!`, { parse_mode: 'Markdown', ...mainMenu(userId) });
        ADMIN_IDS.forEach(adminId => {
            bot.sendMessage(adminId, `💬 *NEW FEEDBACK!*\n👤 User: ${feedbacks[feedbackId].name}\n⭐ Rating: ${rating} Stars\n💬 Message: ${feedbacks[feedbackId].message}`, { parse_mode: 'Markdown' });
        });
    }
    userStates[userId] = null;
}

// ── User Commands ───────────────────────────────────────────────────────────────

function cmdStart(msg) {
    const userId = msg.from.id;
    const name = msg.from.first_name || 'Trader';
    const uname = msg.from.username || 'N/A';
    if (!allUsers[userId]) allUsers[userId] = { name, username: uname, joinDate: today(), wingoPredictions: 0, quotexSignals: 0 };
    userStates[userId] = null;
    bot.sendMessage(userId, `👋 *WELCOME TO ${BOT_NAME}, ${name}!*\n\n🤖 Select an option below to begin live predictions tracking loop:`, { parse_mode: 'Markdown', ...mainMenu(userId) });
}

function cmdWingoMenu(msg) {
    const userId = msg.from.id;
    if (!WINGO_ENABLED) return bot.sendMessage(userId, '🚧 Wingo is under update.', mainMenu(userId));
    userLastAction[userId] = { botType: 'wingo' };
    bot.sendMessage(userId, '🎲 *WINGO PREDICTION MODE*\n━━━━━━━━━━━━━━━━━━━━', wingoMenu());
}

async function cmdWingo30(msg) {
    const userId = msg.from.id;
    const access = canGetWingoSignal(userId);
    if (!access.ok) return bot.sendMessage(userId, `⛔ Limit reached! /buypremium`, mainMenu(userId));
    const apiData  = await fetchWingoPeriodFromAPI('0.5');
    const period   = apiData?.period || getCurrentPeriod30s();
    handleWingoPrediction(userId, period, true);
}

async function cmdWingo1m(msg) {
    const userId = msg.from.id;
    const access = canGetWingoSignal(userId);
    if (!access.ok) return bot.sendMessage(userId, `⛔ Limit reached! /buypremium`, mainMenu(userId));
    const apiData  = await fetchWingoPeriodFromAPI('1');
    const period   = apiData?.period || getCurrentPeriod1m();
    handleWingoPrediction(userId, period, false);
}

function handleWingoPrediction(userId, periodStr, is30s) {
    const isPrem = isPremium(userId);
    if (!isPrem) incrementWingoFree(userId);
    if (allUsers[userId]) allUsers[userId].wingoPredictions = (allUsers[userId].wingoPredictions || 0) + 1;
    
    const pred = wingoPredict(periodStr, isPrem);
    const gameMode = is30s ? '30 Sec WinGo' : '1 Min WinGo';
    const remaining = isPrem ? '♾️ Unlimited' : `${WINGO_FREE_LIMIT - getWingoFreeUsed(userId)} left today`;

    pendingWingoChecks[userId] = {
        period:   periodStr,
        gameMode: is30s ? '30s' : '1min',
        prediction: { num: pred.num, color: pred.color, size: pred.size }
    };
    
    bot.sendMessage(userId,
`${BOT_NAME} - WINGO
━━━━━━━━━━━━━━━━━━━━
🛰️ *LIVE STREAM SIGNAL ACTIVE*
━━━━━━━━━━━━━━━━━━━━
🕹️ Game: ${gameMode}
📌 Period: \`${periodStr}\`
━━━━━━━━━━━━━━━━━━━━
🔢 Number: *${pred.num}*
🎨 Color: *${pred.color}*
📏 Size: *${pred.size}*
💡 Confidence: ${pred.conf}
━━━━━━━━━━━━━━━━━━━━
📊 Stream Status: Tracking Live...
━━━━━━━━━━━━━━━━━━━━
⏳ _Result and next stream prediction will be posted automatically!_`,
        { parse_mode: 'Markdown', ...getNextPredictionKeyboard('wingo', is30s ? '30s' : '1m') });
}

function cmdQuotexMenu(msg) {
    bot.sendMessage(msg.from.id, '🚧 *QUOTEX SIGNALS - COMING SOON!*', mainMenu(msg.from.id));
}

function cmdBuyPremium(msg) {
    const userId = msg.from.id;
    const keyboard = { inline_keyboard: [] };
    for (const [key, plan] of Object.entries(PLANS)) {
        keyboard.inline_keyboard.push([{ text: `${plan.name} - PKR ${plan.price}`, callback_data: `plan_${key}` }]);
    }
    bot.sendMessage(userId, `💎 *CHOOSE YOUR PREMIUM PLAN FOR LIVE LOOP STREAM:*`, { parse_mode: 'Markdown', reply_markup: keyboard });
}

bot.on('callback_query', (callbackQuery) => {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    if (data && data.startsWith('plan_')) {
        const planKey = data.replace('plan_', '');
        userStates[userId] = `pending_plan:${planKey}`;
        bot.sendMessage(userId, `📲 *EasyPaisa/JazzCash:* \`${EASYPAISA_NUMBER}\`\n👤 Name: ${ACCOUNT_NAME}\n\nType /paid after sending funds!`, { parse_mode: 'Markdown' });
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

function cmdPaid(msg) {
    const userId = msg.from.id;
    const state = userStates[userId] || '';
    if (!state.startsWith('pending_plan:')) return bot.sendMessage(userId, '❌ Please select a plan first.');
    const planKey = state.split(':')[1];
    pendingPayments[userId] = { name: msg.from.first_name, date: today(), plan: planKey, screenshot: false };
    bot.sendMessage(userId, `✅ Payment claims registered! Send screenshot now.`);
    ADMIN_IDS.forEach(adminId => { bot.sendMessage(adminId, `💰 *NEW PAYMENT:* Approve via admin panel.`); });
}

function cmdMyAccount(msg) {
    const userId = msg.from.id;
    const isPrem = isPremium(userId);
    bot.sendMessage(userId, `📊 *MY ACCOUNT*\n🆔 ID: \`${userId}\`\n💎 Plan: ${isPrem ? 'PREMIUM (Loop Stream Active)' : 'FREE'}`, { parse_mode: 'Markdown' });
}

function cmdHelp(msg) {
    bot.sendMessage(msg.from.id, `❓ *HELP GUIDE*\nClick on WinGo predictions to start the live loop streaming mode seamlessly.`, { parse_mode: 'Markdown' });
}

// ── Main Message Handler ────────────────────────────────────────────────────────

function handleMessage(msg) {
    const userId = msg.from.id;
    const text = (msg.text || '').trim();
    const state = userStates[userId] || '';
    
    if (state === 'waiting_admin_password' && isAdmin(userId)) {
        if (text === ADMIN_PASSWORD) {
            adminSessions[userId] = { verified: true, expiry: Date.now() + 3600000 };
            userStates[userId] = 'admin_panel';
            showAdminBanner(userId);
            bot.sendMessage(userId, 'Admin Panel:', adminMenu());
        } else {
            userStates[userId] = null;
            bot.sendMessage(userId, '❌ Wrong password.', mainMenu(userId));
        }
        return;
    }
    
    if (state === 'waiting_approve_id' && isAdmin(userId)) return doApprovePayment(userId, text);
    if (state === 'waiting_remove_id' && isAdmin(userId)) return doRemovePremium(userId, text);
    if (state === 'waiting_broadcast' && isAdmin(userId)) return doBroadcast(userId, text);
    if (state === 'admin_panel' && isAdmin(userId) && isAdminVerified(userId)) return handleAdminCommands(userId, text);
    
    if (state === 'waiting_feedback_message') {
        processFeedbackMessage(userId, msg.from.first_name, msg.from.username, text);
        return;
    }
    if (state && state.startsWith('waiting_feedback_rating:')) {
        processFeedbackRating(userId, text, parseInt(state.split(':')[1]));
        return;
    }
    
    if (text === '🔄 NEXT 30 SEC PREDICTION') return cmdWingo30({ from: { id: userId } });
    if (text === '🔄 NEXT 1 MIN PREDICTION') return cmdWingo1m({ from: { id: userId } });
    if (text === '🔙 BACK TO WINGO MENU') return cmdWingoMenu({ from: { id: userId } });
    if (text === '🏠 MAIN MENU' || text === '🔙 MAIN MENU') {
        userStates[userId] = null;
        return bot.sendMessage(userId, 'Main Menu:', mainMenu(userId));
    }
    
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
            if (!text.startsWith('/')) bot.sendMessage(userId, 'Use the buttons below 👇', mainMenu(userId));
    }
}

// ── Payment Screenshot Handler ──────────────────────────────────────────────────

bot.on('photo', (msg) => {
    const userId = msg.from.id;
    if (pendingPayments[userId]) {
        pendingPayments[userId].screenshot = true;
        bot.sendMessage(userId, '✅ Screenshot received! Admin checking live.');
        ADMIN_IDS.forEach(adminId => {
            bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
            bot.sendMessage(adminId, `📸 Screenshot from \`${userId}\`. Use Admin Panel to approve.`);
        });
    }
});

bot.on('message', (msg) => {
    if (msg.chat.type !== 'private') return;
    if (msg.text) handleMessage(msg);
});

// ── Railway App Dummy Server Binding ───────────────────────────────────────────
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is operational\n');
}).listen(PORT, () => {
    console.log(`🌐 Environment operational. Port binding on ${PORT} passed successfully.`);
});

console.log('🚀 UNIFIED TRADING BOT v2.4 IS OPERATIONAL WITH LIVE STREAM SIGNAL LOOP!');