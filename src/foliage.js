import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { copyUvToUv2, loadTexture } from './textures.js'
import { isInPondExclusion } from './terrain.js'

const applyWindShader = (material, wind, cacheKey) => {
    if (!wind) return material

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
                float windMask = clamp(position.y / 1.0, 0.0, 1.0);
                float wPhase = instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2;
                float sway = sin(uTime * 1.5 + wPhase) * uWindStrength * windMask;
                float swayPerp = cos(uTime * 1.1 + wPhase * 1.4) * uWindStrength * windMask * 0.3;
                vec2 perpDir = vec2(-uWindDir.y, uWindDir.x);
                transformed.x += (uWindDir.x * sway + perpDir.x * swayPerp) * 0.4;
                transformed.z += (uWindDir.y * sway + perpDir.y * swayPerp) * 0.4;`,
            )
    }
    material.customProgramCacheKey = () => cacheKey
    return material
}

const CLEARING_RADIUS = 8
const BUSH_MIN_RADIUS = 8
const BUSH_MAX_RADIUS = 26
const BUSH_COUNT = 180
const BUSH_MIN_HEIGHT = 1.1
const BUSH_MAX_HEIGHT = 1.8
const BUSH_MIN_ASPECT = 1.15
const BUSH_MAX_ASPECT = 1.45

const PLANT_MIN_RADIUS = 4
const PLANT_MAX_RADIUS = 26
const PLANT_COUNT = 300
const PLANT_MIN_HEIGHT = 0.55
const PLANT_MAX_HEIGHT = 0.95
const PLANT_MIN_ASPECT = 1.35
const PLANT_MAX_ASPECT = 1.8

const createCrossGeometry = (width, height, angles) => {
    const geometries = angles.map((angle) => {
        const geometry = new THREE.PlaneGeometry(width, height)
        geometry.translate(0, height / 2, 0)
        geometry.rotateY(angle)
        return geometry
    })
    return mergeGeometries(geometries, false)
}

const randomPointInRing = (minRadius, maxRadius) => {
    const radius = Math.sqrt(
        THREE.MathUtils.lerp(minRadius * minRadius, maxRadius * maxRadius, Math.random()),
    )
    const angle = Math.random() * Math.PI * 2
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

const populateInstances = ({
    count,
    minRadius,
    maxRadius,
    minHeight,
    maxHeight,
    minAspect = 1,
    maxAspect = 1,
    sampleHeight,
    mesh,
    yOffset = 0,
    pondMargin = 0.3,
}) => {
    const dummy = new THREE.Object3D()
    let placed = 0

    for (let attempts = 0; placed < count && attempts < count * 4; attempts++) {
        const { x, z } = randomPointInRing(minRadius, maxRadius)
        if (isInPondExclusion(x, z, pondMargin)) continue

        const height = THREE.MathUtils.lerp(minHeight, maxHeight, Math.random())
        const aspect = THREE.MathUtils.lerp(minAspect, maxAspect, Math.random())
        const y = sampleHeight(x, z)

        dummy.position.set(x, y + yOffset, z)
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        dummy.scale.set(height * aspect, height, height * aspect)
        dummy.updateMatrix()
        mesh.setMatrixAt(placed, dummy.matrix)
        placed++
    }

    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
}

export const createBushes = ({ sampleHeight, anisotropy = 1, wind = null }) => {
    const geometry = copyUvToUv2(
        createCrossGeometry(1, 1, [0, Math.PI / 3, (Math.PI * 2) / 3]),
    )

    const colorMap = loadTexture('./static/bush/color.png', {
        anisotropy,
        colorSpace: THREE.SRGBColorSpace,
    })
    const normalMap = loadTexture('./static/bush/nor.png', { anisotropy })
    const armMap = loadTexture('./static/bush/arm.png', { anisotropy })

    const material = applyWindShader(new THREE.MeshStandardMaterial({
        map: colorMap,
        normalMap,
        aoMap: armMap,
        roughnessMap: armMap,
        metalnessMap: armMap,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.95,
        metalness: 0.08,
    }), wind, 'bush-wind-v1')

    const mesh = new THREE.InstancedMesh(geometry, material, BUSH_COUNT)
    mesh.name = 'bushes'
    mesh.receiveShadow = true
    mesh.frustumCulled = false

    populateInstances({
        count: BUSH_COUNT,
        minRadius: Math.max(CLEARING_RADIUS, BUSH_MIN_RADIUS),
        maxRadius: BUSH_MAX_RADIUS,
        minHeight: BUSH_MIN_HEIGHT,
        maxHeight: BUSH_MAX_HEIGHT,
        minAspect: BUSH_MIN_ASPECT,
        maxAspect: BUSH_MAX_ASPECT,
        sampleHeight,
        mesh,
        yOffset: -0.08,
    })

    return { mesh }
}

export const createPlants = ({ sampleHeight, anisotropy = 1, wind = null }) => {
    const geometry = createCrossGeometry(1, 1, [0, Math.PI / 3, (Math.PI * 2) / 3])

    const colorMap = loadTexture('./static/plants/color1.png', {
        anisotropy,
        colorSpace: THREE.SRGBColorSpace,
    })
    const alphaMap = loadTexture('./static/plants/alpha1.png', { anisotropy })

    const material = applyWindShader(new THREE.MeshStandardMaterial({
        map: colorMap,
        alphaMap,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
    }), wind, 'plant-wind-v1')

    const mesh = new THREE.InstancedMesh(geometry, material, PLANT_COUNT)
    mesh.name = 'plants'
    mesh.receiveShadow = true
    mesh.frustumCulled = false

    populateInstances({
        count: PLANT_COUNT,
        minRadius: Math.max(CLEARING_RADIUS * 0.5, PLANT_MIN_RADIUS),
        maxRadius: PLANT_MAX_RADIUS,
        minHeight: PLANT_MIN_HEIGHT,
        maxHeight: PLANT_MAX_HEIGHT,
        minAspect: PLANT_MIN_ASPECT,
        maxAspect: PLANT_MAX_ASPECT,
        sampleHeight,
        mesh,
        yOffset: -0.03,
        pondMargin: 0.2,
    })

    return { mesh }
}
