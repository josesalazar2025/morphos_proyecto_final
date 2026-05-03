<?php

// CONFIGURACIÓN DE SESIÓN

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();

// VERIFICAR AUTENTICACIÓN

if (!isset($_SESSION['user_id'])) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit;
}
