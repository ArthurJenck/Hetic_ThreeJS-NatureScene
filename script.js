import * as THREE from 'three'
import Stats from 'three/addons/libs/stats.module.js'
import GUI from 'lil-gui'
import { createRenderer, attachResize } from './src/renderer.js'
import {
    createCamera,
    createDevControls,
    applySway,
    DEV_CAMERA,
    BASE_POSITION,
} from './src/camera.js'
import { createSky } from './src/sky.js'
import { createLights } from './src/lights.js'
import { createTerrain } from './src/terrain.js'
import { createGrass, GRASS_DEFAULTS } from './src/grass.js'
import { createBushes, createPlants } from './src/foliage.js'
import { createForest, FOREST_DEFAULTS } from './src/trees.js'
import { createPond } from './src/pond.js'
import { wind, updateWind, triggerGust, WIND_DEFAULTS } from './src/wind.js'
import { createAudio } from './src/audio.js'
import { createFoxes } from './src/foxes.js'
import { createLeaves } from './src/leaves.js'
import { createPostProcessing } from './src/postprocessing.js'

const canvas = document.querySelector('canvas.webgl')

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2('#84c3f2', 0.025)
scene.background = new THREE.Color('#84c3f2')

const renderer = createRenderer(canvas)
renderer.setSize(sizes.width, sizes.height)

const camera = createCamera(sizes)
scene.add(camera)

const controls = DEV_CAMERA ? createDevControls(camera, canvas) : null

const { group: skyGroup, sunDirection } = createSky()
scene.add(skyGroup)

const { group: lightsGroup, directionalLight } = createLights(sunDirection)
scene.add(lightsGroup)

const anisotropy = renderer.capabilities.getMaxAnisotropy()

const gui = new GUI()

const stats = new Stats()
document.body.appendChild(stats.dom)

const clock = new THREE.Clock()
let updateGrass = () => {}
let updatePond = () => {}
let updateForest = () => {}
let updateFoxes = () => {}
let updateLeaves = () => {}
let composer = null
let updatePostProcessing = () => {}
let setGrassCount = () => {}
let setGodRaysEnabled = () => {}
let setWarmEnabled = () => {}
let setComposerBypass = () => {}
let composerBypassed = false
let setForestCastShadows = () => {}
let adaptiveBloomPass = null

const QUALITY_HIGH = 2, QUALITY_MEDIUM = 1, QUALITY_LOW = 0
const GRASS_BY_TIER = [25000, 60000, 80000]
const FPS_SAMPLE_INTERVAL = 2
const DOWNGRADE_FPS = 50, DOWNGRADE_HOLD = 2
const UPGRADE_FPS = 57, UPGRADE_HOLD = 20
let currentTier = QUALITY_HIGH
let fpsSampleTime = 0
let fpsSampleFrames = 0
let downgradeTimer = 0
let upgradeTimer = 0

const applyQualityTier = (tier) => {
    setGrassCount(GRASS_BY_TIER[tier])
    setGodRaysEnabled(tier === QUALITY_HIGH)
    if (adaptiveBloomPass) adaptiveBloomPass.enabled = tier !== QUALITY_LOW
    setWarmEnabled(tier !== QUALITY_LOW)
    const bypass = tier === QUALITY_LOW
    setComposerBypass(bypass)
    composerBypassed = bypass
    renderer.setPixelRatio(tier === QUALITY_HIGH ? Math.min(window.devicePixelRatio, 1.5) : 1.0)
    setForestCastShadows(tier !== QUALITY_LOW)
    const shadowSize = tier === QUALITY_LOW ? 256 : 512
    directionalLight.shadow.mapSize.set(shadowSize, shadowSize)
    if (directionalLight.shadow.map) {
        directionalLight.shadow.map.dispose()
        directionalLight.shadow.map = null
    }
    renderer.shadowMap.needsUpdate = true
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        clock.getDelta()
        fpsSampleTime = 0
        fpsSampleFrames = 0
        downgradeTimer = 0
        upgradeTimer = 0
    }
})

const isDebug = window.location.hash.includes('#debug')
if (!isDebug) gui.close()

const audio = createAudio(camera, gui, isDebug)

