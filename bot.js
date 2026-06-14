// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WINGO PRIVATE PREDICTION BOT v2.1
// - Multiple premium plans (2d, 1w, 2w, 1m)
// - Admin panel with plan approval
// - Help includes admin contact @GojoVipAdmin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TelegramBot = require('node-telegram-bot-api');

// ════════════════════════════════
// ⚙️  YOUR SETTINGS
// ════════════════════════════════

const BOT_TOKEN  = '8425112915:AAE_RNh0tDnXRp3ULKciTPuqIjuiSoNfQtE';
const ADMIN_IDS  = [7592032793];        // Your Telegram numeric ID

// 🔐 Admin Panel Password
const ADMIN_PASSWORD = 'Masoodking123';

// Payment Details
const EASYPAISA_NUMBER = '0318-0939237';
const JAZZCASH_NUMBER  = '0319-9837973';
const ACCOUNT_NAME     = 'MUHAMMAD ABID SHAH';

// 🆕 MULTIPLE PREMIUM PLANS (edit prices below)
const PLANS = {
  '2days':  { days: 2,  price: 500,  name: '2 Days Subscription' },
  '1week':  { days: 7,  price: 1000, name: '1 Week Subscription' },
  '2weeks': { days: 14, price: 1800, name: '2 Weeks Subscription' },
  '1month': { days: 30, price: 3000, name: '1 Month Premium Subscription' }
};

// Free daily limit
const FREE_DAILY_LIMIT = 8;

// Bot Name
const BOT_NAME = '🎯 MASOOD KING BOT';

// ════════════════════════════════
// DO NOT CHANGE BELOW (unless you know what you're doing)
// ════════════════════════════════

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Storage ────────────────────────────────
const premiumUsers    = {};  // { userId: expiryTimestamp }
const freeUsage       = {};  // { userId: { date, count } }
const userStates      = {};  // { userId: state_string }
const pendingPayments = {};  // { userId: { name, date, plan, screenshot } }
const allUsers        = {};  // { userId: { name, username, joinDate } }
const adminSessions   = {};  // { adminId: { verified: bool, expiry: timestamp } }

// ── Helpers ────────────────────────────────

function isAdmin(id)    { return ADMIN_IDS.includes(id); }
function today()        { return new Date().toISOString().slice(0,10); }
function nowTime()      { return new Date().toLocaleString(); }

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

function getFreeUsed(userId) {
  const u = freeUsage[userId];
  if (!u || u.date !== today()) return 0;
  return u.count;
}

function incrementFree(userId) {
  if (!freeUsage[userId] || freeUsage[userId].date !== today()) {
    freeUsage[userId] = { date: today(), count: 0 };
  }
  freeUsage[userId].count++;
}

function canPredict(userId) {
  if (isPremium(userId)) return { ok: true };
  const used = getFreeUsed(userId);
  if (used < FREE_DAILY_LIMIT) return { ok: true, left: FREE_DAILY_LIMIT - used };
  return { ok: false };
}

function pad(n) { return String(n).padStart(2,'0'); }

function getCurrentPeriod30s() {
  const n    = new Date();
  const date = `${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}`;
  const slot = Math.floor((n.getHours()*3600 + n.getMinutes()*60 + n.getSeconds()) / 30) + 1;
  return `${date}${String(slot).padStart(4,'0')}`;
}

function getCurrentPeriod1m() {
  const n    = new Date();
  const date = `${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}`;
  const slot = n.getHours()*60 + n.getMinutes() + 1;
  return `${date}${String(slot).padStart(4,'0')}`;
}

function getTimeLeft30s() { return 30 - (new Date().getSeconds() % 30); }
function getTimeLeft1m()  { return 60 -  new Date().getSeconds(); }

function seedRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  return Math.abs(h);
}

function predict(periodStr, isPrem) {
  const seed = seedRandom(periodStr);
  const num  = seed % 10;
  let color;
  if (num === 0)           color = '🔴 Red + 🟣 Violet';
  else if (num === 5)      color = '🟢 Green + 🟣 Violet';
  else if (num % 2 === 0)  color = '🔴 Red';
  else                     color = '🟢 Green';
  const size      = num >= 5 ? '📈 BIG' : '📉 SMALL';
  const freeConfs = ['⭐⭐⭐ Medium (65%)','⭐⭐ Low (55%)','⭐⭐⭐ Medium (60%)'];
  const premConfs = ['⭐⭐⭐⭐⭐ Ultra (85%)','⭐⭐⭐⭐ High (78%)','⭐⭐⭐⭐⭐ Ultra (82%)'];
  const conf      = (isPrem ? premConfs : freeConfs)[seed % 3];
  return { num, color, size, conf };
}

