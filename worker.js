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

async function getAllChannelNames() {
    try {
        // Get the functions from our module
        const getAllChannelNamesPtr = Module.cwrap('getAllChannelNames', 'number', []);
        const getChannelNamesSize = Module.cwrap('getChannelNamesSize', 'number', []);
        const getChannelNameAt = Module.cwrap('getChannelNameAt', 'number', ['number']);

        // Get the vector pointer
        const vectorPtr = getAllChannelNamesPtr();
        
        if (vectorPtr === -1) {
            throw new Error('Failed to get channel names');
        }

        // Get the size of the vector
        const size = getChannelNamesSize();
        const channelNamesArray = [];

        // Get each string from the vector
        for (let i = 0; i < size; i++) {
            const strPtr = getChannelNameAt(i);
            if (strPtr) {
                const channelName = Module.UTF8ToString(strPtr);
                channelNamesArray.push(channelName);
            }
        }

        return channelNamesArray;
    } catch (error) {
        console.error('Error getting channel names:', error);
        throw error;
    }
}

async function processFile(file, fileId) {
    try {
        const root_path = "/root";
        const tempFilename = root_path + "/temp_file";
        let chunkSize = 0;

        // Get the functions from our module
        const startNewWrite = Module.cwrap("start_new_write", "number", []);
        const appendToFile = Module.cwrap("append", "number", ["number", "number"]);

        // Start new write operation
        const startResult = startNewWrite();
        if (startResult !== 0) {
            throw new Error(`Failed to start new write operation. Error code: ${startResult}`);
        }

        const fileSize = file.size;
        if (fileSize > 1024 * 1024 * 1024) {
            chunkSize = 512 * 1024 * 1024; // 512 MB chunks
        } else {
            chunkSize = fileSize;
        }
        let offset = 0;

        const heapPointer = Module._malloc(
            chunkSize * Uint8Array.BYTES_PER_ELEMENT 
        );

        // Process the file in chunks
        while (offset < fileSize) {
            const chunk = file.slice(offset, offset + chunkSize);
            const chunkArrayBuffer = await chunk.arrayBuffer();
            const chunkUint8Array = new Uint8Array(chunkArrayBuffer);

            Module.HEAPU8.set(chunkUint8Array, heapPointer);

            const appendResult = appendToFile(heapPointer, chunkUint8Array.length);
            if (appendResult !== 0) {
                throw new Error(`Failed to append chunk to file. Error code: ${appendResult}`);
            }

            offset += chunkSize;
        }

        Module._free(heapPointer);
        console.log("write file to disk");

        const findUMax = Module.cwrap("findUMax", "number", []);
        const UMax = findUMax();

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

async function getAllValuePoints(channelName) {
    try {
        const getAllValuePointsPtr = Module.cwrap('getAllValuePoints', 'number', ['string']);
        const getPointsSize = Module.cwrap('getPointsSize', 'number', []);
        const getPointAt = Module.cwrap('getPointAt', 'number', ['number']);
        
        const vectorPtr = getAllValuePointsPtr(channelName);
        
        if (vectorPtr === -1) {
            throw new Error('Failed to get value points');
        }
        
        const size = getPointsSize();
        const points = [];
        
        for (let i = 0; i < size; i++) {
            const pointPtr = Number(getPointAt(i)); // Convert BigInt to Number
            if (pointPtr === 0) continue;
            
            // Read the values as doubles (64-bit floating point)
            const cycleCount = Module.getValue(pointPtr, 'double');
            const value = Module.getValue(pointPtr + 8, 'double'); // 8 bytes offset for the second double
            
            points.push({
                cycleCount: Number(cycleCount), // Ensure we convert to Number
                value: Number(value)
            });
        }
        
        return points;
    } catch (error) {
        console.error('Error getting value points:', error);
        throw error;
    }
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
    else if (data.cmd === 'getChannelNames') {
        getAllChannelNames()
            .then(channelNames => {
                self.postMessage({
                    type: 'channelNames',
                    channelNames: channelNames
                });
            })
            .catch(error => {
                self.postMessage({
                    type: 'channelNamesError',
                    error: error.toString()
                });
            });
    }
    else if (data.cmd === 'getValuePoints') {
        getAllValuePoints(data.channelName)
            .then(points => {
                self.postMessage({
                    type: 'valuePoints',
                    channelName: data.channelName,
                    points: points
                });
            })
            .catch(error => {
                self.postMessage({
                    type: 'valuePointsError',
                    error: error.toString()
                });
            });
    }
});

// Inform main thread that worker is ready
self.postMessage({ type: 'ready' });
