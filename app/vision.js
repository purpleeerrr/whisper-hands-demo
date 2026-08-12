export function hammingDistance(left, right) {
  const length = Math.max(left.length, right.length);
  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

export function rankByVisualHash(records, queryHash) {
  return records
    .flatMap((record) => record.media
      ?.filter((media) => media.type === 'image' && media.hash)
      .map((media) => ({ record, media, distance: hammingDistance(media.hash, queryHash) })) || [])
    .sort((a, b) => a.distance - b.distance);
}

export async function computeImageHash(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 9, 8);
  const pixels = context.getImageData(0, 0, 9, 8).data;
  const gray = [];
  for (let index = 0; index < pixels.length; index += 4) {
    gray.push((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114));
  }
  let hash = '';
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const offset = (row * 9) + column;
      hash += gray[offset] > gray[offset + 1] ? '1' : '0';
    }
  }
  return hash;
}
