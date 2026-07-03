/**
* Composant principal de l'application RingSiaze.
*
* Ce composant gère :
* - L'affichage de la caméra vidéo
* - La détection des mains via MediaPipe
* - La détection de la carte bancaire via OpenCV
* - La mesure du doigt et du poignet
* - L'affichage des résultats (taille de bague en EU)
* - La capture d'écran (screenshot) quand carte + doigt sont détectés
*
* Architecture :
* - Template : affiche la vidéo, les canvases overlay, et les résultats
* - Script : initialise les bibliothèques, gère la boucle de rendu (requestAnimationFrame)
* - Style : positionne les éléments et gère l'apparence
*/
<template>
  <div class="stage">
    <!-- Conteneur principal avec la caméra -->
    <div class="webcam-container" :class="{ 'screenshot-flash': screenshotFlash }">
      <!-- Élément vidéo pour la caméra -->
      <video
          ref="video"
          autoplay
          playsinline
          muted
          class="webcam"
      />

      <!-- Canvas overlay pour dessiner : main, carte, mesures -->
      <canvas
          ref="overlay"
          class="overlay"
      />

      <!-- Canvas caché pour le traitement OpenCV -->
      <canvas
          ref="processingCanvas"
          style="display:none"
      />

      <!-- Zone d'affichage des résultats de mesure -->
      <div class="result">
        <template v-if="tailleEu !== null">
          <div>Tour de doigt : <strong>{{ tourCm }} cm</strong></div>
          <div>Taille (EU) : <strong>{{ tailleEu }}</strong></div>
        </template>
        <template v-else>
          {{ statusMsg }}
        </template>
      </div>

      <!-- Compte à rebours avant screenshot -->
      <div v-if="countdown !== null" class="countdown">
        {{ countdown }}
      </div>

      <!-- Bouton pour basculer entre caméra frontale et arrière -->
      <button class="switch-cam" type="button" @click="handleSwitchCamera">
        Changer de caméra ({{ facingMode === "environment" ? "arrière" : "frontale" }})
      </button>
    </div>

    <!-- Zone d'affichage du screenshot (apparaît après capture) -->
    <div v-if="screenshot" class="shot">
      <img :src="screenshot" alt="Capture carte + doigt"/>
      <button type="button" @click="handleResume">Reprendre</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Script du composant WebcamView.
 *
 * Dépendances :
 * - Vue : pour la réactivité (ref, onMounted, onBeforeUnmount)
 * - OpenCV : pour le traitement d'image et détection de carte
 * - MediaPipe : pour la détection des landmarks de la main
 * - Services locaux : fonctions de détection, dessin, capture
 */
import {onBeforeUnmount, onMounted, ref} from "vue";
import {initOpenCV} from "../services/openCV.ts";
import {initHandLandmarker} from "../services/mediapipe.ts";
import type {HandLandmarker} from "@mediapipe/tasks-vision";
import type {FingerMeasure, Landmark} from "../types/ringSize";

// Import des fonctions de détection et dessin
import {
  buildSkinMask,
  CARD_WIDTH_MM,
  DEFAULT_MIN_CHANGE_THRESHOLD,
  DEFAULT_SMOOTHING_FACTOR,
  detectCard,
  detectHand,
  drawDebug,
  drawLandmarks,
  drawMeasure,
  drawQuad,
  measureRingFinger,
  measureWrist,
  smoothMeasure,
  WRIST_COLOR,
} from "../services";
import {captureScreenshot as captureScreenshotFunc} from "../services/screenshot";

// ============================================
// RÉFS VUE (réactives)
// ============================================

/** Référence vers l'élément <video> pour afficher la caméra */
const video = ref<HTMLVideoElement | null>(null);

/** Référence vers le canvas overlay pour dessiner les annotations */
const overlay = ref<HTMLCanvasElement | null>(null);

/** Référence vers le canvas caché pour le traitement OpenCV */
const processingCanvas = ref<HTMLCanvasElement | null>(null);

// ============================================
// VARIABLES D'ÉTAT (non réactives)
// ============================================

/** Instance OpenCV.js initialisée */
let cv: any = null;

