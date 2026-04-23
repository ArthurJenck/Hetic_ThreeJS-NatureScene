# Hetic_ThreeJS-NatureScene

Projet de scène de nature en Three.js, réalisé pour le cours de ThreeJS à HETIC, par Dany Siriphol.

## Ouvrir le projet

Le projet fonctionne en CDN et n'utilise pas npm pour le build, par contrainte du projet. Il faut simplement lancer un serveur statique dans le dossier :

- `python -m http.server`
- `npx serve`
- VS Code avec Live Server ou Live Preview

Ensuite, ouvrez l'URL locale affichée par le serveur pour voir la scène.

## Debug

- URL normale : affiche la scène.
- URL avec `/#debug` : affiche davantage de contrôles de debug.
- La console affiche aussi le nombre de polygones visibles au chargement avec un log du type `Triangles visibles au chargement: ...`.

## Checklist projet

- [x] Génération de terrain
- [x] Sol avec texture color / normal / roughness
- [x] Herbe placée aléatoirement
- [x] Ciel / sky shader
- [x] Plantes et buissons avec InstancedMesh
- [x] Post-processing / bloom
- [x] LOD et impostors pour les arbres
- [x] Shader et plan d'eau
- [x] Fog et lumières
- [x] Particules / animation en boucle
- [x] Scène en CDN sans npm
- [x] Plus de 100 000 polygones visibles, vérifiable via le log console

## Crédits

- Arbres : `Stylize Tree Lowpoly` par uday, `Cartoon Tree` par adarose, `Ghibli Stylized Tree` par Alex Ace, d'après les fichiers `license.txt` (`CC-BY-4.0`).
- Renard : `Fox and Shiba` par pixelmannen, OpenGameArt, licence CC0 : <https://opengameart.org/content/fox-and-shiba>
- Rochers : `Smooth Rocks Pack` par Nicholas-3D, Sketchfab, licence CC Attribution : <https://sketchfab.com/3d-models/smooth-rocks-pack-4503b42e55fd4fd4b42f0f18abc43298>
- Musique : Zelda Breath of the Wild.
- Bruitages du renard : Minecraft.
- Bruitages du vent : trouvés sur YouTube.
