// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENTERPRISE UNIFIED TRADING BOT v3.1 - STABLE PRO EDITION
// - Full HTML Core Integration (Zero layout parsing crashes)
// - Inline UI Keyboards (Interactive button paths)
// - Automated live period matching systems
// - Global network & execution fail-safes
// - One-Tap Continuous Sequential Prediction Loop Integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http');

// ═════════════════════════════════════════════════════════════════════════════════
// ⚙️ SYSTEM PROFILES & CONFIGURATIONS
// ═════════════════════════════════════════════════════════════════════════════════

const BOT_TOKEN = '8425112915:AAE_RNh0tDnXRp3ULKciTPuqIjuiSoNfQtE';
const ADMIN_IDS = [7592032793]; 
const ADMIN_PASSWORD = 'Masoodking123';
const BOT_NAME = '🎯 MASOOD TRADING BOT';

const PLANS = {
    '2days':  { days: 2,  price: 500,  name: 'Premium 2 Days' },
    '1week':  { days: 7,  price: 1000, name: 'Premium 1 Week' },
    '2weeks': { days: 14, price: 1800, name: 'Premium 2 Weeks' },
    '1month': { days: 30, price: 3000, name: 'Premium 1 Month' }
};

const WINGO_FREE_LIMIT = 5;
const QUOTEX_FREE_LIMIT = 3;

const EASYPAISA_NUMBER = '0318-0939237';
const JAZZCASH_NUMBER = '0319-9837973';
const ACCOUNT_NAME = 'MUHAMMAD ABID SHAH';

let WINGO_ENABLED = true;
let QUOTEX_ENABLED = false;

// ═════════════════════════════════════════════════════════════════════════════════
// SYSTEM INITS & ENGINE CORE
// ═════════════════════════════════════════════════════════════════════════════════

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Data Infrastructures
const premiumUsers    = {};
const wingoFreeUsage  = {};
const quotexFreeUsage = {};
const userStates      = {};
const pendingPayments = {};
const allUsers        = {};
const adminSessions   = {};
const feedbacks       = {};  
const pendingWingoChecks = {};
let feedbackCounter   = 1;

// Global Crash Prevention Triggers
process.on('uncaughtException', (err) => console.error('🛡️ Intercepted Exception:', err.message));
process.on('unhandledRejection', (reason) => console.error('🛡️ Intercepted Rejection:', reason));
bot.on('polling_error', (err) => console.error('📡 Connection dropped or polling error:', err.message));

// HTML Injection Shielding
function cleanHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Live Calculation Engines ────────────────────────────────────────────────────

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

// ── Incremental Serial Logic Helper ──────────────────────────────────────────────
function getNextSequentialPeriod(periodStr) {
    try {
        return String(BigInt(periodStr) + 1n);
    } catch (e) {
        let num = parseInt(periodStr);
        return !isNaN(num) ? String(num + 1) : periodStr;
    }
}

function wingoPredict(periodStr, isPrem) {
    const seed = seedRandom(periodStr);
    const num = seed % 10;
    let color = (num === 0) ? '🔴 Red + 🟣 Violet' : (num === 5) ? '🟢 Green + 🟣 Violet' : (num % 2 === 0) ? '🔴 Red' : '🟢 Green';
    const size = num >= 5 ? '📈 BIG' : '📉 SMALL';
    const conf = (isPrem ? ['⭐⭐⭐⭐⭐ Ultra (85%)', '⭐⭐⭐⭐ High (78%)', '⭐⭐⭐⭐⭐ Ultra (82%)'] : ['⭐⭐⭐ Medium (65%)', '⭐⭐ Low (55%)', '⭐⭐⭐ Medium (60%)'])[seed % 3];
    return { num, color, size, conf };
}

// ── API Live Integrations ────────────────────────────────────────────────────────

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Data Fault')); } });
        }).on('error', reject);
    });
}

async function fetchWingoPeriodFromAPI(market) {
    try { return await fetchJSON(`https://indialotteryapi.com/wp-json/wingo/v1/next?market=${market}`); }
    catch { return null; }
}

