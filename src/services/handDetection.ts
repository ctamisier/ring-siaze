import type {Corner, FingerMeasure, Landmark} from "../types/ringSize";

// --- Mesure du doigt / bague ---
// Landmarks MediaPipe : 13=MCP annulaire, 14=PIP annulaire.
export const RING_MCP = 13;
export const RING_PIP = 14;
// Doigts voisins pour borner la largeur (paires MCP->PIP) : majeur, auriculaire.
export const NEIGHBOR_FINGERS: [number, number][] = [[9, 10], [17, 18]];
// Distance max de scan de chaque côté de l'axe du doigt (px), avant bornage.
export const FINGER_SCAN_MAX = 140;
// Plafond dur de scan (px), sécurité commune doigt/poignet.
export const SCAN_HARD_MAX = 400;

// --- Poignet ---
export const WRIST = 0;           // landmark poignet
export const MIDDLE_MCP = 9;      // base du majeur (axe de la main)
// Portée de scan de chaque côté du poignet (px) : plus large qu'un doigt.
export const WRIST_SCAN_MAX = 260;
// Lignes de scan le long de l'axe main (0 = poignet, positif = paume).
export const WRIST_SCAN_LINES = [-0.35, -0.28, -0.21, -0.14];
// Décalage supplémentaire vers l'avant-bras, en mm (converti via l'échelle carte).
export const WRIST_DOWN_MM = 10;
// Couleur d'affichage de la mesure du poignet.
export const WRIST_COLOR = "#ffd400";
// Demi-largeur minimale plausible d'un doigt (px), plancher du bornage.
export const FINGER_HALF_MIN = 6;
// Fraction de la distance vers le doigt voisin servant de cap (bord ~ mi-chemin,
// resserré pour ne pas surestimer la largeur).
export const CAP_FACTOR = 0.4;
// Percentile d'agrégation des largeurs (0 = min, 0.5 = médiane). Bas -> plus
// serré : les lignes étroites sont les plus proches de la vraie largeur.
export const WIDTH_PERCENTILE = 0.25;

// Segmentation peau (YCrCb) : bornes classiques, robustes à la lumière.
export const SKIN_LOW = [0, 133, 77, 0];
export const SKIN_HIGH = [255, 173, 127, 255];
// Nb de pixels non-peau consécutifs confirmant le bord (ignore les petits trous).
export const EDGE_CONFIRM = 3;

/**
 * Lance MediaPipe sur la frame vidéo courante. Renvoie les 21 landmarks ou null.
 */
export function detectHand(
    handLandmarker: any,
    video: HTMLVideoElement | null,
    lastVideoTime: number,
    lastHand: Landmark[] | null
): { hand: Landmark[] | null; newLastVideoTime: number; newLastHand: Landmark[] | null } {
    if (!handLandmarker || !video) return {hand: null, newLastVideoTime: lastVideoTime, newLastHand: lastHand};

    // Frame inchangée : réutilise la dernière main (évite le clignotement et
    // respecte l'exigence de timestamps monotones de MediaPipe).
    if (video.currentTime === lastVideoTime) return {
        hand: lastHand,
        newLastVideoTime: lastVideoTime,
        newLastHand: lastHand
    };

    const newLastVideoTime = video.currentTime;
    const res = handLandmarker.detectForVideo(video, performance.now());
    const newLastHand = res.landmarks && res.landmarks.length > 0
        ? (res.landmarks[0] as Landmark[])
        : null;

    return {hand: newLastHand, newLastVideoTime, newLastHand};
}

/**
 * Cherche le bord du doigt le long d'un rayon, sur le masque de peau :
 * avance depuis le centre et s'arrête à la peau -> non-peau, ou au cap
 * géométrique `maxDist` (mi-distance vers le doigt voisin). Ne peut donc
 * ni déborder dans le fond ni traverser vers un doigt voisin collé.
 */
