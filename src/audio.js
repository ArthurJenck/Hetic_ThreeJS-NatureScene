import * as THREE from 'three'

export const createAudio = (camera, gui, isDebug = false) => {
    const listener = new THREE.AudioListener()
    camera.add(listener)

    const loader = new THREE.AudioLoader()

    const music = new THREE.Audio(listener)
    const sfxWindAmbient = new THREE.Audio(listener)
    const sfxGust = new THREE.Audio(listener)

    const state = {
        unlocked: false,
        musicVolume: 0.3,
        windAmbientVolume: 1.0,
        gustVolume: 0.05,
        foxVolume: 2.0,
        muted: false,
    }

    const foxBuffers = { idle: [], walk: null }
    const foxVolumeListeners = []

    const unlock = () => {
        if (state.unlocked) return
        state.unlocked = true

        loader.load('./static/sounds/botw_field-day.mp3', (buffer) => {
            music.setBuffer(buffer)
            music.setLoop(true)
            music.setVolume(state.muted ? 0 : state.musicVolume)
            music.play()
        })

        loader.load('./static/sounds/wind.mp3', (buffer) => {
            sfxWindAmbient.setBuffer(buffer)
            sfxWindAmbient.setLoop(true)
            sfxWindAmbient.setVolume(state.muted ? 0 : state.windAmbientVolume)
            sfxWindAmbient.play()
        })

        loader.load('./static/sounds/wind-howling.mp3', (buffer) => {
            sfxGust.setBuffer(buffer)
            sfxGust.setVolume(state.muted ? 0 : state.gustVolume)
        })

        foxBuffers.idle = [null, null, null]
        ;['idle1', 'idle2', 'idle3'].forEach((name, i) => {
            loader.load(`./static/sounds/fox/${name}.mp3`, (buffer) => {
                foxBuffers.idle[i] = buffer
            })
        })
        loader.load('./static/sounds/fox/walk.mp3', (buffer) => {
            foxBuffers.walk = buffer
        })
    }

    ;['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
        window.addEventListener(evt, unlock, { once: true, capture: true })
    })

    const playGust = () => {
        if (!sfxGust.buffer || state.muted) return
        if (sfxGust.isPlaying) sfxGust.stop()
        sfxGust.play()
    }

    const muteOnChange = (v) => {
        music.setVolume(v ? 0 : state.musicVolume)
        sfxWindAmbient.setVolume(v ? 0 : state.windAmbientVolume)
        sfxGust.setVolume(v ? 0 : state.gustVolume)
        foxVolumeListeners.forEach((cb) => cb(v ? 0 : state.foxVolume))
    }

    if (isDebug) {
        const folder = gui.addFolder('Audio')
        folder
            .add(state, 'musicVolume', 0, 1, 0.01)
            .name('Musique')
            .onChange((v) => {
                if (!state.muted) music.setVolume(v)
            })
        folder
            .add(state, 'windAmbientVolume', 0, 1, 0.01)
            .name('Vent ambiant')
            .onChange((v) => {
                if (!state.muted) sfxWindAmbient.setVolume(v)
            })
        folder
            .add(state, 'gustVolume', 0, 2, 0.01)
            .name('Vent bourrasque')
            .onChange((v) => {
                if (!state.muted) sfxGust.setVolume(v)
            })
        folder
            .add(state, 'foxVolume', 0, 2, 0.01)
            .name('Volume renard')
            .onChange((v) => {
                if (!state.muted) foxVolumeListeners.forEach((cb) => cb(v))
            })
        folder.add(state, 'muted').name('Muet').onChange(muteOnChange)
    } else {
        const audioFolder = gui.addFolder('Audio')
        audioFolder.add(state, 'muted').name('Muet').onChange(muteOnChange)
        audioFolder
            .add(state, 'musicVolume', 0, 1, 0.01)
            .name('Musique')
            .onChange((v) => {
                if (!state.muted) music.setVolume(v)
            })
        audioFolder
            .add(state, 'windAmbientVolume', 0, 1, 0.01)
            .name('Vent ambiant')
            .onChange((v) => {
                if (!state.muted) sfxWindAmbient.setVolume(v)
            })
        audioFolder
            .add(state, 'gustVolume', 0, 2, 0.01)
            .name('Vent bourrasque')
            .onChange((v) => {
                if (!state.muted) sfxGust.setVolume(v)
            })
        audioFolder
            .add(state, 'foxVolume', 0, 2, 0.01)
            .name('Renard')
            .onChange((v) => {
                if (!state.muted) foxVolumeListeners.forEach((cb) => cb(v))
            })
    }

    const getGustDuration = () => sfxGust.buffer?.duration ?? null
    const getFoxBuffers = () => foxBuffers
    const getFoxVolume = () => (state.muted ? 0 : state.foxVolume)
    const onFoxVolumeChange = (cb) => foxVolumeListeners.push(cb)

    return {
        playGust,
        getGustDuration,
        listener,
        getFoxBuffers,
        getFoxVolume,
        onFoxVolumeChange,
    }
}