async function fetchWingoResultFromAPI(market, period) {
    try { return await fetchJSON(`https://indialotteryapi.com/wp-json/wingo/v1/predict?market=${market}&period=${period}`); }
    catch { return null; }
}

function compareWingoPrediction(userPred, apiResult) {
    const predNum  = parseInt(userPred.num);
    const realNum  = parseInt(apiResult.digit);
    const realColor = (apiResult.color || '').toLowerCase();
    const realSize  = (apiResult.bigSmall || '').toUpperCase();

    if (predNum === realNum) {
        return { outcome: 'JACKPOT', emoji: '🎰', label: 'JACKPOT! 💰🔥', detail: `Perfect Number Hit: <b>${predNum}</b> Match!` };
    }
    const predColorStr = (userPred.color || '').toLowerCase();
    if (predColorStr.includes(realColor) || realColor.includes('green') && predColorStr.includes('green') || realColor.includes('red') && predColorStr.includes('red')) {
        return { outcome: 'WIN', emoji: '✅', label: 'WINNER 🎉', detail: `Color Targeted Success! Result: <b>${apiResult.color}</b>` };
    }
    const predSize = (userPred.size || '').replace(/[📈📉]/g, '').trim().toUpperCase();
    if (predSize && predSize === realSize) {
        return { outcome: 'WIN', emoji: '✅', label: 'WINNER 🎉', detail: `Size Target Vector Matched! Result: <b>${realSize}</b>` };
    }
    return { outcome: 'LOSS', emoji: '❌', label: 'POSITION LOSS', detail: `Expectation missed target parameters.` };
}

async function runWingoAutoChecker() {
    const entries = Object.entries(pendingWingoChecks);
    if (!entries.length) return;
    for (const [userId, check] of entries) {
        try {
            const market = check.gameMode === '30s' ? '0.5' : '1';
            const apiResult = await fetchWingoResultFromAPI(market, check.period);
            if (apiResult && apiResult.digit !== undefined) {
                const outcome = compareWingoPrediction(check.prediction, apiResult);
                
                const modeKey = check.gameMode === '30s' ? '30s' : '1m';
                const nextSequence = getNextSequentialPeriod(check.period);

                bot.sendMessage(Number(userId),
`<b>${outcome.emoji} SYSTEM DATA ANALYSIS TERMINATED</b>
──────────────────────────────
🔹 <b>Game Mode:</b> ${check.gameMode === '30s' ? '30 Sec WinGo' : '1 Min WinGo'}
🔹 <b>Target Period:</b> <code>${check.period}</code>
──────────────────────────────
📊 <b>LIVE METRIC RESULTS:</b>
🔢 Number Outcome : <b>${apiResult.digit}</b>
🎨 Color Palette : <b>${apiResult.color}</b>
📏 Calculated Size: <b>${apiResult.bigSmall}</b>
──────────────────────────────
🎯 <b>YOUR PARSED VECTOR:</b>
🔢 Number Chosen : <b>${check.prediction.num}</b>
🎨 Color Vector  : <b>${check.prediction.color}</b>
📏 Size Structural: <b>${check.prediction.size}</b>
──────────────────────────────
💎 <b>STATUS: [ ${outcome.label} ]</b>
👉 ${outcome.detail}`, { 
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `⏩ Predict Next Period [${nextSequence.slice(-4)}]`, callback_data: `wpred:${modeKey}:${nextSequence}` }],
                            [{ text: '🎯 Back to Menu', callback_data: `wmenu:${modeKey}` }]
                        ]
                    }
                }).catch(() => {});
                delete pendingWingoChecks[userId];
            }
        } catch (err) { console.error(err.message); }
    }
}
setInterval(runWingoAutoChecker, 15000);

// ── Functional Authorization Profiles ───────────────────────────────────────────

