<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';
startSession();

// 4) Logout: ล้าง session ในแอป และจบ SSO session ที่ Keycloak
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit;
}

$idToken = $_SESSION['tokens']['id_token'] ?? null;
$_SESSION = [];
session_destroy();

$params = [
    'post_logout_redirect_uri' => config('POST_LOGOUT_REDIRECT_URI', 'http://localhost:8000/'),
    'client_id'                => config('KEYCLOAK_CLIENT_ID'),
];
if ($idToken) {
    $params['id_token_hint'] = $idToken;
}
header('Location: ' . oidcUrl('logout') . '?' . http_build_query($params));
