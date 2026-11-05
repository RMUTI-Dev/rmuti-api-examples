<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';
startSession();

// 1) ส่งผู้ใช้ไปหน้า login ของ Keycloak (Authorization Code + state + PKCE)
$state        = base64url(random_bytes(16));
$codeVerifier = base64url(random_bytes(32));
$_SESSION['oauth'] = ['state' => $state, 'code_verifier' => $codeVerifier];

// scope ที่ระบบได้รับอนุมัติ (ดูได้ที่หน้า My Apps ของ api-portal) ต้องมี openid เสมอ
$extraScopes = array_diff(preg_split('/\s+/', (string) config('KEYCLOAK_SCOPE', 'openid'), -1, PREG_SPLIT_NO_EMPTY), ['openid']);
$scope = implode(' ', array_merge(['openid'], $extraScopes));

header('Location: ' . oidcUrl('auth') . '?' . http_build_query([
    'client_id'             => config('KEYCLOAK_CLIENT_ID'),
    'redirect_uri'          => config('REDIRECT_URI', 'http://localhost:8000/callback.php'),
    'response_type'         => 'code',
    'scope'                 => $scope,
    'state'                 => $state,
    'code_challenge'        => base64url(hash('sha256', $codeVerifier, true)),
    'code_challenge_method' => 'S256',
]));
