// include: shell.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module != 'undefined' ? Module : {};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = typeof window == 'object';
var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != 'undefined';
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = typeof process == 'object' && typeof process.versions == 'object' && typeof process.versions.node == 'string' && process.type != 'renderer';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -sPROXY_TO_WORKER) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

// The way we signal to a worker that it is hosting a pthread is to construct
// it with a specific name.
var ENVIRONMENT_IS_PTHREAD = ENVIRONMENT_IS_WORKER && self.name?.startsWith('em-pthread');

if (ENVIRONMENT_IS_NODE) {

  var worker_threads = require('worker_threads');
  global.Worker = worker_threads.Worker;
  ENVIRONMENT_IS_WORKER = !worker_threads.isMainThread;
  // Under node we set `workerData` to `em-pthread` to signal that the worker
  // is hosting a pthread.
  ENVIRONMENT_IS_PTHREAD = ENVIRONMENT_IS_WORKER && worker_threads['workerData'] == 'em-pthread'
}

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {...Module};

var arguments_ = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// In MODULARIZE mode _scriptName needs to be captured already at the very top of the page immediately when the page is parsed, so it is generated there
// before the page load. In non-MODULARIZE modes generate it here.
var _scriptName = (typeof document != 'undefined') ? document.currentScript?.src : undefined;

if (ENVIRONMENT_IS_NODE) {
  _scriptName = __filename;
} else
if (ENVIRONMENT_IS_WORKER) {
  _scriptName = self.location.href;
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {
  if (typeof process == 'undefined' || !process.release || process.release.name !== 'node') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  var nodeVersion = process.versions.node;
  var numericVersion = nodeVersion.split('.').slice(0, 3);
  numericVersion = (numericVersion[0] * 10000) + (numericVersion[1] * 100) + (numericVersion[2].split('-')[0] * 1);
  var minVersion = 160400;
  if (numericVersion < 160400) {
    throw new Error('This emscripten-generated code requires node v16.04.4.0 (detected v' + nodeVersion + ')');
  }

  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('fs');
  var nodePath = require('path');

  scriptDirectory = __dirname + '/';

// include: node_shell_read.js
readBinary = (filename) => {
  // We need to re-wrap `file://` strings to URLs.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename);
  assert(Buffer.isBuffer(ret));
  return ret;
};

readAsync = async (filename, binary = true) => {
  // See the comment in the `readBinary` function.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename, binary ? undefined : 'utf8');
  assert(binary ? Buffer.isBuffer(ret) : typeof ret == 'string');
  return ret;
};
// end include: node_shell_read.js
  if (!Module['thisProgram'] && process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  arguments_ = process.argv.slice(2);

  if (typeof module != 'undefined') {
    module['exports'] = Module;
  }

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

} else
if (ENVIRONMENT_IS_SHELL) {

  if ((typeof process == 'object' && typeof require === 'function') || typeof window == 'object' || typeof WorkerGlobalScope != 'undefined') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (typeof document != 'undefined' && document.currentScript) { // web
    scriptDirectory = document.currentScript.src;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  // If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
  // they are removed because they could contain a slash.
  if (scriptDirectory.startsWith('blob:')) {
    scriptDirectory = '';
  } else {
    scriptDirectory = scriptDirectory.slice(0, scriptDirectory.replace(/[?#].*/, '').lastIndexOf('/')+1);
  }

  if (!(typeof window == 'object' || typeof WorkerGlobalScope != 'undefined')) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  // Differentiate the Web Worker from the Node Worker case, as reading must
  // be done differently.
  if (!ENVIRONMENT_IS_NODE)
  {
// include: web_or_worker_shell_read.js
if (ENVIRONMENT_IS_WORKER) {
    readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
    };
  }

  readAsync = async (url) => {
    // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
    // See https://github.com/github/fetch/pull/92#issuecomment-140665932
    // Cordova or Electron apps are typically loaded from a file:// url.
    // So use XHR on webview if URL is a file URL.
    if (isFileURI(url)) {
      return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
            resolve(xhr.response);
            return;
          }
          reject(xhr.status);
        };
        xhr.onerror = reject;
        xhr.send(null);
      });
    }
    var response = await fetch(url, { credentials: 'same-origin' });
    if (response.ok) {
      return response.arrayBuffer();
    }
    throw new Error(response.status + ' : ' + response.url);
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
  throw new Error('environment detection error');
}

// Set up the out() and err() hooks, which are how we can print to stdout or
// stderr, respectively.
// Normally just binding console.log/console.error here works fine, but
// under node (with workers) we see missing/out-of-order messages so route
// directly to stdout and stderr.
// See https://github.com/emscripten-core/emscripten/issues/14804
var defaultPrint = console.log.bind(console);
var defaultPrintErr = console.error.bind(console);
if (ENVIRONMENT_IS_NODE) {
  defaultPrint = (...args) => fs.writeSync(1, args.join(' ') + '\n');
  defaultPrintErr = (...args) => fs.writeSync(2, args.join(' ') + '\n');
}
var out = Module['print'] || defaultPrint;
var err = Module['printErr'] || defaultPrintErr;

// Merge back in the overrides
Object.assign(Module, moduleOverrides);
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used.
moduleOverrides = null;
checkIncomingModuleAPI();

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.

if (Module['arguments']) arguments_ = Module['arguments'];legacyModuleProp('arguments', 'arguments_');

if (Module['thisProgram']) thisProgram = Module['thisProgram'];legacyModuleProp('thisProgram', 'thisProgram');

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
// Assertions on removed incoming Module JS APIs.
assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['read'] == 'undefined', 'Module.read option was removed');
assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
legacyModuleProp('asm', 'wasmExports');
legacyModuleProp('readAsync', 'readAsync');
legacyModuleProp('readBinary', 'readBinary');
legacyModuleProp('setWindowTitle', 'setWindowTitle');
var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

assert(
  ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER || ENVIRONMENT_IS_NODE, 'Pthreads do not work in this environment yet (need Web Workers, or an alternative to them)');

assert(!ENVIRONMENT_IS_SHELL, 'shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.');

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary = Module['wasmBinary'];legacyModuleProp('wasmBinary', 'wasmBinary');

if (typeof WebAssembly != 'object') {
  err('no native wasm support detected');
}

// Wasm globals

var wasmMemory;

// For sending to workers.
var wasmModule;

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.

// Memory management

var HEAP,
/** @type {!Int8Array} */
  HEAP8,
/** @type {!Uint8Array} */
  HEAPU8,
/** @type {!Int16Array} */
  HEAP16,
/** @type {!Uint16Array} */
  HEAPU16,
/** @type {!Int32Array} */
  HEAP32,
/** @type {!Uint32Array} */
  HEAPU32,
/** @type {!Float32Array} */
  HEAPF32,
/* BigInt64Array type is not correctly defined in closure
/** not-@type {!BigInt64Array} */
  HEAP64,
/* BigUint64Array type is not correctly defined in closure
/** not-t@type {!BigUint64Array} */
  HEAPU64,
/** @type {!Float64Array} */
  HEAPF64;

var runtimeInitialized = false;

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');

// include: runtime_shared.js
// include: runtime_stack_check.js
// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max)>>2)] = 0x02135467;
  HEAPU32[(((max)+(4))>>2)] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  HEAPU32[((0)>>2)] = 1668509029;
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var cookie1 = HEAPU32[((max)>>2)];
  var cookie2 = HEAPU32[(((max)+(4))>>2)];
  if (cookie1 != 0x02135467 || cookie2 != 0x89BACDFE) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0)>>2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
// include: runtime_exceptions.js
// end include: runtime_exceptions.js
// include: runtime_debug.js
// Endianness check
(() => {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) throw 'Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)';
})();

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
}

function legacyModuleProp(prop, newName, incoming=true) {
  if (!Object.getOwnPropertyDescriptor(Module, prop)) {
    Object.defineProperty(Module, prop, {
      configurable: true,
      get() {
        let extra = incoming ? ' (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)' : '';
        abort(`\`Module.${prop}\` has been replaced by \`${newName}\`` + extra);

      }
    });
  }
}

function consumedModuleProp(prop) {
  if (!Object.getOwnPropertyDescriptor(Module, prop)) {
    Object.defineProperty(Module, prop, {
      configurable: true,
      set() {
        abort(`Attempt to set \`Module.${prop}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`);

      }
    });
  }
}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
         name === 'FS_createDataFile' ||
         name === 'FS_createPreloadedFile' ||
         name === 'FS_unlink' ||
         name === 'addRunDependency' ||
         name === 'removeRunDependency';
}

/**
 * Intercept access to a global symbol.  This enables us to give informative
 * warnings/errors when folks attempt to use symbols they did not include in
 * their build, or no symbols that no longer exist.
 */
function hookGlobalSymbolAccess(sym, func) {
  if (typeof globalThis != 'undefined' && !Object.getOwnPropertyDescriptor(globalThis, sym)) {
    Object.defineProperty(globalThis, sym, {
      configurable: true,
      get() {
        func();
        return undefined;
      }
    });
  }
}