// ── Keyboards ──────────────────────────────

function mainMenu(userId) {
  return {
    reply_markup: {
      keyboard: [
        ['🎯 Predict 30 Sec', '🎯 Predict 1 Min'],
        ['💎 Buy Premium',    '📊 My Account'   ],
        ['❓ Help'                               ]
      ],
      resize_keyboard: true
    }
  };
}

function adminMenu() {
  return {
    reply_markup: {
      keyboard: [
        ['👥 All Users',      '💎 Premium Users' ],
        ['💰 Pending Payments','✅ Approve Payment'],
        ['❌ Remove Premium', '📢 Broadcast'      ],
        ['📊 Bot Stats',      '🚪 Exit Admin'     ]
      ],
      resize_keyboard: true
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOCK GROUPS & CHANNELS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.on('message', (msg) => {
  if (msg.chat.type !== 'private') {
    bot.sendMessage(msg.chat.id,
      '❌ This bot only works in private chat!\nOpen bot directly: @YourBotUsername'
    );
    return;
  }
  handleMessage(msg);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleMessage(msg) {
  const userId = msg.from.id;
  const name   = msg.from.first_name || 'User';
  const uname  = msg.from.username   || 'N/A';
  const text   = (msg.text || '').trim();

  // Register user
  if (!allUsers[userId]) {
    allUsers[userId] = { name, username: uname, joinDate: today(), predictions: 0 };
  }

  const state = userStates[userId] || '';

  // ── Admin password input ──
  if (state === 'waiting_admin_password') {
    if (text === ADMIN_PASSWORD) {
      adminSessions[userId] = { verified: true, expiry: Date.now() + 3600000 }; // 1 hour
      userStates[userId]    = 'admin_panel';
      return bot.sendMessage(userId,
        `✅ *Password Correct!*\n\n🔐 Admin session active for *1 hour*`,
        { parse_mode: 'Markdown', ...adminMenu() }
      ).then(() => showAdminBanner(userId));
    } else {
      userStates[userId] = null;
      return bot.sendMessage(userId,
        '❌ *Wrong password!*\n\nAccess denied.',
        { parse_mode: 'Markdown', ...mainMenu(userId) }
      );
    }
  }

  // ── Admin panel in session ──
  if (state === 'admin_panel' && isAdmin(userId) && isAdminVerified(userId)) {
    return handleAdminPanel(msg, text);
  }

  // ── Waiting for broadcast message ──
  if (state === 'waiting_broadcast' && isAdmin(userId) && isAdminVerified(userId)) {
    return doBroadcast(userId, text);
  }

  // ── Waiting for approve ID ──
  if (state === 'waiting_approve_id' && isAdmin(userId) && isAdminVerified(userId)) {
    return doApprovePayment(userId, text);
  }

  // ── Waiting for remove ID ──
  if (state === 'waiting_remove_id' && isAdmin(userId) && isAdminVerified(userId)) {
    return doRemovePremium(userId, text);
  }

  // ── Period number input ──
  if ((state === 'predict_30s' || state === 'predict_1m') && /^\d{8,14}$/.test(text)) {
    return handlePeriodInput(msg, text, state);
  }

  // ── Normal commands ──
  switch (true) {
    case /\/start/.test(text):              return cmdStart(msg);
    case /\/admin/.test(text):              return cmdAdminLogin(msg);
    case /\/help/.test(text):
    case /❓ Help/.test(text):              return cmdHelp(msg);
    case /🎯 Predict 30/.test(text):
    case /\/predict30/.test(text):          return cmdPredict30(msg);
    case /🎯 Predict 1/.test(text):
    case /\/predict1m/.test(text):          return cmdPredict1m(msg);
    case /💎 Buy Premium/.test(text):
    case /\/buypremium/.test(text):         return cmdBuyPremium(msg);
    case /📊 My Account/.test(text):
    case /\/myaccount/.test(text):          return cmdMyAccount(msg);
    case /\/paid/.test(text):               return cmdPaid(msg);
    case /🚪 Exit Admin/.test(text):        return exitAdmin(msg);
    default: break;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN LOGIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cmdAdminLogin(msg) {
  const userId = msg.from.id;
  if (!isAdmin(userId)) {
    return bot.sendMessage(userId, '❌ You are not an admin.');
  }
  if (isAdminVerified(userId)) {
    userStates[userId] = 'admin_panel';
    return showAdminBanner(userId).then(() => {
      bot.sendMessage(userId, '✅ Already logged in!', adminMenu());
    });
  }
  userStates[userId] = 'waiting_admin_password';
  bot.sendMessage(userId,
    `🔐 *Admin Login*\n━━━━━━━━━━━━━━━━━━━━\nEnter your admin password:`,
    { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
  );
}

function showAdminBanner(userId) {
  const premCount  = Object.keys(premiumUsers).length;
  const userCount  = Object.keys(allUsers).length;
  const pendCount  = Object.keys(pendingPayments).length;

  return bot.sendMessage(userId,
`╔══════════════════════╗
║   🛡️  ADMIN PANEL   ║
║   ${BOT_NAME}
╠══════════════════════╣
║ 👥 Total Users  : ${String(userCount).padEnd(5)}║
║ 💎 Premium      : ${String(premCount).padEnd(5)}║
║ 💰 Pending Pay  : ${String(pendCount).padEnd(5)}║
║ 📅 Date         : ${today()} ║
╚══════════════════════╝
Select an option below 👇`,
    adminMenu()
  );
}

function exitAdmin(msg) {
  const userId = msg.from.id;
  delete adminSessions[userId];
  userStates[userId] = null;
  bot.sendMessage(userId,
    '🚪 *Admin session ended.*\nYou are now in user mode.',
    { parse_mode: 'Markdown', ...mainMenu(userId) }
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN PANEL ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleAdminPanel(msg, text) {
  const userId = msg.from.id;

  switch (true) {

    // ── All Users ──
    case /👥 All Users/.test(text): {
      const entries = Object.entries(allUsers);
      if (entries.length === 0) return bot.sendMessage(userId, '📭 No users yet.');
      let out = `👥 *All Users (${entries.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
      entries.slice(0, 30).forEach(([id, u]) => {
        const plan = isPremium(Number(id)) ? '💎' : '🆓';
        out += `${plan} *${u.name}* (@${u.username})\n🆔 \`${id}\` | 📅 ${u.joinDate}\n\n`;
      });
      if (entries.length > 30) out += `_... and ${entries.length - 30} more_`;
      return bot.sendMessage(userId, out, { parse_mode: 'Markdown' });
    }

    // ── Premium Users ──
    case /💎 Premium Users/.test(text): {
      const entries = Object.entries(premiumUsers);
      if (entries.length === 0) return bot.sendMessage(userId, '📭 No premium users yet.');
      let out = `💎 *Premium Users (${entries.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
      entries.forEach(([id, exp]) => {
        const u        = allUsers[id] || { name: 'Unknown', username: 'N/A' };
        const expDate  = new Date(exp).toLocaleDateString();
        const daysLeft = Math.ceil((exp - Date.now()) / 86400000);
        out += `💎 *${u.name}* (@${u.username})\n🆔 \`${id}\` | ⏳ ${daysLeft} days left (${expDate})\n\n`;
      });
      return bot.sendMessage(userId, out, { parse_mode: 'Markdown' });
    }

    // ── Pending Payments (with plan details) ──
    case /💰 Pending Payments/.test(text): {
      const entries = Object.entries(pendingPayments);
      if (entries.length === 0) return bot.sendMessage(userId, '✅ No pending payments!');
      let out = `💰 *Pending Payments (${entries.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
      entries.forEach(([id, p]) => {
        const planInfo = PLANS[p.plan] || { name: p.plan, price: '?' };
        out += `👤 *${p.name}* (${planInfo.name} - PKR ${planInfo.price})\n🆔 \`${id}\` | 📅 ${p.date}\nStatus: ⏳ Waiting\n\n`;
      });
      out += `\nTo approve: tap ✅ Approve Payment`;
      return bot.sendMessage(userId, out, { parse_mode: 'Markdown' });
    }

    // ── Approve Payment ──
    case /✅ Approve Payment/.test(text): {
      const entries = Object.entries(pendingPayments);
      if (entries.length === 0) return bot.sendMessage(userId, '✅ No pending payments to approve!');
      userStates[userId] = 'waiting_approve_id';
      let out = `✅ *Approve Payment*\n━━━━━━━━━━━━━━━━━━━━\nPending users:\n\n`;
      entries.forEach(([id, p]) => {
        const planInfo = PLANS[p.plan] || { name: p.plan };
        out += `🆔 \`${id}\` — ${p.name} (${planInfo.name})\n`;
      });
      out += `\n👇 *Enter User ID to approve:*`;
      return bot.sendMessage(userId, out, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
    }

    // ── Remove Premium ──
    case /❌ Remove Premium/.test(text): {
      const entries = Object.entries(premiumUsers);
      if (entries.length === 0) return bot.sendMessage(userId, '📭 No premium users.');
      userStates[userId] = 'waiting_remove_id';
      let out = `❌ *Remove Premium*\n━━━━━━━━━━━━━━━━━━━━\nPremium users:\n\n`;
      entries.forEach(([id]) => {
        const u = allUsers[id] || { name: 'Unknown' };
        out += `🆔 \`${id}\` — ${u.name}\n`;
      });
      out += `\n👇 *Enter User ID to remove:*`;
      return bot.sendMessage(userId, out, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
    }

    // ── Broadcast ──
    case /📢 Broadcast/.test(text): {
      userStates[userId] = 'waiting_broadcast';
      return bot.sendMessage(userId,
        `📢 *Broadcast Message*\n━━━━━━━━━━━━━━━━━━━━\n👇 Type your message to send to ALL users:`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
      );
    }

    // ── Stats ──
    case /📊 Bot Stats/.test(text): {
      const premCount = Object.keys(premiumUsers).length;
      const userCount = Object.keys(allUsers).length;
      const pendCount = Object.keys(pendingPayments).length;
      return bot.sendMessage(userId,
`📊 *Bot Statistics*
━━━━━━━━━━━━━━━━━━━━
👥 Total Users    : *${userCount}*
💎 Premium Users  : *${premCount}*
🆓 Free Users     : *${userCount - premCount}*
💰 Pending Pay    : *${pendCount}*
━━━━━━━━━━━━━━━━━━━━
📅 Date: ${nowTime()}`,
        { parse_mode: 'Markdown' }
      );
    }

    case /🚪 Exit Admin/.test(text):
      return exitAdmin(msg);

    default:
      return bot.sendMessage(userId, '👇 Please use the admin buttons below.', adminMenu());
  }
}

// ── Approve payment action (uses stored plan) ──
function doApprovePayment(adminId, text) {
  const targetId = parseInt(text.trim());
  if (isNaN(targetId)) {
    userStates[adminId] = 'admin_panel';
    return bot.sendMessage(adminId, '❌ Invalid ID. Please enter numbers only.', adminMenu());
  }
  const pending = pendingPayments[targetId];
  if (!pending) {
    userStates[adminId] = 'admin_panel';
    return bot.sendMessage(adminId, `❌ No pending payment found for ID ${targetId}.`, adminMenu());
  }

  const planKey = pending.plan;
  const plan = PLANS[planKey];
  if (!plan) {
    // fallback to old default (but shouldn't happen)
    premiumUsers[targetId] = Date.now() + 200 * 86400000;
  } else {
    premiumUsers[targetId] = Date.now() + plan.days * 86400000;
  }

  delete pendingPayments[targetId];
  userStates[adminId] = 'admin_panel';
  const expiry = new Date(premiumUsers[targetId]).toLocaleDateString();

  bot.sendMessage(adminId,
    `✅ *Premium Activated!*\n🆔 User: \`${targetId}\`\n📅 Expires: ${expiry}\n📦 Plan: ${plan.name}`,
    { parse_mode: 'Markdown', ...adminMenu() }
  );
  bot.sendMessage(targetId,
    `🎉 *Premium Activated!*\n\n💎 Your payment has been verified!\nPlan: *${plan.name}*\nExpires: *${expiry}*\n\n✅ You now have unlimited predictions!\nThank you! 🙏`,
    { parse_mode: 'Markdown', ...mainMenu(targetId) }
  ).catch(() => {});
}

// ── Remove premium action ──
function doRemovePremium(adminId, text) {
  const targetId = parseInt(text.trim());
  if (isNaN(targetId)) {
    userStates[adminId] = 'admin_panel';
    return bot.sendMessage(adminId, '❌ Invalid ID.', adminMenu());
  }
  delete premiumUsers[targetId];
  userStates[adminId] = 'admin_panel';
  bot.sendMessage(adminId,
    `✅ Premium removed for \`${targetId}\``,
    { parse_mode: 'Markdown', ...adminMenu() }
  );
  bot.sendMessage(targetId,
    `⚠️ Your premium plan has been removed.\n\nContact admin if you think this is a mistake.`,
    mainMenu(targetId)
  ).catch(() => {});
}

// ── Broadcast action ──
function doBroadcast(adminId, text) {
  userStates[adminId] = 'admin_panel';
  const userIds = Object.keys(allUsers);
  let sent = 0;
  userIds.forEach(uid => {
    bot.sendMessage(Number(uid),
      `📢 *Message from Admin*\n━━━━━━━━━━━━━━━━━━━━\n${text}`,
      { parse_mode: 'Markdown' }
    ).then(() => sent++).catch(() => {});
  });
  setTimeout(() => {
    bot.sendMessage(adminId,
      `✅ Broadcast sent to *${sent}* users.`,
      { parse_mode: 'Markdown', ...adminMenu() }
    );
  }, 3000);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER COMMANDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cmdStart(msg) {
  const userId = msg.from.id;
  const name   = msg.from.first_name || 'Friend';
  const prem   = isPremium(userId);
  bot.sendMessage(userId,
`👋 *Welcome, ${name}!*
━━━━━━━━━━━━━━━━━━━━
${BOT_NAME}

${prem
  ? '💎 You are a *PREMIUM* member!'
  : `🆓 Free Plan — *${FREE_DAILY_LIMIT - getFreeUsed(userId)}* predictions left today`}
━━━━━━━━━━━━━━━━━━━━
📲 *How to use:*
1️⃣ Tap Predict button below
2️⃣ Enter period number from game
3️⃣ Get your prediction instantly!
━━━━━━━━━━━━━━━━━━━━
_Private chat only — no groups/channels_`,
    { parse_mode: 'Markdown', ...mainMenu(userId) }
  );
}

// UPDATED HELP WITH ADMIN CONTACT
function cmdHelp(msg) {
  const userId = msg.from.id;
  bot.sendMessage(userId,
`❓ *Help Guide*
━━━━━━━━━━━━━━━━━━━━
*How to predict:*
1. Open WinGo game
2. Note the current Period Number
3. Tap 🎯 Predict button here
4. Enter that period number
5. Get your prediction!

*Commands:*
/predict30 — 30 Sec prediction
/predict1m — 1 Min prediction
/buypremium — Upgrade plan
/myaccount — Your account info
/paid — After you pay premium

👑 *Contact Admin:* @GojoVipAdmin
━━━━━━━━━━━━━━━━━━━━
🆓 Free: ${FREE_DAILY_LIMIT} predictions/day
💎 Premium: Unlimited + Higher accuracy`,
    { parse_mode: 'Markdown', ...mainMenu(userId) }
  );
}

function cmdPredict30(msg) {
  const userId = msg.from.id;
  const access = canPredict(userId);
  if (!access.ok) return showLimitMsg(userId);
  userStates[userId] = 'predict_30s';
  bot.sendMessage(userId,
`🎯 *30 Second WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Time left in period: *~${getTimeLeft30s()}s*
📌 Est. current period: \`${getCurrentPeriod30s()}\`
━━━━━━━━━━━━━━━━━━━━
👇 Enter the *period number* from your game:`,
    { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
  );
}

function cmdPredict1m(msg) {
  const userId = msg.from.id;
  const access = canPredict(userId);
  if (!access.ok) return showLimitMsg(userId);
  userStates[userId] = 'predict_1m';
  bot.sendMessage(userId,
`🎯 *1 Minute WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Time left in period: *~${getTimeLeft1m()}s*
📌 Est. current period: \`${getCurrentPeriod1m()}\`
━━━━━━━━━━━━━━━━━━━━
👇 Enter the *period number* from your game:`,
    { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
  );
}

function handlePeriodInput(msg, periodStr, state) {
  const userId   = msg.from.id;
  const isPrem   = isPremium(userId);
  const is30s    = state === 'predict_30s';
  const gameMode = is30s ? '30 Sec WinGo' : '1 Min WinGo';
  const timeLeft = is30s ? getTimeLeft30s() : getTimeLeft1m();
  const pred     = predict(periodStr, isPrem);

  if (!isPrem) incrementFree(userId);
  if (allUsers[userId]) allUsers[userId].predictions++;
  userStates[userId] = null;

  const remaining = isPrem
    ? '♾️ Unlimited (Premium)'
    : `${FREE_DAILY_LIMIT - getFreeUsed(userId)} left today`;

  bot.sendMessage(userId,
`${BOT_NAME}
━━━━━━━━━━━━━━━━━━━━
${isPrem ? '💎 PREMIUM' : '🆓 FREE'} PREDICTION
━━━━━━━━━━━━━━━━━━━━
🕹️ *Game:* ${gameMode}
📌 *Period:* \`${periodStr}\`
⏱️ *Time Left:* ~${timeLeft}s
━━━━━━━━━━━━━━━━━━━━
🔢 *Number:* *${pred.num}*
🎨 *Color:*  *${pred.color}*
📏 *Size:*   *${pred.size}*
💡 *Confidence:* ${pred.conf}
━━━━━━━━━━━━━━━━━━━━
${isPrem
  ? '_💎 Premium signal — High accuracy_'
  : '_⚠️ Free signal | /buypremium for better accuracy_'}`,
    { parse_mode: 'Markdown' }
  );

  setTimeout(() => {
    bot.sendMessage(userId,
      `📊 Predictions remaining: *${remaining}*`,
      { parse_mode: 'Markdown', ...mainMenu(userId) }
    );
  }, 500);
}

function showLimitMsg(userId) {
  bot.sendMessage(userId,
    `⛔ *Daily Limit Reached!*\n\nYou've used all *${FREE_DAILY_LIMIT}* free predictions today.\n\n💎 Upgrade for *unlimited* predictions!\n\n/buypremium`,
    { parse_mode: 'Markdown', ...mainMenu(userId) }
  );
}

function cmdMyAccount(msg) {
  const userId   = msg.from.id;
  const prem     = isPremium(userId);
  const used     = getFreeUsed(userId);
  const u        = allUsers[userId] || {};
  const expiry   = prem ? new Date(premiumUsers[userId]).toLocaleDateString() : 'N/A';
  const daysLeft = prem ? Math.ceil((premiumUsers[userId] - Date.now()) / 86400000) : 0;

  bot.sendMessage(userId,
`📊 *My Account*
━━━━━━━━━━━━━━━━━━━━
👤 *Name:* ${u.name || 'N/A'}
🆔 *User ID:* \`${userId}\`
📅 *Member Since:* ${u.joinDate || today()}
━━━━━━━━━━━━━━━━━━━━
💼 *Plan:* ${prem ? '💎 PREMIUM' : '🆓 FREE'}
${prem
  ? `📅 *Expires:* ${expiry}\n⏳ *Days Left:* ${daysLeft}`
  : `📈 *Used Today:* ${used}/${FREE_DAILY_LIMIT}\n🔄 *Resets:* Midnight daily`}
🎯 *Total Predictions:* ${u.predictions || 0}
━━━━━━━━━━━━━━━━━━━━
${prem ? '✅ Unlimited predictions active!' : '/buypremium — Upgrade now 💎'}`,
    { parse_mode: 'Markdown', ...mainMenu(userId) }
  );
}

// Multi-plan purchase
function cmdBuyPremium(msg) {
  const userId = msg.from.id;
  if (isPremium(userId)) {
    const expiry   = new Date(premiumUsers[userId]).toLocaleDateString();
    const daysLeft = Math.ceil((premiumUsers[userId] - Date.now()) / 86400000);
    return bot.sendMessage(userId,
      `✅ *Already Premium!*\nExpires: *${expiry}*\nDays left: *${daysLeft}*`,
      { parse_mode: 'Markdown', ...mainMenu(userId) }
    );
  }

  const keyboard = {
    inline_keyboard: []
  };
  for (const [key, plan] of Object.entries(PLANS)) {
    keyboard.inline_keyboard.push([
      { text: `${plan.name} - PKR ${plan.price}`, callback_data: `plan_${key}` }
    ]);
  }
  bot.sendMessage(userId,
    `💎 *Choose your Premium Plan*\n━━━━━━━━━━━━━━━━━━━━\nSelect the plan that suits you best:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

bot.on('callback_query', (callbackQuery) => {
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  if (data && data.startsWith('plan_')) {
    const planKey = data.replace('plan_', '');
    const plan = PLANS[planKey];
    if (plan) {
      userStates[userId] = `pending_plan:${planKey}`;
      bot.sendMessage(userId,
`💎 *You selected: ${plan.name}*
━━━━━━━━━━━━━━━━━━━━
✅ Unlimited predictions daily
✅ Higher accuracy signals (85%+)
✅ Priority support
━━━━━━━━━━━━━━━━━━━━
💰 *Price: PKR ${plan.price}*
━━━━━━━━━━━━━━━━━━━━
📲 *EasyPaisa:*
Number: \`${EASYPAISA_NUMBER}\`
Name: ${ACCOUNT_NAME}

📲 *JazzCash:*
Number: \`${JAZZCASH_NUMBER}\`
Name: ${ACCOUNT_NAME}

Amount: PKR *${plan.price}*
━━━━━━━━━━━━━━━━━━━━
*After paying:*
1️⃣ Type /paid
2️⃣ Send payment screenshot
3️⃣ Admin will verify & activate your *${plan.name}* plan!

Your ID (share with admin if needed):
\`${userId}\``,
        { parse_mode: 'Markdown' }
      );
    } else {
      bot.sendMessage(userId, '❌ Invalid plan. Please try again with /buypremium');
    }
    bot.answerCallbackQuery(callbackQuery.id);
  }
});

function cmdPaid(msg) {
  const userId = msg.from.id;
  const name   = msg.from.first_name || 'User';
  
  const state = userStates[userId] || '';
  let planKey = null;
  if (state.startsWith('pending_plan:')) {
    planKey = state.split(':')[1];
  }
  if (!planKey || !PLANS[planKey]) {
    return bot.sendMessage(userId,
      `❌ *Please select a plan first!*\n\nUse /buypremium to choose your plan.`,
      { parse_mode: 'Markdown' }
    );
  }

  pendingPayments[userId] = { name, date: today(), plan: planKey, screenshot: false };
  userStates[userId] = null;

  bot.sendMessage(userId,
    `✅ *Payment notification sent for ${PLANS[planKey].name}!*\n\nNow please send your *payment screenshot* here.\nAdmin will verify within *1-2 hours* ⏳`,
    { parse_mode: 'Markdown' }
  );

  ADMIN_IDS.forEach(adminId => {
    bot.sendMessage(adminId,
      `💰 *New Payment Claim!*\n━━━━━━━━━━━━━━━━━━━━\n👤 Name: ${name}\n🆔 ID: \`${userId}\`\n📦 Plan: ${PLANS[planKey].name} (PKR ${PLANS[planKey].price})\n📅 Date: ${today()}\n━━━━━━━━━━━━━━━━━━━━\nOpen admin panel: /admin`,
      { parse_mode: 'Markdown' }
    );
  });
}

bot.on('photo', (msg) => {
  if (msg.chat.type !== 'private') return;
  const userId = msg.from.id;
  const name   = msg.from.first_name || 'User';

  if (pendingPayments[userId]) {
    pendingPayments[userId].screenshot = true;
    bot.sendMessage(userId, '📸 Screenshot received! Admin will verify soon. Thank you! 🙏');
    ADMIN_IDS.forEach(adminId => {
      bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
      const planName = pendingPayments[userId].plan ? (PLANS[pendingPayments[userId].plan]?.name || 'Unknown') : 'Unknown';
      bot.sendMessage(adminId,
        `📸 Screenshot from *${name}* \`${userId}\` (${planName})\n\nApprove in admin panel → /admin`,
        { parse_mode: 'Markdown' }
      );
    });
  }
});

console.log('🚀 WinGo Bot v2.1 (Multi-Plan + Admin Contact) is running!');
console.log('🔐 Admin panel is password protected');
console.log(`👤 Admin IDs: ${ADMIN_IDS}`);
console.log('📦 Available plans:', Object.keys(PLANS).join(', '));
console.log('📞 Admin contact: @GojoVipAdmin');
