<?php
// ============================================================
//  Envoi des formulaires du site par e-mail (hébergement LWS).
//  Les demandes arrivent sur l'adresse ci-dessous.
// ============================================================
$TO        = 'contact@drome-ardeche.fr';
$FROM      = 'noreply@drome-ardeche.fr'; // doit être une adresse du domaine pour ne pas finir en spam
$SITE_NAME = 'DAC (Drôme Ardèche Conciergerie)';

date_default_timezone_set('Europe/Paris');
header('Content-Type: application/json; charset=utf-8');

function respond($code, $message) {
    http_response_code($code);
    echo json_encode(['ok' => $code === 200, 'message' => $message]);
    exit;
}

function clean($value) {
    // Supprime les retours à la ligne pour empêcher l'injection d'en-têtes
    return trim(str_replace(["\r", "\n"], ' ', (string) $value));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, 'Méthode non autorisée.');
}

// Champ piège invisible : rempli uniquement par les robots
if (!empty($_POST['site_web'])) {
    respond(200, 'OK');
}

$forms = [
    'contact' => [
        'subject'  => 'Nouvelle demande de contact',
        'required' => ['prenom', 'nom', 'email', 'telephone', 'message'],
        'fields'   => [
            'prenom'    => 'Prénom',
            'nom'       => 'Nom',
            'email'     => 'E-mail',
            'telephone' => 'Téléphone',
            'ville'     => 'Commune du logement',
            'message'   => 'Message',
        ],
    ],
    'estimate' => [
        'subject'  => "Nouvelle demande d'estimation",
        'required' => ['adresse', 'type', 'chambres', 'nom', 'telephone', 'email'],
        'fields'   => [
            'nom'       => 'Nom',
            'email'     => 'E-mail',
            'telephone' => 'Téléphone',
            'adresse'   => 'Adresse / ville du logement',
            'type'      => 'Type de bien',
            'chambres'  => 'Chambres',
            'voyageurs' => 'Capacité (voyageurs)',
            'surface'   => 'Surface (m²)',
        ],
    ],
];

$formName = isset($_POST['formulaire']) ? $_POST['formulaire'] : '';
if (!isset($forms[$formName])) {
    respond(400, 'Formulaire inconnu.');
}
$form = $forms[$formName];

foreach ($form['required'] as $key) {
    if (!isset($_POST[$key]) || trim($_POST[$key]) === '') {
        respond(422, 'Merci de remplir tous les champs obligatoires.');
    }
}

$email = filter_var(clean($_POST['email']), FILTER_VALIDATE_EMAIL);
if (!$email) {
    respond(422, 'Adresse e-mail invalide.');
}

$lines = [];
foreach ($form['fields'] as $key => $label) {
    if (!isset($_POST[$key]) || trim($_POST[$key]) === '') continue;
    $value = $key === 'message' ? trim((string) $_POST[$key]) : clean($_POST[$key]);
    $lines[] = $label . ' : ' . mb_substr($value, 0, 5000);
}
$lines[] = '';
$lines[] = 'Envoyé depuis le site ' . $SITE_NAME . ' le ' . date('d/m/Y à H:i');

$nameForSubject = clean(isset($_POST['prenom']) ? $_POST['prenom'] . ' ' . $_POST['nom'] : $_POST['nom']);
$subject = '=?UTF-8?B?' . base64_encode($form['subject'] . ' — ' . mb_substr($nameForSubject, 0, 80)) . '?=';

$headers = [
    'From: =?UTF-8?B?' . base64_encode($SITE_NAME) . '?= <' . $FROM . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
];

$sent = mail($TO, $subject, implode("\n", $lines), implode("\r\n", $headers), '-f' . $FROM);

if (!$sent) {
    respond(500, "L'envoi a échoué.");
}
respond(200, 'Merci !');