function missingGlobal(sym, msg) {
  hookGlobalSymbolAccess(sym, () => {
    warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`);
  });
}

missingGlobal('buffer', 'Please use HEAP8.buffer or wasmMemory.buffer');
missingGlobal('asm', 'Please use wasmExports instead');

function missingLibrarySymbol(sym) {
  hookGlobalSymbolAccess(sym, () => {
    // Can't `abort()` here because it would break code that does runtime
    // checks.  e.g. `if (typeof SDL === 'undefined')`.
    var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
    // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
    // library.js, which means $name for a JS name with no prefix, or name
    // for a JS name like _name.
    var librarySymbol = sym;
    if (!librarySymbol.startsWith('_')) {
      librarySymbol = '$' + sym;
    }
    msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
    if (isExportedByForceFilesystem(sym)) {
      msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
    }
    warnOnce(msg);
  });

  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (ENVIRONMENT_IS_PTHREAD) {
    return;
  }
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      }
    });
  }
}

var runtimeDebug = true; // Switch to false at runtime to disable logging at the right times

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  if (!runtimeDebug && typeof runtimeDebug != 'undefined') return;
  // Avoid using the console for debugging in multi-threaded node applications
  // See https://github.com/emscripten-core/emscripten/issues/14804
  if (ENVIRONMENT_IS_NODE && fs) {
    fs.writeSync(2, args.join(' ') + '\n');
  } else
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}
// end include: runtime_debug.js
// include: memoryprofiler.js
var emscriptenMemoryProfiler = {
  // If true, walks all allocated pointers at graphing time to print a detailed
  // memory fragmentation map. If false, used memory is only graphed in one
  // block (at the bottom of DYNAMIC memory space). Set this to false to improve
  // performance at the expense of accuracy.
  detailedHeapUsage: true,

  // Allocations of memory blocks larger than this threshold will get their
  // detailed callstack captured and logged at runtime.
  trackedCallstackMinSizeBytes: (typeof new Error().stack == 'undefined') ? Infinity : 16*1024*1024,

  // Allocations from call sites having more than this many outstanding
  // allocated pointers will get their detailed callstack captured and logged at
  // runtime.
  trackedCallstackMinAllocCount: (typeof new Error().stack == 'undefined') ? Infinity : 10000,

  // If true, we hook into stackAlloc to be able to catch better estimate of the
  // maximum used STACK space.  You might only ever want to set this to false
  // for performance reasons. Since stack allocations may occur often, this
  // might impact performance.
  hookStackAlloc: true,

  // How often the log page is refreshed.
  uiUpdateIntervalMsecs: 2000,

  // Tracks data for the allocation statistics.
  allocationsAtLoc: {},
  allocationSitePtrs: {},

  // Stores an associative array of records HEAP ptr -> size so that we can
  // retrieve how much memory was freed in calls to _free() and decrement the
  // tracked usage accordingly.
  // E.g. sizeOfAllocatedPtr[address] returns the size of the heap pointer
  // starting at 'address'.
  sizeOfAllocatedPtr: {},

  // Conceptually same as the above array, except this one tracks only pointers
  // that were allocated during the application preRun step, which corresponds
  // to the data added to the VFS with --preload-file.
  sizeOfPreRunAllocatedPtr: {},

  resizeMemorySources: [],
    // stack: <string>,
    // begin: <int>,
    // end: <int>

  sbrkSources: [],
    // stack: <string>,
    // begin: <int>,
    // end: <int>

  // Once set to true, preRun is finished and the above array is not touched anymore.
  pagePreRunIsFinished: false,

  // Grand total of memory currently allocated via malloc(). Decremented on free()s.
  totalMemoryAllocated: 0,

  // The running count of the number of times malloc() and free() have been
  // called in the app. Used to keep track of # of currently alive pointers.
  // TODO: Perhaps in the future give a statistic of allocations per second to
  // see how trashing memory usage is.
  totalTimesMallocCalled: 0,
  totalTimesFreeCalled: 0,

  // Tracks the highest seen location of the stack pointer.
  stackTopWatermark: Infinity,

  // The canvas DOM element to which to draw the allocation map.
  canvas: null,

  // The 2D drawing context on the canvas.
  drawContext: null,

  // Converts number f to string with at most two decimals, without redundant trailing zeros.
  truncDec(f = 0) {
    var str = f.toFixed(2);
    if (str.includes('.00', str.length-3)) return str.slice(0, -3);
    else if (str.includes('0', str.length-1)) return str.slice(0, -1);
    else return str;
  },

  // Converts a number of bytes pretty-formatted as a string.
  formatBytes(bytes) {
    if (bytes >= 1000*1024*1024) return emscriptenMemoryProfiler.truncDec(bytes/(1024*1024*1024)) + ' GB';
    else if (bytes >= 1000*1024) return emscriptenMemoryProfiler.truncDec(bytes/(1024*1024)) + ' MB';
    else if (bytes >= 1000) return emscriptenMemoryProfiler.truncDec(bytes/1024) + ' KB';
    else return emscriptenMemoryProfiler.truncDec(bytes) + ' B';
  },

  // HSV values in [0..1[, returns a RGB string in format '#rrggbb'
  hsvToRgb(h, s, v) {
    var h_i = (h*6)|0;
    var f = h*6 - h_i;
    var p = v * (1 - s);
    var q = v * (1 - f*s);
    var t = v * (1 - (1 - f) * s);
    var r, g, b;
    switch (h_i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    function toHex(v) {
      v = (v*255|0).toString(16);
      return (v.length == 1) ? '0' + v : v;
    }
    return '#' + toHex(r) + toHex(g) + toHex(b);
  },

  onSbrkGrow(oldLimit, newLimit) {
    var self = emscriptenMemoryProfiler;
    // On first sbrk(), account for the initial size.
    if (self.sbrkSources.length == 0) {
      self.sbrkSources.push({
        stack: "initial heap sbrk limit<br>",
        begin: 0,
        end: oldLimit,
        color: self.hsvToRgb(self.sbrkSources.length * 0.618033988749895 % 1, 0.5, 0.95)
      });
    }
    if (newLimit <= oldLimit) return;
    self.sbrkSources.push({
      stack: self.filterCallstackForHeapResize(new Error().stack.toString()),
      begin: oldLimit,
      end: newLimit,
      color: self.hsvToRgb(self.sbrkSources.length * 0.618033988749895 % 1, 0.5, 0.95)
    });
  },

  onMemoryResize(oldSize, newSize) {
    var self = emscriptenMemoryProfiler;
    // On first heap resize, account for the initial size.
    if (self.resizeMemorySources.length == 0) {
      self.resizeMemorySources.push({
        stack: "initial heap size<br>",
        begin: 0,
        end: oldSize,
        color: self.resizeMemorySources.length % 2 ? '#ff00ff' : '#ff80ff'
      });
    }
    if (newSize <= oldSize) return;
    self.resizeMemorySources.push({
      stack: self.filterCallstackForHeapResize(new Error().stack.toString()),
      begin: oldSize,
      end: newSize,
      color: self.resizeMemorySources.length % 2 ? '#ff00ff' : '#ff80ff'
    });
    console.log('memory resize: ' + oldSize + ' ' + newSize);
  },

  recordStackWatermark() {
    if (typeof runtimeInitialized == 'undefined' || runtimeInitialized) {
      var self = emscriptenMemoryProfiler;
      self.stackTopWatermark = Math.min(self.stackTopWatermark, _emscripten_stack_get_current());
    }
  },

  onMalloc(ptr, size) {
    if (!ptr) return;
    if (emscriptenMemoryProfiler.sizeOfAllocatedPtr[ptr])
    {
// Uncomment to debug internal workings of tracing:
//      console.error('Allocation error in onMalloc! Pointer ' + ptr + ' had already been tracked as allocated!');
//      console.error('Previous site of allocation: ' + emscriptenMemoryProfiler.allocationSitePtrs[ptr]);
//      console.error('This doubly attempted site of allocation: ' + new Error().stack.toString());
//      throw 'malloc internal inconsistency!';
      return;
    }
    var self = emscriptenMemoryProfiler;
    // Gather global stats.
    self.totalMemoryAllocated += size;
    ++self.totalTimesMallocCalled;

    self.recordStackWatermark();

    // Remember the size of the allocated block to know how much will be _free()d later.
    self.sizeOfAllocatedPtr[ptr] = size;
    // Also track if this was a _malloc performed at preRun time.
    if (!self.pagePreRunIsFinished) self.sizeOfPreRunAllocatedPtr[ptr] = size;

    var loc = new Error().stack.toString();
    self.allocationsAtLoc[loc] ||= [0, 0, self.filterCallstackForMalloc(loc)];
    self.allocationsAtLoc[loc][0] += 1;
    self.allocationsAtLoc[loc][1] += size;
    self.allocationSitePtrs[ptr] = loc;
  },

  onFree(ptr) {
    if (!ptr) return;

    var self = emscriptenMemoryProfiler;

    // Decrement global stats.
    var sz = self.sizeOfAllocatedPtr[ptr];
    if (!isNaN(sz)) self.totalMemoryAllocated -= sz;
    else
    {
// Uncomment to debug internal workings of tracing:
//      console.error('Detected double free of pointer ' + ptr + ' at location:\n'+ new Error().stack.toString());
//      throw 'double free!';
      return;
    }

    self.recordStackWatermark();

    var loc = self.allocationSitePtrs[ptr];
    if (loc) {
      var allocsAtThisLoc = self.allocationsAtLoc[loc];
      if (allocsAtThisLoc) {
        allocsAtThisLoc[0] -= 1;
        allocsAtThisLoc[1] -= sz;
        if (allocsAtThisLoc[0] <= 0) delete self.allocationsAtLoc[loc];
      }
    }
    delete self.allocationSitePtrs[ptr];
    delete self.sizeOfAllocatedPtr[ptr];
    delete self.sizeOfPreRunAllocatedPtr[ptr]; // Also free if this happened to be a _malloc performed at preRun time.
    ++self.totalTimesFreeCalled;
  },

  onRealloc(oldAddress, newAddress, size) {
    emscriptenMemoryProfiler.onFree(oldAddress);
    emscriptenMemoryProfiler.onMalloc(newAddress, size);
  },

  onPreloadComplete() {
    emscriptenMemoryProfiler.pagePreRunIsFinished = true;
  },

  // Installs startup hook and periodic UI update timer.
  initialize() {
    // Inject the memoryprofiler hooks.
    Module['onMalloc'] = (ptr, size) => emscriptenMemoryProfiler.onMalloc(ptr, size);
    Module['onRealloc'] = (oldAddress, newAddress, size) => emscriptenMemoryProfiler.onRealloc(oldAddress, newAddress, size);;
    Module['onFree'] = (ptr) => emscriptenMemoryProfiler.onFree(ptr);
    emscriptenMemoryProfiler.recordStackWatermark();

    // Add a tracking mechanism to detect when VFS loading is complete.
    Module['preRun'] ||= [];
    Module['preRun'].push(emscriptenMemoryProfiler.onPreloadComplete);

    if (emscriptenMemoryProfiler.hookStackAlloc && typeof stackAlloc == 'function') {
      // Inject stack allocator.
      var prevStackAlloc = stackAlloc;
      var hookedStackAlloc = (size) => {
        var ptr = prevStackAlloc(size);
        emscriptenMemoryProfiler.recordStackWatermark();
        return ptr;
      };
      stackAlloc = hookedStackAlloc;
    }

    if (location.search.toLowerCase().includes('trackbytes=')) {
      emscriptenMemoryProfiler.trackedCallstackMinSizeBytes = parseInt(location.search.slice(location.search.toLowerCase().indexOf('trackbytes=') + 'trackbytes='.length), undefined /* https://github.com/google/closure-compiler/issues/3230 / https://github.com/google/closure-compiler/issues/3548 */);
    }
    if (location.search.toLowerCase().includes('trackcount=')) {
      emscriptenMemoryProfiler.trackedCallstackMinAllocCount = parseInt(location.search.slice(location.search.toLowerCase().indexOf('trackcount=') + 'trackcount='.length), undefined);
    }

    emscriptenMemoryProfiler.memoryprofiler_summary = document.getElementById('memoryprofiler_summary');
    var div;
    if (!emscriptenMemoryProfiler.memoryprofiler_summary) {
      div = document.createElement("div");
      div.innerHTML = "<div style='border: 2px solid black; padding: 2px;'><canvas style='border: 1px solid black; margin-left: auto; margin-right: auto; display: block;' id='memoryprofiler_canvas' width='100%' height='50'></canvas><input type='checkbox' id='showHeapResizes' onclick='emscriptenMemoryProfiler.updateUi()'>Display heap and sbrk() resizes. Filter sbrk() and heap resize callstacks by keywords: <input type='text' id='sbrkFilter'>(reopen page with ?sbrkFilter=foo,bar query params to prepopulate this list)<br/>Track all allocation sites larger than <input id='memoryprofiler_min_tracked_alloc_size' type=number value="+emscriptenMemoryProfiler.trackedCallstackMinSizeBytes+"></input> bytes, and all allocation sites with more than <input id='memoryprofiler_min_tracked_alloc_count' type=number value="+emscriptenMemoryProfiler.trackedCallstackMinAllocCount+"></input> outstanding allocations. (visit this page via URL query params foo.html?trackbytes=1000&trackcount=100 to apply custom thresholds starting from page load)<br/><div id='memoryprofiler_summary'></div><input id='memoryprofiler_clear_alloc_stats' type='button' value='Clear alloc stats' ></input><br />Sort allocations by:<select id='memoryProfilerSort'><option value='bytes'>Bytes</option><option value='count'>Count</option><option value='fixed'>Fixed</option></select><div id='memoryprofiler_ptrs'></div>";
    }
    var populateHtmlBody = function() {
      if (div) {
        document.body.appendChild(div);

        function getValueOfParam(key) {
          var results = (new RegExp("[\\?&]"+key+"=([^&#]*)")).exec(location.href);
          return results ? results[1] : '';
        }
        // Allow specifying a precreated filter in page URL ?query parameters for convenience.
        if (document.getElementById('sbrkFilter').value = getValueOfParam('sbrkFilter')) {
          document.getElementById('showHeapResizes').checked = true;
        }
      }
      var self = emscriptenMemoryProfiler;
      self.memoryprofiler_summary = document.getElementById('memoryprofiler_summary');
      self.memoryprofiler_ptrs = document.getElementById('memoryprofiler_ptrs');

      document.getElementById('memoryprofiler_min_tracked_alloc_size').addEventListener("change", function(e) { self.trackedCallstackMinSizeBytes=parseInt(this.value, undefined /* https://github.com/google/closure-compiler/issues/3230 / https://github.com/google/closure-compiler/issues/3548 */); });
      document.getElementById('memoryprofiler_min_tracked_alloc_count').addEventListener("change", function(e) { self.trackedCallstackMinAllocCount=parseInt(this.value, undefined); });
      document.getElementById('memoryprofiler_clear_alloc_stats').addEventListener("click", (e) => {self.allocationsAtLoc = {}; self.allocationSitePtrs = {};});
      self.canvas = document.getElementById('memoryprofiler_canvas');
      self.canvas.width = document.documentElement.clientWidth - 32;
      self.drawContext = self.canvas.getContext('2d');

      self.updateUi();
      setInterval(() => emscriptenMemoryProfiler.updateUi(), self.uiUpdateIntervalMsecs);

    };
    // User might initialize memoryprofiler in the <head> of a page, when
    // document.body does not yet exist. In that case, delay initialization
    // of the memoryprofiler UI until page has loaded
    if (document.body) populateHtmlBody();
    else setTimeout(populateHtmlBody, 1000);
  },

  // Given a pointer 'bytes', compute the linear 1D position on the graph as
  // pixels, rounding down for start address of a block.
  bytesToPixelsRoundedDown(bytes) {
    return (bytes * emscriptenMemoryProfiler.canvas.width * emscriptenMemoryProfiler.canvas.height / HEAP8.length) | 0;
  },

  // Same as bytesToPixelsRoundedDown, but rounds up for the end address of a
  // block. The different rounding will guarantee that even 'thin' allocations
  // should get at least one pixel dot in the graph.
  bytesToPixelsRoundedUp(bytes) {
    return ((bytes * emscriptenMemoryProfiler.canvas.width * emscriptenMemoryProfiler.canvas.height + HEAP8.length - 1) / HEAP8.length) | 0;
  },

  // Graphs a range of allocated memory. The memory range will be drawn as a
  // top-to-bottom, left-to-right stripes or columns of pixels.
  fillLine(startBytes, endBytes) {
    var self = emscriptenMemoryProfiler;
    var startPixels = self.bytesToPixelsRoundedDown(startBytes);
    var endPixels = self.bytesToPixelsRoundedUp(endBytes);

    // Starting pos (top-left corner) of this allocation on the graph.
    var x0 = (startPixels / self.canvas.height) | 0;
    var y0 = startPixels - x0 * self.canvas.height;
    // Ending pos (bottom-right corner) of this allocation on the graph.
    var x1 = (endPixels / self.canvas.height) | 0;
    var y1 = endPixels - x1 * self.canvas.height;

    // Draw the left side partial column of the allocation block.
    if (y0 > 0 && x0 < x1) {
      self.drawContext.fillRect(x0, y0, 1, self.canvas.height - y0);
      // Proceed to the start of the next full column.
      y0 = 0;
      ++x0;
    }
    // Draw the right side partial column.
    if (y1 < self.canvas.height && x0 < x1) {
      self.drawContext.fillRect(x1, 0, 1, y1);
      // Decrement to the previous full column.
      y1 = self.canvas.height - 1;
      --x1;
    }
    // After filling the previous leftovers with one-pixel-wide lines, we are
    // only left with a rectangular shape of full columns to blit.
    self.drawContext.fillRect(x0, 0, x1 - x0 + 1, self.canvas.height);
  },

  // Fills a rectangle of given height % that overlaps the byte range given.
  fillRect(startBytes, endBytes, heightPercentage) {
    var self = emscriptenMemoryProfiler;
    var startPixels = self.bytesToPixelsRoundedDown(startBytes);
    var endPixels = self.bytesToPixelsRoundedUp(endBytes);

    var x0 = (startPixels / self.canvas.height) | 0;
    var x1 = (endPixels / self.canvas.height) | 0;
    self.drawContext.fillRect(x0, self.canvas.height * (1.0 - heightPercentage), x1 - x0 + 1, self.canvas.height);
  },

  countOpenALAudioDataSize() {
    if (typeof AL == 'undefined' || !AL.currentContext) return 0;

    var totalMemory = 0;

    for (var i in AL.currentContext.buf) {
      var buffer = AL.currentContext.buf[i];
      for (var channel = 0; channel < buffer.numberOfChannels; ++channel) totalMemory += buffer.getChannelData(channel).length * 4;
    }
    return totalMemory;
  },

  // Print accurate map of individual allocations. This will show information about
  // memory fragmentation and allocation sizes.
  // Warning: This will walk through all allocations, so it is slow!
  printAllocsWithCyclingColors(colors, allocs) {
    var colorIndex = 0;
    for (var i in allocs) {
      emscriptenMemoryProfiler.drawContext.fillStyle = colors[colorIndex];
      colorIndex = (colorIndex + 1) % colors.length;
      var start = i|0;
      var sz = allocs[start]|0;
      emscriptenMemoryProfiler.fillLine(start, start + sz);
    }
  },

  filterURLsFromCallstack(callstack) {
    // Hide paths from URLs to make the log more readable
    callstack = callstack.replace(/@((file)|(http))[\w:\/\.]*\/([\w\.]*)/g, '@$4');
    callstack = callstack.replace(/\n/g, '<br />');
    return callstack;
  },

  // given callstack of func1\nfunc2\nfunc3... and function name, cuts the tail from the callstack
  // for anything after the function func.
  filterCallstackAfterFunctionName(callstack, func) {
    var i = callstack.indexOf(func);
    if (i != -1) {
      var end = callstack.indexOf('<br />', i);
      if (end != -1) {
        return callstack.slice(0, end);
      }
    }
    return callstack;
  },

  filterCallstackForMalloc(callstack) {
    // Do not show Memoryprofiler's own callstacks in the callstack prints.
    var i = callstack.indexOf('emscripten_trace_record_');
    if (i != -1) {
      callstack = callstack.slice(callstack.indexOf('\n', i)+1);
    }
    return emscriptenMemoryProfiler.filterURLsFromCallstack(callstack);
  },

  filterCallstackForHeapResize(callstack) {
    // Do not show Memoryprofiler's own callstacks in the callstack prints.
    var i = callstack.indexOf('emscripten_asm_const_iii');
    var j = callstack.indexOf('growMemory');
    i = (i == -1) ? j : (j == -1 ? i : Math.min(i, j));
    if (i != -1) {
      callstack = callstack.slice(callstack.indexOf('\n', i)+1);
    }
    callstack = callstack.replace(/(wasm-function\[\d+\]):0x[0-9a-f]+/g, "$1");
    return emscriptenMemoryProfiler.filterURLsFromCallstack(callstack);
  },

  printHeapResizeLog(heapResizes) {
    var html = '';
    for (var i = 0; i < heapResizes.length; ++i) {
      var j = i+1;
      while (j < heapResizes.length) {
        if ((heapResizes[j].filteredStack || heapResizes[j].stack) == (heapResizes[i].filteredStack || heapResizes[i].stack)) {
          ++j;
        } else {
          break;
        }
      }
      var resizeFirst = heapResizes[i];
      var resizeLast = heapResizes[j-1];
      var count = j - i;
      html += '<div style="background-color: ' + resizeFirst.color + '"><b>' + resizeFirst.begin + '-' + resizeLast.end + ' (' + count + ' times, ' + emscriptenMemoryProfiler.formatBytes(resizeLast.end-resizeFirst.begin) + ')</b>:' + (resizeFirst.filteredStack || resizeFirst.stack) + '</div><br>';
      i = j-1;
    }
    return html;
  },

  // Main UI update entry point.
  updateUi() {
    // It is common to set 'overflow: hidden;' on canvas pages that do WebGL. When MemoryProfiler is being used, there will be a long block of text on the page, so force-enable scrolling.
    if (document.body.style.overflow != '') document.body.style.overflow = '';
    function colorBar(color) {
      return '<span style="padding:0px; border:solid 1px black; width:28px;height:14px; vertical-align:middle; display:inline-block; background-color:'+color+';"></span>';
    }

    // Naive function to compute how many bits will be needed to represent the number 'n' in binary. This will be our pointer 'word width' in the UI.
    function nBits(n) {
      var i = 0;
      while (n >= 1) {
        ++i;
        n /= 2;
      }
      return i;
    }

    // Returns i formatted to string as fixed-width hexadecimal.
    function toHex(i, width) {
      var str = i.toString(16);
      while (str.length < width) str = '0' + str;
      return '0x'+str;
    }

    var self = emscriptenMemoryProfiler;

    // Poll whether user as changed the browser window, and if so, resize the profiler window and redraw it.
    if (self.canvas.width != document.documentElement.clientWidth - 32) {
      self.canvas.width = document.documentElement.clientWidth - 32;
    }

    if (typeof runtimeInitialized != 'undefined' && !runtimeInitialized) {
      return;
    }
    var stackBase = _emscripten_stack_get_base();
    var stackMax = _emscripten_stack_get_end();
    var stackCurrent = _emscripten_stack_get_current();
    var width = (nBits(HEAP8.length) + 3) / 4; // Pointer 'word width'
    var html = 'Total HEAP size: ' + self.formatBytes(HEAP8.length) + '.';
    html += '<br />' + colorBar('#202020') + 'STATIC memory area size: ' + self.formatBytes(stackMax - 1024);
    html += '. 1024: ' + toHex(1024, width);

    html += '<br />' + colorBar('#FF8080') + 'STACK memory area size: ' + self.formatBytes(stackBase - stackMax);
    html += '. STACK_BASE: ' + toHex(stackBase, width);
    html += '. STACKTOP: ' + toHex(stackCurrent, width);
    html += '. STACK_MAX: ' + toHex(stackMax, width) + '.';
    html += '<br />STACK memory area used now (should be zero): ' + self.formatBytes(stackBase - stackCurrent) + '.' + colorBar('#FFFF00') + ' STACK watermark highest seen usage (approximate lower-bound!): ' + self.formatBytes(stackBase - self.stackTopWatermark);

    var heap_base = Module['___heap_base'];
    var heap_end = _sbrk(0);
    html += "<br />DYNAMIC memory area size: " + self.formatBytes(heap_end - heap_base);
    html += ". start: " + toHex(heap_base, width);
    html += ". end: " + toHex(heap_end, width) + ".";
    html += "<br />" + colorBar("#6699CC") + colorBar("#003366") + colorBar("#0000FF") + "DYNAMIC memory area used: " + self.formatBytes(self.totalMemoryAllocated) + " (" + (self.totalMemoryAllocated * 100 / (HEAP8.length - heap_base)).toFixed(2) + "% of all dynamic memory and unallocated heap)";
    html += "<br />Free memory: " + colorBar("#70FF70") + "DYNAMIC: " + self.formatBytes(heap_end - heap_base - self.totalMemoryAllocated) + ", " + colorBar('#FFFFFF') + 'Unallocated HEAP: ' + self.formatBytes(HEAP8.length - heap_end) + " (" + ((HEAP8.length - heap_base - self.totalMemoryAllocated) * 100 / (HEAP8.length - heap_base)).toFixed(2) + "% of all dynamic memory and unallocated heap)";

    var preloadedMemoryUsed = 0;
    for (var i in self.sizeOfPreRunAllocatedPtr) preloadedMemoryUsed += self.sizeOfPreRunAllocatedPtr[i]|0;
    html += '<br />' + colorBar('#FF9900') + colorBar('#FFDD33') + 'Preloaded memory used, most likely memory reserved by files in the virtual filesystem : ' + self.formatBytes(preloadedMemoryUsed);

    html += '<br />OpenAL audio data: ' + self.formatBytes(self.countOpenALAudioDataSize()) + ' (outside HEAP)';
    html += '<br /># of total malloc()s/free()s performed in app lifetime: ' + self.totalTimesMallocCalled + '/' + self.totalTimesFreeCalled + ' (currently alive pointers: ' + (self.totalTimesMallocCalled-self.totalTimesFreeCalled) + ')';

    // Background clear
    self.drawContext.fillStyle = "#FFFFFF";
    self.drawContext.fillRect(0, 0, self.canvas.width, self.canvas.height);

    self.drawContext.fillStyle = "#FF8080";
    self.fillLine(stackMax, stackBase);

    self.drawContext.fillStyle = "#FFFF00";
    self.fillLine(self.stackTopWatermark, stackBase);

    self.drawContext.fillStyle = "#FF0000";
    self.fillLine(stackCurrent, stackBase);

    self.drawContext.fillStyle = "#70FF70";
    self.fillLine(heap_base, heap_end);

    if (self.detailedHeapUsage) {
      self.printAllocsWithCyclingColors(["#6699CC", "#003366", "#0000FF"], self.sizeOfAllocatedPtr);
      self.printAllocsWithCyclingColors(["#FF9900", "#FFDD33"], self.sizeOfPreRunAllocatedPtr);
    } else {
      // Print only a single naive blob of individual allocations. This will not be accurate, but is constant-time.
      self.drawContext.fillStyle = "#0000FF";
      self.fillLine(heap_base, heap_base + self.totalMemoryAllocated);
    }

    if (document.getElementById('showHeapResizes').checked) {
      // Print heap resize traces.
      for (var i in self.resizeMemorySources) {
        var resize = self.resizeMemorySources[i];
        self.drawContext.fillStyle = resize.color;
        self.fillRect(resize.begin, resize.end, 0.5);
      }

      // Print sbrk() traces.
      var uniqueSources = {};
      var filterWords = document.getElementById('sbrkFilter').value.split(',');
      for (var i in self.sbrkSources) {
        var sbrk = self.sbrkSources[i];
        var stack = sbrk.stack;
        for (var j in filterWords) {
          var s = filterWords[j].trim();
          if (s.length > 0)
          stack = self.filterCallstackAfterFunctionName(stack, s);
        }
        sbrk.filteredStack = stack;
        uniqueSources[stack] ||= self.hsvToRgb(Object.keys(uniqueSources).length * 0.618033988749895 % 1, 0.5, 0.95);
        self.drawContext.fillStyle = sbrk.color = uniqueSources[stack];
        self.fillRect(sbrk.begin, sbrk.end, 0.25);
      }

      // Print a divider line to make the sbrk()/heap resize block more prominently visible compared to the rest of the allocations.
      function line(x0, y0, x1, y1) {
        self.drawContext.beginPath();
        self.drawContext.moveTo(x0, y0);
        self.drawContext.lineTo(x1, y1);
        self.drawContext.lineWidth = 2;
        self.drawContext.stroke();
      }
      if (self.sbrkSources.length > 0) line(0, 0.75*self.canvas.height, self.canvas.width, 0.75*self.canvas.height);
      if (self.resizeMemorySources.length > 0) line(0, 0.5*self.canvas.height, self.canvas.width, 0.5*self.canvas.height);
    }

    self.memoryprofiler_summary.innerHTML = html;

    var sort = document.getElementById('memoryProfilerSort');
    var sortOrder = sort.options[sort.selectedIndex].value;

    html = '';

    // Print out sbrk() and memory resize subdivisions:
    if (document.getElementById('showHeapResizes').checked) {
      // Print heap resize traces.
      html += '<div style="background-color: #c0c0c0"><h4>Heap resize locations:</h4>';
      html += self.printHeapResizeLog(self.resizeMemorySources);
      html += '</div>'

      // Print heap sbrk traces.
      html += '<div style="background-color: #c0c0ff"><h4>Memory sbrk() locations:</h4>';
      html += self.printHeapResizeLog(self.sbrkSources);
      html += '</div>'
    } else {
      // Print out statistics of individual allocations if they were tracked.
      if (Object.keys(self.allocationsAtLoc).length > 0) {
        var calls = [];
        for (var i in self.allocationsAtLoc) {
          if (self.allocationsAtLoc[i][0] >= self.trackedCallstackMinAllocCount || self.allocationsAtLoc[i][1] >= self.trackedCallstackMinSizeBytes) {
            calls.push(self.allocationsAtLoc[i]);
          }
        }
        if (calls.length > 0) {
          if (sortOrder != 'fixed') {
            var sortIdx = (sortOrder == 'count') ? 0 : 1;
            calls.sort((a,b) => b[sortIdx] - a[sortIdx]);
          }
          html += '<h4>Allocation sites with more than ' + self.formatBytes(self.trackedCallstackMinSizeBytes) + ' of accumulated allocations, or more than ' + self.trackedCallstackMinAllocCount + ' simultaneously outstanding allocations:</h4>'
          for (var call of calls) {
            html += "<b>" + self.formatBytes(call[1]) + '/' + call[0] + " allocs</b>: " + call[2] + "<br />";
          }
        }
      }
    }
    self.memoryprofiler_ptrs.innerHTML = html;
  }
};

// Backwards compatibility with previously compiled code. Don't call this
// anymore!
function memoryprofiler_add_hooks() {
  emscriptenMemoryProfiler.initialize();
}

if (typeof document != 'undefined' && typeof window != 'undefined' && typeof process == 'undefined') {
  emscriptenMemoryProfiler.initialize();
}

// Declared in globalThis so that `onclick` handlers work when `-sMODULARIZE=1`
globalThis.emscriptenMemoryProfiler = emscriptenMemoryProfiler;

// end include: memoryprofiler.js
// include: runtime_pthread.js
// Pthread Web Worker handling code.
// This code runs only on pthread web workers and handles pthread setup
// and communication with the main thread via postMessage.

// Unique ID of the current pthread worker (zero on non-pthread-workers
// including the main thread).
var workerID = 0;

if (ENVIRONMENT_IS_PTHREAD) {
  var wasmModuleReceived;

  // Node.js support
  if (ENVIRONMENT_IS_NODE) {
    // Create as web-worker-like an environment as we can.

    var parentPort = worker_threads['parentPort'];
    parentPort.on('message', (msg) => onmessage({ data: msg }));

    Object.assign(globalThis, {
      self: global,
      postMessage: (msg) => parentPort.postMessage(msg),
    });
  }

  // Thread-local guard variable for one-time init of the JS state
  var initializedJS = false;

  function threadPrintErr(...args) {
    // See https://github.com/emscripten-core/emscripten/issues/14804
    if (ENVIRONMENT_IS_NODE) {
      fs.writeSync(2, args.join(' ') + '\n');
      return;
    }
    console.error(...args);
  }

  if (!Module['printErr'])
    err = threadPrintErr;

  // Turn unhandled rejected promises into errors so that the main thread will be
  // notified about them.
  self.onunhandledrejection = (e) => { throw e.reason || e; };

  function handleMessage(e) {
    try {
      var msgData = e['data'];
      //dbg('msgData: ' + Object.keys(msgData));
      var cmd = msgData.cmd;
      if (cmd === 'load') { // Preload command that is called once per worker to parse and load the Emscripten code.
        workerID = msgData.workerID;

        // Until we initialize the runtime, queue up any further incoming messages.
        let messageQueue = [];
        self.onmessage = (e) => messageQueue.push(e);

        // And add a callback for when the runtime is initialized.
        self.startWorker = (instance) => {
          // Notify the main thread that this thread has loaded.
          postMessage({ cmd: 'loaded' });
          // Process any messages that were queued before the thread was ready.
          for (let msg of messageQueue) {
            handleMessage(msg);
          }
          // Restore the real message handler.
          self.onmessage = handleMessage;
        };

        // Use `const` here to ensure that the variable is scoped only to
        // that iteration, allowing safe reference from a closure.
        for (const handler of msgData.handlers) {
          // The the main module has a handler for a certain even, but no
          // handler exists on the pthread worker, then proxy that handler
          // back to the main thread.
          if (!Module[handler] || Module[handler].proxy) {
            Module[handler] = (...args) => {
              postMessage({ cmd: 'callHandler', handler, args: args });
            }
            // Rebind the out / err handlers if needed
            if (handler == 'print') out = Module[handler];
            if (handler == 'printErr') err = Module[handler];
          }
        }

        wasmMemory = msgData.wasmMemory;
        updateMemoryViews();

        wasmModuleReceived(msgData.wasmModule);
      } else if (cmd === 'run') {
        assert(msgData.pthread_ptr);
        // Call inside JS module to set up the stack frame for this pthread in JS module scope.
        // This needs to be the first thing that we do, as we cannot call to any C/C++ functions
        // until the thread stack is initialized.
        establishStackSpace(msgData.pthread_ptr);

        // Pass the thread address to wasm to store it for fast access.
        __emscripten_thread_init(msgData.pthread_ptr, /*is_main=*/0, /*is_runtime=*/0, /*can_block=*/1, 0, 0);

        PThread.threadInitTLS();

        // Await mailbox notifications with `Atomics.waitAsync` so we can start
        // using the fast `Atomics.notify` notification path.
        __emscripten_thread_mailbox_await(msgData.pthread_ptr);

        if (!initializedJS) {
          initializedJS = true;
        }

        try {
          invokeEntryPoint(msgData.start_routine, msgData.arg);
        } catch(ex) {
          if (ex != 'unwind') {
            // The pthread "crashed".  Do not call `_emscripten_thread_exit` (which
            // would make this thread joinable).  Instead, re-throw the exception
            // and let the top level handler propagate it back to the main thread.
            throw ex;
          }
        }
      } else if (msgData.target === 'setimmediate') {
        // no-op
      } else if (cmd === 'checkMailbox') {
        if (initializedJS) {
          checkMailbox();
        }
      } else if (cmd) {
        // The received message looks like something that should be handled by this message
        // handler, (since there is a cmd field present), but is not one of the
        // recognized commands:
        err(`worker: received unknown command ${cmd}`);
        err(msgData);
      }
    } catch(ex) {
      err(`worker: onmessage() captured an uncaught exception: ${ex}`);
      if (ex?.stack) err(ex.stack);
      __emscripten_thread_crashed();
      throw ex;
    }
  };

  self.onmessage = handleMessage;

} // ENVIRONMENT_IS_PTHREAD
// end include: runtime_pthread.js


function updateMemoryViews() {
  var b = wasmMemory.buffer;
  Module['HEAP8'] = HEAP8 = new Int8Array(b);
  Module['HEAP16'] = HEAP16 = new Int16Array(b);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(b);
  Module['HEAP32'] = HEAP32 = new Int32Array(b);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(b);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(b);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(b);
  Module['HEAP64'] = HEAP64 = new BigInt64Array(b);
  Module['HEAPU64'] = HEAPU64 = new BigUint64Array(b);
}

// end include: runtime_shared.js
assert(!Module['STACK_SIZE'], 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')

assert(typeof Int32Array != 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray != undefined && Int32Array.prototype.set != undefined,
       'JS engine does not provide full typed array support');

// In non-standalone/normal mode, we create the memory here.
// include: runtime_init_memory.js
// Create the wasm memory. (Note: this only applies if IMPORTED_MEMORY is defined)

// check for full engine support (use string 'subarray' to avoid closure compiler confusion)

if (!ENVIRONMENT_IS_PTHREAD) {

  if (Module['wasmMemory']) {
    wasmMemory = Module['wasmMemory'];
  } else
  {
    var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 1073741824;legacyModuleProp('INITIAL_MEMORY', 'INITIAL_MEMORY');

    assert(INITIAL_MEMORY >= 65536, 'INITIAL_MEMORY should be larger than STACK_SIZE, was ' + INITIAL_MEMORY + '! (STACK_SIZE=' + 65536 + ')');
    /** @suppress {checkTypes} */
    wasmMemory = new WebAssembly.Memory({
      'initial': INITIAL_MEMORY / 65536,
      'maximum': INITIAL_MEMORY / 65536,
      'shared': true,
    });
  }

  updateMemoryViews();
}

// end include: runtime_init_memory.js

function preRun() {
  assert(!ENVIRONMENT_IS_PTHREAD); // PThreads reuse the runtime from the main thread.
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  consumedModuleProp('preRun');
  callRuntimeCallbacks(onPreRuns);
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  if (ENVIRONMENT_IS_PTHREAD) return startWorker(Module);

  checkStackCookie();

  

  wasmExports['__wasm_call_ctors']();

  
}

function preMain() {
  checkStackCookie();
  
}

function postRun() {
  checkStackCookie();
  if (ENVIRONMENT_IS_PTHREAD) return; // PThreads reuse the runtime from the main thread.

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  consumedModuleProp('postRun');

  callRuntimeCallbacks(onPostRuns);
}

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};
var runDependencyWatcher = null;

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
}

function addRunDependency(id) {
  runDependencies++;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval != 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(() => {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err(`dependency: ${dep}`);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

/** @param {string|number=} what */
function abort(what) {
  Module['onAbort']?.(what);

  what = 'Aborted(' + what + ')';
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

function createExportWrapper(name, nargs) {
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    var f = wasmExports[name];
    assert(f, `exported native function \`${name}\` not found`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return f(...args);
  };
}

var wasmBinaryFile;

function findWasmBinary() {
    return locateFile('mdflib.wasm');
}

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  throw 'both async and sync fetching of the wasm failed';
}

