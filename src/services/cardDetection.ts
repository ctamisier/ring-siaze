import type {Corner, DetectResult} from "../types/ringSize";

/**
 * Module de détection de carte bancaire.
 * 
 * Utilise OpenCV pour détecter une carte bancaire dans l'image vidéo.
 * La détection se base sur :
 * 1. Détection des contours via Canny
 * 2. Filtrage par surface minimale/maximale
 * 3. Filtrage par ratio (proche de 1.586 pour une carte bancaire ISO/IEC 7810 ID-1)
 * 4. Filtrage par rectangularité (le contour doit bien remplir un rectangle)
 * 5. Rejet si la zone contient trop de pixels "peau" (pour éviter visage/main)
 * 
 * Une fois détectée, la carte permet de calculer l'échelle mm/px pour mesurer le doigt.
 */

// --- Règles de détection carte bancaire (ISO/IEC 7810 ID-1) ---
// Dimensions normalisées : 85,60 x 53,98 mm -> ratio ~1,586.

/** Ratio standard d'une carte bancaire (largeur/hauteur) */
export const CARD_RATIO = 85.6 / 53.98; // ≈ 1.586

/** Ratio minimum accepté (1.586 * 0.82 ≈ 1.30) pour prendre en compte les perspectives */
export const RATIO_MIN = CARD_RATIO * 0.82;

/** Ratio maximum accepté (1.586 * 1.18 ≈ 1.87) pour prendre en compte les perspectives */
export const RATIO_MAX = CARD_RATIO * 1.18;

/** Fraction minimale de l'image que doit occuper un contour pour être considéré (anti-bruit) */
export const MIN_AREA_FRAC = 0.03;

/** Fraction maximale de l'image qu'un contour peut occuper (évite de détecter l'intégralité) */
export const MAX_AREA_FRAC = 0.98;

/** Fraction du périmètre utilisée pour l'approximation polygonale (pour debug) */
export const APPROX_EPS_FRAC = 0.02;

/** Seuil minimal de rectangularité : contour doit bien remplir son rectangle orienté */
export const RECTANGULARITY_MIN = 0.6;

/** Seuil de rejet peau : si un candidat contient plus de 35% de pixels peau, c'est rejeté (visage/main) */
export const CARD_SKIN_REJECT = 0.35;

/** Largeur normalisée d'une carte bancaire (grand côté en mm) - norme ISO/IEC 7810 ID-1 */
export const CARD_WIDTH_MM = 85.6;

/**
 * Calcule les 4 coins d'un rectangle orienté OpenCV (cv.RotatedRect).
 * Convertit le format center/size/angle en 4 points dans l'espace image.
 * 
 * @param rect - Rectangle orienté OpenCV avec center, size et angle en degrés
 * @returns Tableau de 4 Corner représentant les coins du rectangle
 */