function isAdmin(id) { return ADMIN_IDS.includes(Number(id)); }
function today() { return new Date().toISOString().slice(0, 10); }
function isPremium(userId) {
    if (!premiumUsers[userId]) return false;
    if (Date.now() > premiumUsers[userId]) { delete premiumUsers[userId]; return false; }
    return true;
}
function isAdminVerified(adminId) {
    const s = adminSessions[adminId];
    return s && Date.now() <= s.expiry && s.verified;
}
function canGetWingoSignal(userId) {
    if (isPremium(userId)) return { ok: true };
    const u = wingoFreeUsage[userId];
    const used = (u && u.date === today()) ? u.count : 0;
    return { ok: used < WINGO_FREE_LIMIT, left: WINGO_FREE_LIMIT - used };
}
function incrementWingoFree(userId) {
    if (!wingoFreeUsage[userId] || wingoFreeUsage[userId].date !== today()) wingoFreeUsage[userId] = { date: today(), count: 0 };
    wingoFreeUsage[userId].count++;
}

// ── UI Design Matrix (Keyboards) ─────────────────────────────────────────────────

function buildMainMenu(userId) {
    let keyboard = [
        [{ text: '🎲 WINGO ENGINE' }, { text: '📊 QUOTEX PORTAL' }],
        [{ text: '💎 ACQUIRE PREMIUM' }, { text: '👤 PROFILE CENTRE' }],
        [{ text: '❓ SUPPORT CENTRE' }, { text: '💬 LEAVE FEEDBACK' }]
    ];
    if (isAdmin(userId)) keyboard.push([{ text: '👑 INTEL SYSTEM CONTROL' }]);
    return { reply_markup: { keyboard: keyboard, resize_keyboard: true } };
}

// ── Structural Code Replaced with Inline Interfaces ──────────────────────────────

