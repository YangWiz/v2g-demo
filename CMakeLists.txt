cmake_minimum_required(VERSION 3.30)
project(mdflib)

set(CMAKE_CXX_STANDARD 14)

# Define source file locations (assuming they are in the same dir as this CMakeLists.txt)
# NOTE: This assumes index.html and worker.js are located alongside this CMakeLists.txt
set(INDEX_HTML_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/index.html")
set(WORKER_JS_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/worker.js")

if(EMSCRIPTEN)
    # --- Emscripten Specific Flags ---
    # Compiler flags (Optimization, Warnings, Language Standard etc.)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3") # Keep -O3 here

    # Linker flags (Emscripten settings -s*)
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} \
        -s EXPORTED_FUNCTIONS='[\"_findUMax\",\"_append\",\"_malloc\", \"_free\"]' \
        -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\"]' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s FORCE_FILESYSTEM=1 \
        -s SINGLE_FILE=1 \
        -s WASMFS=1 \
        -O3") # -O3 often needed at link time too for LTO

    # Optional: If you're building a library rather than a standalone application
    # set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s MODULARIZE=1 -s EXPORT_NAME='MdfLib'") # If modularizing, this might need linker flags too
    # --- End Emscripten Specific Flags ---
endif() # End if(EMSCRIPTEN) for flags

# --- Define the Executable Target ---
# This MUST come BEFORE any add_custom_command referencing it
add_executable(
        mdflib export.cpp
        mdFile.cpp
        stdafx.cpp
        ImportMdf4.cpp
        md5.cpp
        mdf4.cpp
)
# --- End Target Definition ---


# --- Add Post-Build Step for Web Assets (Only for Emscripten builds) ---
# This MUST come AFTER add_executable(mdflib)
if(EMSCRIPTEN)
    if(EXISTS ${INDEX_HTML_SOURCE} AND EXISTS ${WORKER_JS_SOURCE})
        message(STATUS "Found web assets to copy: ${INDEX_HTML_SOURCE}, ${WORKER_JS_SOURCE}")

        add_custom_command(
                TARGET mdflib  # The target this command runs after
                POST_BUILD     # Specifies to run after the target is built

                # Command to copy index.html
                COMMAND ${CMAKE_COMMAND} -E copy
                "${INDEX_HTML_SOURCE}"
                "${CMAKE_CURRENT_BINARY_DIR}/index.html"

                # Command to copy worker.js
                COMMAND ${CMAKE_COMMAND} -E copy
                "${WORKER_JS_SOURCE}"
                "${CMAKE_CURRENT_BINARY_DIR}/worker.js"

                # Optional: A comment displayed during the build
                COMMENT "Copying index.html and worker.js to build directory (${CMAKE_CURRENT_BINARY_DIR})"
                VERBATIM # Ensures arguments are passed correctly
        )
    else()
        # Corrected Warning Message: Refers to CMAKE_CURRENT_SOURCE_DIR now
        message(WARNING "Could not find index.html or worker.js in the current directory (${CMAKE_CURRENT_SOURCE_DIR}). Skipping copy step.")
    endif() # End if(EXISTS...)
endif() # End if(EMSCRIPTEN) for custom command
# --- End Post-Build Step ---