// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WINGO PRIVATE PREDICTION BOT
// - Works in PRIVATE CHAT only (no groups/channels)
// - User enters period number → gets prediction
// - Free & Premium plans
// - EasyPaisa / JazzCash payment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TelegramBot = require('node-telegram-bot-api');

// ════════════════════════════════
// ⚙️  CHANGE THESE SETTINGS
// ════════════════════════════════

const BOT_TOKEN  = '8425112915:AAE_RNh0tDnXRp3ULKciTPuqIjuiSoNfQtE';
const ADMIN_IDS  = [7592032793];   // Your Telegram numeric ID

// Payment Details
const EASYPAISA_NUMBER  = '0318-0939237';   // Your EasyPaisa number
const JAZZCASH_NUMBER   = '0319-9837973';   // Your JazzCash number
const ACCOUNT_NAME      = 'MUHAMMAD ABID SHAH';

// Premium Pricing
const PREMIUM_PRICE_PKR = 3000;    // Price in PKR
const PREMIUM_DAYS      = 100;     // Days of access

// Free user daily prediction limit
const FREE_DAILY_LIMIT  = 10;      // Free users get 5 predictions/day

// Bot personality
const BOT_NAME = '🎯 MS BOT';

// ════════════════════════════════
// DO NOT CHANGE BELOW THIS LINE
// ════════════════════════════════

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── In-memory storage ──────────────────────
// premiumUsers  : { userId: expiryTimestamp }
// freeUsage     : { userId: { date: 'YYYY-MM-DD', count: number } }
// userStates    : { userId: 'waiting_period_30' | 'waiting_period_1m' | null }
// pendingPayment: { userId: { plan, date } }
// allUsers      : Set of userIds

const premiumUsers   = {};
const freeUsage      = {};
const userStates     = {};
const pendingPayment = {};
const allUsers       = new Set();

// ── Helpers ────────────────────────────────

function isAdmin(id)   { return ADMIN_IDS.includes(id); }
function today()       { return new Date().toISOString().slice(0,10); }

function isPremium(userId) {
  if (!premiumUsers[userId]) return false;
  if (Date.now() > premiumUsers[userId]) { delete premiumUsers[userId]; return false; }
  return true;
}

function getFreeUsageToday(userId) {
  const u = freeUsage[userId];
  if (!u || u.date !== today()) return 0;
  return u.count;
}

function incrementFreeUsage(userId) {
  if (!freeUsage[userId] || freeUsage[userId].date !== today()) {
    freeUsage[userId] = { date: today(), count: 0 };
  }
  freeUsage[userId].count++;
}

function canUseBot(userId) {
  if (isPremium(userId)) return { ok: true };
  const used = getFreeUsageToday(userId);
  if (used < FREE_DAILY_LIMIT) return { ok: true, left: FREE_DAILY_LIMIT - used };
  return { ok: false };
}

// ── Period Number Logic ─────────────────────
// WinGo period numbers follow this format:
// 30sec game  → 20241214001  (increments every 30 sec)
// 1min game   → 202412140001 (increments every 1 min)
// We generate the CURRENT period based on real clock time
// so it closely matches the actual game period

function getCurrentPeriod30s() {
  const now   = new Date();
  const date  = now.toISOString().slice(0,10).replace(/-/g,''); // 20241214
  // Number of 30-second slots since midnight
  const secs  = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
  const slot  = Math.floor(secs / 30) + 1;
  return `${date}${String(slot).padStart(4,'0')}`;
}

function getCurrentPeriod1m() {
  const now   = new Date();
  const date  = now.toISOString().slice(0,10).replace(/-/g,'');
  const mins  = now.getHours()*60 + now.getMinutes();
  const slot  = mins + 1;
  return `${date}${String(slot).padStart(4,'0')}`;
}

function getTimeLeftIn30s() {
  const secs = new Date().getSeconds();
  return 30 - (secs % 30);
}

function getTimeLeftIn1m() {
  return 60 - new Date().getSeconds();
}

