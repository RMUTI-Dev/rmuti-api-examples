import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { refreshAccessToken } from '@/lib/auth';

// ตัวอย่างเรียก RMUTI API ด้วย access token ของผู้ใช้ที่ login อยู่ (เรียกจากฝั่ง server เท่านั้น)
export async function GET(req: NextRequest) {
  const apiUrl = process.env.PROFILE_API_URL;
  if (!apiUrl) return NextResponse.json({ error: 'PROFILE_API_URL is not configured' }, { status: 404 });

  let token = await getToken({ req });
  if (!token?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // access token ใน cookie อาจหมดอายุแล้ว -> ขอใหม่ก่อนเรียก API
  if (token.expiresAt && Date.now() >= (token.expiresAt - 30) * 1000) {
    token = await refreshAccessToken(token);
    if (token.error) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (!res.ok) return NextResponse.json({ error: 'RMUTI API error' }, { status: res.status });
  return NextResponse.json(await res.json());
}
