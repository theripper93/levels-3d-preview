// dist/xatlas.mjs
var __xatlasModuleUrl = import.meta.url;
var __xatlasNodeModuleSpecifier = "module";
var createXAtlasModule = (() => {
  var _scriptName = import.meta.url;
  return async function(moduleArg = {}) {
    var moduleRtn;
    var Module = moduleArg;
    var readyPromiseResolve, readyPromiseReject;
    var readyPromise = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
    if (ENVIRONMENT_IS_NODE) {
      const { createRequire } = await import(
        /* @vite-ignore */
        __xatlasNodeModuleSpecifier
      );
      var require2 = createRequire(import.meta.url);
    }
    var moduleOverrides = Object.assign({}, Module);
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = (status, toThrow) => {
      throw toThrow;
    };
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var readAsync, readBinary;
    if (ENVIRONMENT_IS_NODE) {
      var fs = require2("fs");
      var nodePath = require2("path");
      scriptDirectory = require2("url").fileURLToPath(new URL("./", __xatlasModuleUrl));
      readBinary = (filename) => {
        filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
        var ret = fs.readFileSync(filename);
        return ret;
      };
      readAsync = (filename, binary = true) => {
        filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
        return new Promise((resolve, reject) => {
          fs.readFile(filename, binary ? void 0 : "utf8", (err2, data) => {
            if (err2) reject(err2);
            else resolve(binary ? data.buffer : data);
          });
        });
      };
      if (!Module["thisProgram"] && process.argv.length > 1) {
        thisProgram = process.argv[1].replace(/\\/g, "/");
      }
      arguments_ = process.argv.slice(2);
      quit_ = (status, toThrow) => {
        process.exitCode = status;
        throw toThrow;
      };
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptName) {
        scriptDirectory = _scriptName;
      }
      if (scriptDirectory.startsWith("blob:")) {
        scriptDirectory = "";
      } else {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
      }
      {
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
          };
        }
        readAsync = (url) => fetch(url, { credentials: "same-origin" }).then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          }
          return Promise.reject(new Error(response.status + " : " + response.url));
        });
      }
    } else {
    }
    var out = Module["print"] || console.log.bind(console);
    var err = Module["printErr"] || console.error.bind(console);
    Object.assign(Module, moduleOverrides);
    moduleOverrides = null;
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["quit"]) quit_ = Module["quit"];
    var wasmBinary;
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    var wasmMemory;
    var ABORT = false;
    var EXITSTATUS;
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateMemoryViews() {
      var b = wasmMemory.buffer;
      Module["HEAP8"] = HEAP8 = new Int8Array(b);
      Module["HEAP16"] = HEAP16 = new Int16Array(b);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
      Module["HEAP32"] = HEAP32 = new Int32Array(b);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    }
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
          addOnPreRun(Module["preRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      runtimeInitialized = true;
      callRuntimeCallbacks(__ATINIT__);
    }
    function postRun() {
      if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
          addOnPostRun(Module["postRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function addRunDependency(id) {
      runDependencies++;
      Module["monitorRunDependencies"]?.(runDependencies);
    }
    function removeRunDependency(id) {
      runDependencies--;
      Module["monitorRunDependencies"]?.(runDependencies);
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    function abort(what) {
      Module["onAbort"]?.(what);
      what = "Aborted(" + what + ")";
      err(what);
      ABORT = true;
      EXITSTATUS = 1;
      what += ". Build with -sASSERTIONS for more info.";
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
    var isFileURI = (filename) => filename.startsWith("file://");
    function findWasmBinary() {
      if (Module["locateFile"]) {
        var f = "xatlas.wasm";
        if (!isDataURI(f)) {
          return locateFile(f);
        }
        return f;
      }
      return new URL("xatlas.wasm", import.meta.url).href;
    }
    var wasmBinaryFile;
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw "both async and sync fetching of the wasm failed";
    }
    function getBinaryPromise(binaryFile) {
      if (!wasmBinary) {
        return readAsync(binaryFile).then((response) => new Uint8Array(response), () => getBinarySync(binaryFile));
      }
      return Promise.resolve().then(() => getBinarySync(binaryFile));
    }
    function instantiateArrayBuffer(binaryFile, imports, receiver) {
      return getBinaryPromise(binaryFile).then((binary) => WebAssembly.instantiate(binary, imports)).then(receiver, (reason) => {
        err(`failed to asynchronously prepare wasm: ${reason}`);
        abort(reason);
      });
    }
    function instantiateAsync(binary, binaryFile, imports, callback) {
      if (!binary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && !ENVIRONMENT_IS_NODE && typeof fetch == "function") {
        return fetch(binaryFile, { credentials: "same-origin" }).then((response) => {
          var result = WebAssembly.instantiateStreaming(response, imports);
          return result.then(callback, function(reason) {
            err(`wasm streaming compile failed: ${reason}`);
            err("falling back to ArrayBuffer instantiation");
            return instantiateArrayBuffer(binaryFile, imports, callback);
          });
        });
      }
      return instantiateArrayBuffer(binaryFile, imports, callback);
    }
    function getWasmImports() {
      return { env: wasmImports, wasi_snapshot_preview1: wasmImports };
    }
    function createWasm() {
      var info = getWasmImports();
      function receiveInstance(instance, module) {
        wasmExports = instance.exports;
        wasmMemory = wasmExports["memory"];
        updateMemoryViews();
        wasmTable = wasmExports["__indirect_function_table"];
        addOnInit(wasmExports["__wasm_call_ctors"]);
        removeRunDependency("wasm-instantiate");
        return wasmExports;
      }
      addRunDependency("wasm-instantiate");
      function receiveInstantiationResult(result) {
        receiveInstance(result["instance"]);
      }
      if (Module["instantiateWasm"]) {
        try {
          return Module["instantiateWasm"](info, receiveInstance);
        } catch (e) {
          err(`Module.instantiateWasm callback failed with error: ${e}`);
          readyPromiseReject(e);
        }
      }
      if (!wasmBinaryFile) wasmBinaryFile = findWasmBinary();
      instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(readyPromiseReject);
      return {};
    }
    var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        callbacks.shift()(Module);
      }
    };
    function getValue(ptr, type = "i8") {
      if (type.endsWith("*")) type = "*";
      switch (type) {
        case "i1":
          return HEAP8[ptr];
        case "i8":
          return HEAP8[ptr];
        case "i16":
          return HEAP16[ptr >> 1];
        case "i32":
          return HEAP32[ptr >> 2];
        case "i64":
          abort("to do getValue(i64) use WASM_BIGINT");
        case "float":
          return HEAPF32[ptr >> 2];
        case "double":
          return HEAPF64[ptr >> 3];
        case "*":
          return HEAPU32[ptr >> 2];
        default:
          abort(`invalid type for getValue: ${type}`);
      }
    }
    var noExitRuntime = Module["noExitRuntime"] || true;
    function setValue(ptr, value, type = "i8") {
      if (type.endsWith("*")) type = "*";
      switch (type) {
        case "i1":
          HEAP8[ptr] = value;
          break;
        case "i8":
          HEAP8[ptr] = value;
          break;
        case "i16":
          HEAP16[ptr >> 1] = value;
          break;
        case "i32":
          HEAP32[ptr >> 2] = value;
          break;
        case "i64":
          abort("to do setValue(i64) use WASM_BIGINT");
        case "float":
          HEAPF32[ptr >> 2] = value;
          break;
        case "double":
          HEAPF64[ptr >> 3] = value;
          break;
        case "*":
          HEAPU32[ptr >> 2] = value;
          break;
        default:
          abort(`invalid type for setValue: ${type}`);
      }
    }
    var stackRestore = (val) => __emscripten_stack_restore(val);
    var stackSave = () => _emscripten_stack_get_current();
    var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);
    var getHeapMax = () => 2147483648;
    var growMemory = (size) => {
      var b = wasmMemory.buffer;
      var pages = (size - b.byteLength + 65535) / 65536;
      try {
        wasmMemory.grow(pages);
        updateMemoryViews();
        return 1;
      } catch (e) {
      }
    };
    var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      requestedSize >>>= 0;
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        return false;
      }
      var alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
        var replacement = growMemory(newSize);
        if (replacement) {
          return true;
        }
      }
      return false;
    };
    var printCharBuffers = [null, [], []];
    var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
    var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = "";
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode((u0 & 31) << 6 | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = (u0 & 15) << 12 | u1 << 6 | u2;
        } else {
          u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
        }
      }
      return str;
    };
    var printChar = (stream, curr) => {
      var buffer = printCharBuffers[stream];
      if (curr === 0 || curr === 10) {
        (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
        buffer.length = 0;
      } else {
        buffer.push(curr);
      }
    };
    var UTF8ToString = (ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
    var _fd_write = (fd, iov, iovcnt, pnum) => {
      var num = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[iov >> 2];
        var len = HEAPU32[iov + 4 >> 2];
        iov += 8;
        for (var j = 0; j < len; j++) {
          printChar(fd, HEAPU8[ptr + j]);
        }
        num += len;
      }
      HEAPU32[pnum >> 2] = num;
      return 0;
    };
    var getCFunc = (ident) => {
      var func = Module["_" + ident];
      return func;
    };
    var writeArrayToMemory = (array, buffer) => {
      HEAP8.set(array, buffer);
    };
    var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var c = str.charCodeAt(i);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
    var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      if (!(maxBytesToWrite > 0)) return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i);
          u = 65536 + ((u & 1023) << 10) | u1 & 1023;
        }
        if (u <= 127) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 192 | u >> 6;
          heap[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 224 | u >> 12;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        } else {
          if (outIdx + 3 >= endIdx) break;
          heap[outIdx++] = 240 | u >> 18;
          heap[outIdx++] = 128 | u >> 12 & 63;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
    var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
    var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };
    var ccall = (ident, returnType, argTypes, args, opts) => {
      var toC = { string: (str) => {
        var ret2 = 0;
        if (str !== null && str !== void 0 && str !== 0) {
          ret2 = stringToUTF8OnStack(str);
        }
        return ret2;
      }, array: (arr) => {
        var ret2 = stackAlloc(arr.length);
        writeArrayToMemory(arr, ret2);
        return ret2;
      } };
      function convertReturnValue(ret2) {
        if (returnType === "string") {
          return UTF8ToString(ret2);
        }
        if (returnType === "boolean") return Boolean(ret2);
        return ret2;
      }
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
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
      function onDone(ret2) {
        if (stack !== 0) stackRestore(stack);
        return convertReturnValue(ret2);
      }
      ret = onDone(ret);
      return ret;
    };
    var cwrap = (ident, returnType, argTypes, opts) => {
      var numericArgs = !argTypes || argTypes.every((type) => type === "number" || type === "boolean");
      var numericRet = returnType !== "string";
      if (numericRet && numericArgs && !opts) {
        return getCFunc(ident);
      }
      return (...args) => ccall(ident, returnType, argTypes, args, opts);
    };
    var uleb128Encode = (n, target) => {
      if (n < 128) {
        target.push(n);
      } else {
        target.push(n % 128 | 128, n >> 7);
      }
    };
    var sigToWasmTypes = (sig) => {
      var typeNames = { i: "i32", j: "i64", f: "f32", d: "f64", e: "externref", p: "i32" };
      var type = { parameters: [], results: sig[0] == "v" ? [] : [typeNames[sig[0]]] };
      for (var i = 1; i < sig.length; ++i) {
        type.parameters.push(typeNames[sig[i]]);
      }
      return type;
    };
    var generateFuncType = (sig, target) => {
      var sigRet = sig.slice(0, 1);
      var sigParam = sig.slice(1);
      var typeCodes = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 };
      target.push(96);
      uleb128Encode(sigParam.length, target);
      for (var i = 0; i < sigParam.length; ++i) {
        target.push(typeCodes[sigParam[i]]);
      }
      if (sigRet == "v") {
        target.push(0);
      } else {
        target.push(1, typeCodes[sigRet]);
      }
    };
    var convertJsFunctionToWasm = (func, sig) => {
      if (typeof WebAssembly.Function == "function") {
        return new WebAssembly.Function(sigToWasmTypes(sig), func);
      }
      var typeSectionBody = [1];
      generateFuncType(sig, typeSectionBody);
      var bytes = [0, 97, 115, 109, 1, 0, 0, 0, 1];
      uleb128Encode(typeSectionBody.length, bytes);
      bytes.push(...typeSectionBody);
      bytes.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
      var module = new WebAssembly.Module(new Uint8Array(bytes));
      var instance = new WebAssembly.Instance(module, { e: { f: func } });
      var wrappedFunc = instance.exports["f"];
      return wrappedFunc;
    };
    var wasmTableMirror = [];
    var wasmTable;
    var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      return func;
    };
    var updateTableMap = (offset, count) => {
      if (functionsInTableMap) {
        for (var i = offset; i < offset + count; i++) {
          var item = getWasmTableEntry(i);
          if (item) {
            functionsInTableMap.set(item, i);
          }
        }
      }
    };
    var functionsInTableMap;
    var getFunctionAddress = (func) => {
      if (!functionsInTableMap) {
        functionsInTableMap = /* @__PURE__ */ new WeakMap();
        updateTableMap(0, wasmTable.length);
      }
      return functionsInTableMap.get(func) || 0;
    };
    var freeTableIndexes = [];
    var getEmptyTableSlot = () => {
      if (freeTableIndexes.length) {
        return freeTableIndexes.pop();
      }
      try {
        wasmTable.grow(1);
      } catch (err2) {
        if (!(err2 instanceof RangeError)) {
          throw err2;
        }
        throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
      }
      return wasmTable.length - 1;
    };
    var setWasmTableEntry = (idx, func) => {
      wasmTable.set(idx, func);
      wasmTableMirror[idx] = wasmTable.get(idx);
    };
    var addFunction = (func, sig) => {
      var rtn = getFunctionAddress(func);
      if (rtn) {
        return rtn;
      }
      var ret = getEmptyTableSlot();
      try {
        setWasmTableEntry(ret, func);
      } catch (err2) {
        if (!(err2 instanceof TypeError)) {
          throw err2;
        }
        var wrapped = convertJsFunctionToWasm(func, sig);
        setWasmTableEntry(ret, wrapped);
      }
      functionsInTableMap.set(func, ret);
      return ret;
    };
    var removeFunction = (index) => {
      functionsInTableMap.delete(getWasmTableEntry(index));
      setWasmTableEntry(index, null);
      freeTableIndexes.push(index);
    };
    var wasmImports = { _emscripten_memcpy_js: __emscripten_memcpy_js, emscripten_resize_heap: _emscripten_resize_heap, fd_write: _fd_write };
    var wasmExports = createWasm();
    var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports["__wasm_call_ctors"])();
    var _xatlasCreate = Module["_xatlasCreate"] = () => (_xatlasCreate = Module["_xatlasCreate"] = wasmExports["xatlasCreate"])();
    var _xatlasDestroy = Module["_xatlasDestroy"] = (a0) => (_xatlasDestroy = Module["_xatlasDestroy"] = wasmExports["xatlasDestroy"])(a0);
    var _xatlasAddMesh = Module["_xatlasAddMesh"] = (a0, a1, a2) => (_xatlasAddMesh = Module["_xatlasAddMesh"] = wasmExports["xatlasAddMesh"])(a0, a1, a2);
    var _xatlasAddMeshJoin = Module["_xatlasAddMeshJoin"] = (a0) => (_xatlasAddMeshJoin = Module["_xatlasAddMeshJoin"] = wasmExports["xatlasAddMeshJoin"])(a0);
    var _xatlasAddUvMesh = Module["_xatlasAddUvMesh"] = (a0, a1) => (_xatlasAddUvMesh = Module["_xatlasAddUvMesh"] = wasmExports["xatlasAddUvMesh"])(a0, a1);
    var _xatlasComputeCharts = Module["_xatlasComputeCharts"] = (a0, a1) => (_xatlasComputeCharts = Module["_xatlasComputeCharts"] = wasmExports["xatlasComputeCharts"])(a0, a1);
    var _xatlasPackCharts = Module["_xatlasPackCharts"] = (a0, a1) => (_xatlasPackCharts = Module["_xatlasPackCharts"] = wasmExports["xatlasPackCharts"])(a0, a1);
    var _xatlasGenerate = Module["_xatlasGenerate"] = (a0, a1, a2) => (_xatlasGenerate = Module["_xatlasGenerate"] = wasmExports["xatlasGenerate"])(a0, a1, a2);
    var _xatlasSetProgressCallback = Module["_xatlasSetProgressCallback"] = (a0, a1, a2) => (_xatlasSetProgressCallback = Module["_xatlasSetProgressCallback"] = wasmExports["xatlasSetProgressCallback"])(a0, a1, a2);
    var _xatlasSetAlloc = Module["_xatlasSetAlloc"] = (a0, a1) => (_xatlasSetAlloc = Module["_xatlasSetAlloc"] = wasmExports["xatlasSetAlloc"])(a0, a1);
    var _xatlasSetPrint = Module["_xatlasSetPrint"] = (a0, a1) => (_xatlasSetPrint = Module["_xatlasSetPrint"] = wasmExports["xatlasSetPrint"])(a0, a1);
    var _xatlasAddMeshErrorString = Module["_xatlasAddMeshErrorString"] = (a0) => (_xatlasAddMeshErrorString = Module["_xatlasAddMeshErrorString"] = wasmExports["xatlasAddMeshErrorString"])(a0);
    var _xatlasProgressCategoryString = Module["_xatlasProgressCategoryString"] = (a0) => (_xatlasProgressCategoryString = Module["_xatlasProgressCategoryString"] = wasmExports["xatlasProgressCategoryString"])(a0);
    var _xatlasMeshDeclInit = Module["_xatlasMeshDeclInit"] = (a0) => (_xatlasMeshDeclInit = Module["_xatlasMeshDeclInit"] = wasmExports["xatlasMeshDeclInit"])(a0);
    var _xatlasUvMeshDeclInit = Module["_xatlasUvMeshDeclInit"] = (a0) => (_xatlasUvMeshDeclInit = Module["_xatlasUvMeshDeclInit"] = wasmExports["xatlasUvMeshDeclInit"])(a0);
    var _xatlasChartOptionsInit = Module["_xatlasChartOptionsInit"] = (a0) => (_xatlasChartOptionsInit = Module["_xatlasChartOptionsInit"] = wasmExports["xatlasChartOptionsInit"])(a0);
    var _xatlasPackOptionsInit = Module["_xatlasPackOptionsInit"] = (a0) => (_xatlasPackOptionsInit = Module["_xatlasPackOptionsInit"] = wasmExports["xatlasPackOptionsInit"])(a0);
    var _free = Module["_free"] = (a0) => (_free = Module["_free"] = wasmExports["free"])(a0);
    var _xatlasAtlas_getWidth = Module["_xatlasAtlas_getWidth"] = (a0) => (_xatlasAtlas_getWidth = Module["_xatlasAtlas_getWidth"] = wasmExports["xatlasAtlas_getWidth"])(a0);
    var _xatlasAtlas_getHeight = Module["_xatlasAtlas_getHeight"] = (a0) => (_xatlasAtlas_getHeight = Module["_xatlasAtlas_getHeight"] = wasmExports["xatlasAtlas_getHeight"])(a0);
    var _xatlasAtlas_getAtlasCount = Module["_xatlasAtlas_getAtlasCount"] = (a0) => (_xatlasAtlas_getAtlasCount = Module["_xatlasAtlas_getAtlasCount"] = wasmExports["xatlasAtlas_getAtlasCount"])(a0);
    var _xatlasAtlas_getChartCount = Module["_xatlasAtlas_getChartCount"] = (a0) => (_xatlasAtlas_getChartCount = Module["_xatlasAtlas_getChartCount"] = wasmExports["xatlasAtlas_getChartCount"])(a0);
    var _xatlasAtlas_getMeshCount = Module["_xatlasAtlas_getMeshCount"] = (a0) => (_xatlasAtlas_getMeshCount = Module["_xatlasAtlas_getMeshCount"] = wasmExports["xatlasAtlas_getMeshCount"])(a0);
    var _xatlasAtlas_getTexelsPerUnit = Module["_xatlasAtlas_getTexelsPerUnit"] = (a0) => (_xatlasAtlas_getTexelsPerUnit = Module["_xatlasAtlas_getTexelsPerUnit"] = wasmExports["xatlasAtlas_getTexelsPerUnit"])(a0);
    var _xatlasAtlas_getUtilization = Module["_xatlasAtlas_getUtilization"] = (a0, a1) => (_xatlasAtlas_getUtilization = Module["_xatlasAtlas_getUtilization"] = wasmExports["xatlasAtlas_getUtilization"])(a0, a1);
    var _xatlasAtlas_getMesh = Module["_xatlasAtlas_getMesh"] = (a0, a1) => (_xatlasAtlas_getMesh = Module["_xatlasAtlas_getMesh"] = wasmExports["xatlasAtlas_getMesh"])(a0, a1);
    var _xatlasAtlas_getImage = Module["_xatlasAtlas_getImage"] = (a0) => (_xatlasAtlas_getImage = Module["_xatlasAtlas_getImage"] = wasmExports["xatlasAtlas_getImage"])(a0);
    var _xatlasMesh_getVertexCount = Module["_xatlasMesh_getVertexCount"] = (a0) => (_xatlasMesh_getVertexCount = Module["_xatlasMesh_getVertexCount"] = wasmExports["xatlasMesh_getVertexCount"])(a0);
    var _xatlasMesh_getIndexCount = Module["_xatlasMesh_getIndexCount"] = (a0) => (_xatlasMesh_getIndexCount = Module["_xatlasMesh_getIndexCount"] = wasmExports["xatlasMesh_getIndexCount"])(a0);
    var _xatlasMesh_getChartCount = Module["_xatlasMesh_getChartCount"] = (a0) => (_xatlasMesh_getChartCount = Module["_xatlasMesh_getChartCount"] = wasmExports["xatlasMesh_getChartCount"])(a0);
    var _xatlasMesh_getVertexArray = Module["_xatlasMesh_getVertexArray"] = (a0) => (_xatlasMesh_getVertexArray = Module["_xatlasMesh_getVertexArray"] = wasmExports["xatlasMesh_getVertexArray"])(a0);
    var _xatlasMesh_getIndexArray = Module["_xatlasMesh_getIndexArray"] = (a0) => (_xatlasMesh_getIndexArray = Module["_xatlasMesh_getIndexArray"] = wasmExports["xatlasMesh_getIndexArray"])(a0);
    var _xatlasMesh_getChartArray = Module["_xatlasMesh_getChartArray"] = (a0) => (_xatlasMesh_getChartArray = Module["_xatlasMesh_getChartArray"] = wasmExports["xatlasMesh_getChartArray"])(a0);
    var _xatlasVertex_getAtlasIndex = Module["_xatlasVertex_getAtlasIndex"] = (a0, a1) => (_xatlasVertex_getAtlasIndex = Module["_xatlasVertex_getAtlasIndex"] = wasmExports["xatlasVertex_getAtlasIndex"])(a0, a1);
    var _xatlasVertex_getChartIndex = Module["_xatlasVertex_getChartIndex"] = (a0, a1) => (_xatlasVertex_getChartIndex = Module["_xatlasVertex_getChartIndex"] = wasmExports["xatlasVertex_getChartIndex"])(a0, a1);
    var _xatlasVertex_getUV0 = Module["_xatlasVertex_getUV0"] = (a0, a1) => (_xatlasVertex_getUV0 = Module["_xatlasVertex_getUV0"] = wasmExports["xatlasVertex_getUV0"])(a0, a1);
    var _xatlasVertex_getUV1 = Module["_xatlasVertex_getUV1"] = (a0, a1) => (_xatlasVertex_getUV1 = Module["_xatlasVertex_getUV1"] = wasmExports["xatlasVertex_getUV1"])(a0, a1);
    var _xatlasVertex_getXref = Module["_xatlasVertex_getXref"] = (a0, a1) => (_xatlasVertex_getXref = Module["_xatlasVertex_getXref"] = wasmExports["xatlasVertex_getXref"])(a0, a1);
    var _xatlasChart_getAtlasIndex = Module["_xatlasChart_getAtlasIndex"] = (a0, a1) => (_xatlasChart_getAtlasIndex = Module["_xatlasChart_getAtlasIndex"] = wasmExports["xatlasChart_getAtlasIndex"])(a0, a1);
    var _xatlasChart_getFaceCount = Module["_xatlasChart_getFaceCount"] = (a0, a1) => (_xatlasChart_getFaceCount = Module["_xatlasChart_getFaceCount"] = wasmExports["xatlasChart_getFaceCount"])(a0, a1);
    var _xatlasChart_getType = Module["_xatlasChart_getType"] = (a0, a1) => (_xatlasChart_getType = Module["_xatlasChart_getType"] = wasmExports["xatlasChart_getType"])(a0, a1);
    var _xatlasChart_getMaterial = Module["_xatlasChart_getMaterial"] = (a0, a1) => (_xatlasChart_getMaterial = Module["_xatlasChart_getMaterial"] = wasmExports["xatlasChart_getMaterial"])(a0, a1);
    var _xatlasChart_getFaceArray = Module["_xatlasChart_getFaceArray"] = (a0, a1) => (_xatlasChart_getFaceArray = Module["_xatlasChart_getFaceArray"] = wasmExports["xatlasChart_getFaceArray"])(a0, a1);
    var _xatlasMeshDecl_size = Module["_xatlasMeshDecl_size"] = () => (_xatlasMeshDecl_size = Module["_xatlasMeshDecl_size"] = wasmExports["xatlasMeshDecl_size"])();
    var _xatlasUvMeshDecl_size = Module["_xatlasUvMeshDecl_size"] = () => (_xatlasUvMeshDecl_size = Module["_xatlasUvMeshDecl_size"] = wasmExports["xatlasUvMeshDecl_size"])();
    var _xatlasChartOptions_size = Module["_xatlasChartOptions_size"] = () => (_xatlasChartOptions_size = Module["_xatlasChartOptions_size"] = wasmExports["xatlasChartOptions_size"])();
    var _xatlasPackOptions_size = Module["_xatlasPackOptions_size"] = () => (_xatlasPackOptions_size = Module["_xatlasPackOptions_size"] = wasmExports["xatlasPackOptions_size"])();
    var _malloc = Module["_malloc"] = (a0) => (_malloc = Module["_malloc"] = wasmExports["malloc"])(a0);
    var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(a0);
    var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"])(a0);
    var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"])();
    var dynCall_jiji = Module["dynCall_jiji"] = (a0, a1, a2, a3, a4) => (dynCall_jiji = Module["dynCall_jiji"] = wasmExports["dynCall_jiji"])(a0, a1, a2, a3, a4);
    Module["ccall"] = ccall;
    Module["cwrap"] = cwrap;
    Module["addFunction"] = addFunction;
    Module["removeFunction"] = removeFunction;
    Module["setValue"] = setValue;
    Module["getValue"] = getValue;
    Module["UTF8ToString"] = UTF8ToString;
    var calledRun;
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run();
      if (!calledRun) dependenciesFulfilled = runCaller;
    };
    function run() {
      if (runDependencies > 0) {
        return;
      }
      preRun();
      if (runDependencies > 0) {
        return;
      }
      function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        readyPromiseResolve(Module);
        Module["onRuntimeInitialized"]?.();
        postRun();
      }
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function() {
          setTimeout(function() {
            Module["setStatus"]("");
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
      }
    }
    run();
    moduleRtn = readyPromise;
    return moduleRtn;
  };
})();
var xatlas_default = createXAtlasModule;

