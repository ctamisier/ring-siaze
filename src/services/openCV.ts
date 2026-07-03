import cvModule from "@techstark/opencv-js";

/**
 * Module d'initialisation OpenCV.js.
 * 
 * OpenCV.js est une bibliothèque de vision par ordinateur qui s'exécute dans le navigateur.
 * Elle est utilisée pour :
 * - Détection des contours (Canny, findContours)
 * - Traitement d'image (flou gaussien, morphologie, etc.)
 * - Détection de carte bancaire (minAreaRect, approxPolyDP)
 * - Construction du masque de peau (cvtColor, inRange)
 */

/**
 * Initialise et retourne l'instance OpenCV.
 * 
 * Gère les différents modes d'initialisation de la bibliothèque :
 * - Si cvModule est une Promise, attend sa résolution
 * - Si cvModule.Mat existe, l'instance est déjà prête
 * - Sinon, attend l'événement onRuntimeInitialized
 * 
 * @returns Promise résolue avec un objet contenant l'instance cv
 */
async function getOpenCV() {
    let cv;
    if (cvModule instanceof Promise) {
        cv = await cvModule;
    } else {
        if (cvModule.Mat) {
            cv = cvModule;
        } else {
            await new Promise<void>((resolve) => {
                cvModule.onRuntimeInitialized = () => resolve();
            });
            cv = cvModule;
        }
    }
    return {cv};
}

/**
 * Initialise OpenCV.js et retourne l'instance prête à l'emploi.
 * 
 * Cette fonction doit être appelée avant toute utilisation des fonctions OpenCV.
 * Elle charge les modules WASM nécessaire et retourne une Promise.
 * 
 * @returns Promise résolue avec l'instance OpenCV.js
 */
export async function initOpenCV() {
    const {cv} = await getOpenCV();
    console.log("OpenCV.js is ready!");
    return cv;
}
