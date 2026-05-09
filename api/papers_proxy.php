<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$consulta = trim($_GET['query'] ?? '');
if ($consulta === '') {
    http_response_code(400);
    echo json_encode(['error' => 'query requerido']);
    exit;
}

// Cache de 30 minutos por consulta + fuente
$dirCache = sys_get_temp_dir() . '/morphos_papers_cache';
if (!is_dir($dirCache)) mkdir($dirCache, 0700, true);

function leerCache(string $clave, int $ttl): string|false {
    global $dirCache;
    $archivo = $dirCache . '/' . md5($clave) . '.json';
    if (file_exists($archivo) && (time() - filemtime($archivo)) < $ttl) {
        return file_get_contents($archivo);
    }
    return false;
}

function escribirCache(string $clave, string $contenido): void {
    global $dirCache;
    file_put_contents($dirCache . '/' . md5($clave) . '.json', $contenido);
}

$claveCache = 'ss:' . $consulta;
$cached = leerCache($claveCache, 1800);
if ($cached) { echo $cached; exit; }

//  Intento 1: Semantic Scholar 

function fetchHttp(string $url, array $cabeceras, int $timeout = 15): array {
    $ctx = stream_context_create(['http' => [
        'method' => 'GET',
        'header' => implode("\r\n", $cabeceras),
        'timeout' => $timeout,
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    $codigo = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#HTTP/\S+\s+(\d+)#', $h, $m)) $codigo = (int)$m[1];
    }
    return ['body' => $body, 'codigo' => $codigo];
}

function buscarSemanticScholar(string $consulta): array|false {
    $campos = 'title,authors,year,abstract,openAccessPdf,externalIds';
    $url = 'https://api.semanticscholar.org/graph/v1/paper/search'
        . '?query=' . urlencode($consulta)
        . '&fields=' . $campos
        . '&limit=100';

    $cabeceras = ['User-Agent: Morphos/1.0'];
    $resp = fetchHttp($url, $cabeceras);
    if ($resp['codigo'] === 429 || $resp['body'] === false) return false;
    if ($resp['codigo'] >= 400) return false;

    $datos = json_decode($resp['body'], true);
    if (empty($datos['data'])) return [];

    return array_map(fn($p) => [
        'fuente' => 'Semantic Scholar',
        'title' => $p['title'] ?? 'Sin título',
        'authors' => $p['authors'] ?? [],
        'year' => (string)($p['year'] ?? ''),
        'abstract' => $p['abstract'] ?? '',
        'doi' => $p['externalIds']['DOI'] ?? '',
        'pdf' => $p['openAccessPdf']['url'] ?? '',
        'journal' => '',
    ], $datos['data']);
}

// ── Intento 2: PubMed fallback 

function buscarPubMed(string $consulta): array|false {
    $cabeceras = ['User-Agent: Morphos/1.0 (mailto:ceo@equipamed.net)', 'Accept: application/json'];

    $urlBusqueda = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
        . '?db=pubmed&retmode=json&retmax=100&term=' . urlencode($consulta);

    $resp = fetchHttp($urlBusqueda, $cabeceras);
    if ($resp['body'] === false || $resp['codigo'] >= 400) return false;

    $busqueda = json_decode($resp['body'], true);
    $ids = $busqueda['esearchresult']['idlist'] ?? [];
    if (empty($ids)) return [];

    $urlResumen = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
        . '?db=pubmed&retmode=json&id=' . implode(',', $ids);

    $resp2 = fetchHttp($urlResumen, $cabeceras);
    if ($resp2['body'] === false || $resp2['codigo'] >= 400) return false;

    $resumen = json_decode($resp2['body'], true);
    $resultado = $resumen['result'] ?? [];
    $uids = $resultado['uids'] ?? $ids;

    $papers = [];
    foreach ($uids as $uid) {
        $p = $resultado[$uid] ?? null;
        if (!$p) continue;

        $anio = '';
        if (!empty($p['pubdate'])) { preg_match('/\d{4}/', $p['pubdate'], $m); $anio = $m[0] ?? ''; }

        $doi = '';
        foreach ($p['articleids'] ?? [] as $aid) {
            if ($aid['idtype'] === 'doi') { $doi = $aid['value']; break; }
        }

        $papers[] = [
            'fuente' => 'PubMed',
            'pmid' => $uid,
            'title' => $p['title'] ?? 'Sin título',
            'authors' => array_map(fn($a) => ['name' => $a['name']], $p['authors'] ?? []),
            'year' => $anio,
            'abstract' => '',
            'doi' => $doi,
            'pdf' => '',
            'journal' => $p['source'] ?? '',
        ];
    }
    return $papers;
}

// Orquestar 

$papers = buscarSemanticScholar($consulta);

if ($papers === false) {
    $papers = buscarPubMed($consulta);
}

if ($papers === false) {
    http_response_code(502);
    echo json_encode(['error' => 'No se pudo contactar ninguna fuente bibliográfica.']);
    exit;
}

$salida = json_encode(['total' => count($papers), 'data' => $papers]);
escribirCache($claveCache, $salida);
echo $salida;
