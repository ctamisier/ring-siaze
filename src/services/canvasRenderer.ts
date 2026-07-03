import type {Corner, DetectResult, FingerMeasure, Landmark} from "../types/ringSize";
import {DrawingUtils, HandLandmarker, type NormalizedLandmark} from "@mediapipe/tasks-vision";

/**
 * Module de rendu canvas.
 * Contient toutes les fonctions pour dessiner sur le canvas overlay :
 * - squelette de la main
 * - mesures de doigt et poignet
 * - quadrilatères de détection
 * - informations de debug
 */

/**
 * Dessine la main avec MediaPipe DrawingUtils
 */
export function drawLandmarks(
    ctx: CanvasRenderingContext2D,
    hand: Landmark[]
) {
    const drawingUtils = new DrawingUtils(ctx);

    const landmarks: NormalizedLandmark[] = hand.map(p => ({
        x: p.x,
        y: p.y,
        z: p.z ?? 0,
        visibility: 1
    }));

    // connexions (squelette)
    drawingUtils.drawConnectors(
        landmarks,
        HandLandmarker.HAND_CONNECTIONS,
        {color: "rgba(0, 200, 255, 0.8)", lineWidth: 2}
    );

    // points
    drawingUtils.drawLandmarks(
        landmarks,
        {color: "rgba(0, 200, 255, 0.9)", radius: 4}
    );
}

/**
 * Trace une mesure de largeur (doigt ou poignet) sur le canvas.
 * Affiche une ligne entre les deux bords, des points aux extrémités,
 * et un libellé avec la valeur de la mesure.
 *
 * @param ctx - Contexte de dessin 2D du canvas
 * @param m - Mesure à dessiner (FingerMeasure)
 * @param color - Couleur de la mesure (par défaut: "magenta" pour la bague)
 * @param prefix - Préfixe pour le libellé (par défaut: "")
 */
export function drawMeasure(ctx: CanvasRenderingContext2D, m: FingerMeasure, color = "magenta", prefix = "") {
    // Dessiner la ligne de mesure entre les deux bords
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.edgeA.x, m.edgeA.y);
    ctx.lineTo(m.edgeB.x, m.edgeB.y);
    ctx.stroke();

    // Dessiner les points aux extrémités
    ctx.fillStyle = color;
    for (const p of [m.edgeA, m.edgeB]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Afficher la valeur de la mesure
    const val = m.widthMm !== null
        ? `${m.widthMm.toFixed(1)} mm`
        : `${m.widthPx.toFixed(0)} px (approche une carte)`;
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(prefix + val, m.center.x + 12, m.center.y - 12);
}

/**
 * Trace un quadrilatère (rectangle orienté) avec ses coins et optionnellement un label.
 * Utilisé pour afficher les contours détectés (carte bancaire, etc.).
 *
 * @param ctx - Contexte de dessin 2D du canvas
 * @param corners - Tableau des coins du quadrilatère (4 points minimum)
 * @param color - Couleur du contour et des coins
 * @param width - Épaisseur du trait du contour
 * @param label - Label optionnel à afficher près du premier coin
 */
export function drawQuad(
    ctx: CanvasRenderingContext2D,
    corners: Corner[],
    color: string,
    width: number,
    label?: string,
) {
    const [p0, ...rest] = corners;

    // Dessiner le contour du quadrilatère
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();

    // Dessiner les coins (cercles)
    ctx.fillStyle = color;
    for (const p of corners) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // Afficher le label si fourni
    if (label) {
        ctx.font = "bold 24px sans-serif";
        ctx.fillText(label, p0.x, Math.max(28, p0.y - 12));
    }
}

/**
 * Affiche un overlay de diagnostic avec les statistiques de détection.
 * Affiche : nombre de contours, plus gros contour, candidats carte,
 * échelle mm/px, détection main, et mesure du doigt.
 *
 * Note: Les lignes pour dessiner les contours sont commentées par défaut.
 * Décommentez drawQuad() pour visualiser les contours en debug.
 *
 * @param ctx - Contexte de dessin 2D du canvas
 * @param r - Résultat de la détection de carte (DetectResult)
 * @param mmPerPx - Échelle actuelle en mm/px (null si carte non détectée)
 * @param handDetected - Booléen indiquant si une main est détectée
 * @param measure - Mesure actuelle du doigt (null si non mesuré)
 */