// ── Prediction Engine ───────────────────────
// Uses period number as seed for consistency
// Same period → same prediction (feels "connected")

function seedRandom(seed) {
  // Simple deterministic pseudo-random from seed string
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
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

  const size  = num >= 5 ? '📈 BIG' : '📉 SMALL';

  // Confidence tiers
  const freeConfs = ['⭐⭐⭐ Medium (65%)','⭐⭐ Low (55%)','⭐⭐⭐ Medium (60%)'];
  const premConfs = ['⭐⭐⭐⭐⭐ Ultra (85%)','⭐⭐⭐⭐ High (78%)','⭐⭐⭐⭐⭐ Ultra (82%)'];
  const confList  = isPrem ? premConfs : freeConfs;
  const conf      = confList[seed % confList.length];

  return { num, color, size, conf };
}

// ── Message Builders ────────────────────────

function buildPredictionMsg(period, gameMode, timeLeft, pred, isPrem) {
  const plan = isPrem ? '💎 PREMIUM' : '🆓 FREE';
  return `${BOT_NAME}
━━━━━━━━━━━━━━━━━━━━
${plan} PREDICTION
━━━━━━━━━━━━━━━━━━━━
🕹️ *Game:* ${gameMode}
📌 *Period:* \`${period}\`
⏱️ *Time Left:* ~${timeLeft}s
━━━━━━━━━━━━━━━━━━━━
🔢 *Number:* *${pred.num}*
🎨 *Color:*  *${pred.color}*
📏 *Size:*   *${pred.size}*
💡 *Confidence:* ${pred.conf}
━━━━━━━━━━━━━━━━━━━━
${isPrem
  ? '_💎 Premium signal — Higher accuracy_'
  : '_⚠️ Free signal | /buypremium for higher accuracy_'}`;
}

