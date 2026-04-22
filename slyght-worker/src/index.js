// SLYGHT Cloudflare Worker — Smart Push Notifications
// Handles state sync from app + scheduled push via Web Push API (VAPID)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://xetonx.github.io',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /sync — SLYGHT sends current financial + lifestyle state
    if (path === '/sync' && request.method === 'POST') {
      try {
        const body = await request.json();
        const state = {
          bal:              parseFloat((body.bal || 0).toFixed(2)),
          maxDay:           parseFloat((body.maxDay || 0).toFixed(2)),
          daysLeft:         body.daysLeft || 0,
          survivalMode:     body.survivalMode || 'normal',
          todaySpent:       parseFloat((body.todaySpent || 0).toFixed(2)),
          lunchSpend:       parseFloat((body.lunchSpend || 0).toFixed(2)),
          lunchLogged:      body.lunchLogged || false,
          breakfastLogged:  body.breakfastLogged || false,
          groceryDismissed: body.groceryDismissed || false,
          // Section 4 additions
          weather:          body.weather || {},
          wfhToday:         body.wfhToday || false,
          characterScore:   body.characterScore || 0,
          recentSpending:   body.recentSpending || [],
          daysToRace:       body.daysToRace || 0,
          quietMode:        body.quietMode || false,
          dailyLimit:       body.dailyLimit || 4,
          lastSync:         new Date().toISOString(),
        };
        await env.SLYGHT_DATA.put('state', JSON.stringify(state));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400, headers: corsHeaders,
        });
      }
    }

    // POST /subscribe — browser sends Web Push subscription object
    if (path === '/subscribe' && request.method === 'POST') {
      try {
        const sub = await request.json();
        if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
          return new Response(JSON.stringify({ error: 'Invalid subscription' }), {
            status: 400, headers: corsHeaders,
          });
        }
        await env.SLYGHT_DATA.put('push_subscription', JSON.stringify(sub));
        return new Response(JSON.stringify({ ok: true, message: 'Subscribed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400, headers: corsHeaders,
        });
      }
    }

    // POST /dismiss — mark a notification type dismissed for today
    if (path === '/dismiss' && request.method === 'POST') {
      try {
        const { type } = await request.json();
        const dismissed = JSON.parse(await env.SLYGHT_DATA.get('dismissed') || '{}');
        dismissed[type] = new Date().toISOString();
        await env.SLYGHT_DATA.put('dismissed', JSON.stringify(dismissed));
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400, headers: corsHeaders,
        });
      }
    }

    // GET /status — debug endpoint
    if (path === '/status' && request.method === 'GET') {
      const state = JSON.parse(await env.SLYGHT_DATA.get('state') || '{}');
      const sub = await env.SLYGHT_DATA.get('push_subscription');
      const dismissed = JSON.parse(await env.SLYGHT_DATA.get('dismissed') || '{}');
      return new Response(JSON.stringify({
        state,
        hasSubscription: !!sub,
        dismissed,
        time: new Date().toISOString(),
        sydneyTime: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /test — send a test push notification immediately
    if (path === '/test' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        // Accept subscription from request body, or fall back to KV
        const sub = body.subscription ||
          JSON.parse(await env.SLYGHT_DATA.get('push_subscription') || 'null');
        if (!sub) {
          return new Response(JSON.stringify({ error: 'No subscription found' }), {
            status: 400, headers: corsHeaders,
          });
        }
        await sendPush(sub, env, {
          title: '✅ SLYGHT notifications working!',
          body: 'Smart notifications are live. Morning alert fires at 9am Sydney time.',
          tag: 'test-' + Date.now(),
          actions: [{ action: 'open', title: '📊 Open SLYGHT' }],
        });
        return new Response(JSON.stringify({ ok: true, message: 'Test notification sent' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    return new Response('SLYGHT Worker OK', { headers: corsHeaders });
  },

  // Cron trigger handler
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleSchedule(event.cron, env));
  },
};

// ─── SCHEDULE HANDLER ─────────────────────────────────────────────────────────

// Returns current hour, minute, and day name in Sydney time (handles AEST/AEDT automatically)
function getSydneyTime() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  return {
    hour:   parseInt(parts.find(p => p.type === 'hour')?.value   || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
    day:    parts.find(p => p.type === 'weekday')?.value || '',
  };
}

async function handleSchedule(cron, env) {
  const state = JSON.parse(await env.SLYGHT_DATA.get('state') || '{}');
  const sub   = JSON.parse(await env.SLYGHT_DATA.get('push_subscription') || 'null');
  if (!sub) return;

  // Use real Sydney time — DST handled automatically by Intl
  const { hour: sydHour, minute: sydMin, day: dayName } = getSydneyTime();

  const isOfficeDay = ['Monday', 'Thursday', 'Friday'].includes(dayName);
  const isGfDay     = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'].includes(dayName);
  const isSunday    = dayName === 'Sunday';
  const isWeekend   = ['Saturday', 'Sunday'].includes(dayName);

  const bal            = parseFloat((state.bal || 0).toFixed(2));
  const maxDay         = parseFloat((state.maxDay || 20).toFixed(2));
  const daysLeft       = state.daysLeft || 1;
  const survivalMode   = state.survivalMode || 'normal';
  const todaySpent     = parseFloat((state.todaySpent || 0).toFixed(2));
  const lunchSpend     = parseFloat((state.lunchSpend || 0).toFixed(2));
  const lunchLogged    = state.lunchLogged || false;
  const breakfastLogged = state.breakfastLogged || false;
  const wfhToday       = state.wfhToday || false;
  const weather        = state.weather || {};
  const isRaining      = weather.isRaining || false;
  const isPerfectRun   = weather.isPerfectRun || false;
  const temp           = weather.temp || 20;
  const characterScore = state.characterScore || 0;
  const recentSpending = state.recentSpending || [];
  const daysToRace     = state.daysToRace || 0;
  const quietMode      = state.quietMode || false;

  // Check recent spending patterns
  const recentHasVape     = recentSpending.some(t => (t.note || '').toLowerCase().includes('vape'));
  const recentHasUberEats = recentSpending.some(t =>
    (t.note || '').toLowerCase().includes('uber eats') ||
    (t.note || '').toLowerCase().includes('ubereats'));
  const recentHasFifa     = recentSpending.some(t =>
    (t.note || '').toLowerCase().includes('fifa') ||
    (t.note || '').toLowerCase().includes('ea fc'));
  const parkedRecently    = recentSpending.some(t =>
    (t.note || '').toLowerCase().includes('parking') ||
    (t.cat  || '').toLowerCase().includes('transport'));

  // ── 9am MORNING ALERT ─────────────────────────────────
  if (sydHour === 9 && sydMin < 10) {
    let title, body;

    if (survivalMode === 'critical') {
      title = '🚨 Morning — Critical mode';
      body  = 'Balance: $' + bal.toFixed(2) + '. Payday in ' + daysLeft + ' days. ' +
              'Do not spend today unless absolutely necessary.';
    } else if (survivalMode === 'survival') {
      title = '⚠️ Morning — Tight week';
      body  = 'Balance: $' + bal.toFixed(2) + '. Max today: $' + maxDay.toFixed(2) + '. ' +
              'Every dollar saved is one less you need to borrow.';
    } else {
      title = '🌅 Good morning John';
      body  = 'Balance: $' + bal.toFixed(2) + ' · Max today: $' + maxDay.toFixed(2) +
              '\nPayday in ' + daysLeft + ' days. ';
      if (isRaining) body += 'Raining today — smart move taking the train. ';
      if (isOfficeDay && !wfhToday) {
        body += 'Check the fridge before you leave — grab lunch if you prepped.';
      } else if (wfhToday) {
        body += 'WFH today — no commute cost. Make lunch at home.';
      }
    }

    await sendPush(sub, env, {
      title, body,
      tag: 'morning',
      actions: [{ action: 'open', title: '📊 Check SLYGHT' }],
    });
  }

  // ── 10am COFFEE/BREAKFAST CHECK ──────────────────────
  if (sydHour === 10 && sydMin < 10 && isOfficeDay && !wfhToday && !quietMode) {
    if (!breakfastLogged) {
      let body = 'Grab your morning coffee — social connection matters. Keep it under $6. ';
      body += survivalMode !== 'normal'
        ? 'You\'re in survival mode — make it count.'
        : 'Small habits, big results.';
      await sendPush(sub, env, {
        title: '☕ Morning coffee',
        body,
        tag: 'breakfast',
        actions: [
          { action: 'no-spend', title: '✅ Brought from home' },
          { action: 'log',      title: '📝 Log coffee' },
        ],
      });
    }
  }

  // ── 12:30pm LUNCH CHECK ──────────────────────────────
  if ((sydHour === 12 && sydMin >= 30) || (sydHour === 13 && sydMin < 5)) {
    if (!lunchLogged && !quietMode) {
      let title = '🍱 Lunch time';
      let body;
      const lunchBudget = isGfDay && isWeekend ? 30 : 20;

      if (survivalMode === 'critical') {
        body = 'Balance: $' + bal.toFixed(2) + '. Skip buying lunch today. ' +
               'Payday in ' + daysLeft + ' days. Every $20 matters right now.';
      } else if (survivalMode === 'survival') {
        body = 'Keep lunch under $15 today. You have $' + maxDay.toFixed(2) +
               ' for the day. Average lunch is eating $20-25 of that.';
      } else {
        body = 'Aim for under $' + lunchBudget + ' today. ' +
               'You\'ve spent $' + todaySpent.toFixed(2) + ' so far. ' +
               '$' + Math.max(0, maxDay - todaySpent).toFixed(2) + ' remaining today.';
      }

      await sendPush(sub, env, {
        title, body,
        tag: 'lunch',
        actions: [
          { action: 'no-spend', title: '🏠 Eating from home' },
          { action: 'log',      title: '📝 Log lunch' },
        ],
      });
    }
  }

  // ── 2-3pm AFTERNOON / SUNDAY GROCERY ─────────────────
  if ((sydHour === 14 || sydHour === 15) && sydMin < 15) {
    if (isSunday) {
      if (!state.groceryDismissed) {
        await sendPush(sub, env, {
          title: '🛒 Sunday afternoon',
          body:  'Good time for the weekly shop at Woolworths Kirrawee. ' +
                 'Budget $80. Meal prep tonight = no UberEats this week. ' +
                 'That\'s $100-150 saved.' +
                 (isGfDay ? ' Cook with your gf tonight — healthy and cheap.' : ''),
          tag:   'grocery-sunday',
          actions: [
            { action: 'groceries-done', title: '✅ Getting groceries' },
            { action: 'later',          title: '⏰ Remind me tonight' },
          ],
        });
      }
    } else if (!isWeekend && !quietMode) {
      let body;
      if (recentHasVape) {
        body = 'You bought a vape recently. ' +
               'City2Surf is coming — vaping and running don\'t mix. ' +
               'Skip the afternoon snack too. Go for a short walk instead.';
      } else if (todaySpent > maxDay * 0.7) {
        body = 'You\'ve spent $' + todaySpent.toFixed(2) + ' today — ' +
               'that\'s ' + Math.round(todaySpent / maxDay * 100) + '% of your daily limit. ' +
               'Skip the afternoon snack. Water is free.';
      } else {
        body = 'Afternoon check. Keep snacks under $5 if you need something. ' +
               'Going for a short walk is free and counts toward City2Surf training.';
      }
      await sendPush(sub, env, {
        title: '🥤 Afternoon',
        body,
        tag:   'snack',
        actions: [
          { action: 'no-spend', title: '✅ No snack' },
          { action: 'log',      title: '📝 Log it' },
        ],
      });
    }
  }

  // ── 6:30-7pm HOME TIME / EVENING ─────────────────────
  if ((sydHour === 18 && sydMin >= 30) || (sydHour === 19 && sydMin < 15)) {
    if (isSunday) {
      if (!state.groceryDismissed) {
        await sendPush(sub, env, {
          title: '🛒 Sunday evening',
          body:  'Last chance for the weekly shop. Woolworths Kirrawee closes at 10pm. ' +
                 'Groceries now = no UberEats trap this week.',
          tag:   'grocery-sunday-night',
          actions: [
            { action: 'groceries-done', title: '✅ All sorted' },
            { action: 'open',           title: '📊 Check budget' },
          ],
        });
      }
      return;
    }

    if (isOfficeDay && !wfhToday && !quietMode) {
      let title = '🏠 Heading home?';
      let body;

      if (isGfDay) {
        if (isPerfectRun) {
          body = temp + '°C and perfect running weather tonight. ' +
                 'Go for a run before dinner. City2Surf is ' + daysToRace + ' days away. ' +
                 'Then cook something healthy together. You\'ve got this.';
        } else if (isRaining) {
          body = 'Wet night — good excuse to cook indoors with your gf. ' +
                 'Healthy, cheap, and exactly what you\'re both trying to do.';
        } else {
          body = 'On the way to your gf\'s? ' +
                 'Cook together tonight. Healthy and cheap beats takeaway every time. ' +
                 'You\'re both building better habits.';
        }
      } else {
        if (isPerfectRun) {
          body = temp + '°C — perfect for a run. City2Surf is ' + daysToRace + ' days away. ' +
                 'Go for a run before dinner. Don\'t spend tonight.';
        } else if (recentHasUberEats) {
          body = 'You\'ve ordered UberEats recently. Tonight — cook at home. ' +
                 'You have food. Balance: $' + bal.toFixed(2) + '.';
        } else {
          body = 'Home time. Balance: $' + bal.toFixed(2) + '. ' +
                 'Max today: $' + maxDay.toFixed(2) + '. ' +
                 'A good evening = no spending and something cooked at home.';
        }
      }

      if (parkedRecently || isGfDay) {
        body += ' If you need groceries — Woolworths Kirrawee is on the way.';
      }

      await sendPush(sub, env, {
        title, body,
        tag:   'hometime',
        actions: [
          { action: 'no-spend', title: '✅ Going straight home' },
          { action: 'log',      title: '📝 Log expense' },
        ],
      });
    }
  }
}

// ─── WEB PUSH SENDER (RFC 8291 VAPID + aes128gcm) ────────────────────────────

async function sendPush(subscription, env, payload) {
  try {
    const endpoint = subscription.endpoint;
    const { p256dh, auth } = subscription.keys || {};
    if (!endpoint || !p256dh || !auth) return false;

    const bodyStr = JSON.stringify({
      title:              payload.title,
      body:               payload.body,
      icon:               'https://xetonx.github.io/slyght/icon-192.png',
      badge:              'https://xetonx.github.io/slyght/icon-192.png',
      tag:                payload.tag || 'slyght',
      requireInteraction: false,
      actions:            payload.actions || [],
      data:               { url: 'https://xetonx.github.io/slyght/', tag: payload.tag },
    });

    // Encrypt payload using RFC 8291 aes128gcm
    const { encryptedBody, salt, serverPublicKeyRaw } = await encryptWebPush(bodyStr, p256dh, auth);

    // Build aes128gcm content-encoding header: salt(16) || rs(4) || idlen(1) || keyid(65)
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, 4096, false);
    const header = concat(salt, rs, new Uint8Array([65]), serverPublicKeyRaw);
    const body   = concat(header, encryptedBody);

    // Build VAPID JWT
    const jwt = await buildVapidJwt(endpoint, env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization':    `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type':     'application/octet-stream',
        'TTL':              '86400',
      },
      body,
    });

    if (!response.ok && response.status !== 201) {
      const text = await response.text().catch(() => '');
      console.error(`Push failed ${response.status}:`, text);
    }
    return response.ok || response.status === 201;
  } catch (e) {
    console.error('sendPush error:', e);
    return false;
  }
}

// ─── VAPID JWT (ES256) ────────────────────────────────────────────────────────

async function buildVapidJwt(endpoint, vapidPrivateKeyB64, vapidPublicKeyB64) {
  const origin  = new URL(endpoint).origin;
  const now     = Math.floor(Date.now() / 1000);

  const header  = { typ: 'JWT', alg: 'ES256' };
  const claims  = { aud: origin, exp: now + 43200, sub: 'mailto:johndounas@gmail.com' };

  const encHeader  = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(claims));
  const sigInput   = `${encHeader}.${encPayload}`;

  // Import VAPID private key: raw 32-byte scalar + public key for JWK x/y
  const pubBytes = base64ToBytes(vapidPublicKeyB64); // 65-byte uncompressed EC point
  const x = bytesToB64url(pubBytes.slice(1, 33));
  const y = bytesToB64url(pubBytes.slice(33, 65));
  const d = vapidPrivateKeyB64.replace(/=/g, ''); // raw private key, already base64url

  const jwk = { kty: 'EC', crv: 'P-256', x, y, d };
  const privateKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );

  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(sigInput)
  );

  return `${sigInput}.${bytesToB64url(new Uint8Array(sigBytes))}`;
}