export function boxPoints(rect: any): Corner[] {
    const a = (rect.angle * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const w = rect.size.width / 2;
    const h = rect.size.height / 2;
    const cx = rect.center.x;
    const cy = rect.center.y;
    return [
        [-w, -h], [w, -h], [w, h], [-w, h],
    ].map(([bx, by]) => ({
        x: cx + bx * cos - by * sin,
        y: cy + bx * sin + by * cos,
    }));
}

/**
 * Construit un masque binaire de la peau utilisant l'espace colorimétrique YCrCb.
 * 
 * Processus :
 * 1. Convertit l'image source en RGB
 * 2. Convertit RGB en YCrCb (Y = luminance, Cr/Cb = chrominance)
 * 3. Applique un seuil sur les canaux Cr et Cb pour détecter les tons de peau
 * 4. Nettoie le masque avec des opérations morphologiques (ouverture + fermeture)
 *    - Ouverture : élimine les petits trous (rides, reflets)
 *    - Fermeture : lisse le contour
 * 
 * Les bornes YCrCb utilisées sont classiques et robustes aux variations de lumière.
 * 
 * @param src - Image source OpenCV (Mat)
 * @param cv - Instance OpenCV.js
 * @returns Mat binaire où les pixels de peau = 255, fond = 0
 */
export function buildSkinMask(src: any, cv: any): any {
    // Bornes YCrCb pour la détection de peau (valeurs classiques robustes à la lumière)
    const SKIN_LOW = [0, 133, 77, 0];  // Min : Y=0, Cr=133, Cb=77
    const SKIN_HIGH = [255, 173, 127, 255]; // Max : Y=255, Cr=173, Cb=127

    // Conversion en RGB
    const rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

    // Conversion en YCrCb
    const ycrcb = new cv.Mat();
    cv.cvtColor(rgb, ycrcb, cv.COLOR_RGB2YCrCb);

    // Création des matrices de seuil
    const low = new cv.Mat(ycrcb.rows, ycrcb.cols, ycrcb.type(), SKIN_LOW);
    const high = new cv.Mat(ycrcb.rows, ycrcb.cols, ycrcb.type(), SKIN_HIGH);

    // Application du seuil : pixels dans [SKIN_LOW, SKIN_HIGH] = peau
    const skin = new cv.Mat();
    cv.inRange(ycrcb, low, high, skin);

    // Nettoyage morphologique
    // Bouche les petits trous (rides, reflets) et lisse le contour.
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.morphologyEx(skin, skin, cv.MORPH_OPEN, k);  // Élimine les petits trous
    cv.morphologyEx(skin, skin, cv.MORPH_CLOSE, k); // Lisse le contour

    // Libération des ressources
    rgb.delete();
    ycrcb.delete();
    low.delete();
    high.delete();
    k.delete();

    return skin;
}

/**
 * Détecte le rectangle qui ressemble le plus à une carte bancaire dans l'image.
 * 
 * Pipeline de détection :
 * 1. Rehausse le contraste local (CLAHE) pour faire ressortir la carte sur fond gris
 * 2. Applique un flou gaussien pour réduire le bruit
 * 3. Détection des contours avec Canny
 * 4. Dilatation des contours pour former des boucles fermées
 * 5. Détection des contours avec findContours
 * 
 * Pour chaque contour trouvé :
 * - Vérifie la surface (MIN_AREA_FRAC à MAX_AREA_FRAC)
 * - Calcule le rectangle orienté minimal (minAreaRect)
 * - Vérifie le ratio (doit être proche de CARD_RATIO = 1.586)
 * - Vérifie la rectangularité (contour doit bien remplir le rectangle)
 * - Rejette si la zone contient trop de pixels peau (CARD_SKIN_REJECT)
 * 
 * @param gray - Image en niveaux de gris OpenCV (Mat)
 * @param skin - Masque de peau OpenCV (Mat) pour rejeter les zones peau
 * @param cv - Instance OpenCV.js
 * @returns DetectResult contenant le meilleur candidat et les statistiques de détection
 */
export function detectCard(gray: any, skin: any, cv: any): DetectResult {
    const frameArea = gray.rows * gray.cols;

    // Rehausse le contraste local (CLAHE) : fait ressortir une carte claire
    // sur fond gris peu contrasté. Repli sur le gris brut si indisponible.
    const eq = new cv.Mat();
    try {
        const clahe = cv.createCLAHE(2.0, new cv.Size(8, 8));
        clahe.apply(gray, eq);
        clahe.delete();
    } catch {
        gray.copyTo(eq);
    }

    const blur = new cv.Mat();
    cv.GaussianBlur(eq, blur, new cv.Size(5, 5), 0);

    const edges = new cv.Mat();
    cv.Canny(blur, edges, 40, 120);

    // Dilatation : élargit et reconnecte les bords Canny fragmentés pour
    // qu'ils forment une boucle fermée autour de la carte (contourArea non nul).
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, edges, kernel);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const result: DetectResult = {
        best: null, total: contours.size(), areaPass: 0,
        candidates: [], largestFrac: 0, largestPoly: [],
    };

    for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);

        const area = cv.contourArea(contour);
        const frac = area / frameArea;

        // Suivi du plus gros contour (debug), sans filtre.
        if (frac > result.largestFrac) {
            result.largestFrac = frac;
            const peri0 = cv.arcLength(contour, true);
            const a0 = new cv.Mat();
            cv.approxPolyDP(contour, a0, APPROX_EPS_FRAC * peri0, true);
            const poly: Corner[] = [];
            for (let k = 0; k < a0.rows; k++) {
                poly.push({x: a0.data32S[k * 2], y: a0.data32S[k * 2 + 1]});
            }
            result.largestPoly = poly;
            a0.delete();
        }

        if (frac < MIN_AREA_FRAC || frac > MAX_AREA_FRAC) {
            contour.delete();
            continue;
        }
        result.areaPass++;

        // Rectangle orienté minimal : gère la rotation de la carte.
        const rect = cv.minAreaRect(contour);
        const w = rect.size.width;
        const h = rect.size.height;
        const rectArea = w * h;
        const ratio = Math.max(w, h) / Math.max(1, Math.min(w, h));
        const rectangularity = rectArea > 0 ? area / rectArea : 0;

        if (ratio >= RATIO_MIN && ratio <= RATIO_MAX) {
            const corners = boxPoints(rect);
            result.candidates.push(corners);

            // Rejet si la zone est majoritairement de la peau (visage, main).
            const bbox = cv.boundingRect(contour);
            const roi = skin.roi(bbox);
            const skinFrac = cv.mean(roi)[0] / 255;
            roi.delete();

            if (rectangularity >= RECTANGULARITY_MIN && skinFrac < CARD_SKIN_REJECT) {
                if (!result.best || area > result.best.area) {
                    const longSidePx = Math.max(w, h);
                    result.best = {area, ratio, rectangularity, corners, longSidePx};
                }
            }
        }

        contour.delete();
    }

    eq.delete();
    blur.delete();
    edges.delete();
    kernel.delete();
    hierarchy.delete();
    contours.delete();

    return result;
}
