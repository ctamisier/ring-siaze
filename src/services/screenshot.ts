import type {FingerMeasure} from "../types/ringSize";

/**
 * Module de capture d'écran.
 * Permet de capturer la frame vidéo actuelle avec les annotations et mesures
 * pour créer une image figée (screenshot) à afficher ou sauvegarder.
 */

/**
 * Compose la frame vidéo + les annotations + les mesures dans une image figée.
 * 
 * Cette fonction :
 * 1. Crée un nouveau canvas de la même taille que l'overlay
 * 2. Dessine l'image de la caméra (processingCanvas)
 * 3. Dessine par-dessus les annotations (overlay : carte, main, mesures)
 * 4. Ajoute un bandeau récapitulatif avec les mesures du doigt
 * 5. Retourne l'image en base64 (data URL PNG)
 * 
 * @param processingCanvas - Canvas contenant l'image de la caméra
 * @param overlay - Canvas contenant les annotations (carte, main, mesures)
 * @param measure - Mesure actuelle du doigt pour afficher dans le bandeau
 * @param onFlash - Callback optionnel pour déclencher un effet visuel de flash
 * @returns Data URL de l'image PNG, ou null si les canvases sont invalides
 */
export function captureScreenshot(
    processingCanvas: HTMLCanvasElement,
    overlay: HTMLCanvasElement,
    measure: FingerMeasure,
    onFlash?: () => void
): string | null {
    if (!processingCanvas || !overlay) return null;

    // Déclenche le flash visuel si callback fourni
    if (onFlash) {
        onFlash();
    }

    // Créer un canvas de capture
    const cap = document.createElement("canvas");
    cap.width = overlay.width;
    cap.height = overlay.height;

    const cctx = cap.getContext("2d");
    if (!cctx) return null;

    // Dessiner l'image caméra et les annotations
    cctx.drawImage(processingCanvas, 0, 0); // image caméra
    cctx.drawImage(overlay, 0, 0);          // carte + main + mesure

    // Préparer le bandeau récapitulatif gravé sur l'image
    const lines: string[] = [];
    if (measure.widthMm !== null) lines.push(`Diamètre doigt : ${measure.widthMm.toFixed(1)} mm`);
    if (measure.circumferenceMm !== null) {
        lines.push(`Tour de doigt : ${(measure.circumferenceMm / 10).toFixed(1)} cm`);
        lines.push(`Taille bague (EU) : ${Math.round(measure.circumferenceMm)}`);
    }

    // Dessiner le bandeau si des lignes existent
    if (lines.length) {
        const pad = Math.round(cap.width * 0.015);  // Padding proportionnel à la largeur
        const fs = Math.round(cap.width * 0.028);   // Taille de police proportionnelle
        cctx.font = `bold ${fs}px sans-serif`;
        const boxW = Math.max(...lines.map((t) => cctx.measureText(t).width)) + pad * 2;
        const boxH = lines.length * (fs + 6) + pad * 2 - 6;

        // Fond semi-transparent du bandeau
        cctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        cctx.fillRect(pad, pad, boxW, boxH);

        // Texte en blanc
        cctx.fillStyle = "white";
        cctx.textBaseline = "top";
        lines.forEach((t, i) => cctx.fillText(t, pad * 2, pad * 2 + i * (fs + 6)));
    }

    // Convertir en image PNG base64
    return cap.toDataURL("image/png");
}

/**
 * Crée une fonction qui déclenche un flash visuel et le désactive après un délai.
 * 
 * Utilisé pour donner un feedback visuel à l'utilisateur lorsque qu'une capture
 * est prise (effet de flash blanc temporaire).
 * 
 * @param flashRef - Référence mutable vers un booléen contrôlant l'affichage du flash
 * @returns Fonction callback qui active/désactive le flash
 */
export function createFlashTrigger(flashRef: { value: boolean }) {
    return () => {
        flashRef.value = true;
        setTimeout(() => {
            flashRef.value = false;
        }, 1000);
    };
}
