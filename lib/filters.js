// VINTAGE Filter Presets
export const FILTERS = {
  slimAarons: {
    name: 'Slim Aarons',
    description: 'Warm vintage poolside luxury',
    apply: (ctx, canvas) => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.1 + 20)
        data[i + 1] = Math.min(255, data[i + 1] * 1.05 + 15)
        data[i + 2] = Math.min(255, data[i + 2] * 0.9)
        const fade = 20
        data[i] = data[i] + (255 - data[i]) * (fade / 255)
        data[i + 1] = data[i + 1] + (255 - data[i + 1]) * (fade / 255)
        data[i + 2] = data[i + 2] + (255 - data[i + 2]) * (fade / 255)
      }
      ctx.putImageData(imageData, 0, 0)
    }
  },
  filmNoir: {
    name: 'Film Noir',
    description: 'High contrast black & white',
    apply: (ctx, canvas) => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        const contrast = 1.3
        let adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255
        adjusted = Math.max(0, Math.min(255, adjusted))
        data[i] = data[i + 1] = data[i + 2] = adjusted
      }
      ctx.putImageData(imageData, 0, 0)
    }
  },
  vintageWarm: {
    name: 'Vintage Warm',
    description: 'Warm tones with film grain',
    apply: (ctx, canvas) => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.15 + 25)
        data[i + 1] = Math.min(255, data[i + 1] * 1.05 + 15)
        data[i + 2] = Math.min(255, data[i + 2] * 0.85)
        const grain = (Math.random() - 0.5) * 15
        data[i] = Math.max(0, Math.min(255, data[i] + grain))
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain))
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain))
      }
      ctx.putImageData(imageData, 0, 0)
    }
  },
  coolBW: {
    name: 'Cool B&W',
    description: 'Crisp museum quality',
    apply: (ctx, canvas) => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        data[i] = Math.max(0, gray - 5)
        data[i + 1] = gray
        data[i + 2] = Math.min(255, gray + 5)
      }
      ctx.putImageData(imageData, 0, 0)
    }
  },
  fadedFilm: {
    name: 'Faded Film',
    description: 'Washed out vintage',
    apply: (ctx, canvas) => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        data[i] = data[i] * 0.3 + gray * 0.7
        data[i + 1] = data[i + 1] * 0.3 + gray * 0.7
        data[i + 2] = data[i + 2] * 0.3 + gray * 0.7
        const fade = 40
        data[i] = data[i] + (255 - data[i]) * (fade / 255)
        data[i + 1] = data[i + 1] + (255 - data[i + 1]) * (fade / 255)
        data[i + 2] = data[i + 2] + (255 - data[i + 2]) * (fade / 255)
      }
      ctx.putImageData(imageData, 0, 0)
    }
  }
}

// Apply filter and date stamp to canvas
export function applyFilterToCanvas(canvas, ctx, filter, dateStamp) {
  if (filter && FILTERS[filter]) {
    FILTERS[filter].apply(ctx, canvas)
  }
  
  if (dateStamp) {
    const fontSize = Math.max(14, canvas.width * 0.035)
    ctx.font = `bold ${fontSize}px 'Courier New', monospace`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    
    const padding = fontSize * 0.6
    const x = canvas.width - padding
    const y = canvas.height - padding
    
    // Orange background
    const metrics = ctx.measureText(dateStamp)
    const bgPadding = fontSize * 0.3
    ctx.fillStyle = 'rgba(255, 140, 0, 0.9)'
    ctx.fillRect(
      x - metrics.width - bgPadding * 2,
      y - fontSize - bgPadding,
      metrics.width + bgPadding * 2,
      fontSize + bgPadding * 2
    )
    
    // White text
    ctx.fillStyle = 'white'
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = 2
    ctx.shadowOffsetY = 1
    ctx.fillText(dateStamp, x - bgPadding, y)
    ctx.shadowBlur = 0
  }
}

// Generate Instagram Story image
export function generateStoryImage(imageUrl, filter, dateStamp, callback) {
  const storyWidth = 1080
  const storyHeight = 1920
  
  const canvas = document.createElement('canvas')
  canvas.width = storyWidth
  canvas.height = storyHeight
  const ctx = canvas.getContext('2d')
  
  // Background
  ctx.fillStyle = '#F5F5F0'
  ctx.fillRect(0, 0, storyWidth, storyHeight)
  
  const img = new Image()
  img.crossOrigin = 'anonymous'
  
  img.onload = () => {
    const padding = 60
    const maxWidth = storyWidth - (padding * 2)
    const maxHeight = storyHeight - 300
    
    let imgWidth = img.width
    let imgHeight = img.height
    const aspectRatio = imgWidth / imgHeight
    
    if (imgWidth > maxWidth) {
      imgWidth = maxWidth
      imgHeight = imgWidth / aspectRatio
    }
    if (imgHeight > maxHeight) {
      imgHeight = maxHeight
      imgWidth = imgHeight * aspectRatio
    }
    
    const imgX = (storyWidth - imgWidth) / 2
    const imgY = (storyHeight - imgHeight) / 2 - 50
    
    ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight)
    
    // Apply filter to image area
    if (filter && FILTERS[filter]) {
      const imageData = ctx.getImageData(imgX, imgY, imgWidth, imgHeight)
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = imgWidth
      tempCanvas.height = imgHeight
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.putImageData(imageData, 0, 0)
      FILTERS[filter].apply(tempCtx, tempCanvas)
      ctx.putImageData(tempCtx.getImageData(0, 0, imgWidth, imgHeight), imgX, imgY)
    }
    
    // Date stamp
    if (dateStamp) {
      const dateFont = 24
      ctx.font = `bold ${dateFont}px 'Courier New', monospace`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      
      const dateX = imgX + imgWidth - 15
      const dateY = imgY + imgHeight - 15
      const metrics = ctx.measureText(dateStamp)
      
      ctx.fillStyle = 'rgba(255, 140, 0, 0.9)'
      ctx.fillRect(dateX - metrics.width - 20, dateY - dateFont - 10, metrics.width + 24, dateFont + 16)
      
      ctx.fillStyle = 'white'
      ctx.fillText(dateStamp, dateX - 8, dateY - 4)
    }
    
    // Watermark
    ctx.font = '600 28px Georgia, serif'
    ctx.fillStyle = 'rgba(44, 44, 44, 0.6)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('VINTAGE', padding, storyHeight - 80)
    
    ctx.font = 'italic 16px Georgia, serif'
    ctx.fillStyle = 'rgba(102, 102, 102, 0.6)'
    ctx.fillText('A museum for your memories', padding, storyHeight - 50)
    
    canvas.toBlob((blob) => {
      callback(blob)
    }, 'image/png', 1.0)
  }
  
  img.src = imageUrl
}

// Format date for stamp
export function formatDateStamp(date) {
  const d = new Date(date)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${month}/${day}/${year}`
}