// ─── RFC 8291 PAYLOAD ENCRYPTION ─────────────────────────────────────────────

async function encryptWebPush(plaintext, p256dhB64, authB64) {
  const enc = new TextEncoder();

  const p256dhRaw = base64ToBytes(p256dhB64); // receiver's public key (65 bytes)
  const authBytes = base64ToBytes(authB64);    // auth secret (16 bytes)

  // Generate server EC key pair
  const serverKP = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKP.publicKey)
  );

  // Import receiver public key
  const receiverPub = await crypto.subtle.importKey(
    'raw', p256dhRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverPub }, serverKP.privateKey, 256
  );
  const sharedSecret = new Uint8Array(sharedBits);

  // Random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK = HKDF(IKM=sharedSecret, salt=authBytes, info=keyInfo, L=32)
  const keyInfo = concat(enc.encode('WebPush: info\x00'), p256dhRaw, serverPublicKeyRaw);
  const prk = await hkdf(sharedSecret, authBytes, keyInfo, 32);

  // CEK = HKDF(IKM=prk, salt=salt, info=cekInfo, L=16)
  const cek = await hkdf(prk, salt, enc.encode('Content-Encoding: aes128gcm\x00'), 16);

  // Nonce = HKDF(IKM=prk, salt=salt, info=nonceInfo, L=12)
  const nonce = await hkdf(prk, salt, enc.encode('Content-Encoding: nonce\x00'), 12);

  // AES-128-GCM encrypt — append 0x02 delimiter (last/only record)
  const cekKey   = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded   = concat(enc.encode(plaintext), new Uint8Array([2]));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded);

  return {
    encryptedBody:    new Uint8Array(cipherBuf),
    salt,
    serverPublicKeyRaw,
  };
}

// ─── HKDF HELPER ─────────────────────────────────────────────────────────────

async function hkdf(ikm, salt, info, length) {
  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits   = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, ikmKey, length * 8
  );
  return new Uint8Array(bits);
}

// ─── BASE64 HELPERS ───────────────────────────────────────────────────────────

function b64url(str) {
  return bytesToB64url(new TextEncoder().encode(str));
}

function bytesToB64url(bytes) {
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function concat(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const a of arrs) { out.set(a, offset); offset += a.length; }
  return out;
}
