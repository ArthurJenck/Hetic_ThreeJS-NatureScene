import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { isInPondExclusion } from './terrain.js'

const windApplied = new WeakSet()

const applyWindToMaterial = (material, wind, keyPrefix) => {
    if (!wind || !material) return
    if (windApplied.has(material)) return
    windApplied.add(material)
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = wind.uniforms.uTime
        shader.uniforms.uWindStrength = wind.uniforms.uWindStrength
        shader.uniforms.uWindDir = wind.uniforms.uWindDir

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                uniform float uTime;
                uniform float uWindStrength;
                uniform vec2 uWindDir;`,
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                float treeWindMask = clamp(position.y / 4.0, 0.0, 1.0);
                #ifdef USE_INSTANCING
                    float tPhase = instanceMatrix[3][0] * 0.15 + instanceMatrix[3][2] * 0.12;
                #else
                    float tPhase = modelMatrix[3][0] * 0.15 + modelMatrix[3][2] * 0.12;
                #endif
                float tSway = sin(uTime * 0.9 + tPhase) * uWindStrength * treeWindMask * 0.2;
                float tSwayPerp = cos(uTime * 0.7 + tPhase * 1.3) * uWindStrength * treeWindMask * 0.07;
                vec2 perpDir = vec2(-uWindDir.y, uWindDir.x);
                transformed.x += (uWindDir.x * tSway + perpDir.x * tSwayPerp);
                transformed.z += (uWindDir.y * tSway + perpDir.y * tSwayPerp);`,
            )
    }
    material.customProgramCacheKey = () => keyPrefix + '-tree-wind-v1'
}

const CLEARING_RADIUS = 8
const FOREST_MIN_RADIUS = 10
const MAX_CAPACITY = 300
const LOD_DIST = 30
const LOD_DIST_SQ = LOD_DIST * LOD_DIST

const SPECIES = [
    {
        path: './static/tree/cartoon_tree/scene.gltf',
        impostorPath: './static/tree/cartoon_tree/impostor.png',
        targetHeight: 7,
        clusterCount: 12,
        treesPerCluster: 3,
    },
    {
        path: './static/tree/pine_tree/scene.gltf',
        impostorPath: './static/tree/pine_tree/impostor.png',
        targetHeight: 12,
        clusterCount: 10,
        treesPerCluster: 4,
    },
]

export const FOREST_DEFAULTS = {
    density: 3,
    clusterRadius: 4.5,
    forestRadius: 21,
    scale: 1,
    castShadows: true,
}

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath(
    'https://cdn.jsdelivr.net/npm/three@0.182.0/examples/jsm/libs/draco/',
)
dracoLoader.preload()

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

const textureLoader = new THREE.TextureLoader()

const randomInRing = (minR, maxR) => {
    const r = Math.sqrt(
        THREE.MathUtils.lerp(minR * minR, maxR * maxR, Math.random()),
    )
    const a = Math.random() * Math.PI * 2
    return { x: Math.cos(a) * r, z: Math.sin(a) * r }
}

const loadTemplate = async (path, targetHeight) => {
    const gltf = await gltfLoader.loadAsync(path)
    const scene = gltf.scene
    scene.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const s = targetHeight / Math.max(size.y, 0.001)
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2

    scene.scale.setScalar(s)
    scene.position.set(-cx * s, -box.min.y * s, -cz * s)

    const root = new THREE.Group()
    root.add(scene)
    root.updateMatrixWorld(true)
    return root
}

const loadImpostor = (path) =>
    new Promise((resolve) => {
        textureLoader.load(
            path,
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace
                resolve(tex)
            },
            undefined,
            () => resolve(null),
        )
    })

const extractMeshes = (root) => {
    const meshes = []
    root.traverse((child) => {
        if (!child.isMesh) return
        const geo = child.geometry.clone()
        geo.applyMatrix4(child.matrixWorld)
        meshes.push({ geometry: geo, material: child.material })
    })
    return meshes
}

const createImpostorGeo = () => {
    const geos = [0, Math.PI / 2].map((angle) => {
        const g = new THREE.PlaneGeometry(1, 1)
        g.translate(0, 0.5, 0)
        g.rotateY(angle)
        return g
    })
    return mergeGeometries(geos)
}

const prepareTree = (template, scale) => {
    const tree = template.clone(true)
    tree.scale.setScalar(scale)
    tree.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
        }
    })
    return tree
}

