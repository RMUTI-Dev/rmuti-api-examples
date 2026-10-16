// เรียก RMUTI API จากหลังบ้านด้วย HTTP Basic auth (ไม่มีผู้ใช้ login — ไม่ต้องขอ token จาก Keycloak)
// รัน: node --env-file=.env nodejs.mjs
const { RMUTI_API_URL, RMUTI_API_USERNAME, RMUTI_API_PASSWORD } = process.env;
for (const [k, v] of Object.entries({ RMUTI_API_URL, RMUTI_API_USERNAME, RMUTI_API_PASSWORD })) {
  if (!v) throw new Error(`Missing environment variable: ${k}`);
}

const basic = Buffer.from(`${RMUTI_API_USERNAME}:${RMUTI_API_PASSWORD}`).toString('base64');

const res = await fetch(RMUTI_API_URL, { headers: { Authorization: `Basic ${basic}` } });
if (!res.ok) throw new Error(`RMUTI API error ${res.status}`);
console.log(await res.json());
