#include <algorithm>
#include <memory>
#include <optional>

#include "ImportMdf4.h"
#include "mdf4.h"
#include "stdafx.h"
#include <stdio.h>
#include <string>
#include <fcntl.h>


#define EMSCRIPTEN
#ifdef EMSCRIPTEN

// Emscripten-specific code goes here
#include <emscripten.h>
#include <emscripten/console.h>
#include <emscripten/wasmfs.h>
#include <emscripten/trace.h>

static backend_t wasmfs_backend;
static std::string temp_file_path = "/root/temp_file";
static auto cn_names = new std::vector<std::string>();
static auto points = new std::vector<std::pair<double, double>>();

extern "C" {
    EMSCRIPTEN_KEEPALIVE int main()
    {
        // Initialize wasmfs
#ifdef MEM_FS
        wasmfs_backend = wasmfs_create_memory_backend();
#elif OPFS_FS
        wasmfs_backend = wasmfs_create_opfs_backend()();
#endif
        // We set the memory backend as the default fs.
        wasmfs_backend = wasmfs_create_memory_backend();
        const char* rootMount = "/root";
        bool exists = access(rootMount, F_OK) == 0;
        if (!exists)
            wasmfs_create_directory(rootMount, 0777, wasmfs_backend);

        // Keep the standard library runtime alive even after exiting main
        emscripten_exit_with_live_runtime();
    }

    EMSCRIPTEN_KEEPALIVE uint64_t getAllChannelNames() {
        auto *pImport = new CMdf4FileImport;
        cn_names->clear();

        if (pImport->ImportFile(temp_file_path.c_str())) {
            pImport->getAllChannels(*cn_names);
            pImport->ReleaseFile();
            delete pImport;
            return reinterpret_cast<uint64_t>(cn_names);
        } else {
            delete pImport;
            return -1;
        }
    }

    // Add helper functions to access vector data
    EMSCRIPTEN_KEEPALIVE size_t getChannelNamesSize() {
        return cn_names->size();
    }

    EMSCRIPTEN_KEEPALIVE const char* getChannelNameAt(size_t index) {
        if (index < cn_names->size()) {
            return cn_names->at(index).c_str();
        }
        return nullptr;
    }

    EMSCRIPTEN_KEEPALIVE uint64_t getAllValuePoints(const char* cn_name) {
        auto *pImport = new CMdf4FileImport;
        points->clear();

        if (pImport->ImportFile(temp_file_path.c_str())) {
            pImport->getPointsVecByName(cn_name, *points);
            pImport->ReleaseFile();
            delete pImport;
            return reinterpret_cast<uint64_t>(points);
        } else {
            delete pImport;
            return -1;
        }
    }

    EMSCRIPTEN_KEEPALIVE size_t getPointsSize() {
        return points->size();
    }

    EMSCRIPTEN_KEEPALIVE uint64_t getPointAt(size_t index) {
        if (index < points->size()) {
            return reinterpret_cast<uint64_t>(&points->at(index));
        }
        return 0;
    }

    EMSCRIPTEN_KEEPALIVE double findUMax() {
        auto *pImport = new CMdf4FileImport;
        const auto result = new std::vector<double>();

        if (pImport->ImportFile(temp_file_path.c_str())) {
            pImport->getValueVecByName("EvseUMaxLimGlbICcs", *result);
        } else {
            return -1;
        }

        double max_val = 0.0;  // Default value
        if (!result->empty()) {
            max_val = *std::max_element(result->begin(), result->end());
        }

        pImport->ReleaseFile();
        return max_val;
    }

    EMSCRIPTEN_KEEPALIVE
    int start_new_write() {
        // First try to remove the existing file if it exists
        const bool exists = access(temp_file_path.c_str(), F_OK) == 0;
        if (exists) {
            if (remove(temp_file_path.c_str()) != 0) {
                return -1; // Failed to remove existing file
            }
        }

        // Create a new empty file
        const auto fp = fopen64(temp_file_path.c_str(), "w");
        if (!fp) {
            return -2; // Failed to create new file
        }
        fclose(fp);

        return 0; // Success
    }

    EMSCRIPTEN_KEEPALIVE
    int append(const uint8_t* data, uint32_t size) {
        const bool exists = access(temp_file_path.c_str(), F_OK) == 0;
        if (!exists)
            wasmfs_create_file(temp_file_path.c_str(), O_CREAT, wasmfs_backend);

        const auto fp = fopen64(temp_file_path.c_str(), "a+");

        size_t written = fwrite(data, 1, size, fp);
        fclose(fp);

        if (written != size) {
            return -2; // Error writing complete data
        }

        return 0; // Success
    }
}
#else
    // Native platform code
    int main(int argc, char *argv[]) {
        const std::unique_ptr<CMdf4FileImport> pImport (new CMdf4FileImport);
        if (pImport->ImportFile("../test-large.mf4")) {
            printf("load the mf4 file\n");
        }

        auto result = std::vector<double>();
        pImport->getValueVecByName("EvseUMaxLimGlbICcs", result);

        for (auto val : result) {
            // printf("%f\n", val);
            fflush(stdout);
        }

        double max_val = 0.0;  // Default value
        if (!result.empty()) {
            max_val = *std::max_element(result.begin(), result.end());
        } else {
            printf("\nfailed to add value\n");
        }
        printf("Got max value: %f", max_val);
        pImport->ReleaseFile();
        return 0;
    }

#endif
// #include <emscripten/emscripten.h>




