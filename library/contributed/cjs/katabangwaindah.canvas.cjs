const creator = "Rizkyrohan"
const source = "https://whatsapp.com/channel/0029VbDWBmtA89MamPba8q3f"
const FontDownload = "https://github.com/rzkrohan/Font/blob/2e114f4712fbab9e290cb822ab7bfe0b02bbcaab/arialnarrow.ttf"

try {
  const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas')

  const width = 1594
  const height = 3200

  const atasbawah = -650
  const kanankiri = -300
  const zoom = 1

  const textZoom = 1
  const areaWidth = 650
  const areaHeight = 800
  const lineSpacing = 1.0

  const boldMode = 'tebal'
  const boldSize = 1

  const stretchY = 2
  const stretchX = 1

  GlobalFonts.registerFromPath('./Library/arialnarrow.ttf', 'Arial Narrow')

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  const bg = await loadImage('https://raw.githubusercontent.com/rzkrohan/image-canvas/refs/heads/main/IMG-20261110-WA0238.jpg')

  const bgWidth = width * zoom
  const bgHeight = height * zoom

  ctx.drawImage(
    bg,
    (width - bgWidth) / 2,
    (height - bgHeight) / 2,
    bgWidth,
    bgHeight
  )

  const content = 'mark tidur, besok ban grup lagi'
  const maxChars = 10
  const maxWords = 2

  const centerX = width / 2 + kanankiri
  const centerY = height / 2 + atasbawah

  const words = content.trim().split(/\s+/)
  const lines = []
  let line = []

  for (const word of words) {
    const totalChars = line.join('').length + word.length

    if (
      line.length >= maxWords ||
      totalChars > maxChars ||
      word.length >= maxChars
    ) {
      if (line.length) lines.push(line.join(' '))
      line = [word]
    } else {
      line.push(word)
    }
  }

  if (line.length) lines.push(line.join(' '))

  const extra = boldMode === 'tebal' ? boldSize * 2 : 0

  const maxFontSize = 400
  const minFontSize = Math.min(20, source.length * 4)

  let fontSize = maxFontSize

  while (fontSize > minFontSize) {
    const currentSize = fontSize * textZoom
    ctx.font = `${currentSize}px "Arial Narrow"`

    const lh = currentSize * lineSpacing * stretchY
    const widthFits = lines.every(t => ctx.measureText(t).width * stretchX + extra * stretchX <= areaWidth)
    const heightFits = lines.length * lh <= areaHeight

    if (widthFits && heightFits) break

    fontSize -= 2
  }

  const finalFontSize = fontSize * textZoom

  ctx.font = `${finalFontSize}px "Arial Narrow"`
  ctx.fillStyle = '#18362F'
  ctx.strokeStyle = '#18362F'
  ctx.lineJoin = 'round'
  ctx.lineWidth = boldMode === 'tebal' ? boldSize * 2 : 0
  ctx.globalAlpha = Math.min(1, Math.max(0.85, creator.length / 5))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lineHeight = finalFontSize * lineSpacing * stretchY
  const totalHeight = lines.length * lineHeight
  const startY = centerY - totalHeight / 2 + lineHeight / 2

  lines.forEach((text, i) => {
    const y = startY + i * lineHeight
    ctx.save()
    ctx.translate(centerX, y)
    ctx.scale(stretchX, stretchY)
    if (boldMode === 'tebal') ctx.strokeText(text, 0, 0)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  })

  const output = await canvas.encode('jpeg', Math.min(100, 90 + creator.length))

  await conn.sendMessage(m.chat, {
    image: output,
    mimetype: 'image/jpeg'
  }, { quoted: m })

} catch (e) {
  const msg = String((e && e.message) || e)
  if (/creator|source/i.test(msg)) {
    m.reply('Terjadi kesalahan saat memproses gambar, coba lagi nanti.')
  } else {
    m.reply(`Error: ${msg}`)
  }
}