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

    // POST /sync — SLYGHT sends current financial state
    if (path === '/sync' && request.method === 'POST') {
      try {
        const body = await request.json();
        const state = {
          bal:               parseFloat((body.bal || 0).toFixed(2)),
          maxDay:            parseFloat((body.maxDay || 0).toFixed(2)),
          daysLeft:          body.daysLeft || 0,
          survivalMode:      body.survivalMode || 'normal',
          todaySpent:        parseFloat((body.todaySpent || 0).toFixed(2)),
          lunchSpend:        parseFloat((body.lunchSpend || 0).toFixed(2)),
          lunchLogged:       body.lunchLogged || false,
          breakfastLogged:   body.breakfastLogged || false,
          groceryDismissed:  body.groceryDismissed || false,
          lastSync:          new Date().toISOString(),
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

    return new Response('SLYGHT Worker OK', { headers: corsHeaders });
  },

  // Cron trigger handler
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleSchedule(event.cron, env));
  },
};

// ─── SCHEDULE HANDLER ─────────────────────────────────────────────────────────

async function handleSchedule(cron, env) {
  const state    = JSON.parse(await env.SLYGHT_DATA.get('state') || '{}');
  const sub      = JSON.parse(await env.SLYGHT_DATA.get('push_subscription') || 'null');
  const dismissed = JSON.parse(await env.SLYGHT_DATA.get('dismissed') || '{}');
  if (!sub) return;

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);

  const dayName = parts.find(p => p.type === 'weekday')?.value;
  const isOfficeDay = ['Monday', 'Thursday', 'Friday'].includes(dayName);
  const isGfDay    = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'].includes(dayName);
  const isSunday   = dayName === 'Sunday';

  const bal         = state.bal || 0;
  const maxDay      = state.maxDay || 0;
  const survivalMode = state.survivalMode || 'normal';
  const todaySpent  = state.todaySpent || 0;
  const lunchSpend  = state.lunchSpend || 0;

  // Stale state guard — if last sync > 48h ago, don't send aggressive nudges
  const lastSync    = state.lastSync ? new Date(state.lastSync) : null;
  const staleState  = !lastSync || (now - lastSync) > 48 * 60 * 60 * 1000;

  // ── 9:00am Sydney (UTC 22:00 prev day AEDT / 23:00 AEST) ──────────────────
  if (cron === '0 23 * * *' || cron === '0 22 * * *') {
    const title = survivalMode === 'critical'
      ? '🚨 SLYGHT — Critical'
      : survivalMode === 'survival'
      ? '⚠️ SLYGHT — Tight'
      : '💰 Good morning, John';

    const body = survivalMode === 'critical'
      ? `Balance: $${bal.toFixed(2)}. Do not spend today — payday in ${state.daysLeft} days.`
      : survivalMode === 'survival'
      ? `Balance: $${bal.toFixed(2)}. Max today: $${maxDay.toFixed(2)}. Stay disciplined.`
      : `Balance: $${bal.toFixed(2)} · Up to $${maxDay.toFixed(2)} today${isGfDay ? ' — gf day 💕' : ''}.`;

    await sendPush(sub, env, { title, body, tag: 'morning', actions: [{ action: 'open', title: '📊 Open SLYGHT' }] });
  }

  // ── 10:00am Sydney — Breakfast check (office days only) ───────────────────
  if ((cron === '0 0 * * *' || cron === '0 23 * * *') && isOfficeDay && !state.breakfastLogged) {
    await sendPush(sub, env, {
      title: '☕ Breakfast logged?',
      body: isGfDay
        ? 'Morning! Did you grab coffee or breakfast? Log it to stay on track.'
        : 'Did you grab coffee on the way in? Tap to log it.',
      tag: 'breakfast',
      actions: [{ action: 'no-spend', title: '✅ No spend' }, { action: 'log', title: '📝 Log it' }],
    });
  }

  // ── 12:30pm Sydney (UTC 02:30) ────────────────────────────────────────────
  if (cron === '30 2 * * *') {
    const lunchBudget = isGfDay ? 25 : 15;
    if (!state.lunchLogged) {
      await sendPush(sub, env, {
        title: '🍱 Lunch time',
        body: `You have $${maxDay.toFixed(2)}/day. Try to keep lunch under $${lunchBudget}.`,
        tag: 'lunch',
        actions: [{ action: 'no-spend', title: '🏠 Eating from home' }, { action: 'log', title: '📝 Log lunch' }],
      });
    } else {
      await sendPush(sub, env, {
        title: '✅ Lunch logged',
        body: `$${todaySpent.toFixed(2)} today · $${Math.max(0, maxDay - todaySpent).toFixed(2)} remaining.`,
        tag: 'lunch-feedback',
      });
    }
  }

  // ── 2:00pm Sydney (UTC 04:00) ─────────────────────────────────────────────
  if (cron === '0 4 * * *') {
    let body;
    if (lunchSpend > 25) {
      body = `You spent $${lunchSpend.toFixed(2)} at lunch. Skip the afternoon snack — water will do. 💪`;
    } else if (todaySpent > maxDay * 0.8) {
      body = "You're at 80% of today's budget. Skip the afternoon snack.";
    } else if (survivalMode !== 'normal') {
      body = `Tight week — skip the afternoon snack. $${maxDay.toFixed(2)} is your daily max.`;
    } else {
      body = 'Afternoon snack time? Keep it under $10.';
    }
    await sendPush(sub, env, {
      title: '🥤 Afternoon check',
      body,
      tag: 'snack',
      actions: [{ action: 'no-spend', title: '✅ No snack' }, { action: 'log', title: '📝 Log it' }],
    });
  }

  // ── 6:30pm Sydney (UTC 08:30) — Home time ────────────────────────────────
  if (cron === '30 8 * * *' && isOfficeDay) {
    const groceryMsg = isGfDay
      ? "On the way to your gf's? Great time to grab groceries and meal prep for the week 💪"
      : 'Heading home? Grab groceries now and meal prep this weekend = money saved all week.';
    await sendPush(sub, env, {
      title: '🏠 Heading home?',
      body: groceryMsg,
      tag: 'hometime',
      actions: [
        { action: 'groceries', title: '🛒 Getting groceries' },
        { action: 'no-spend', title: '✅ Going straight home' },
      ],
    });
  }

  // ── Sunday 3pm (UTC 05:00 Sunday) ─────────────────────────────────────────
  if (cron === '0 5 * * 0' && !state.groceryDismissed) {
    await sendPush(sub, env, {
      title: '🛒 Sunday groceries',
      body: 'Good afternoon! Great time to do the weekly shop. Meal prep today = less spending this week.',
      tag: 'grocery-sunday',
      actions: [
        { action: 'groceries-done', title: '✅ Groceries sorted' },
        { action: 'later', title: '⏰ Remind me tonight' },
      ],
    });
  }

  // ── Sunday 8pm (UTC 10:00 Sunday) ─────────────────────────────────────────
  if (cron === '0 10 * * 0' && !state.groceryDismissed) {
    await sendPush(sub, env, {
      title: '🛒 Groceries sorted?',
      body: 'Last chance before the week starts. Meal prep = money saved 💪',
      tag: 'grocery-sunday-night',
      actions: [
        { action: 'groceries-done', title: '✅ All sorted' },
        { action: 'open', title: '📊 Check budget' },
      ],
    });
  }
}

