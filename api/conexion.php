<?php

$dbNombre  = 'morphos_db';
$dbUsuario = 'root';
$dbClave   = '';

try {
    $conexion = new PDO(
        "mysql:dbname=$dbNombre;charset=utf8mb4",
        $dbUsuario,
        $dbClave
    );
    $conexion->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    $conexion = null;
}
