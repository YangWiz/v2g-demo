#include <algorithm>
#include <memory>
#include <optional>

#include "ImportMdf4.h"
#include "mdf4.h"
#include "stdafx.h"
#include <stdio.h>
#include <string>

#define EMSCRIPTEN

#ifdef EMSCRIPTEN
    // Emscripten-specific code goes here
    #include <emscripten.h>
    #include <emscripten/console.h>
    #include <emscripten/wasmfs.h>

    extern "C" {
        EMSCRIPTEN_KEEPALIVE
        double findUMax(const char* file_path) {
            auto *pImport = new CMdf4FileImport;
            auto result = std::vector<double>();

            if (pImport->ImportFile(file_path)) {
                pImport->getValueVecByName("EvseUMaxLimGlbICcs", result);
            } else {
                return -1;
            }

            double max_val = 0.0;  // Default value
            if (!result.empty()) {
                max_val = *std::max_element(result.begin(), result.end());
            }

            pImport->ReleaseFile();
            return max_val;
        }

        EMSCRIPTEN_KEEPALIVE
        int initOpfs(const char* opfs_path) {
            // This function only needs to be called once.
            backend_t opfs = wasmfs_create_opfs_backend();

            int err = wasmfs_create_directory(opfs_path, 0777, opfs);

            return err;
        }

        int append(const char* opfs_path, const uint8_t* data, uint32_t size) {
            auto file = fopen64(opfs_path, "a");
            if (!file) {
                return -1; // Error opening file
            }

            size_t written = fwrite(data, 1, size, file);
            fclose(file);

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
            printf("%f\n", val);
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




