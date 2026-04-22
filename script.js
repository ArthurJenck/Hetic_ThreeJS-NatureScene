import * as THREE from 'three'
import Stats from 'three/addons/libs/stats.module.js'
import GUI from 'lil-gui'
import { createRenderer, attachResize } from './src/renderer.js'
import {
    createCamera,
    createDevControls,
    applySway,
    DEV_CAMERA,
} from './src/camera.js'
import { createSky } from './src/sky.js'
import { createLights } from './src/lights.js'
import { createTerrain } from './src/terrain.js'
import { createGrass } from './src/grass.js'

const canvas = document.querySelector('canvas.webgl')

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

const scene = new THREE.Scene()
scene.fog = new THREE.Fog('#cfe3ff', 60, 220)
scene.background = new THREE.Color('#cfe3ff')

const renderer = createRenderer(canvas)
renderer.setSize(sizes.width, sizes.height)

const camera = createCamera(sizes)
scene.add(camera)

const controls = DEV_CAMERA ? createDevControls(camera, canvas) : null

attachResize(renderer, camera, sizes)

const { group: skyGroup, sunDirection } = createSky()
scene.add(skyGroup)

const { group: lightsGroup } = createLights(sunDirection)
scene.add(lightsGroup)

const anisotropy = renderer.capabilities.getMaxAnisotropy()

const { mesh: terrain, sampleHeight } = createTerrain()
scene.add(terrain)

const {
    mesh: grass,
    update: updateGrass,
    uniforms: grassUniforms,
} = createGrass({
    sampleHeight,
    anisotropy,
})
scene.add(grass)

const gui = new GUI({ title: 'Colors' })

const terrainFolder = gui.addFolder('Terrain')
terrainFolder
    .addColor({ color: `#${terrain.material.color.getHexString()}` }, 'color')
    .name('Sol')
    .onChange((value) => terrain.material.color.set(value))

const grassFolder = gui.addFolder('Grass')
grassFolder
    .addColor(
        { color: `#${grassUniforms.uBaseTint.value.getHexString()}` },
        'color',
    )
    .name('Base')
    .onChange((value) => grassUniforms.uBaseTint.value.set(value))
grassFolder
    .addColor(
        { color: `#${grassUniforms.uTipTint.value.getHexString()}` },
        'color',
    )
    .name('Pointe')
    .onChange((value) => grassUniforms.uTipTint.value.set(value))

const stats = new Stats()
document.body.appendChild(stats.dom)

const startTime = performance.now()

const tick = () => {
    const elapsedTime = (performance.now() - startTime) / 1000

    if (controls) {
        controls.update()
    } else {
        applySway(camera, elapsedTime)
    }

    updateGrass(elapsedTime)

    stats.update()
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()