export const createForest = async ({
    sampleHeight,
    cameraClearing = { x: 8, z: 10, radius: 6 },
    wind = null,
}) => {
    const [templates, impostorTextures] = await Promise.all([
        Promise.all(SPECIES.map((s) => loadTemplate(s.path, s.targetHeight))),
        Promise.all(SPECIES.map((s) => loadImpostor(s.impostorPath))),
    ])

    const group = new THREE.Group()
    group.name = 'forest'

    const allTrees = []

    const nearMeshes = SPECIES.map((_, si) =>
        extractMeshes(templates[si]).map(({ geometry, material }, mi) => {
            applyWindToMaterial(material, wind, `sp${si}m${mi}`)
            const im = new THREE.InstancedMesh(geometry, material, MAX_CAPACITY)
            im.castShadow = true
            im.receiveShadow = true
            im.frustumCulled = false
            group.add(im)
            return im
        }),
    )

    const impostorGeo = createImpostorGeo()
    const farMeshes = SPECIES.map((_, si) => {
        const mat = new THREE.MeshBasicMaterial({
            map: impostorTextures[si],
            alphaTest: 0.4,
            side: THREE.DoubleSide,
            fog: true,
        })
        const im = new THREE.InstancedMesh(impostorGeo, mat, MAX_CAPACITY)
        im.frustumCulled = false
        group.add(im)
        return im
    })

    const ftx = -4.0
    const ftz = 2.8
    const featureTree = prepareTree(templates[0], 1.1)
    featureTree.position.set(ftx, sampleHeight(ftx, ftz), ftz)
    featureTree.rotation.y = 1.2
    if (wind) {
        featureTree.traverse((child) => {
            if (child.isMesh) applyWindToMaterial(child.material, wind, 'feature')
        })
    }

    const dummy = new THREE.Object3D()
    const nearCounts = new Int32Array(SPECIES.length)
    const farCounts = new Int32Array(SPECIES.length)
    let prevCamX = Infinity
    let prevCamZ = Infinity

    const populate = ({
        density = FOREST_DEFAULTS.density,
        clusterRadius = FOREST_DEFAULTS.clusterRadius,
        forestRadius = FOREST_DEFAULTS.forestRadius,
        scale = FOREST_DEFAULTS.scale,
    } = {}) => {
        allTrees.length = 0
        const cr2 = CLEARING_RADIUS * CLEARING_RADIUS
        const cc2 = cameraClearing.radius * cameraClearing.radius

        SPECIES.forEach((species, si) => {
            const count = Math.max(
                1,
                Math.round(species.clusterCount * density),
            )
            Array.from({ length: count }, () =>
                randomInRing(FOREST_MIN_RADIUS, forestRadius),
            ).forEach((center) => {
                for (let i = 0; i < species.treesPerCluster; i++) {
                    const a = Math.random() * Math.PI * 2
                    const r = Math.sqrt(Math.random()) * clusterRadius
                    const x = center.x + Math.cos(a) * r
                    const z = center.z + Math.sin(a) * r
                    if (x * x + z * z < cr2) continue
                    const dcx = x - cameraClearing.x
                    const dcz = z - cameraClearing.z
                    if (dcx * dcx + dcz * dcz < cc2) continue
                    if (isInPondExclusion(x, z, 1.5)) continue
                    allTrees.push({
                        x,
                        z,
                        y: sampleHeight(x, z),
                        scale: scale * (0.8 + Math.random() * 0.4),
                        rotY: Math.random() * Math.PI * 2,
                        si,
                    })
                }
            })
        })

        prevCamX = Infinity
        prevCamZ = Infinity
    }

    const update = (camera) => {
        const cx = camera.position.x
        const cz = camera.position.z

        const ddx = cx - prevCamX
        const ddz = cz - prevCamZ
        if (ddx * ddx + ddz * ddz < 0.01) return

        prevCamX = cx
        prevCamZ = cz

        nearCounts.fill(0)
        farCounts.fill(0)

        for (const tree of allTrees) {
            const dx = tree.x - cx
            const dz = tree.z - cz
            const si = tree.si
            const species = SPECIES[si]

            dummy.rotation.set(0, tree.rotY, 0)
            dummy.position.set(tree.x, tree.y, tree.z)

            if (dx * dx + dz * dz < LOD_DIST_SQ) {
                dummy.scale.setScalar(tree.scale)
                dummy.updateMatrix()
                const i = nearCounts[si]++
                nearMeshes[si].forEach((im) => im.setMatrixAt(i, dummy.matrix))
            } else {
                dummy.scale.set(
                    species.targetHeight * 0.7 * tree.scale,
                    species.targetHeight * 0.9 * tree.scale,
                    species.targetHeight * 0.7 * tree.scale,
                )
                dummy.updateMatrix()
                farMeshes[si].setMatrixAt(farCounts[si]++, dummy.matrix)
            }
        }

        SPECIES.forEach((_, si) => {
            nearMeshes[si].forEach((im) => {
                im.count = nearCounts[si]
                im.instanceMatrix.needsUpdate = true
            })
            farMeshes[si].count = farCounts[si]
            farMeshes[si].instanceMatrix.needsUpdate = true
        })
    }

    const regrow = (params) => {
        populate(params)
    }

    const setCastShadows = (value) => {
        nearMeshes.forEach((arr) =>
            arr.forEach((im) => {
                im.castShadow = value
            }),
        )
        featureTree.traverse((child) => {
            if (child.isMesh) child.castShadow = value
        })
    }

    populate(FOREST_DEFAULTS)
    update({ position: new THREE.Vector3(8, 3.5, 10) })

    return { group, featureTree, update, regrow, setCastShadows, trees: allTrees }
}
