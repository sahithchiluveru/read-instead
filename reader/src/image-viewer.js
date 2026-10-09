// The image viewer: an image from the Spread, full screen. Back closes it.
const viewer = document.getElementById('image-viewer')
const image = viewer.querySelector('img')

export const openImageViewer = src => {
    image.src = src
    viewer.hidden = false
}

export const closeImageViewer = () => {
    viewer.hidden = true
    image.removeAttribute('src')
}
