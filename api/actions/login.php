<?php

require_once __DIR__ . '/../config/config.php';
require __DIR__ . '/../config/conexion.php';

header('Content-Type: application/json; charset=utf-8');

// VERIFICAR MÉTODO

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

// RECOGER DATOS

$datos = json_decode(file_get_contents('php://input'), true);
$email = trim($datos['email'] ?? '');
$password = $datos['password'] ?? '';

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Campos requeridos']);
    exit;
}

// BUSCAR USUARIO

$sql = "SELECT id, nombre, password_hash, hf_api_key FROM usuarios WHERE email = :email";
$stmt = $conexion->prepare($sql);
$stmt->bindParam(':email', $email);
$stmt->execute();

$usuario = $stmt->fetch();

// VERIFICAR CONTRASEÑA

if (!$usuario || !password_verify($password, $usuario['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Correo o contraseña incorrectos']);
    exit;
}

// INICIAR SESIÓN

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();
session_regenerate_id(true);

$_SESSION['user_id'] = $usuario['id'];
$_SESSION['nombre'] = $usuario['nombre'];

echo json_encode(['ok' => true, 'nombre' => $usuario['nombre'], 'hf_api_key' => $usuario['hf_api_key'] ?? '']);