// ─── WEB PUSH SENDER (RFC 8291 VAPID + aes128gcm) ────────────────────────────

async function sendPush(subscription, env, payload) {
  try {
    const endpoint = subscription.endpoint;
    const { p256dh, auth } = subscription.keys || {};
    if (!endpoint || !p256dh || !auth) return false;

    const bodyStr = JSON.stringify({
      title:            payload.title,
      body:             payload.body,
      icon:             'https://xetonx.github.io/slyght/icon-192.png',
      badge:            'https://xetonx.github.io/slyght/icon-192.png',
      tag:              payload.tag || 'slyght',
      requireInteraction: false,
      actions:          payload.actions || [],
      data:             { url: 'https://xetonx.github.io/slyght/', tag: payload.tag },
    });

    // Encrypt payload using RFC 8291 aes128gcm
    const { encryptedBody, salt, serverPublicKeyRaw } = await encryptWebPush(bodyStr, p256dh, auth);

    // Build aes128gcm content-encoding header: salt(16) || rs(4) || idlen(1) || keyid(65)
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, 4096, false);
    const header = concat(salt, rs, new Uint8Array([65]), serverPublicKeyRaw);
    const body = concat(header, encryptedBody);

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

// ─── RFC 8291 PAYLOAD ENCRYPTION ──────────────────────────────────────────────

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
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded  = concat(enc.encode(plaintext), new Uint8Array([2]));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded);

  return {
    encryptedBody:    new Uint8Array(cipherBuf),
    salt,
    serverPublicKeyRaw,
  };
}

// ─── HKDF HELPER ──────────────────────────────────────────────────────────────

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