export function drawDebug(
    ctx: CanvasRenderingContext2D,
    r: DetectResult,
    mmPerPx: number | null,
    handDetected: boolean,
    measure: FingerMeasure | null,
) {
    // Le plus gros contour trouvé (sans aucun filtre), en rouge.
    if (r.largestPoly.length >= 2) {
        // drawQuad(ctx, r.largestPoly, "red", 2);
    }

    // Rects passant surface+ratio mais recalés par la rectangularité, en orange.
    for (const q of r.candidates) {
        // @ts-ignore - comparing arrays
        if (r.best && q === r.best.corners) continue;
        // drawQuad(ctx, q, "orange", 2);
    }

    // Afficher les statistiques de détection
    ctx.fillStyle = "black";
    ctx.font = "bold 20px monospace";
    const lines = [
        `contours total : ${r.total}`,
        `plus gros : ${(r.largestFrac * 100).toFixed(1)}% (${r.largestPoly.length} coins)`,
        `candidats ratio OK : ${r.candidates.length}`,
        r.best
            ? `carte : ratio=${r.best.ratio.toFixed(2)} rect=${r.best.rectangularity.toFixed(2)}`
            : `carte : aucune`,
        `echelle : ${mmPerPx !== null ? (mmPerPx * 1000).toFixed(2) + " µm/px" : "—"}`,
        `main : ${handDetected ? "oui" : "non"}`,
        measure
            ? `doigt : ${measure.widthPx.toFixed(0)} px` +
            (measure.widthMm !== null ? ` = ${measure.widthMm.toFixed(1)} mm` : "")
            : `doigt : bords non trouvés (ecarte les doigts)`,
    ];
    lines.forEach((t, i) => ctx.fillText(t, 12, 28 + i * 24));
}

/**
 * Affiche une visualisation du masque de peau sur le canvas.
 * Les pixels de peau sont colorés en vert-bleu, les non-peau en rouge semi-transparent.
 * Permet de déboguer la détection de peau.
 * 
 * @param ctx - Contexte de dessin 2D du canvas
 * @param skinMask - Masque de peau OpenCV (Mat binaire)
 * @param width - Largeur du canvas
 * @param height - Hauteur du canvas
 */
export function drawSkinMask(
    ctx: CanvasRenderingContext2D,
    skinMask: any,
    width: number,
    height: number,
) {
    // Créer un canvas offscreen pour dessiner le masque sans effacer le contenu
    const offscreenCanvas = new OffscreenCanvas(width, height);
    const offscreenCtx = offscreenCanvas.getContext("2d")!;
    
    // Créer image data pour le masque
    const imageData = offscreenCtx.createImageData(width, height);
    const data = imageData.data;
    
    try {
       // Lire pixel par pixel du masque
       for (let y = 0; y < height; y++) {
           for (let x = 0; x < width; x++) {
               // Accéder au pixel du masque (8-bit unsigned, 1 canal)
               const maskValue = skinMask.ucharAt(y, x);
                
               const pixelIdx = (y * width + x) * 4;
                
               if (maskValue > 127) {
                   // Pixel de peau : vert-bleu
                   data[pixelIdx] = 0;       // R
                   data[pixelIdx + 1] = 200; // G (vert)
                   data[pixelIdx + 2] = 150; // B
                   data[pixelIdx + 3] = 100; // Alpha (plus transparent)
               } else {
                   // Non-peau : rouge semi-transparent
                   data[pixelIdx] = 255;     // R
                   data[pixelIdx + 1] = 0;   // G
                   data[pixelIdx + 2] = 0;   // B
                   data[pixelIdx + 3] = 50;  // Alpha (très transparent)
               }
           }
       }
    } catch (e) {
       console.error("Error reading skin mask:", e);
    }
    
    // Dessiner l'image data sur le canvas offscreen
    offscreenCtx.putImageData(imageData, 0, 0);
    
    // Fusionner avec le contexte principal en transparent
    ctx.globalAlpha = 0.6;
    ctx.drawImage(offscreenCanvas as unknown as CanvasImageSource, 0, 0);
    ctx.globalAlpha = 1;
}
