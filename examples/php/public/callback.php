<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';
startSession();

// 2) Keycloak ส่งกลับมาพร้อม code -> แลก token -> ขอ profile จาก userinfo
$oauth = $_SESSION['oauth'] ?? null;
unset($_SESSION['oauth']);

$code  = $_GET['code'] ?? '';
$state = $_GET['state'] ?? '';
if (isset($_GET['error'])) {
    http_response_code(400);
    exit('Login failed');
}
if ($code === '' || !$oauth || !hash_equals($oauth['state'], (string) $state)) {
    http_response_code(400);
    exit('Invalid login state');
}

try {
    $tokens = postToken([
        'grant_type'    => 'authorization_code',
        'code'          => $code,
        'redirect_uri'  => config('REDIRECT_URI', 'http://localhost:8000/callback.php'),
        'code_verifier' => $oauth['code_verifier'],
    ]);

    [$status, $profile] = httpJson(oidcUrl('userinfo'), [
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $tokens['access_token']],
    ]);
    if ($status !== 200) {
        throw new RuntimeException("Userinfo error $status");
    }
} catch (RuntimeException $e) {
    error_log('Authentication failed: ' . $e->getMessage());
    http_response_code(502);
    exit('Authentication failed');
}

session_regenerate_id(true); // ป้องกัน session fixation
$_SESSION['profile'] = $profile;
$_SESSION['tokens']  = $tokens;

header('Location: index.php');
