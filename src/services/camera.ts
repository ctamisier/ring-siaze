import type {Ref} from "vue";

/**
 * Module de gestion de la caméra.
 * Contient les fonctions pour démarrer, basculer et redimensionner la caméra.
 */

/**
 * Mode de la caméra :
 * - "user" : caméra frontale (selfie)
 * - "environment" : caméra arrière (sur mobile)
 */
export type FacingMode = "user" | "environment";

/**
 * État de la caméra avec le flux vidéo et le mode actuel.
 * @property stream - Flux vidéo MediaStream actuel
 * @property facingMode - Référence réactive vers le mode de caméra actuel
 */
export interface CameraState {
    stream: MediaStream | null;
    facingMode: Ref<FacingMode>;
}

/**
 * Démarre la caméra avec les paramètres spécifiés.
 * 
 * Cette fonction :
 * 1. Libère le flux vidéo précédent s'il existe
 * 2. Requiert un nouveau flux avec les contraintes spécifiées
 * 3. Configure la source vidéo de l'élément <video>
 * 4. Attend que les métadonnées soient chargées et lance la lecture
 * 
 * @param video - Élément HTMLVideoElement à configurer
 * @param facingMode - Mode de caméra : "user" (frontale) ou "environment" (arrière)
 * @param currentStream - Flux vidéo actuel à libérer
 * @returns Promise résolue avec le nouveau flux MediaStream, ou null en cas d'erreur
 */
export async function startCamera(
    video: HTMLVideoElement | null,
    facingMode: FacingMode,
    currentStream: MediaStream | null
): Promise<MediaStream | null> {
    try {
        // Libère le flux précédent (nécessaire pour rebasculer sur une autre caméra).
        currentStream?.getTracks().forEach((track) => track.stop());

        // Requiert un nouveau flux vidéo avec les contraintes
        // "ideal" et non "exact" : dégrade proprement sur un poste sans caméra arrière.
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: {ideal: 1920},
                height: {ideal: 1080},
                facingMode: {ideal: facingMode},
            },
            audio: false,
        });

        if (!video) return newStream;

        // Configure la source vidéo et lance la lecture
        video.srcObject = newStream;

        await new Promise<void>((resolve) => {
            video.onloadedmetadata = async () => {
                await video.play();
                resolve();
            };
        });

        return newStream;

    } catch (error) {
        console.error("Erreur lors de l'accès à la caméra:", error);
        alert("Impossible d'accéder à la webcam.");
        return null;
    }
}

/**
 * Bascule entre caméra frontale et arrière.
 * 
 * Cette fonction :
 * 1. Inverse le mode actuel (user <-> environment)
 * 2. Réinitialise lastVideoTime pour forcer le retraitement de la première frame
 * 3. Démarre la nouvelle caméra avec startCamera()
 * 
 * @param video - Élément HTMLVideoElement à configurer
 * @param facingModeRef - Référence réactive vers le mode de caméra actuel
 * @param currentStream - Flux vidéo actuel à libérer
 * @param lastVideoTimeRef - Référence mutable vers le timestamp de la dernière frame
 * @returns Promise résolue avec un objet contenant le nouveau flux et le mode
 */
export async function switchCamera(
    video: HTMLVideoElement | null,
    facingModeRef: Ref<FacingMode>,
    currentStream: MediaStream | null,
    lastVideoTimeRef: { value: number }
): Promise<{ stream: MediaStream | null; facingMode: FacingMode }> {
    // Inverse le mode de caméra
    const newFacingMode = facingModeRef.value === "user" ? "environment" : "user";
    facingModeRef.value = newFacingMode;
    
    // Réinitialise le timestamp pour forcer le retraitement de la première frame
    lastVideoTimeRef.value = -1;
    
    // Démarre la nouvelle caméra
    const stream = await startCamera(video, newFacingMode, currentStream);

    return {stream, facingMode: newFacingMode};
}

/**
 * Redimensionne le canvas pour correspondre à la résolution de la vidéo.
 * Doit être appelé après que les métadonnées vidéo soient chargées.
 * 
 * @param video - Élément HTMLVideoElement source
 * @param canvas - Élément HTMLCanvasElement à redimensionner
 */
export function resizeCanvas(
    video: HTMLVideoElement | null,
    canvas: HTMLCanvasElement | null
): void {
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}
