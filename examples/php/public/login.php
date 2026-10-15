<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';
startSession();

// 1) ส่งผู้ใช้ไปหน้า login ของ Keycloak (Authorization Code + state + PKCE)
$state        = base64url(random_bytes(16));
$codeVerifier = base64url(random_bytes(32));
$_SESSION['oauth'] = ['state' => $state, 'code_verifier' => $codeVerifier];

header('Location: ' . oidcUrl('auth') . '?' . http_build_query([
    'client_id'             => config('KEYCLOAK_CLIENT_ID'),
    'redirect_uri'          => config('REDIRECT_URI', 'http://localhost:8000/callback.php'),
    'response_type'         => 'code',
    'scope'                 => 'openid profile email',
    'state'                 => $state,
    'code_challenge'        => base64url(hash('sha256', $codeVerifier, true)),
    'code_challenge_method' => 'S256',
]));
