import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const LAYER_SKY = 1
const GODRAYS_SAMPLES = 40

const godRaysVS = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const godRaysFS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tOcclusion;
uniform vec2 uSunPos;
uniform float uDensity;
uniform float uWeight;
uniform float uDecay;
uniform float uExposure;
uniform float uEnabled;
uniform vec3 uRayTint;
varying vec2 vUv;

void main() {
    vec4 sceneColor = texture2D(tDiffuse, vUv);

    if (uEnabled < 0.5) {
        gl_FragColor = sceneColor;
        return;
    }

    vec2 texCoord = vUv;
    vec2 delta = (texCoord - uSunPos) * (1.0 / float(${GODRAYS_SAMPLES})) * uDensity;
    float illuminationDecay = 1.0;
    vec3 rays = vec3(0.0);

    for (int i = 0; i < ${GODRAYS_SAMPLES}; i++) {
        texCoord -= delta;
        vec2 clampedUv = clamp(texCoord, 0.0, 1.0);
        vec3 occSample = texture2D(tOcclusion, clampedUv).rgb;
        occSample *= illuminationDecay * uWeight;
        rays += occSample;
        illuminationDecay *= uDecay;
    }

    gl_FragColor = vec4(sceneColor.rgb + rays * uRayTint * uExposure, sceneColor.a);
}
`

const warmVS = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const warmFS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 uWarmTint;
uniform float uWarmStrength;
uniform float uWarmThreshold;
varying vec2 vUv;

void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float mask = smoothstep(uWarmThreshold, 1.0, luma) * uWarmStrength;
    gl_FragColor = vec4(mix(color.rgb, color.rgb * uWarmTint, mask), color.a);
}
`