// lib/xatlas.mjs
var ChartType = Object.freeze({
  Planar: 0,
  Ortho: 1,
  LSCM: 2,
  Piecewise: 3,
  Invalid: 4
});
var IndexFormat = Object.freeze({
  UInt16: 0,
  UInt32: 1
});
var AddMeshError = Object.freeze({
  Success: 0,
  Error: 1,
  IndexOutOfRange: 2,
  InvalidFaceVertexCount: 3,
  InvalidIndexCount: 4
});
var ProgressCategory = Object.freeze({
  AddMesh: 0,
  ComputeCharts: 1,
  PackCharts: 2,
  BuildOutputMeshes: 3
});
var ImageChartIndexMask = 536870911;
var ImageHasChartIndexBit = 2147483648;
var ImageIsBilinearBit = 1073741824;
var ImageIsPaddingBit = 536870912;
function decodeImagePixel(pixel) {
  return {
    chartIndex: (pixel & ImageChartIndexMask) >>> 0,
    hasChartIndex: (pixel & ImageHasChartIndexBit) !== 0,
    isBilinear: (pixel & ImageIsBilinearBit) !== 0,
    isPadding: (pixel & ImageIsPaddingBit) !== 0
  };
}
function copyToHeap(module, typedArray, heapType) {
  const numBytes = typedArray.byteLength;
  const ptr = module._malloc(numBytes);
  if (!ptr) throw new Error("xatlas-wasm: malloc failed");
  const dst = new Uint8Array(module.HEAPU8.buffer, ptr, numBytes);
  dst.set(new Uint8Array(typedArray.buffer, typedArray.byteOffset, numBytes));
  return ptr;
}
var XAtlas = class {
  /** @internal */
  constructor(module) {
    this._m = module;
    this._ptr = module._xatlasCreate();
    this._progressFnPtr = 0;
    if (!this._ptr) throw new Error("xatlas-wasm: xatlasCreate returned null");
  }
  destroy() {
    if (this._progressFnPtr) {
      this._m.removeFunction(this._progressFnPtr);
      this._progressFnPtr = 0;
    }
    if (this._ptr) {
      this._m._xatlasDestroy(this._ptr);
      this._ptr = 0;
    }
  }
  /**
   * Add a triangle mesh to the atlas.
   * @param {object} opts
   * @param {Float32Array} opts.positions  - Vertex positions (flat xyz, length = vertexCount * 3).
   * @param {Float32Array} [opts.normals]  - Vertex normals (flat xyz).
   * @param {Float32Array} [opts.uvs]      - Vertex UVs (flat xy).
   * @param {Uint16Array|Uint32Array} [opts.indices] - Triangle indices.
   * @param {Uint32Array} [opts.faceMaterialData] - Per-face material IDs.
   * @param {number} [opts.meshCountHint=0]
   * @returns {number} AddMeshError code.
   */
  addMesh(opts) {
    const m = this._m;
    const {
      positions,
      normals = null,
      uvs = null,
      indices = null,
      faceMaterialData = null,
      meshCountHint = 0
    } = opts;
    const vertexCount = positions.length / 3 | 0;
    const declSize = m._xatlasMeshDecl_size();
    const declPtr = m._malloc(declSize);
    m.HEAPU8.fill(0, declPtr, declPtr + declSize);
    m._xatlasMeshDeclInit(declPtr);
    const allocs = [declPtr];
    const posPtr = copyToHeap(m, positions);
    allocs.push(posPtr);
    let normPtr = 0;
    if (normals) {
      normPtr = copyToHeap(m, normals);
      allocs.push(normPtr);
    }
    let uvPtr = 0;
    if (uvs) {
      uvPtr = copyToHeap(m, uvs);
      allocs.push(uvPtr);
    }
    let idxPtr = 0;
    let indexCount = 0;
    let indexFormat = IndexFormat.UInt16;
    if (indices) {
      idxPtr = copyToHeap(m, indices);
      allocs.push(idxPtr);
      indexCount = indices.length;
      indexFormat = indices instanceof Uint32Array ? IndexFormat.UInt32 : IndexFormat.UInt16;
    }
    let faceMatPtr = 0;
    if (faceMaterialData) {
      faceMatPtr = copyToHeap(m, faceMaterialData);
      allocs.push(faceMatPtr);
    }
    m.setValue(declPtr + 0, posPtr, "i32");
    m.setValue(declPtr + 4, normPtr, "i32");
    m.setValue(declPtr + 8, uvPtr, "i32");
    m.setValue(declPtr + 12, idxPtr, "i32");
    m.setValue(declPtr + 16, 0, "i32");
    m.setValue(declPtr + 20, faceMatPtr, "i32");
    m.setValue(declPtr + 24, 0, "i32");
    m.setValue(declPtr + 28, vertexCount, "i32");
    m.setValue(declPtr + 32, 3 * 4, "i32");
    m.setValue(declPtr + 36, normals ? 3 * 4 : 0, "i32");
    m.setValue(declPtr + 40, uvs ? 2 * 4 : 0, "i32");
    m.setValue(declPtr + 44, indexCount, "i32");
    m.setValue(declPtr + 48, 0, "i32");
    m.setValue(declPtr + 52, 0, "i32");
    m.setValue(declPtr + 56, indexFormat, "i32");
    const error = m._xatlasAddMesh(this._ptr, declPtr, meshCountHint);
    for (const p of allocs) m._free(p);
    return error;
  }
  /**
   * Add a UV mesh for repacking.
   * @param {object} opts
   * @param {Float32Array} opts.uvs         - Vertex UVs (flat xy).
   * @param {Uint16Array|Uint32Array} [opts.indices]
   * @param {Uint32Array} [opts.faceMaterialData]
   * @returns {number} AddMeshError code.
   */
  addUvMesh(opts) {
    const m = this._m;
    const { uvs, indices = null, faceMaterialData = null } = opts;
    const vertexCount = uvs.length / 2 | 0;
    const declSize = m._xatlasUvMeshDecl_size();
    const declPtr = m._malloc(declSize);
    m.HEAPU8.fill(0, declPtr, declPtr + declSize);
    m._xatlasUvMeshDeclInit(declPtr);
    const allocs = [declPtr];
    const uvPtr = copyToHeap(m, uvs);
    allocs.push(uvPtr);
    let idxPtr = 0, indexCount = 0, indexFormat = IndexFormat.UInt16;
    if (indices) {
      idxPtr = copyToHeap(m, indices);
      allocs.push(idxPtr);
      indexCount = indices.length;
      indexFormat = indices instanceof Uint32Array ? IndexFormat.UInt32 : IndexFormat.UInt16;
    }
    let faceMatPtr = 0;
    if (faceMaterialData) {
      faceMatPtr = copyToHeap(m, faceMaterialData);
      allocs.push(faceMatPtr);
    }
    m.setValue(declPtr + 0, uvPtr, "i32");
    m.setValue(declPtr + 4, idxPtr, "i32");
    m.setValue(declPtr + 8, faceMatPtr, "i32");
    m.setValue(declPtr + 12, vertexCount, "i32");
    m.setValue(declPtr + 16, 2 * 4, "i32");
    m.setValue(declPtr + 20, indexCount, "i32");
    m.setValue(declPtr + 24, 0, "i32");
    m.setValue(declPtr + 28, indexFormat, "i32");
    const error = m._xatlasAddUvMesh(this._ptr, declPtr);
    for (const p of allocs) m._free(p);
    return error;
  }
  addMeshJoin() {
    this._m._xatlasAddMeshJoin(this._ptr);
  }
  /**
   * Compute charts for all added meshes.
   * @param {object} [opts]
   */
  computeCharts(opts) {
    const m = this._m;
    if (!opts) {
      m._xatlasComputeCharts(this._ptr, 0);
      return;
    }
    const size = m._xatlasChartOptions_size();
    const ptr = m._malloc(size);
    m._xatlasChartOptionsInit(ptr);
    this._writeChartOptions(ptr, opts);
    m._xatlasComputeCharts(this._ptr, ptr);
    m._free(ptr);
  }
  /**
   * Pack charts into atlas(es).
   * @param {object} [opts]
   */
  packCharts(opts) {
    const m = this._m;
    if (!opts) {
      m._xatlasPackCharts(this._ptr, 0);
      return;
    }
    const size = m._xatlasPackOptions_size();
    const ptr = m._malloc(size);
    m._xatlasPackOptionsInit(ptr);
    this._writePackOptions(ptr, opts);
    m._xatlasPackCharts(this._ptr, ptr);
    m._free(ptr);
  }
  /**
   * Generate atlas (computeCharts + packCharts in one call).
   * @param {object} [chartOptions]
   * @param {object} [packOptions]
   */
  generate(chartOptions, packOptions) {
    const m = this._m;
    let chartPtr = 0, packPtr = 0;
    if (chartOptions) {
      const size = m._xatlasChartOptions_size();
      chartPtr = m._malloc(size);
      m._xatlasChartOptionsInit(chartPtr);
      this._writeChartOptions(chartPtr, chartOptions);
    }
    if (packOptions) {
      const size = m._xatlasPackOptions_size();
      packPtr = m._malloc(size);
      m._xatlasPackOptionsInit(packPtr);
      this._writePackOptions(packPtr, packOptions);
    }
    m._xatlasGenerate(this._ptr, chartPtr, packPtr);
    if (chartPtr) m._free(chartPtr);
    if (packPtr) m._free(packPtr);
  }
  /**
   * Set progress callback. Pass null to clear.
   * @param {function|null} fn - (category: number, progress: number) => boolean
   */
  setProgressCallback(fn) {
    const m = this._m;
    if (this._progressFnPtr) {
      m.removeFunction(this._progressFnPtr);
      this._progressFnPtr = 0;
    }
    if (fn) {
      this._progressFnPtr = m.addFunction((category, progress, _userData) => {
        return fn(category, progress) ? 1 : 0;
      }, "iiii");
      m._xatlasSetProgressCallback(this._ptr, this._progressFnPtr, 0);
    } else {
      m._xatlasSetProgressCallback(this._ptr, 0, 0);
    }
  }
  /* ── Result getters ──────────────────────────────────────────── */
  get width() {
    return this._m._xatlasAtlas_getWidth(this._ptr);
  }
  get height() {
    return this._m._xatlasAtlas_getHeight(this._ptr);
  }
  get atlasCount() {
    return this._m._xatlasAtlas_getAtlasCount(this._ptr);
  }
  get chartCount() {
    return this._m._xatlasAtlas_getChartCount(this._ptr);
  }
  get meshCount() {
    return this._m._xatlasAtlas_getMeshCount(this._ptr);
  }
  get texelsPerUnit() {
    return this._m._xatlasAtlas_getTexelsPerUnit(this._ptr);
  }
  getUtilization(atlasIndex) {
    return this._m._xatlasAtlas_getUtilization(this._ptr, atlasIndex);
  }
  /**
   * Retrieve output mesh data for a given input mesh index.
   * @param {number} meshIndex
   * @returns {{ vertexCount: number, indexCount: number, chartCount: number, vertices: Array, indices: Uint32Array, charts: Array }}
   */
  getMesh(meshIndex) {
    const m = this._m;
    const meshPtr = m._xatlasAtlas_getMesh(this._ptr, meshIndex);
    const vertexCount = m._xatlasMesh_getVertexCount(meshPtr);
    const indexCount = m._xatlasMesh_getIndexCount(meshPtr);
    const chartCount = m._xatlasMesh_getChartCount(meshPtr);
    const vertexArrayPtr = m._xatlasMesh_getVertexArray(meshPtr);
    const vertices = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      vertices[i] = {
        atlasIndex: m._xatlasVertex_getAtlasIndex(vertexArrayPtr, i),
        chartIndex: m._xatlasVertex_getChartIndex(vertexArrayPtr, i),
        uv: [
          m._xatlasVertex_getUV0(vertexArrayPtr, i),
          m._xatlasVertex_getUV1(vertexArrayPtr, i)
        ],
        xref: m._xatlasVertex_getXref(vertexArrayPtr, i)
      };
    }
    const indexArrayPtr = m._xatlasMesh_getIndexArray(meshPtr);
    const indices = new Uint32Array(
      m.HEAPU32.buffer.slice(indexArrayPtr, indexArrayPtr + indexCount * 4)
    );
    const chartArrayPtr = m._xatlasMesh_getChartArray(meshPtr);
    const charts = new Array(chartCount);
    for (let i = 0; i < chartCount; i++) {
      const faceCount = m._xatlasChart_getFaceCount(chartArrayPtr, i);
      const faceArrayPtr = m._xatlasChart_getFaceArray(chartArrayPtr, i);
      charts[i] = {
        atlasIndex: m._xatlasChart_getAtlasIndex(chartArrayPtr, i),
        faceCount,
        type: m._xatlasChart_getType(chartArrayPtr, i),
        material: m._xatlasChart_getMaterial(chartArrayPtr, i),
        faces: new Uint32Array(
          m.HEAPU32.buffer.slice(faceArrayPtr, faceArrayPtr + faceCount * 4)
        )
      };
    }
    return { vertexCount, indexCount, chartCount, vertices, indices, charts };
  }
  /**
   * Retrieve the atlas image texel map.
   * Requires generate()/packCharts() to have been called with
   * PackOptions.createImage = true; otherwise returns null.
   * The returned data is a copy and remains valid after destroy().
   * @returns {{ width: number, height: number, atlasCount: number, data: Uint32Array } | null}
   */
  getImage() {
    const m = this._m;
    const imagePtr = m._xatlasAtlas_getImage(this._ptr);
    if (!imagePtr) return null;
    const width = this.width;
    const height = this.height;
    const atlasCount = this.atlasCount;
    const count = atlasCount * width * height;
    return {
      width,
      height,
      atlasCount,
      data: new Uint32Array(
        m.HEAPU32.buffer.slice(imagePtr, imagePtr + count * 4)
      )
    };
  }
  /* ── Private: write option structs ─────────────────────────── */
  _writeChartOptions(ptr, opts) {
    const m = this._m;
    const fields = [
      ["maxChartArea", 4, "float"],
      ["maxBoundaryLength", 8, "float"],
      ["normalDeviationWeight", 12, "float"],
      ["roundnessWeight", 16, "float"],
      ["straightnessWeight", 20, "float"],
      ["normalSeamWeight", 24, "float"],
      ["textureSeamWeight", 28, "float"],
      ["maxCost", 32, "float"],
      ["maxIterations", 36, "i32"]
    ];
    for (const [name, offset, type] of fields) {
      if (opts[name] !== void 0) m.setValue(ptr + offset, opts[name], type);
    }
    if (opts.useInputMeshUvs !== void 0) m.setValue(ptr + 40, opts.useInputMeshUvs ? 1 : 0, "i8");
    if (opts.fixWinding !== void 0) m.setValue(ptr + 41, opts.fixWinding ? 1 : 0, "i8");
  }
  _writePackOptions(ptr, opts) {
    const m = this._m;
    const intFields = [
      ["maxChartSize", 0, "i32"],
      ["padding", 4, "i32"],
      ["texelsPerUnit", 8, "float"],
      ["resolution", 12, "i32"]
    ];
    for (const [name, offset, type] of intFields) {
      if (opts[name] !== void 0) m.setValue(ptr + offset, opts[name], type);
    }
    const boolFields = [
      ["bilinear", 16],
      ["blockAlign", 17],
      ["bruteForce", 18],
      ["createImage", 19],
      ["rotateChartsToAxis", 20],
      ["rotateCharts", 21]
    ];
    for (const [name, offset] of boolFields) {
      if (opts[name] !== void 0) m.setValue(ptr + offset, opts[name] ? 1 : 0, "i8");
    }
  }
};
function addMeshErrorString(module, error) {
  const ptr = module._xatlasAddMeshErrorString(error);
  return module.UTF8ToString(ptr);
}
function progressCategoryString(module, category) {
  const ptr = module._xatlasProgressCategoryString(category);
  return module.UTF8ToString(ptr);
}
function isArrayBuffer(value) {
  return value instanceof ArrayBuffer || Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}
