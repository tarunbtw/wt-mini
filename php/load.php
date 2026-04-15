<?php
/**
 * load.php — Load a saved canvas JSON from disk
 *
 * Method : GET
 * Param  : ?name=canvas-name
 * Returns: JSON canvas payload | 404
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$name = isset($_GET['name']) ? $_GET['name'] : '';
$name = preg_replace('/[^a-zA-Z0-9 _\-]/', '', $name);
$name = trim($name);

if (!$name) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing name parameter']);
    exit;
}

$savesDir = __DIR__ . '/saves';
$filename = $savesDir . '/' . $name . '.canvas.json';

if (!file_exists($filename)) {
    http_response_code(404);
    echo json_encode(['error' => 'Canvas not found: ' . $name]);
    exit;
}

$content = file_get_contents($filename);
if ($content === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to read file']);
    exit;
}

// Return the stored JSON directly
echo $content;