export function scanEdge(
    skin: any, cx: number, cy: number, dx: number, dy: number, maxDist: number
): number | null {
    const cols = skin.cols, rows = skin.rows;

    // Le centre doit être sur la peau, sinon la ligne n'est pas exploitable.
    const cX = Math.round(cx), cY = Math.round(cy);
    if (cX < 0 || cX >= cols || cY < 0 || cY >= rows || skin.ucharAt(cY, cX) === 0) {
        return null;
    }

    const limit = Math.min(SCAN_HARD_MAX, Math.round(maxDist));
    let lastSkin = 0;
    let offCount = 0;

    for (let t = 1; t <= limit; t++) {
        const x = Math.round(cx + dx * t);
        const y = Math.round(cy + dy * t);
        if (x < 0 || x >= cols || y < 0 || y >= rows) break;

        if (skin.ucharAt(y, x) > 0) {
            lastSkin = t;
            offCount = 0;
        } else if (++offCount >= EDGE_CONFIRM) {
            break; // sortie confirmée de la peau -> bord du doigt
        }
    }

    return lastSkin > 0 ? lastSkin : null;
}

/**
 * Mesure la largeur de l'annulaire à l'emplacement de la bague.
 * L'axe du doigt est donné par MCP->PIP. On scanne plusieurs lignes
 * perpendiculaires sur le masque de peau et on prend la médiane :
 * robuste aux rides/reflets qui faussent un scan unique.
 */
export function measureRingFinger(
    skin: any, hand: Landmark[], W: number, H: number, mmPerPx: number | null,
): FingerMeasure | null {
    const mcp = hand[RING_MCP];
    const pip = hand[RING_PIP];
    if (!mcp || !pip) return null;

    // Coordonnées pixels.
    const mx = mcp.x * W, my = mcp.y * H;
    const px = pip.x * W, py = pip.y * H;

    // Axe du doigt, puis normale unitaire.
    const ax = px - mx, ay = py - my;
    const len = Math.hypot(ax, ay);
    if (len < 1) return null;
    const nx = -ay / len, ny = ax / len;
    const tx = ax / len, ty = ay / len;

    // Points des doigts voisins (pour borner la largeur), en pixels.
    const neighbors = NEIGHBOR_FINGERS.map(([a, b]) => ({
        mx: hand[a].x * W, my: hand[a].y * H,
        px: hand[b].x * W, py: hand[b].y * H,
    }));

    // Position préférée pour placer la bague : 0.6*MCP + 0.4*PIP
    const tPref = 0.6;
    const cxPref = mx + (px - mx) * tPref;
    const cyPref = my + (py - my) * tPref;

    // Cap de chaque côté calculé comme la mi-distance vers les doigts voisins
    let capPos = FINGER_SCAN_MAX;
    let capNeg = FINGER_SCAN_MAX;
    for (const n of neighbors) {
        const nX = n.mx + (n.px - n.mx) * tPref;
        const nY = n.my + (n.py - n.my) * tPref;
        const proj = (nX - cxPref) * nx + (nY - cyPref) * ny;
        const half = Math.max(FINGER_HALF_MIN, Math.abs(proj) * CAP_FACTOR);
        if (proj >= 0) capPos = Math.min(capPos, half);
        else capNeg = Math.min(capNeg, half);
    }

    // Scans multiples le long de l'axe du doigt pour robustesse
    const scanLines = [-20, -10, 0, 10, 20]; // offsets le long du doigt
    const widthsPos: number[] = [];
    const widthsNeg: number[] = [];

    for (const offset of scanLines) {
        const cx = cxPref + tx * offset;
        const cy = cyPref + ty * offset;
        
        const distPos = scanEdge(skin, cx, cy, nx, ny, capPos);
        const distNeg = scanEdge(skin, cx, cy, -nx, -ny, capNeg);
        
        if (distPos !== null) widthsPos.push(distPos);
        if (distNeg !== null) widthsNeg.push(distNeg);
    }

    if (widthsPos.length === 0 || widthsNeg.length === 0) {
        return null;
    }

    // Prendre le percentile bas pour robustesse (moins affecté par les réflexions/rides)
    widthsPos.sort((a, b) => a - b);
    widthsNeg.sort((a, b) => a - b);
    
    const distPosPref = widthsPos[Math.floor((widthsPos.length - 1) * WIDTH_PERCENTILE)];
    const distNegPref = widthsNeg[Math.floor((widthsNeg.length - 1) * WIDTH_PERCENTILE)];

    const widthPx = distPosPref + distNegPref;
    const widthMm = mmPerPx !== null ? widthPx * mmPerPx : null;
    const circumferenceMm = widthMm !== null ? Math.PI * widthMm : null;
    return {
        center: {x: cxPref, y: cyPref},
        edgeA: {x: cxPref + nx * distPosPref, y: cyPref + ny * distPosPref},
        edgeB: {x: cxPref - nx * distNegPref, y: cyPref - ny * distNegPref},
        widthPx, widthMm, circumferenceMm,
        linesUsed: Math.min(widthsPos.length, widthsNeg.length),
    };
}