/** Instance HandLandmarker de MediaPipe pour la détection des mains */
let handLandmarker: HandLandmarker | null = null;

/** Timestamp de la dernière frame traitée (pour éviter les doublons) */
let lastVideoTime = -1;

/** Dernière main détectée (landmarks) */
let lastHand: Landmark[] | null = null;

// ============================================
// STABILISATION DES MESURES (lissage temporel)
// ============================================

/** Dernière mesure de bague lissée (pour stabiliser l'affichage) */
let smoothedRingMeasure: FingerMeasure | null = null;

/** Dernière mesure de poignet lissée (pour stabiliser l'affichage) */
let smoothedWristMeasure: FingerMeasure | null = null;

/** Facteur de lissage pour les mesures de bague/poignet (0 = pas de lissage, 1 = pas de mouvement) */
const SMOOTHING_FACTOR = DEFAULT_SMOOTHING_FACTOR;

/** Seuil minimum de changement en pixels pour considérer une nouvelle mesure comme valide */
const MIN_CHANGE_THRESHOLD = DEFAULT_MIN_CHANGE_THRESHOLD;

// ============================================
// ÉTAT RÉACTIF POUR L'UI
// ============================================

/** Message de statut affiché quand aucune mesure n'est disponible */
const statusMsg = ref<string>("Initialisation…");

/** Tour de doigt en cm (affiché dans l'UI) */
const tourCm = ref<string | null>(null);

/** Taille de bague en unités européennes (affichée dans l'UI) */
const tailleEu = ref<number | null>(null);

/** Capture d'écran figée (affichée après détection carte + doigt) */
const screenshot = ref<string | null>(null);

/** État du flash visuel (bordure blanche temporaire après capture) */
const screenshotFlash = ref(false);

/** Compte à rebours avant screenshot (null = pas de countdown, 3..0 = affichage) */
const countdown = ref<number | null>(null);

/** Mode de caméra actuel : "environment" = arrière (mobile), "user" = frontale */
const facingMode = ref<"user" | "environment">("environment");

// ============================================
// AUTRES VARIABLES D'ÉTAT
// ============================================

/** Flux vidéo MediaStream de la caméra */
let stream: MediaStream | null = null;

/** ID de l'animation frame (pour cancelAnimationFrame) */
let animationId = 0;

/** ID du compte à rebours (pour clearInterval) */
let countdownId: number | null = null;

/** Mode debug : affiche les statistiques de détection pour diagnostiquer */
const DEBUG = true;

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Déclenche un effet visuel de flash (bordure blanche) pendant 1 seconde.
 * Utilisé pour indiquer à l'utilisateur qu'un screenshot a été pris.
 */
function triggerFlash() {
  screenshotFlash.value = true;
  setTimeout(() => {
    screenshotFlash.value = false;
  }, 1000);
}

/**
 * Démarre le compte à rebours de 3 secondes avant de prendre le screenshot.
 * Affiche: 3, 2, 1, puis déclenche la capture.
 */
function startCountdown(processingCanvas: HTMLCanvasElement, overlay: HTMLCanvasElement, measure: FingerMeasure) {
  // Arrêter un countdown précédent s'il existe
  if (countdownId !== null) {
    clearInterval(countdownId);
  }

  countdown.value = 3;
  let remaining = 3;

  countdownId = window.setInterval(() => {
    remaining--;

    if (remaining < 0) {
      // Temps écoulé, prendre le screenshot
      clearInterval(countdownId!);
      countdownId = null;
      countdown.value = null;

      const screenshotData = captureScreenshotFunc(
          processingCanvas,
          overlay,
          measure,
          triggerFlash
      );
      if (screenshotData) {
        screenshot.value = screenshotData;
      }
    } else {
      // Mettre à jour l'affichage du compte à rebours
      countdown.value = remaining;
    }
  }, 1000);
}

/**
 * Démarre la caméra avec les paramètres actuels.
 *
 * Cette fonction :
 * 1. Libère le flux vidéo précédent s'il existe
 * 2. Requiert un nouveau flux avec les contraintes (1920x1080, mode actuel)
 * 3. Configure la source vidéo de l'élément <video>
 * 4. Attend que les métadonnées soient chargées et lance la lecture
 * 5. Redimensionne le canvas overlay pour correspondre à la vidéo
 */
