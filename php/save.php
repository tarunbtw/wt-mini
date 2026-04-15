<?php
/**
 * save.php — Save a canvas JSON to disk
 *
 * Method : POST
 * Body   : JSON { name, shapes, zoom, panX, panY }
 * Returns: JSON { success, file } | { success, error }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'POST required']);
    exit;
}

$body = file_get_contents('php://input');
$data = json_decode($body, true);

if (!$data || !isset($data['name'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid JSON or missing name']);
    exit;
}

// Sanitise canvas name — only alphanumeric, dashes, underscores, spaces
$name = preg_replace('/[^a-zA-Z0-9 _\-]/', '', $data['name']);
$name = trim($name) ?: 'untitled';

// Ensure saves directory exists
$savesDir = __DIR__ . '/saves';
if (!is_dir($savesDir)) {
    mkdir($savesDir, 0755, true);
}

$filename = $savesDir . '/' . $name . '.canvas.json';

$payload = json_encode([
    'name'   => $name,
    'shapes' => $data['shapes'] ?? [],
    'zoom'   => $data['zoom']   ?? 1,
    'panX'   => $data['panX']   ?? 0,
    'panY'   => $data['panY']   ?? 0,
    'savedAt' => date('c'),
], JSON_PRETTY_PRINT);

if (file_put_contents($filename, $payload) === false) {
    echo json_encode(['success' => false, 'error' => 'Could not write file']);
    exit;
}

echo json_encode(['success' => true, 'file' => $name]);
