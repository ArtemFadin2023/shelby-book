/**
 * shelby-book — Email Verification Server
 * Отправляет OTP-коды через Mail.ru SMTP
 * 
 * Установка:
 *   npm install express nodemailer cors
 * 
 * Запуск:
 *   node server.js
 */

const express  = require('express');
const nodemailer = require('nodemailer');
const cors     = require('cors');
const crypto   = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ─── НАСТРОЙКИ — заполни своими данными ───────────────────────
const CONFIG = {
  // Твоя корпоративная почта Mail.ru (или @mail.ru / @inbox.ru / @bk.ru)
  EMAIL_FROM:   'stefanandshelby@mail.ru',   // ← замени
  EMAIL_PASS:   'dxx2muTQUd0KtoAOnE75',   // ← пароль приложения (см. ниже)
  
  PORT:         3001,                  // порт сервера
  CODE_TTL_MS:  10 * 60 * 1000,       // 10 минут — время жизни кода
};
// ──────────────────────────────────────────────────────────────

// Хранилище кодов в памяти: { email → { code, expiresAt, attempts } }
const otpStore = new Map();

// ─── SMTP transporter (Mail.ru) ───────────────────────────────
const transporter = nodemailer.createTransport({
  host:   'smtp.mail.ru',
  port:   465,
  secure: true,             // SSL
  auth: {
    user: CONFIG.EMAIL_FROM,
    pass: CONFIG.EMAIL_PASS,
  },
});

// ─── Генерация 6-значного кода ────────────────────────────────
function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

// ─── Шаблон письма ────────────────────────────────────────────
function buildEmailHtml(code) {
  return `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f0faf1;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:20px;
              border:3px solid #c8e6c9;box-shadow:0 8px 32px rgba(46,125,50,0.12);overflow:hidden;">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2E7D32,#1B5E20);padding:28px 32px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">🦎</div>
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:28px;color:#fff;letter-spacing:0.02em;">
        shelby<span style="color:#FDD835;">-book</span>
      </div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px;font-weight:600;">
        Подтверждение регистрации
      </div>
    </div>
    
    <!-- Body -->
    <div style="padding:32px;">
      <p style="color:#2E5D30;font-size:16px;font-weight:600;margin-bottom:24px;">
        👋 Привет! Ты регистрируешься в панели shelby-book.
      </p>
      
      <p style="color:#5D8A62;font-size:14px;margin-bottom:20px;">
        Вот твой код подтверждения — он действует <strong>10 минут</strong>:
      </p>
      
      <!-- OTP Code -->
      <div style="background:#E8F5E9;border:3px solid #4CAF50;border-radius:16px;
                  text-align:center;padding:24px 16px;margin-bottom:24px;">
        <div style="font-family:'Arial Black',Arial,sans-serif;font-size:48px;
                    letter-spacing:16px;color:#1B5E20;font-weight:900;
                    text-shadow:0 2px 0 rgba(0,0,0,0.1);">
          ${code}
        </div>
        <div style="font-size:12px;color:#81C784;font-weight:700;margin-top:8px;letter-spacing:0.06em;text-transform:uppercase;">
          Одноразовый код
        </div>
      </div>
      
      <div style="background:#fff3e0;border-left:4px solid #FF7043;border-radius:0 8px 8px 0;
                  padding:12px 16px;margin-bottom:20px;">
        <p style="color:#E64A19;font-size:13px;font-weight:700;margin:0;">
          ⚠️ Не передавай этот код никому. Мы никогда не просим коды у пользователей.
        </p>
      </div>
      
      <p style="color:#9E9E9E;font-size:12px;">
        Если ты не регистрировался — просто проигнорируй это письмо.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background:#E8F5E9;padding:16px 32px;text-align:center;
                border-top:2px solid #C8E6C9;">
      <p style="color:#81C784;font-size:12px;font-weight:700;margin:0;">
        🌿 shelby-book · Мир бородатых агам 🦎
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ── Отправить код ─────────────────────────────────────────────
app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Некорректный email' });
  }

  // Rate limit: не чаще 1 раза в минуту
  const existing = otpStore.get(email);
  if (existing && (Date.now() - existing.sentAt < 60_000)) {
    return res.status(429).json({ ok: false, error: 'Подождите минуту перед повторной отправкой' });
  }

  const code = generateCode();
  otpStore.set(email, {
    code,
    expiresAt:  Date.now() + CONFIG.CODE_TTL_MS,
    sentAt:     Date.now(),
    attempts:   0,
  });

  try {
    await transporter.sendMail({
      from:    `"shelby-book 🦎" <${CONFIG.EMAIL_FROM}>`,
      to:      email,
      subject: `${code} — твой код для shelby-book`,
      html:    buildEmailHtml(code),
      text:    `Код подтверждения shelby-book: ${code}\nДействует 10 минут.`,
    });

    console.log(`[OTP] Код ${code} отправлен на ${email}`);
    res.json({ ok: true });

  } catch (err) {
    console.error('[OTP] Ошибка отправки:', err.message);
    otpStore.delete(email);
    res.status(500).json({ ok: false, error: 'Ошибка отправки письма. Проверь настройки SMTP.' });
  }
});

// ── Проверить код ─────────────────────────────────────────────
app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ ok: false, error: 'Укажи email и код' });
  }

  const record = otpStore.get(email);

  if (!record) {
    return res.status(400).json({ ok: false, error: 'Сначала запроси код' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ ok: false, error: 'Код истёк. Запроси новый.' });
  }

  record.attempts++;
  if (record.attempts > 5) {
    otpStore.delete(email);
    return res.status(429).json({ ok: false, error: 'Слишком много попыток. Запроси новый код.' });
  }

  if (String(code) !== String(record.code)) {
    return res.status(400).json({ ok: false, error: `Неверный код. Попыток осталось: ${5 - record.attempts}` });
  }

  // Успех — удаляем код
  otpStore.delete(email);
  console.log(`[OTP] Email ${email} подтверждён`);
  res.json({ ok: true });
});

// ── Запуск ────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  console.log(`\n🦎 shelby-book email server запущен!`);
  console.log(`📡 Адрес: http://localhost:${CONFIG.PORT}`);
  console.log(`📧 Отправка с: ${CONFIG.EMAIL_FROM}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /api/health        — проверка работы`);
  console.log(`  POST /api/send-code     — отправить OTP`);
  console.log(`  POST /api/verify-code   — проверить OTP\n`);
});