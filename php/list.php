<?php
/**
 * list.php — List all saved canvas names
 *
 * Method : GET
 * Returns: JSON array of canvas names (without extension)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$savesDir = __DIR__ . '/saves';

if (!is_dir($savesDir)) {
    echo json_encode([]);
    exit;
}

$files = glob($savesDir . '/*.canvas.json');
$names = [];

foreach ($files as $file) {
    $base = basename($file, '.canvas.json');
    $names[] = $base;
}

sort($names);
echo json_encode($names);
