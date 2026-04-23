import * as THREE from 'three'

const textureLoader = new THREE.TextureLoader()

export const loadTexture = (
    url,
    { anisotropy = 1, colorSpace = null, repeat = null } = {},
) => {
    const texture = textureLoader.load(url)
    texture.anisotropy = anisotropy

    if (colorSpace) {
        texture.colorSpace = colorSpace
    }

    if (repeat !== null) {
        const repeatValue = Array.isArray(repeat) ? repeat : [repeat, repeat]
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(repeatValue[0], repeatValue[1])
    }

    return texture
}

export const copyUvToUv2 = (geometry) => {
    const uv = geometry.getAttribute('uv')
    if (!uv) {
        return geometry
    }

    geometry.setAttribute(
        'uv2',
        new THREE.BufferAttribute(new Float32Array(uv.array), 2),
    )
    return geometry
}

export const loadImage = (url) =>
    new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = url
    })

export const loadMaskedCanvasTexture = async (
    url,
    { anisotropy = 1, threshold = 20 } = {},
) => {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height

    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error(`Impossible de pretraiter la texture ${url}.`)
    }
    context.drawImage(image, 0, 0)

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = imageData

    for (let i = 0; i < data.length; i += 4) {
        const maxChannel = Math.max(data[i], data[i + 1], data[i + 2])
        if (maxChannel < threshold) {
            data[i + 3] = 0
        }
    }

    context.putImageData(imageData, 0, 0)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy
    texture.needsUpdate = true

    return texture
}
