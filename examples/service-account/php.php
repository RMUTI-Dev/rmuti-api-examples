<?php
declare(strict_types=1);

// เรียก RMUTI API จากหลังบ้านด้วย HTTP Basic auth (ไม่มีผู้ใช้ login — ไม่ต้องขอ token จาก Keycloak)
// รัน: php php.php   (อ่านค่าจากไฟล์ .env ในโฟลเดอร์นี้ หรือจาก environment ของระบบ)

foreach (parse_ini_file(__DIR__ . '/.env', false, INI_SCANNER_RAW) ?: [] as $key => $value) {
    if (getenv($key) === false) {
        putenv("$key=" . trim($value, "\"'"));
    }
}

function env(string $key): string
{
    $value = getenv($key);
    if ($value === false || $value === '') {
        throw new RuntimeException("Missing environment variable: $key");
    }
    return $value;
}

$ch = curl_init(env('RMUTI_API_URL'));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPAUTH       => CURLAUTH_BASIC, // cURL สร้างหัว Authorization: Basic ให้
    CURLOPT_USERPWD        => env('RMUTI_API_USERNAME') . ':' . env('RMUTI_API_PASSWORD'),
]);
$body = curl_exec($ch);
if ($body === false) {
    throw new RuntimeException('HTTP request failed: ' . curl_error($ch));
}
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($status !== 200) {
    throw new RuntimeException("RMUTI API error $status");
}
print_r(json_decode($body, true));
