import {FilesetResolver, HandLandmarker} from "@mediapipe/tasks-vision";

/**
 * Module d'initialisation MediaPipe Hand Landmarker.
 * 
 * MediaPipe est une bibliothèque de détection de poses et landmarks développée par Google.
 * HandLandmarker détecte 21 landmarks (points de repère) sur une main dans une image ou vidéo.
 * 
 * Les 21 landmarks correspondent à :
 * - 0 : Poignet
 * - 1-4 : Pouce (de la base à l'extrémité)
 * - 5-8 : Index
 * - 9-12 : Majeur
 * - 13-16 : Annulaire (celui utilisé pour la mesure de bague)
 * - 17-20 : Auriculaire
 */

/**
 * URL du CDN pour les fichiers WASM de MediaPipe.
 * Version figée sur 0.10.35 pour éviter tout mismatch JS/WASM.
 */
const WASM_CDN =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

/**
 * URL du modèle HandLandmarker pré-entraîné.
 * Modèle float16 pour un compromis entre précision et performance.
 */
const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/**
 * Initialise le HandLandmarker de MediaPipe.
 * 
 * Configuration :
 * - delegate: "GPU" - Utilise l'accélération GPU pour de meilleures performances
 * - numHands: 1 - Détecte une seule main (optimisation pour mobile)
 * - runningMode: "VIDEO" - Optimisé pour le traitement vidéo (streaming)
 * 
 * Cette fonction doit être appelée avant de commencer la détection des mains.
 * Elle charge les fichiers WASM et le modèle, ce qui peut prendre quelques secondes.
 * 
 * @returns Promise résolue avec l'instance HandLandmarker prête à l'emploi
 */
export async function initHandLandmarker(): Promise<HandLandmarker> {
    // Charger le FilesetResolver pour les tâches de vision
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    // Créer le HandLandmarker avec les options spécifiées
    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
        },
        numHands: 1,
        runningMode: "VIDEO",
    });

    console.log("MediaPipe HandLandmarker is ready!");
    return handLandmarker;
}