/**
 * Mesure la largeur du poignet au landmark 0, perpendiculairement à l'axe
 * de la main (poignet -> base du majeur). Pas de doigt voisin ici : on scanne
 * la peau jusqu'au fond, avec une portée plus large qu'un doigt.
 */
export function measureWrist(
    skin: any, hand: Landmark[], W: number, H: number, mmPerPx: number | null,
): FingerMeasure | null {
    const wrist = hand[WRIST];
    const mid = hand[MIDDLE_MCP];
    if (!wrist || !mid) return null;

    const wx = wrist.x * W, wy = wrist.y * H;
    const mx = mid.x * W, my = mid.y * H;

    // Axe de la main, unité, puis normale unitaire.
    const ax = mx - wx, ay = my - wy;
    const len = Math.hypot(ax, ay);
    if (len < 1) return null;
    const ux = ax / len, uy = ay / len;   // vers la paume
    const nx = -uy, ny = ux;              // normale

    // Décalage fixe vers l'avant-bras (-axe) : 1 cm si l'échelle carte est connue,
    // sinon repli sur une fraction de la longueur de la paume.
    const downPx = mmPerPx !== null ? WRIST_DOWN_MM / mmPerPx : len * 0.15;

    const measures = WRIST_SCAN_LINES.map((t) => {
        const cx = wx + ax * t - ux * downPx;
        const cy = wy + ay * t - uy * downPx;
        const distPos = scanEdge(skin, cx, cy, nx, ny, WRIST_SCAN_MAX);
        const distNeg = scanEdge(skin, cx, cy, -nx, -ny, WRIST_SCAN_MAX);
        if (distPos === null || distNeg === null) return null;
        return {cx, cy, distPos, distNeg, widthPx: distPos + distNeg};
    }).filter((m): m is NonNullable<typeof m> => m !== null);

    if (measures.length < 2) return null;

    const widths = measures.map((m) => m.widthPx).sort((a, b) => a - b);
    const widthPx = widths[Math.floor((widths.length - 1) * WIDTH_PERCENTILE)];
    const repr = measures.reduce((best, m) =>
        Math.abs(m.widthPx - widthPx) < Math.abs(best.widthPx - widthPx) ? m : best);

    const widthMm = mmPerPx !== null ? widthPx * mmPerPx : null;
    const circumferenceMm = widthMm !== null ? Math.PI * widthMm : null;

    return {
        center: {x: repr.cx, y: repr.cy},
        edgeA: {x: repr.cx + nx * repr.distPos, y: repr.cy + ny * repr.distPos},
        edgeB: {x: repr.cx - nx * repr.distNeg, y: repr.cy - ny * repr.distNeg},
        widthPx, widthMm, circumferenceMm,
        linesUsed: measures.length,
    };
}

// --- Fonctions de lissage pour stabilisation ---

// Facteurs de lissage par défaut (peut être écrasé par le composant)
// smoothingFactor est le poids appliqué à la NOUVELLE mesure lors du lissage.
// Interprétation : 0 = garder l'ancienne valeur (lissage maximal), 1 = adopter immédiatement la nouvelle (pas de lissage).
// Valeur plus petite => plus stable (moins de tremblement), valeur plus grande => plus réactif.
export const DEFAULT_SMOOTHING_FACTOR = 0.4; // plus agressif (plus stable)
// Seuil par défaut (px) en dessous duquel on ignore les micro-variations.
export const DEFAULT_MIN_CHANGE_THRESHOLD = 4.0;

/**
 * Calcule la distance entre deux points
 */