async function startCamera() {
  try {
    // Libère le flux précédent
    stream?.getTracks().forEach((track) => track.stop());

    // Requiert un nouveau flux vidéo
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: {ideal: 1920},
        height: {ideal: 1080},
        facingMode: {ideal: facingMode.value},
      },
      audio: false,
    });

    if (!video.value) return;

    // Configure la source vidéo
    video.value.srcObject = stream;

    // Attend que les métadonnées soient chargées et lance la lecture
    await new Promise<void>((resolve) => {
      video.value!.onloadedmetadata = async () => {
        await video.value!.play();
        resolve();
      };
    });

    // Redimensionne le canvas overlay
    resizeCanvas();
  } catch (error) {
    console.error("Erreur caméra:", error);
    alert("Impossible d'accéder à la webcam.");
  }
}

/**
 * Bascule entre caméra frontale et arrière.
 * Réinitialise lastVideoTime pour forcer le retraitement de la première frame.
 */
async function handleSwitchCamera() {
  facingMode.value = facingMode.value === "user" ? "environment" : "user";
  lastVideoTime = -1;
  await startCamera();
}

/**
 * Redimensionne le canvas overlay pour correspondre à la résolution de la vidéo.
 */
function resizeCanvas() {
  if (!video.value || !overlay.value) return;
  overlay.value.width = video.value.videoWidth;
  overlay.value.height = video.value.videoHeight;
}

/**
 * Gère le clic sur "Reprendre" après un screenshot.
 * Réinitialise le screenshot et le countdown.
 */
function handleResume() {
  screenshot.value = null;
  countdown.value = null;
  if (countdownId !== null) {
    clearInterval(countdownId);
    countdownId = null;
  }
}

// ============================================
// FONCTION PRINCIPALE : BOUCLE DE RENDU
// ============================================

/**
 * Fonction principale de rendu appelée à chaque frame via requestAnimationFrame.
 *
 * Pipeline de traitement :
 * 1. Efface le canvas overlay
 * 2. Copie la frame vidéo vers le processingCanvas
 * 3. Détecte la carte bancaire avec OpenCV (pour l'échelle mm/px)
 * 4. Détecte la main avec MediaPipe
 * 5. Mesure le doigt (annulaire) et le poignet
 * 6. Applique le lissage temporel sur les landmarks et mesures
 * 7. Dessine : carte, main, mesures de bague et poignet
 * 8. Capture un screenshot si carte + doigt sont détectés
 * 9. Affiche les infos de debug si DEBUG = true
 * 10. Nettoie les ressources OpenCV (Mat)
 *
 * Cette fonction s'appelle elle-même en boucle via requestAnimationFrame.
 */