export const createPostProcessing = ({
    renderer,
    scene,
    camera,
    skyGroup,
    sizes,
    sunDirection,
    gui,
    isDebug = false,
}) => {
    skyGroup.traverse((child) => child.layers.set(LAYER_SKY))
    camera.layers.enable(LAYER_SKY)

    const occlusionRT = new THREE.WebGLRenderTarget(128, 128)
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 })

    const sunWorldPos = sunDirection.clone().multiplyScalar(180)
    const sunScreenPos = new THREE.Vector3()

    const ppParams = {
        godRays: true,
        grDensity: 0.3,
        grWeight: 0.27,
        grDecay: 0.97,
        grExposure: 0.37,
        grTint: '#ffd866',
        bloom: true,
        bloomThreshold: 0.9,
        bloomStrength: 0.45,
        bloomRadius: 0.6,
        warmTint: '#ffe8a0',
        warmStrength: 0.8,
        warmThreshold: 0.4,
    }

    const godRaysPass = new ShaderPass({
        uniforms: {
            tDiffuse: { value: null },
            tOcclusion: { value: null },
            uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
            uDensity: { value: ppParams.grDensity },
            uWeight: { value: ppParams.grWeight },
            uDecay: { value: ppParams.grDecay },
            uExposure: { value: ppParams.grExposure },
            uEnabled: { value: 1.0 },
            uRayTint: { value: new THREE.Color(ppParams.grTint) },
        },
        vertexShader: godRaysVS,
        fragmentShader: godRaysFS,
    })
    godRaysPass.uniforms.tOcclusion.value = occlusionRT.texture

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(sizes.width * 0.4, sizes.height * 0.4),
        ppParams.bloomStrength,
        ppParams.bloomRadius,
        ppParams.bloomThreshold,
    )

    const warmTintPass = new ShaderPass({
        uniforms: {
            tDiffuse: { value: null },
            uWarmTint: { value: new THREE.Color(ppParams.warmTint) },
            uWarmStrength: { value: ppParams.warmStrength },
            uWarmThreshold: { value: ppParams.warmThreshold },
        },
        vertexShader: warmVS,
        fragmentShader: warmFS,
    })

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(godRaysPass)
    composer.addPass(bloomPass)
    composer.addPass(warmTintPass)
    composer.addPass(new OutputPass())

    const updateOcclusion = (camera) => {
        const prevRT = renderer.getRenderTarget()
        const prevBg = scene.background
        const prevAutoClear = renderer.autoClear

        scene.background = new THREE.Color(0x000000)
        camera.layers.set(LAYER_SKY)
        renderer.setRenderTarget(occlusionRT)
        renderer.clear()
        renderer.render(scene, camera)

        scene.overrideMaterial = blackMat
        camera.layers.set(0)
        renderer.autoClear = false
        renderer.render(scene, camera)
        renderer.autoClear = prevAutoClear

        scene.overrideMaterial = null
        scene.background = prevBg
        camera.layers.enable(LAYER_SKY)
        renderer.setRenderTarget(prevRT)
    }

    let occFrame = 0

    const update = (camera) => {
        sunScreenPos.copy(sunWorldPos).project(camera)
        godRaysPass.uniforms.uSunPos.value.set(
            sunScreenPos.x * 0.5 + 0.5,
            sunScreenPos.y * 0.5 + 0.5,
        )
        if (ppParams.godRays && occFrame % 6 === 0) updateOcclusion(camera)
        occFrame++
    }

    if (isDebug) {
        const folder = gui.addFolder('Post-processing')

        folder
            .add(ppParams, 'godRays')
            .name('God rays')
            .onChange((v) => { godRaysPass.uniforms.uEnabled.value = v ? 1 : 0 })
        folder
            .add(ppParams, 'grDensity', 0.01, 1, 0.01)
            .name('GR Densite')
            .onChange((v) => { godRaysPass.uniforms.uDensity.value = v })
        folder
            .add(ppParams, 'grWeight', 0.01, 1, 0.01)
            .name('GR Poids')
            .onChange((v) => { godRaysPass.uniforms.uWeight.value = v })
        folder
            .add(ppParams, 'grDecay', 0.9, 0.999, 0.001)
            .name('GR Declin')
            .onChange((v) => { godRaysPass.uniforms.uDecay.value = v })
        folder
            .add(ppParams, 'grExposure', 0, 1.5, 0.01)
            .name('GR Exposition')
            .onChange((v) => { godRaysPass.uniforms.uExposure.value = v })
        folder
            .addColor(ppParams, 'grTint')
            .name('GR Teinte')
            .onChange((v) => { godRaysPass.uniforms.uRayTint.value.set(v) })

        folder
            .add(ppParams, 'bloom')
            .name('Bloom')
            .onChange((v) => { bloomPass.enabled = v })
        folder
            .add(ppParams, 'bloomThreshold', 0, 1, 0.01)
            .name('Bloom seuil')
            .onChange((v) => { bloomPass.threshold = v })
        folder
            .add(ppParams, 'bloomStrength', 0, 2, 0.01)
            .name('Bloom intensite')
            .onChange((v) => { bloomPass.strength = v })
        folder
            .add(ppParams, 'bloomRadius', 0, 1, 0.01)
            .name('Bloom rayon')
            .onChange((v) => { bloomPass.radius = v })

        folder
            .addColor(ppParams, 'warmTint')
            .name('Warm teinte')
            .onChange((v) => { warmTintPass.uniforms.uWarmTint.value.set(v) })
        folder
            .add(ppParams, 'warmStrength', 0, 2, 0.01)
            .name('Warm force')
            .onChange((v) => { warmTintPass.uniforms.uWarmStrength.value = v })
        folder
            .add(ppParams, 'warmThreshold', 0, 1, 0.01)
            .name('Warm seuil')
            .onChange((v) => { warmTintPass.uniforms.uWarmThreshold.value = v })
    } else {
        gui
            .add(ppParams, 'godRays')
            .name('God rays')
            .onChange((v) => { godRaysPass.uniforms.uEnabled.value = v ? 1 : 0 })
        gui
            .add(ppParams, 'bloom')
            .name('Bloom')
            .onChange((v) => { bloomPass.enabled = v })
    }

    return {
        composer,
        update,
        bloomPass,
        setGodRaysEnabled: (v) => { godRaysPass.uniforms.uEnabled.value = v ? 1 : 0 },
    }
}
