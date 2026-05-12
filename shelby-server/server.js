const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG = {
  RESEND_API_KEY: 're_D8WsByt6_CYrYYrCM9nTgRkYYSoiS1Hvq',
  EMAIL_FROM: 'noreply@shelby-book.ru',
  PORT:           3001,
  CODE_TTL_MS:    10 * 60 * 1000,
};

const otpStore = new Map();

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

function sendEmail(to, code, type = 'verify') {
  return new Promise((resolve, reject) => {
    const isReset = type === 'reset';
    const subject = isReset
      ? `${code} — код восстановления пароля shelby-book`
      : `${code} — твой код для shelby-book`;
    const title = isReset ? 'Восстановление пароля' : 'Подтверждение регистрации';
    const text = isReset
      ? '🔑 Ты запросил восстановление пароля. Введи код ниже:'
      : '👋 Ты регистрируешься в shelby-book. Введи код ниже:';

    const body = JSON.stringify({
      from: CONFIG.EMAIL_FROM,
      to: [to],
      subject,
      html: `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f0faf1;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:20px;border:3px solid #c8e6c9;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#2E7D32,#1B5E20);padding:28px 32px;text-align:center;">
      <div style="font-size:36px;">${isReset ? '🔑' : '🦎'}</div>
      <div style="font-size:28px;color:#fff;font-weight:900;">shelby<span style="color:#FDD835;">-book</span></div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px;">${title}</div>
    </div>
    <div style="padding:32px;">
      <p style="color:#2E5D30;font-size:16px;font-weight:600;">${text}</p>
      <div style="background:#E8F5E9;border:3px solid #4CAF50;border-radius:16px;text-align:center;padding:24px;margin:20px 0;">
        <div style="font-size:48px;letter-spacing:12px;color:#1B5E20;font-weight:900;">${code}</div>
        <div style="font-size:12px;color:#81C784;font-weight:700;margin-top:8px;text-transform:uppercase;">Действует 10 минут</div>
      </div>
      <p style="color:#E64A19;font-size:13px;font-weight:700;">⚠️ Не передавай код никому!</p>
    </div>
    <div style="background:#E8F5E9;padding:16px 32px;text-align:center;border-top:2px solid #C8E6C9;">
      <p style="color:#81C784;font-size:12px;font-weight:700;margin:0;">🌿 shelby-book · Мир бородатых агам 🦎</p>
    </div>
  </div>
</body></html>`,
      text: `${subject}\nКод: ${code}\nДействует 10 минут.`,
    });

    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || 'Resend error'));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Некорректный email' });
  }
  const existing = otpStore.get(email);
  if (existing && (Date.now() - existing.sentAt < 60_000)) {
    return res.status(429).json({ ok: false, error: 'Подождите минуту' });
  }
  const code = generateCode();
  otpStore.set(email, { code, expiresAt: Date.now() + CONFIG.CODE_TTL_MS, sentAt: Date.now(), attempts: 0 });
  try {
    await sendEmail(email, code);
    console.log(`[OTP] Код ${code} отправлен на ${email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[OTP] Ошибка:', err.message);
    otpStore.delete(email);
    res.status(500).json({ ok: false, error: 'Ошибка: ' + err.message });
  }
});

app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ ok: false, error: 'Укажи email и код' });
  const record = otpStore.get(email);
  if (!record) return res.status(400).json({ ok: false, error: 'Сначала запроси код' });
  if (Date.now() > record.expiresAt) { otpStore.delete(email); return res.status(400).json({ ok: false, error: 'Код истёк' }); }
  record.attempts++;
  if (record.attempts > 5) { otpStore.delete(email); return res.status(429).json({ ok: false, error: 'Слишком много попыток' }); }
  if (String(code) !== String(record.code)) return res.status(400).json({ ok: false, error: `Неверный код. Осталось: ${5 - record.attempts}` });
  otpStore.delete(email);
  console.log(`[OTP] Email ${email} подтверждён`);
  res.json({ ok: true });
});



// Запись на лекцию/передержку
app.post('/api/booking', async (req, res) => {
  const { type, name, email, phone, date, comment } = req.body;
  if (!type || !name || !email) {
    return res.status(400).json({ ok: false, error: 'Заполни все поля' });
  }

  const booking = { type, name, email, phone, date, comment, createdAt: new Date().toISOString() };

  try {
    // Отправляем уведомление админу
    await sendEmail(
      'stefanandshelby@mail.ru',
      `Новая заявка: ${type}\nИмя: ${name}\nEmail: ${email}\nТел: ${phone||'—'}\nДата: ${date||'—'}\nКомментарий: ${comment||'—'}`,
      'booking'
    );
    console.log(`[BOOKING] ${type} от ${name} (${email})`);
    res.json({ ok: true });
  } catch(err) {
    console.error('[BOOKING] Ошибка:', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка отправки' });
  }
});

app.listen(CONFIG.PORT, () => {
  console.log(`\n🦎 shelby-book email server v2`);
  console.log(`📡 http://localhost:${CONFIG.PORT}`);
  console.log(`📧 Resend API\n`);
});
