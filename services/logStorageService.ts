import { SynthLogItem } from '../types';

const LOG_STORAGE_PREFIX = 'synth_logs_';
const CHUNK_SIZE = 50; // Store 50 logs per localStorage key

interface LogChunk {
    id: number;
    logs: SynthLogItem[];
}

export const LogStorageService = {
    // Save a single log (append to end)
    saveLog: (sessionUid: string, log: SynthLogItem) => {
        console.log(`[Storage Debug] Saving log for session ${sessionUid}, Log ID: ${log.id}`);
        const indexKey = `${LOG_STORAGE_PREFIX}${sessionUid}_index`;
        const indexStr = localStorage.getItem(indexKey);
        let totalCount = 0;
        let lastChunkId = 0;

        if (indexStr) {
            const index = JSON.parse(indexStr);
            totalCount = index.totalCount;
            lastChunkId = index.lastChunkId;
        }

        // Try to load last chunk
        const chunkKey = `${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${lastChunkId}`;
        const chunkStr = localStorage.getItem(chunkKey);
        let currentChunk: SynthLogItem[] = [];

        if (chunkStr) {
            currentChunk = JSON.parse(chunkStr);
        }

        if (currentChunk.length >= CHUNK_SIZE) {
            // Start new chunk
            lastChunkId++;
            currentChunk = [log];
        } else {
            // Append to current
            currentChunk.push(log);
        }

        // Save chunk
        try {
            console.log(`[Storage Debug] Writing chunk ${lastChunkId}, Items: ${currentChunk.length}`);
            localStorage.setItem(`${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${lastChunkId}`, JSON.stringify(currentChunk));

            // Update index
            const newIndex = {
                totalCount: totalCount + 1,
                lastChunkId: lastChunkId
            };
            localStorage.setItem(indexKey, JSON.stringify(newIndex));
            console.log(`[Storage Debug] Index updated:`, newIndex);

            return true;
        } catch (e) {
            console.error("LocalStorage persistence failed (quota exceeded?)", e);
            return false;
        }
    },

    // Get a page of logs (reverse order - newest first)
    getLogs: (sessionUid: string, page: number, pageSize: number): SynthLogItem[] => {
        const indexKey = `${LOG_STORAGE_PREFIX}${sessionUid}_index`;
        const indexStr = localStorage.getItem(indexKey);
        if (!indexStr) return [];

        const { totalCount } = JSON.parse(indexStr);

        // Calculate which logs we need
        // Logs are stored 0..N (oldest to newest)
        // We want newest to oldest: (total - 1) down to 0

        const end = totalCount - ((page - 1) * pageSize);     // Exclusive upper bound index in theoretical array
        const start = Math.max(0, end - pageSize);            // Inclusive lower bound

        if (end <= 0) return [];

        const results: SynthLogItem[] = [];

        // We need logs from index 'start' up to 'end' (exclusive)
        // They are distributed across chunks of size CHUNK_SIZE

        let currentIdx = end - 1;
        while (currentIdx >= start) {
            const chunkId = Math.floor(currentIdx / CHUNK_SIZE);
            const offset = currentIdx % CHUNK_SIZE;

            const chunkKey = `${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${chunkId}`;
            const chunkStr = localStorage.getItem(chunkKey);

            if (chunkStr) {
                const chunk = JSON.parse(chunkStr);
                if (chunk[offset]) {
                    results.push(chunk[offset]);
                }
            }
            currentIdx--;
        }

        // Check if page 1 needs new logs that haven't been saved yet if any (though we save synchronously)
        return results;
    },

    // Update a specific log item (e.g. after retry)
    updateLog: (sessionUid: string, updatedLog: SynthLogItem): boolean => {
        const indexKey = `${LOG_STORAGE_PREFIX}${sessionUid}_index`;
        const indexStr = localStorage.getItem(indexKey);
        if (!indexStr) return false;

        const { lastChunkId } = JSON.parse(indexStr);

        // Search from newest chunk backwards
        for (let chunkId = lastChunkId; chunkId >= 0; chunkId--) {
            const chunkKey = `${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${chunkId}`;
            const chunkStr = localStorage.getItem(chunkKey);
            if (chunkStr) {
                const chunk: SynthLogItem[] = JSON.parse(chunkStr);
                const logIdx = chunk.findIndex(l => l.id === updatedLog.id);
                if (logIdx !== -1) {
                    chunk[logIdx] = updatedLog;
                    localStorage.setItem(chunkKey, JSON.stringify(chunk));
                    return true;
                }
            }
        }
        return false;
    },

    getTotalCount: (sessionUid: string): number => {
        const indexKey = `${LOG_STORAGE_PREFIX}${sessionUid}_index`;
        const indexStr = localStorage.getItem(indexKey);
        if (!indexStr) return 0;
        return JSON.parse(indexStr).totalCount;
    },

    clearSession: (sessionUid: string) => {
        const indexKey = `${LOG_STORAGE_PREFIX}${sessionUid}_index`;
        const indexStr = localStorage.getItem(indexKey);
        if (indexStr) {
            const { lastChunkId } = JSON.parse(indexStr);
            for (let i = 0; i <= lastChunkId; i++) {
                localStorage.removeItem(`${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${i}`);
            }
            localStorage.removeItem(indexKey);
        }
    },

    // Robustly get all logs for export by iterating chunks 
    getAllLogs: (sessionUid: string): SynthLogItem[] => {
        const indexKey = `${LOG_STORAGE_PREFIX}${sessionUid}_index`;
        const indexStr = localStorage.getItem(indexKey);

        console.log(`[Export Debug] Fetching logs for session ${sessionUid}`);
        console.log(`[Export Debug] Index Key: ${indexKey}, Exists: ${!!indexStr}`);

        if (!indexStr) return [];

        const indexData = JSON.parse(indexStr);
        console.log(`[Export Debug] Index Data:`, indexData);

        let lastChunkId = indexData.lastChunkId;
        const totalCount = indexData.totalCount;

        // Fallback if lastChunkId is missing (legacy sessions)
        if (lastChunkId === undefined && totalCount > 0) {
            lastChunkId = Math.floor((totalCount - 1) / CHUNK_SIZE);
            console.log(`[Export Debug] Calculated lastChunkId: ${lastChunkId} from count ${totalCount}`);
        } else if (lastChunkId === undefined) {
            lastChunkId = 0;
            console.log(`[Export Debug] Defaulted lastChunkId to 0`);
        } else {
            console.log(`[Export Debug] Using stored lastChunkId: ${lastChunkId}`);
        }

        let all: SynthLogItem[] = [];

        for (let i = 0; i <= lastChunkId; i++) {
            const chunkKey = `${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${i}`;
            const chunkStr = localStorage.getItem(chunkKey);
            console.log(`[Export Debug] Chunk ${i} (Key: ${chunkKey}): ${chunkStr ? 'FOUND' : 'MISSING'}, Length: ${chunkStr?.length}`);

            if (chunkStr) {
                try {
                    const chunk = JSON.parse(chunkStr);
                    if (Array.isArray(chunk)) {
                        all = all.concat(chunk);
                        console.log(`[Export Debug] Chunk ${i} added ${chunk.length} items. Total: ${all.length}`);
                    } else {
                        console.warn(`[Export Debug] Chunk ${i} is not an array`, chunk);
                    }
                } catch (e) {
                    console.error("Error parsing chunk", i, e);
                }
            }
        }
        console.log(`[Export Debug] Final log count: ${all.length}`);
        return all;
    },

    // For cleaning up old sessions if needed
    getAllSessionUids: (): string[] => {
        return Object.keys(localStorage)
            .filter(k => k.startsWith(LOG_STORAGE_PREFIX) && k.endsWith('_index'))
            .map(k => k.replace(LOG_STORAGE_PREFIX, '').replace('_index', ''));
    }
};
