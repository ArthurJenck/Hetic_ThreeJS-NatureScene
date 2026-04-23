import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { isInPondExclusion, POND, POND_BASE_RADIUS, POND_SHORE_FACTOR } from './terrain.js'

const WALK_ARRIVE_DIST = 0.35
const POND_MARGIN = 0.8
const POND_STEP_MARGIN = 1.5
const STEER_ANGLE = Math.PI / 12
const MAX_STEER_TRIES = 6
const WAYPOINT_TRIES = 30

const POND_MIN_R = POND_BASE_RADIUS * POND_SHORE_FACTOR + POND_MARGIN + 0.5
const FOREST_MAX_R = 19

const loader = new GLTFLoader()

const isPathClear = (fx, fz, tx, tz) => {
    for (let i = 1; i <= 5; i++) {
        const t = i / 6
        if (isInPondExclusion(fx + (tx - fx) * t, fz + (tz - fz) * t, POND_MARGIN)) return false
    }
    return true
}

const MAX_WAYPOINT_ARC = Math.PI * (2 / 3)

const pickWaypoint = (fx, fz) => {
    const foxAngle = Math.atan2(fz - POND.z, fx - POND.x)
    for (let i = 0; i < WAYPOINT_TRIES; i++) {
        const a = foxAngle + (Math.random() * 2 - 1) * MAX_WAYPOINT_ARC
        const r = POND_MIN_R + Math.random() * (FOREST_MAX_R - POND_MIN_R)
        const nx = POND.x + Math.cos(a) * r
        const nz = POND.z + Math.sin(a) * r
        if (!isInPondExclusion(nx, nz, POND_MARGIN) && isPathClear(fx, fz, nx, nz)) return { x: nx, z: nz }
    }
    return null
}

class Fox {
    constructor(scene, mixer, actions, sampleHeight, walkAudio, idleAudio, getFoxBuffers) {
        this.scene = scene
        this.mixer = mixer
        this.actions = actions
        this.sampleHeight = sampleHeight
        this.walkAudio = walkAudio
        this.idleAudio = idleAudio
        this.getFoxBuffers = getFoxBuffers

        this.state = 'SURVEY'
        this.stateTimer = 0
        this.surveyDuration = 0
        this.waypoint = null
        this.currentAction = null
        this.nextIdlePlay = 0

        this.params = {
            walkProbability: 0.6,
            walkSpeed: 1.4,
            surveyMinDuration: 6,
            surveyMaxDuration: 14,
        }

        this._enterSurvey()
    }

    _playAction(name) {
        const next = this.actions[name]
        if (!next) return
        if (this.currentAction && this.currentAction !== next) {
            next.reset().play()
            this.currentAction.crossFadeTo(next, 0.3, true)
        } else if (!this.currentAction) {
            next.play()
        }
        this.currentAction = next
    }

    _enterSurvey() {
        this.state = 'SURVEY'
        const { surveyMinDuration, surveyMaxDuration } = this.params
        this.surveyDuration = surveyMinDuration + Math.random() * (surveyMaxDuration - surveyMinDuration)
        this.stateTimer = 0
        this.nextIdlePlay = 2 + Math.random() * 4
        if (this.walkAudio?.isPlaying) this.walkAudio.stop()
        this._playAction('Survey')
    }

    _enterWalk() {
        const px = this.scene.position.x
        const pz = this.scene.position.z
        const wp = pickWaypoint(px, pz)
        if (!wp) { this._enterSurvey(); return }
        this.waypoint = wp
        this.state = 'WALK'
        if (this.idleAudio?.isPlaying) this.idleAudio.stop()
        const buffers = this.getFoxBuffers?.()
        if (buffers?.walk && this.walkAudio) {
            if (!this.walkAudio.buffer) this.walkAudio.setBuffer(buffers.walk)
            if (!this.walkAudio.isPlaying) this.walkAudio.play()
        }
        this._playAction('Walk')
    }

    update(dt) {
        this.mixer.update(dt)
        this.stateTimer += dt

        if (this.state === 'SURVEY') {
            this.nextIdlePlay -= dt
            if (this.nextIdlePlay <= 0) {
                const buffers = this.getFoxBuffers?.()
                if (buffers?.idle?.length > 0 && this.idleAudio) {
                    const buf = buffers.idle[Math.floor(Math.random() * buffers.idle.length)]
                    if (this.idleAudio.isPlaying) this.idleAudio.stop()
                    this.idleAudio.setBuffer(buf)
                    this.idleAudio.play()
                }
                this.nextIdlePlay = 4 + Math.random() * 8
            }
            if (this.stateTimer >= this.surveyDuration) {
                if (Math.random() < this.params.walkProbability) {
                    this._enterWalk()
                } else {
                    this._enterSurvey()
                }
            }
        } else if (this.state === 'WALK') {
            this._stepWalk(dt)
        }
    }

