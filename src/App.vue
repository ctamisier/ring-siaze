/**
 * Composant racine de l'application RingSiaze.
 * 
 * Ce composant est le point d'entrée de l'application. Il affiche simplement
 * le composant WebcamView qui gère toute la logique de détection et d'affichage.
 */
<template>
  <WebcamView/>
</template>

<script setup lang="ts">
import WebcamView from "./components/WebcamView.vue";
</script>

<style>
/**
 * Styles globaux pour l'application :
 * - Réinitialise les marges et paddings par défaut
 * - Force la hauteur à 100% pour occuper toute la fenêtre
 * - Active box-sizing: border-box pour tous les éléments
 */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  background: #fff;
}

* {
  box-sizing: border-box;
}
</style>
