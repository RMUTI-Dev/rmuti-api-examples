import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    /** claims ของผู้ใช้จาก Keycloak (ขึ้นกับ client scope / mapper ที่ตั้งไว้) */
    profile?: Record<string, unknown>;
    error?: 'RefreshAccessTokenError';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    /** เวลาหมดอายุของ access token (Unix time, วินาที) */
    expiresAt?: number;
    profile?: Record<string, unknown>;
    error?: 'RefreshAccessTokenError';
  }
}