async function getWasmBinary(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary) {
    // Fetch the binary using readAsync
    try {
      var response = await readAsync(binaryFile);
      return new Uint8Array(response);
    } catch {
      // Fall back to getBinarySync below;
    }
  }

  // Otherwise, getBinarySync should be able to get it synchronously
  return getBinarySync(binaryFile);
}

async function instantiateArrayBuffer(binaryFile, imports) {
  try {
    var binary = await getWasmBinary(binaryFile);
    var instance = await WebAssembly.instantiate(binary, imports);
    return instance;
  } catch (reason) {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    // Warn on some common problems.
    if (isFileURI(wasmBinaryFile)) {
      err(`warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  }
}

async function instantiateAsync(binary, binaryFile, imports) {
  if (!binary && typeof WebAssembly.instantiateStreaming == 'function'
      // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
      && !isFileURI(binaryFile)
      // Avoid instantiateStreaming() on Node.js environment for now, as while
      // Node.js v18.1.0 implements it, it does not have a full fetch()
      // implementation yet.
      //
      // Reference:
      //   https://github.com/emscripten-core/emscripten/pull/16917
      && !ENVIRONMENT_IS_NODE
     ) {
    try {
      var response = fetch(binaryFile, { credentials: 'same-origin' });
      var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
      return instantiationResult;
    } catch (reason) {
      // We expect the most common failure cause to be a bad MIME type for the binary,
      // in which case falling back to ArrayBuffer instantiation should work.
      err(`wasm streaming compile failed: ${reason}`);
      err('falling back to ArrayBuffer instantiation');
      // fall back of instantiateArrayBuffer below
    };
  }
  return instantiateArrayBuffer(binaryFile, imports);
}

function getWasmImports() {
  assignWasmImports();
  // prepare imports
  return {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  }
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
async function createWasm() {
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    wasmExports = instance.exports;

    

    registerTLSInit(wasmExports['_emscripten_tls_init']);

    wasmTable = wasmExports['__indirect_function_table'];
    
    assert(wasmTable, 'table not found in wasm exports');

    // We now have the Wasm module loaded up, keep a reference to the compiled module so we can post it to the workers.
    wasmModule = module;
    removeRunDependency('wasm-instantiate');
    return wasmExports;
  }
  // wait for the pthread pool (if any)
  addRunDependency('wasm-instantiate');

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    return receiveInstance(result['instance'], result['module']);
  }

  var info = getWasmImports();

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module['instantiateWasm']) {
    return new Promise((resolve, reject) => {
      try {
        Module['instantiateWasm'](info, (mod, inst) => {
          receiveInstance(mod, inst);
          resolve(mod.exports);
        });
      } catch(e) {
        err(`Module.instantiateWasm callback failed with error: ${e}`);
        reject(e);
      }
    });
  }

  if (ENVIRONMENT_IS_PTHREAD) {
    return new Promise((resolve) => {
      wasmModuleReceived = (module) => {
        // Instantiate from the module posted from the main thread.
        // We can just use sync instantiation in the worker.
        var instance = new WebAssembly.Instance(module, getWasmImports());
        resolve(receiveInstance(instance, module));
      };
    });
  }

  wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
    var exports = receiveInstantiationResult(result);
    return exports;
}

// end include: preamble.js

// Begin JS library code


  class ExitStatus {
      name = 'ExitStatus';
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }

  
  var terminateWorker = (worker) => {
      worker.terminate();
      // terminate() can be asynchronous, so in theory the worker can continue
      // to run for some amount of time after termination.  However from our POV
      // the worker now dead and we don't want to hear from it again, so we stub
      // out its message handler here.  This avoids having to check in each of
      // the onmessage handlers if the message was coming from valid worker.
      worker.onmessage = (e) => {
        var cmd = e['data'].cmd;
        err(`received "${cmd}" command from terminated worker: ${worker.workerID}`);
      };
    };
  
  var cleanupThread = (pthread_ptr) => {
      assert(!ENVIRONMENT_IS_PTHREAD, 'Internal Error! cleanupThread() can only ever be called from main application thread!');
      assert(pthread_ptr, 'Internal Error! Null pthread_ptr in cleanupThread!');
      var worker = PThread.pthreads[pthread_ptr];
      assert(worker);
      PThread.returnWorkerToPool(worker);
    };
  
  var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module);
      }
    };
  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.unshift(cb);
  
  var spawnThread = (threadParams) => {
      assert(!ENVIRONMENT_IS_PTHREAD, 'Internal Error! spawnThread() can only ever be called from main application thread!');
      assert(threadParams.pthread_ptr, 'Internal error, no pthread ptr!');
  
      var worker = PThread.getNewWorker();
      if (!worker) {
        // No available workers in the PThread pool.
        return 6;
      }
      assert(!worker.pthread_ptr, 'Internal error!');
  
      PThread.runningWorkers.push(worker);
  
      // Add to pthreads map
      PThread.pthreads[threadParams.pthread_ptr] = worker;
  
      worker.pthread_ptr = threadParams.pthread_ptr;
      var msg = {
          cmd: 'run',
          start_routine: threadParams.startRoutine,
          arg: threadParams.arg,
          pthread_ptr: threadParams.pthread_ptr,
      };
      if (ENVIRONMENT_IS_NODE) {
        // Mark worker as weakly referenced once we start executing a pthread,
        // so that its existence does not prevent Node.js from exiting.  This
        // has no effect if the worker is already weakly referenced (e.g. if
        // this worker was previously idle/unused).
        worker.unref();
      }
      // Ask the worker to start executing its pthread entry point function.
      worker.postMessage(msg, threadParams.transferList);
      return 0;
    };
  
  
  
  var runtimeKeepaliveCounter = 0;
  var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
  
  var stackSave = () => _emscripten_stack_get_current();
  
  var stackRestore = (val) => __emscripten_stack_restore(val);
  
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  
  
  var INT53_MAX = 9007199254740992;
  
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => (num < INT53_MIN || num > INT53_MAX) ? NaN : Number(num);
  
  /** @type{function(number, (number|boolean), ...number)} */
  var proxyToMainThread = (funcIndex, emAsmAddr, sync, ...callArgs) => {
      // EM_ASM proxying is done by passing a pointer to the address of the EM_ASM
      // content as `emAsmAddr`.  JS library proxying is done by passing an index
      // into `proxiedJSCallArgs` as `funcIndex`. If `emAsmAddr` is non-zero then
      // `funcIndex` will be ignored.
      // Additional arguments are passed after the first three are the actual
      // function arguments.
      // The serialization buffer contains the number of call params, and then
      // all the args here.
      // We also pass 'sync' to C separately, since C needs to look at it.
      // Allocate a buffer, which will be copied by the C code.
      //
      // First passed parameter specifies the number of arguments to the function.
      // When BigInt support is enabled, we must handle types in a more complex
      // way, detecting at runtime if a value is a BigInt or not (as we have no
      // type info here). To do that, add a "prefix" before each value that
      // indicates if it is a BigInt, which effectively doubles the number of
      // values we serialize for proxying. TODO: pack this?
      var serializedNumCallArgs = callArgs.length * 2;
      var sp = stackSave();
      var args = stackAlloc(serializedNumCallArgs * 8);
      var b = ((args)>>3);
      for (var i = 0; i < callArgs.length; i++) {
        var arg = callArgs[i];
        if (typeof arg == 'bigint') {
          // The prefix is non-zero to indicate a bigint.
          HEAP64[b + 2*i] = 1n;
          HEAP64[b + 2*i + 1] = arg;
        } else {
          // The prefix is zero to indicate a JS Number.
          HEAP64[b + 2*i] = 0n;
          HEAPF64[b + 2*i + 1] = arg;
        }
      }
      var rtn = __emscripten_run_on_main_thread_js(funcIndex, emAsmAddr, serializedNumCallArgs, args, sync);
      stackRestore(sp);
      return rtn;
    };
  
  function _proc_exit(code) {
  if (ENVIRONMENT_IS_PTHREAD)
    return proxyToMainThread(0, 0, 1, code);
  
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        PThread.terminateAllThreads();
        Module['onExit']?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    
  }
  
  
  
  
  var handleException = (e) => {
      // Certain exception types we do not treat as errors since they are used for
      // internal control flow.
      // 1. ExitStatus, which is thrown by exit()
      // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
      //    that wish to return to JS event loop.
      if (e instanceof ExitStatus || e == 'unwind') {
        return EXITSTATUS;
      }
      checkStackCookie();
      if (e instanceof WebAssembly.RuntimeError) {
        if (_emscripten_stack_get_current() <= 0) {
          err('Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)');
        }
      }
      quit_(1, e);
    };
  
  
  
  var runtimeKeepalivePop = () => {
      assert(runtimeKeepaliveCounter > 0);
      runtimeKeepaliveCounter -= 1;
    };
  
  function exitOnMainThread(returnCode) {
  if (ENVIRONMENT_IS_PTHREAD)
    return proxyToMainThread(1, 0, 0, returnCode);
  
      runtimeKeepalivePop();;
      _exit(returnCode);
    
  }
  
  
  /** @suppress {duplicate } */
  /** @param {boolean|number=} implicit */
  var exitJS = (status, implicit) => {
      EXITSTATUS = status;
  
      checkUnflushedContent();
  
      if (ENVIRONMENT_IS_PTHREAD) {
        // implicit exit can never happen on a pthread
        assert(!implicit);
        // When running in a pthread we propagate the exit back to the main thread
        // where it can decide if the whole process should be shut down or not.
        // The pthread may have decided not to exit its own runtime, for example
        // because it runs a main loop, but that doesn't affect the main thread.
        exitOnMainThread(status);
        throw 'unwind';
      }
  
      // if exit() was called explicitly, warn the user if the runtime isn't actually being shut down
      if (keepRuntimeAlive() && !implicit) {
        var msg = `program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;
        err(msg);
      }
  
      _proc_exit(status);
    };
  var _exit = exitJS;
  
  var ptrToString = (ptr) => {
      assert(typeof ptr === 'number');
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      ptr >>>= 0;
      return '0x' + ptr.toString(16).padStart(8, '0');
    };
  
  
  var PThread = {
  unusedWorkers:[],
  runningWorkers:[],
  tlsInitFunctions:[],
  pthreads:{
  },
  nextWorkerID:1,
  debugInit() {
        function pthreadLogPrefix() {
          var t = 0;
          if (runtimeInitialized && typeof _pthread_self != 'undefined'
          ) {
            t = _pthread_self();
          }
          return `w:${workerID},t:${ptrToString(t)}: `;
        }
  
        // Prefix all err()/dbg() messages with the calling thread ID.
        var origDbg = dbg;
        dbg = (...args) => origDbg(pthreadLogPrefix() + args.join(' '));
      },
  init() {
        PThread.debugInit();
        if ((!(ENVIRONMENT_IS_PTHREAD))) {
          PThread.initMainThread();
        }
      },
  initMainThread() {
        // MINIMAL_RUNTIME takes care of calling loadWasmModuleToAllWorkers
        // in postamble_minimal.js
        addOnPreRun(() => {
          addRunDependency('loading-workers')
          PThread.loadWasmModuleToAllWorkers(() => removeRunDependency('loading-workers'));
        });
      },
  terminateAllThreads:() => {
        assert(!ENVIRONMENT_IS_PTHREAD, 'Internal Error! terminateAllThreads() can only ever be called from main application thread!');
        // Attempt to kill all workers.  Sadly (at least on the web) there is no
        // way to terminate a worker synchronously, or to be notified when a
        // worker in actually terminated.  This means there is some risk that
        // pthreads will continue to be executing after `worker.terminate` has
        // returned.  For this reason, we don't call `returnWorkerToPool` here or
        // free the underlying pthread data structures.
        for (var worker of PThread.runningWorkers) {
          terminateWorker(worker);
        }
        for (var worker of PThread.unusedWorkers) {
          terminateWorker(worker);
        }
        PThread.unusedWorkers = [];
        PThread.runningWorkers = [];
        PThread.pthreads = {};
      },
  returnWorkerToPool:(worker) => {
        // We don't want to run main thread queued calls here, since we are doing
        // some operations that leave the worker queue in an invalid state until
        // we are completely done (it would be bad if free() ends up calling a
        // queued pthread_create which looks at the global data structures we are
        // modifying). To achieve that, defer the free() til the very end, when
        // we are all done.
        var pthread_ptr = worker.pthread_ptr;
        delete PThread.pthreads[pthread_ptr];
        // Note: worker is intentionally not terminated so the pool can
        // dynamically grow.
        PThread.unusedWorkers.push(worker);
        PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker), 1);
        // Not a running Worker anymore
        // Detach the worker from the pthread object, and return it to the
        // worker pool as an unused worker.
        worker.pthread_ptr = 0;
  
        if (ENVIRONMENT_IS_NODE) {
          // Once the proxied main thread has finished, mark it as weakly
          // referenced so that its existence does not prevent Node.js from
          // exiting.  This has no effect if the worker is already weakly
          // referenced.
          worker.unref();
        }
  
        // Finally, free the underlying (and now-unused) pthread structure in
        // linear memory.
        __emscripten_thread_free_data(pthread_ptr);
      },
  threadInitTLS() {
        // Call thread init functions (these are the _emscripten_tls_init for each
        // module loaded.
        PThread.tlsInitFunctions.forEach((f) => f());
      },
  loadWasmModuleToWorker:(worker) => new Promise((onFinishedLoading) => {
        worker.onmessage = (e) => {
          var d = e['data'];
          var cmd = d.cmd;
  
          // If this message is intended to a recipient that is not the main
          // thread, forward it to the target thread.
          if (d.targetThread && d.targetThread != _pthread_self()) {
            var targetWorker = PThread.pthreads[d.targetThread];
            if (targetWorker) {
              targetWorker.postMessage(d, d.transferList);
            } else {
              err(`Internal error! Worker sent a message "${cmd}" to target pthread ${d.targetThread}, but that thread no longer exists!`);
            }
            return;
          }
  
          if (cmd === 'checkMailbox') {
            checkMailbox();
          } else if (cmd === 'spawnThread') {
            spawnThread(d);
          } else if (cmd === 'cleanupThread') {
            cleanupThread(d.thread);
          } else if (cmd === 'loaded') {
            worker.loaded = true;
            onFinishedLoading(worker);
          } else if (d.target === 'setimmediate') {
            // Worker wants to postMessage() to itself to implement setImmediate()
            // emulation.
            worker.postMessage(d);
          } else if (cmd === 'callHandler') {
            Module[d.handler](...d.args);
          } else if (cmd) {
            // The received message looks like something that should be handled by this message
            // handler, (since there is a e.data.cmd field present), but is not one of the
            // recognized commands:
            err(`worker sent an unknown command ${cmd}`);
          }
        };
  
        worker.onerror = (e) => {
          var message = 'worker sent an error!';
          if (worker.pthread_ptr) {
            message = `Pthread ${ptrToString(worker.pthread_ptr)} sent an error!`;
          }
          err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);
          throw e;
        };
  
        if (ENVIRONMENT_IS_NODE) {
          worker.on('message', (data) => worker.onmessage({ data: data }));
          worker.on('error', (e) => worker.onerror(e));
        }
  
        assert(wasmMemory instanceof WebAssembly.Memory, 'WebAssembly memory should have been loaded by now!');
        assert(wasmModule instanceof WebAssembly.Module, 'WebAssembly Module should have been loaded by now!');
  
        // When running on a pthread, none of the incoming parameters on the module
        // object are present. Proxy known handlers back to the main thread if specified.
        var handlers = [];
        var knownHandlers = [
          'onExit',
          'onAbort',
          'print',
          'printErr',
        ];
        for (var handler of knownHandlers) {
          if (Module.propertyIsEnumerable(handler)) {
            handlers.push(handler);
          }
        }
  
        // Ask the new worker to load up the Emscripten-compiled page. This is a heavy operation.
        worker.postMessage({
          cmd: 'load',
          handlers: handlers,
          wasmMemory,
          wasmModule,
          'workerID': worker.workerID,
        });
      }),
  loadWasmModuleToAllWorkers(onMaybeReady) {
        onMaybeReady();
      },
  allocateUnusedWorker() {
        var worker;
        var pthreadMainJs = _scriptName;
        // We can't use makeModuleReceiveWithVar here since we want to also
        // call URL.createObjectURL on the mainScriptUrlOrBlob.
        if (Module['mainScriptUrlOrBlob']) {
          pthreadMainJs = Module['mainScriptUrlOrBlob'];
          if (typeof pthreadMainJs != 'string') {
            pthreadMainJs = URL.createObjectURL(pthreadMainJs);
          }
        }
        worker = new Worker(pthreadMainJs, {
          // This is the way that we signal to the node worker that it is hosting
          // a pthread.
          'workerData': 'em-pthread',
          // This is the way that we signal to the Web Worker that it is hosting
          // a pthread.
          'name': 'em-pthread-' + PThread.nextWorkerID,
  });
        worker.workerID = PThread.nextWorkerID++;
        PThread.unusedWorkers.push(worker);
      },
  getNewWorker() {
        if (PThread.unusedWorkers.length == 0) {
  // PTHREAD_POOL_SIZE_STRICT should show a warning and, if set to level `2`, return from the function.
          PThread.allocateUnusedWorker();
          PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0]);
        }
        return PThread.unusedWorkers.pop();
      },
  };

  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.unshift(cb);



  
  
  var establishStackSpace = (pthread_ptr) => {
      var stackHigh = HEAPU32[(((pthread_ptr)+(52))>>2)];
      var stackSize = HEAPU32[(((pthread_ptr)+(56))>>2)];
      var stackLow = stackHigh - stackSize;
      assert(stackHigh != 0);
      assert(stackLow != 0);
      assert(stackHigh > stackLow, 'stackHigh must be higher then stackLow');
      // Set stack limits used by `emscripten/stack.h` function.  These limits are
      // cached in wasm-side globals to make checks as fast as possible.
      _emscripten_stack_set_limits(stackHigh, stackLow);
  
      // Call inside wasm module to set up the stack frame for this pthread in wasm module scope
      stackRestore(stackHigh);
  
      // Write the stack cookie last, after we have set up the proper bounds and
      // current position of the stack.
      writeStackCookie();
    };

  
    /**
     * @param {number} ptr
     * @param {string} type
     */
  function getValue(ptr, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': return HEAP8[ptr];
      case 'i8': return HEAP8[ptr];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP64[((ptr)>>3)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      case '*': return HEAPU32[((ptr)>>2)];
      default: abort(`invalid type for getValue: ${type}`);
    }
  }

  
  
  
  
  var wasmTableMirror = [];
  
  /** @type {WebAssembly.Table} */
  var wasmTable;
  var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        /** @suppress {checkTypes} */
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      /** @suppress {checkTypes} */
      assert(wasmTable.get(funcPtr) == func, 'JavaScript-side Wasm function table mirror is out of date!');
      return func;
    };
  var invokeEntryPoint = (ptr, arg) => {
      // An old thread on this worker may have been canceled without returning the
      // `runtimeKeepaliveCounter` to zero. Reset it now so the new thread won't
      // be affected.
      runtimeKeepaliveCounter = 0;
  
      // Same for noExitRuntime.  The default for pthreads should always be false
      // otherwise pthreads would never complete and attempts to pthread_join to
      // them would block forever.
      // pthreads can still choose to set `noExitRuntime` explicitly, or
      // call emscripten_unwind_to_js_event_loop to extend their lifetime beyond
      // their main function.  See comment in src/runtime_pthread.js for more.
      noExitRuntime = 0;
  
      // pthread entry points are always of signature 'void *ThreadMain(void *arg)'
      // Native codebases sometimes spawn threads with other thread entry point
      // signatures, such as void ThreadMain(void *arg), void *ThreadMain(), or
      // void ThreadMain().  That is not acceptable per C/C++ specification, but
      // x86 compiler ABI extensions enable that to work. If you find the
      // following line to crash, either change the signature to "proper" void
      // *ThreadMain(void *arg) form, or try linking with the Emscripten linker
      // flag -sEMULATE_FUNCTION_POINTER_CASTS to add in emulation for this x86
      // ABI extension.
  
      var result = getWasmTableEntry(ptr)(arg);
  
      checkStackCookie();
      function finish(result) {
        if (keepRuntimeAlive()) {
          EXITSTATUS = result;
        } else {
          __emscripten_thread_exit(result);
        }
      }
      finish(result);
    };

  var noExitRuntime = Module['noExitRuntime'] || true;


  var registerTLSInit = (tlsInitFunc) => PThread.tlsInitFunctions.push(tlsInitFunc);

  var runtimeKeepalivePush = () => {
      runtimeKeepaliveCounter += 1;
    };

  
    /**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */
  function setValue(ptr, value, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': HEAP8[ptr] = value; break;
      case 'i8': HEAP8[ptr] = value; break;
      case 'i16': HEAP16[((ptr)>>1)] = value; break;
      case 'i32': HEAP32[((ptr)>>2)] = value; break;
      case 'i64': HEAP64[((ptr)>>3)] = BigInt(value); break;
      case 'float': HEAPF32[((ptr)>>2)] = value; break;
      case 'double': HEAPF64[((ptr)>>3)] = value; break;
      case '*': HEAPU32[((ptr)>>2)] = value; break;
      default: abort(`invalid type for setValue: ${type}`);
    }
  }



  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
        err(text);
      }
    };

  var UTF8Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder() : undefined;
  
    /**
     * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
     * array that contains uint8 values, returns a copy of that string as a
     * Javascript String object.
     * heapOrArray is either a regular array, or a JavaScript typed array view.
     * @param {number=} idx
     * @param {number=} maxBytesToRead
     * @return {string}
     */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.  Also, use the length info to avoid running tiny
      // strings through TextDecoder, since .subarray() allocates garbage.
      // (As a tiny code save trick, compare endPtr against endIdx using a negation,
      // so that undefined/NaN means Infinity)
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
  
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.buffer instanceof ArrayBuffer ? heapOrArray.subarray(idx, endPtr) : heapOrArray.slice(idx, endPtr));
      }
      var str = '';
      // If building with TextDecoder, we have already computed the string length
      // above, so test loop end condition against that
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++];
        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte ' + ptrToString(u0) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
        }
  
        if (u0 < 0x10000) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 0x10000;
          str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
      }
      return str;
    };
  
    /**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index (i.e. maxBytesToRead will not
     *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
     *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
     *   JS JIT optimizations off, so it is worth to consider consistently using one
     * @return {string}
     */
  var UTF8ToString = (ptr, maxBytesToRead) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
    };
  var ___assert_fail = (condition, filename, line, func) =>
      abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : 'unknown filename', line, func ? UTF8ToString(func) : 'unknown function']);

  var ___call_sighandler = (fp, sig) => getWasmTableEntry(fp)(sig);

  class ExceptionInfo {
      // excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
      constructor(excPtr) {
        this.excPtr = excPtr;
        this.ptr = excPtr - 24;
      }
  
      set_type(type) {
        HEAPU32[(((this.ptr)+(4))>>2)] = type;
      }
  
      get_type() {
        return HEAPU32[(((this.ptr)+(4))>>2)];
      }
  
      set_destructor(destructor) {
        HEAPU32[(((this.ptr)+(8))>>2)] = destructor;
      }
  
      get_destructor() {
        return HEAPU32[(((this.ptr)+(8))>>2)];
      }
  
      set_caught(caught) {
        caught = caught ? 1 : 0;
        HEAP8[(this.ptr)+(12)] = caught;
      }
  
      get_caught() {
        return HEAP8[(this.ptr)+(12)] != 0;
      }
  
      set_rethrown(rethrown) {
        rethrown = rethrown ? 1 : 0;
        HEAP8[(this.ptr)+(13)] = rethrown;
      }
  
      get_rethrown() {
        return HEAP8[(this.ptr)+(13)] != 0;
      }
  
      // Initialize native structure fields. Should be called once after allocated.
      init(type, destructor) {
        this.set_adjusted_ptr(0);
        this.set_type(type);
        this.set_destructor(destructor);
      }
  
      set_adjusted_ptr(adjustedPtr) {
        HEAPU32[(((this.ptr)+(16))>>2)] = adjustedPtr;
      }
  
      get_adjusted_ptr() {
        return HEAPU32[(((this.ptr)+(16))>>2)];
      }
    }
  
  var exceptionLast = 0;
  
  var uncaughtExceptionCount = 0;
  var ___cxa_throw = (ptr, type, destructor) => {
      var info = new ExceptionInfo(ptr);
      // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
      info.init(type, destructor);
      exceptionLast = ptr;
      uncaughtExceptionCount++;
      assert(false, 'Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.');
    };

  
  
  
  
  
  function pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg) {
  if (ENVIRONMENT_IS_PTHREAD)
    return proxyToMainThread(2, 0, 1, pthread_ptr, attr, startRoutine, arg);
  return ___pthread_create_js(pthread_ptr, attr, startRoutine, arg)
  }
  
  
  var _emscripten_has_threading_support = () => typeof SharedArrayBuffer != 'undefined';
  
  var ___pthread_create_js = (pthread_ptr, attr, startRoutine, arg) => {
      if (!_emscripten_has_threading_support()) {
        dbg('pthread_create: environment does not support SharedArrayBuffer, pthreads are not available');
        return 6;
      }
  
      // List of JS objects that will transfer ownership to the Worker hosting the thread
      var transferList = [];
      var error = 0;
  
      // Synchronously proxy the thread creation to main thread if possible. If we
      // need to transfer ownership of objects, then proxy asynchronously via
      // postMessage.
      if (ENVIRONMENT_IS_PTHREAD && (transferList.length === 0 || error)) {
        return pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg);
      }
  
      // If on the main thread, and accessing Canvas/OffscreenCanvas failed, abort
      // with the detected error.
      if (error) return error;
  
      var threadParams = {
        startRoutine,
        pthread_ptr,
        arg,
        transferList,
      };
  
      if (ENVIRONMENT_IS_PTHREAD) {
        // The prepopulated pool of web workers that can host pthreads is stored
        // in the main JS thread. Therefore if a pthread is attempting to spawn a
        // new thread, the thread creation must be deferred to the main JS thread.
        threadParams.cmd = 'spawnThread';
        postMessage(threadParams, transferList);
        // When we defer thread creation this way, we have no way to detect thread
        // creation synchronously today, so we have to assume success and return 0.
        return 0;
      }
  
      // We are the main thread, so we have the pthread warmup pool in this
      // thread and can fire off JS thread creation directly ourselves.
      return spawnThread(threadParams);
    };

  var __abort_js = () =>
      abort('native code called abort()');

  var __emscripten_init_main_thread_js = (tb) => {
      // Pass the thread address to the native code where they stored in wasm
      // globals which act as a form of TLS. Global constructors trying
      // to access this value will read the wrong value, but that is UB anyway.
      __emscripten_thread_init(
        tb,
        /*is_main=*/!ENVIRONMENT_IS_WORKER,
        /*is_runtime=*/1,
        /*can_block=*/!ENVIRONMENT_IS_WEB,
        /*default_stacksize=*/65536,
        /*start_profiling=*/false,
      );
      PThread.threadInitTLS();
    };

  
  
  
  
  var maybeExit = () => {
      if (!keepRuntimeAlive()) {
        try {
          if (ENVIRONMENT_IS_PTHREAD) __emscripten_thread_exit(EXITSTATUS);
          else
          _exit(EXITSTATUS);
        } catch (e) {
          handleException(e);
        }
      }
    };
  var callUserCallback = (func) => {
      if (ABORT) {
        err('user callback triggered after runtime exited or application aborted.  Ignoring.');
        return;
      }
      try {
        func();
        maybeExit();
      } catch (e) {
        handleException(e);
      }
    };
  
  
  
  var __emscripten_thread_mailbox_await = (pthread_ptr) => {
      if (typeof Atomics.waitAsync === 'function') {
        // Wait on the pthread's initial self-pointer field because it is easy and
        // safe to access from sending threads that need to notify the waiting
        // thread.
        // TODO: How to make this work with wasm64?
        var wait = Atomics.waitAsync(HEAP32, ((pthread_ptr)>>2), pthread_ptr);
        assert(wait.async);
        wait.value.then(checkMailbox);
        var waitingAsync = pthread_ptr + 128;
        Atomics.store(HEAP32, ((waitingAsync)>>2), 1);
      }
      // If `Atomics.waitAsync` is not implemented, then we will always fall back
      // to postMessage and there is no need to do anything here.
    };
  
  var checkMailbox = () => {
      // Only check the mailbox if we have a live pthread runtime. We implement
      // pthread_self to return 0 if there is no live runtime.
      var pthread_ptr = _pthread_self();
      if (pthread_ptr) {
        // If we are using Atomics.waitAsync as our notification mechanism, wait
        // for a notification before processing the mailbox to avoid missing any
        // work that could otherwise arrive after we've finished processing the
        // mailbox and before we're ready for the next notification.
        __emscripten_thread_mailbox_await(pthread_ptr);
        callUserCallback(__emscripten_check_mailbox);
      }
    };
  
  var __emscripten_notify_mailbox_postmessage = (targetThread, currThreadId) => {
      if (targetThread == currThreadId) {
        setTimeout(checkMailbox);
      } else if (ENVIRONMENT_IS_PTHREAD) {
        postMessage({targetThread, cmd: 'checkMailbox'});
      } else {
        var worker = PThread.pthreads[targetThread];
        if (!worker) {
          err(`Cannot send message to thread with ID ${targetThread}, unknown thread ID!`);
          return;
        }
        worker.postMessage({cmd: 'checkMailbox'});
      }
    };

  
  var proxiedJSCallArgs = [];
  
  var __emscripten_receive_on_main_thread_js = (funcIndex, emAsmAddr, callingThread, numCallArgs, args) => {
      // Sometimes we need to backproxy events to the calling thread (e.g.
      // HTML5 DOM events handlers such as
      // emscripten_set_mousemove_callback()), so keep track in a globally
      // accessible variable about the thread that initiated the proxying.
      numCallArgs /= 2;
      proxiedJSCallArgs.length = numCallArgs;
      var b = ((args)>>3);
      for (var i = 0; i < numCallArgs; i++) {
        if (HEAP64[b + 2*i]) {
          // It's a BigInt.
          proxiedJSCallArgs[i] = HEAP64[b + 2*i + 1];
        } else {
          // It's a Number.
          proxiedJSCallArgs[i] = HEAPF64[b + 2*i + 1];
        }
      }
      // Proxied JS library funcs use funcIndex and EM_ASM functions use emAsmAddr
      assert(!emAsmAddr);
      var func = proxiedFunctionTable[funcIndex];
      assert(!(funcIndex && emAsmAddr));
      assert(func.length == numCallArgs, 'Call args mismatch in _emscripten_receive_on_main_thread_js');
      PThread.currentProxiedOperationCallerThread = callingThread;
      var rtn = func(...proxiedJSCallArgs);
      PThread.currentProxiedOperationCallerThread = 0;
      // Proxied functions can return any type except bigint.  All other types
      // cooerce to f64/double (the return type of this function in C) but not
      // bigint.
      assert(typeof rtn != "bigint");
      return rtn;
    };

  var __emscripten_runtime_keepalive_clear = () => {
      noExitRuntime = false;
      runtimeKeepaliveCounter = 0;
    };

  var __emscripten_thread_cleanup = (thread) => {
      // Called when a thread needs to be cleaned up so it can be reused.
      // A thread is considered reusable when it either returns from its
      // entry point, calls pthread_exit, or acts upon a cancellation.
      // Detached threads are responsible for calling this themselves,
      // otherwise pthread_join is responsible for calling this.
      if (!ENVIRONMENT_IS_PTHREAD) cleanupThread(thread);
      else postMessage({ cmd: 'cleanupThread', thread });
    };


  var __emscripten_thread_set_strongref = (thread) => {
      // Called when a thread needs to be strongly referenced.
      // Currently only used for:
      // - keeping the "main" thread alive in PROXY_TO_PTHREAD mode;
      // - crashed threads that needs to propagate the uncaught exception
      //   back to the main thread.
      if (ENVIRONMENT_IS_NODE) {
        PThread.pthreads[thread].ref();
      }
    };

  var __wasmfs_copy_preloaded_file_data = (index, buffer) =>
      HEAPU8.set(wasmFSPreloadedFiles[index].fileData, buffer);

  var wasmFSPreloadedDirs = [];
  var __wasmfs_get_num_preloaded_dirs = () => wasmFSPreloadedDirs.length;

  var wasmFSPreloadedFiles = [];
  
  var wasmFSPreloadingFlushed = false;
  var __wasmfs_get_num_preloaded_files = () => {
      // When this method is called from WasmFS it means that we are about to
      // flush all the preloaded data, so mark that. (There is no call that
      // occurs at the end of that flushing, which would be more natural, but it
      // is fine to mark the flushing here as during the flushing itself no user
      // code can run, so nothing will check whether we have flushed or not.)
      wasmFSPreloadingFlushed = true;
      return wasmFSPreloadedFiles.length;
    };

  var __wasmfs_get_preloaded_child_path = (index, childNameBuffer) => {
      var s = wasmFSPreloadedDirs[index].childName;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, childNameBuffer, len);
    };

  var __wasmfs_get_preloaded_file_mode = (index) => wasmFSPreloadedFiles[index].mode;

  var __wasmfs_get_preloaded_file_size = (index) =>
      wasmFSPreloadedFiles[index].fileData.length;

  var __wasmfs_get_preloaded_parent_path = (index, parentPathBuffer) => {
      var s = wasmFSPreloadedDirs[index].parentPath;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, parentPathBuffer, len);
    };

  var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var c = str.charCodeAt(i); // possibly a lead surrogate
        if (c <= 0x7F) {
          len++;
        } else if (c <= 0x7FF) {
          len += 2;
        } else if (c >= 0xD800 && c <= 0xDFFF) {
          len += 4; ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
  
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`);
      // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
      // undefined and false each don't write out any bytes.
      if (!(maxBytesToWrite > 0))
        return 0;
  
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
        // and https://www.ietf.org/rfc/rfc2279.txt
        // and https://tools.ietf.org/html/rfc3629
        var u = str.charCodeAt(i); // possibly a lead surrogate
        if (u >= 0xD800 && u <= 0xDFFF) {
          var u1 = str.charCodeAt(++i);
          u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
        }
        if (u <= 0x7F) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 0x7FF) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 0xC0 | (u >> 6);
          heap[outIdx++] = 0x80 | (u & 63);
        } else if (u <= 0xFFFF) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 0xE0 | (u >> 12);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          if (u > 0x10FFFF) warnOnce('Invalid Unicode code point ' + ptrToString(u) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).');
          heap[outIdx++] = 0xF0 | (u >> 18);
          heap[outIdx++] = 0x80 | ((u >> 12) & 63);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
        }
      }
      // Null-terminate the pointer to the buffer.
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    };
  var __wasmfs_get_preloaded_path_name = (index, fileNameBuffer) => {
      var s = wasmFSPreloadedFiles[index].pathName;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, fileNameBuffer, len);
    };

  var __wasmfs_jsimpl_alloc_file = (backend, file) => {
      assert(wasmFS$backends[backend]);
      return wasmFS$backends[backend].allocFile(file);
    };

  var __wasmfs_jsimpl_free_file = (backend, file) => {
      assert(wasmFS$backends[backend]);
      return wasmFS$backends[backend].freeFile(file);
    };

  var __wasmfs_jsimpl_get_size = (backend, file) => {
      assert(wasmFS$backends[backend]);
      return wasmFS$backends[backend].getSize(file);
    };

  function __wasmfs_jsimpl_read(backend, file, buffer, length, offset) {
    offset = bigintToI53Checked(offset);
  
  
      assert(wasmFS$backends[backend]);
      if (!wasmFS$backends[backend].read) {
        return -28;
      }
      return wasmFS$backends[backend].read(file, buffer, length, offset);
    ;
  }

  function __wasmfs_jsimpl_set_size(backend, file, size) {
    size = bigintToI53Checked(size);
  
  
      assert(wasmFS$backends[backend]);
      return wasmFS$backends[backend].setSize(file, size);
    ;
  }

  function __wasmfs_jsimpl_write(backend, file, buffer, length, offset) {
    offset = bigintToI53Checked(offset);
  
  
      assert(wasmFS$backends[backend]);
      if (!wasmFS$backends[backend].write) {
        return -28;
      }
      return wasmFS$backends[backend].write(file, buffer, length, offset);
    ;
  }

  class HandleAllocator {
      allocated = [undefined];
      freelist = [];
      get(id) {
        assert(this.allocated[id] !== undefined, `invalid handle: ${id}`);
        return this.allocated[id];
      }
      has(id) {
        return this.allocated[id] !== undefined;
      }
      allocate(handle) {
        var id = this.freelist.pop() || this.allocated.length;
        this.allocated[id] = handle;
        return id;
      }
      free(id) {
        assert(this.allocated[id] !== undefined);
        // Set the slot to `undefined` rather than using `delete` here since
        // apparently arrays with holes in them can be less efficient.
        this.allocated[id] = undefined;
        this.freelist.push(id);
      }
    }
  var wasmfsOPFSAccessHandles = new HandleAllocator();
  
  var wasmfsOPFSProxyFinish = (ctx) => {
      // When using pthreads the proxy needs to know when the work is finished.
      // When used with JSPI the work will be executed in an async block so there
      // is no need to notify when done.
      _emscripten_proxy_finish(ctx);
    };
  async function __wasmfs_opfs_close_access(ctx, accessID, errPtr) {
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      try {
        await accessHandle.close();
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSAccessHandles.free(accessID);
      wasmfsOPFSProxyFinish(ctx);
    }

  var wasmfsOPFSBlobs = new HandleAllocator();
  var __wasmfs_opfs_close_blob = (blobID) => {
      wasmfsOPFSBlobs.free(blobID);
    };

  
  async function __wasmfs_opfs_flush_access(ctx, accessID, errPtr) {
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      try {
        await accessHandle.flush();
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    }

  var wasmfsOPFSDirectoryHandles = new HandleAllocator();
  var __wasmfs_opfs_free_directory = (dirID) => {
      wasmfsOPFSDirectoryHandles.free(dirID);
    };

  var wasmfsOPFSFileHandles = new HandleAllocator();
  var __wasmfs_opfs_free_file = (fileID) => {
      wasmfsOPFSFileHandles.free(fileID);
    };

  
  async function wasmfsOPFSGetOrCreateFile(parent, name, create) {
      let parentHandle = wasmfsOPFSDirectoryHandles.get(parent);
      let fileHandle;
      try {
        fileHandle = await parentHandle.getFileHandle(name, {create: create});
      } catch (e) {
        if (e.name === "NotFoundError") {
          return -20;
        }
        if (e.name === "TypeMismatchError") {
          return -31;
        }
        err('unexpected error:', e, e.stack);
        return -29;
      }
      return wasmfsOPFSFileHandles.allocate(fileHandle);
    }
  
  async function wasmfsOPFSGetOrCreateDir(parent, name, create) {
      let parentHandle = wasmfsOPFSDirectoryHandles.get(parent);
      let childHandle;
      try {
        childHandle =
            await parentHandle.getDirectoryHandle(name, {create: create});
      } catch (e) {
        if (e.name === "NotFoundError") {
          return -20;
        }
        if (e.name === "TypeMismatchError") {
          return -54;
        }
        err('unexpected error:', e, e.stack);
        return -29;
      }
      return wasmfsOPFSDirectoryHandles.allocate(childHandle);
    }
  
  
  async function __wasmfs_opfs_get_child(ctx, parent, namePtr, childTypePtr, childIDPtr) {
      let name = UTF8ToString(namePtr);
      let childType = 1;
      let childID = await wasmfsOPFSGetOrCreateFile(parent, name, false);
      if (childID == -31) {
        childType = 2;
        childID = await wasmfsOPFSGetOrCreateDir(parent, name, false);
      }
      HEAP32[((childTypePtr)>>2)] = childType;
      HEAP32[((childIDPtr)>>2)] = childID;
      wasmfsOPFSProxyFinish(ctx);
    }

  
  
  
  async function __wasmfs_opfs_get_entries(ctx, dirID, entriesPtr, errPtr) {
      let dirHandle = wasmfsOPFSDirectoryHandles.get(dirID);
  
      // TODO: Use 'for await' once Acorn supports that.
      try {
        let iter = dirHandle.entries();
        for (let entry; entry = await iter.next(), !entry.done;) {
          let [name, child] = entry.value;
          let sp = stackSave();
          let namePtr = stringToUTF8OnStack(name);
          let type = child.kind == "file" ?
              1 :
          2;
            __wasmfs_opfs_record_entry(entriesPtr, namePtr, type)
          stackRestore(sp);
        }
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    }

  
  async function __wasmfs_opfs_get_size_access(ctx, accessID, sizePtr) {
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      let size;
      try {
        size = await accessHandle.getSize();
      } catch {
        size = -29;
      }
      HEAP64[((sizePtr)>>3)] = BigInt(size);
      wasmfsOPFSProxyFinish(ctx);
    }

  
  var __wasmfs_opfs_get_size_blob = function(blobID) {
  
  var ret = (() => { 
      // This cannot fail.
  	  return wasmfsOPFSBlobs.get(blobID).size;
     })();
  return BigInt(ret);
  };

  
  async function __wasmfs_opfs_get_size_file(ctx, fileID, sizePtr) {
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let size;
      try {
        size = (await fileHandle.getFile()).size;
      } catch {
        size = -29;
      }
      HEAP64[((sizePtr)>>3)] = BigInt(size);
      wasmfsOPFSProxyFinish(ctx);
    }

  
  async function __wasmfs_opfs_init_root_directory(ctx) {
      // allocated.length starts off as 1 since 0 is a reserved handle
      if (wasmfsOPFSDirectoryHandles.allocated.length == 1) {
        // Closure compiler errors on this as it does not recognize the OPFS
        // API yet, it seems. Unfortunately an existing annotation for this is in
        // the closure compiler codebase, and cannot be overridden in user code
        // (it complains on a duplicate type annotation), so just suppress it.
        /** @suppress {checkTypes} */
        let root = await navigator.storage.getDirectory();
        wasmfsOPFSDirectoryHandles.allocated.push(root);
      }
      wasmfsOPFSProxyFinish(ctx);
    }

  
  
  async function __wasmfs_opfs_insert_directory(ctx, parent, namePtr, childIDPtr) {
      let name = UTF8ToString(namePtr);
      let childID = await wasmfsOPFSGetOrCreateDir(parent, name, true);
      HEAP32[((childIDPtr)>>2)] = childID;
      wasmfsOPFSProxyFinish(ctx);
    }

  
  
  async function __wasmfs_opfs_insert_file(ctx, parent, namePtr, childIDPtr) {
      let name = UTF8ToString(namePtr);
      let childID = await wasmfsOPFSGetOrCreateFile(parent, name, true);
      HEAP32[((childIDPtr)>>2)] = childID;
      wasmfsOPFSProxyFinish(ctx);
    }

  
  
  
  async function __wasmfs_opfs_move_file(ctx, fileID, newParentID, namePtr, errPtr) {
      let name = UTF8ToString(namePtr);
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let newDirHandle = wasmfsOPFSDirectoryHandles.get(newParentID);
      try {
        await fileHandle.move(newDirHandle, name);
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    }

  
  
  async function __wasmfs_opfs_open_access(ctx, fileID, accessIDPtr) {
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let accessID;
      try {
        let accessHandle;
        // TODO: Remove this once the Access Handles API has settled.
        // TODO: Closure is confused by this code that supports two versions of
        //       the same API, so suppress type checking on it.
        /** @suppress {checkTypes} */
        var len = FileSystemFileHandle.prototype.createSyncAccessHandle.length;
        if (len == 0) {
          accessHandle = await fileHandle.createSyncAccessHandle();
        } else {
          accessHandle = await fileHandle.createSyncAccessHandle(
              {mode: "in-place"});
        }
        accessID = wasmfsOPFSAccessHandles.allocate(accessHandle);
      } catch (e) {
        // TODO: Presumably only one of these will appear in the final API?
        if (e.name === "InvalidStateError" ||
            e.name === "NoModificationAllowedError") {
          accessID = -2;
        } else {
          err('unexpected error:', e, e.stack);
          accessID = -29;
        }
      }
      HEAP32[((accessIDPtr)>>2)] = accessID;
      wasmfsOPFSProxyFinish(ctx);
    }

  
  
  async function __wasmfs_opfs_open_blob(ctx, fileID, blobIDPtr) {
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let blobID;
      try {
        let blob = await fileHandle.getFile();
        blobID = wasmfsOPFSBlobs.allocate(blob);
      } catch (e) {
        if (e.name === "NotAllowedError") {
          blobID = -2;
        } else {
          err('unexpected error:', e, e.stack);
          blobID = -29;
        }
      }
      HEAP32[((blobIDPtr)>>2)] = blobID;
      wasmfsOPFSProxyFinish(ctx);
    }

  
  function __wasmfs_opfs_read_access(accessID, bufPtr, len, pos) {
    pos = bigintToI53Checked(pos);
  
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      let data = HEAPU8.subarray(bufPtr, bufPtr + len);
      try {
        return accessHandle.read(data, {at: pos});
      } catch (e) {
        if (e.name == "TypeError") {
          return -28;
        }
        err('unexpected error:', e, e.stack);
        return -29;
      }
    ;
  }

  
  
  async function __wasmfs_opfs_read_blob(ctx, blobID, bufPtr, len, pos, nreadPtr) {
    pos = bigintToI53Checked(pos);
  
  
      let blob = wasmfsOPFSBlobs.get(blobID);
      let slice = blob.slice(pos, pos + len);
      let nread = 0;
  
      try {
        // TODO: Use ReadableStreamBYOBReader once
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1189621 is
        // resolved.
        let buf = await slice.arrayBuffer();
        let data = new Uint8Array(buf);
        HEAPU8.set(data, bufPtr);
        nread += data.length;
      } catch (e) {
        if (e instanceof RangeError) {
          nread = -21;
        } else {
          err('unexpected error:', e, e.stack);
          nread = -29;
        }
      }
  
      HEAP32[((nreadPtr)>>2)] = nread;
      wasmfsOPFSProxyFinish(ctx);
    ;
  }

  
  
  async function __wasmfs_opfs_remove_child(ctx, dirID, namePtr, errPtr) {
      let name = UTF8ToString(namePtr);
      let dirHandle = wasmfsOPFSDirectoryHandles.get(dirID);
      try {
        await dirHandle.removeEntry(name);
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    }

  
  
  async function __wasmfs_opfs_set_size_access(ctx, accessID, size, errPtr) {
    size = bigintToI53Checked(size);
  
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      try {
        await accessHandle.truncate(size);
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    ;
  }

  
  
  async function __wasmfs_opfs_set_size_file(ctx, fileID, size, errPtr) {
    size = bigintToI53Checked(size);
  
  
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      try {
        let writable = await fileHandle.createWritable({keepExistingData: true});
        await writable.truncate(size);
        await writable.close();
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    ;
  }

  
  function __wasmfs_opfs_write_access(accessID, bufPtr, len, pos) {
    pos = bigintToI53Checked(pos);
  
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      let data = HEAPU8.subarray(bufPtr, bufPtr + len);
      try {
        return accessHandle.write(data, {at: pos});
      } catch (e) {
        if (e.name == "TypeError") {
          return -28;
        }
        err('unexpected error:', e, e.stack);
        return -29;
      }
    ;
  }

  var FS_stdin_getChar_buffer = [];
  
  
  /** @type {function(string, boolean=, number=)} */
  var intArrayFromString = (stringy, dontAddNull, length) => {
      var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
      if (dontAddNull) u8array.length = numBytesWritten;
      return u8array;
    };
  var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
  
          // For some reason we must suppress a closure warning here, even though
          // fd definitely exists on process.stdin, and is even the proper way to
          // get the fd of stdin,
          // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
          // This started to happen after moving this logic out of library_tty.js,
          // so it is related to the surrounding code in some unclear manner.
          /** @suppress {missingProperties} */
          var fd = process.stdin.fd;
  
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch(e) {
            // Cross-platform differences: on Windows, reading EOF throws an
            // exception, but on other OSes, reading EOF returns 0. Uniformize
            // behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }
  
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          }
        } else
        if (typeof window != 'undefined' &&
          typeof window.prompt == 'function') {
          // Browser.
          result = window.prompt('Input: ');  // returns null on cancel
          if (result !== null) {
            result += '\n';
          }
        } else
        {}
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
  var __wasmfs_stdin_get_char = () => {
      // Return the read character, or -1 to indicate EOF.
      var c = FS_stdin_getChar();
      if (typeof c === 'number') {
        return c;
      }
      return -1;
    };

  var __wasmfs_thread_utils_heartbeat = (queue) => {
      var intervalID =
        setInterval(() => {
          if (ABORT) {
            clearInterval(intervalID);
          } else {
            _emscripten_proxy_execute_queue(queue);
          }
        }, 50);
    };

  var _emscripten_get_now = () => performance.timeOrigin + performance.now();
  
  var _emscripten_date_now = () => Date.now();
  
  var nowIsMonotonic = 1;
  
  var checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;
  
  function _clock_time_get(clk_id, ignored_precision, ptime) {
    ignored_precision = bigintToI53Checked(ignored_precision);
  
  
      if (!checkWasiClock(clk_id)) {
        return 28;
      }
      var now;
      // all wasi clocks but realtime are monotonic
      if (clk_id === 0) {
        now = _emscripten_date_now();
      } else if (nowIsMonotonic) {
        now = _emscripten_get_now();
      } else {
        return 52;
      }
      // "now" is in ms, and wasi times are in ns.
      var nsec = Math.round(now * 1000 * 1000);
      HEAP64[((ptime)>>3)] = BigInt(nsec);
      return 0;
    ;
  }

  
  var _emscripten_check_blocking_allowed = () => {
      if (ENVIRONMENT_IS_NODE) return;
  
      if (ENVIRONMENT_IS_WORKER) return; // Blocking in a worker/pthread is fine.
  
      warnOnce('Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread');
  
    };


  var _emscripten_err = (str) => err(UTF8ToString(str));

  var _emscripten_exit_with_live_runtime = () => {
      runtimeKeepalivePush();
      throw 'unwind';
    };


  var _emscripten_has_asyncify = () => 0;

  var _emscripten_memprof_sbrk_grow = (old_brk, new_brk) => {
      emscriptenMemoryProfiler.onSbrkGrow(old_brk, new_brk);
    };

  var _emscripten_out = (str) => out(UTF8ToString(str));

  var getHeapMax = () =>
      HEAPU8.length;
  
  var alignMemory = (size, alignment) => {
      assert(alignment, "alignment argument is required");
      return Math.ceil(size / alignment) * alignment;
    };
  
  var abortOnCannotGrowMemory = (requestedSize) => {
      abort(`Cannot enlarge memory arrays to size ${requestedSize} bytes (OOM). Either (1) compile with -sINITIAL_MEMORY=X with X higher than the current value ${HEAP8.length}, (2) compile with -sALLOW_MEMORY_GROWTH which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with -sABORTING_MALLOC=0`);
    };
  var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0;
      abortOnCannotGrowMemory(requestedSize);
    };

  var _emscripten_runtime_keepalive_check = keepRuntimeAlive;

  var traceConfigure = (collector_url, application) => {
      EmscriptenTrace.configure(collector_url, application);
    };
  
  var _emscripten_trace_configure_for_google_wtf = () => {
      EmscriptenTrace.configureForGoogleWTF();
    };
  
  var traceEnterContext = (name) => {
      if (EmscriptenTrace.postEnabled) {
        var now = EmscriptenTrace.now();
        EmscriptenTrace.post([EmscriptenTrace.EVENT_ENTER_CONTEXT,
                              now, name]);
      }
      if (EmscriptenTrace.googleWTFEnabled) {
        EmscriptenTrace.googleWTFEnterScope(name);
      }
    };
  
  var _emscripten_trace_exit_context = () => {
      if (EmscriptenTrace.postEnabled) {
        var now = EmscriptenTrace.now();
        EmscriptenTrace.post([EmscriptenTrace.EVENT_EXIT_CONTEXT, now]);
      }
      if (EmscriptenTrace.googleWTFEnabled) {
        EmscriptenTrace.googleWTFExitScope();
      }
    };
  
  var traceLogMessage = (channel, message) => {
      if (EmscriptenTrace.postEnabled) {
        var now = EmscriptenTrace.now();
        EmscriptenTrace.post([EmscriptenTrace.EVENT_LOG_MESSAGE, now,
                              channel, message]);
      }
    };
  
  var traceMark = (message) => {
      if (EmscriptenTrace.postEnabled) {
        var now = EmscriptenTrace.now();
        EmscriptenTrace.post([EmscriptenTrace.EVENT_LOG_MESSAGE, now,
                              "MARK", message]);
      }
      if (EmscriptenTrace.googleWTFEnabled) {
        window['wtf'].trace.mark(message);
      }
    };
  
  
  var EmscriptenTrace = {
  worker:null,
  collectorEnabled:false,
  googleWTFEnabled:false,
  testingEnabled:false,
  googleWTFData:{
  scopeStack:[],
  cachedScopes:{
  },
  },
  DATA_VERSION:1,
  EVENT_ALLOCATE:"allocate",
  EVENT_ANNOTATE_TYPE:"annotate-type",
  EVENT_APPLICATION_NAME:"application-name",
  EVENT_ASSOCIATE_STORAGE_SIZE:"associate-storage-size",
  EVENT_ENTER_CONTEXT:"enter-context",
  EVENT_EXIT_CONTEXT:"exit-context",
  EVENT_FRAME_END:"frame-end",
  EVENT_FRAME_RATE:"frame-rate",
  EVENT_FRAME_START:"frame-start",
  EVENT_FREE:"free",
  EVENT_LOG_MESSAGE:"log-message",
  EVENT_MEMORY_LAYOUT:"memory-layout",
  EVENT_OFF_HEAP:"off-heap",
  EVENT_REALLOCATE:"reallocate",
  EVENT_REPORT_ERROR:"report-error",
  EVENT_SESSION_NAME:"session-name",
  EVENT_TASK_ASSOCIATE_DATA:"task-associate-data",
  EVENT_TASK_END:"task-end",
  EVENT_TASK_RESUME:"task-resume",
  EVENT_TASK_START:"task-start",
  EVENT_TASK_SUSPEND:"task-suspend",
  EVENT_USER_NAME:"user-name",
  init:() => {
        Module['emscripten_trace_configure'] = traceConfigure;
        Module['emscripten_trace_configure_for_google_wtf'] = _emscripten_trace_configure_for_google_wtf;
        Module['emscripten_trace_enter_context'] = traceEnterContext;
        Module['emscripten_trace_exit_context'] = _emscripten_trace_exit_context;
        Module['emscripten_trace_log_message'] = traceLogMessage;
        Module['emscripten_trace_mark'] = traceMark;
      },
  fetchBlob:async (url) => {
         var rsp = await fetch(url);
         return rsp.blob();
      },
  configure:async (collector_url, application) => {
        EmscriptenTrace.now = _emscripten_get_now;
        var now = new Date();
        var session_id = now.getTime().toString() + '_' +
                            Math.floor((Math.random() * 100) + 1).toString();
        var blob = await EmscriptenTrace.fetchBlob(collector_url + 'worker.js');
        EmscriptenTrace.worker = new Worker(window.URL.createObjectURL(blob));
        EmscriptenTrace.worker.addEventListener('error', (e) => {
          out('TRACE WORKER ERROR:');
          out(e);
        }, false);
        EmscriptenTrace.worker.postMessage({ 'cmd': 'configure',
                                             'data_version': EmscriptenTrace.DATA_VERSION,
                                             'session_id': session_id,
                                             'url': collector_url });
        EmscriptenTrace.configured = true;
        EmscriptenTrace.collectorEnabled = true;
        EmscriptenTrace.postEnabled = true;
        EmscriptenTrace.post([EmscriptenTrace.EVENT_APPLICATION_NAME, application]);
        EmscriptenTrace.post([EmscriptenTrace.EVENT_SESSION_NAME, now.toISOString()]);
      },
  configureForTest:() => {
        EmscriptenTrace.postEnabled = true;
        EmscriptenTrace.testingEnabled = true;
        EmscriptenTrace.now = () => 0.0;
      },
  configureForGoogleWTF:() => {
        if (window?.['wtf']) {
          EmscriptenTrace.googleWTFEnabled = true;
        } else {
          out('GOOGLE WTF NOT AVAILABLE TO ENABLE');
        }
      },
  post:(entry) => {
        if (EmscriptenTrace.postEnabled && EmscriptenTrace.collectorEnabled) {
          EmscriptenTrace.worker.postMessage({ 'cmd': 'post',
                                               'entry': entry });
        } else if (EmscriptenTrace.postEnabled && EmscriptenTrace.testingEnabled) {
          out('Tracing ' + entry);
        }
      },
  googleWTFEnterScope:(name) => {
        var scopeEvent = EmscriptenTrace.googleWTFData['cachedScopes'][name];
        if (!scopeEvent) {
          scopeEvent = window['wtf'].trace.events.createScope(name);
          EmscriptenTrace.googleWTFData['cachedScopes'][name] = scopeEvent;
        }
        var scope = scopeEvent();
        EmscriptenTrace.googleWTFData['scopeStack'].push(scope);
      },
  googleWTFExitScope:() => {
        var scope = EmscriptenTrace.googleWTFData['scopeStack'].pop();
        window['wtf'].trace.leaveScope(scope);
      },
  };
  var _emscripten_trace_record_allocation = (address, size) => {
      Module['onMalloc']?.(address, size);
      if (EmscriptenTrace.postEnabled) {
        var now = EmscriptenTrace.now();
        EmscriptenTrace.post([EmscriptenTrace.EVENT_ALLOCATE,
                              now, address, size]);
      }
    };

  var _emscripten_trace_record_free = (address) => {
      Module['onFree']?.(address);
      if (EmscriptenTrace.postEnabled) {
        var now = EmscriptenTrace.now();
        EmscriptenTrace.post([EmscriptenTrace.EVENT_FREE,
                              now, address]);
      }
    };

  var _emscripten_trace_record_reallocation = (old_address, new_address, size) => {
      Module['onRealloc']?.(old_address, new_address, size);
      if (EmscriptenTrace.postEnabled) {
        var now = EmscriptenTrace.now();
        EmscriptenTrace.post([EmscriptenTrace.EVENT_REALLOCATE,
                              now, old_address, new_address, size]);
      }
    };

  var _emscripten_unwind_to_js_event_loop = () => {
      throw 'unwind';
    };



  var initRandomFill = () => {
      // This block is not needed on v19+ since crypto.getRandomValues is builtin
      if (ENVIRONMENT_IS_NODE) {
        var nodeCrypto = require('crypto');
        return (view) => nodeCrypto.randomFillSync(view);
      }
  
      // like with most Web APIs, we can't use Web Crypto API directly on shared memory,
      // so we need to create an intermediate buffer and copy it to the destination
      return (view) => view.set(crypto.getRandomValues(new Uint8Array(view.byteLength)));
    };
  var randomFill = (view) => {
      // Lazily init on the first invocation.
      (randomFill = initRandomFill())(view);
    };
  var _random_get = (buffer, size) => {
      randomFill(HEAPU8.subarray(buffer, buffer + size));
      return 0;
    };



  var MEMFS = {
  createBackend(opts) {
        return _wasmfs_create_memory_backend();
      },
  };
  
  
  
  
  var PATH = {
  isAbs:(path) => path.charAt(0) === '/',
  splitPath:(filename) => {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
  normalizeArray:(parts, allowAboveRoot) => {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },
  normalize:(path) => {
        var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.slice(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter((p) => !!p), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },
  dirname:(path) => {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.slice(0, -1);
        }
        return root + dir;
      },
  basename:(path) => path && path.match(/([^\/]+|\/)\/*$/)[1],
  join:(...paths) => PATH.normalize(paths.join('/')),
  join2:(l, r) => PATH.normalize(l + '/' + r),
  };
  
  
  
  var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };
  
  
  var withStackSave = (f) => {
      var stack = stackSave();
      var ret = f();
      stackRestore(stack);
      return ret;
    };
  
  var readI53FromI64 = (ptr) => {
      return HEAPU32[((ptr)>>2)] + HEAP32[(((ptr)+(4))>>2)] * 4294967296;
    };
  
  var readI53FromU64 = (ptr) => {
      return HEAPU32[((ptr)>>2)] + HEAPU32[(((ptr)+(4))>>2)] * 4294967296;
    };
  
  
  
  var FS_mknod = (path, mode, dev) => FS.handleError(withStackSave(() => {
      var pathBuffer = stringToUTF8OnStack(path);
      return __wasmfs_mknod(pathBuffer, mode, dev);
    }));
  var FS_create = (path, mode = 0o666) => {
      mode &= 4095;
      mode |= 32768;
      return FS_mknod(path, mode, 0);
    };
  
  
  
  var FS_writeFile = (path, data) => {
      var sp = stackSave();
      var pathBuffer = stringToUTF8OnStack(path);
      if (typeof data == 'string') {
        var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
        var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
        data = buf.slice(0, actualNumBytes);
      }
      var dataBuffer = _malloc(data.length);
      assert(dataBuffer);
      for (var i = 0; i < data.length; i++) {
        HEAP8[(dataBuffer)+(i)] = data[i];
      }
      var ret = __wasmfs_write_file(pathBuffer, dataBuffer, data.length);
      _free(dataBuffer);
      stackRestore(sp);
      return ret;
    };
  var FS_createDataFile = (parent, name, fileData, canRead, canWrite, canOwn) => {
      var pathName = name ? parent + '/' + name : parent;
      var mode = FS_getMode(canRead, canWrite);
  
      if (!wasmFSPreloadingFlushed) {
        // WasmFS code in the wasm is not ready to be called yet. Cache the
        // files we want to create here in JS, and WasmFS will read them
        // later.
        wasmFSPreloadedFiles.push({pathName, fileData, mode});
      } else {
        // WasmFS is already running, so create the file normally.
        FS_create(pathName, mode);
        FS_writeFile(pathName, fileData);
      }
    };
  
  var asyncLoad = async (url) => {
      var arrayBuffer = await readAsync(url);
      assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
      return new Uint8Array(arrayBuffer);
    };
  
  
  
  var PATH_FS = {
  resolve:(...args) => {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? args[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path != 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = PATH.isAbs(path);
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter((p) => !!p), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },
  relative:(from, to) => {
        from = PATH_FS.resolve(from).slice(1);
        to = PATH_FS.resolve(to).slice(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      },
  };
  
  
  var preloadPlugins = Module['preloadPlugins'] || [];
  var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
      // Ensure plugins are ready.
      if (typeof Browser != 'undefined') Browser.init();
  
      var handled = false;
      preloadPlugins.forEach((plugin) => {
        if (handled) return;
        if (plugin['canHandle'](fullname)) {
          plugin['handle'](byteArray, fullname, finish, onerror);
          handled = true;
        }
      });
      return handled;
    };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
      // TODO we should allow people to just pass in a complete filename instead
      // of parent and name being that we just join them anyways
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
      function processData(byteArray) {
        function finish(byteArray) {
          preFinish?.();
          if (!dontCreateFile) {
            FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
          }
          onload?.();
          removeRunDependency(dep);
        }
        if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
          onerror?.();
          removeRunDependency(dep);
        })) {
          return;
        }
        finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == 'string') {
        asyncLoad(url).then(processData, onerror);
      } else {
        processData(url);
      }
    };
  
  var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
  
  
  var FS_modeStringToFlags = (str) => {
      var flagModes = {
        'r': 0,
        'r+': 2,
        'w': 512 | 64 | 1,
        'w+': 512 | 64 | 2,
        'a': 1024 | 64 | 1,
        'a+': 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == 'undefined') {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
  
  
  
  var FS_mkdir = (path, mode = 0o777) => FS.handleError(withStackSave(() => {
      var buffer = stringToUTF8OnStack(path);
      return __wasmfs_mkdir(buffer, mode);
    }));
  
  
    /**
     * @param {number=} mode Optionally, the mode to create in. Uses mkdir's
     *                       default if not set.
     */
  var FS_mkdirTree = (path, mode) => {
      var dirs = path.split('/');
      var d = '';
      for (var dir of dirs) {
        if (!dir) continue;
        d += '/' + dir;
        try {
          FS_mkdir(d, mode);
        } catch(e) {
          if (e.errno != 20) throw e;
        }
      }
    };
  
  
  var FS_unlink = (path) => withStackSave(() => {
      var buffer = stringToUTF8OnStack(path);
      return __wasmfs_unlink(buffer);
    });
  
  var OPFS = {
  createBackend(opts) {
        return _wasmfs_create_opfs_backend();
      },
  };
  
  
  
  
  var wasmFS$backends = {
  };
  
  var wasmFSDevices = {
  };
  
  var wasmFSDeviceStreams = {
  };
  
  var FS = {
  ErrnoError:class extends Error {
        name = 'ErrnoError';
        message = 'FS error';
        constructor(code) {
          super();
          this.errno = code
        }
      },
  handleError(returnValue) {
        // Assume errors correspond to negative returnValues
        // since some functions like _wasmfs_open() return positive
        // numbers on success (some callers of this function may need to negate the parameter).
        if (returnValue < 0) {
          throw new FS.ErrnoError(-returnValue);
        }
  
        return returnValue;
      },
  createDataFile(parent, name, fileData, canRead, canWrite, canOwn) {
        FS_createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
      },
  createPath(parent, path, canRead, canWrite) {
        // Cache file path directory names.
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          if (!wasmFSPreloadingFlushed) {
            wasmFSPreloadedDirs.push({parentPath: parent, childName: part});
          } else {
            try {
              FS.mkdir(current);
            } catch (e) {
              if (e.errno != 20) throw e;
            }
          }
          parent = current;
        }
        return current;
      },
  createPreloadedFile(parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        return FS_createPreloadedFile(parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish);
      },
  readFile(path, opts = {}) {
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error(`Invalid encoding type "${opts.encoding}"`);
        }
  
        var buf, length;
        // Copy the file into a JS buffer on the heap.
        withStackSave(() => {
          var bufPtr = stackAlloc(4);
          var sizePtr = stackAlloc(4);
          FS.handleError(-__wasmfs_read_file(stringToUTF8OnStack(path), bufPtr, sizePtr));
          buf = HEAPU32[((bufPtr)>>2)];
          length = readI53FromI64(sizePtr);
        });
  
        // Default return type is binary.
        // The buffer contents exist 8 bytes after the returned pointer.
        var ret = new Uint8Array(HEAPU8.subarray(buf, buf + length));
        return opts.encoding === 'utf8' ? UTF8ArrayToString(ret) : ret;
      },
  cwd:() => UTF8ToString(__wasmfs_get_cwd()),
  analyzePath(path) {
        // TODO: Consider simplifying this API, which for now matches the JS FS.
        var exists = !!FS.findObject(path);
        return {
          exists,
          object: {
            contents: exists ? FS.readFile(path) : null
          }
        };
      },
  mkdir:(path, mode) => FS_mkdir(path, mode),
  mkdirTree:(path, mode) => FS_mkdirTree(path, mode),
  rmdir:(path) => FS.handleError(
        withStackSave(() => __wasmfs_rmdir(stringToUTF8OnStack(path)))
      ),
  open:(path, flags, mode = 0o666) => withStackSave(() => {
        flags = typeof flags == 'string' ? FS_modeStringToFlags(flags) : flags;
        var buffer = stringToUTF8OnStack(path);
        var fd = FS.handleError(__wasmfs_open(buffer, flags, mode));
        return { fd : fd };
      }),
  create:(path, mode) => FS_create(path, mode),
  close:(stream) => FS.handleError(-__wasmfs_close(stream.fd)),
  unlink:(path) => FS_unlink(path),
  chdir:(path) => withStackSave(() => {
        var buffer = stringToUTF8OnStack(path);
        return __wasmfs_chdir(buffer);
      }),
  read(stream, buffer, offset, length, position) {
        var seeking = typeof position != 'undefined';
  
        var dataBuffer = _malloc(length);
  
        var bytesRead;
        if (seeking) {
          bytesRead = __wasmfs_pread(stream.fd, dataBuffer, length, BigInt(position));
        } else {
          bytesRead = __wasmfs_read(stream.fd, dataBuffer, length);
        }
        for (var i = 0; i < bytesRead; i++) {
          buffer[offset + i] = HEAP8[(dataBuffer)+(i)]
        }
  
        _free(dataBuffer);
        bytesRead = FS.handleError(bytesRead);
        return bytesRead;
      },
  write(stream, buffer, offset, length, position, canOwn) {
        var seeking = typeof position != 'undefined';
  
        var dataBuffer = _malloc(length);
        for (var i = 0; i < length; i++) {
          HEAP8[(dataBuffer)+(i)] = buffer[offset + i];
        }
  
        var bytesRead;
        if (seeking) {
          bytesRead = __wasmfs_pwrite(stream.fd, dataBuffer, length, BigInt(position));
        } else {
          bytesRead = __wasmfs_write(stream.fd, dataBuffer, length);
        }
        _free(dataBuffer);
        bytesRead = FS.handleError(bytesRead);
  
        return bytesRead;
      },
  writeFile:(path, data) => FS_writeFile(path, data),
  mmap:(stream, length, offset, prot, flags) => {
        var buf = FS.handleError(__wasmfs_mmap(length, prot, flags, stream.fd, BigInt(offset)));
        return { ptr: buf, allocated: true };
      },
  msync:(stream, bufferPtr, offset, length, mmapFlags) => {
        assert(offset === 0);
        // TODO: assert that stream has the fd corresponding to the mapped buffer (bufferPtr).
        return FS.handleError(__wasmfs_msync(bufferPtr, length, mmapFlags));
      },
  munmap:(addr, length) => (
        FS.handleError(__wasmfs_munmap(addr, length))
      ),
  symlink:(target, linkpath) => withStackSave(() => (
        __wasmfs_symlink(stringToUTF8OnStack(target), stringToUTF8OnStack(linkpath))
      )),
  readlink(path) {
        return withStackSave(() => {
          var bufPtr = stackAlloc(4);
          FS.handleError(__wasmfs_readlink(stringToUTF8OnStack(path), bufPtr));
          var readBuffer = HEAPU32[((bufPtr)>>2)];
          return UTF8ToString(readBuffer);
        });
      },
  statBufToObject(statBuf) {
        // i53/u53 are enough for times and ino in practice.
        return {
            dev: HEAPU32[((statBuf)>>2)],
            mode: HEAPU32[(((statBuf)+(4))>>2)],
            nlink: HEAPU32[(((statBuf)+(8))>>2)],
            uid: HEAPU32[(((statBuf)+(12))>>2)],
            gid: HEAPU32[(((statBuf)+(16))>>2)],
            rdev: HEAPU32[(((statBuf)+(20))>>2)],
            size: readI53FromI64((statBuf)+(24)),
            blksize: HEAPU32[(((statBuf)+(32))>>2)],
            blocks: HEAPU32[(((statBuf)+(36))>>2)],
            atime: readI53FromI64((statBuf)+(40)),
            mtime: readI53FromI64((statBuf)+(56)),
            ctime: readI53FromI64((statBuf)+(72)),
            ino: readI53FromU64((statBuf)+(88))
        }
      },
  stat(path) {
        var statBuf = _malloc(96);
        FS.handleError(withStackSave(() =>
          __wasmfs_stat(stringToUTF8OnStack(path), statBuf)
        ));
        var stats = FS.statBufToObject(statBuf);
        _free(statBuf);
  
        return stats;
      },
  lstat(path) {
        var statBuf = _malloc(96);
        FS.handleError(withStackSave(() =>
          __wasmfs_lstat(stringToUTF8OnStack(path), statBuf)
        ));
        var stats = FS.statBufToObject(statBuf);
        _free(statBuf);
  
        return stats;
      },
  chmod(path, mode) {
        return FS.handleError(withStackSave(() => {
          var buffer = stringToUTF8OnStack(path);
          return __wasmfs_chmod(buffer, mode);
        }));
      },
  lchmod(path, mode) {
        return FS.handleError(withStackSave(() => {
          var buffer = stringToUTF8OnStack(path);
          return __wasmfs_lchmod(buffer, mode);
        }));
      },
  fchmod(fd, mode) {
        return FS.handleError(__wasmfs_fchmod(fd, mode));
      },
  utime:(path, atime, mtime) => (
        FS.handleError(withStackSave(() => (
          __wasmfs_utime(stringToUTF8OnStack(path), atime, mtime)
        )))
      ),
  truncate(path, len) {
        return FS.handleError(withStackSave(() => (__wasmfs_truncate(stringToUTF8OnStack(path), BigInt(len)))));
      },
  ftruncate(fd, len) {
        return FS.handleError(__wasmfs_ftruncate(fd, BigInt(len)));
      },
  findObject(path) {
        var result = withStackSave(() => __wasmfs_identify(stringToUTF8OnStack(path)));
        if (result == 44) {
          return null;
        }
        return {
          isFolder: result == 31,
          isDevice: false, // TODO: wasmfs support for devices
        };
      },
  readdir:(path) => withStackSave(() => {
        var pathBuffer = stringToUTF8OnStack(path);
        var entries = [];
        var state = __wasmfs_readdir_start(pathBuffer);
        if (!state) {
          // TODO: The old FS threw an ErrnoError here.
          throw new Error("No such directory");
        }
        var entry;
        while (entry = __wasmfs_readdir_get(state)) {
          entries.push(UTF8ToString(entry));
        }
        __wasmfs_readdir_finish(state);
        return entries;
      }),
  mount:(type, opts, mountpoint) => {
        if (typeof type == 'string') {
          // The filesystem was not included, and instead we have an error
          // message stored in the variable.
          throw type;
        }
        var backendPointer = type.createBackend(opts);
        return FS.handleError(withStackSave(() => __wasmfs_mount(stringToUTF8OnStack(mountpoint), backendPointer)));
      },
  unmount:(mountpoint) => (
        FS.handleError(withStackSave(() => _wasmfs_unmount(stringToUTF8OnStack(mountpoint))))
      ),
  mknod:(path, mode, dev) => FS_mknod(path, mode, dev),
  makedev:(ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
        var backendPointer = _wasmfs_create_jsimpl_backend();
        var definedOps = {
          userRead: ops.read,
          userWrite: ops.write,
  
          allocFile: (file) => {
            wasmFSDeviceStreams[file] = {}
          },
          freeFile: (file) => {
            wasmFSDeviceStreams[file] = undefined;
          },
          getSize: (file) => {},
          // Devices cannot be resized.
          setSize: (file, size) => 0,
          read: (file, buffer, length, offset) => {
            var bufferArray = Module.HEAP8.subarray(buffer, buffer + length);
            try {
              var bytesRead = definedOps.userRead(wasmFSDeviceStreams[file], bufferArray, 0, length, offset);
            } catch (e) {
              return -e.errno;
            }
            Module.HEAP8.set(bufferArray, buffer);
            return bytesRead;
          },
          write: (file, buffer, length, offset) => {
            var bufferArray = Module.HEAP8.subarray(buffer, buffer + length);
            try {
              var bytesWritten = definedOps.userWrite(wasmFSDeviceStreams[file], bufferArray, 0, length, offset);
            } catch (e) {
              return -e.errno;
            }
            Module.HEAP8.set(bufferArray, buffer);
            return bytesWritten;
          },
        };
  
        wasmFS$backends[backendPointer] = definedOps;
        wasmFSDevices[dev] = backendPointer;
      },
  createDevice(parent, name, input, output) {
        if (typeof parent != 'string') {
          // The old API allowed parents to be objects, which do not exist in WasmFS.
          throw new Error("Only string paths are accepted");
        }
        var path = PATH.join2(parent, name);
        var mode = FS_getMode(!!input, !!output);
        FS.createDevice.major ??= 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device with a set of stream ops to emulate
        // the old API's createDevice().
        FS.registerDevice(dev, {
          read(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },
  mkdev(path, mode, dev) {
        if (typeof dev === 'undefined') {
          dev = mode;
          mode = 0o666;
        }
  
        var deviceBackend = wasmFSDevices[dev];
        if (!deviceBackend) {
          throw new Error("Invalid device ID.");
        }
  
        return FS.handleError(withStackSave(() => (
          _wasmfs_create_file(stringToUTF8OnStack(path), mode, deviceBackend)
        )));
      },
  rename(oldPath, newPath) {
        return FS.handleError(withStackSave(() => {
          var oldPathBuffer = stringToUTF8OnStack(oldPath);
          var newPathBuffer = stringToUTF8OnStack(newPath);
          return __wasmfs_rename(oldPathBuffer, newPathBuffer);
        }));
      },
  llseek(stream, offset, whence) {
        return FS.handleError(__wasmfs_llseek(stream.fd, BigInt(offset), whence));
      },
  };

  var getCFunc = (ident) => {
      var func = Module['_' + ident]; // closure exported function
      assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
      return func;
    };
  
  var writeArrayToMemory = (array, buffer) => {
      assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
      HEAP8.set(array, buffer);
    };
  
  
  
  
  
  
    /**
     * @param {string|null=} returnType
     * @param {Array=} argTypes
     * @param {Arguments|Array=} args
     * @param {Object=} opts
     */
  var ccall = (ident, returnType, argTypes, args, opts) => {
      // For fast lookup of conversion functions
      var toC = {
        'string': (str) => {
          var ret = 0;
          if (str !== null && str !== undefined && str !== 0) { // null string
            ret = stringToUTF8OnStack(str);
          }
          return ret;
        },
        'array': (arr) => {
          var ret = stackAlloc(arr.length);
          writeArrayToMemory(arr, ret);
          return ret;
        }
      };
  
      function convertReturnValue(ret) {
        if (returnType === 'string') {
          return UTF8ToString(ret);
        }
        if (returnType === 'boolean') return Boolean(ret);
        return ret;
      }
  
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
      assert(returnType !== 'array', 'Return type should not be "array".');
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]];
          if (converter) {
            if (stack === 0) stack = stackSave();
            cArgs[i] = converter(args[i]);
          } else {
            cArgs[i] = args[i];
          }
        }
      }
      var ret = func(...cArgs);
      function onDone(ret) {
        if (stack !== 0) stackRestore(stack);
        return convertReturnValue(ret);
      }
  
      ret = onDone(ret);
      return ret;
    };

  
  
    /**
     * @param {string=} returnType
     * @param {Array=} argTypes
     * @param {Object=} opts
     */
  var cwrap = (ident, returnType, argTypes, opts) => {
      return (...args) => ccall(ident, returnType, argTypes, args, opts);
    };

  var FS_createPath = FS.createPath;



PThread.init();;
EmscriptenTrace.init();
// End JS library code


// proxiedFunctionTable specifies the list of functions that can be called
// either synchronously or asynchronously from other threads in postMessage()d
// or internally queued events. This way a pthread in a Worker can synchronously
// access e.g. the DOM on the main thread.
var proxiedFunctionTable = [
  _proc_exit,
  exitOnMainThread,
  pthreadCreateProxied
];

function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
}
var wasmImports;
function assignWasmImports() {
  wasmImports = {
    /** @export */
    __assert_fail: ___assert_fail,
    /** @export */
    __call_sighandler: ___call_sighandler,
    /** @export */
    __cxa_throw: ___cxa_throw,
    /** @export */
    __pthread_create_js: ___pthread_create_js,
    /** @export */
    _abort_js: __abort_js,
    /** @export */
    _emscripten_init_main_thread_js: __emscripten_init_main_thread_js,
    /** @export */
    _emscripten_notify_mailbox_postmessage: __emscripten_notify_mailbox_postmessage,
    /** @export */
    _emscripten_receive_on_main_thread_js: __emscripten_receive_on_main_thread_js,
    /** @export */
    _emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear,
    /** @export */
    _emscripten_thread_cleanup: __emscripten_thread_cleanup,
    /** @export */
    _emscripten_thread_mailbox_await: __emscripten_thread_mailbox_await,
    /** @export */
    _emscripten_thread_set_strongref: __emscripten_thread_set_strongref,
    /** @export */
    _wasmfs_copy_preloaded_file_data: __wasmfs_copy_preloaded_file_data,
    /** @export */
    _wasmfs_get_num_preloaded_dirs: __wasmfs_get_num_preloaded_dirs,
    /** @export */
    _wasmfs_get_num_preloaded_files: __wasmfs_get_num_preloaded_files,
    /** @export */
    _wasmfs_get_preloaded_child_path: __wasmfs_get_preloaded_child_path,
    /** @export */
    _wasmfs_get_preloaded_file_mode: __wasmfs_get_preloaded_file_mode,
    /** @export */
    _wasmfs_get_preloaded_file_size: __wasmfs_get_preloaded_file_size,
    /** @export */
    _wasmfs_get_preloaded_parent_path: __wasmfs_get_preloaded_parent_path,
    /** @export */
    _wasmfs_get_preloaded_path_name: __wasmfs_get_preloaded_path_name,
    /** @export */
    _wasmfs_jsimpl_alloc_file: __wasmfs_jsimpl_alloc_file,
    /** @export */
    _wasmfs_jsimpl_free_file: __wasmfs_jsimpl_free_file,
    /** @export */
    _wasmfs_jsimpl_get_size: __wasmfs_jsimpl_get_size,
    /** @export */
    _wasmfs_jsimpl_read: __wasmfs_jsimpl_read,
    /** @export */
    _wasmfs_jsimpl_set_size: __wasmfs_jsimpl_set_size,
    /** @export */
    _wasmfs_jsimpl_write: __wasmfs_jsimpl_write,
    /** @export */
    _wasmfs_opfs_close_access: __wasmfs_opfs_close_access,
    /** @export */
    _wasmfs_opfs_close_blob: __wasmfs_opfs_close_blob,
    /** @export */
    _wasmfs_opfs_flush_access: __wasmfs_opfs_flush_access,
    /** @export */
    _wasmfs_opfs_free_directory: __wasmfs_opfs_free_directory,
    /** @export */
    _wasmfs_opfs_free_file: __wasmfs_opfs_free_file,
    /** @export */
    _wasmfs_opfs_get_child: __wasmfs_opfs_get_child,
    /** @export */
    _wasmfs_opfs_get_entries: __wasmfs_opfs_get_entries,
    /** @export */
    _wasmfs_opfs_get_size_access: __wasmfs_opfs_get_size_access,
    /** @export */
    _wasmfs_opfs_get_size_blob: __wasmfs_opfs_get_size_blob,
    /** @export */
    _wasmfs_opfs_get_size_file: __wasmfs_opfs_get_size_file,
    /** @export */
    _wasmfs_opfs_init_root_directory: __wasmfs_opfs_init_root_directory,
    /** @export */
    _wasmfs_opfs_insert_directory: __wasmfs_opfs_insert_directory,
    /** @export */
    _wasmfs_opfs_insert_file: __wasmfs_opfs_insert_file,
    /** @export */
    _wasmfs_opfs_move_file: __wasmfs_opfs_move_file,
    /** @export */
    _wasmfs_opfs_open_access: __wasmfs_opfs_open_access,
    /** @export */
    _wasmfs_opfs_open_blob: __wasmfs_opfs_open_blob,
    /** @export */
    _wasmfs_opfs_read_access: __wasmfs_opfs_read_access,
    /** @export */
    _wasmfs_opfs_read_blob: __wasmfs_opfs_read_blob,
    /** @export */
    _wasmfs_opfs_remove_child: __wasmfs_opfs_remove_child,
    /** @export */
    _wasmfs_opfs_set_size_access: __wasmfs_opfs_set_size_access,
    /** @export */
    _wasmfs_opfs_set_size_file: __wasmfs_opfs_set_size_file,
    /** @export */
    _wasmfs_opfs_write_access: __wasmfs_opfs_write_access,
    /** @export */
    _wasmfs_stdin_get_char: __wasmfs_stdin_get_char,
    /** @export */
    _wasmfs_thread_utils_heartbeat: __wasmfs_thread_utils_heartbeat,
    /** @export */
    clock_time_get: _clock_time_get,
    /** @export */
    emscripten_check_blocking_allowed: _emscripten_check_blocking_allowed,
    /** @export */
    emscripten_date_now: _emscripten_date_now,
    /** @export */
    emscripten_err: _emscripten_err,
    /** @export */
    emscripten_exit_with_live_runtime: _emscripten_exit_with_live_runtime,
    /** @export */
    emscripten_get_now: _emscripten_get_now,
    /** @export */
    emscripten_has_asyncify: _emscripten_has_asyncify,
    /** @export */
    emscripten_memprof_sbrk_grow: _emscripten_memprof_sbrk_grow,
    /** @export */
    emscripten_out: _emscripten_out,
    /** @export */
    emscripten_resize_heap: _emscripten_resize_heap,
    /** @export */
    emscripten_runtime_keepalive_check: _emscripten_runtime_keepalive_check,
    /** @export */
    emscripten_trace_record_allocation: _emscripten_trace_record_allocation,
    /** @export */
    emscripten_trace_record_free: _emscripten_trace_record_free,
    /** @export */
    emscripten_trace_record_reallocation: _emscripten_trace_record_reallocation,
    /** @export */
    emscripten_unwind_to_js_event_loop: _emscripten_unwind_to_js_event_loop,
    /** @export */
    exit: _exit,
    /** @export */
    memory: wasmMemory,
    /** @export */
    proc_exit: _proc_exit,
    /** @export */
    random_get: _random_get
  };
}
var wasmExports;
createWasm();
var ___wasm_call_ctors = createExportWrapper('__wasm_call_ctors', 0);
var ___original_main = Module['___original_main'] = createExportWrapper('__original_main', 0);
var _wasmfs_create_opfs_backend = createExportWrapper('wasmfs_create_opfs_backend', 0);
var _findUMax = Module['_findUMax'] = createExportWrapper('findUMax', 1);
var _append = Module['_append'] = createExportWrapper('append', 3);
var _wasmfs_create_file = createExportWrapper('wasmfs_create_file', 3);
var _main = createExportWrapper('main', 2);
var _free = Module['_free'] = createExportWrapper('free', 1);
var _malloc = Module['_malloc'] = createExportWrapper('malloc', 1);
var _fflush = createExportWrapper('fflush', 1);
var __emscripten_tls_init = createExportWrapper('_emscripten_tls_init', 0);
var _pthread_self = () => (_pthread_self = wasmExports['pthread_self'])();
var _emscripten_builtin_memalign = createExportWrapper('emscripten_builtin_memalign', 2);
var __emscripten_proxy_main = Module['__emscripten_proxy_main'] = createExportWrapper('_emscripten_proxy_main', 2);
var _emscripten_stack_get_base = () => (_emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'])();
var _emscripten_stack_get_end = () => (_emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'])();
var __emscripten_thread_init = createExportWrapper('_emscripten_thread_init', 6);
var __emscripten_thread_crashed = createExportWrapper('_emscripten_thread_crashed', 0);
var _emscripten_proxy_execute_queue = createExportWrapper('emscripten_proxy_execute_queue', 1);
var _emscripten_proxy_finish = createExportWrapper('emscripten_proxy_finish', 1);
var __emscripten_run_on_main_thread_js = createExportWrapper('_emscripten_run_on_main_thread_js', 5);
var __emscripten_thread_free_data = createExportWrapper('_emscripten_thread_free_data', 1);
var __emscripten_thread_exit = createExportWrapper('_emscripten_thread_exit', 1);
var __emscripten_check_mailbox = createExportWrapper('_emscripten_check_mailbox', 0);
var _sbrk = createExportWrapper('sbrk', 1);
var _emscripten_stack_init = () => (_emscripten_stack_init = wasmExports['emscripten_stack_init'])();
var _emscripten_stack_set_limits = (a0, a1) => (_emscripten_stack_set_limits = wasmExports['emscripten_stack_set_limits'])(a0, a1);
var _emscripten_stack_get_free = () => (_emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'])();
var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports['_emscripten_stack_restore'])(a0);
var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'])(a0);
var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'])();
var __wasmfs_read_file = createExportWrapper('_wasmfs_read_file', 3);
var __wasmfs_write_file = createExportWrapper('_wasmfs_write_file', 3);
var __wasmfs_mkdir = createExportWrapper('_wasmfs_mkdir', 2);
var __wasmfs_rmdir = createExportWrapper('_wasmfs_rmdir', 1);
var __wasmfs_open = createExportWrapper('_wasmfs_open', 3);
var __wasmfs_mknod = createExportWrapper('_wasmfs_mknod', 3);
var __wasmfs_unlink = createExportWrapper('_wasmfs_unlink', 1);
var __wasmfs_chdir = createExportWrapper('_wasmfs_chdir', 1);
var __wasmfs_symlink = createExportWrapper('_wasmfs_symlink', 2);
var __wasmfs_readlink = createExportWrapper('_wasmfs_readlink', 2);
var __wasmfs_write = createExportWrapper('_wasmfs_write', 3);
var __wasmfs_pwrite = createExportWrapper('_wasmfs_pwrite', 4);
var __wasmfs_chmod = createExportWrapper('_wasmfs_chmod', 2);
var __wasmfs_fchmod = createExportWrapper('_wasmfs_fchmod', 2);
var __wasmfs_lchmod = createExportWrapper('_wasmfs_lchmod', 2);
var __wasmfs_llseek = createExportWrapper('_wasmfs_llseek', 3);
var __wasmfs_rename = createExportWrapper('_wasmfs_rename', 2);
var __wasmfs_read = createExportWrapper('_wasmfs_read', 3);
var __wasmfs_pread = createExportWrapper('_wasmfs_pread', 4);
var __wasmfs_truncate = createExportWrapper('_wasmfs_truncate', 2);
var __wasmfs_ftruncate = createExportWrapper('_wasmfs_ftruncate', 2);
var __wasmfs_close = createExportWrapper('_wasmfs_close', 1);
var __wasmfs_mmap = createExportWrapper('_wasmfs_mmap', 5);
var __wasmfs_msync = createExportWrapper('_wasmfs_msync', 3);
var __wasmfs_munmap = createExportWrapper('_wasmfs_munmap', 2);
var __wasmfs_utime = createExportWrapper('_wasmfs_utime', 3);
var __wasmfs_stat = createExportWrapper('_wasmfs_stat', 2);
var __wasmfs_lstat = createExportWrapper('_wasmfs_lstat', 2);
var __wasmfs_mount = createExportWrapper('_wasmfs_mount', 2);
var __wasmfs_identify = createExportWrapper('_wasmfs_identify', 1);
var __wasmfs_readdir_start = createExportWrapper('_wasmfs_readdir_start', 1);
var __wasmfs_readdir_get = createExportWrapper('_wasmfs_readdir_get', 1);
var __wasmfs_readdir_finish = createExportWrapper('_wasmfs_readdir_finish', 1);
var __wasmfs_get_cwd = createExportWrapper('_wasmfs_get_cwd', 0);
var _wasmfs_create_jsimpl_backend = createExportWrapper('wasmfs_create_jsimpl_backend', 0);
var _wasmfs_create_memory_backend = createExportWrapper('wasmfs_create_memory_backend', 0);
var __wasmfs_opfs_record_entry = createExportWrapper('_wasmfs_opfs_record_entry', 3);
var _wasmfs_unmount = createExportWrapper('wasmfs_unmount', 1);
var _wasmfs_flush = createExportWrapper('wasmfs_flush', 0);
var ___heap_base = Module['___heap_base'] = 107328;

// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

Module['addRunDependency'] = addRunDependency;
Module['removeRunDependency'] = removeRunDependency;
Module['ccall'] = ccall;
Module['cwrap'] = cwrap;
Module['FS_createPreloadedFile'] = FS_createPreloadedFile;
Module['FS_unlink'] = FS_unlink;
Module['FS_createPath'] = FS_createPath;
Module['FS_createDataFile'] = FS_createDataFile;
var missingLibrarySymbols = [
  'writeI53ToI64',
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'convertI32PairToI53',
  'convertI32PairToI53Checked',
  'convertU32PairToI53',
  'getTempRet0',
  'setTempRet0',
  'zeroMemory',
  'growMemory',
  'strError',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'emscriptenLog',
  'readEmAsmArgs',
  'jstoi_q',
  'getExecutableName',
  'listenOnce',
  'autoResumeAudioContext',
  'getDynCaller',
  'dynCall',
  'asmjsMangle',
  'mmapAlloc',
  'getNativeTypeSize',
  'addOnInit',
  'addOnPostCtor',
  'addOnPreMain',
  'addOnExit',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'uleb128Encode',
  'sigToWasmTypes',
  'generateFuncType',
  'convertJsFunctionToWasm',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'addFunction',
  'removeFunction',
  'reallyNegative',
  'unSign',
  'strLen',
  'reSign',
  'formatString',
  'intArrayToString',
  'AsciiToString',
  'stringToAscii',
  'UTF16ToString',
  'stringToUTF16',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'stringToNewUTF8',
  'registerKeyEventCallback',
  'maybeCStringToJsString',
  'findEventTarget',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'setLetterbox',
  'softFullscreenResizeWebGLRenderTarget',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'registerPointerlockErrorEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'registerBeforeUnloadEventCallback',
  'fillBatteryEventData',
  'battery',
  'registerBatteryEventCallback',
  'setCanvasElementSizeCallingThread',
  'setCanvasElementSizeMainThread',
  'setCanvasElementSize',
  'getCanvasSizeCallingThread',
  'getCanvasSizeMainThread',
  'getCanvasElementSize',
  'jsStackTrace',
  'getCallstack',
  'convertPCtoSourceLocation',
  'getEnvStrings',
  'flush_NO_FILESYSTEM',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'safeSetTimeout',
  'setImmediateWrapped',
  'safeRequestAnimationFrame',
  'clearImmediateWrapped',
  'registerPostMainLoop',
  'registerPreMainLoop',
  'getPromise',
  'makePromise',
  'idsToPromises',
  'makePromiseCallback',
  'findMatchingCatch',
  'Browser_asyncPrepareDataCounter',
  'isLeapYear',
  'ydayFromDate',
  'arraySum',
  'addDays',
  'wasmfsNodeConvertNodeCode',
  'wasmfsTry',
  'wasmfsNodeFixStat',
  'wasmfsNodeLstat',
  'wasmfsNodeFstat',
  'heapObjectForWebGLType',
  'toTypedArrayIndex',
  'webgl_enable_ANGLE_instanced_arrays',
  'webgl_enable_OES_vertex_array_object',
  'webgl_enable_WEBGL_draw_buffers',
  'webgl_enable_WEBGL_multi_draw',
  'webgl_enable_EXT_polygon_offset_clamp',
  'webgl_enable_EXT_clip_control',
  'webgl_enable_WEBGL_polygon_mode',
  'emscriptenWebGLGet',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  'emscriptenWebGLGetUniform',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'writeGLArray',
  'emscripten_webgl_destroy_context_before_on_calling_thread',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'ALLOC_NORMAL',
  'ALLOC_STACK',
  'allocate',
  'writeStringToMemory',
  'writeAsciiToMemory',
  'setErrNo',
  'demangle',
  'stackTrace',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

var unexportedSymbols = [
  'run',
  'out',
  'err',
  'callMain',
  'abort',
  'wasmMemory',
  'wasmExports',
  'writeStackCookie',
  'checkStackCookie',
  'readI53FromI64',
  'readI53FromU64',
  'INT53_MAX',
  'INT53_MIN',
  'bigintToI53Checked',
  'stackSave',
  'stackRestore',
  'stackAlloc',
  'ptrToString',
  'exitJS',
  'getHeapMax',
  'abortOnCannotGrowMemory',
  'ENV',
  'ERRNO_CODES',
  'DNS',
  'Protocols',
  'Sockets',
  'timers',
  'warnOnce',
  'readEmAsmArgsArray',
  'jstoi_s',
  'handleException',
  'keepRuntimeAlive',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'callUserCallback',
  'maybeExit',
  'asyncLoad',
  'alignMemory',
  'HandleAllocator',
  'wasmTable',
  'noExitRuntime',
  'addOnPreRun',
  'addOnPostRun',
  'getCFunc',
  'freeTableIndexes',
  'functionsInTableMap',
  'setValue',
  'getValue',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'UTF8ToString',
  'stringToUTF8Array',
  'stringToUTF8',
  'lengthBytesUTF8',
  'intArrayFromString',
  'UTF16Decoder',
  'stringToUTF8OnStack',
  'writeArrayToMemory',
  'JSEvents',
  'specialHTMLTargets',
  'findCanvasEventTarget',
  'currentFullscreenStrategy',
  'restoreOldWindowedStyle',
  'UNWIND_CACHE',
  'ExitStatus',
  'checkWasiClock',
  'initRandomFill',
  'randomFill',
  'emSetImmediate',
  'emClearImmediate_deps',
  'emClearImmediate',
  'promiseMap',
  'uncaughtExceptionCount',
  'exceptionLast',
  'exceptionCaught',
  'ExceptionInfo',
  'Browser',
  'getPreloadedImageData__data',
  'wget',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'preloadPlugins',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_stdin_getChar_buffer',
  'FS_stdin_getChar',
  'FS_createDevice',
  'FS_readFile',
  'MEMFS',
  'wasmFSPreloadedFiles',
  'wasmFSPreloadedDirs',
  'wasmFSPreloadingFlushed',
  'wasmFSDevices',
  'wasmFSDeviceStreams',
  'FS',
  'FS_mknod',
  'FS_create',
  'FS_writeFile',
  'FS_mkdir',
  'FS_mkdirTree',
  'wasmFS$JSMemoryFiles',
  'wasmFS$backends',
  'wasmFS$JSMemoryRanges',
  'wasmfsNodeIsWindows',
  'wasmfsOPFSDirectoryHandles',
  'wasmfsOPFSFileHandles',
  'wasmfsOPFSAccessHandles',
  'wasmfsOPFSBlobs',
  'wasmfsOPFSProxyFinish',
  'wasmfsOPFSGetOrCreateFile',
  'wasmfsOPFSGetOrCreateDir',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'GL',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'SDL',
  'SDL_gfx',
  'allocateUTF8',
  'allocateUTF8OnStack',
  'print',
  'printErr',
  'PThread',
  'terminateWorker',
  'cleanupThread',
  'registerTLSInit',
  'spawnThread',
  'exitOnMainThread',
  'proxyToMainThread',
  'proxiedJSCallArgs',
  'invokeEntryPoint',
  'checkMailbox',
  'EmscriptenTrace',
  'traceConfigure',
  'traceLogMessage',
  'traceMark',
  'traceEnterContext',
  'OPFS',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);



var calledRun;

function callMain() {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])');
  assert(typeof onPreRuns === 'undefined' || onPreRuns.length == 0, 'cannot call main when preRun functions remain to be called');

  var entryFunction = __emscripten_proxy_main;

  // With PROXY_TO_PTHREAD make sure we keep the runtime alive until the
  // proxied main calls exit (see exitOnMainThread() for where Pop is called).
  runtimeKeepalivePush();

  var argc = 0;
  var argv = 0;

  try {

    var ret = entryFunction(argc, argv);

    // if we're not running an evented main loop, it's time to exit
    exitJS(ret, /* implicit = */ true);
    return ret;
  } catch (e) {
    return handleException(e);
  }
}

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  // See $establishStackSpace for the equivalent code that runs on a thread
  assert(!ENVIRONMENT_IS_PTHREAD);
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

function run() {

  if (runDependencies > 0) {
    dependenciesFulfilled = run;
    return;
  }

  if ((ENVIRONMENT_IS_PTHREAD)) {
    initRuntime();
    return;
  }

  stackCheckInit();

  preRun();

  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    dependenciesFulfilled = run;
    return;
  }

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    assert(!calledRun);
    calledRun = true;
    Module['calledRun'] = true;

    if (ABORT) return;

    initRuntime();

    preMain();

    Module['onRuntimeInitialized']?.();
    consumedModuleProp('onRuntimeInitialized');

    var noInitialRun = Module['noInitialRun'];legacyModuleProp('noInitialRun', 'noInitialRun');
    if (!noInitialRun) callMain();

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(() => {
      setTimeout(() => Module['setStatus'](''), 1);
      doRun();
    }, 1);
  } else
  {
    doRun();
  }
  checkStackCookie();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    // In WasmFS we must also flush the WasmFS internal buffers, for this check
    // to work.
    _wasmfs_flush();
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
    warnOnce('(this may also be due to not including full filesystem support - try building with -sFORCE_FILESYSTEM)');
  }
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}
consumedModuleProp('preInit');

run();

// end include: postamble.js

