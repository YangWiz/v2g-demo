#include <algorithm>
#include <memory>
#include <optional>

#include "ImportMdf4.h"
#include "mdf4.h"
#include "stdafx.h"
#include <stdio.h>
#include <string>
#include <fcntl.h>


#ifdef EMSCRIPTEN
// Emscripten-specific code goes here
#include <emscripten.h>
#include <emscripten/console.h>
#include <emscripten/wasmfs.h>
#include <emscripten/trace.h>

static backend_t wasmfs_backend;

extern "C" {
    EMSCRIPTEN_KEEPALIVE int main()
    {
        // Initialize wasmfs
        wasmfs_backend = wasmfs_create_opfs_backend();
        const char* rootMount = "/opfs";
        bool exists = access(rootMount, F_OK) == 0;
        if (!exists)
            wasmfs_create_directory(rootMount, 0777, wasmfs_backend);

        // Keep the standard library runtime alive even after exiting main
        emscripten_exit_with_live_runtime();
    }

    EMSCRIPTEN_KEEPALIVE double findUMax(const char* file_path) {
        auto *pImport = new CMdf4FileImport;
        const auto result = new std::vector<double>();

        printf("start reading file");
        if (pImport->ImportFile(file_path)) {
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
    int append(const char* opfs_path, const uint8_t* data, uint32_t size) {
        bool exists = access(opfs_path, F_OK) == 0;
        if (!exists)
            wasmfs_create_file(opfs_path, O_CREAT, wasmfs_backend);

        const auto fp = fopen64(opfs_path, "a+");

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




