<?php

header('Content-Type: text/html; charset=utf-8');

$dbHost    = 'localhost';
$dbUsuario = 'root';
$dbClave   = '';
$dbNombre  = 'morphos_db';

try {
    $conexion = new PDO("mysql:charset=utf8mb4", $dbUsuario, $dbClave);
    $conexion->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $conexion->exec("CREATE DATABASE IF NOT EXISTS `$dbNombre`
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $conexion->exec("USE `$dbNombre`");

    $conexion->exec("
        CREATE TABLE IF NOT EXISTS usuarios (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            nombre     VARCHAR(100) NOT NULL,
            apellido   VARCHAR(100) NOT NULL,
            email      VARCHAR(150) NOT NULL UNIQUE,
            password   VARCHAR(255) NOT NULL,
            creado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    echo "<p style='font-family:sans-serif;color:green'>✓ Base de datos <strong>$dbNombre</strong> y tabla <strong>usuarios</strong> listas.</p>";
    echo "<p style='font-family:sans-serif'><a href='../index.html'>← Volver a Morphos</a></p>";

} catch (PDOException $e) {
    echo "<p style='font-family:sans-serif;color:red'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
}
