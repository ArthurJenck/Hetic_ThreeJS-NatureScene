import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const DEV_CAMERA = true

const BASE_POSITION = new THREE.Vector3(8, 3.5, 10)
const BASE_TARGET = new THREE.Vector3(0, 1.2, 0)

const SWAY_X_AMPLITUDE = 0.25
const SWAY_Y_AMPLITUDE = 0.15
const SWAY_X_FREQ = 0.09
const SWAY_Y_FREQ = 0.13

export const createCamera = (sizes) => {
    const camera = new THREE.PerspectiveCamera(
        55,
        sizes.width / sizes.height,
        0.1,
        300,
    )
    camera.position.copy(BASE_POSITION)
    camera.lookAt(BASE_TARGET)
    return camera
}

export const createDevControls = (camera, domElement) => {
    const controls = new OrbitControls(camera, domElement)
    controls.enableDamping = true
    controls.target.copy(BASE_TARGET)
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    controls.minDistance = 3
    controls.maxDistance = 120
    controls.update()
    return controls
}

const tmpTarget = new THREE.Vector3()
const TAU = Math.PI * 2

export const applySway = (camera, elapsedTime) => {
    tmpTarget.copy(BASE_TARGET)
    tmpTarget.x += Math.sin(elapsedTime * SWAY_X_FREQ * TAU) * SWAY_X_AMPLITUDE
    tmpTarget.y +=
        Math.sin(elapsedTime * SWAY_Y_FREQ * TAU + 1.3) * SWAY_Y_AMPLITUDE

    camera.position.copy(BASE_POSITION)
    camera.lookAt(tmpTarget)
}
