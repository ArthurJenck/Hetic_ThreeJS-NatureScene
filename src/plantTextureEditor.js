import * as THREE from 'three'
import { loadImage } from './textures.js'

const PREVIEW_SIZE = 320
const DEFAULT_BRUSH_SIZE = 88
const DEFAULT_COLOR = '#7db53a'
const PLANT_MASKS = [
    './static/plants/alpha1.png',
    './static/plants/alpha2.png',
    './static/plants/alpha3.png',
    './static/plants/alpha4.png',
    './static/plants/alpha5.png',
]

const PALETTE = [
    '#203413',
    '#476b22',
    '#7db53a',
    '#adc75a',
    '#d8a743',
    '#d76b37',
]

const DEFAULT_LAYERS = [
    ['#274118', '#4d7f27', '#98cf5d', '#d0cf6d'],
    ['#243819', '#527d2d', '#95c25a', '#c07d32'],
    ['#1f3219', '#406628', '#83af4a', '#d5b74a'],
    ['#2f4217', '#5b7e2c', '#9fc14f', '#d9733c'],
    ['#203717', '#447024', '#74a83d', '#d2d764'],
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const createCanvas = (width, height) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('Impossible de creer un contexte 2D pour les plantes.')
    }

    return { canvas, context }
}

const applyMaskToCanvas = ({
    targetCanvas,
    targetContext,
    scratchCanvas,
    scratchContext,
    maskSource,
}) => {
    scratchContext.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height)
    scratchContext.drawImage(targetCanvas, 0, 0)
    scratchContext.globalCompositeOperation = 'destination-in'
    scratchContext.drawImage(
        maskSource,
        0,
        0,
        targetCanvas.width,
        targetCanvas.height,
    )
    scratchContext.globalCompositeOperation = 'source-over'

    targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
    targetContext.drawImage(scratchCanvas, 0, 0)
    scratchContext.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height)
}

const seedDefaultLayer = ({ context, width, height, colors }) => {
    context.clearRect(0, 0, width, height)

    const gradient = context.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, colors[0])
    gradient.addColorStop(0.45, colors[1])
    gradient.addColorStop(0.8, colors[2])
    gradient.addColorStop(1, colors[3])
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)

    const bloom = context.createRadialGradient(
        width * 0.5,
        height * 0.25,
        width * 0.03,
        width * 0.5,
        height * 0.25,
        width * 0.5,
    )
    bloom.addColorStop(0, 'rgba(255, 247, 212, 0.65)')
    bloom.addColorStop(0.45, 'rgba(255, 247, 212, 0.18)')
    bloom.addColorStop(1, 'rgba(255, 247, 212, 0)')
    context.fillStyle = bloom
    context.fillRect(0, 0, width, height)

    context.lineCap = 'round'
    context.globalAlpha = 0.2
    context.strokeStyle = 'rgba(18, 34, 12, 1)'
    context.lineWidth = Math.max(width * 0.004, 4)
    for (let i = 0; i < 12; i++) {
        const ratio = (i + 0.5) / 12
        const startX = width * ratio
        const curve = (Math.sin(ratio * Math.PI * 3) * width) / 24
        context.beginPath()
        context.moveTo(startX, height)
        context.quadraticCurveTo(
            startX + curve,
            height * 0.55,
            startX * 0.95,
            0,
        )
        context.stroke()
    }
    context.globalAlpha = 1
}

const drawPreviewBackground = (context, size) => {
    context.fillStyle = '#132013'
    context.fillRect(0, 0, size, size)

    const squareSize = size / 10
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            context.fillStyle = (x + y) % 2 === 0 ? '#20361d' : '#172917'
            context.fillRect(
                x * squareSize,
                y * squareSize,
                squareSize,
                squareSize,
            )
        }
    }
}

const setDpiCanvasSize = (canvas, size) => {
    const pixelRatio = window.devicePixelRatio || 1
    canvas.width = Math.round(size * pixelRatio)
    canvas.height = Math.round(size * pixelRatio)
    return pixelRatio
}

