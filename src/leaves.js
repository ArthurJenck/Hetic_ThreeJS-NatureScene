import * as THREE from 'three'

const MAX_LEAVES = 256
const SPAWN_AREA = 40
const FALL_SPEED = 0.8
const TUMBLE_SPEED = 1.4

const makeLeafTexture = () => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size * 1.6
    const ctx = canvas.getContext('2d')

    const grad = ctx.createRadialGradient(
        size * 0.5,
        size * 0.8,
        0,
        size * 0.5,
        size * 0.8,
        size * 0.75,
    )
    grad.addColorStop(0, 'rgba(72, 120, 24, 1)')
    grad.addColorStop(0.5, 'rgba(56, 96, 12, 0.9)')
    grad.addColorStop(1, 'rgba(40, 72, 8, 0)')

    ctx.beginPath()
    ctx.ellipse(
        size * 0.5,
        size * 0.8,
        size * 0.28,
        size * 0.68,
        0,
        0,
        Math.PI * 2,
    )
    ctx.fillStyle = grad
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(size * 0.5, size * 0.18)
    ctx.lineTo(size * 0.5, size * 1.45)
    ctx.strokeStyle = 'rgba(32, 64, 8, 0.6)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    return new THREE.CanvasTexture(canvas)
}

export const createLeaves = ({ wind, gui, isDebug = false }) => {
    const texture = makeLeafTexture()

    const geometry = new THREE.PlaneGeometry(1, 1.6)

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        alphaTest: 0.15,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: true,
    })

    const mesh = new THREE.InstancedMesh(geometry, material, MAX_LEAVES)
    mesh.name = 'leaves'
    mesh.frustumCulled = false
    mesh.count = 0

    const positions = new Float32Array(MAX_LEAVES * 3)
    const velocities = new Float32Array(MAX_LEAVES * 3)
    const phases = new Float32Array(MAX_LEAVES)
    const scales = new Float32Array(MAX_LEAVES)
    const active = new Uint8Array(MAX_LEAVES)

    const dummy = new THREE.Object3D()

    const params = {
        count: 64,
        size: 0.18,
        spawnRate: 1.0,
    }

    let spawnAccumulator = 0

    const spawnLeaf = (i, camX, camZ, upwind) => {
        const wx = wind.uniforms.uWindDir.value.x
        const wz = wind.uniforms.uWindDir.value.y

        const perpX = -wz
        const perpZ = wx

        const side = (Math.random() - 0.5) * SPAWN_AREA

        positions[i * 3] = camX + upwind * wx * SPAWN_AREA * 0.5 + perpX * side
        positions[i * 3 + 1] = 1.5 + Math.random() * 8
        positions[i * 3 + 2] =
            camZ + upwind * wz * SPAWN_AREA * 0.5 + perpZ * side

        const speed = 2 + Math.random() * 3
        velocities[i * 3] = wx * speed
        velocities[i * 3 + 1] = -(FALL_SPEED * (0.6 + Math.random() * 0.8))
        velocities[i * 3 + 2] = wz * speed

        phases[i] = Math.random() * Math.PI * 2
        scales[i] = params.size * (0.7 + Math.random() * 0.6)
        active[i] = 1
    }

    const update = (dt, camera) => {
        const strength = wind.uniforms.uWindStrength.value
        const boost = wind.state?.leafBoost ? 3 : 1
        const wx = wind.uniforms.uWindDir.value.x
        const wz = wind.uniforms.uWindDir.value.y
        const t = wind.uniforms.uTime.value

        const camX = camera.position.x
        const camZ = camera.position.z

        const targetActive = Math.round(params.count * params.spawnRate * boost)

        let activeCount = 0
        for (let i = 0; i < params.count; i++) {
            if (!active[i]) continue
            activeCount++
        }

        spawnAccumulator += (targetActive - activeCount) * dt * 0.5
        const toSpawn = Math.floor(spawnAccumulator)
        spawnAccumulator -= toSpawn

        let spawned = 0
        for (let i = 0; i < params.count && spawned < toSpawn; i++) {
            if (!active[i]) {
                spawnLeaf(i, camX, camZ, -1)
                spawned++
            }
        }

        let visible = 0
        for (let i = 0; i < params.count; i++) {
            if (!active[i]) continue

            const windFactor = 1 + strength * 3
            positions[i * 3] += velocities[i * 3] * windFactor * dt
            positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
            positions[i * 3 + 2] += velocities[i * 3 + 2] * windFactor * dt

            positions[i * 3 + 1] += Math.sin(t * 0.8 + phases[i]) * 0.008

            const dx = positions[i * 3] - camX
            const dz = positions[i * 3 + 2] - camZ

            if (
                positions[i * 3 + 1] < -2 ||
                dx * dx + dz * dz > SPAWN_AREA * SPAWN_AREA * 4
            ) {
                active[i] = 0
                continue
            }

            const tumble = t * TUMBLE_SPEED + phases[i]
            dummy.position.set(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2],
            )
            dummy.rotation.set(
                Math.sin(tumble * 0.7) * 0.6,
                Math.atan2(wx, wz) + Math.sin(tumble * 0.4) * 0.3,
                Math.cos(tumble) * 0.8,
            )
            dummy.scale.setScalar(scales[i])
            dummy.updateMatrix()
            mesh.setMatrixAt(visible, dummy.matrix)
            visible++
        }

        mesh.count = visible
        mesh.instanceMatrix.needsUpdate = true
    }

    if (isDebug) {
        const folder = gui.addFolder('Feuilles')
        folder.add(params, 'count', 8, MAX_LEAVES, 1).name('Quantité')
        folder
            .add(params, 'size', 0.05, 0.5, 0.01)
            .name('Taille')
            .onChange((v) => {
                params.size = v
                scales.fill(0)
                active.fill(0)
            })
        folder.add(params, 'spawnRate', 0, 2, 0.05).name('Fréquence')
    }

    return { mesh, update }
}
