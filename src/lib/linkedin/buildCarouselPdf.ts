import { PDFDocument } from "pdf-lib";

const MAX_SLIDES   = 5;
const FETCH_TIMEOUT = 15_000;

async function fetchImage(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Image fetch ${res.status}: ${url}`);
    const mime = res.headers.get("content-type") || "image/jpeg";
    const buf  = await res.arrayBuffer();
    return { bytes: new Uint8Array(buf), mime };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Builds a single PDF where each input image is one full-page slide.
 * Pages are sized to the source image, so square images stay square in the LinkedIn carousel.
 * Caps at 10 slides — LinkedIn document posts allow more, but feed engagement drops past ~10.
 */
export async function buildCarouselPdf(imageUrls: string[]): Promise<Buffer> {
  const slides = imageUrls.slice(0, MAX_SLIDES);
  if (slides.length < 1) throw new Error("Carousel needs at least 1 image.");

  const pdf = await PDFDocument.create();

  for (const url of slides) {
    const { bytes, mime } = await fetchImage(url);
    // Sniff mime from magic bytes when the server lies about content-type (fal.ai sometimes does).
    const isPngHeader = bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isPng = isPngHeader || mime.includes("png");
    let img;
    try {
      img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      // Fallback: try the other format if our guess was wrong.
      img = isPng ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    }
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const pdfBytes = await pdf.save();
  return Buffer.from(pdfBytes);
}
