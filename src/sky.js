import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

const ELEVATION_DEG = 45
const AZIMUTH_DEG = -35

const createSunTexture = () => {
    const size = 256
    const sunCanvas = document.createElement('canvas')
    sunCanvas.width = size
    sunCanvas.height = size

    const context = sunCanvas.getContext('2d')
    const gradient = context.createRadialGradient(
        size * 0.5,
        size * 0.5,
        0,
        size * 0.5,
        size * 0.5,
        size * 0.5,
    )

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.18, 'rgba(255, 248, 200, 1)')
    gradient.addColorStop(0.4, 'rgba(255, 231, 140, 0.95)')
    gradient.addColorStop(0.72, 'rgba(255, 208, 96, 0.4)')
    gradient.addColorStop(1, 'rgba(255, 208, 96, 0)')

    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)

    return new THREE.CanvasTexture(sunCanvas)
}

export const createSky = () => {
    const phi = THREE.MathUtils.degToRad(90 - ELEVATION_DEG)
    const theta = THREE.MathUtils.degToRad(AZIMUTH_DEG)

    const sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta)

    const sky = new Sky()
    sky.scale.setScalar(450)

    const uniforms = sky.material.uniforms
    uniforms.turbidity.value = 2.2
    uniforms.rayleigh.value = 1.8
    uniforms.mieCoefficient.value = 0.003
    uniforms.mieDirectionalG.value = 0.72
    uniforms.sunPosition.value.copy(sunDirection)

    const sunTexture = createSunTexture()
    const sunWorldPosition = sunDirection.clone().multiplyScalar(180)

    const sunGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: sunTexture,
            color: '#ffd35a',
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        }),
    )
    sunGlow.scale.set(42, 42, 1)
    sunGlow.position.copy(sunWorldPosition)
    sunGlow.renderOrder = 10

    const sunCore = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: sunTexture,
            color: '#fffdf4',
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        }),
    )
    sunCore.scale.set(18, 18, 1)
    sunCore.position.copy(sunWorldPosition)
    sunCore.renderOrder = 11

    const group = new THREE.Group()
    group.add(sky, sunGlow, sunCore)

    return { group, sunDirection }
}