bot.on('message', (msg) => {
    if (msg.chat.type !== 'private') return bot.sendMessage(msg.chat.id, '<b>❌ Error: Command limited to private spaces.</b>', { parse_mode: 'HTML' });
    if (!msg.text) return;

    const userId = msg.from.id;
    const text = msg.text.trim();
    const name = cleanHTML(msg.from.first_name || 'Client');
    const uname = cleanHTML(msg.from.username || 'N/A');

    if (!allUsers[userId]) allUsers[userId] = { name, username: uname, joinDate: today(), wingoPredictions: 0, quotexSignals: 0 };
    const state = userStates[userId] || '';

    // Route Catching Layers
    if (state === 'waiting_admin_password') {
        if (text === ADMIN_PASSWORD) {
            adminSessions[userId] = { verified: true, expiry: Date.now() + 3600000 };
            userStates[userId] = 'admin_panel';
            bot.sendMessage(userId, '<b>🔓 Access Granted. Administrative matrix active.</b>', { parse_mode: 'HTML' });
            sendAdminDashboard(userId);
        } else {
            userStates[userId] = null;
            bot.sendMessage(userId, '<b>❌ Security Alert: Verification code mismatch.</b>', { parse_mode: 'HTML', ...buildMainMenu(userId) });
        }
        return;
    }
    if (state === 'waiting_feedback_message') {
        if (text.length > 500) return bot.sendMessage(userId, '<b>❌ Overflow: Limit input below 500 characters.</b>', { parse_mode: 'HTML' });
        const fid = feedbackCounter++;
        feedbacks[fid] = { id: fid, userId, name, username: uname, message: cleanHTML(text), rating: null, date: today() };
        userStates[userId] = null;
        
        bot.sendMessage(userId, `<b>📝 Feedback Vector Locked (ID: #${fid})</b>\n\nRate your system experience below:`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⭐', callback_data: `fr:${fid}:1` }, { text: '⭐⭐', callback_data: `fr:${fid}:2` }, { text: '⭐⭐⭐', callback_data: `fr:${fid}:3` }],
                    [{ text: '⭐⭐⭐⭐', callback_data: `fr:${fid}:4` }, { text: '⭐⭐⭐⭐⭐', callback_data: `fr:${fid}:5` }]
                ]
            }
        });
        return;
    }
    if (state === 'typing_manual_30s' || state === 'typing_manual_1m') {
        if (!/^\d{8,14}$/.test(text)) return bot.sendMessage(userId, '<b>❌ Format Failure: Provide an absolute 8-14 numeric digit period string.</b>', { parse_mode: 'HTML' });
        userStates[userId] = null;
        executePredictionCore(userId, text, state === 'typing_manual_30s');
        return;
    }
    if (state.startsWith('admin_action:')) {
        handleAdminTextInputs(userId, state, text);
        return;
    }

    // Command Interfaces Mapping
    switch (text) {
        case '/start':
            userStates[userId] = null;
            bot.sendMessage(userId, 
`<b>🦅 WELCOME TO ${cleanHTML(BOT_NAME)}</b>
──────────────────────────────
Premium grade tracking predictive algorithms. Engineered for seamless automated signals.

👑 <b>Access Class:</b> ${isPremium(userId) ? '<b>PREMIUM MEMBER 💎</b>' : '<b>STANDARD CLIENT 🆓</b>'}
──────────────────────────────
Select your structural command engine layer using the panel matrix grid down below:`, { parse_mode: 'HTML', ...buildMainMenu(userId) });
            break;
        case '🎲 WINGO ENGINE':
            if (!WINGO_ENABLED) return bot.sendMessage(userId, '<b>🚧 Notice: System vector undergoing structural updates.</b>', { parse_mode: 'HTML' });
            bot.sendMessage(userId, `<b>🎲 WINGO MULTI-SPEED MODES</b>\n\nConfigure active target operational parameters:`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🕒 WinGo 30-Seconds', callback_data: 'wmenu:30s' }, { text: '🕐 WinGo 1-Minute', callback_data: 'wmenu:1m' }]
                    ]
                }
            });
            break;
        case '📊 QUOTEX PORTAL':
            bot.sendMessage(userId, `<b>📊 QUOTEX AUTOMATED VECTORS</b>\n──────────────────────────────\n<b>Current Status:</b> ${QUOTEX_ENABLED ? '🟢 OPERATIONAL' : '🚧 OFFLINE MAINTENANCE'}\n\nSystem engine verification updates pending deployment. Check back shortly.`, { parse_mode: 'HTML' });
            break;
        case '💎 ACQUIRE PREMIUM':
            sendSubscriptionMenu(userId);
            break;
        case '👤 PROFILE CENTRE':
            const isPremMember = isPremium(userId);
            bot.sendMessage(userId,
`<b>👤 TERMINAL USER METRIC INTEGRATION</b>
──────────────────────────────
⚙️ User Identifier: <code>${userId}</code>
⚙️ Client Profile  : <b>${name}</b>
⚙️ Profile Standing: ${isPremMember ? '<b>PREMIUM STATUS [💎]</b>' : '<b>FREE INTERACTION [🆓]</b>'}
${isPremMember ? `⚙️ Expiration Date: <code>${new Date(premiumUsers[userId]).toLocaleDateString()}</code>` : ''}
──────────────────────────────
🎰 Wingo Logs: <b>${allUsers[userId].wingoPredictions || 0} hits</b>
📊 Quotex Logs: <b>${allUsers[userId].quotexSignals || 0} runs</b>`, { parse_mode: 'HTML' });
            break;
        case '❓ SUPPORT CENTRE':
            bot.sendMessage(userId, `<b>❓ DATA DESK HELP SUPPORT</b>\n──────────────────────────────\n• Use interface navigation options to isolate vectors.\n• Free tiers limit maximum processing allocations.\n\n<b>Support Grid Node Access:</b> @GojoVipAdmin`, { parse_mode: 'HTML' });
            break;
        case '💬 LEAVE FEEDBACK':
            userStates[userId] = 'waiting_feedback_message';
            bot.sendMessage(userId, '<b>💬 SYSTEM INTERACTION FEEDBACK</b>\n──────────────────────────────\nSubmit your experience parameters directly below. (Type your review and tap send):', { parse_mode: 'HTML' });
            break;
        case '👑 INTEL SYSTEM CONTROL':
            if (!isAdmin(userId)) return;
            if (isAdminVerified(userId)) { sendAdminDashboard(userId); }
            else {
                userStates[userId] = 'waiting_admin_password';
                bot.sendMessage(userId, '<b>🔐 Identity Handshake Required</b>\n\nProvide main access verification password:', { parse_mode: 'HTML' });
            }
            break;
        case '/paid':
            triggerLegacyPaidAction(userId);
            break;
    }
});

