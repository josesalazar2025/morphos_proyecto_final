<?php

header('Content-Type: application/json; charset=utf-8');

// CERRAR SESIÓN

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();

$_SESSION = [];
session_destroy();

echo json_encode(['ok' => true]);
