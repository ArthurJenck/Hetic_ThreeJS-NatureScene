import * as THREE from 'three'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'
import { copyUvToUv2, loadTexture } from './textures.js'

const SIZE = 180
const SEGMENTS = 200

const OCTAVES = [
    { frequency: 0.018, amplitude: 2.6 },
    { frequency: 0.055, amplitude: 0.85 },
    { frequency: 0.17, amplitude: 0.28 },
]

const FALLOFF_START = SIZE * 0.32
const FALLOFF_END = SIZE * 0.5

const noise = new ImprovedNoise()
const NOISE_Y = 17.3

const POND_CX = 1.5
const POND_CZ = -1.5
export const POND_BASE_RADIUS = 4.8
export const POND_SHORE_FACTOR = 1.28
const POND_DEPTH = 0.9

const baseHeight = (x, z) => {
    let height = 0
    for (const { frequency, amplitude } of OCTAVES) {
        height += noise.noise(x * frequency, NOISE_Y, z * frequency) * amplitude
    }
    const radial = Math.sqrt(x * x + z * z)
    const falloff = 1 - THREE.MathUtils.smoothstep(radial, FALLOFF_START, FALLOFF_END)
    return height * falloff
}

// Gourd-shaped organic radius — same function used by terrain AND water geometry
export const pondOrganicRadius = (angle) =>
    POND_BASE_RADIUS * (
        1.0
        + 0.28 * Math.sin(angle * 2 + 0.4)   // main gourd elongation
        + 0.12 * Math.sin(angle * 3 + 1.3)   // secondary lobe
        + 0.06 * Math.sin(angle * 5 + 2.1)   // fine bumps
        + 0.03 * Math.sin(angle * 7 + 0.8)   // micro irregularity
    )

// Normalized distance from the organic pond edge (0=center, 1=on edge, >1=outside)
const pondNd = (dx, dz) => {
    const r = Math.sqrt(dx * dx + dz * dz)
    if (r < 0.001) return 0
    return r / pondOrganicRadius(Math.atan2(dz, dx))
}

const POND_WATER_Y = (() => {
    const samples = 64
    let minH = Infinity
    for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2
        const r = pondOrganicRadius(a) * POND_SHORE_FACTOR
        minH = Math.min(minH, baseHeight(POND_CX + Math.cos(a) * r, POND_CZ + Math.sin(a) * r))
    }
    return minH - 0.05
})()

export const sampleHeight = (x, z) => {
    const h = baseHeight(x, z)
    const nd = pondNd(x - POND_CX, z - POND_CZ)

    if (nd >= POND_SHORE_FACTOR) return h
    if (nd <= 1.0) return POND_WATER_Y - POND_DEPTH

    // Shore: smooth blend from basin floor to natural terrain
    const t = (nd - 1.0) / (POND_SHORE_FACTOR - 1.0)
    const ts = t * t * (3.0 - 2.0 * t)
    return THREE.MathUtils.lerp(POND_WATER_Y - POND_DEPTH, h, ts)
}

export const POND = {
    x: POND_CX,
    z: POND_CZ,
    waterY: POND_WATER_Y,
    shoreFactor: POND_SHORE_FACTOR,
}

export const isInPondExclusion = (x, z, margin = 0) => {
    const dx = x - POND_CX
    const dz = z - POND_CZ
    const r = Math.sqrt(dx * dx + dz * dz)
    if (r < 0.001) return true
    const shapeR = pondOrganicRadius(Math.atan2(dz, dx))
    return r < shapeR * POND_SHORE_FACTOR + margin
}

export const createTerrain = ({ anisotropy = 1 } = {}) => {
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS)
    geometry.rotateX(-Math.PI / 2)

    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const z = position.getZ(i)
        position.setY(i, sampleHeight(x, z))
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
    copyUvToUv2(geometry)

    const colorMap = loadTexture(
        './static/ground/rocky_terrain_02_1k/diff.jpg',
        { anisotropy, colorSpace: THREE.SRGBColorSpace, repeat: 12 },
    )
    const normalMap = loadTexture(
        './static/ground/rocky_terrain_02_1k/nor_gl.jpg',
        { anisotropy, repeat: 12 },
    )
    const armMap = loadTexture('./static/ground/rocky_terrain_02_1k/arm.jpg', {
        anisotropy,
        repeat: 12,
    })

    const material = new THREE.MeshStandardMaterial({
        map: colorMap,
        normalMap,
        aoMap: armMap,
        roughnessMap: armMap,
        metalnessMap: armMap,
        color: '#d9e3c1',
        roughness: 0.95,
        metalness: 0.08,
        aoMapIntensity: 0.75,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.name = 'terrain'

    return { mesh, sampleHeight }
}
