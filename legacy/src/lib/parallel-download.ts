/**
 * Parallel Chunk Download Utility
 * 
 * Downloads files from Cloudflare R2 using parallel Range requests
 * to improve download speed for large files.
 */

interface DownloadProgress {
    loaded: number;
    total: number;
    percent: number;
}

interface ChunkResult {
    index: number;
    data: ArrayBuffer;
}

interface ParallelDownloadOptions {
    url: string;
    fileName: string;
    fileSize: number;
    mimeType?: string;
    chunkSize?: number;  // Default: 10MB
    maxConnections?: number;  // Default: 6
    onProgress?: (progress: DownloadProgress) => void;
}

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_CONNECTIONS = 6;

/**
 * Downloads a file chunk using Range request
 */
async function downloadChunk(
    url: string,
    start: number,
    end: number,
    index: number
): Promise<ChunkResult> {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Range': `bytes=${start}-${end}`
        }
    });

    if (!response.ok && response.status !== 206) {
        throw new Error(`Chunk download failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.arrayBuffer();
    return { index, data };
}

/**
 * Downloads a file in parallel chunks and triggers browser download
 */
export async function parallelDownload(options: ParallelDownloadOptions): Promise<void> {
    const {
        url,
        fileName,
        fileSize,
        mimeType = 'application/octet-stream',
        chunkSize = DEFAULT_CHUNK_SIZE,
        maxConnections = DEFAULT_MAX_CONNECTIONS,
        onProgress
    } = options;

    // For small files (< 10MB), use single request
    if (fileSize < chunkSize) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        triggerBrowserDownload(blob, fileName);
        onProgress?.({ loaded: fileSize, total: fileSize, percent: 100 });
        return;
    }

    // Calculate chunks
    const chunks: Array<{ start: number; end: number; index: number }> = [];
    let start = 0;
    let index = 0;

    while (start < fileSize) {
        const end = Math.min(start + chunkSize - 1, fileSize - 1);
        chunks.push({ start, end, index });
        start = end + 1;
        index++;
    }

    // Track progress
    const chunkProgress: number[] = new Array(chunks.length).fill(0);
    let completedBytes = 0;

    const updateProgress = (chunkIndex: number, bytes: number) => {
        chunkProgress[chunkIndex] = bytes;
        completedBytes = chunkProgress.reduce((a, b) => a + b, 0);
        onProgress?.({
            loaded: completedBytes,
            total: fileSize,
            percent: Math.round((completedBytes / fileSize) * 100)
        });
    };

    // Download chunks in parallel with connection limit
    const results: ChunkResult[] = new Array(chunks.length);
    const pending = [...chunks];
    const inProgress: Promise<void>[] = [];

    const startNextDownload = async (): Promise<void> => {
        const chunk = pending.shift();
        if (!chunk) return;

        const result = await downloadChunk(url, chunk.start, chunk.end, chunk.index);
        results[chunk.index] = result;
        updateProgress(chunk.index, result.data.byteLength);

        // Start next download if there are more chunks
        if (pending.length > 0) {
            await startNextDownload();
        }
    };

    // Start initial batch of downloads
    for (let i = 0; i < Math.min(maxConnections, chunks.length); i++) {
        inProgress.push(startNextDownload());
    }

    await Promise.all(inProgress);

    // Merge all chunks in order
    const mergedBuffer = new Uint8Array(fileSize);
    let offset = 0;

    for (const result of results) {
        mergedBuffer.set(new Uint8Array(result.data), offset);
        offset += result.data.byteLength;
    }

    // Create blob and trigger download
    const blob = new Blob([mergedBuffer], { type: mimeType });
    triggerBrowserDownload(blob, fileName);
}

/**
 * Triggers browser download for a blob
 */
function triggerBrowserDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Downloads a file from the VizCad API using parallel chunks
 */
export async function downloadFileParallel(
    fileId: string,
    fileName: string,
    onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
    // Get presigned URL from backend
    const response = await fetch(`/api/files/download?fileId=${fileId}`);

    if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Download failed' })) as { error?: string };
        throw new Error(data.error || 'Download failed');
    }

    const data = await response.json() as {
        url: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
    };

    // Use parallel download
    await parallelDownload({
        url: data.url,
        fileName: data.fileName || fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        onProgress
    });
}