function normalizeWasmBinary(value) {
  if (isArrayBuffer(value)) {
    return new Uint8Array(value.slice(0));
  }
  const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return view.slice();
}
function validateCreateOptions(options) {
  if (options === void 0) return {};
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("xatlas-wasm: createXAtlas options must be an object");
  }
  const { wasmBinary, locateFile, print, printErr } = options;
  if (wasmBinary !== void 0 && !isArrayBuffer(wasmBinary) && !ArrayBuffer.isView(wasmBinary)) {
    throw new TypeError(
      'xatlas-wasm: createXAtlas option "wasmBinary" must be an ArrayBuffer or ArrayBufferView'
    );
  }
  if (locateFile !== void 0 && typeof locateFile !== "function") {
    throw new TypeError('xatlas-wasm: createXAtlas option "locateFile" must be a function');
  }
  if (print !== void 0 && typeof print !== "function") {
    throw new TypeError('xatlas-wasm: createXAtlas option "print" must be a function');
  }
  if (printErr !== void 0 && typeof printErr !== "function") {
    throw new TypeError('xatlas-wasm: createXAtlas option "printErr" must be a function');
  }
  return {
    wasmBinary: wasmBinary === void 0 ? void 0 : normalizeWasmBinary(wasmBinary),
    locateFile,
    print,
    printErr
  };
}
async function createXAtlas(options) {
  const validated = validateCreateOptions(options);
  const moduleOptions = {};
  let resolvedUrl;
  if (validated.wasmBinary !== void 0) {
    moduleOptions.wasmBinary = validated.wasmBinary;
  } else if (validated.locateFile !== void 0) {
    moduleOptions.locateFile = (path, prefix) => {
      const url = validated.locateFile(path, prefix);
      resolvedUrl = url;
      return url;
    };
  }
  if (validated.print !== void 0) moduleOptions.print = validated.print;
  if (validated.printErr !== void 0) moduleOptions.printErr = validated.printErr;
  let module;
  try {
    module = await xatlas_default(moduleOptions);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const source = resolvedUrl ? ` from ${resolvedUrl}` : "";
    throw new Error(`xatlas-wasm: failed to initialize xatlas.wasm${source}: ${detail}`, {
      cause: error
    });
  }
  return {
    createAtlas: () => new XAtlas(module),
    addMeshErrorString: (error) => addMeshErrorString(module, error),
    progressCategoryString: (category) => progressCategoryString(module, category),
    decodeImagePixel,
    ChartType,
    IndexFormat,
    AddMeshError,
    ProgressCategory,
    ImageChartIndexMask,
    ImageHasChartIndexBit,
    ImageIsBilinearBit,
    ImageIsPaddingBit
  };
}
export {
  AddMeshError,
  ChartType,
  ImageChartIndexMask,
  ImageHasChartIndexBit,
  ImageIsBilinearBit,
  ImageIsPaddingBit,
  IndexFormat,
  ProgressCategory,
  decodeImagePixel,
  createXAtlas as default
};
