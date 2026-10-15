<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';
startSession();

$profile = $_SESSION['profile'] ?? null;
?>
<!doctype html>
<meta charset="utf-8">
<title>RMUTI Passport - PHP</title>
<?php if ($profile): ?>
    <h1>Login Success</h1>
    <h2>Profile จาก Keycloak (userinfo)</h2>
    <pre><?= h(json_encode($profile, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) ?></pre>
    <?php if (getenv('PROFILE_API_URL')): ?>
        <p><a href="rmuti-api.php">เรียก RMUTI API ด้วย token</a></p>
    <?php endif; ?>
    <form method="post" action="logout.php"><button>Logout</button></form>
<?php else: ?>
    <h1>RMUTI Passport (PHP)</h1>
    <a href="login.php">Login with RMUTI Passport</a>
<?php endif; ?>
