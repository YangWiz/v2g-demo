// Web worker script
let processing = false;
let fileQueue = [];

importScripts('mdflib.js');

// Function to clean up file from memory after processing
function cleanupFile(filename) {
    try {
        console.log(`Cleaned up file ${filename} from memory`);
    } catch (e) {
        console.error(`Error cleaning up file ${filename}:`, e);
    }
}

async function processFile(file, fileId) {
    try {
        let opfs_root = "/opfs";
        const tempFilename = opfs_root + `/temp_file_${fileId}.mf4`;
        const chunkSize = 32 * 1024; // 32MB chunks
        const fileSize = file.size;
        let offset = 0;

        // Get the append function from our module
        const appendToFile = Module.cwrap("append", "number", ["string", "number", "number"]);

        // TODO(Zhiyang): fix this later because of allocation cost
        const heapPointer = Module._malloc(
            chunkSize * Uint8Array.BYTES_PER_ELEMENT 
        );

        const dirInfo = FS.readdir("/");
        console.log("OPFS directory info:", dirInfo);

        // Process the file in chunks
        while (offset < fileSize) {
            const chunk = file.slice(offset, offset + chunkSize);
            const chunkArrayBuffer = await chunk.arrayBuffer();
            const chunkUint8Array = new Uint8Array(chunkArrayBuffer);

            Module.HEAPU8.set(chunkUint8Array, heapPointer);

            // Use our append function instead of the writable API
            const appendResult = appendToFile(tempFilename, heapPointer, chunkUint8Array.length);

            if (appendResult !== 0) {
                throw new Error(`Failed to append chunk to file. Error code: ${appendResult}`);
            }

            offset += chunkSize;
        }

        Module._free(heapPointer);
        console.log("write file to disk");

        const findUMax = Module.cwrap("findUMax", "number", ["string"]);
        const UMax = findUMax(tempFilename);

        return {
            filename: file.name,
            fileId: fileId,
            umax: UMax
        };
    } catch (error) {
        console.error("Error processing file:", error);
        throw error;
    }
}

// Function to process the next file in queue
function processNextInQueue() {
    if (fileQueue.length === 0 || processing) {
        return;
    }
    
    const { file, fileId } = fileQueue.shift();
    processing = true;
    
    processFile(file, fileId)
        .then(result => {
            // Post message back to main thread with the result
            self.postMessage({
                type: 'fileProcessed',
                fileId: fileId,
                result: result
            });
        })
        .catch(error => {
            // Post error message back to main thread
            self.postMessage({
                type: 'fileProcessError',
                fileId: fileId,
                filename: file.name,
                error: error.toString()
            });
        })
        .finally(() => {
            processing = false;
            // Process next file if any
            processNextInQueue();
        });
}

// Listen for messages from the main thread
self.addEventListener('message', function(e) {
    const data = e.data;
    
    if (data.cmd === 'processFile') {
        // Add to queue
        fileQueue.push({ 
            file: data.file, 
            fileId: data.fileId 
        });
        
        // Try to process next in queue
        processNextInQueue();
    }
});

// Inform main thread that worker is ready
self.postMessage({ type: 'ready' });