function render() {
  if (!overlay.value) return;

  const ctx = overlay.value.getContext("2d");
  if (!ctx) return;

  // Effacer le canvas overlay
  ctx.clearRect(0, 0, overlay.value.width, overlay.value.height);

  if (
      processingCanvas.value &&
      video.value &&
      cv
  ) {
    // Configurer le canvas de traitement
    processingCanvas.value.width = video.value.videoWidth;
    processingCanvas.value.height = video.value.videoHeight;

    // Copier la frame vidéo vers le canvas de traitement
    const pctx = processingCanvas.value.getContext("2d", {willReadFrequently: true})!;
    pctx.drawImage(video.value, 0, 0);

    const W = overlay.value.width;
    const H = overlay.value.height;

    try {
      // Charger l'image dans OpenCV
      const src = cv.imread(processingCanvas.value);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Construire le masque de peau pour la détection
      const skin = buildSkinMask(src, cv);

      // ÉTAPE 1 : Détection de la carte bancaire -> calcul de l'échelle mm/px
      const card = detectCard(gray, skin, cv);
      if (card.best) {
        drawQuad(ctx, card.best.corners, "lime", 3, "Carte bancaire");
      }
      const mmPerPx = card.best ? CARD_WIDTH_MM / card.best.longSidePx : null;

      // ÉTAPE 2 : Détection de la main -> mesure du doigt et du poignet
      const handResult = detectHand(handLandmarker, video.value, lastVideoTime, lastHand);
      lastVideoTime = handResult.newLastVideoTime;
      lastHand = handResult.newLastHand;

      const hand = handResult.hand;
      let measure: FingerMeasure | null = null;
      let wrist: FingerMeasure | null = null;

      if (hand) {
        // Dessiner le squelette de la main
        drawLandmarks(ctx, hand);

        // Mesurer le doigt (annulaire) et le poignet
        measure = measureRingFinger(skin, hand, W, H, mmPerPx);
        wrist = measureWrist(skin, hand, W, H, mmPerPx);

        // Appliquer le lissage temporel aux mesures pour stabiliser l'affichage
        smoothedRingMeasure = smoothMeasure(smoothedRingMeasure, measure, SMOOTHING_FACTOR, MIN_CHANGE_THRESHOLD);
        smoothedWristMeasure = smoothMeasure(smoothedWristMeasure, wrist, SMOOTHING_FACTOR, MIN_CHANGE_THRESHOLD);

        // Dessiner les mesures lissées (bague en magenta, poignet en jaune)
        if (smoothedRingMeasure) drawMeasure(ctx, smoothedRingMeasure);
        if (smoothedWristMeasure) drawMeasure(ctx, smoothedWristMeasure, WRIST_COLOR, "poignet ");
      } else {
        // Réinitialiser les mesures lissées si la main n'est plus détectée
        smoothedRingMeasure = null;
        smoothedWristMeasure = null;
      }

      // Mettre à jour l'UI avec les résultats de mesure
      updateRingSize(measure, mmPerPx, hand !== null);

      // Capture automatique dès que carte + doigt sont détectés ensemble
      // Démarrer le compte à rebours si pas déjà actif et screenshot pas encore pris
      if (card.best && measure && !screenshot.value && countdown.value === null) {
        startCountdown(processingCanvas.value, overlay.value, measure);
      }

      // Réinitialiser le countdown si carte ou doigt disparaissent pendant le compte
      if (countdown.value !== null && (!card.best || !measure)) {
        if (countdownId !== null) {
          clearInterval(countdownId);
          countdownId = null;
        }
        countdown.value = null;
      }

      // Afficher les informations de debug si activé
      if (DEBUG) {
        drawDebug(ctx, card, mmPerPx, hand !== null, smoothedRingMeasure);
      }

      // Afficher le skin mask EN SUPERPOSITION (EN DERNIER, après tous les éléments)
      // drawSkinMask(ctx, skin, W, H);

      // Nettoyer le masque de peau
      skin.delete();

      // Nettoyer les ressources OpenCV
      gray.delete();
      src.delete();
    } catch (e) {
      console.error("render error", e);
    }
  }

  // Continuer la boucle de rendu
  animationId = requestAnimationFrame(render);
}

// ============================================
// FONCTIONS DE MISE À JOUR UI
// ============================================

/**
 * Met à jour les valeurs de taille de bague affichées dans l'UI.
 *
 * Affichage conditionnel :
 * - Si aucune mesure : affiche un message d'aide (main non détectée ou doigts non écartés)
 * - Si mesure mais pas d'échelle : demande de placer une carte bancaire
 * - Si mesure + échelle : affiche tour de doigt en cm et taille EU
 *
 * @param m - Mesure du doigt (null si non mesuré)
 * @param mmPerPx - Échelle mm/px (null si carte non détectée)
 * @param handDetected - Booléen indiquant si une main est détectée
 */
function updateRingSize(m: FingerMeasure | null, mmPerPx: number | null, handDetected: boolean) {
  if (!m) {
    // Aucune mesure disponible
    statusMsg.value = handDetected
        ? "Écarte bien les doigts (fond contrasté)"
        : "Main non détectée, paume face caméra";
    tourCm.value = null;
    tailleEu.value = null;
  } else if (mmPerPx === null || m.circumferenceMm === null) {
    // Mesure disponible mais pas d'échelle (carte non détectée)
    statusMsg.value = "Place une carte bancaire dans le champ pour l'échelle";
    tourCm.value = null;
    tailleEu.value = null;
  } else {
    // Tout est disponible : afficher les résultats
    const circ = m.circumferenceMm; // circonférence en mm
    statusMsg.value = "";
    tourCm.value = (circ / 10).toFixed(1);  // Convertir mm en cm
    tailleEu.value = Math.round(circ);    // Taille EU = circonférence en mm
  }
}

