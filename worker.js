let fr = new FileReader();
let processing = false;
let fileQueue = [];

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
        const tempFilename = `temp_file_${fileId}.mf4`;
        const chunkSize = 32 * 1024 * 1024; // 32MB chunks
        const fileSize = file.size;
        let offset = 0;

        // Get a handle to the file in OPFS
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(tempFilename, { create: true });
        const writable = await fileHandle.createWritable();

        // Process the file in chunks
        while (offset < fileSize) {
            const chunk = file.slice(offset, offset + chunkSize);
            const chunkArrayBuffer = await chunk.arrayBuffer();

            // Write this chunk to the OPFS file
            await writable.write(chunkArrayBuffer);

            offset += chunkSize;
        }

        // Close the file
        await writable.close();

        const findUMax = Module.cwrap("findUMax", "number", ["string"]);
        const UMax = findUMax(tempFilename);

        await root.removeEntry(tempFilename);

        return {
            umax: UMax,
            filename: file.name,
            fileId: fileId
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
            // Dispatch event with the result
            const resultEvent = new CustomEvent('fileProcessed_' + fileId, {
                detail: result
            });
            window.dispatchEvent(resultEvent);
        })
        .catch(error => {
            // Dispatch error event
            const errorEvent = new CustomEvent('fileProcessed_' + fileId, {
                detail: {
                    umax: 'Error',
                    filename: file.name,
                    fileId: fileId,
                    error: error.toString()
                }
            });
            window.dispatchEvent(errorEvent);
        })
        .finally(() => {
            processing = false;
            // Process next file if any
            processNextInQueue();
        });
}

// Listen for file processing requests
window.addEventListener('processFile', function(e) {
    const { file, fileId } = e.detail;
    
    // Add to queue
    fileQueue.push({ file, fileId });
    
    // Try to process next in queue
    processNextInQueue();
});

// For backward compatibility with the original implementation
document.getElementById("file-input").addEventListener("change", function() {
    const files = this.files;
    if (files.length === 1) {
        // Create a processFile event for the single file
        const processEvent = new CustomEvent('processFile', {
            detail: {
                file: files[0],
                fileId: 'single_file'
            }
        });
        
        // Listen for completion
        window.addEventListener('fileProcessed_single_file', function(e) {
            const result = e.detail;
            if (window.onUMaxResult) {
                window.onUMaxResult(result.umax);
            }
        }, { once: true });
        
        // Dispatch event to start processing
        window.dispatchEvent(processEvent);
    }
});


