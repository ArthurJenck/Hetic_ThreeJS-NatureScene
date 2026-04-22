import * as THREE from 'three'
import { createToonMaterial } from './materials/toon.js'

const BLADE_WIDTH = 0.55
const BLADE_HEIGHT = 0.75
const SCATTER_AREA = 110
const DEFAULT_COUNT = 22000

const textureLoader = new THREE.TextureLoader()

export const createGrass = ({
    sampleHeight,
    count = DEFAULT_COUNT,
    anisotropy = 1,
}) => {
    const colorMap = textureLoader.load('./static/grass/color.png')
    colorMap.colorSpace = THREE.SRGBColorSpace
    colorMap.anisotropy = anisotropy
    colorMap.magFilter = THREE.LinearFilter
    colorMap.minFilter = THREE.LinearMipmapLinearFilter

    const geometry = new THREE.PlaneGeometry(BLADE_WIDTH, BLADE_HEIGHT, 1, 4)
    geometry.translate(0, BLADE_HEIGHT / 2, 0)

    const normalAttr = geometry.attributes.normal
    for (let i = 0; i < normalAttr.count; i++) {
        normalAttr.setXYZ(i, 0, 1, 0)
    }
    normalAttr.needsUpdate = true

    const uvOffsets = new Float32Array(count * 2)
    const phases = new Float32Array(count)
    const tintMixes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
        const quadrant = Math.floor(Math.random() * 4)
        uvOffsets[i * 2] = (quadrant % 2) * 0.5
        uvOffsets[i * 2 + 1] = Math.floor(quadrant / 2) * 0.5
        phases[i] = Math.random() * Math.PI * 2
        tintMixes[i] = Math.random()
    }

    geometry.setAttribute(
        'aUvOffset',
        new THREE.InstancedBufferAttribute(uvOffsets, 2),
    )
    geometry.setAttribute(
        'aPhase',
        new THREE.InstancedBufferAttribute(phases, 1),
    )
    geometry.setAttribute(
        'aTintMix',
        new THREE.InstancedBufferAttribute(tintMixes, 1),
    )

    const material = createToonMaterial({
        map: colorMap,
        color: '#ffffff',
        alphaTest: 0.45,
        side: THREE.DoubleSide,
    })

    const uniforms = {
        uTime: { value: 0 },
        uWindStrength: { value: 0.22 },
        uTipTint: { value: new THREE.Color('#e8ee7a') },
        uBaseTint: { value: new THREE.Color('#8fbd4a') },
    }

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime
        shader.uniforms.uWindStrength = uniforms.uWindStrength
        shader.uniforms.uTipTint = uniforms.uTipTint
        shader.uniforms.uBaseTint = uniforms.uBaseTint

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `
                #include <common>
                attribute vec2 aUvOffset;
                attribute float aPhase;
                attribute float aTintMix;
                uniform float uTime;
                uniform float uWindStrength;
                varying float vHeightFactor;
                varying float vTintMix;
                `,
            )
            .replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                #ifdef USE_MAP
                    vMapUv = uv * 0.5 + aUvOffset;
                #endif
                `,
            )
            .replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                float heightFactor = clamp(position.y / ${BLADE_HEIGHT.toFixed(2)}, 0.0, 1.0);
                vHeightFactor = heightFactor;
                vTintMix = aTintMix;
                float bend = pow(heightFactor, 2.0) * uWindStrength;
                float t = uTime;
                float swayX = sin(t * 1.3 + aPhase) + 0.5 * sin(t * 2.7 + aPhase * 1.7);
                float swayZ = cos(t * 1.1 + aPhase * 0.8) * 0.6;
                transformed.x += swayX * bend;
                transformed.z += swayZ * bend;
                `,
            )

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `
                #include <common>
                uniform vec3 uTipTint;
                uniform vec3 uBaseTint;
                varying float vHeightFactor;
                varying float vTintMix;
                `,
            )
            .replace(
                '#include <normal_fragment_begin>',
                `
                #include <normal_fragment_begin>
                normal = normalize(vNormal);
                `,
            )
            .replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                vec3 gradientTint = mix(uBaseTint, uTipTint, vHeightFactor);
                float variation = (vTintMix - 0.5) * 0.08;
                diffuseColor.rgb = gradientTint + variation;
                `,
            )
    }
    material.customProgramCacheKey = () => 'grass-wind-v3'

    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.name = 'grass'
    mesh.frustumCulled = false
    mesh.receiveShadow = true

    const dummy = new THREE.Object3D()

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * SCATTER_AREA
        const z = (Math.random() - 0.5) * SCATTER_AREA
        const y = sampleHeight(x, z)
        dummy.position.set(x, y - 0.02, z)
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        const scale = 0.7 + Math.random() * 0.6
        dummy.scale.set(scale, scale * (0.85 + Math.random() * 0.3), scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    const update = (elapsedTime) => {
        uniforms.uTime.value = elapsedTime
    }

    return { mesh, update, uniforms }
}
