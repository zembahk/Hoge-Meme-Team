
export interface IPFSImage {
  id: string;
  url: string;
  filename: string;
  type: string;
  aiTags?: string[];
  analyzing?: boolean;
  dimensions?: string;
  fileSize?: string;
  sizeBytes?: number;
}

export enum AppState {
  IDLE = 'IDLE',
  FETCHING = 'FETCHING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface GalleryStats {
  total: number;
  size?: string;
}
