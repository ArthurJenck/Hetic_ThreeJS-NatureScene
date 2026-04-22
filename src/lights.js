import * as THREE from 'three'

export const createLights = (sunDirection) => {
    const group = new THREE.Group()

    const hemisphereLight = new THREE.HemisphereLight('#cfe8ff', '#8ea05a', 0.9)
    group.add(hemisphereLight)

    const ambientLight = new THREE.AmbientLight('#fff6db', 0.35)
    group.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight('#fff4c7', 2.4)
    directionalLight.position.copy(sunDirection).multiplyScalar(40)
    directionalLight.target.position.set(0, 0, 0)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(2048, 2048)
    directionalLight.shadow.camera.top = 80
    directionalLight.shadow.camera.right = 80
    directionalLight.shadow.camera.bottom = -80
    directionalLight.shadow.camera.left = -80
    directionalLight.shadow.camera.near = 1
    directionalLight.shadow.camera.far = 160
    directionalLight.shadow.bias = -0.0005

    group.add(directionalLight)
    group.add(directionalLight.target)

    return { group, directionalLight, hemisphereLight, ambientLight }
}
