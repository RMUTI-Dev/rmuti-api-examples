import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import KeycloakProvider from 'next-auth/providers/keycloak';

const issuer = process.env.KEYCLOAK_ISSUER!;
const oidc = `${issuer}/protocol/openid-connect`;

/** ใช้ refresh token ขอ access token ใหม่จาก Keycloak */
export async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${oidc}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        refresh_token: token.refreshToken!,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description ?? data.error);

    return {
      ...token,
      accessToken: data.access_token,
      idToken: data.id_token ?? token.idToken,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      error: undefined,
    };
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    // provider นี้เปิด PKCE + state ให้อัตโนมัติ
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer,
      authorization: { params: { scope: 'openid profile email' } },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 ชั่วโมง
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // ครั้งแรกหลัง login: เก็บ token และ profile (claims จาก Keycloak)
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          idToken: account.id_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          profile: profile as Record<string, unknown> | undefined,
        };
      }
      // access token ยังไม่หมดอายุ
      if (token.expiresAt && Date.now() < (token.expiresAt - 30) * 1000) return token;
      // หมดอายุแล้ว -> ขอใหม่
      return token.refreshToken ? refreshAccessToken(token) : token;
    },
    // เปิดเผยให้ฝั่ง client เฉพาะ profile — ไม่ส่ง token ออกไป (token อยู่ใน cookie แบบ httpOnly ที่เข้ารหัสแล้ว)
    async session({ session, token }) {
      session.profile = token.profile;
      session.error = token.error;
      return session;
    },
  },
  events: {
    // ปิด SSO session ที่ Keycloak ด้วย (signOut ของ NextAuth ล้างเฉพาะ session ในแอป)
    async signOut({ token }) {
      if (!token.idToken) return;
      try {
        await fetch(`${oidc}/logout?` + new URLSearchParams({ id_token_hint: token.idToken }));
      } catch (error) {
        console.error('Keycloak logout failed:', error);
      }
    },
  },
};
