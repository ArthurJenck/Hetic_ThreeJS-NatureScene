import * as THREE from 'three'

export const createRenderer = (canvas) => {
    const dpr = window.devicePixelRatio
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr <= 1 })
    renderer.setPixelRatio(Math.min(dpr, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.55
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    return renderer
}

export const attachResize = (renderer, camera, sizes, composer = null) => {
    const onResize = () => {
        sizes.width = window.innerWidth
        sizes.height = window.innerHeight

        camera.aspect = sizes.width / sizes.height
        camera.updateProjectionMatrix()

        renderer.setSize(sizes.width, sizes.height)

        if (composer) composer.setSize(sizes.width, sizes.height)
    }
    window.addEventListener('resize', onResize)
    return onResize
}
