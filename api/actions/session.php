<?php

require_once __DIR__ . '/../config/config.php';
require __DIR__ . '/../config/conexion.php';

header('Content-Type: application/json; charset=utf-8');

// VERIFICAR SESIÓN ACTIVA

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();

if (isset($_SESSION['user_id'])) {
    $stmt = $conexion->prepare("SELECT hf_api_key FROM usuarios WHERE id = :id");
    $stmt->bindParam(':id', $_SESSION['user_id']);
    $stmt->execute();
    $usuario = $stmt->fetch();
    echo json_encode(['loggedIn' => true, 'nombre' => $_SESSION['nombre'], 'hf_api_key' => $usuario['hf_api_key'] ?? '']);
} else {
    echo json_encode(['loggedIn' => false]);
}