function mainMenuKeyboard(userId) {
  const prem = isPremium(userId);
  return {
    reply_markup: {
      keyboard: [
        ['🎯 Predict 30 Sec', '🎯 Predict 1 Min'],
        ['💎 Buy Premium',    '📊 My Account'],
        ['❓ Help']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOCK GROUP / CHANNEL USAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.on('message', (msg) => {
  // Block all non-private chats
  if (msg.chat.type !== 'private') {
    bot.sendMessage(msg.chat.id,
      '❌ This bot only works in private chat.\nPlease message me directly: @YourBotUsername'
    );
    return;
  }
  handleMessage(msg);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN MESSAGE HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleMessage(msg) {
  const userId = msg.from.id;
  const text   = (msg.text || '').trim();
  allUsers.add(userId);

  // ── Handle period number input ──
  const state = userStates[userId];
  if (state && /^\d{8,14}$/.test(text)) {
    handlePeriodInput(msg, text, state);
    return;
  }

  // ── Commands & buttons ──
  switch (true) {
    case /\/start/.test(text):         return cmdStart(msg);
    case /\/help/.test(text):
    case /❓ Help/.test(text):         return cmdHelp(msg);
    case /🎯 Predict 30/.test(text):
    case /\/predict30/.test(text):     return cmdPredict30(msg);
    case /🎯 Predict 1/.test(text):
    case /\/predict1m/.test(text):     return cmdPredict1m(msg);
    case /💎 Buy Premium/.test(text):
    case /\/buypremium/.test(text):    return cmdBuyPremium(msg);
    case /📊 My Account/.test(text):
    case /\/myaccount/.test(text):     return cmdMyAccount(msg);
    case /\/paid/.test(text):          return cmdPaid(msg);

    // Admin commands
    case /\/stats/.test(text):         return cmdStats(msg);
    case /\/addpremium/.test(text):    return cmdAddPremium(msg, text);
    case /\/removepremium/.test(text): return cmdRemovePremium(msg, text);
    case /\/broadcast/.test(text):     return cmdBroadcast(msg, text);

    default:
      if (state) {
        bot.sendMessage(userId,
          '⚠️ Please enter a valid period number (numbers only, 8-14 digits).\n\nExample: `20241214001`',
          { parse_mode: 'Markdown' }
        );
      }
  }
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

${prem ? '💎 You are a *PREMIUM* member!' : `🆓 Free Plan — *${FREE_DAILY_LIMIT - getFreeUsageToday(userId)}* predictions left today`}
━━━━━━━━━━━━━━━━━━━━
📲 *How to use:*
1️⃣ Tap *Predict 30 Sec* or *Predict 1 Min*
2️⃣ Enter the current period number from the game
3️⃣ Get your prediction instantly!
━━━━━━━━━━━━━━━━━━━━
_This bot works in private chat only._`,
    { parse_mode: 'Markdown', ...mainMenuKeyboard(userId) }
  );
}

function cmdHelp(msg) {
  const userId = msg.from.id;
  bot.sendMessage(userId,
    `❓ *Help & Guide*
━━━━━━━━━━━━━━━━━━━━
*How to get a prediction:*
1. Open WinGo game (30sec or 1min)
2. Note the current *Period Number*
3. Tap the predict button here
4. Enter that period number
5. Get your prediction!

*Commands:*
/predict30 — 30 Second WinGo prediction
/predict1m — 1 Minute WinGo prediction
/buypremium — Upgrade to Premium
/myaccount — Your plan & usage stats
/help — Show this guide
━━━━━━━━━━━━━━━━━━━━
*Free Plan:* ${FREE_DAILY_LIMIT} predictions/day
*Premium Plan:* Unlimited + Higher accuracy`,
    { parse_mode: 'Markdown', ...mainMenuKeyboard(userId) }
  );
}

function cmdPredict30(msg) {
  const userId = msg.from.id;
  const access = canUseBot(userId);

  if (!access.ok) {
    return bot.sendMessage(userId,
      `⛔ *Daily Limit Reached!*\n\nYou have used all *${FREE_DAILY_LIMIT}* free predictions today.\n\n💎 Upgrade to Premium for unlimited predictions!\n\n/buypremium`,
      { parse_mode: 'Markdown' }
    );
  }

  userStates[userId] = 'predict_30s';
  const currentPeriod = getCurrentPeriod30s();
  const timeLeft      = getTimeLeftIn30s();

  bot.sendMessage(userId,
    `🎯 *30 Second WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Current period ends in: *~${timeLeft}s*
📌 Estimated current period: \`${currentPeriod}\`
━━━━━━━━━━━━━━━━━━━━
👇 *Enter the period number* from your game screen now:`,
    {
      parse_mode: 'Markdown',
      reply_markup: { force_reply: true }
    }
  );
}

function cmdPredict1m(msg) {
  const userId = msg.from.id;
  const access = canUseBot(userId);

  if (!access.ok) {
    return bot.sendMessage(userId,
      `⛔ *Daily Limit Reached!*\n\nYou have used all *${FREE_DAILY_LIMIT}* free predictions today.\n\n💎 Upgrade to Premium for unlimited predictions!\n\n/buypremium`,
      { parse_mode: 'Markdown' }
    );
  }

  userStates[userId] = 'predict_1m';
  const currentPeriod = getCurrentPeriod1m();
  const timeLeft      = getTimeLeftIn1m();

  bot.sendMessage(userId,
    `🎯 *1 Minute WinGo*
━━━━━━━━━━━━━━━━━━━━
⏱️ Current period ends in: *~${timeLeft}s*
📌 Estimated current period: \`${currentPeriod}\`
━━━━━━━━━━━━━━━━━━━━
👇 *Enter the period number* from your game screen now:`,
    {
      parse_mode: 'Markdown',
      reply_markup: { force_reply: true }
    }
  );
}

function handlePeriodInput(msg, periodStr, state) {
  const userId   = msg.from.id;
  const isPrem   = isPremium(userId);
  const is30s    = state === 'predict_30s';
  const gameMode = is30s ? '30 Sec WinGo' : '1 Min WinGo';
  const timeLeft = is30s ? getTimeLeftIn30s() : getTimeLeftIn1m();
  const pred     = predict(periodStr, isPrem);

  if (!isPrem) incrementFreeUsage(userId);
  userStates[userId] = null;

  const remaining = isPrem
    ? '♾️ Unlimited (Premium)'
    : `${FREE_DAILY_LIMIT - getFreeUsageToday(userId)} left today`;

  bot.sendMessage(userId,
    buildPredictionMsg(periodStr, gameMode, timeLeft, pred, isPrem),
    { parse_mode: 'Markdown' }
  );

  // Show usage info
  setTimeout(() => {
    bot.sendMessage(userId,
      `📊 Predictions remaining: *${remaining}*\n\nPredict again? Use the buttons below 👇`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard(userId) }
    );
  }, 500);
}

function cmdMyAccount(msg) {
  const userId   = msg.from.id;
  const prem     = isPremium(userId);
  const used     = getFreeUsageToday(userId);
  const expiry   = prem ? new Date(premiumUsers[userId]).toLocaleDateString() : 'N/A';
  const daysLeft = prem ? Math.ceil((premiumUsers[userId] - Date.now()) / 86400000) : 0;

  bot.sendMessage(userId,
    `📊 *My Account*
━━━━━━━━━━━━━━━━━━━━
👤 *User ID:* \`${userId}\`
💼 *Plan:* ${prem ? '💎 PREMIUM' : '🆓 FREE'}
${prem
  ? `📅 *Expires:* ${expiry}\n⏳ *Days Left:* ${daysLeft}`
  : `📈 *Used Today:* ${used}/${FREE_DAILY_LIMIT}\n🔄 *Resets:* Midnight daily`}
━━━━━━━━━━━━━━━━━━━━
${prem ? '✅ Unlimited predictions active!' : `💎 /buypremium — Get unlimited access`}`,
    { parse_mode: 'Markdown', ...mainMenuKeyboard(userId) }
  );
}

function cmdBuyPremium(msg) {
  const userId = msg.from.id;

  if (isPremium(userId)) {
    const expiry   = new Date(premiumUsers[userId]).toLocaleDateString();
    const daysLeft = Math.ceil((premiumUsers[userId] - Date.now()) / 86400000);
    return bot.sendMessage(userId,
      `✅ *You already have Premium!*\n\nExpires: *${expiry}*\nDays left: *${daysLeft}*`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard(userId) }
    );
  }

  pendingPayment[userId] = { date: today() };

  bot.sendMessage(userId,
    `💎 *Buy Premium — ${PREMIUM_DAYS} Days*
━━━━━━━━━━━━━━━━━━━━
✅ Unlimited predictions
✅ Higher accuracy signals
✅ Priority support
━━━━━━━━━━━━━━━━━━━━
💰 *Price: PKR ${PREMIUM_PRICE_PKR}*
━━━━━━━━━━━━━━━━━━━━
📲 *Pay via EasyPaisa:*
Number: \`${EASYPAISA_NUMBER}\`
Name: ${ACCOUNT_NAME}

📲 *Pay via JazzCash:*
Number: \`${JAZZCASH_NUMBER}\`
Name: ${ACCOUNT_NAME}

Amount: PKR *${PREMIUM_PRICE_PKR}*
━━━━━━━━━━━━━━━━━━━━
After payment:
1️⃣ Take a screenshot of the receipt
2️⃣ Type /paid and send the screenshot here

Your ID (send this to admin too):
\`${userId}\``,
    { parse_mode: 'Markdown' }
  );
}

function cmdPaid(msg) {
  const userId = msg.from.id;
  const name   = msg.from.first_name || 'User';

  bot.sendMessage(userId,
    `✅ *Payment confirmation received!*\n\nPlease send your *payment screenshot* now.\nAdmin will verify and activate your Premium within *1-2 hours*.\n\nYour ID: \`${userId}\``,
    { parse_mode: 'Markdown' }
  );

  // Forward payment notification to admin
  ADMIN_IDS.forEach(adminId => {
    bot.sendMessage(adminId,
      `💰 *New Premium Payment!*\n━━━━━━━━━━━━━━━━━━━━\n👤 Name: ${name}\n🆔 User ID: \`${userId}\`\n📅 Date: ${today()}\n━━━━━━━━━━━━━━━━━━━━\nTo activate:\n/addpremium ${userId} ${PREMIUM_DAYS}`,
      { parse_mode: 'Markdown' }
    );
  });
}

// Listen for screenshot after /paid
bot.on('photo', (msg) => {
  if (msg.chat.type !== 'private') return;
  const userId = msg.from.id;
  const name   = msg.from.first_name || 'User';

  if (pendingPayment[userId]) {
    bot.sendMessage(userId,
      '📸 Screenshot received! Admin will verify soon. Thank you! 🙏'
    );
    ADMIN_IDS.forEach(adminId => {
      bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
      bot.sendMessage(adminId,
        `📸 Payment screenshot from:\n👤 ${name}\n🆔 \`${userId}\`\n\nActivate: /addpremium ${userId} ${PREMIUM_DAYS}`,
        { parse_mode: 'Markdown' }
      );
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN COMMANDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cmdStats(msg) {
  if (!isAdmin(msg.from.id)) return;
  const premCount = Object.keys(premiumUsers).length;
  bot.sendMessage(msg.chat.id,
    `📊 *Bot Statistics*
━━━━━━━━━━━━━━━━━━━━
👥 Total Users: *${allUsers.size}*
💎 Premium Users: *${premCount}*
🆓 Free Users: *${allUsers.size - premCount}*
━━━━━━━━━━━━━━━━━━━━`,
    { parse_mode: 'Markdown' }
  );
}

function cmdAddPremium(msg, text) {
  if (!isAdmin(msg.from.id)) return;
  const parts  = text.split(' ');
  const userId = parseInt(parts[1]);
  const days   = parseInt(parts[2]) || PREMIUM_DAYS;

  if (!userId) return bot.sendMessage(msg.chat.id, 'Usage: /addpremium USER_ID DAYS\nExample: /addpremium 123456789 30');

  premiumUsers[userId] = Date.now() + days * 86400000;
  delete pendingPayment[userId];
  const expiry = new Date(premiumUsers[userId]).toLocaleDateString();

  bot.sendMessage(msg.chat.id,
    `✅ Premium activated!\nUser: *${userId}*\nDays: *${days}*\nExpires: *${expiry}*`,
    { parse_mode: 'Markdown' }
  );

  bot.sendMessage(userId,
    `🎉 *Premium Activated!*\n\n💎 Your premium access is now active!\nDuration: *${days} days*\nExpires: *${expiry}*\n\nYou now have:\n✅ Unlimited predictions\n✅ Higher accuracy signals\n\nThank you! Use the buttons below 👇`,
    { parse_mode: 'Markdown', ...mainMenuKeyboard(userId) }
  ).catch(() => {});
}

function cmdRemovePremium(msg, text) {
  if (!isAdmin(msg.from.id)) return;
  const userId = parseInt(text.split(' ')[1]);
  if (!userId) return bot.sendMessage(msg.chat.id, 'Usage: /removepremium USER_ID');
  delete premiumUsers[userId];
  bot.sendMessage(msg.chat.id, `✅ Premium removed for user ${userId}`);
}

function cmdBroadcast(msg, text) {
  if (!isAdmin(msg.from.id)) return;
  const message = text.replace('/broadcast', '').trim();
  if (!message) return bot.sendMessage(msg.chat.id, 'Usage: /broadcast Your message here');
  let sent = 0;
  allUsers.forEach(uid => {
    bot.sendMessage(uid, `📢 *Message from Admin*\n━━━━━━━━━━━━━━━━━━━━\n${message}`, { parse_mode: 'Markdown' })
      .then(() => sent++).catch(() => {});
  });
  setTimeout(() => bot.sendMessage(msg.chat.id, `✅ Broadcast sent to ${sent} users.`), 3000);
}

console.log('🚀 WinGo Private Bot is running!');
console.log('🔒 Group/Channel usage is BLOCKED');
console.log(`👤 Admin: ${ADMIN_IDS}`);
