<?php

$host = "localhost";
$user = "root";
$pass = "";
$db = "morphos";

try {

    // 1. Conexión sin BD
    $conexion = new PDO("mysql:host=$host", $user, $pass);
    $conexion->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 2. Crear BD
    $conexion->exec("CREATE DATABASE IF NOT EXISTS $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    // 3. Usar BD
    $conexion->exec("USE $db");

    // 4. Tabla usuarios
    $conexion->exec("
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            hf_api_key VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ");

    echo "Base de datos y tablas creadas correctamente.";

} catch (PDOException $e) {
    echo "Error en setup: " . $e->getMessage();
}