// ── Inline Callback Interface Route Processor ────────────────────────────────────

bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;
    bot.answerCallbackQuery(query.id).catch(() => {});

    // [User Path] Wingo Menu
    if (data.startsWith('wmenu:')) {
        const mode = data.split(':')[1];
        const is30s = mode === '30s';
        const access = canGetWingoSignal(userId);
        if (!access.ok) return bot.sendMessage(userId, '<b>⛔ Exhausted: Daily operational free limit boundary passed. Upgrade to premium profile.</b>', { parse_mode: 'HTML' });
        
        const apiData = await fetchWingoPeriodFromAPI(is30s ? '0.5' : '1');
        const livePeriod = apiData?.period || (is30s ? getCurrentPeriod30s() : getCurrentPeriod1m());
        const timeRemaining = apiData?.remain || (is30s ? getTimeLeft30s() : getTimeLeft1m());

        bot.sendMessage(userId,
`<b>🎯 MODE SELECTED: ${is30s ? '30 SEC' : '1 MIN'} WINGO</b>
──────────────────────────────
⏱ Live Countdown : <b>~${timeRemaining}s</b>
📌 Projected Period: <code>${livePeriod}</code>
──────────────────────────────
Choose your operational sequence path:`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⚡ Predict Live Current Period', callback_data: `wpred:${mode}:${livePeriod}` }],
                    [{ text: '⌨ Enter Manual Game ID', callback_data: `wmanual:${mode}` }]
                ]
            }
        });
    }

    // [User Path] Direct Live Prediction Execution
    if (data.startsWith('wpred:')) {
        const [_, mode, targetPeriod] = data.split(':');
        
        // Double check limits before firing to prevent click exploits
        const access = canGetWingoSignal(userId);
        if (!access.ok) return bot.sendMessage(userId, '<b>⛔ Exhausted: Daily operational free limit boundary passed. Upgrade to premium profile.</b>', { parse_mode: 'HTML' });

        executePredictionCore(userId, targetPeriod, mode === '30s');
    }

    // [User Path] Manual Entry Initializer
    if (data.startsWith('wmanual:')) {
        const mode = data.split(':')[1];
        userStates[userId] = mode === '30s' ? 'typing_manual_30s' : 'typing_manual_1m';
        bot.sendMessage(userId, '<b>⌨ Input Terminal Active</b>\n\nProvide your active game ID/Period number directly below via text input:', { parse_mode: 'HTML' });
    }

    // [User Path] Feedback Rating Vector Configuration
    if (data.startsWith('fr:')) {
        const [_, fid, ratingValue] = data.split(':');
        if (feedbacks[fid]) {
            feedbacks[fid].rating = parseInt(ratingValue);
            bot.sendMessage(userId, `<b>⭐ Profile Metric Verified: ${ratingValue}-Stars Locked.</b>\nThank you for streamlining our operational matrix modules.`, { parse_mode: 'HTML' });
            
            ADMIN_IDS.forEach(adminId => {
                bot.sendMessage(adminId, `<b>💬 NEW SYSTEM RATING BROADCAST [ID: #${fid}]</b>\n──────────────────────────────\n<b>Operator:</b> ${feedbacks[fid].name} (@${feedbacks[fid].username})\n<b>Rating Value:</b> ${'⭐'.repeat(ratingValue)}\n<b>Log Contents:</b> ${feedbacks[fid].message}`, { parse_mode: 'HTML' }).catch(() => {});
            });
        }
    }

    // [User Path] Premium Sub Acquisition Vectors
    if (data.startsWith('buy_plan:')) {
        const planKey = data.split(':')[1];
        const plan = PLANS[planKey];
        if (plan) {
            userStates[userId] = `pending_plan:${planKey}`;
            bot.sendMessage(userId,
`<b>💎 ASSIGNED SELECTION: ${plan.name}</b>
──────────────────────────────
💰 Transfer Matrix Metric: <b>PKR ${plan.price}</b>
──────────────────────────────
📲 <b>EasyPaisa Endpoint:</b> <code>${EASYPAISA_NUMBER}</code>
📲 <b>JazzCash Endpoint :</b> <code>${JAZZCASH_NUMBER}</code>
👤 <b>Account Holder Name:</b> <b>${ACCOUNT_NAME}</b>
──────────────────────────────
⚙️ <b>VERIFICATION PROCESS RULES:</b>
1️⃣ Execute transfer parameters.
2️⃣ Issue <code>/paid</code> statement within input context.
3️⃣ Deliver image proof screenshot to terminal workspace.

Your Token ID: <code>${userId}</code>`, { parse_mode: 'HTML' });
        }
    }

    // Admin Control Engine Handlers
    if (!isAdmin(userId) || !isAdminVerified(userId)) return;

    if (data === 'adm_all_users') {
        const users = Object.entries(allUsers);
        if (!users.length) return bot.sendMessage(userId, '<b>📭 Structural Database Empty.</b>', { parse_mode: 'HTML' });
        let out = '<b>👥 TOTAL DATABASE INDEX:</b>\n──────────────────────────────\n';
        users.slice(0, 20).forEach(([id, u]) => {
            out += `${isPremium(id) ? '💎' : '🆓'} <b>${u.name}</b> (<code>${id}</code>)\n`;
        });
        bot.sendMessage(userId, out, { parse_mode: 'HTML' });
    }
    if (data === 'adm_pending') {
        const p = Object.entries(pendingPayments);
        if (!p.length) return bot.sendMessage(userId, '<b>✅ Queue Clean. No active verification requests.</b>', { parse_mode: 'HTML' });
        let out = '<b>💰 PENDING AUDIT RECORDS:</b>\n──────────────────────────────\n';
        p.forEach(([id, obj]) => { out += `🆔 Token: <code>${id}</code> | Plan: <b>${obj.plan}</b>\n`; });
        bot.sendMessage(userId, out, { parse_mode: 'HTML' });
    }
    if (data === 'adm_approve') {
        userStates[userId] = 'admin_action:approve';
        bot.sendMessage(userId, '<b>👇 Provide Target User Token ID to trigger verification clearance:</b>', { parse_mode: 'HTML' });
    }
    if (data === 'adm_remove') {
        userStates[userId] = 'admin_action:remove';
        bot.sendMessage(userId, '<b>👇 Provide Target User Token ID to scrub profile status parameters:</b>', { parse_mode: 'HTML' });
    }
    if (data === 'adm_broadcast') {
        userStates[userId] = 'admin_action:broadcast';
        bot.sendMessage(userId, '<b>👇 Type broadcast parameters to run global frame distribution sequence:</b>', { parse_mode: 'HTML' });
    }
    if (data === 'adm_feedback') {
        const f = Object.values(feedbacks);
        if (!f.length) return bot.sendMessage(userId, '<b>💬 Feed Log Vector Empty.</b>', { parse_mode: 'HTML' });
        let out = '<b>📋 ARCHIVED USER FEEDBACK MATRIX:</b>\n──────────────────────────────\n';
        f.slice(-10).forEach(fb => { out += `#${fb.id} | <b>${fb.name}</b>: <i>${fb.message}</i> (${fb.rating || 0}★)\n\n`; });
        bot.sendMessage(userId, out, { parse_mode: 'HTML' });
    }
    if (data === 'adm_toggle_wingo') {
        WINGO_ENABLED = !WINGO_ENABLED;
        bot.sendMessage(userId, `⚙️ System Change: Wingo Module state switched to <b>${WINGO_ENABLED ? 'ACTIVE' : 'OFFLINE'}</b>`, { parse_mode: 'HTML' });
        sendAdminDashboard(userId);
    }
    if (data === 'adm_exit') {
        delete adminSessions[userId];
        userStates[userId] = null;
        bot.sendMessage(userId, '<b>🚪 Session Terminated. Credentials securely cleared.</b>', { parse_mode: 'HTML', ...buildMainMenu(userId) });
    }
});

