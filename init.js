let worker;

function initWorker() {
    // Create a new worker
    worker = new Worker('worker.js');
    
    // Listen for messages from the worker
    worker.addEventListener('message', function(e) {
        const data = e.data;
        
        if (data.type === 'ready') {
            console.log('Worker is ready');
        } 
        else if (data.type === 'fileProcessed') {
            // Create and dispatch an event with the result for backward compatibility
            const resultEvent = new CustomEvent('fileProcessed_' + data.fileId, {
                detail: data.result
            });
            window.dispatchEvent(resultEvent);
            
            if (data.fileId === 'single_file' && window.onUMaxResult) {
                window.onUMaxResult(data.result.umax);
            }
        }
        else if (data.type === 'fileProcessError') {
            // Create and dispatch an error event
            const errorEvent = new CustomEvent('fileProcessed_' + data.fileId, {
                detail: {
                    umax: 'Error',
                    filename: data.filename,
                    fileId: data.fileId,
                    error: data.error
                }
            });
            window.dispatchEvent(errorEvent);
        }
    });
    
    // Handle errors from the worker
    worker.addEventListener('error', function(e) {
        console.error('Worker error:', e);
    });
}

// Initialize the worker when the page loads
initWorker();

// Handle file processing requests from the old event-based API
window.addEventListener('processFile', function(e) {
    const { file, fileId } = e.detail;
    
    // Send the file to the worker
    worker.postMessage({
        cmd: 'processFile',
        file: file,
        fileId: fileId
    });
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
        
        // Dispatch event to start processing
        window.dispatchEvent(processEvent);
    }
});
