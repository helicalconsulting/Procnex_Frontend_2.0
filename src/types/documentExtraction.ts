// ============================================================
// types/documentExtraction.ts
// Canonical Document Model for Frontend
// ============================================================

export type CoordinateUnit = 'pt' | 'px' | 'mm' | 'in';

export type ElementType =
  | 'text'
  | 'table'
  | 'image'
  | 'vector'
  | 'stamp'
  | 'signature'
  | 'barcode'
  | 'uncertain'
  | 'form_line'
  | 'checkbox'
  | 'container_box';

export type ElementSource = 'native' | 'ocr' | 'inferred' | 'user_edit';
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSpan {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold' | 400 | 500 | 600 | 700 | 800;
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  color?: string;
  letterSpacing?: number;
  lineHeight?: number;
}

export interface TextLine {
  id?: string;
  text: string;
  bbox: BoundingBox;
  confidence?: number;
  spans?: TextSpan[];
}

export interface TableCell {
  id?: string;
  row: number;
  col: number;
  rowspan?: number;
  colspan?: number;
  bbox: BoundingBox;
  content: string;
  horizontalAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  isHeader?: boolean;
  border?: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean; color?: string; width?: number };
  backgroundColor?: string;
}

export interface TableElementData {
  rows: number;
  cols: number;
  cells: TableCell[];
  hasBorders: boolean;
  uncertainStructure?: boolean;
}

export interface ImageElementData {
  assetUrl: string;
  cropBox?: BoundingBox;
  graphicType: 'photo' | 'logo' | 'signature' | 'stamp' | 'chart' | 'artwork' | 'scanned_fallback';
  isEditable: boolean;
  transparency?: boolean;
}

export interface CanonicalElement {
  id: string;
  pageIndex: number;
  type: ElementType;
  bbox: BoundingBox;
  rotation?: number;
  zIndex?: number;
  readingOrder: number;
  source: ElementSource;
  confidence?: number;
  warnings?: string[];

  text?: string;
  alignment?: TextAlignment;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | 400 | 500 | 600 | 700 | 800;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  lines?: TextLine[];
  tableData?: TableElementData;
  imageData?: ImageElementData;
  checked?: boolean;
  border?: string;
}

export interface CanonicalPage {
  pageIndex: number;
  width: number;
  height: number;
  rotation: number;
  coordinateUnit: CoordinateUnit;
  previewImageUrl?: string | null;
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  extractionMethod: 'native' | 'ocr' | 'hybrid';
  elements: CanonicalElement[];
  rawElements?: CanonicalElement[];
  userEdits?: UserPageEdits | null;
  warnings?: string[];
  readingOrder?: string[];
}

export interface UserPageEdits {
  updatedElements?: Record<string, Partial<CanonicalElement>>;
  deletedElementIds?: string[];
  addedElements?: CanonicalElement[];
  savedAt?: string;
  savedBy?: string;
}

export interface QualityValidationReport {
  visualSimilarityScore?: number;
  duplicateTextCount: number;
  overflowElementCount: number;
  missingAssetCount: number;
  lowConfidenceCount: number;
  uncertainTableCount: number;
  diffOverlayUrl?: string | null;
  warnings: string[];
}

export interface DocumentExtractionSummary {
  id: string;
  companyCode: string;
  title: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  stage?: 'upload' | 'preprocessing' | 'ocr' | 'layout_analysis' | 'completed' | 'failed' | null;
  stageProgress?: number;
  errorMessage?: string | null;
  pageCount: number;
  coordinateUnit: CoordinateUnit;
  plainText?: string | null;
  reconstructedPdfUrl?: string | null;
  pages?: Array<{
    pageIndex: number;
    width: number;
    height: number;
    previewImageUrl?: string | null;
  }>;
  createdAt: string;
}