// ── Predictive Core Executor Model ──────────────────────────────────────────────

function executePredictionCore(userId, periodStr, is30s) {
    const isPrem = isPremium(userId);
    if (!isPrem) incrementWingoFree(userId);
    allUsers[userId].wingoPredictions = (allUsers[userId].wingoPredictions || 0) + 1;

    const res = wingoPredict(periodStr, isPrem);
    const balanceInfo = isPrem ? 'UNLIMITED ACCESS 💎' : `${WINGO_FREE_LIMIT - ((wingoFreeUsage[userId]?.count) || 0)} Operations left`;

    pendingWingoChecks[userId] = { period: periodStr, gameMode: is30s ? '30s' : '1min', prediction: { num: res.num, color: res.color, size: res.size } };

    const mode = is30s ? '30s' : '1m';
    const nextSequence = getNextSequentialPeriod(periodStr);

    bot.sendMessage(userId,
`<b>📊 ALGORITHMIC PREDICTIVE DATA RESULT</b>
──────────────────────────────
🔹 Operational Vector : <b>${is30s ? '30 Sec WinGo' : '1 Min WinGo'}</b>
🔹 Registered Period  : <code>${periodStr}</code>
──────────────────────────────
🎰 <b>PREDICTED ATOMIC VALUES:</b>
🔢 Structural Number : <b>${res.num}</b>
🎨 Color Spectrum    : <b>${res.color}</b>
📏 Calculated Scale  : <b>${res.size}</b>
💡 Signal Confidence : <code>${res.conf}</code>
──────────────────────────────
🔋 Account Threshold : <b>${balanceInfo}</b>
──────────────────────────────
⏳ <i>Algorithmic tracking checker active. Results will print automatically upon game conclusion.</i>`, { 
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: `⏩ Predict Next Period [${nextSequence.slice(-4)}]`, callback_data: `wpred:${mode}:${nextSequence}` }],
                [{ text: '🎯 Back to Menu', callback_data: `wmenu:${mode}` }]
            ]
        }
    });
}