// ============================================
// HOOKS DE CYCLE DE VIE
// ============================================

/**
 * Hook appelé quand le composant est monté.
 *
 * Initialise l'application dans cet ordre :
 * 1. Démarre la caméra
 * 2. Initialise OpenCV.js en parallèle
 * 3. Initialise MediaPipe HandLandmarker en parallèle
 * 4. Attend que tout soit prêt
 * 5. Lance la boucle de rendu (render)
 */
onMounted(async () => {
  await startCamera();
  [cv, handLandmarker] = await Promise.all([initOpenCV(), initHandLandmarker()]);
  render();
});

/**
 * Hook appelé avant que le composant ne soit démonté.
 *
 * Nettoie les ressources :
 * 1. Annule la boucle de rendu (animationId)
 * 2. Arrête tous les tracks vidéo de la caméra
 * 3. Ferme le HandLandmarker de MediaPipe
 * 4. Annule le compte à rebours s'il est actif
 */
onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  stream?.getTracks().forEach((track) => track.stop());
  handLandmarker?.close();
  if (countdownId !== null) {
    clearInterval(countdownId);
  }
});
</script>

<style scoped>
/**
 * Styles du composant WebcamView.
 * 
 * Organisation :
 * - .stage : conteneur flex principal
 * - .webcam-container : conteneur de la caméra et overlays
 * - .webcam : élément vidéo
 * - .overlay : canvas pour les annotations
 * - .result : zone d'affichage des résultats
 * - .switch-cam : bouton pour changer de caméra
 * - .shot : conteneur du screenshot
 */

/* Conteneur principal : disposition flex avec enroulement */
.stage {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  justify-content: center;
}

/* Conteneur de la caméra : position relative pour les overlays absolus */
.webcam-container {
  position: relative;
  flex: 1 1 480px;
  min-width: 320px;
  max-width: 1200px;
}

/* Élément vidéo : bloc prenant toute la largeur */
.webcam {
  display: block;
  width: 100%;
  border-radius: 12px;
}

/* Effet de flash : bordure blanche temporaire après capture */
.webcam-container.screenshot-flash .webcam {
  border: 2px solid white;
}

/* Canvas overlay : positionné par-dessus la vidéo */
.overlay {
  position: absolute;
  inset: 0;

  width: 100%;
  height: 100%;

  /* Permet aux clics de traverser vers la vidéo */
  pointer-events: none;
}

/* Zone d'affichage des résultats : en bas à gauche */
.result {
  position: absolute;
  left: 12px;
  bottom: 12px;

  padding: 8px 14px;
  border-radius: 8px;

  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 18px;
}

/* Compte à rebours : au milieu en haut */
.countdown {
  position: absolute;
  left: 50%;
  top: 20px;
  transform: translateX(-50%);

  font-size: 48px;
  font-weight: bold;
  color: white;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.3);
  pointer-events: none;
}

/* Bouton pour changer de caméra : en haut à droite */
.switch-cam {
  position: absolute;
  right: 12px;
  top: 12px;

  padding: 10px 16px;
  border: none;
  border-radius: 8px;

  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-size: 15px;
  cursor: pointer;
}

/* Effet hover sur le bouton */
.switch-cam:hover {
  background: rgba(0, 0, 0, 0.85);
}

/* Conteneur du screenshot : colonne flex à côté de la caméra */
.shot {
  flex: 0 1 360px;
  min-width: 240px;

  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

/* Image du screenshot */
.shot img {
  width: 100%;
  border-radius: 12px;
}

/* Bouton pour reprendre après capture */
.shot button {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;

  background: #222;
  color: white;
  font-size: 15px;
  cursor: pointer;
}

/* Effet hover sur le bouton du screenshot */
.shot button:hover {
  background: #000;
}
</style>
