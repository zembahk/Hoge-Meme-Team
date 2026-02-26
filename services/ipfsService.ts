
import { IPFSImage } from '../types';

const GATEWAY_BASE = "https://ipfs.io";
const DIRECTORY_URL = "https://ipfs.io/ipfs/QmW9L7oVPdKz1NYN4czALTXPUjJA4gH2Gtda3M19WQ5pVF/";

export async function fetchIPFSImages(): Promise<IPFSImage[]> {
  try {
    const response = await fetch(DIRECTORY_URL);
    if (!response.ok) throw new Error(`Failed to fetch directory: ${response.statusText}`);
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const links = Array.from(doc.getElementsByTagName("a"));
    
    const imageExtensions = /\.(jpe?g|png|gif|webp)$/i;
    const added = new Set<string>();
    const images: IPFSImage[] = [];

    links.forEach((link) => {
      const href = link.getAttribute("href")?.split("?")[0];
      if (href && imageExtensions.test(href) && !added.has(href)) {
        const fullUrl = href.startsWith('http') ? href : `${GATEWAY_BASE}${href}`;
        const filename = href.split('/').pop() || 'image';
        
        images.push({
          id: Math.random().toString(36).substring(7),
          url: fullUrl,
          filename: filename,
          type: filename.split('.').pop()?.toUpperCase() || 'IMG'
        });
        added.add(href);
      }
    });

    return images;
  } catch (error) {
    console.error("Error scraping IPFS:", error);
    throw error;
  }
}

export async function getFileSize(url: string): Promise<{ formatted: string; bytes: number }> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const size = response.headers.get('content-length');
    if (!size) return { formatted: 'Unknown', bytes: 0 };
    
    const bytes = parseInt(size, 10);
    let formatted = '';
    if (bytes < 1024) formatted = `${bytes} B`;
    else if (bytes < 1024 * 1024) formatted = `${(bytes / 1024).toFixed(1)} KB`;
    else formatted = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    
    return { formatted, bytes };
  } catch {
    return { formatted: 'Unknown', bytes: 0 };
  }
}

export async function downloadImage(url: string, filename: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}