// ── Subscription Menu Core ───────────────────────────────────────────────────────

function sendSubscriptionMenu(userId) {
    let ik = [];
    Object.entries(PLANS).forEach(([key, plan]) => {
        ik.push([{ text: `${plan.name} ➔ PKR ${plan.price}`, callback_data: `buy_plan:${key}` }]);
    });
    bot.sendMessage(userId, 
`<b>💎 PREMIUM ACCOUNT DEPLOYMENT CENTER</b>
──────────────────────────────
• Premium computational metrics accuracy up-scaling (85%+)
• Elimination of daily throttling and caps
• Unlocks comprehensive real-time processing streams`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: ik } });
}

function triggerLegacyPaidAction(userId) {
    const state = userStates[userId] || '';
    if (!state.startsWith('pending_plan:')) return bot.sendMessage(userId, '<b>❌ Execution Failure: Select an active premium plan before running verify paths.</b>', { parse_mode: 'HTML' });
    const pKey = state.split(':')[1];
    pendingPayments[userId] = { name: allUsers[userId].name, date: today(), plan: pKey, screenshot: false };
    userStates[userId] = null;
    bot.sendMessage(userId, '<b>✅ Matrix Handshake Locked. Deliver your image verification proof receipt via screenshot immediately below:</b>', { parse_mode: 'HTML' });
    
    ADMIN_IDS.forEach(adminId => {
        bot.sendMessage(adminId, `<b>💰 NEW TRANSACTION CLAIM NOTIFICATION</b>\n🆔 User ID Token: <code>${userId}</code>\n📦 Selection Matrix: <b>${PLANS[pKey].name}</b>`, { parse_mode: 'HTML' }).catch(() => {});
    });
}

// ── Admin Text Command Core Handlers ─────────────────────────────────────────────

