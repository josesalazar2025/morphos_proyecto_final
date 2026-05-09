<?php

$dbHost = '127.0.0.1';
$dbUsuario = 'root';
$dbClave = '';
$dbNombre = 'morphos_db';
$dbPort = 3306;

foreach (file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if (str_starts_with($line, 'DB_PORT=')) $dbPort = (int) trim(substr($line, 8));
}

try {
    $conexion = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbNombre;charset=utf8mb4", $dbUsuario, $dbClave);
    $conexion->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    $conexion = null;
}
