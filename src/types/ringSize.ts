/**
 * Types partagés pour la détection de taille de bague et de bracelet.
 * Ces interfaces définissent les structures de données utilisées par l'ensemble
 * de l'application pour représenter les détections et les mesures.
 */

/**
 * Représente un point de repère (landmark) détecté par MediaPipe.
 * Utilisé pour les 21 points de la main.
 * @property x - Coordonnée X normalisée (0-1)
 * @property y - Coordonnée Y normalisée (0-1)
 * @property z - Coordonnée Z (profondeur) normalisée
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Représente un point 2D dans l'espace image (en pixels).
 * Utilisé pour les coins des quadrilatères et les bords des mesures.
 * @property x - Coordonnée X en pixels
 * @property y - Coordonnée Y en pixels
 */
export interface Corner {
  x: number;
  y: number;
}

/**
 * Représente un candidat de détection de carte bancaire.
 * Une carte valide doit avoir un ratio proche de 1.586 (norme ISO/IEC 7810 ID-1)
 * et une rectangularité élevée.
 * @property corners - Les 4 coins du rectangle orienté de la carte
 * @property area - Surface du contour en pixels²
 * @property ratio - Ratio largeur/hauteur du rectangle orienté
 * @property rectangularity - Indice de rectangularité (0-1, 1 = rectangle parfait)
 * @property longSidePx - Longueur du grand côté en pixels (pour calculer l'échelle mm/px)
 */
export interface CardCandidate {
  corners: Corner[]; // 4 sommets du rectangle orienté
  area: number;
  ratio: number;
  rectangularity: number;
  longSidePx: number; // grand côté en px -> échelle avec CARD_WIDTH_MM
}

/**
 * Résultat complet de la détection de carte bancaire.
 * Contient tous les contours détectés et les informations de filtrage.
 * @property best - Meilleur candidat carte (ou null si aucune détectée)
 * @property total - Nombre total de contours trouvés (sans aucun filtre)
 * @property areaPass - Nombre de contours passant le filtre de surface minimale
 * @property candidates - Tableau de contours passant les filtres surface et ratio
 * @property largestFrac - Fraction de l'image occupée par le plus gros contour
 * @property largestPoly - Polygone approximé du plus gros contour (pour debug)
 */
export interface DetectResult {
  best: CardCandidate | null;
  total: number;            // nb total de contours trouvés (aucun filtre)
  areaPass: number;         // nb de contours passant le filtre de surface
  candidates: Corner[][];   // rects passant surface+ratio (avant rectangularité)
  largestFrac: number;      // surface du plus gros contour (fraction image)
  largestPoly: Corner[];    // le plus gros contour, approximé (debug)
}

/**
 * Mesure d'un doigt ou d'un poignet.
 * Contient toutes les informations nécessaires pour afficher la mesure
 * et calculer la taille de bague ou de bracelet.
 * @property center - Point central de la mesure
 * @property edgeA - Point du bord A (côté positif de la normale)
 * @property edgeB - Point du bord B (côté négatif de la normale)
 * @property widthPx - Largeur mesurée en pixels
 * @property widthMm - Largeur mesurée en millimètres (null si échelle non disponible)
 * @property circumferenceMm - Circonférence calculée en mm (π × diamètre, null si échelle non disponible)
 * @property linesUsed - Nombre de lignes de scan qui ont contribué à la mesure (indice de qualité)
 */
export interface FingerMeasure {
  center: Corner;
  edgeA: Corner;
  edgeB: Corner;
  widthPx: number;
  widthMm: number | null;
  circumferenceMm: number | null;
  linesUsed: number; // nb de lignes de scan concordantes (qualité)
}