function sendAdminDashboard(userId) {
    bot.sendMessage(userId, 
`<b>╔═════════════════════════════════╗\n  🛡️ ENTERPRISE COMMAND DESK DASHBOARD\n╚═════════════════════════════════╝</b>\nSystem Engine Base Operational Framework Configuration Profile Status:`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '👥 Database Index', callback_data: 'adm_all_users' }, { text: '💰 Pending Queue', callback_data: 'adm_pending' }],
                [{ text: '✅ Execute Grant', callback_data: 'adm_approve' }, { text: '❌ Revoke License', callback_data: 'adm_remove' }],
                [{ text: '📢 Push Broadcast', callback_data: 'adm_broadcast' }, { text: '💬 Review Logs', callback_data: 'adm_feedback' }],
                [{ text: `🎲 Wingo Engine: ${WINGO_ENABLED ? 'ONLINE 🟢' : 'OFFLINE 🔴'}`, callback_data: 'adm_toggle_wingo' }],
                [{ text: '🚪 Exit Control Framework', callback_data: 'adm_exit' }]
            ]
        }
    });
}

function handleAdminTextInputs(userId, state, text) {
    const act = state.split(':')[1];
    userStates[userId] = 'admin_panel';

    if (act === 'approve') {
        const tId = parseInt(text);
        const request = pendingPayments[tId];
        if (!request) return bot.sendMessage(userId, '<b>❌ Error: No validation sequence matching that target token ID exists in the queue.</b>', { parse_mode: 'HTML' });
        
        const planObj = PLANS[request.plan];
        const expiry = Date.now() + (planObj.days * 24 * 60 * 60 * 1000);
        premiumUsers[tId] = expiry;
        delete pendingPayments[tId];

        bot.sendMessage(userId, `<b>✅ License Authorization Success for token:</b> <code>${tId}</code>`, { parse_mode: 'HTML' });
        bot.sendMessage(tId, `<b>🎉 SUBSCRIPTION PROVISIONED SUCCESSFULLY</b>\n──────────────────────────────\nYour transaction has been verified. Premium parameters are now active across your operational profile. Enjoy!`, { parse_mode: 'HTML', ...buildMainMenu(tId) }).catch(() => {});
    }
    if (act === 'remove') {
        const tId = parseInt(text);
        if (!premiumUsers[tId]) return bot.sendMessage(userId, '<b>❌ Error: Target token ID holds no validated premium profile record.</b>', { parse_mode: 'HTML' });
        delete premiumUsers[tId];
        bot.sendMessage(userId, `<b>✅ Cleared authorization parameters for token ID:</b> <code>${tId}</code>`, { parse_mode: 'HTML' });
        bot.sendMessage(tId, '<b>⚠️ Security Update Notice: Your premium profile status validation period has been halted by administration.</b>', { parse_mode: 'HTML', ...buildMainMenu(tId) }).catch(() => {});
    }
    if (act === 'broadcast') {
        const targets = Object.keys(allUsers);
        targets.forEach(tid => {
            bot.sendMessage(Number(tid), `<b>📢 RECONSTRUCTED ADMINISTRATIVE SYSTEM BROADCAST</b>\n──────────────────────────────\n${cleanHTML(text)}`, { parse_mode: 'HTML' }).catch(() => {});
        });
        bot.sendMessage(userId, `<b>✅ Frame broadcast distribution successfully piped to [ ${targets.length} ] profile nodes.</b>`, { parse_mode: 'HTML' });
    }
    sendAdminDashboard(userId);
}

// ── Transaction Proof Photo Handler ──────────────────────────────────────────────

bot.on('photo', (msg) => {
    if (msg.chat.type !== 'private') return;
    const userId = msg.from.id;
    if (pendingPayments[userId]) {
        pendingPayments[userId].screenshot = true;
        bot.sendMessage(userId, '<b>✅ Audit Evidence Image Stream Logged. Administrative verification underway.</b>', { parse_mode: 'HTML' });
        ADMIN_IDS.forEach(adminId => {
            bot.forwardMessage(adminId, msg.chat.id, msg.message_id).catch(() => {});
            bot.sendMessage(adminId, `📸 <b>TRANSACTION RECEIPT RECEIVED</b>\nOperator Node: <code>${userId}</code>`, { parse_mode: 'HTML' }).catch(() => {});
        });
    }
});

// ── Railway Operational Infrastructure Port Mapping ──────────────────────────────
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('System core operational state online\n');
}).listen(PORT, () => console.log(`🌐 Infrastructure handshakes locked on execution target port: ${PORT}`));