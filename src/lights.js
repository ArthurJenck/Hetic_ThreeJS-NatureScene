import * as THREE from 'three'

export const createLights = (sunDirection) => {
    const group = new THREE.Group()

    const hemisphereLight = new THREE.HemisphereLight('#b8dfff', '#3d6020', 1.2)
    group.add(hemisphereLight)

    const directionalLight = new THREE.DirectionalLight('#ffe5a0', 3.2)
    directionalLight.position.copy(sunDirection).multiplyScalar(100)
    directionalLight.target.position.set(0, 0, 0)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(512, 512)
    directionalLight.shadow.camera.top = 40
    directionalLight.shadow.camera.right = 40
    directionalLight.shadow.camera.bottom = -40
    directionalLight.shadow.camera.left = -40
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 120
    directionalLight.shadow.bias = -0.001

    group.add(directionalLight)
    group.add(directionalLight.target)

    return { group, directionalLight, hemisphereLight }
}
