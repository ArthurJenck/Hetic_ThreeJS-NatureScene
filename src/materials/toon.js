import * as THREE from 'three'

export const createGradientMap = (steps = 4) => {
    const data = new Uint8Array(steps)
    for (let i = 0; i < steps; i++) {
        data[i] = Math.round(((i + 1) / steps) * 255)
    }
    const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return texture
}

const defaultGradientMap = createGradientMap(4)

export const createToonMaterial = ({
    map = null,
    normalMap = null,
    color = '#ffffff',
    alphaTest = 0,
    transparent = false,
    side = THREE.FrontSide,
    gradientMap = defaultGradientMap,
} = {}) =>
    new THREE.MeshToonMaterial({
        map,
        normalMap,
        color,
        alphaTest,
        transparent,
        side,
        gradientMap,
    })