const setupGui = ({
    terrain,
    grassUniforms,
    grassRegrow,
    dirLight,
    forestRegrow,
    forestSetCastShadows,
}) => {
    const triggerGustFn = () => {
        const dur = audio?.getGustDuration?.() ?? null
        triggerGust(clock.getElapsedTime(), dur)
        audio?.playGust?.()
    }

    if (!isDebug) {
        const grassParams = {
            count: GRASS_DEFAULTS.count,
            clusterRadius: GRASS_DEFAULTS.clusterRadius,
        }
        gui.add(grassParams, 'count', 500, 1000000, 500)
            .name('Grass densité')
            .onFinishChange((v) => {
                grassParams.count = v
                grassRegrow(grassParams.count, grassParams.clusterRadius)
            })

        const forestParams = {
            density: FOREST_DEFAULTS.density,
            clusterRadius: FOREST_DEFAULTS.clusterRadius,
            forestRadius: FOREST_DEFAULTS.forestRadius,
            scale: FOREST_DEFAULTS.scale,
            castShadows: FOREST_DEFAULTS.castShadows,
        }
        gui.add(forestParams, 'density', 0.2, 3, 0.1)
            .name('Forêt densité')
            .onFinishChange(() => forestRegrow(forestParams))
        gui.add(forestParams, 'castShadows')
            .name('Forêt ombres')
            .onChange((v) => forestSetCastShadows(v))

        gui.add({ fn: triggerGustFn }, 'fn').name('Declencher bourrasque')
        return
    }

    const perfFolder = gui.addFolder('Performances')
    const perfParams = {
        shadowSize: 512,
        pixelRatio: Math.min(window.devicePixelRatio, 1.5),
    }

    perfFolder
        .add(perfParams, 'shadowSize', [256, 512, 1024, 2048])
        .name('Ombres (px)')
        .onChange((v) => {
            dirLight.shadow.mapSize.set(v, v)
            if (dirLight.shadow.map) {
                dirLight.shadow.map.dispose()
                dirLight.shadow.map = null
            }
            renderer.shadowMap.needsUpdate = true
        })

    perfFolder
        .add(perfParams, 'pixelRatio', {
            '1x': 1,
            '1.5x': 1.5,
            Natif: window.devicePixelRatio,
        })
        .name('Resolution')
        .onChange((v) => renderer.setPixelRatio(v))

    const terrainFolder = gui.addFolder('Terrain')
    terrainFolder
        .addColor({ color: '#d9e3c1' }, 'color')
        .name('Sol')
        .onChange((value) => terrain.material.color.set(value))

    const grassFolder = gui.addFolder('Grass')
    const grassParams = {
        count: GRASS_DEFAULTS.count,
        clusterRadius: GRASS_DEFAULTS.clusterRadius,
    }

    grassFolder
        .add(grassParams, 'count', 500, 1000000, 500)
        .name('Densite')
        .onFinishChange((value) => {
            grassParams.count = value
            grassRegrow(grassParams.count, grassParams.clusterRadius)
        })

    grassFolder
        .add(grassParams, 'clusterRadius', 1, 35, 0.5)
        .name('Taille des touffes')
        .onFinishChange((value) => {
            grassParams.clusterRadius = value
            grassRegrow(grassParams.count, grassParams.clusterRadius)
        })

    grassFolder
        .addColor(
            { color: `#${grassUniforms.uTipTint.value.getHexString()}` },
            'color',
        )
        .name('Pointe')
        .onChange((value) => grassUniforms.uTipTint.value.set(value))
    grassFolder
        .addColor(
            { color: `#${grassUniforms.uBaseTint.value.getHexString()}` },
            'color',
        )
        .name('Base')
        .onChange((value) => grassUniforms.uBaseTint.value.set(value))

    const forestFolder = gui.addFolder('Foret')
    const forestParams = {
        density: FOREST_DEFAULTS.density,
        clusterRadius: FOREST_DEFAULTS.clusterRadius,
        forestRadius: FOREST_DEFAULTS.forestRadius,
        scale: FOREST_DEFAULTS.scale,
        castShadows: FOREST_DEFAULTS.castShadows,
    }

    forestFolder
        .add(forestParams, 'density', 0.2, 3, 0.1)
        .name('Densite')
        .onFinishChange(() => forestRegrow(forestParams))

    forestFolder
        .add(forestParams, 'forestRadius', 15, 35, 1)
        .name('Dispersion')
        .onFinishChange(() => forestRegrow(forestParams))

    forestFolder
        .add(forestParams, 'clusterRadius', 1, 6, 0.25)
        .name('Groupement')
        .onFinishChange(() => forestRegrow(forestParams))

    forestFolder
        .add(forestParams, 'scale', 0.6, 1.6, 0.05)
        .name('Taille')
        .onFinishChange(() => forestRegrow(forestParams))

    forestFolder
        .add(forestParams, 'castShadows')
        .name('Ombres')
        .onChange((value) => forestSetCastShadows(value))

    const windFolder = gui.addFolder('Vent')
    const windParams = {
        baseStrength: WIND_DEFAULTS.baseStrength,
        gustStrength: WIND_DEFAULTS.gustStrength,
        gustIntervalMin: WIND_DEFAULTS.gustIntervalMin,
        gustIntervalMax: WIND_DEFAULTS.gustIntervalMax,
        declencherBourrasque: triggerGustFn,
    }

    windFolder
        .add(windParams, 'baseStrength', 0, 0.5, 0.01)
        .name('Vent de base')
        .onChange((v) => {
            wind.params.baseStrength = v
        })
    windFolder
        .add(windParams, 'gustStrength', 0.5, 2, 0.05)
        .name('Bourrasque')
        .onChange((v) => {
            wind.params.gustStrength = v
        })
    windFolder
        .add(windParams, 'gustIntervalMin', 5, 60, 1)
        .name('Intervalle min (s)')
        .onChange((v) => {
            wind.params.gustIntervalMin = v
        })
    windFolder
        .add(windParams, 'gustIntervalMax', 10, 120, 1)
        .name('Intervalle max (s)')
        .onChange((v) => {
            wind.params.gustIntervalMax = v
        })
    windFolder
        .add(windParams, 'declencherBourrasque')
        .name('Declencher bourrasque')
}

