import * as THREE from 'three'

const ELEVATION_DEG = 32
const AZIMUTH_DEG = -35

const vertexShader = /* glsl */`
varying vec3 vWorldDirection;

void main() {
    vWorldDirection = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
}
`

const fragmentShader = /* glsl */`
uniform vec3 uSunDirection;
varying vec3 vWorldDirection;

void main() {
    vec3 dir = normalize(vWorldDirection);

    float elevation = clamp(dir.y, 0.0, 1.0);
    float t = pow(elevation, 0.45);

    vec3 zenith  = vec3(0.08, 0.40, 0.82);
    vec3 horizon = vec3(0.52, 0.76, 0.95);
    vec3 sky = mix(horizon, zenith, t);

    vec3 sunDir = normalize(uSunDirection);
    float sunDot = dot(dir, sunDir);
    float glow = smoothstep(0.80, 0.98, sunDot);
    float disc = smoothstep(0.9985, 1.0, sunDot);

    sky = mix(sky, vec3(1.0, 0.93, 0.62), glow * 0.55);
    sky = mix(sky, vec3(1.0, 0.98, 0.90), disc);

    gl_FragColor = vec4(sky, 1.0);
}
`

const createSunTexture = () => {
    const size = 256
    const sunCanvas = document.createElement('canvas')
    sunCanvas.width = size
    sunCanvas.height = size

    const context = sunCanvas.getContext('2d')
    const gradient = context.createRadialGradient(
        size * 0.5, size * 0.5, 0,
        size * 0.5, size * 0.5, size * 0.5,
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

    const geometry = new THREE.SphereGeometry(1, 32, 16)
    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uSunDirection: { value: sunDirection.clone() },
        },
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
    })

    const skyMesh = new THREE.Mesh(geometry, material)
    skyMesh.scale.setScalar(450)

    const sunTexture = createSunTexture()
    const sunWorldPosition = sunDirection.clone().multiplyScalar(180)

    const sunGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: sunTexture,
            color: '#f5e260',
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        }),
    )
    sunGlow.scale.set(38, 38, 1)
    sunGlow.position.copy(sunWorldPosition)
    sunGlow.renderOrder = 10

    const sunCore = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: sunTexture,
            color: '#fffef0',
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        }),
    )
    sunCore.scale.set(16, 16, 1)
    sunCore.position.copy(sunWorldPosition)
    sunCore.renderOrder = 11

    const group = new THREE.Group()
    group.add(skyMesh, sunGlow, sunCore)

    return { group, sunDirection }
}
