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
$nombre = trim($datos['nombre'] ?? '');
$email = trim($datos['email'] ?? '');
$password = $datos['password'] ?? '';
$password2 = $datos['password2'] ?? '';
$hfKey = trim($datos['hf_key'] ?? '');

// VALIDAR DATOS

$errores = [];

if (!preg_match('/^[\p{L}\s\-\.]{2,100}$/u', $nombre)) {
    $errores['nombre'] = 'Nombre inválido (2-100 caracteres, solo letras)';
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errores['email'] = 'Correo electrónico inválido';
}

if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/', $password)) {
    $errores['password'] = 'Mín. 8 caracteres, una mayúscula, una minúscula y un número';
}

if ($password !== $password2) {
    $errores['password2'] = 'Las contraseñas no coinciden';
}

if (!preg_match('/^hf_[A-Za-z0-9]{10,}$/', $hfKey)) {
    $errores['hf_key'] = 'API Key inválida (debe comenzar con hf_ seguido de al menos 10 caracteres)';
}

if (!empty($errores)) {
    http_response_code(422);
    echo json_encode(['errors' => $errores]);
    exit;
}

// INSERTAR USUARIO

try {

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    $sql = "INSERT INTO usuarios (nombre, email, password_hash, hf_api_key)
            VALUES (:nombre, :email, :password_hash, :hf_api_key)";

    $stmt = $conexion->prepare($sql);
    $stmt->bindParam(':nombre', $nombre);
    $stmt->bindParam(':email', $email);
    $stmt->bindParam(':password_hash', $hash);
    $stmt->bindParam(':hf_api_key', $hfKey);
    $stmt->execute();

    echo json_encode(['ok' => true]);

} catch (PDOException $e) {

    if ($e->getCode() == 23000) {
        http_response_code(409);
        echo json_encode(['errors' => ['email' => 'Este correo ya está registrado']]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Error interno del servidor']);
    }
}