const countGeometryTriangles = (object) => {
    if (!object.geometry) return 0
    const index = object.geometry.getIndex()
    const position = object.geometry.getAttribute('position')
    if (!position) return 0
    const baseTriangles = index ? index.count / 3 : position.count / 3
    return object.isInstancedMesh ? baseTriangles * object.count : baseTriangles
}

const logVisibleTriangleCountOnce = (scene, camera, renderer) => {
    renderer.render(scene, camera)
    let triangles = 0
    scene.traverseVisible((object) => {
        triangles += countGeometryTriangles(object)
    })
    console.info(
        `Triangles visibles au chargement: ${Math.round(triangles).toLocaleString('fr-FR')}`,
    )
}

const init = async () => {
    const { mesh: terrain, sampleHeight } = createTerrain({ anisotropy })
    scene.add(terrain)

    const grassData = createGrass({ sampleHeight, anisotropy, wind })
    updateGrass = grassData.update
    setGrassCount = grassData.setCount
    scene.add(grassData.mesh)

    const { mesh: bushes } = createBushes({ sampleHeight, anisotropy, wind })
    scene.add(bushes)

    const { mesh: plants } = createPlants({ sampleHeight, anisotropy, wind })
    scene.add(plants)

    const {
        group: forest,
        featureTree,
        update: forestUpdate,
        regrow: forestRegrow,
        setCastShadows: forestSetCastShadows,
        trees: allTrees,
    } = await createForest({
        sampleHeight,
        cameraClearing: { x: BASE_POSITION.x, z: BASE_POSITION.z, radius: 6 },
        wind,
    })
    updateForest = forestUpdate
    setForestCastShadows = forestSetCastShadows
    scene.add(forest)
    scene.add(featureTree)

    const pondData = await createPond(sampleHeight, sunDirection, camera)
    updatePond = pondData.update
    scene.add(pondData.group)

    const foxData = await createFoxes({ sampleHeight, gui, audio, isDebug })
    updateFoxes = foxData.update
    scene.add(foxData.group)

    const leavesData = createLeaves({ wind, gui, isDebug })
    updateLeaves = (dt) => leavesData.update(dt, camera)
    scene.add(leavesData.mesh)

    setupGui({
        terrain,
        grassUniforms: grassData.uniforms,
        grassRegrow: grassData.regrow,
        dirLight: directionalLight,
        forestRegrow,
        forestSetCastShadows,
    })

    const pp = createPostProcessing({
        renderer,
        scene,
        camera,
        skyGroup,
        sizes,
        sunDirection,
        gui,
        isDebug,
    })
    composer = pp.composer
    updatePostProcessing = pp.update
    setGodRaysEnabled = pp.setGodRaysEnabled
    setWarmEnabled = pp.setWarmEnabled
    setComposerBypass = pp.setComposerBypass
    adaptiveBloomPass = pp.bloomPass

    attachResize(renderer, camera, sizes, composer)

    applyQualityTier(currentTier)

    if (controls) {
        controls.update()
    } else {
        applySway(camera, 0)
    }

    logVisibleTriangleCountOnce(scene, camera, renderer)

    clock.start()
    tick()
}

const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.1)
    const elapsedTime = clock.getElapsedTime()

    if (controls) {
        controls.update()
    } else {
        applySway(camera, elapsedTime)
    }

    updateWind(elapsedTime, audio)
    updateGrass(elapsedTime)
    updatePond(elapsedTime)
    updateForest(camera)
    updateFoxes(dt)
    updateLeaves(dt)
    updatePostProcessing(camera)

    fpsSampleTime += dt
    fpsSampleFrames++
    if (fpsSampleTime >= FPS_SAMPLE_INTERVAL) {
        const avgFps = fpsSampleFrames / fpsSampleTime
        fpsSampleTime = 0
        fpsSampleFrames = 0
        if (avgFps < DOWNGRADE_FPS && currentTier > QUALITY_LOW) {
            downgradeTimer += FPS_SAMPLE_INTERVAL
            upgradeTimer = 0
            if (downgradeTimer >= DOWNGRADE_HOLD) {
                downgradeTimer = 0
                currentTier--
                applyQualityTier(currentTier)
            }
        } else if (avgFps > UPGRADE_FPS && currentTier < QUALITY_HIGH) {
            upgradeTimer += FPS_SAMPLE_INTERVAL
            downgradeTimer = 0
            if (upgradeTimer >= UPGRADE_HOLD) {
                upgradeTimer = 0
                currentTier++
                applyQualityTier(currentTier)
            }
        } else {
            downgradeTimer = 0
            upgradeTimer = 0
        }
    }

    stats.update()

    if (composer && !composerBypassed) {
        composer.render()
    } else {
        renderer.render(scene, camera)
    }

    window.requestAnimationFrame(tick)
}

init().catch((error) => {
    console.error('Impossible d’initialiser la scène.', error)
})
