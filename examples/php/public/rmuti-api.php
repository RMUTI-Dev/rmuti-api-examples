<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';
startSession();

// 3) ตัวอย่างเรียก RMUTI API ด้วย access token
$apiUrl = getenv('PROFILE_API_URL');
if (!$apiUrl) {
    http_response_code(404);
    exit('PROFILE_API_URL is not configured');
}

try {
    $accessToken = getAccessToken();
    if (!$accessToken) {
        header('Location: login.php');
        exit;
    }
    [$status, $data] = httpJson($apiUrl, [
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
    ]);
} catch (RuntimeException $e) {
    error_log('RMUTI API call failed: ' . $e->getMessage());
    header('Location: login.php'); // refresh token หมดอายุ -> ให้ login ใหม่
    exit;
}

if ($status !== 200) {
    http_response_code($status);
    exit("RMUTI API error $status");
}
?>
<!doctype html>
<meta charset="utf-8">
<title>RMUTI API</title>
<h1>RMUTI API</h1>
<pre><?= h(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) ?></pre>
<a href="index.php">กลับ</a>