export const createPlantTextureEditor = async ({ anisotropy = 1 } = {}) => {
    const alphaImages = await Promise.all(
        PLANT_MASKS.map((url) => loadImage(url)),
    )
    const width = alphaImages[0].width
    const height = alphaImages[0].height

    const { canvas: colorCanvas, context: colorContext } = createCanvas(
        width,
        height,
    )
    const { canvas: alphaCanvas, context: alphaContext } = createCanvas(
        width,
        height,
    )
    const { canvas: scratchCanvas, context: scratchContext } = createCanvas(
        width,
        height,
    )

    const layers = alphaImages.map(() => createCanvas(width, height))
    const initializedLayers = alphaImages.map(() => false)

    const colorTexture = new THREE.CanvasTexture(colorCanvas)
    colorTexture.colorSpace = THREE.SRGBColorSpace
    colorTexture.anisotropy = anisotropy
    colorTexture.needsUpdate = true

    const alphaTexture = new THREE.CanvasTexture(alphaCanvas)
    alphaTexture.anisotropy = anisotropy
    alphaTexture.needsUpdate = true

    const root = document.createElement('aside')
    root.className = 'plant-editor'
    root.innerHTML = `
        <div class="plant-editor__panel">
            <div class="plant-editor__header">
                <div>
                    <p class="plant-editor__eyebrow">Plant Painter</p>
                    <h2>Texture des plantes</h2>
                </div>
                <p class="plant-editor__hint">
                    Les fichiers de <code>plants/</code> restent les masques. Ici tu peins la carte couleur utilisee par les plantes.
                </p>
            </div>

            <div class="plant-editor__section">
                <span class="plant-editor__label">Masque actif</span>
                <div class="plant-editor__masks"></div>
            </div>

            <div class="plant-editor__preview-frame">
                <canvas class="plant-editor__preview" aria-label="Apercu de la texture de plante"></canvas>
            </div>

            <div class="plant-editor__section">
                <div class="plant-editor__row">
                    <label class="plant-editor__label" for="plant-editor-color">Couleur</label>
                    <input id="plant-editor-color" class="plant-editor__color" type="color" value="${DEFAULT_COLOR}" />
                </div>
                <div class="plant-editor__swatches"></div>
            </div>

            <div class="plant-editor__section">
                <div class="plant-editor__row">
                    <label class="plant-editor__label" for="plant-editor-brush">Pinceau</label>
                    <output class="plant-editor__value">88 px</output>
                </div>
                <input id="plant-editor-brush" class="plant-editor__range" type="range" min="16" max="240" step="1" value="${DEFAULT_BRUSH_SIZE}" />
            </div>

            <div class="plant-editor__actions">
                <button class="plant-editor__button plant-editor__button--fill" type="button">Remplir</button>
                <button class="plant-editor__button" type="button" data-action="reset">Reinitialiser</button>
                <button class="plant-editor__button" type="button" data-action="download">Exporter PNG</button>
            </div>
        </div>
    `

    const previewCanvas = root.querySelector('.plant-editor__preview')
    const previewContext = previewCanvas.getContext('2d')
    if (!previewContext) {
        throw new Error(
            "Impossible d'initialiser le canvas d'edition des plantes.",
        )
    }

    let previewRatio = setDpiCanvasSize(previewCanvas, PREVIEW_SIZE)
    const colorInput = root.querySelector('#plant-editor-color')
    const brushInput = root.querySelector('#plant-editor-brush')
    const brushValue = root.querySelector('.plant-editor__value')
    const masksContainer = root.querySelector('.plant-editor__masks')
    const swatchesContainer = root.querySelector('.plant-editor__swatches')
    const fillButton = root.querySelector('.plant-editor__button--fill')
    const resetButton = root.querySelector('[data-action="reset"]')
    const downloadButton = root.querySelector('[data-action="download"]')

    let activeMaskIndex = 0
    let isDrawing = false
    let lastPoint = null

    const updatePreview = () => {
        previewContext.setTransform(previewRatio, 0, 0, previewRatio, 0, 0)
        previewContext.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
        drawPreviewBackground(previewContext, PREVIEW_SIZE)
        previewContext.drawImage(colorCanvas, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE)

        previewContext.globalAlpha = 0.1
        previewContext.drawImage(alphaCanvas, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
        previewContext.globalAlpha = 1
    }

    const syncTextures = () => {
        colorTexture.needsUpdate = true
        alphaTexture.needsUpdate = true
        updatePreview()
    }

    const refreshPreviewSize = () => {
        previewRatio = setDpiCanvasSize(previewCanvas, PREVIEW_SIZE)
        updatePreview()
    }

    const saveCurrentLayer = () => {
        const currentLayer = layers[activeMaskIndex]
        currentLayer.context.clearRect(0, 0, width, height)
        currentLayer.context.drawImage(colorCanvas, 0, 0)
    }

    const updateMaskButtons = () => {
        for (const button of masksContainer.querySelectorAll('button')) {
            button.classList.toggle(
                'is-active',
                Number(button.dataset.index) === activeMaskIndex,
            )
        }
    }

    const setAlphaMask = (index) => {
        alphaContext.clearRect(0, 0, width, height)
        alphaContext.drawImage(alphaImages[index], 0, 0, width, height)
    }

    const initializeLayer = (index) => {
        if (initializedLayers[index]) {
            return
        }

        const layer = layers[index]
        const colors = DEFAULT_LAYERS[index % DEFAULT_LAYERS.length]
        seedDefaultLayer({
            context: layer.context,
            width,
            height,
            colors,
        })
        applyMaskToCanvas({
            targetCanvas: layer.canvas,
            targetContext: layer.context,
            scratchCanvas,
            scratchContext,
            maskSource: alphaImages[index],
        })
        initializedLayers[index] = true
    }

    const restoreLayer = (index) => {
        initializeLayer(index)
        colorContext.clearRect(0, 0, width, height)
        colorContext.drawImage(layers[index].canvas, 0, 0)
    }

    const switchMask = (index) => {
        if (index === activeMaskIndex) {
            return
        }

        saveCurrentLayer()
        activeMaskIndex = index
        setAlphaMask(activeMaskIndex)
        restoreLayer(activeMaskIndex)
        updateMaskButtons()
        syncTextures()
    }

    const fillCurrentMask = () => {
        colorContext.save()
        colorContext.globalCompositeOperation = 'source-over'
        colorContext.fillStyle = colorInput.value
        colorContext.fillRect(0, 0, width, height)
        colorContext.restore()

        applyMaskToCanvas({
            targetCanvas: colorCanvas,
            targetContext: colorContext,
            scratchCanvas,
            scratchContext,
            maskSource: alphaCanvas,
        })
        saveCurrentLayer()
        syncTextures()
    }

    const resetCurrentMask = () => {
        initializedLayers[activeMaskIndex] = false
        initializeLayer(activeMaskIndex)
        restoreLayer(activeMaskIndex)
        saveCurrentLayer()
        syncTextures()
    }

    const downloadTexture = () => {
        const link = document.createElement('a')
        link.href = colorCanvas.toDataURL('image/png')
        link.download = `plant-color-mask-${activeMaskIndex + 1}.png`
        link.click()
    }

    const brushRadius = () => Number(brushInput.value)

    const pointFromEvent = (event) => {
        const rect = previewCanvas.getBoundingClientRect()
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1) * width
        const y = clamp((event.clientY - rect.top) / rect.height, 0, 1) * height

        return { x, y }
    }

    const paintStamp = (point) => {
        colorContext.save()
        colorContext.fillStyle = colorInput.value
        colorContext.beginPath()
        colorContext.arc(point.x, point.y, brushRadius(), 0, Math.PI * 2)
        colorContext.fill()
        colorContext.restore()
    }

    const paintStroke = (from, to) => {
        const distance = Math.max(Math.hypot(to.x - from.x, to.y - from.y), 1)
        const stepSize = Math.max(brushRadius() * 0.35, 1)
        const steps = Math.ceil(distance / stepSize)

        for (let i = 0; i <= steps; i++) {
            const t = i / steps
            paintStamp({
                x: THREE.MathUtils.lerp(from.x, to.x, t),
                y: THREE.MathUtils.lerp(from.y, to.y, t),
            })
        }

        applyMaskToCanvas({
            targetCanvas: colorCanvas,
            targetContext: colorContext,
            scratchCanvas,
            scratchContext,
            maskSource: alphaCanvas,
        })
        syncTextures()
    }

    const updateBrushLabel = () => {
        brushValue.textContent = `${brushInput.value} px`
    }

    PALETTE.forEach((color) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'plant-editor__swatch'
        button.style.setProperty('--swatch-color', color)
        button.setAttribute('aria-label', `Utiliser ${color}`)
        button.addEventListener('click', () => {
            colorInput.value = color
        })
        swatchesContainer.appendChild(button)
    })

    alphaImages.forEach((_, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'plant-editor__mask'
        button.dataset.index = String(index)
        button.textContent = `0${index + 1}`
        button.addEventListener('click', () => switchMask(index))
        masksContainer.appendChild(button)
    })

    previewCanvas.addEventListener('pointerdown', (event) => {
        isDrawing = true
        lastPoint = pointFromEvent(event)
        previewCanvas.setPointerCapture(event.pointerId)
        paintStamp(lastPoint)
        applyMaskToCanvas({
            targetCanvas: colorCanvas,
            targetContext: colorContext,
            scratchCanvas,
            scratchContext,
            maskSource: alphaCanvas,
        })
        syncTextures()
    })

    previewCanvas.addEventListener('pointermove', (event) => {
        if (!isDrawing || !lastPoint) {
            return
        }

        const nextPoint = pointFromEvent(event)
        paintStroke(lastPoint, nextPoint)
        lastPoint = nextPoint
    })

    const stopDrawing = () => {
        if (isDrawing) {
            saveCurrentLayer()
        }
        isDrawing = false
        lastPoint = null
    }

    previewCanvas.addEventListener('pointerup', stopDrawing)
    previewCanvas.addEventListener('pointerleave', stopDrawing)
    previewCanvas.addEventListener('pointercancel', stopDrawing)

    brushInput.addEventListener('input', updateBrushLabel)
    fillButton.addEventListener('click', fillCurrentMask)
    resetButton.addEventListener('click', resetCurrentMask)
    downloadButton.addEventListener('click', downloadTexture)
    window.addEventListener('resize', refreshPreviewSize)

    setAlphaMask(activeMaskIndex)
    restoreLayer(activeMaskIndex)
    updateMaskButtons()
    updateBrushLabel()
    syncTextures()

    return {
        colorTexture,
        alphaTexture,
        element: root,
        attach(parent = document.body) {
            if (!root.isConnected) {
                parent.appendChild(root)
            }
        },
    }
}
