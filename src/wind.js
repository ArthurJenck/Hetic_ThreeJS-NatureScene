import * as THREE from 'three'

export const WIND_DEFAULTS = {
    baseStrength: 0.25,
    gustStrength: 2.0,
    gustIntervalMin: 40,
    gustIntervalMax: 90,
    gustRampUp: 1.5,
    gustHoldMin: 3,
    gustHoldMax: 6,
    gustRampDown: 2,
}

const DIR = new THREE.Vector2(1, 0.3).normalize()

export const wind = {
    uniforms: {
        uTime:         { value: 0 },
        uWindStrength: { value: WIND_DEFAULTS.baseStrength },
        uWindDir:      { value: DIR },
    },
    state: {
        gust: false,
        gustPhase: 'idle',
        gustStart: 0,
        gustHold: 0,
        nextGust: WIND_DEFAULTS.gustIntervalMin,
        leafBoost: false,
    },
    params: { ...WIND_DEFAULTS },
}

const scheduleNextGust = (elapsed) => {
    const { params } = wind
    const interval = params.gustIntervalMin + Math.random() * (params.gustIntervalMax - params.gustIntervalMin)
    wind.state.nextGust = elapsed + interval
}

export const triggerGust = (elapsed, sfxDuration = null) => {
    if (wind.state.gust) return
    wind.state.gust = true
    wind.state.gustPhase = 'rampUp'
    wind.state.gustStart = elapsed
    if (sfxDuration !== null) {
        wind.state.gustHold = Math.max(0.5, sfxDuration - wind.params.gustRampUp - wind.params.gustRampDown)
    } else {
        wind.state.gustHold = (
            wind.params.gustHoldMin
            + Math.random() * (wind.params.gustHoldMax - wind.params.gustHoldMin)
        )
    }
    wind.state.leafBoost = true
    scheduleNextGust(elapsed)
}

export const updateWind = (elapsed, audio) => {
    const { params, state, uniforms } = wind
    uniforms.uTime.value = elapsed

    if (!state.gust) {
        uniforms.uWindStrength.value = params.baseStrength
        if (elapsed > state.nextGust) {
            const dur = audio?.getGustDuration?.() ?? null
            triggerGust(elapsed, dur)
            if (audio?.playGust) audio.playGust()
        } else {
            state.leafBoost = false
        }
        return
    }

    const dt = elapsed - state.gustStart

    if (state.gustPhase === 'rampUp') {
        const t = Math.min(dt / params.gustRampUp, 1)
        uniforms.uWindStrength.value = THREE.MathUtils.lerp(params.baseStrength, params.gustStrength, t)
        if (t >= 1) {
            state.gustPhase = 'hold'
            state.gustStart = elapsed
        }
    } else if (state.gustPhase === 'hold') {
        uniforms.uWindStrength.value = params.gustStrength
        if (elapsed - state.gustStart >= state.gustHold) {
            state.gustPhase = 'rampDown'
            state.gustStart = elapsed
        }
    } else if (state.gustPhase === 'rampDown') {
        const t = Math.min((elapsed - state.gustStart) / params.gustRampDown, 1)
        uniforms.uWindStrength.value = THREE.MathUtils.lerp(params.gustStrength, params.baseStrength, t)
        if (t >= 1) {
            state.gust = false
            state.gustPhase = 'idle'
            state.leafBoost = false
        }
    }
}
