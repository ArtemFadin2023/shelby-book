<?php
/**
 * shelby-book API v3
 * Единый бэкенд для хранения данных сайта
 * Все данные хранятся в data.json — читают все пользователи
 */

// ── CORS ──
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Файлы хранилища ──
define('DATA_FILE',    __DIR__ . '/shelby_data.json');
define('IMAGES_FILE',  __DIR__ . '/shelby_images.json');
define('PASSWORD_FILE',__DIR__ . '/shelby_pass.json');

// ── Вспомогательные функции ──
function readJson($file, $default = []) {
    if (!file_exists($file)) return $default;
    $raw = file_get_contents($file);
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $default;
}

function writeJson($file, $data) {
    $dir = dirname($file);
    if (!is_writable($dir)) {
        return false;
    }
    return file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) !== false;
}

function respond($ok, $data = [], $message = '') {
    echo json_encode(['ok' => $ok, 'data' => $data, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Проверка пароля (для защищённых операций) ──
function checkAdminPassword($inputPass) {
    $passData = readJson(PASSWORD_FILE, ['pass' => 'agama2026', 'user' => 'shelby']);
    return $inputPass === $passData['pass'];
}

// ── Маршрутизация ──
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Для POST запросов — читаем JSON body
$body = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true) ?? [];
    // Также поддерживаем POST params
    if (empty($body)) $body = $_POST;
}

switch ($action) {

    // ════════════════════════════════════════
    // GET /api.php?action=load
    // Возвращает все данные сайта для всех
    // ════════════════════════════════════════
    case 'load':
        $data   = readJson(DATA_FILE,   []);
        $images = readJson(IMAGES_FILE, []);
        respond(true, array_merge($data, $images));

    // ════════════════════════════════════════
    // POST /api.php?action=save
    // Сохраняет данные (только admin)
    // Body: { pass, key, value }
    // ════════════════════════════════════════
    case 'save':
        $pass  = $body['pass']  ?? '';
        $key   = $body['key']   ?? '';
        $value = $body['value'] ?? null;

        if (!checkAdminPassword($pass)) {
            respond(false, [], 'Неверный пароль');
        }
        if (empty($key)) {
            respond(false, [], 'Не указан ключ');
        }

        // Изображения (base64) храним отдельно — они большие
        $imgKeys = [
            'sb_hero_image', 'sb_board_photo1', 'sb_board_photo2',
            'sb_morph_photos', 'sb_habitat_photos',
        ];
        // Ключи лекционных фото тоже в images
        if (in_array($key, $imgKeys) || strpos($key, '_photo') !== false || strpos($key, '_image') !== false) {
            $images = readJson(IMAGES_FILE, []);
            $images[$key] = $value;
            if (!writeJson(IMAGES_FILE, $images)) {
                respond(false, [], 'Ошибка записи images');
            }
        } else {
            $data = readJson(DATA_FILE, []);
            $data[$key] = $value;
            if (!writeJson(DATA_FILE, $data)) {
                respond(false, [], 'Ошибка записи data');
            }
        }

        respond(true, [], 'Сохранено');

    // ════════════════════════════════════════
    // POST /api.php?action=save_all
    // Сохраняет сразу весь объект данных
    // Body: { pass, data: {...} }
    // ════════════════════════════════════════
    case 'save_all':
        $pass     = $body['pass']     ?? '';
        $newData  = $body['data']     ?? [];
        $newImages = $body['images']  ?? [];

        if (!checkAdminPassword($pass)) {
            respond(false, [], 'Неверный пароль');
        }

        if (!empty($newData)) {
            $existing = readJson(DATA_FILE, []);
            $merged = array_merge($existing, $newData);
            if (!writeJson(DATA_FILE, $merged)) {
                respond(false, [], 'Ошибка записи data');
            }
        }

        if (!empty($newImages)) {
            $existImg = readJson(IMAGES_FILE, []);
            $mergedImg = array_merge($existImg, $newImages);
            if (!writeJson(IMAGES_FILE, $mergedImg)) {
                respond(false, [], 'Ошибка записи images');
            }
        }

        respond(true, [], 'Всё сохранено');

    // ════════════════════════════════════════
    // POST /api.php?action=change_pass
    // Смена пароля
    // Body: { old_pass, new_pass, user }
    // ════════════════════════════════════════
    case 'change_pass':
        $oldPass = $body['old_pass'] ?? '';
        $newPass = $body['new_pass'] ?? '';
        $user    = $body['user']     ?? 'shelby';

        if (!checkAdminPassword($oldPass)) {
            respond(false, [], 'Неверный текущий пароль');
        }
        if (strlen($newPass) < 4) {
            respond(false, [], 'Пароль слишком короткий');
        }

        if (!writeJson(PASSWORD_FILE, ['user' => $user, 'pass' => $newPass])) {
            respond(false, [], 'Ошибка сохранения пароля');
        }

        respond(true, [], 'Пароль изменён');

    // ════════════════════════════════════════
    // POST /api.php?action=verify_pass
    // Проверяет пароль при логине
    // Body: { user, pass }
    // ════════════════════════════════════════
    case 'verify_pass':
        $inputUser = $body['user'] ?? '';
        $inputPass = $body['pass'] ?? '';

        $passData = readJson(PASSWORD_FILE, ['pass' => 'agama2026', 'user' => 'shelby']);

        if ($inputUser === $passData['user'] && $inputPass === $passData['pass']) {
            respond(true, [], 'OK');
        } else {
            respond(false, [], 'Неверный логин или пароль');
        }

    // ════════════════════════════════════════
    // POST /api.php?action=reset
    // Полный сброс (только admin)
    // Body: { pass }
    // ════════════════════════════════════════
    case 'reset':
        $pass = $body['pass'] ?? '';
        if (!checkAdminPassword($pass)) {
            respond(false, [], 'Неверный пароль');
        }
        writeJson(DATA_FILE,   []);
        writeJson(IMAGES_FILE, []);
        respond(true, [], 'Данные сброшены');

    // ════════════════════════════════════════
    // GET /api.php?action=ping
    // Проверка работоспособности
    // ════════════════════════════════════════
    case 'ping':
        $writable = is_writable(dirname(DATA_FILE));
        respond(true, [
            'status'   => 'ok',
            'writable' => $writable,
            'php'      => PHP_VERSION,
            'time'     => date('Y-m-d H:i:s'),
        ], $writable ? 'API работает' : 'Нет прав на запись!');

    default:
        http_response_code(400);
        respond(false, [], 'Неизвестное действие: ' . htmlspecialchars($action));
}