    _stepWalk(dt) {
        const pos = this.scene.position
        const wp = this.waypoint
        if (!wp) { this._enterSurvey(); return }

        const dx = wp.x - pos.x
        const dz = wp.z - pos.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist < WALK_ARRIVE_DIST) {
            this._enterSurvey()
            return
        }

        const speed = this.params.walkSpeed
        let dirX = dx / dist
        let dirZ = dz / dist

        const step = speed * dt
        let nx = pos.x + dirX * step
        let nz = pos.z + dirZ * step

        if (isInPondExclusion(nx, nz, POND_STEP_MARGIN)) {
            let steered = false
            outer: for (let t = 1; t <= MAX_STEER_TRIES; t++) {
                for (const sign of [1, -1]) {
                    const angle = STEER_ANGLE * t * sign
                    const cos = Math.cos(angle)
                    const sin = Math.sin(angle)
                    const sdx = dirX * cos - dirZ * sin
                    const sdz = dirX * sin + dirZ * cos
                    const tnx = pos.x + sdx * step
                    const tnz = pos.z + sdz * step
                    if (!isInPondExclusion(tnx, tnz, POND_STEP_MARGIN)) {
                        dirX = sdx; dirZ = sdz
                        nx = tnx; nz = tnz
                        steered = true
                        break outer
                    }
                }
            }
            if (!steered) { this._enterSurvey(); return }
        }

        const targetY = this.sampleHeight(nx, nz)
        pos.set(nx, targetY, nz)

        const targetAngle = Math.atan2(dirX, dirZ)
        const currentAngle = this.scene.rotation.y
        let delta = targetAngle - currentAngle
        while (delta > Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        this.scene.rotation.y += delta * Math.min(dt * 8, 1)
    }
}

const TARGET_FOX_HEIGHT = 1.5

export const createFoxes = async ({ sampleHeight, gui, audio, isDebug = false }) => {
    const gltf = await loader.loadAsync('./static/fox/Fox.gltf')
    const template = gltf.scene

    const box = new THREE.Box3().setFromObject(template)
    const size = box.getSize(new THREE.Vector3())
    const s = TARGET_FOX_HEIGHT / Math.max(size.y, 0.001)
    template.scale.setScalar(s)
    template.position.y = -box.min.y * s

    let sx = POND.x + 8
    let sz = POND.z + 5
    if (isInPondExclusion(sx, sz, 0.5)) {
        const ang = Math.atan2(sz - POND.z, sx - POND.x)
        sx = POND.x + Math.cos(ang) * 10
        sz = POND.z + Math.sin(ang) * 10
    }
    const sy = sampleHeight(sx, sz)

    const clone = SkeletonUtils.clone(template)
    clone.traverse((child) => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true }
    })
    clone.position.set(sx, sy, sz)
    clone.rotation.y = Math.random() * Math.PI * 2

    const mixer = new THREE.AnimationMixer(clone)
    const actions = {}
    for (const clip of gltf.animations) {
        const action = mixer.clipAction(clip, clone)
        action.setLoop(THREE.LoopRepeat, Infinity)
        actions[clip.name] = action
    }

    let walkAudio = null
    let idleAudio = null
    const getFoxBuffers = audio?.getFoxBuffers ?? (() => null)

    if (audio?.listener) {
        walkAudio = new THREE.PositionalAudio(audio.listener)
        walkAudio.setRefDistance(2)
        walkAudio.setRolloffFactor(2)
        walkAudio.setMaxDistance(30)
        walkAudio.setLoop(true)
        walkAudio.setVolume(audio.getFoxVolume())

        idleAudio = new THREE.PositionalAudio(audio.listener)
        idleAudio.setRefDistance(2)
        idleAudio.setRolloffFactor(2)
        idleAudio.setMaxDistance(30)
        idleAudio.setLoop(false)
        idleAudio.setVolume(audio.getFoxVolume())

        clone.add(walkAudio)
        clone.add(idleAudio)

        audio.onFoxVolumeChange((v) => {
            walkAudio.setVolume(v)
            idleAudio.setVolume(v)
        })
    }

    const fox = new Fox(clone, mixer, actions, sampleHeight, walkAudio, idleAudio, getFoxBuffers)
    const group = new THREE.Group()
    group.add(clone)

    if (isDebug) {
        const foxFolder = gui.addFolder('Renard')
        foxFolder.add(fox.params, 'walkProbability', 0, 1, 0.05).name('Prob. marche')
        foxFolder.add(fox.params, 'walkSpeed', 0.5, 3, 0.1).name('Vitesse')
        foxFolder.add(fox.params, 'surveyMinDuration', 1, 15, 0.5).name('Obs. min (s)')
        foxFolder.add(fox.params, 'surveyMaxDuration', 3, 30, 0.5).name('Obs. max (s)')
    }

    return { group, update: (dt) => fox.update(dt) }
}
