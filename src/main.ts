/**
 * Point d'entrée de l'application Vue.
 * 
 * Ce fichier initialise l'application Vue et la monte sur l'élément DOM
 * avec l'ID "app". L'application principale est définie dans App.vue.
 */
import {createApp} from "vue";
import App from "./App.vue";

// Créer et monter l'application Vue sur l'élément #app
createApp(App).mount("#app");