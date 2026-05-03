<?php

require_once __DIR__ . '/../config/config.php';
require __DIR__ . '/../includes/auth.php';
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
$prompt = trim($datos['prompt'] ?? '');
$imagenes = is_array($datos['images'] ?? null) ? $datos['images'] : [];

if (!$prompt) {
    http_response_code(400);
    echo json_encode(['error' => 'El campo prompt es requerido']);
    exit;
}

// OBTENER API KEY DEL USUARIO

$sql = "SELECT hf_api_key FROM usuarios WHERE id = :id";
$stmt = $conexion->prepare($sql);
$stmt->bindParam(':id', $_SESSION['user_id']);
$stmt->execute();

$usuario = $stmt->fetch();
$apiKey = $usuario['hf_api_key'] ?? '';

if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'API Key no configurada']);
    exit;
}

// CONSTRUIR CONTENIDO DEL MENSAJE

// Validar e incluir imágenes si las hay
$contenido = [];

foreach ($imagenes as $imagen) {
    if (is_string($imagen) && preg_match('/^data:image\/(jpeg|png|gif|webp);base64,/', $imagen)) {
        $contenido[] = ['type' => 'image_url', 'image_url' => ['url' => $imagen]];
    }
}

$contenido[] = ['type' => 'text', 'text' => $prompt];

// Si solo hay texto, enviarlo como string simple
if (count($contenido) === 1) {
    $contenido = $prompt;
}

// LLAMAR A HUGGINGFACE

$payload = json_encode([
    'model' => 'google/medgemma-4b-it',
    'messages' => [['role' => 'user', 'content' => $contenido]],
    'max_tokens' => 600,
]);

$ch = curl_init('https://api-inference.huggingface.co/models/google/medgemma-4b-it/v1/chat/completions');

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
    ],
    CURLOPT_TIMEOUT => 60,
]);

$respuesta = curl_exec($ch);
$codigoHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$errorCurl = curl_error($ch);

// DEVOLVER RESPUESTA

if ($errorCurl) {
    http_response_code(502);
    echo json_encode(['error' => 'Error de conexión: ' . $errorCurl]);
    exit;
}

http_response_code($codigoHttp);
echo $respuesta;
