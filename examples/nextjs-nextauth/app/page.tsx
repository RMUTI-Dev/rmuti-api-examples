import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CallApiButton, LoginButton, LogoutButton } from '@/components/AuthButtons';

export default async function Home() {
  const session = await getServerSession(authOptions);

  // refresh token หมดอายุ หรือถูกเพิกถอน -> ต้อง login ใหม่
  if (!session || session.error) {
    return (
      <main>
        <h1>RMUTI Passport (Next.js)</h1>
        {session?.error && <p>Session หมดอายุ กรุณา login ใหม่</p>}
        <LoginButton />
      </main>
    );
  }

  return (
    <main>
      <h1>Login Success</h1>
      <h2>Profile จาก Keycloak</h2>
      <pre>{JSON.stringify(session.profile, null, 2)}</pre>
      <CallApiButton />
      <LogoutButton />
    </main>
  );
}
