<?php

header('Content-Type: application/json; charset=utf-8');

// VERIFICAR SESIÓN ACTIVA

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();

if (isset($_SESSION['user_id'])) {
    echo json_encode(['loggedIn' => true, 'nombre' => $_SESSION['nombre']]);
} else {
    echo json_encode(['loggedIn' => false]);
}
