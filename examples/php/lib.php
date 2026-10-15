<?php
declare(strict_types=1);

// โหลด .env (ถ้ามี) — ค่าที่ตั้งผ่าน environment ของระบบจะมีความสำคัญกว่า
$envFile = __DIR__ . '/.env';
if (is_readable($envFile)) {
    foreach (parse_ini_file($envFile, false, INI_SCANNER_RAW) ?: [] as $key => $value) {
        if (getenv($key) === false) {
            putenv("$key=" . trim($value, "\"'"));
        }
    }
}

function config(string $key, ?string $default = null): string
{
    $value = getenv($key);
    if ($value === false || $value === '') {
        if ($default === null) {
            throw new RuntimeException("Missing environment variable: $key");
        }
        return $default;
    }
    return $value;
}

function oidcUrl(string $path): string
{
    return config('KEYCLOAK_ISSUER') . '/protocol/openid-connect/' . $path;
}

function startSession(): void
{
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']),
    ]);
    session_start();
}

function h(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function base64url(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

/** ส่ง HTTP request ด้วย cURL แล้วคืน [status, decoded JSON] */
function httpJson(string $url, array $options = []): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10] + $options);
    $body = curl_exec($ch);
    if ($body === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException("HTTP request failed: $error");
    }
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, json_decode($body, true)];
}

function postToken(array $params): array
{
    [$status, $data] = httpJson(oidcUrl('token'), [
        CURLOPT_POST       => true,
        CURLOPT_POSTFIELDS => http_build_query($params + [
            'client_id'     => config('KEYCLOAK_CLIENT_ID'),
            'client_secret' => config('KEYCLOAK_CLIENT_SECRET'),
        ]),
    ]);
    if ($status !== 200 || !isset($data['access_token'])) {
        throw new RuntimeException('Token endpoint error: ' . ($data['error_description'] ?? $data['error'] ?? $status));
    }
    return [
        'access_token'  => $data['access_token'],
        'refresh_token' => $data['refresh_token'] ?? null,
        'id_token'      => $data['id_token'] ?? null,
        'expires_at'    => time() + (int) $data['expires_in'],
    ];
}

/** คืน access token ที่ยังไม่หมดอายุ (ถ้าหมดจะใช้ refresh token ขอใหม่ให้อัตโนมัติ) */
function getAccessToken(): ?string
{
    $tokens = $_SESSION['tokens'] ?? null;
    if (!$tokens) {
        return null;
    }
    if (time() < $tokens['expires_at'] - 30) {
        return $tokens['access_token'];
    }
    if (empty($tokens['refresh_token'])) {
        return null;
    }
    $fresh = postToken(['grant_type' => 'refresh_token', 'refresh_token' => $tokens['refresh_token']]);
    $fresh['id_token'] ??= $tokens['id_token'];
    $_SESSION['tokens'] = $fresh;
    return $fresh['access_token'];
}
