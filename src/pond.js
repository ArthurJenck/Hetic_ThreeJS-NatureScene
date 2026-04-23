import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { POND, POND_BASE_RADIUS, POND_SHORE_FACTOR, pondOrganicRadius } from './terrain.js'

const waterVS = /* glsl */`
uniform float uTime;
varying vec3 vWorldPos;
#include <fog_pars_vertex>

void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = viewMatrix * vec4(vWorldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`

const waterFS = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
varying vec3 vWorldPos;
#include <fog_pars_fragment>

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1,0));
    float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p) {
    return 0.5000*vnoise(p) + 0.2500*vnoise(p*2.0)
         + 0.1250*vnoise(p*4.0) + 0.0625*vnoise(p*8.0);
}

vec3 waterNormal(vec3 pos) {
    float eps = 0.06;
    float spd = uTime * 0.15;
    vec2 px = vec2(pos.x, pos.z);
    float bump = 0.35;
    vec3 n = vec3(0.0, 1.0, 0.0);
    n.x = -bump * (fbm(vec2(px.x+eps,px.y)*0.5+spd) - fbm(vec2(px.x-eps,px.y)*0.5+spd)) / (2.0*eps);
    n.z = -bump * (fbm(vec2(px.x,px.y+eps)*0.5+spd*0.8) - fbm(vec2(px.x,px.y-eps)*0.5+spd*0.8)) / (2.0*eps);
    return normalize(n);
}

void main() {
    vec3 baseWater  = vec3(22.0, 79.0,  86.0) / 255.0;
    vec3 lightWater = vec3(0.0,  180.0, 80.0)  / 255.0;

    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    vec3 n = waterNormal(vWorldPos);

    float ndotr   = dot(n, viewDir);
    float fresnel = pow(1.0 - abs(ndotr), 6.0);

    float diff = pow(dot(n, uSunDir) * 0.4 + 0.6, 3.0);
    vec3 color = baseWater + diff * lightWater * 0.18;

    vec3 reflDir = reflect(-viewDir, n);
    float spec = pow(max(dot(reflDir, uSunDir), 0.0), 128.0) * 3.0;
    color += vec3(1.0, 0.97, 0.85) * spec;

    color = mix(color, baseWater * 1.5, fresnel * 0.4);

    float alpha = mix(0.82, 0.97, fresnel);
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
}
`

// Organic water geometry using the same pondOrganicRadius as the terrain depression
const createOrganicGeo = () => {
    const segments = 64
    const pos = [0, 0, 0]
    const uvs = [0.5, 0.5]
    const idx = []

    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2
        const r = pondOrganicRadius(a) * POND_SHORE_FACTOR
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r)
        uvs.push(0.5 + Math.cos(a) * r / (POND_BASE_RADIUS * 2.0), 0.5 + Math.sin(a) * r / (POND_BASE_RADIUS * 2.0))
    }
    for (let i = 0; i < segments; i++) {
        idx.push(0, ((i + 1) % segments) + 1, i + 1)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
}

const loader = new GLTFLoader()

const loadRockTemplates = async () => {
    const gltf = await loader.loadAsync('./static/rocks/smooth_rocks_pack.glb')
    const templates = []
    gltf.scene.traverse((child) => {
        if (child.isMesh) templates.push(child)
    })
    return templates
}

export const createPond = async (sampleHeight, sunDirection, camera) => {
    const rockTemplates = await loadRockTemplates()

    const uniforms = {
        uTime:       { value: 0 },
        uSunDir:     { value: sunDirection.clone().normalize() },
        uCameraPos:  { value: camera.position },
        fogColor:    { value: new THREE.Color() },
        fogDensity:  { value: 0.025 },
        fogNear:     { value: 1 },
        fogFar:      { value: 1000 },
    }

    const mat = new THREE.ShaderMaterial({
        vertexShader: waterVS,
        fragmentShader: waterFS,
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
    })

    const pond = new THREE.Mesh(createOrganicGeo(), mat)
    pond.position.set(POND.x, POND.waterY, POND.z)
    pond.renderOrder = 2
    pond.frustumCulled = false

    const group = new THREE.Group()
    group.add(pond)

    if (rockTemplates.length > 0) {
        const rockCount = 9
        for (let i = 0; i < rockCount; i++) {
            const angle = (i / rockCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.8
            // Place rocks just outside the water edge, on the shore
            const shoreR = pondOrganicRadius(angle) * (POND_SHORE_FACTOR + 0.08 + Math.random() * 0.25)
            const rx = POND.x + Math.cos(angle) * shoreR
            const rz = POND.z + Math.sin(angle) * shoreR

            const template = rockTemplates[Math.floor(Math.random() * rockTemplates.length)]
            const rock = template.clone()
            rock.updateMatrixWorld(true)

            const box = new THREE.Box3().setFromObject(rock)
            const size = box.getSize(new THREE.Vector3())
            const targetSize = 0.3 + Math.random() * 0.45
            const s = targetSize / Math.max(size.x, size.y, size.z)

            rock.scale.setScalar(s)
            rock.position.set(rx, sampleHeight(rx, rz) + targetSize * 0.05, rz)
            rock.rotation.set(
                (Math.random() - 0.5) * 0.5,
                Math.random() * Math.PI * 2,
                (Math.random() - 0.5) * 0.3,
            )
            rock.receiveShadow = true
            group.add(rock)
        }
    }

    const update = (elapsed) => { uniforms.uTime.value = elapsed }
    return { group, update }
}
