# 💍 Demo
https://ctamisier.github.io/ring-siaze

#  Scanner Visuel - Calculateur de Taille de Bague & Poignet

Ce projet est une application web intelligente capable de mesurer précisément le tour de doigt (pour choisir une bague) ou la taille du poignet (pour un bracelet) en utilisant simplement la caméra d'un smartphone ou d'un ordinateur.

Pour réussir à mesurer au millimètre près sans connaître la distance entre la main et l'objectif, l'application utilise un repère universel que tout le monde a dans sa poche : **une carte bancaire**.

---

## Comment ça marche ? (La magie derrière l'écran)

L'application découpe son travail en 5 grandes étapes visuelles pour transformer une simple image en un outil de mesure de précision.

### 1. Le grand nettoyage (Le filtre "Spécial Peau")
Pour ne pas être perturbée par le décor (la table, le canapé, le fond), l'application isole instantanément tout ce qui ressemble à de la peau humaine. Pour elle, tout le fond devient noir et votre main se transforme en une silhouette blanche très nette.

### 2. Le repérage de la carte (L'outil de mesure)
Toutes les cartes bancaires du monde font exactement la même taille (8,56 cm de large). L'application s'en sert comme d'une règle virtuelle :
* Elle passe l'image en noir et blanc et augmente les contrastes.
* Elle cherche un rectangle parfait à 4 coins qui a exactement les proportions d'une carte.
* **Résultat visuel :** Un **cadre vert** entoure la carte. L'application sait désormais combien de pixels représentent 1 centimètre !

### 3. Le squelette de la main (Le jeu des points)
Dès que votre main apparaît, une intelligence artificielle place instantanément **21 points virtuels** sur vos articulations et le bout de vos doigts.
* **Résultat visuel :** Un **squelette bleu** s'affiche à l'écran et suit vos mouvements pour identifier précisément où se trouve chaque doigt, notamment l'annulaire.

### 4. La mesure de précision
* **Pour le doigt :** L'application repère l'annulaire grâce au squelette bleu. Elle trace plusieurs lignes de scan invisibles sur la phalange et mesure la largeur de la silhouette de votre peau. Elle calcule ensuite la circonférence exacte de votre doigt.
    * *Résultat visuel :* Une **ligne rose** s'affiche sur votre doigt avec votre taille de bague européenne (ex: Taille 52).
* **Pour le poignet :** Elle descend légèrement en dessous de la main pour scanner la largeur de votre avant-bras.
    * *Résultat visuel :* Une **ligne jaune** apparaît sur votre poignet.

### 5. La capture automatique (Le "Flash")
Plus besoin de trembler en essayant d'appuyer sur un bouton ! Dès que l'application détecte en même temps la carte (cadre vert) et la main (lignes de mesure), elle déclenche un **flash blanc sur l'écran** et fige l'image. Les résultats sont gravés directement sur la photo pour que vous puissiez les lire tranquillement.

---

## Comment l'utiliser au mieux ?

Pour obtenir une mesure parfaite dès le premier coup :

1. **Le bon décor :** Posez votre main à plat sur une table avec une couleur qui contraste bien avec votre peau (évitez les tables couleur beige/peau).
2. **La carte :** Posez une carte bancaire (ou une carte de fidélité au même format) juste à côté de votre main.
3. **La position :** Écartez bien les doigts et gardez la paume face à la caméra.
4. **Le clic :** Laissez l'application faire le "Flash" automatique, ou reprenez la photo si votre main a bougé !

---

## Côté Technique (En bref)

Bien que l'expérience soit simple pour l'utilisateur, cette application combine deux technologies de pointe :
* **OpenCV.js :** Pour toute la partie traitement d'image, détection des formes géométriques et calcul de la carte bancaire.
* **MediaPipe Hands :** L'intelligence artificielle de Google qui s'occupe de trouver la main et de dessiner le squelette virtuel en temps réel.
* **Vue 3 & TypeScript :** Pour une interface fluide, rapide et moderne.