export function distance(p1: Corner, p2: Corner): number {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Calcule la distance totale entre deux mesures (center, edgeA, edgeB)
 */
export function measureDistance(m1: FingerMeasure, m2: FingerMeasure): number {
    return distance(m1.center, m2.center) + distance(m1.edgeA, m2.edgeA) + distance(m1.edgeB, m2.edgeB);
}

/**
 * Lisse une mesure avec la précédente pour stabiliser l'affichage.
 * Utilise un lissage exponentiel : newValue = oldValue * (1 - factor) + newValue * factor
 * Applique aussi un seuil minimum pour éviter les micro-variations.
 *
 * @param oldMeasure - La mesure précédente (ou null)
 * @param newMeasure - La nouvelle mesure à lisser
 * @param smoothingFactor - Facteur de lissage (0 = garder l'ancienne valeur, 1 = adopter immédiatement la nouvelle)
 * @param minChangeThreshold - Seuil minimum de changement en pixels
 * @returns La mesure lissée, ou null si newMeasure est null
 */
export function smoothMeasure(
    oldMeasure: FingerMeasure | null,
    newMeasure: FingerMeasure | null,
    smoothingFactor: number = DEFAULT_SMOOTHING_FACTOR,
    minChangeThreshold: number = DEFAULT_MIN_CHANGE_THRESHOLD
): FingerMeasure | null {
    if (!newMeasure) return null;
    if (!oldMeasure) return newMeasure;

    // Distance moyenne par point (center, edgeA, edgeB)
    const dist = measureDistance(oldMeasure, newMeasure);
    const meanDist = dist / 3;

    // Seuils rapides
    const JUMP_THRESHOLD = 50; // changement net -> adopter immédiatement
    if (meanDist > JUMP_THRESHOLD) return newMeasure;
    if (meanDist < minChangeThreshold) return oldMeasure; // ignorer micro-variations

    // Alpha adaptatif : plus le mouvement est petit, plus on lisse fortement.
    // smoothingFactor est le poids donné à la nouvelle mesure (0..1).
    let alpha = smoothingFactor;
    if (meanDist < 8) {
        alpha = Math.max(0.04, smoothingFactor * 0.18); // très lent pour micro-mouvements
    } else if (meanDist < 20) {
        alpha = Math.max(0.08, smoothingFactor * 0.45);
    } else {
        alpha = smoothingFactor;
    }

    // Lissage exponentiel sur toutes les composantes y compris les valeurs en mm
    const lerp = (a: number, b: number) => a * (1 - alpha) + b * alpha;

    const widthPx = lerp(oldMeasure.widthPx, newMeasure.widthPx);

    // widthMm/circumferenceMm peuvent être nulls (si échelle inconnue) -> lisser si présents
    const widthMm = (oldMeasure.widthMm !== null && newMeasure.widthMm !== null)
        ? lerp(oldMeasure.widthMm, newMeasure.widthMm)
        : (newMeasure.widthMm ?? oldMeasure.widthMm);

    const circumferenceMm = (oldMeasure.circumferenceMm !== null && newMeasure.circumferenceMm !== null)
        ? lerp(oldMeasure.circumferenceMm, newMeasure.circumferenceMm)
        : (newMeasure.circumferenceMm ?? oldMeasure.circumferenceMm);

    // linesUsed : prendre la valeur la plus conservatrice (max) pour refléter la confiance
    const linesUsed = Math.max(oldMeasure.linesUsed ?? 0, newMeasure.linesUsed ?? 0);

    return {
        center: {
            x: lerp(oldMeasure.center.x, newMeasure.center.x),
            y: lerp(oldMeasure.center.y, newMeasure.center.y),
        },
        edgeA: {
            x: lerp(oldMeasure.edgeA.x, newMeasure.edgeA.x),
            y: lerp(oldMeasure.edgeA.y, newMeasure.edgeA.y),
        },
        edgeB: {
            x: lerp(oldMeasure.edgeB.x, newMeasure.edgeB.x),
            y: lerp(oldMeasure.edgeB.y, newMeasure.edgeB.y),
        },
        widthPx,
        widthMm,
        circumferenceMm,
        linesUsed,
    };
}
