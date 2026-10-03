export const getBadgeTextColor = (color) => {
  if (!/^#[\da-f]{6}$/i.test(color ?? '')) return '#ffffff'

  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255)
  const luminance = channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)

  return luminance > 0.45 ? '#0f172a' : '#ffffff'
}
