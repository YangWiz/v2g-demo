cmake_minimum_required(VERSION 3.30)
project(mdflib)

set(CMAKE_CXX_STANDARD 14)

# Add Emscripten-specific settings
if(EMSCRIPTEN)
    # Export the functions you want to call from JavaScript
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s EXPORTED_FUNCTIONS='[\"_findUMax\"]' \
    -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s FORCE_FILESYSTEM=1 \
    -s SINGLE_FILE=1 \
    -O3")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} --llvm-lto 1")

    # Optional: If you're building a library rather than a standalone application
    # set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s MODULARIZE=1 -s EXPORT_NAME='MdfLib'")
endif()

add_executable(
    mdflib export.cpp
    mdFile.cpp
    stdafx.cpp
    ImportMdf4.cpp
    md5.cpp
    mdf4.cpp
)
