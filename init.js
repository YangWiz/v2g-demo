let worker;
let allChannelNames = [];

// D3.js chart setup - adjust size to be more reasonable
const margin = {top: 30, right: 70, bottom: 50, left: 70};
const width = 800 - margin.left - margin.right;   // reduced width
const height = 400 - margin.top - margin.bottom;  // reduced height

let svg; // Declare svg globally

function initD3() {
    // Make sure the SVG fits within its container
    svg = d3.select("#value-points-chart")
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
}

function renderChart(points, channelName) {
    svg.selectAll("*").remove();
    
    const x = d3.scaleLinear()
        .domain(d3.extent(points, d => d.cycleCount))
        .range([0, width]);
        
    const y = d3.scaleLinear()
        .domain(d3.extent(points, d => d.value))
        .range([height, 0]);
    
    // Add X axis with larger font
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .style("font-size", "12px");
        
    // Add Y axis with larger font
    svg.append("g")
        .call(d3.axisLeft(y))
        .style("font-size", "12px");
    
    // Add line
    const line = d3.line()
        .x(d => x(d.cycleCount))
        .y(d => y(d.value));
    
    svg.append("path")
        .datum(points)
        .attr("fill", "none")
        .attr("stroke", "#003057")
        .attr("stroke-width", 2)
        .attr("d", line);
    
    // Add title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text(channelName);

    // Add horizontal line and value text for mouse tracking
    const mouseLine = svg.append("line")
        .style("stroke", "#003057")
        .style("stroke-width", "1px")
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0);

    const mouseText = svg.append("text")
        .style("opacity", 0)
        .attr("text-anchor", "start")
        .attr("alignment-baseline", "middle");

    // Find closest point function
    function findClosestPoint(mouseY) {
        const yValue = y.invert(mouseY);
        const sortedPoints = [...points].sort((a, b) => 
            Math.abs(a.value - yValue) - Math.abs(b.value - yValue)
        );
        return sortedPoints[0];
    }

    // Add invisible rect for mouse tracking
    svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .on("mouseover", () => {
            mouseLine.style("opacity", 1);
            mouseText.style("opacity", 1);
        })
        .on("mouseout", () => {
            mouseLine.style("opacity", 0);
            mouseText.style("opacity", 0);
        })
        .on("mousemove", (event) => {
            const mouseY = d3.pointer(event)[1];
            const closestPoint = findClosestPoint(mouseY);
            const snappedY = y(closestPoint.value);
            
            mouseLine
                .attr("y1", snappedY)
                .attr("y2", snappedY)
                .attr("x1", 0)
                .attr("x2", width);

            mouseText
                .attr("x", width + 5)
                .attr("y", snappedY)
                .text(Math.round(closestPoint.value));
        });
}

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
        else if (data.type === 'channelNames') {
            allChannelNames = data.channelNames;
            renderChannelList(allChannelNames);
        }
        else if (data.type === 'channelNamesError') {
            const channelList = document.getElementById('channel-list');
            channelList.innerHTML = `<div class="error-message">Error loading channel names: ${data.error}</div>`;
        }
        else if (data.type === 'valuePoints') {
            renderChart(data.points, data.channelName);
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

function renderChannelList(channels) {
    const channelList = document.getElementById('channel-list');
    channelList.innerHTML = '';
    
    const channelGroups = {};
    
    // Group channels by their first character
    channels.forEach(channelName => {
        const firstChar = channelName.charAt(0).toUpperCase();
        if (!channelGroups[firstChar]) {
            channelGroups[firstChar] = [];
        }
        channelGroups[firstChar].push(channelName);
    });
    
    // Create groups
    Object.keys(channelGroups).sort().forEach(group => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'channel-group';
        
        const groupHeader = document.createElement('div');
        groupHeader.className = 'channel-group-header';
        groupHeader.textContent = group;
        groupDiv.appendChild(groupHeader);
        
        channelGroups[group].forEach(channelName => {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';
            
            const icon = document.createElement('i');
            icon.className = 'fas fa-chart-line';
            channelItem.appendChild(icon);
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = channelName;
            channelItem.appendChild(nameSpan);
            
            channelItem.addEventListener('click', () => {
                // Remove active class from all items
                document.querySelectorAll('.channel-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Add active class to clicked item
                channelItem.classList.add('active');
                
                worker.postMessage({
                    cmd: 'getValuePoints',
                    channelName: channelName
                });
            });
            
            groupDiv.appendChild(channelItem);
        });
        
        channelList.appendChild(groupDiv);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initD3(); // Initialize D3 setup
    
    const searchInput = document.getElementById('channel-search');
    
    // Search functionality
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const filteredChannels = allChannelNames.filter(channel => 
            channel.toLowerCase().includes(searchTerm)
        );
        
        renderChannelList(filteredChannels);
    });
});
