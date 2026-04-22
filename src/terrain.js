import * as THREE from 'three'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'
import { createToonMaterial } from './materials/toon.js'

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

export const sampleHeight = (x, z) => {
    let height = 0
    for (const { frequency, amplitude } of OCTAVES) {
        height += noise.noise(x * frequency, NOISE_Y, z * frequency) * amplitude
    }

    const radial = Math.sqrt(x * x + z * z)
    const falloff =
        1 - THREE.MathUtils.smoothstep(radial, FALLOFF_START, FALLOFF_END)
    return height * falloff
}

export const createTerrain = () => {
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

    const material = createToonMaterial({
        color: '#7cba3f',
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.name = 'terrain'

    return { mesh, sampleHeight }
}
