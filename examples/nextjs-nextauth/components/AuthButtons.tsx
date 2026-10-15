'use client';

import { useState } from 'react';
import { signIn, signOut } from 'next-auth/react';

export function LoginButton() {
  return <button onClick={() => signIn('keycloak')}>Login with RMUTI Passport</button>;
}

export function LogoutButton() {
  return <button onClick={() => signOut({ callbackUrl: '/' })}>Logout</button>;
}

/** ตัวอย่างเรียก RMUTI API ผ่าน route handler ฝั่ง server (/api/rmuti-api) */
export function CallApiButton() {
  const [result, setResult] = useState<string>();

  async function callApi() {
    const res = await fetch('/api/rmuti-api');
    setResult(JSON.stringify(await res.json(), null, 2));
  }

  return (
    <>
      <button onClick={callApi}>เรียก RMUTI API ด้วย token</button>
      {result && <pre>{result}</pre>}
    </>
  );
}
