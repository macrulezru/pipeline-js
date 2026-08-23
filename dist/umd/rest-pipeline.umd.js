"use strict";
var RestPipeline = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all3) => {
    for (var name in all3)
      __defProp(target, name, { get: all3[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // dist/esm/index.js
  var index_exports = {};
  __export(index_exports, {
    CircuitBreaker: () => CircuitBreaker,
    CircuitOpenError: () => CircuitOpenError,
    DEFAULT_SENSITIVE_HEADERS: () => DEFAULT_SENSITIVE_HEADERS,
    ErrorHandler: () => ErrorHandler,
    OfflineQueue: () => OfflineQueue,
    OfflineQueuedError: () => OfflineQueuedError,
    PipelineBuilder: () => PipelineBuilder,
    PipelineOrchestrator: () => PipelineOrchestrator,
    ProgressTracker: () => ProgressTracker,
    RequestExecutor: () => RequestExecutor,
    clearRestClientCache: () => clearRestClientCache,
    createPipeline: () => createPipeline,
    createRestClient: () => createRestClient,
    defaultIsOnline: () => defaultIsOnline,
    defaultOnOnlineChange: () => defaultOnOnlineChange,
    defaultShouldQueue: () => defaultShouldQueue,
    flattenPages: () => flattenPages,
    generateTraceparent: () => generateTraceparent,
    getRestClient: () => getRestClient,
    isStepRecovery: () => isStepRecovery,
    paginate: () => paginate,
    paginateAll: () => paginateAll,
    pipe: () => pipe,
    recoverStep: () => recoverStep,
    sanitizeHeadersMap: () => sanitizeHeadersMap,
    toApiError: () => toApiError,
    validatePipelineConfig: () => validatePipelineConfig
  });

  // node_modules/axios/lib/helpers/bind.js
  function bind(fn, thisArg) {
    return function wrap() {
      return fn.apply(thisArg, arguments);
    };
  }

  // node_modules/axios/lib/utils.js
  var { toString } = Object.prototype;
  var { getPrototypeOf } = Object;
  var { iterator, toStringTag } = Symbol;
  var kindOf = /* @__PURE__ */ ((cache) => (thing) => {
    const str = toString.call(thing);
    return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
  })(/* @__PURE__ */ Object.create(null));
  var kindOfTest = (type) => {
    type = type.toLowerCase();
    return (thing) => kindOf(thing) === type;
  };
  var typeOfTest = (type) => (thing) => typeof thing === type;
  var { isArray } = Array;
  var isUndefined = typeOfTest("undefined");
  function isBuffer(val) {
    return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
  }
  var isArrayBuffer = kindOfTest("ArrayBuffer");
  function isArrayBufferView(val) {
    let result;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
      result = ArrayBuffer.isView(val);
    } else {
      result = val && val.buffer && isArrayBuffer(val.buffer);
    }
    return result;
  }
  var isString = typeOfTest("string");
  var isFunction = typeOfTest("function");
  var isNumber = typeOfTest("number");
  var isObject = (thing) => thing !== null && typeof thing === "object";
  var isBoolean = (thing) => thing === true || thing === false;
  var isPlainObject = (val) => {
    if (kindOf(val) !== "object") {
      return false;
    }
    const prototype3 = getPrototypeOf(val);
    return (prototype3 === null || prototype3 === Object.prototype || Object.getPrototypeOf(prototype3) === null) && !(toStringTag in val) && !(iterator in val);
  };
  var isEmptyObject = (val) => {
    if (!isObject(val) || isBuffer(val)) {
      return false;
    }
    try {
      return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
    } catch (e) {
      return false;
    }
  };
  var isDate = kindOfTest("Date");
  var isFile = kindOfTest("File");
  var isBlob = kindOfTest("Blob");
  var isFileList = kindOfTest("FileList");
  var isStream = (val) => isObject(val) && isFunction(val.pipe);
  var isFormData = (thing) => {
    let kind;
    return thing && (typeof FormData === "function" && thing instanceof FormData || isFunction(thing.append) && ((kind = kindOf(thing)) === "formdata" || // detect form-data instance
    kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]"));
  };
  var isURLSearchParams = kindOfTest("URLSearchParams");
  var [isReadableStream, isRequest, isResponse, isHeaders] = ["ReadableStream", "Request", "Response", "Headers"].map(kindOfTest);
  var trim = (str) => str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
  function forEach(obj, fn, { allOwnKeys = false } = {}) {
    if (obj === null || typeof obj === "undefined") {
      return;
    }
    let i;
    let l;
    if (typeof obj !== "object") {
      obj = [obj];
    }
    if (isArray(obj)) {
      for (i = 0, l = obj.length; i < l; i++) {
        fn.call(null, obj[i], i, obj);
      }
    } else {
      if (isBuffer(obj)) {
        return;
      }
      const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
      const len = keys.length;
      let key;
      for (i = 0; i < len; i++) {
        key = keys[i];
        fn.call(null, obj[key], key, obj);
      }
    }
  }
  function findKey(obj, key) {
    if (isBuffer(obj)) {
      return null;
    }
    key = key.toLowerCase();
    const keys = Object.keys(obj);
    let i = keys.length;
    let _key;
    while (i-- > 0) {
      _key = keys[i];
      if (key === _key.toLowerCase()) {
        return _key;
      }
    }
    return null;
  }
  var _global = (() => {
    if (typeof globalThis !== "undefined") return globalThis;
    return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
  })();
  var isContextDefined = (context) => !isUndefined(context) && context !== _global;
  function merge() {
    const { caseless, skipUndefined } = isContextDefined(this) && this || {};
    const result = {};
    const assignValue = (val, key) => {
      const targetKey = caseless && findKey(result, key) || key;
      if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
        result[targetKey] = merge(result[targetKey], val);
      } else if (isPlainObject(val)) {
        result[targetKey] = merge({}, val);
      } else if (isArray(val)) {
        result[targetKey] = val.slice();
      } else if (!skipUndefined || !isUndefined(val)) {
        result[targetKey] = val;
      }
    };
    for (let i = 0, l = arguments.length; i < l; i++) {
      arguments[i] && forEach(arguments[i], assignValue);
    }
    return result;
  }
  var extend = (a, b, thisArg, { allOwnKeys } = {}) => {
    forEach(b, (val, key) => {
      if (thisArg && isFunction(val)) {
        a[key] = bind(val, thisArg);
      } else {
        a[key] = val;
      }
    }, { allOwnKeys });
    return a;
  };
  var stripBOM = (content) => {
    if (content.charCodeAt(0) === 65279) {
      content = content.slice(1);
    }
    return content;
  };
  var inherits = (constructor, superConstructor, props, descriptors2) => {
    constructor.prototype = Object.create(superConstructor.prototype, descriptors2);
    constructor.prototype.constructor = constructor;
    Object.defineProperty(constructor, "super", {
      value: superConstructor.prototype
    });
    props && Object.assign(constructor.prototype, props);
  };
  var toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
    let props;
    let i;
    let prop;
    const merged = {};
    destObj = destObj || {};
    if (sourceObj == null) return destObj;
    do {
      props = Object.getOwnPropertyNames(sourceObj);
      i = props.length;
      while (i-- > 0) {
        prop = props[i];
        if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
          destObj[prop] = sourceObj[prop];
          merged[prop] = true;
        }
      }
      sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
    } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
    return destObj;
  };
  var endsWith = (str, searchString, position) => {
    str = String(str);
    if (position === void 0 || position > str.length) {
      position = str.length;
    }
    position -= searchString.length;
    const lastIndex = str.indexOf(searchString, position);
    return lastIndex !== -1 && lastIndex === position;
  };
  var toArray = (thing) => {
    if (!thing) return null;
    if (isArray(thing)) return thing;
    let i = thing.length;
    if (!isNumber(i)) return null;
    const arr = new Array(i);
    while (i-- > 0) {
      arr[i] = thing[i];
    }
    return arr;
  };
  var isTypedArray = /* @__PURE__ */ ((TypedArray) => {
    return (thing) => {
      return TypedArray && thing instanceof TypedArray;
    };
  })(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
  var forEachEntry = (obj, fn) => {
    const generator = obj && obj[iterator];
    const _iterator = generator.call(obj);
    let result;
    while ((result = _iterator.next()) && !result.done) {
      const pair = result.value;
      fn.call(obj, pair[0], pair[1]);
    }
  };
  var matchAll = (regExp, str) => {
    let matches;
    const arr = [];
    while ((matches = regExp.exec(str)) !== null) {
      arr.push(matches);
    }
    return arr;
  };
  var isHTMLForm = kindOfTest("HTMLFormElement");
  var toCamelCase = (str) => {
    return str.toLowerCase().replace(
      /[-_\s]([a-z\d])(\w*)/g,
      function replacer(m, p1, p2) {
        return p1.toUpperCase() + p2;
      }
    );
  };
  var hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj, prop) => hasOwnProperty2.call(obj, prop))(Object.prototype);
  var isRegExp = kindOfTest("RegExp");
  var reduceDescriptors = (obj, reducer) => {
    const descriptors2 = Object.getOwnPropertyDescriptors(obj);
    const reducedDescriptors = {};
    forEach(descriptors2, (descriptor, name) => {
      let ret;
      if ((ret = reducer(descriptor, name, obj)) !== false) {
        reducedDescriptors[name] = ret || descriptor;
      }
    });
    Object.defineProperties(obj, reducedDescriptors);
  };
  var freezeMethods = (obj) => {
    reduceDescriptors(obj, (descriptor, name) => {
      if (isFunction(obj) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
        return false;
      }
      const value = obj[name];
      if (!isFunction(value)) return;
      descriptor.enumerable = false;
      if ("writable" in descriptor) {
        descriptor.writable = false;
        return;
      }
      if (!descriptor.set) {
        descriptor.set = () => {
          throw Error("Can not rewrite read-only method '" + name + "'");
        };
      }
    });
  };
  var toObjectSet = (arrayOrString, delimiter) => {
    const obj = {};
    const define = (arr) => {
      arr.forEach((value) => {
        obj[value] = true;
      });
    };
    isArray(arrayOrString) ? define(arrayOrString) : define(String(arrayOrString).split(delimiter));
    return obj;
  };
  var noop = () => {
  };
  var toFiniteNumber = (value, defaultValue) => {
    return value != null && Number.isFinite(value = +value) ? value : defaultValue;
  };
  function isSpecCompliantForm(thing) {
    return !!(thing && isFunction(thing.append) && thing[toStringTag] === "FormData" && thing[iterator]);
  }
  var toJSONObject = (obj) => {
    const stack = new Array(10);
    const visit = (source, i) => {
      if (isObject(source)) {
        if (stack.indexOf(source) >= 0) {
          return;
        }
        if (isBuffer(source)) {
          return source;
        }
        if (!("toJSON" in source)) {
          stack[i] = source;
          const target = isArray(source) ? [] : {};
          forEach(source, (value, key) => {
            const reducedValue = visit(value, i + 1);
            !isUndefined(reducedValue) && (target[key] = reducedValue);
          });
          stack[i] = void 0;
          return target;
        }
      }
      return source;
    };
    return visit(obj, 0);
  };
  var isAsyncFn = kindOfTest("AsyncFunction");
  var isThenable = (thing) => thing && (isObject(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
  var _setImmediate = ((setImmediateSupported, postMessageSupported) => {
    if (setImmediateSupported) {
      return setImmediate;
    }
    return postMessageSupported ? ((token, callbacks) => {
      _global.addEventListener("message", ({ source, data }) => {
        if (source === _global && data === token) {
          callbacks.length && callbacks.shift()();
        }
      }, false);
      return (cb) => {
        callbacks.push(cb);
        _global.postMessage(token, "*");
      };
    })(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
  })(
    typeof setImmediate === "function",
    isFunction(_global.postMessage)
  );
  var asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global) : typeof process !== "undefined" && process.nextTick || _setImmediate;
  var isIterable = (thing) => thing != null && isFunction(thing[iterator]);
  var utils_default = {
    isArray,
    isArrayBuffer,
    isBuffer,
    isFormData,
    isArrayBufferView,
    isString,
    isNumber,
    isBoolean,
    isObject,
    isPlainObject,
    isEmptyObject,
    isReadableStream,
    isRequest,
    isResponse,
    isHeaders,
    isUndefined,
    isDate,
    isFile,
    isBlob,
    isRegExp,
    isFunction,
    isStream,
    isURLSearchParams,
    isTypedArray,
    isFileList,
    forEach,
    merge,
    extend,
    trim,
    stripBOM,
    inherits,
    toFlatObject,
    kindOf,
    kindOfTest,
    endsWith,
    toArray,
    forEachEntry,
    matchAll,
    isHTMLForm,
    hasOwnProperty,
    hasOwnProp: hasOwnProperty,
    // an alias to avoid ESLint no-prototype-builtins detection
    reduceDescriptors,
    freezeMethods,
    toObjectSet,
    toCamelCase,
    noop,
    toFiniteNumber,
    findKey,
    global: _global,
    isContextDefined,
    isSpecCompliantForm,
    toJSONObject,
    isAsyncFn,
    isThenable,
    setImmediate: _setImmediate,
    asap,
    isIterable
  };

  // node_modules/axios/lib/core/AxiosError.js
  function AxiosError(message, code, config, request, response) {
    Error.call(this);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack;
    }
    this.message = message;
    this.name = "AxiosError";
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    if (response) {
      this.response = response;
      this.status = response.status ? response.status : null;
    }
  }
  utils_default.inherits(AxiosError, Error, {
    toJSON: function toJSON() {
      return {
        // Standard
        message: this.message,
        name: this.name,
        // Microsoft
        description: this.description,
        number: this.number,
        // Mozilla
        fileName: this.fileName,
        lineNumber: this.lineNumber,
        columnNumber: this.columnNumber,
        stack: this.stack,
        // Axios
        config: utils_default.toJSONObject(this.config),
        code: this.code,
        status: this.status
      };
    }
  });
  var prototype = AxiosError.prototype;
  var descriptors = {};
  [
    "ERR_BAD_OPTION_VALUE",
    "ERR_BAD_OPTION",
    "ECONNABORTED",
    "ETIMEDOUT",
    "ERR_NETWORK",
    "ERR_FR_TOO_MANY_REDIRECTS",
    "ERR_DEPRECATED",
    "ERR_BAD_RESPONSE",
    "ERR_BAD_REQUEST",
    "ERR_CANCELED",
    "ERR_NOT_SUPPORT",
    "ERR_INVALID_URL"
    // eslint-disable-next-line func-names
  ].forEach((code) => {
    descriptors[code] = { value: code };
  });
  Object.defineProperties(AxiosError, descriptors);
  Object.defineProperty(prototype, "isAxiosError", { value: true });
  AxiosError.from = (error, code, config, request, response, customProps) => {
    const axiosError = Object.create(prototype);
    utils_default.toFlatObject(error, axiosError, function filter2(obj) {
      return obj !== Error.prototype;
    }, (prop) => {
      return prop !== "isAxiosError";
    });
    const msg = error && error.message ? error.message : "Error";
    const errCode = code == null && error ? error.code : code;
    AxiosError.call(axiosError, msg, errCode, config, request, response);
    if (error && axiosError.cause == null) {
      Object.defineProperty(axiosError, "cause", { value: error, configurable: true });
    }
    axiosError.name = error && error.name || "Error";
    customProps && Object.assign(axiosError, customProps);
    return axiosError;
  };
  var AxiosError_default = AxiosError;

  // node_modules/axios/lib/helpers/null.js
  var null_default = null;

  // node_modules/axios/lib/helpers/toFormData.js
  function isVisitable(thing) {
    return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
  }
  function removeBrackets(key) {
    return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
  }
  function renderKey(path, key, dots) {
    if (!path) return key;
    return path.concat(key).map(function each(token, i) {
      token = removeBrackets(token);
      return !dots && i ? "[" + token + "]" : token;
    }).join(dots ? "." : "");
  }
  function isFlatArray(arr) {
    return utils_default.isArray(arr) && !arr.some(isVisitable);
  }
  var predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
    return /^is[A-Z]/.test(prop);
  });
  function toFormData(obj, formData, options) {
    if (!utils_default.isObject(obj)) {
      throw new TypeError("target must be an object");
    }
    formData = formData || new (null_default || FormData)();
    options = utils_default.toFlatObject(options, {
      metaTokens: true,
      dots: false,
      indexes: false
    }, false, function defined(option, source) {
      return !utils_default.isUndefined(source[option]);
    });
    const metaTokens = options.metaTokens;
    const visitor = options.visitor || defaultVisitor;
    const dots = options.dots;
    const indexes = options.indexes;
    const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
    const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
    if (!utils_default.isFunction(visitor)) {
      throw new TypeError("visitor must be a function");
    }
    function convertValue(value) {
      if (value === null) return "";
      if (utils_default.isDate(value)) {
        return value.toISOString();
      }
      if (utils_default.isBoolean(value)) {
        return value.toString();
      }
      if (!useBlob && utils_default.isBlob(value)) {
        throw new AxiosError_default("Blob is not supported. Use a Buffer instead.");
      }
      if (utils_default.isArrayBuffer(value) || utils_default.isTypedArray(value)) {
        return useBlob && typeof Blob === "function" ? new Blob([value]) : Buffer.from(value);
      }
      return value;
    }
    function defaultVisitor(value, key, path) {
      let arr = value;
      if (value && !path && typeof value === "object") {
        if (utils_default.endsWith(key, "{}")) {
          key = metaTokens ? key : key.slice(0, -2);
          value = JSON.stringify(value);
        } else if (utils_default.isArray(value) && isFlatArray(value) || (utils_default.isFileList(value) || utils_default.endsWith(key, "[]")) && (arr = utils_default.toArray(value))) {
          key = removeBrackets(key);
          arr.forEach(function each(el, index) {
            !(utils_default.isUndefined(el) || el === null) && formData.append(
              // eslint-disable-next-line no-nested-ternary
              indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]",
              convertValue(el)
            );
          });
          return false;
        }
      }
      if (isVisitable(value)) {
        return true;
      }
      formData.append(renderKey(path, key, dots), convertValue(value));
      return false;
    }
    const stack = [];
    const exposedHelpers = Object.assign(predicates, {
      defaultVisitor,
      convertValue,
      isVisitable
    });
    function build(value, path) {
      if (utils_default.isUndefined(value)) return;
      if (stack.indexOf(value) !== -1) {
        throw Error("Circular reference detected in " + path.join("."));
      }
      stack.push(value);
      utils_default.forEach(value, function each(el, key) {
        const result = !(utils_default.isUndefined(el) || el === null) && visitor.call(
          formData,
          el,
          utils_default.isString(key) ? key.trim() : key,
          path,
          exposedHelpers
        );
        if (result === true) {
          build(el, path ? path.concat(key) : [key]);
        }
      });
      stack.pop();
    }
    if (!utils_default.isObject(obj)) {
      throw new TypeError("data must be an object");
    }
    build(obj);
    return formData;
  }
  var toFormData_default = toFormData;

  // node_modules/axios/lib/helpers/AxiosURLSearchParams.js
  function encode(str) {
    const charMap = {
      "!": "%21",
      "'": "%27",
      "(": "%28",
      ")": "%29",
      "~": "%7E",
      "%20": "+",
      "%00": "\0"
    };
    return encodeURIComponent(str).replace(/[!'()~]|%20|%00/g, function replacer(match) {
      return charMap[match];
    });
  }
  function AxiosURLSearchParams(params, options) {
    this._pairs = [];
    params && toFormData_default(params, this, options);
  }
  var prototype2 = AxiosURLSearchParams.prototype;
  prototype2.append = function append(name, value) {
    this._pairs.push([name, value]);
  };
  prototype2.toString = function toString2(encoder) {
    const _encode = encoder ? function(value) {
      return encoder.call(this, value, encode);
    } : encode;
    return this._pairs.map(function each(pair) {
      return _encode(pair[0]) + "=" + _encode(pair[1]);
    }, "").join("&");
  };
  var AxiosURLSearchParams_default = AxiosURLSearchParams;

  // node_modules/axios/lib/helpers/buildURL.js
  function encode2(val) {
    return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
  }
  function buildURL(url, params, options) {
    if (!params) {
      return url;
    }
    const _encode = options && options.encode || encode2;
    if (utils_default.isFunction(options)) {
      options = {
        serialize: options
      };
    }
    const serializeFn = options && options.serialize;
    let serializedParams;
    if (serializeFn) {
      serializedParams = serializeFn(params, options);
    } else {
      serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams_default(params, options).toString(_encode);
    }
    if (serializedParams) {
      const hashmarkIndex = url.indexOf("#");
      if (hashmarkIndex !== -1) {
        url = url.slice(0, hashmarkIndex);
      }
      url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
    }
    return url;
  }

  // node_modules/axios/lib/core/InterceptorManager.js
  var InterceptorManager = class {
    constructor() {
      this.handlers = [];
    }
    /**
     * Add a new interceptor to the stack
     *
     * @param {Function} fulfilled The function to handle `then` for a `Promise`
     * @param {Function} rejected The function to handle `reject` for a `Promise`
     *
     * @return {Number} An ID used to remove interceptor later
     */
    use(fulfilled, rejected, options) {
      this.handlers.push({
        fulfilled,
        rejected,
        synchronous: options ? options.synchronous : false,
        runWhen: options ? options.runWhen : null
      });
      return this.handlers.length - 1;
    }
    /**
     * Remove an interceptor from the stack
     *
     * @param {Number} id The ID that was returned by `use`
     *
     * @returns {void}
     */
    eject(id) {
      if (this.handlers[id]) {
        this.handlers[id] = null;
      }
    }
    /**
     * Clear all interceptors from the stack
     *
     * @returns {void}
     */
    clear() {
      if (this.handlers) {
        this.handlers = [];
      }
    }
    /**
     * Iterate over all the registered interceptors
     *
     * This method is particularly useful for skipping over any
     * interceptors that may have become `null` calling `eject`.
     *
     * @param {Function} fn The function to call for each interceptor
     *
     * @returns {void}
     */
    forEach(fn) {
      utils_default.forEach(this.handlers, function forEachHandler(h) {
        if (h !== null) {
          fn(h);
        }
      });
    }
  };
  var InterceptorManager_default = InterceptorManager;

  // node_modules/axios/lib/defaults/transitional.js
  var transitional_default = {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false
  };

  // node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
  var URLSearchParams_default = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams_default;

  // node_modules/axios/lib/platform/browser/classes/FormData.js
  var FormData_default = typeof FormData !== "undefined" ? FormData : null;

  // node_modules/axios/lib/platform/browser/classes/Blob.js
  var Blob_default = typeof Blob !== "undefined" ? Blob : null;

  // node_modules/axios/lib/platform/browser/index.js
  var browser_default = {
    isBrowser: true,
    classes: {
      URLSearchParams: URLSearchParams_default,
      FormData: FormData_default,
      Blob: Blob_default
    },
    protocols: ["http", "https", "file", "blob", "url", "data"]
  };

  // node_modules/axios/lib/platform/common/utils.js
  var utils_exports = {};
  __export(utils_exports, {
    hasBrowserEnv: () => hasBrowserEnv,
    hasStandardBrowserEnv: () => hasStandardBrowserEnv,
    hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
    navigator: () => _navigator,
    origin: () => origin
  });
  var hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
  var _navigator = typeof navigator === "object" && navigator || void 0;
  var hasStandardBrowserEnv = hasBrowserEnv && (!_navigator || ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
  var hasStandardBrowserWebWorkerEnv = (() => {
    return typeof WorkerGlobalScope !== "undefined" && // eslint-disable-next-line no-undef
    self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
  })();
  var origin = hasBrowserEnv && window.location.href || "http://localhost";

  // node_modules/axios/lib/platform/index.js
  var platform_default = {
    ...utils_exports,
    ...browser_default
  };

  // node_modules/axios/lib/helpers/toURLEncodedForm.js
  function toURLEncodedForm(data, options) {
    return toFormData_default(data, new platform_default.classes.URLSearchParams(), {
      visitor: function(value, key, path, helpers) {
        if (platform_default.isNode && utils_default.isBuffer(value)) {
          this.append(key, value.toString("base64"));
          return false;
        }
        return helpers.defaultVisitor.apply(this, arguments);
      },
      ...options
    });
  }

  // node_modules/axios/lib/helpers/formDataToJSON.js
  function parsePropPath(name) {
    return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
      return match[0] === "[]" ? "" : match[1] || match[0];
    });
  }
  function arrayToObject(arr) {
    const obj = {};
    const keys = Object.keys(arr);
    let i;
    const len = keys.length;
    let key;
    for (i = 0; i < len; i++) {
      key = keys[i];
      obj[key] = arr[key];
    }
    return obj;
  }
  function formDataToJSON(formData) {
    function buildPath(path, value, target, index) {
      let name = path[index++];
      if (name === "__proto__") return true;
      const isNumericKey = Number.isFinite(+name);
      const isLast = index >= path.length;
      name = !name && utils_default.isArray(target) ? target.length : name;
      if (isLast) {
        if (utils_default.hasOwnProp(target, name)) {
          target[name] = [target[name], value];
        } else {
          target[name] = value;
        }
        return !isNumericKey;
      }
      if (!target[name] || !utils_default.isObject(target[name])) {
        target[name] = [];
      }
      const result = buildPath(path, value, target[name], index);
      if (result && utils_default.isArray(target[name])) {
        target[name] = arrayToObject(target[name]);
      }
      return !isNumericKey;
    }
    if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
      const obj = {};
      utils_default.forEachEntry(formData, (name, value) => {
        buildPath(parsePropPath(name), value, obj, 0);
      });
      return obj;
    }
    return null;
  }
  var formDataToJSON_default = formDataToJSON;

  // node_modules/axios/lib/defaults/index.js
  function stringifySafely(rawValue, parser, encoder) {
    if (utils_default.isString(rawValue)) {
      try {
        (parser || JSON.parse)(rawValue);
        return utils_default.trim(rawValue);
      } catch (e) {
        if (e.name !== "SyntaxError") {
          throw e;
        }
      }
    }
    return (encoder || JSON.stringify)(rawValue);
  }
  var defaults = {
    transitional: transitional_default,
    adapter: ["xhr", "http", "fetch"],
    transformRequest: [function transformRequest(data, headers) {
      const contentType = headers.getContentType() || "";
      const hasJSONContentType = contentType.indexOf("application/json") > -1;
      const isObjectPayload = utils_default.isObject(data);
      if (isObjectPayload && utils_default.isHTMLForm(data)) {
        data = new FormData(data);
      }
      const isFormData2 = utils_default.isFormData(data);
      if (isFormData2) {
        return hasJSONContentType ? JSON.stringify(formDataToJSON_default(data)) : data;
      }
      if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (utils_default.isArrayBufferView(data)) {
        return data.buffer;
      }
      if (utils_default.isURLSearchParams(data)) {
        headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
        return data.toString();
      }
      let isFileList2;
      if (isObjectPayload) {
        if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
          return toURLEncodedForm(data, this.formSerializer).toString();
        }
        if ((isFileList2 = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
          const _FormData = this.env && this.env.FormData;
          return toFormData_default(
            isFileList2 ? { "files[]": data } : data,
            _FormData && new _FormData(),
            this.formSerializer
          );
        }
      }
      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType("application/json", false);
        return stringifySafely(data);
      }
      return data;
    }],
    transformResponse: [function transformResponse(data) {
      const transitional2 = this.transitional || defaults.transitional;
      const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
      const JSONRequested = this.responseType === "json";
      if (utils_default.isResponse(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (data && utils_default.isString(data) && (forcedJSONParsing && !this.responseType || JSONRequested)) {
        const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;
        try {
          return JSON.parse(data, this.parseReviver);
        } catch (e) {
          if (strictJSONParsing) {
            if (e.name === "SyntaxError") {
              throw AxiosError_default.from(e, AxiosError_default.ERR_BAD_RESPONSE, this, null, this.response);
            }
            throw e;
          }
        }
      }
      return data;
    }],
    /**
     * A timeout in milliseconds to abort a request. If set to 0 (default) a
     * timeout is not created.
     */
    timeout: 0,
    xsrfCookieName: "XSRF-TOKEN",
    xsrfHeaderName: "X-XSRF-TOKEN",
    maxContentLength: -1,
    maxBodyLength: -1,
    env: {
      FormData: platform_default.classes.FormData,
      Blob: platform_default.classes.Blob
    },
    validateStatus: function validateStatus(status) {
      return status >= 200 && status < 300;
    },
    headers: {
      common: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": void 0
      }
    }
  };
  utils_default.forEach(["delete", "get", "head", "post", "put", "patch"], (method) => {
    defaults.headers[method] = {};
  });
  var defaults_default = defaults;

  // node_modules/axios/lib/helpers/parseHeaders.js
  var ignoreDuplicateOf = utils_default.toObjectSet([
    "age",
    "authorization",
    "content-length",
    "content-type",
    "etag",
    "expires",
    "from",
    "host",
    "if-modified-since",
    "if-unmodified-since",
    "last-modified",
    "location",
    "max-forwards",
    "proxy-authorization",
    "referer",
    "retry-after",
    "user-agent"
  ]);
  var parseHeaders_default = (rawHeaders) => {
    const parsed = {};
    let key;
    let val;
    let i;
    rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
      i = line.indexOf(":");
      key = line.substring(0, i).trim().toLowerCase();
      val = line.substring(i + 1).trim();
      if (!key || parsed[key] && ignoreDuplicateOf[key]) {
        return;
      }
      if (key === "set-cookie") {
        if (parsed[key]) {
          parsed[key].push(val);
        } else {
          parsed[key] = [val];
        }
      } else {
        parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
      }
    });
    return parsed;
  };

  // node_modules/axios/lib/core/AxiosHeaders.js
  var $internals = /* @__PURE__ */ Symbol("internals");
  function normalizeHeader(header) {
    return header && String(header).trim().toLowerCase();
  }
  function normalizeValue(value) {
    if (value === false || value == null) {
      return value;
    }
    return utils_default.isArray(value) ? value.map(normalizeValue) : String(value);
  }
  function parseTokens(str) {
    const tokens = /* @__PURE__ */ Object.create(null);
    const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
    let match;
    while (match = tokensRE.exec(str)) {
      tokens[match[1]] = match[2];
    }
    return tokens;
  }
  var isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
  function matchHeaderValue(context, value, header, filter2, isHeaderNameFilter) {
    if (utils_default.isFunction(filter2)) {
      return filter2.call(this, value, header);
    }
    if (isHeaderNameFilter) {
      value = header;
    }
    if (!utils_default.isString(value)) return;
    if (utils_default.isString(filter2)) {
      return value.indexOf(filter2) !== -1;
    }
    if (utils_default.isRegExp(filter2)) {
      return filter2.test(value);
    }
  }
  function formatHeader(header) {
    return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str) => {
      return char.toUpperCase() + str;
    });
  }
  function buildAccessors(obj, header) {
    const accessorName = utils_default.toCamelCase(" " + header);
    ["get", "set", "has"].forEach((methodName) => {
      Object.defineProperty(obj, methodName + accessorName, {
        value: function(arg1, arg2, arg3) {
          return this[methodName].call(this, header, arg1, arg2, arg3);
        },
        configurable: true
      });
    });
  }
  var AxiosHeaders = class {
    constructor(headers) {
      headers && this.set(headers);
    }
    set(header, valueOrRewrite, rewrite) {
      const self2 = this;
      function setHeader(_value, _header, _rewrite) {
        const lHeader = normalizeHeader(_header);
        if (!lHeader) {
          throw new Error("header name must be a non-empty string");
        }
        const key = utils_default.findKey(self2, lHeader);
        if (!key || self2[key] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key] !== false) {
          self2[key || _header] = normalizeValue(_value);
        }
      }
      const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
      if (utils_default.isPlainObject(header) || header instanceof this.constructor) {
        setHeaders(header, valueOrRewrite);
      } else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
        setHeaders(parseHeaders_default(header), valueOrRewrite);
      } else if (utils_default.isObject(header) && utils_default.isIterable(header)) {
        let obj = {}, dest, key;
        for (const entry of header) {
          if (!utils_default.isArray(entry)) {
            throw TypeError("Object iterator must return a key-value pair");
          }
          obj[key = entry[0]] = (dest = obj[key]) ? utils_default.isArray(dest) ? [...dest, entry[1]] : [dest, entry[1]] : entry[1];
        }
        setHeaders(obj, valueOrRewrite);
      } else {
        header != null && setHeader(valueOrRewrite, header, rewrite);
      }
      return this;
    }
    get(header, parser) {
      header = normalizeHeader(header);
      if (header) {
        const key = utils_default.findKey(this, header);
        if (key) {
          const value = this[key];
          if (!parser) {
            return value;
          }
          if (parser === true) {
            return parseTokens(value);
          }
          if (utils_default.isFunction(parser)) {
            return parser.call(this, value, key);
          }
          if (utils_default.isRegExp(parser)) {
            return parser.exec(value);
          }
          throw new TypeError("parser must be boolean|regexp|function");
        }
      }
    }
    has(header, matcher) {
      header = normalizeHeader(header);
      if (header) {
        const key = utils_default.findKey(this, header);
        return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
      }
      return false;
    }
    delete(header, matcher) {
      const self2 = this;
      let deleted = false;
      function deleteHeader(_header) {
        _header = normalizeHeader(_header);
        if (_header) {
          const key = utils_default.findKey(self2, _header);
          if (key && (!matcher || matchHeaderValue(self2, self2[key], key, matcher))) {
            delete self2[key];
            deleted = true;
          }
        }
      }
      if (utils_default.isArray(header)) {
        header.forEach(deleteHeader);
      } else {
        deleteHeader(header);
      }
      return deleted;
    }
    clear(matcher) {
      const keys = Object.keys(this);
      let i = keys.length;
      let deleted = false;
      while (i--) {
        const key = keys[i];
        if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
          delete this[key];
          deleted = true;
        }
      }
      return deleted;
    }
    normalize(format) {
      const self2 = this;
      const headers = {};
      utils_default.forEach(this, (value, header) => {
        const key = utils_default.findKey(headers, header);
        if (key) {
          self2[key] = normalizeValue(value);
          delete self2[header];
          return;
        }
        const normalized = format ? formatHeader(header) : String(header).trim();
        if (normalized !== header) {
          delete self2[header];
        }
        self2[normalized] = normalizeValue(value);
        headers[normalized] = true;
      });
      return this;
    }
    concat(...targets) {
      return this.constructor.concat(this, ...targets);
    }
    toJSON(asStrings) {
      const obj = /* @__PURE__ */ Object.create(null);
      utils_default.forEach(this, (value, header) => {
        value != null && value !== false && (obj[header] = asStrings && utils_default.isArray(value) ? value.join(", ") : value);
      });
      return obj;
    }
    [Symbol.iterator]() {
      return Object.entries(this.toJSON())[Symbol.iterator]();
    }
    toString() {
      return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
    }
    getSetCookie() {
      return this.get("set-cookie") || [];
    }
    get [Symbol.toStringTag]() {
      return "AxiosHeaders";
    }
    static from(thing) {
      return thing instanceof this ? thing : new this(thing);
    }
    static concat(first, ...targets) {
      const computed = new this(first);
      targets.forEach((target) => computed.set(target));
      return computed;
    }
    static accessor(header) {
      const internals = this[$internals] = this[$internals] = {
        accessors: {}
      };
      const accessors = internals.accessors;
      const prototype3 = this.prototype;
      function defineAccessor(_header) {
        const lHeader = normalizeHeader(_header);
        if (!accessors[lHeader]) {
          buildAccessors(prototype3, _header);
          accessors[lHeader] = true;
        }
      }
      utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
      return this;
    }
  };
  AxiosHeaders.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
  utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key) => {
    let mapped = key[0].toUpperCase() + key.slice(1);
    return {
      get: () => value,
      set(headerValue) {
        this[mapped] = headerValue;
      }
    };
  });
  utils_default.freezeMethods(AxiosHeaders);
  var AxiosHeaders_default = AxiosHeaders;

  // node_modules/axios/lib/core/transformData.js
  function transformData(fns, response) {
    const config = this || defaults_default;
    const context = response || config;
    const headers = AxiosHeaders_default.from(context.headers);
    let data = context.data;
    utils_default.forEach(fns, function transform(fn) {
      data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
    });
    headers.normalize();
    return data;
  }

  // node_modules/axios/lib/cancel/isCancel.js
  function isCancel(value) {
    return !!(value && value.__CANCEL__);
  }

  // node_modules/axios/lib/cancel/CanceledError.js
  function CanceledError(message, config, request) {
    AxiosError_default.call(this, message == null ? "canceled" : message, AxiosError_default.ERR_CANCELED, config, request);
    this.name = "CanceledError";
  }
  utils_default.inherits(CanceledError, AxiosError_default, {
    __CANCEL__: true
  });
  var CanceledError_default = CanceledError;

  // node_modules/axios/lib/core/settle.js
  function settle(resolve, reject, response) {
    const validateStatus2 = response.config.validateStatus;
    if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
      resolve(response);
    } else {
      reject(new AxiosError_default(
        "Request failed with status code " + response.status,
        [AxiosError_default.ERR_BAD_REQUEST, AxiosError_default.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
        response.config,
        response.request,
        response
      ));
    }
  }

  // node_modules/axios/lib/helpers/parseProtocol.js
  function parseProtocol(url) {
    const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
    return match && match[1] || "";
  }

  // node_modules/axios/lib/helpers/speedometer.js
  function speedometer(samplesCount, min) {
    samplesCount = samplesCount || 10;
    const bytes = new Array(samplesCount);
    const timestamps = new Array(samplesCount);
    let head = 0;
    let tail = 0;
    let firstSampleTS;
    min = min !== void 0 ? min : 1e3;
    return function push(chunkLength) {
      const now = Date.now();
      const startedAt = timestamps[tail];
      if (!firstSampleTS) {
        firstSampleTS = now;
      }
      bytes[head] = chunkLength;
      timestamps[head] = now;
      let i = tail;
      let bytesCount = 0;
      while (i !== head) {
        bytesCount += bytes[i++];
        i = i % samplesCount;
      }
      head = (head + 1) % samplesCount;
      if (head === tail) {
        tail = (tail + 1) % samplesCount;
      }
      if (now - firstSampleTS < min) {
        return;
      }
      const passed = startedAt && now - startedAt;
      return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
    };
  }
  var speedometer_default = speedometer;

  // node_modules/axios/lib/helpers/throttle.js
  function throttle(fn, freq) {
    let timestamp = 0;
    let threshold = 1e3 / freq;
    let lastArgs;
    let timer;
    const invoke = (args, now = Date.now()) => {
      timestamp = now;
      lastArgs = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fn(...args);
    };
    const throttled = (...args) => {
      const now = Date.now();
      const passed = now - timestamp;
      if (passed >= threshold) {
        invoke(args, now);
      } else {
        lastArgs = args;
        if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            invoke(lastArgs);
          }, threshold - passed);
        }
      }
    };
    const flush = () => lastArgs && invoke(lastArgs);
    return [throttled, flush];
  }
  var throttle_default = throttle;

  // node_modules/axios/lib/helpers/progressEventReducer.js
  var progressEventReducer = (listener, isDownloadStream, freq = 3) => {
    let bytesNotified = 0;
    const _speedometer = speedometer_default(50, 250);
    return throttle_default((e) => {
      const loaded = e.loaded;
      const total = e.lengthComputable ? e.total : void 0;
      const progressBytes = loaded - bytesNotified;
      const rate = _speedometer(progressBytes);
      const inRange = loaded <= total;
      bytesNotified = loaded;
      const data = {
        loaded,
        total,
        progress: total ? loaded / total : void 0,
        bytes: progressBytes,
        rate: rate ? rate : void 0,
        estimated: rate && total && inRange ? (total - loaded) / rate : void 0,
        event: e,
        lengthComputable: total != null,
        [isDownloadStream ? "download" : "upload"]: true
      };
      listener(data);
    }, freq);
  };
  var progressEventDecorator = (total, throttled) => {
    const lengthComputable = total != null;
    return [(loaded) => throttled[0]({
      lengthComputable,
      total,
      loaded
    }), throttled[1]];
  };
  var asyncDecorator = (fn) => (...args) => utils_default.asap(() => fn(...args));

  // node_modules/axios/lib/helpers/isURLSameOrigin.js
  var isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? /* @__PURE__ */ ((origin2, isMSIE) => (url) => {
    url = new URL(url, platform_default.origin);
    return origin2.protocol === url.protocol && origin2.host === url.host && (isMSIE || origin2.port === url.port);
  })(
    new URL(platform_default.origin),
    platform_default.navigator && /(msie|trident)/i.test(platform_default.navigator.userAgent)
  ) : () => true;

  // node_modules/axios/lib/helpers/cookies.js
  var cookies_default = platform_default.hasStandardBrowserEnv ? (
    // Standard browser envs support document.cookie
    {
      write(name, value, expires, path, domain, secure, sameSite) {
        if (typeof document === "undefined") return;
        const cookie = [`${name}=${encodeURIComponent(value)}`];
        if (utils_default.isNumber(expires)) {
          cookie.push(`expires=${new Date(expires).toUTCString()}`);
        }
        if (utils_default.isString(path)) {
          cookie.push(`path=${path}`);
        }
        if (utils_default.isString(domain)) {
          cookie.push(`domain=${domain}`);
        }
        if (secure === true) {
          cookie.push("secure");
        }
        if (utils_default.isString(sameSite)) {
          cookie.push(`SameSite=${sameSite}`);
        }
        document.cookie = cookie.join("; ");
      },
      read(name) {
        if (typeof document === "undefined") return null;
        const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
        return match ? decodeURIComponent(match[1]) : null;
      },
      remove(name) {
        this.write(name, "", Date.now() - 864e5, "/");
      }
    }
  ) : (
    // Non-standard browser env (web workers, react-native) lack needed support.
    {
      write() {
      },
      read() {
        return null;
      },
      remove() {
      }
    }
  );

  // node_modules/axios/lib/helpers/isAbsoluteURL.js
  function isAbsoluteURL(url) {
    return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
  }

  // node_modules/axios/lib/helpers/combineURLs.js
  function combineURLs(baseURL, relativeURL) {
    return relativeURL ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
  }

  // node_modules/axios/lib/core/buildFullPath.js
  function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
    let isRelativeUrl = !isAbsoluteURL(requestedURL);
    if (baseURL && (isRelativeUrl || allowAbsoluteUrls == false)) {
      return combineURLs(baseURL, requestedURL);
    }
    return requestedURL;
  }

  // node_modules/axios/lib/core/mergeConfig.js
  var headersToObject = (thing) => thing instanceof AxiosHeaders_default ? { ...thing } : thing;
  function mergeConfig(config1, config2) {
    config2 = config2 || {};
    const config = {};
    function getMergedValue(target, source, prop, caseless) {
      if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) {
        return utils_default.merge.call({ caseless }, target, source);
      } else if (utils_default.isPlainObject(source)) {
        return utils_default.merge({}, source);
      } else if (utils_default.isArray(source)) {
        return source.slice();
      }
      return source;
    }
    function mergeDeepProperties(a, b, prop, caseless) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(a, b, prop, caseless);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a, prop, caseless);
      }
    }
    function valueFromConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      }
    }
    function defaultToConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a);
      }
    }
    function mergeDirectKeys(a, b, prop) {
      if (prop in config2) {
        return getMergedValue(a, b);
      } else if (prop in config1) {
        return getMergedValue(void 0, a);
      }
    }
    const mergeMap = {
      url: valueFromConfig2,
      method: valueFromConfig2,
      data: valueFromConfig2,
      baseURL: defaultToConfig2,
      transformRequest: defaultToConfig2,
      transformResponse: defaultToConfig2,
      paramsSerializer: defaultToConfig2,
      timeout: defaultToConfig2,
      timeoutMessage: defaultToConfig2,
      withCredentials: defaultToConfig2,
      withXSRFToken: defaultToConfig2,
      adapter: defaultToConfig2,
      responseType: defaultToConfig2,
      xsrfCookieName: defaultToConfig2,
      xsrfHeaderName: defaultToConfig2,
      onUploadProgress: defaultToConfig2,
      onDownloadProgress: defaultToConfig2,
      decompress: defaultToConfig2,
      maxContentLength: defaultToConfig2,
      maxBodyLength: defaultToConfig2,
      beforeRedirect: defaultToConfig2,
      transport: defaultToConfig2,
      httpAgent: defaultToConfig2,
      httpsAgent: defaultToConfig2,
      cancelToken: defaultToConfig2,
      socketPath: defaultToConfig2,
      responseEncoding: defaultToConfig2,
      validateStatus: mergeDirectKeys,
      headers: (a, b, prop) => mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true)
    };
    utils_default.forEach(Object.keys({ ...config1, ...config2 }), function computeConfigValue(prop) {
      const merge2 = mergeMap[prop] || mergeDeepProperties;
      const configValue = merge2(config1[prop], config2[prop], prop);
      utils_default.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
    });
    return config;
  }

  // node_modules/axios/lib/helpers/resolveConfig.js
  var resolveConfig_default = (config) => {
    const newConfig = mergeConfig({}, config);
    let { data, withXSRFToken, xsrfHeaderName, xsrfCookieName, headers, auth } = newConfig;
    newConfig.headers = headers = AxiosHeaders_default.from(headers);
    newConfig.url = buildURL(buildFullPath(newConfig.baseURL, newConfig.url, newConfig.allowAbsoluteUrls), config.params, config.paramsSerializer);
    if (auth) {
      headers.set(
        "Authorization",
        "Basic " + btoa((auth.username || "") + ":" + (auth.password ? unescape(encodeURIComponent(auth.password)) : ""))
      );
    }
    if (utils_default.isFormData(data)) {
      if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv) {
        headers.setContentType(void 0);
      } else if (utils_default.isFunction(data.getHeaders)) {
        const formHeaders = data.getHeaders();
        const allowedHeaders = ["content-type", "content-length"];
        Object.entries(formHeaders).forEach(([key, val]) => {
          if (allowedHeaders.includes(key.toLowerCase())) {
            headers.set(key, val);
          }
        });
      }
    }
    if (platform_default.hasStandardBrowserEnv) {
      withXSRFToken && utils_default.isFunction(withXSRFToken) && (withXSRFToken = withXSRFToken(newConfig));
      if (withXSRFToken || withXSRFToken !== false && isURLSameOrigin_default(newConfig.url)) {
        const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies_default.read(xsrfCookieName);
        if (xsrfValue) {
          headers.set(xsrfHeaderName, xsrfValue);
        }
      }
    }
    return newConfig;
  };

  // node_modules/axios/lib/adapters/xhr.js
  var isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
  var xhr_default = isXHRAdapterSupported && function(config) {
    return new Promise(function dispatchXhrRequest(resolve, reject) {
      const _config = resolveConfig_default(config);
      let requestData = _config.data;
      const requestHeaders = AxiosHeaders_default.from(_config.headers).normalize();
      let { responseType, onUploadProgress, onDownloadProgress } = _config;
      let onCanceled;
      let uploadThrottled, downloadThrottled;
      let flushUpload, flushDownload;
      function done() {
        flushUpload && flushUpload();
        flushDownload && flushDownload();
        _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
        _config.signal && _config.signal.removeEventListener("abort", onCanceled);
      }
      let request = new XMLHttpRequest();
      request.open(_config.method.toUpperCase(), _config.url, true);
      request.timeout = _config.timeout;
      function onloadend() {
        if (!request) {
          return;
        }
        const responseHeaders = AxiosHeaders_default.from(
          "getAllResponseHeaders" in request && request.getAllResponseHeaders()
        );
        const responseData = !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response;
        const response = {
          data: responseData,
          status: request.status,
          statusText: request.statusText,
          headers: responseHeaders,
          config,
          request
        };
        settle(function _resolve(value) {
          resolve(value);
          done();
        }, function _reject(err) {
          reject(err);
          done();
        }, response);
        request = null;
      }
      if ("onloadend" in request) {
        request.onloadend = onloadend;
      } else {
        request.onreadystatechange = function handleLoad() {
          if (!request || request.readyState !== 4) {
            return;
          }
          if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf("file:") === 0)) {
            return;
          }
          setTimeout(onloadend);
        };
      }
      request.onabort = function handleAbort() {
        if (!request) {
          return;
        }
        reject(new AxiosError_default("Request aborted", AxiosError_default.ECONNABORTED, config, request));
        request = null;
      };
      request.onerror = function handleError(event) {
        const msg = event && event.message ? event.message : "Network Error";
        const err = new AxiosError_default(msg, AxiosError_default.ERR_NETWORK, config, request);
        err.event = event || null;
        reject(err);
        request = null;
      };
      request.ontimeout = function handleTimeout() {
        let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
        const transitional2 = _config.transitional || transitional_default;
        if (_config.timeoutErrorMessage) {
          timeoutErrorMessage = _config.timeoutErrorMessage;
        }
        reject(new AxiosError_default(
          timeoutErrorMessage,
          transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
          config,
          request
        ));
        request = null;
      };
      requestData === void 0 && requestHeaders.setContentType(null);
      if ("setRequestHeader" in request) {
        utils_default.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
          request.setRequestHeader(key, val);
        });
      }
      if (!utils_default.isUndefined(_config.withCredentials)) {
        request.withCredentials = !!_config.withCredentials;
      }
      if (responseType && responseType !== "json") {
        request.responseType = _config.responseType;
      }
      if (onDownloadProgress) {
        [downloadThrottled, flushDownload] = progressEventReducer(onDownloadProgress, true);
        request.addEventListener("progress", downloadThrottled);
      }
      if (onUploadProgress && request.upload) {
        [uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
        request.upload.addEventListener("progress", uploadThrottled);
        request.upload.addEventListener("loadend", flushUpload);
      }
      if (_config.cancelToken || _config.signal) {
        onCanceled = (cancel) => {
          if (!request) {
            return;
          }
          reject(!cancel || cancel.type ? new CanceledError_default(null, config, request) : cancel);
          request.abort();
          request = null;
        };
        _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
        if (_config.signal) {
          _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
        }
      }
      const protocol = parseProtocol(_config.url);
      if (protocol && platform_default.protocols.indexOf(protocol) === -1) {
        reject(new AxiosError_default("Unsupported protocol " + protocol + ":", AxiosError_default.ERR_BAD_REQUEST, config));
        return;
      }
      request.send(requestData || null);
    });
  };

  // node_modules/axios/lib/helpers/composeSignals.js
  var composeSignals = (signals, timeout) => {
    const { length } = signals = signals ? signals.filter(Boolean) : [];
    if (timeout || length) {
      let controller = new AbortController();
      let aborted;
      const onabort = function(reason) {
        if (!aborted) {
          aborted = true;
          unsubscribe();
          const err = reason instanceof Error ? reason : this.reason;
          controller.abort(err instanceof AxiosError_default ? err : new CanceledError_default(err instanceof Error ? err.message : err));
        }
      };
      let timer = timeout && setTimeout(() => {
        timer = null;
        onabort(new AxiosError_default(`timeout ${timeout} of ms exceeded`, AxiosError_default.ETIMEDOUT));
      }, timeout);
      const unsubscribe = () => {
        if (signals) {
          timer && clearTimeout(timer);
          timer = null;
          signals.forEach((signal2) => {
            signal2.unsubscribe ? signal2.unsubscribe(onabort) : signal2.removeEventListener("abort", onabort);
          });
          signals = null;
        }
      };
      signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
      const { signal } = controller;
      signal.unsubscribe = () => utils_default.asap(unsubscribe);
      return signal;
    }
  };
  var composeSignals_default = composeSignals;

  // node_modules/axios/lib/helpers/trackStream.js
  var streamChunk = function* (chunk, chunkSize) {
    let len = chunk.byteLength;
    if (!chunkSize || len < chunkSize) {
      yield chunk;
      return;
    }
    let pos = 0;
    let end;
    while (pos < len) {
      end = pos + chunkSize;
      yield chunk.slice(pos, end);
      pos = end;
    }
  };
  var readBytes = async function* (iterable, chunkSize) {
    for await (const chunk of readStream(iterable)) {
      yield* streamChunk(chunk, chunkSize);
    }
  };
  var readStream = async function* (stream) {
    if (stream[Symbol.asyncIterator]) {
      yield* stream;
      return;
    }
    const reader = stream.getReader();
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield value;
      }
    } finally {
      await reader.cancel();
    }
  };
  var trackStream = (stream, chunkSize, onProgress, onFinish) => {
    const iterator2 = readBytes(stream, chunkSize);
    let bytes = 0;
    let done;
    let _onFinish = (e) => {
      if (!done) {
        done = true;
        onFinish && onFinish(e);
      }
    };
    return new ReadableStream({
      async pull(controller) {
        try {
          const { done: done2, value } = await iterator2.next();
          if (done2) {
            _onFinish();
            controller.close();
            return;
          }
          let len = value.byteLength;
          if (onProgress) {
            let loadedBytes = bytes += len;
            onProgress(loadedBytes);
          }
          controller.enqueue(new Uint8Array(value));
        } catch (err) {
          _onFinish(err);
          throw err;
        }
      },
      cancel(reason) {
        _onFinish(reason);
        return iterator2.return();
      }
    }, {
      highWaterMark: 2
    });
  };

  // node_modules/axios/lib/adapters/fetch.js
  var DEFAULT_CHUNK_SIZE = 64 * 1024;
  var { isFunction: isFunction2 } = utils_default;
  var globalFetchAPI = (({ Request, Response }) => ({
    Request,
    Response
  }))(utils_default.global);
  var {
    ReadableStream: ReadableStream2,
    TextEncoder: TextEncoder2
  } = utils_default.global;
  var test = (fn, ...args) => {
    try {
      return !!fn(...args);
    } catch (e) {
      return false;
    }
  };
  var factory = (env) => {
    env = utils_default.merge.call({
      skipUndefined: true
    }, globalFetchAPI, env);
    const { fetch: envFetch, Request, Response } = env;
    const isFetchSupported = envFetch ? isFunction2(envFetch) : typeof fetch === "function";
    const isRequestSupported = isFunction2(Request);
    const isResponseSupported = isFunction2(Response);
    if (!isFetchSupported) {
      return false;
    }
    const isReadableStreamSupported = isFetchSupported && isFunction2(ReadableStream2);
    const encodeText = isFetchSupported && (typeof TextEncoder2 === "function" ? /* @__PURE__ */ ((encoder) => (str) => encoder.encode(str))(new TextEncoder2()) : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
    const supportsRequestStream = isRequestSupported && isReadableStreamSupported && test(() => {
      let duplexAccessed = false;
      const hasContentType = new Request(platform_default.origin, {
        body: new ReadableStream2(),
        method: "POST",
        get duplex() {
          duplexAccessed = true;
          return "half";
        }
      }).headers.has("Content-Type");
      return duplexAccessed && !hasContentType;
    });
    const supportsResponseStream = isResponseSupported && isReadableStreamSupported && test(() => utils_default.isReadableStream(new Response("").body));
    const resolvers = {
      stream: supportsResponseStream && ((res) => res.body)
    };
    isFetchSupported && (() => {
      ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((type) => {
        !resolvers[type] && (resolvers[type] = (res, config) => {
          let method = res && res[type];
          if (method) {
            return method.call(res);
          }
          throw new AxiosError_default(`Response type '${type}' is not supported`, AxiosError_default.ERR_NOT_SUPPORT, config);
        });
      });
    })();
    const getBodyLength = async (body) => {
      if (body == null) {
        return 0;
      }
      if (utils_default.isBlob(body)) {
        return body.size;
      }
      if (utils_default.isSpecCompliantForm(body)) {
        const _request = new Request(platform_default.origin, {
          method: "POST",
          body
        });
        return (await _request.arrayBuffer()).byteLength;
      }
      if (utils_default.isArrayBufferView(body) || utils_default.isArrayBuffer(body)) {
        return body.byteLength;
      }
      if (utils_default.isURLSearchParams(body)) {
        body = body + "";
      }
      if (utils_default.isString(body)) {
        return (await encodeText(body)).byteLength;
      }
    };
    const resolveBodyLength = async (headers, body) => {
      const length = utils_default.toFiniteNumber(headers.getContentLength());
      return length == null ? getBodyLength(body) : length;
    };
    return async (config) => {
      let {
        url,
        method,
        data,
        signal,
        cancelToken,
        timeout,
        onDownloadProgress,
        onUploadProgress,
        responseType,
        headers,
        withCredentials = "same-origin",
        fetchOptions
      } = resolveConfig_default(config);
      let _fetch = envFetch || fetch;
      responseType = responseType ? (responseType + "").toLowerCase() : "text";
      let composedSignal = composeSignals_default([signal, cancelToken && cancelToken.toAbortSignal()], timeout);
      let request = null;
      const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
        composedSignal.unsubscribe();
      });
      let requestContentLength;
      try {
        if (onUploadProgress && supportsRequestStream && method !== "get" && method !== "head" && (requestContentLength = await resolveBodyLength(headers, data)) !== 0) {
          let _request = new Request(url, {
            method: "POST",
            body: data,
            duplex: "half"
          });
          let contentTypeHeader;
          if (utils_default.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
            headers.setContentType(contentTypeHeader);
          }
          if (_request.body) {
            const [onProgress, flush] = progressEventDecorator(
              requestContentLength,
              progressEventReducer(asyncDecorator(onUploadProgress))
            );
            data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
          }
        }
        if (!utils_default.isString(withCredentials)) {
          withCredentials = withCredentials ? "include" : "omit";
        }
        const isCredentialsSupported = isRequestSupported && "credentials" in Request.prototype;
        const resolvedOptions = {
          ...fetchOptions,
          signal: composedSignal,
          method: method.toUpperCase(),
          headers: headers.normalize().toJSON(),
          body: data,
          duplex: "half",
          credentials: isCredentialsSupported ? withCredentials : void 0
        };
        request = isRequestSupported && new Request(url, resolvedOptions);
        let response = await (isRequestSupported ? _fetch(request, fetchOptions) : _fetch(url, resolvedOptions));
        const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
        if (supportsResponseStream && (onDownloadProgress || isStreamResponse && unsubscribe)) {
          const options = {};
          ["status", "statusText", "headers"].forEach((prop) => {
            options[prop] = response[prop];
          });
          const responseContentLength = utils_default.toFiniteNumber(response.headers.get("content-length"));
          const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
            responseContentLength,
            progressEventReducer(asyncDecorator(onDownloadProgress), true)
          ) || [];
          response = new Response(
            trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
              flush && flush();
              unsubscribe && unsubscribe();
            }),
            options
          );
        }
        responseType = responseType || "text";
        let responseData = await resolvers[utils_default.findKey(resolvers, responseType) || "text"](response, config);
        !isStreamResponse && unsubscribe && unsubscribe();
        return await new Promise((resolve, reject) => {
          settle(resolve, reject, {
            data: responseData,
            headers: AxiosHeaders_default.from(response.headers),
            status: response.status,
            statusText: response.statusText,
            config,
            request
          });
        });
      } catch (err) {
        unsubscribe && unsubscribe();
        if (err && err.name === "TypeError" && /Load failed|fetch/i.test(err.message)) {
          throw Object.assign(
            new AxiosError_default("Network Error", AxiosError_default.ERR_NETWORK, config, request),
            {
              cause: err.cause || err
            }
          );
        }
        throw AxiosError_default.from(err, err && err.code, config, request);
      }
    };
  };
  var seedCache = /* @__PURE__ */ new Map();
  var getFetch = (config) => {
    let env = config && config.env || {};
    const { fetch: fetch2, Request, Response } = env;
    const seeds = [
      Request,
      Response,
      fetch2
    ];
    let len = seeds.length, i = len, seed, target, map = seedCache;
    while (i--) {
      seed = seeds[i];
      target = map.get(seed);
      target === void 0 && map.set(seed, target = i ? /* @__PURE__ */ new Map() : factory(env));
      map = target;
    }
    return target;
  };
  var adapter = getFetch();

  // node_modules/axios/lib/adapters/adapters.js
  var knownAdapters = {
    http: null_default,
    xhr: xhr_default,
    fetch: {
      get: getFetch
    }
  };
  utils_default.forEach(knownAdapters, (fn, value) => {
    if (fn) {
      try {
        Object.defineProperty(fn, "name", { value });
      } catch (e) {
      }
      Object.defineProperty(fn, "adapterName", { value });
    }
  });
  var renderReason = (reason) => `- ${reason}`;
  var isResolvedHandle = (adapter2) => utils_default.isFunction(adapter2) || adapter2 === null || adapter2 === false;
  function getAdapter(adapters, config) {
    adapters = utils_default.isArray(adapters) ? adapters : [adapters];
    const { length } = adapters;
    let nameOrAdapter;
    let adapter2;
    const rejectedReasons = {};
    for (let i = 0; i < length; i++) {
      nameOrAdapter = adapters[i];
      let id;
      adapter2 = nameOrAdapter;
      if (!isResolvedHandle(nameOrAdapter)) {
        adapter2 = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
        if (adapter2 === void 0) {
          throw new AxiosError_default(`Unknown adapter '${id}'`);
        }
      }
      if (adapter2 && (utils_default.isFunction(adapter2) || (adapter2 = adapter2.get(config)))) {
        break;
      }
      rejectedReasons[id || "#" + i] = adapter2;
    }
    if (!adapter2) {
      const reasons = Object.entries(rejectedReasons).map(
        ([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
      );
      let s = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
      throw new AxiosError_default(
        `There is no suitable adapter to dispatch the request ` + s,
        "ERR_NOT_SUPPORT"
      );
    }
    return adapter2;
  }
  var adapters_default = {
    /**
     * Resolve an adapter from a list of adapter names or functions.
     * @type {Function}
     */
    getAdapter,
    /**
     * Exposes all known adapters
     * @type {Object<string, Function|Object>}
     */
    adapters: knownAdapters
  };

  // node_modules/axios/lib/core/dispatchRequest.js
  function throwIfCancellationRequested(config) {
    if (config.cancelToken) {
      config.cancelToken.throwIfRequested();
    }
    if (config.signal && config.signal.aborted) {
      throw new CanceledError_default(null, config);
    }
  }
  function dispatchRequest(config) {
    throwIfCancellationRequested(config);
    config.headers = AxiosHeaders_default.from(config.headers);
    config.data = transformData.call(
      config,
      config.transformRequest
    );
    if (["post", "put", "patch"].indexOf(config.method) !== -1) {
      config.headers.setContentType("application/x-www-form-urlencoded", false);
    }
    const adapter2 = adapters_default.getAdapter(config.adapter || defaults_default.adapter, config);
    return adapter2(config).then(function onAdapterResolution(response) {
      throwIfCancellationRequested(config);
      response.data = transformData.call(
        config,
        config.transformResponse,
        response
      );
      response.headers = AxiosHeaders_default.from(response.headers);
      return response;
    }, function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            config.transformResponse,
            reason.response
          );
          reason.response.headers = AxiosHeaders_default.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    });
  }

  // node_modules/axios/lib/env/data.js
  var VERSION = "1.13.2";

  // node_modules/axios/lib/helpers/validator.js
  var validators = {};
  ["object", "boolean", "number", "function", "string", "symbol"].forEach((type, i) => {
    validators[type] = function validator(thing) {
      return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
    };
  });
  var deprecatedWarnings = {};
  validators.transitional = function transitional(validator, version, message) {
    function formatMessage(opt, desc) {
      return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
    }
    return (value, opt, opts) => {
      if (validator === false) {
        throw new AxiosError_default(
          formatMessage(opt, " has been removed" + (version ? " in " + version : "")),
          AxiosError_default.ERR_DEPRECATED
        );
      }
      if (version && !deprecatedWarnings[opt]) {
        deprecatedWarnings[opt] = true;
        console.warn(
          formatMessage(
            opt,
            " has been deprecated since v" + version + " and will be removed in the near future"
          )
        );
      }
      return validator ? validator(value, opt, opts) : true;
    };
  };
  validators.spelling = function spelling(correctSpelling) {
    return (value, opt) => {
      console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
      return true;
    };
  };
  function assertOptions(options, schema, allowUnknown) {
    if (typeof options !== "object") {
      throw new AxiosError_default("options must be an object", AxiosError_default.ERR_BAD_OPTION_VALUE);
    }
    const keys = Object.keys(options);
    let i = keys.length;
    while (i-- > 0) {
      const opt = keys[i];
      const validator = schema[opt];
      if (validator) {
        const value = options[opt];
        const result = value === void 0 || validator(value, opt, options);
        if (result !== true) {
          throw new AxiosError_default("option " + opt + " must be " + result, AxiosError_default.ERR_BAD_OPTION_VALUE);
        }
        continue;
      }
      if (allowUnknown !== true) {
        throw new AxiosError_default("Unknown option " + opt, AxiosError_default.ERR_BAD_OPTION);
      }
    }
  }
  var validator_default = {
    assertOptions,
    validators
  };

  // node_modules/axios/lib/core/Axios.js
  var validators2 = validator_default.validators;
  var Axios = class {
    constructor(instanceConfig) {
      this.defaults = instanceConfig || {};
      this.interceptors = {
        request: new InterceptorManager_default(),
        response: new InterceptorManager_default()
      };
    }
    /**
     * Dispatch a request
     *
     * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
     * @param {?Object} config
     *
     * @returns {Promise} The Promise to be fulfilled
     */
    async request(configOrUrl, config) {
      try {
        return await this._request(configOrUrl, config);
      } catch (err) {
        if (err instanceof Error) {
          let dummy = {};
          Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = new Error();
          const stack = dummy.stack ? dummy.stack.replace(/^.+\n/, "") : "";
          try {
            if (!err.stack) {
              err.stack = stack;
            } else if (stack && !String(err.stack).endsWith(stack.replace(/^.+\n.+\n/, ""))) {
              err.stack += "\n" + stack;
            }
          } catch (e) {
          }
        }
        throw err;
      }
    }
    _request(configOrUrl, config) {
      if (typeof configOrUrl === "string") {
        config = config || {};
        config.url = configOrUrl;
      } else {
        config = configOrUrl || {};
      }
      config = mergeConfig(this.defaults, config);
      const { transitional: transitional2, paramsSerializer, headers } = config;
      if (transitional2 !== void 0) {
        validator_default.assertOptions(transitional2, {
          silentJSONParsing: validators2.transitional(validators2.boolean),
          forcedJSONParsing: validators2.transitional(validators2.boolean),
          clarifyTimeoutError: validators2.transitional(validators2.boolean)
        }, false);
      }
      if (paramsSerializer != null) {
        if (utils_default.isFunction(paramsSerializer)) {
          config.paramsSerializer = {
            serialize: paramsSerializer
          };
        } else {
          validator_default.assertOptions(paramsSerializer, {
            encode: validators2.function,
            serialize: validators2.function
          }, true);
        }
      }
      if (config.allowAbsoluteUrls !== void 0) {
      } else if (this.defaults.allowAbsoluteUrls !== void 0) {
        config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
      } else {
        config.allowAbsoluteUrls = true;
      }
      validator_default.assertOptions(config, {
        baseUrl: validators2.spelling("baseURL"),
        withXsrfToken: validators2.spelling("withXSRFToken")
      }, true);
      config.method = (config.method || this.defaults.method || "get").toLowerCase();
      let contextHeaders = headers && utils_default.merge(
        headers.common,
        headers[config.method]
      );
      headers && utils_default.forEach(
        ["delete", "get", "head", "post", "put", "patch", "common"],
        (method) => {
          delete headers[method];
        }
      );
      config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
      const requestInterceptorChain = [];
      let synchronousRequestInterceptors = true;
      this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
        if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
          return;
        }
        synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      });
      const responseInterceptorChain = [];
      this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
        responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      });
      let promise;
      let i = 0;
      let len;
      if (!synchronousRequestInterceptors) {
        const chain = [dispatchRequest.bind(this), void 0];
        chain.unshift(...requestInterceptorChain);
        chain.push(...responseInterceptorChain);
        len = chain.length;
        promise = Promise.resolve(config);
        while (i < len) {
          promise = promise.then(chain[i++], chain[i++]);
        }
        return promise;
      }
      len = requestInterceptorChain.length;
      let newConfig = config;
      while (i < len) {
        const onFulfilled = requestInterceptorChain[i++];
        const onRejected = requestInterceptorChain[i++];
        try {
          newConfig = onFulfilled(newConfig);
        } catch (error) {
          onRejected.call(this, error);
          break;
        }
      }
      try {
        promise = dispatchRequest.call(this, newConfig);
      } catch (error) {
        return Promise.reject(error);
      }
      i = 0;
      len = responseInterceptorChain.length;
      while (i < len) {
        promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
      }
      return promise;
    }
    getUri(config) {
      config = mergeConfig(this.defaults, config);
      const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
      return buildURL(fullPath, config.params, config.paramsSerializer);
    }
  };
  utils_default.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method) {
    Axios.prototype[method] = function(url, config) {
      return this.request(mergeConfig(config || {}, {
        method,
        url,
        data: (config || {}).data
      }));
    };
  });
  utils_default.forEach(["post", "put", "patch"], function forEachMethodWithData(method) {
    function generateHTTPMethod(isForm) {
      return function httpMethod(url, data, config) {
        return this.request(mergeConfig(config || {}, {
          method,
          headers: isForm ? {
            "Content-Type": "multipart/form-data"
          } : {},
          url,
          data
        }));
      };
    }
    Axios.prototype[method] = generateHTTPMethod();
    Axios.prototype[method + "Form"] = generateHTTPMethod(true);
  });
  var Axios_default = Axios;

  // node_modules/axios/lib/cancel/CancelToken.js
  var CancelToken = class _CancelToken {
    constructor(executor) {
      if (typeof executor !== "function") {
        throw new TypeError("executor must be a function.");
      }
      let resolvePromise;
      this.promise = new Promise(function promiseExecutor(resolve) {
        resolvePromise = resolve;
      });
      const token = this;
      this.promise.then((cancel) => {
        if (!token._listeners) return;
        let i = token._listeners.length;
        while (i-- > 0) {
          token._listeners[i](cancel);
        }
        token._listeners = null;
      });
      this.promise.then = (onfulfilled) => {
        let _resolve;
        const promise = new Promise((resolve) => {
          token.subscribe(resolve);
          _resolve = resolve;
        }).then(onfulfilled);
        promise.cancel = function reject() {
          token.unsubscribe(_resolve);
        };
        return promise;
      };
      executor(function cancel(message, config, request) {
        if (token.reason) {
          return;
        }
        token.reason = new CanceledError_default(message, config, request);
        resolvePromise(token.reason);
      });
    }
    /**
     * Throws a `CanceledError` if cancellation has been requested.
     */
    throwIfRequested() {
      if (this.reason) {
        throw this.reason;
      }
    }
    /**
     * Subscribe to the cancel signal
     */
    subscribe(listener) {
      if (this.reason) {
        listener(this.reason);
        return;
      }
      if (this._listeners) {
        this._listeners.push(listener);
      } else {
        this._listeners = [listener];
      }
    }
    /**
     * Unsubscribe from the cancel signal
     */
    unsubscribe(listener) {
      if (!this._listeners) {
        return;
      }
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    }
    toAbortSignal() {
      const controller = new AbortController();
      const abort = (err) => {
        controller.abort(err);
      };
      this.subscribe(abort);
      controller.signal.unsubscribe = () => this.unsubscribe(abort);
      return controller.signal;
    }
    /**
     * Returns an object that contains a new `CancelToken` and a function that, when called,
     * cancels the `CancelToken`.
     */
    static source() {
      let cancel;
      const token = new _CancelToken(function executor(c) {
        cancel = c;
      });
      return {
        token,
        cancel
      };
    }
  };
  var CancelToken_default = CancelToken;

  // node_modules/axios/lib/helpers/spread.js
  function spread(callback) {
    return function wrap(arr) {
      return callback.apply(null, arr);
    };
  }

  // node_modules/axios/lib/helpers/isAxiosError.js
  function isAxiosError(payload) {
    return utils_default.isObject(payload) && payload.isAxiosError === true;
  }

  // node_modules/axios/lib/helpers/HttpStatusCode.js
  var HttpStatusCode = {
    Continue: 100,
    SwitchingProtocols: 101,
    Processing: 102,
    EarlyHints: 103,
    Ok: 200,
    Created: 201,
    Accepted: 202,
    NonAuthoritativeInformation: 203,
    NoContent: 204,
    ResetContent: 205,
    PartialContent: 206,
    MultiStatus: 207,
    AlreadyReported: 208,
    ImUsed: 226,
    MultipleChoices: 300,
    MovedPermanently: 301,
    Found: 302,
    SeeOther: 303,
    NotModified: 304,
    UseProxy: 305,
    Unused: 306,
    TemporaryRedirect: 307,
    PermanentRedirect: 308,
    BadRequest: 400,
    Unauthorized: 401,
    PaymentRequired: 402,
    Forbidden: 403,
    NotFound: 404,
    MethodNotAllowed: 405,
    NotAcceptable: 406,
    ProxyAuthenticationRequired: 407,
    RequestTimeout: 408,
    Conflict: 409,
    Gone: 410,
    LengthRequired: 411,
    PreconditionFailed: 412,
    PayloadTooLarge: 413,
    UriTooLong: 414,
    UnsupportedMediaType: 415,
    RangeNotSatisfiable: 416,
    ExpectationFailed: 417,
    ImATeapot: 418,
    MisdirectedRequest: 421,
    UnprocessableEntity: 422,
    Locked: 423,
    FailedDependency: 424,
    TooEarly: 425,
    UpgradeRequired: 426,
    PreconditionRequired: 428,
    TooManyRequests: 429,
    RequestHeaderFieldsTooLarge: 431,
    UnavailableForLegalReasons: 451,
    InternalServerError: 500,
    NotImplemented: 501,
    BadGateway: 502,
    ServiceUnavailable: 503,
    GatewayTimeout: 504,
    HttpVersionNotSupported: 505,
    VariantAlsoNegotiates: 506,
    InsufficientStorage: 507,
    LoopDetected: 508,
    NotExtended: 510,
    NetworkAuthenticationRequired: 511,
    WebServerIsDown: 521,
    ConnectionTimedOut: 522,
    OriginIsUnreachable: 523,
    TimeoutOccurred: 524,
    SslHandshakeFailed: 525,
    InvalidSslCertificate: 526
  };
  Object.entries(HttpStatusCode).forEach(([key, value]) => {
    HttpStatusCode[value] = key;
  });
  var HttpStatusCode_default = HttpStatusCode;

  // node_modules/axios/lib/axios.js
  function createInstance(defaultConfig) {
    const context = new Axios_default(defaultConfig);
    const instance = bind(Axios_default.prototype.request, context);
    utils_default.extend(instance, Axios_default.prototype, context, { allOwnKeys: true });
    utils_default.extend(instance, context, null, { allOwnKeys: true });
    instance.create = function create(instanceConfig) {
      return createInstance(mergeConfig(defaultConfig, instanceConfig));
    };
    return instance;
  }
  var axios = createInstance(defaults_default);
  axios.Axios = Axios_default;
  axios.CanceledError = CanceledError_default;
  axios.CancelToken = CancelToken_default;
  axios.isCancel = isCancel;
  axios.VERSION = VERSION;
  axios.toFormData = toFormData_default;
  axios.AxiosError = AxiosError_default;
  axios.Cancel = axios.CanceledError;
  axios.all = function all(promises) {
    return Promise.all(promises);
  };
  axios.spread = spread;
  axios.isAxiosError = isAxiosError;
  axios.mergeConfig = mergeConfig;
  axios.AxiosHeaders = AxiosHeaders_default;
  axios.formToJSON = (thing) => formDataToJSON_default(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
  axios.getAdapter = adapters_default.getAdapter;
  axios.HttpStatusCode = HttpStatusCode_default;
  axios.default = axios;
  var axios_default = axios;

  // node_modules/axios/index.js
  var {
    Axios: Axios2,
    AxiosError: AxiosError2,
    CanceledError: CanceledError2,
    isCancel: isCancel2,
    CancelToken: CancelToken2,
    VERSION: VERSION2,
    all: all2,
    Cancel,
    isAxiosError: isAxiosError2,
    spread: spread2,
    toFormData: toFormData2,
    AxiosHeaders: AxiosHeaders2,
    HttpStatusCode: HttpStatusCode2,
    formToJSON,
    getAdapter: getAdapter2,
    mergeConfig: mergeConfig2
  } = axios_default;

  // dist/esm/http/cache.js
  var TtlCache = class {
    constructor(maxSize = 500) {
      this.maxSize = maxSize;
      this.store = /* @__PURE__ */ new Map();
    }
    set(key, value, ttlMs) {
      if (this.store.has(key)) {
        this.store.delete(key);
      }
      if (this.store.size >= this.maxSize) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== void 0)
          this.store.delete(oldestKey);
      }
      this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    get(key) {
      const entry = this.store.get(key);
      if (!entry)
        return void 0;
      if (Date.now() > entry.expiresAt) {
        this.store.delete(key);
        return void 0;
      }
      return entry.value;
    }
    /**
     * Returns the value along with an isStale flag.
     * If the entry is fresh — isStale: false.
     * If the entry is stale (TTL expired) but still within staleMs — isStale: true.
     * If the entry is stale and beyond staleMs — deletes it and returns undefined.
     *
     * @param key Cache key
     * @param staleMs Additional time after ttlMs during which the entry is considered stale (0 = indefinitely)
     */
    getStale(key, staleMs) {
      const entry = this.store.get(key);
      if (!entry)
        return void 0;
      const now = Date.now();
      if (now <= entry.expiresAt) {
        return { value: entry.value, isStale: false };
      }
      if (staleMs === 0 || now <= entry.expiresAt + staleMs) {
        return { value: entry.value, isStale: true };
      }
      this.store.delete(key);
      return void 0;
    }
    has(key) {
      return this.get(key) !== void 0;
    }
    delete(key) {
      this.store.delete(key);
    }
    /** Iterator over all cache keys (including potentially stale ones — does not filter by TTL). */
    keys() {
      return this.store.keys();
    }
    /** Deletes all entries for which predicate(key) returned true. Returns the number of deleted entries. */
    deleteWhere(predicate) {
      let count = 0;
      for (const key of [...this.store.keys()]) {
        if (predicate(key)) {
          this.store.delete(key);
          count++;
        }
      }
      return count;
    }
    clear() {
      this.store.clear();
    }
    get size() {
      return this.store.size;
    }
  };

  // dist/esm/http/rate-limiter.js
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function generateKey() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
      return `rate-limiter-${g.crypto.randomUUID()}`;
    return `rate-limiter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  var RateLimiter = class {
    constructor(config) {
      var _a;
      this.config = config;
      this.activeCount = 0;
      this.waitQueue = [];
      this.windowTimestamps = [];
      this.throttledUntil = 0;
      this.key = (_a = config.key) !== null && _a !== void 0 ? _a : generateKey();
    }
    /**
     * Forces the next call(s) to acquire() to wait at least ms ms before
     * proceeding — proactive throttling based on the response's rate-limit
     * headers (see RateLimitConfig.onRateLimitHeaders), in addition to the
     * regular maxConcurrent/maxRequestsPerInterval. Works both in in-memory
     * mode and in store-based mode (waits before delegating to the store).
     * Takes the maximum with any already-set wait — a repeated (shorter) call
     * does not shrink an already-scheduled pause.
     */
    throttleFor(ms) {
      if (ms <= 0)
        return;
      const until = Date.now() + ms;
      if (until > this.throttledUntil)
        this.throttledUntil = until;
    }
    /** The control object passed to RateLimitConfig.onRateLimitHeaders. */
    asControl() {
      return { throttleFor: (ms) => this.throttleFor(ms) };
    }
    async waitForThrottle() {
      const remaining = this.throttledUntil - Date.now();
      if (remaining > 0)
        await sleep(remaining);
    }
    /**
     * Acquire a slot. Returns a release function — must be called after the request completes.
     */
    async acquire() {
      await this.waitForThrottle();
      if (this.config.store) {
        return this._acquireViaStore();
      }
      await this.waitForWindow();
      const max = this.config.maxConcurrent;
      if (max && this.activeCount >= max) {
        await new Promise((resolve) => {
          this.waitQueue.push(resolve);
        });
      } else {
        this.activeCount++;
      }
      return () => {
        this.activeCount--;
        this.drainQueue();
      };
    }
    async _acquireViaStore() {
      var _a, _b;
      const store = this.config.store;
      const intervalMs = (_a = this.config.intervalMs) !== null && _a !== void 0 ? _a : 1e3;
      const maxReqs = this.config.maxRequestsPerInterval;
      if (maxReqs) {
        const deadline = Date.now() + Math.max(intervalMs * 10, 3e4);
        while (true) {
          const count = await store.incrementWindow(this.key, intervalMs);
          if (count <= maxReqs)
            break;
          if (Date.now() >= deadline)
            break;
          await sleep(intervalMs);
        }
      }
      let releaseSlot;
      if (this.config.maxConcurrent) {
        const leaseMs = (_b = this.config.leaseMs) !== null && _b !== void 0 ? _b : 3e4;
        releaseSlot = await store.acquireConcurrencySlot(this.key, this.config.maxConcurrent, leaseMs);
      }
      return () => {
        void (releaseSlot === null || releaseSlot === void 0 ? void 0 : releaseSlot());
      };
    }
    /**
     * Waits until there's room in the sliding window, then reserves the slot
     * (records the timestamp) before returning — atomically with the capacity
     * check, so two overlapping acquire() calls can't both see "room" and
     * both proceed (a check-then-act race that a separate check + later
     * push(Date.now()) in the caller would otherwise allow).
     */
    async waitForWindow() {
      var _a;
      const maxReqs = this.config.maxRequestsPerInterval;
      const intervalMs = (_a = this.config.intervalMs) !== null && _a !== void 0 ? _a : 1e3;
      if (!maxReqs)
        return;
      while (true) {
        const now = Date.now();
        this.windowTimestamps = this.windowTimestamps.filter((ts) => now - ts < intervalMs);
        if (this.windowTimestamps.length < maxReqs) {
          this.windowTimestamps.push(now);
          return;
        }
        const oldest = this.windowTimestamps[0];
        const waitMs = intervalMs - (now - oldest) + 1;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    /**
     * Wakes queued waiters up to `maxConcurrent`, reserving (incrementing
     * activeCount for) each one synchronously before resolving it — resolving
     * a waiter's promise only schedules its continuation as a microtask, so
     * without reserving here first, a single freed slot could otherwise wake
     * more than one waiter in the same synchronous pass (activeCount wouldn't
     * reflect the first wakeup yet when the loop checks again).
     */
    drainQueue() {
      const max = this.config.maxConcurrent;
      if (!max)
        return;
      while (this.activeCount < max && this.waitQueue.length > 0) {
        this.activeCount++;
        const next = this.waitQueue.shift();
        next === null || next === void 0 ? void 0 : next();
      }
    }
  };

  // dist/esm/http/circuit-breaker.js
  var STORE_STATE_TTL_MS = 24 * 60 * 60 * 1e3;
  var CircuitOpenError = class extends Error {
    constructor() {
      super("Circuit breaker is open \u2014 request rejected without calling the network");
      this.code = "CIRCUIT_OPEN";
      this.name = "CircuitOpenError";
    }
  };
  function initialState() {
    return { state: "closed", failureCount: 0, successCount: 0, openedAt: 0 };
  }
  function generateKey2() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
      return `circuit-breaker-${g.crypto.randomUUID()}`;
    return `circuit-breaker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  var CircuitBreaker = class {
    constructor(config) {
      var _a;
      this.config = config;
      this.state = "closed";
      this.failureCount = 0;
      this.successCount = 0;
      this.openedAt = 0;
      this.key = (_a = config.key) !== null && _a !== void 0 ? _a : generateKey2();
    }
    /** The current state (accounts for the automatic open → half-open transition on timeout). */
    async getState() {
      if (this.config.store) {
        const shared = await this._readShared();
        return shared.state;
      }
      this._maybeTransitionToHalfOpen();
      return this.state;
    }
    /** Whether a request can be made right now (false if the circuit is open). */
    async canExecute() {
      const state = await this.getState();
      return state !== "open";
    }
    /** Record a successful request. */
    async onSuccess() {
      var _a, _b;
      if (this.config.store) {
        const shared = await this._readShared();
        if (shared.state === "half-open") {
          const needed = (_a = this.config.successThreshold) !== null && _a !== void 0 ? _a : 1;
          const successCount = await this._incrementShared(shared, "successCount");
          if (successCount >= needed) {
            await this._writeShared({ ...shared, state: "closed", failureCount: 0, successCount: 0 });
          }
        } else if (shared.failureCount !== 0) {
          await this._writeShared({ ...shared, failureCount: 0 });
        }
        return;
      }
      if (this.state === "half-open") {
        this.successCount++;
        const needed = (_b = this.config.successThreshold) !== null && _b !== void 0 ? _b : 1;
        if (this.successCount >= needed) {
          this._close();
        }
      } else {
        this.failureCount = 0;
      }
    }
    /** Record a failed request (error has already been normalized to ApiError). */
    async onFailure(error) {
      if (this.config.isFailure && !this.config.isFailure(error))
        return;
      if (this.config.store) {
        const shared = await this._readShared();
        if (shared.state === "half-open") {
          await this._writeShared({ ...shared, state: "open", openedAt: Date.now(), failureCount: 0, successCount: 0 });
          return;
        }
        const failureCount = await this._incrementShared(shared, "failureCount");
        if (failureCount >= this.config.failureThreshold) {
          await this._writeShared({ ...shared, state: "open", openedAt: Date.now(), failureCount: 0, successCount: 0 });
        }
        return;
      }
      if (this.state === "half-open") {
        this._open();
        return;
      }
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this._open();
      }
    }
    // ── Store-backed helpers ──────────────────────────────────────────────
    /** Reads shared state, applying the open→half-open timeout transition (and persisting it) if due. */
    async _readShared() {
      var _a;
      const store = this.config.store;
      const current = (_a = await store.get(this.key)) !== null && _a !== void 0 ? _a : initialState();
      if (current.state === "open" && Date.now() - current.openedAt >= this.config.openMs) {
        const transitioned = { ...current, state: "half-open", successCount: 0 };
        await store.set(this.key, transitioned, STORE_STATE_TTL_MS);
        return transitioned;
      }
      return current;
    }
    async _writeShared(state) {
      await this.config.store.set(this.key, state, STORE_STATE_TTL_MS);
    }
    /** Increments `field` either atomically (if the store supports it) or via read-modify-write. */
    async _incrementShared(current, field) {
      const store = this.config.store;
      if (store.incrementCounter) {
        return store.incrementCounter(this.key, field, STORE_STATE_TTL_MS);
      }
      const next = current[field] + 1;
      await this._writeShared({ ...current, [field]: next });
      return next;
    }
    // ── In-memory path ────────────────────────────────────────────────────
    _maybeTransitionToHalfOpen() {
      if (this.state === "open" && Date.now() - this.openedAt >= this.config.openMs) {
        this.state = "half-open";
        this.successCount = 0;
      }
    }
    _open() {
      this.state = "open";
      this.openedAt = Date.now();
      this.failureCount = 0;
      this.successCount = 0;
    }
    _close() {
      this.state = "closed";
      this.failureCount = 0;
      this.successCount = 0;
    }
  };

  // dist/esm/http/offline-queue.js
  var OfflineQueuedError = class extends Error {
    constructor(queueId, method, url) {
      super(`Request queued while offline, will be sent once back online: ${method} ${url}`);
      this.name = "OfflineQueuedError";
      this.queueId = queueId;
      this.method = method;
      this.url = url;
    }
  };
  var MUTATING_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
  function defaultShouldQueue(info) {
    return MUTATING_METHODS.has(info.method.toUpperCase());
  }
  function defaultIsOnline() {
    var _a;
    const nav = globalThis.navigator;
    return (_a = nav === null || nav === void 0 ? void 0 : nav.onLine) !== null && _a !== void 0 ? _a : true;
  }
  function defaultOnOnlineChange(callback) {
    const win = globalThis.window;
    if (!(win === null || win === void 0 ? void 0 : win.addEventListener))
      return void 0;
    win.addEventListener("online", callback);
    return () => {
      var _a;
      return (_a = win.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(win, "online", callback);
    };
  }
  function generateId() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
      return g.crypto.randomUUID();
    return `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  var OfflineQueue = class {
    constructor(config, sendReplay, toApiError2) {
      var _a, _b;
      this.config = config;
      this.sendReplay = sendReplay;
      this.toApiError = toApiError2;
      this.queue = [];
      this.flushing = false;
      this.hydrated = this.hydrate();
      this.unsubscribe = (_b = ((_a = this.config.onOnlineChange) !== null && _a !== void 0 ? _a : defaultOnOnlineChange)(() => {
        void this.flush();
      })) !== null && _b !== void 0 ? _b : void 0;
    }
    async hydrate() {
      try {
        const loaded = await this.config.persistAdapter.load();
        if (loaded)
          this.queue = loaded;
      } catch {
      }
    }
    async persist() {
      try {
        await this.config.persistAdapter.save(this.queue);
      } catch {
      }
    }
    isOnline() {
      var _a;
      return ((_a = this.config.isOnline) !== null && _a !== void 0 ? _a : defaultIsOnline)();
    }
    shouldQueue(info) {
      var _a;
      return ((_a = this.config.shouldQueue) !== null && _a !== void 0 ? _a : defaultShouldQueue)(info);
    }
    /** Queues one request, persists the updated queue, and returns the new entry. */
    async enqueue(info) {
      var _a;
      await this.hydrated;
      const entry = {
        id: generateId(),
        method: info.method.toUpperCase(),
        url: info.url,
        data: info.data,
        params: info.params,
        headers: info.headers,
        idempotencyKey: (_a = info.idempotencyKey) !== null && _a !== void 0 ? _a : generateId(),
        queuedAt: Date.now()
      };
      this.queue.push(entry);
      if (this.config.maxQueueSize && this.queue.length > this.config.maxQueueSize) {
        this.queue.splice(0, this.queue.length - this.config.maxQueueSize);
      }
      await this.persist();
      return entry;
    }
    /** Current queue contents, oldest first. */
    async getAll() {
      await this.hydrated;
      return [...this.queue];
    }
    /**
     * Attempts each queued request once, oldest first, stopping as soon as
     * `isOnline()` reports false again (leaving the rest queued for the next
     * flush). A request that fails with a genuine HTTP error (not "still
     * offline") is removed from the queue and reported via `onFlushError` —
     * it does not block the remaining entries. A request that fails with no
     * HTTP status at all (a network-level error, indistinguishable here from
     * "actually still offline") is left queued and retried on the next flush,
     * without retrying it again within this same call.
     *
     * This is deliberately a single pass per call, not a backoff loop —
     * `RequestExecutor`'s `retry`/`jitterStrategy` already own that job for an
     * individual attempt; a queue flush is a coarser retry cycle triggered by
     * reconnect events (or a manual call), not a tight retry loop against a
     * possibly still-recovering backend.
     */
    async flush() {
      var _a, _b, _c, _d;
      await this.hydrated;
      if (this.flushing)
        return;
      this.flushing = true;
      try {
        while (this.queue.length > 0) {
          if (!this.isOnline())
            return;
          const next = this.queue[0];
          try {
            const response = await this.sendReplay(next);
            this.removeById(next.id);
            await this.persist();
            (_b = (_a = this.config).onFlushSuccess) === null || _b === void 0 ? void 0 : _b.call(_a, next, response);
          } catch (err) {
            if (!this.isOnline())
              return;
            const apiError = this.toApiError(err);
            if (apiError.status !== void 0) {
              this.removeById(next.id);
              await this.persist();
              (_d = (_c = this.config).onFlushError) === null || _d === void 0 ? void 0 : _d.call(_c, next, apiError);
            } else {
              return;
            }
          }
        }
      } finally {
        this.flushing = false;
      }
    }
    /**
     * Removes a queue entry by id rather than shift()ing the front — `next`
     * may no longer be at index 0 by the time an await resolves (e.g. a
     * concurrent enqueue() trimmed the front via maxQueueSize while this entry
     * was in flight), so shift() could otherwise remove the wrong entry.
     */
    removeById(id) {
      const idx = this.queue.findIndex((r) => r.id === id);
      if (idx !== -1)
        this.queue.splice(idx, 1);
    }
    /** Unsubscribes from online/offline notifications. Call when the owning client is no longer needed. */
    destroy() {
      var _a;
      (_a = this.unsubscribe) === null || _a === void 0 ? void 0 : _a.call(this);
      this.unsubscribe = void 0;
    }
  };

  // dist/esm/types/http.js
  var DEFAULT_SENSITIVE_HEADERS = [
    "authorization",
    "x-api-key",
    "x-auth-token",
    "cookie",
    "set-cookie",
    "proxy-authorization"
  ];

  // dist/esm/types/pipeline.js
  function recoverStep(data) {
    return { recover: true, data };
  }
  function isStepRecovery(value) {
    return typeof value === "object" && value !== null && value.recover === true && "data" in value;
  }

  // dist/esm/http/rest-client.js
  function toApiError(error) {
    var _a, _b, _c;
    if (axios_default.isCancel(error)) {
      return {
        message: "Request was cancelled",
        code: "REQUEST_CANCELLED"
      };
    }
    if (error instanceof OfflineQueuedError) {
      return {
        message: error.message,
        code: "OFFLINE_QUEUED",
        timestamp: /* @__PURE__ */ new Date()
      };
    }
    if (axios_default.isAxiosError(error)) {
      return {
        message: error.message,
        code: error.code,
        status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
        timestamp: /* @__PURE__ */ new Date()
      };
    }
    if (error instanceof Error) {
      const duckTyped = error;
      return {
        message: error.message,
        code: duckTyped.code,
        status: (_b = duckTyped.status) !== null && _b !== void 0 ? _b : (_c = duckTyped.response) === null || _c === void 0 ? void 0 : _c.status,
        timestamp: /* @__PURE__ */ new Date()
      };
    }
    return {
      message: "An unknown error occurred",
      timestamp: /* @__PURE__ */ new Date()
    };
  }
  function sanitizeHeadersMap(headers, extraSensitive = []) {
    if (!headers)
      return headers;
    const blocked = /* @__PURE__ */ new Set([
      ...DEFAULT_SENSITIVE_HEADERS.map((h) => h.toLowerCase()),
      ...extraSensitive.map((h) => h.toLowerCase())
    ]);
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => blocked.has(k.toLowerCase()) ? [k, "REDACTED"] : [k, v]));
  }
  var HEX_TRACE_ID_RE = /^[0-9a-f]{32}$/i;
  function randomHex(length) {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.getRandomValues) {
      const bytes = new Uint8Array(Math.ceil(length / 2));
      g.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
    }
    let out = "";
    while (out.length < length)
      out += Math.random().toString(16).slice(2);
    return out.slice(0, length);
  }
  function generateTraceparent(traceId) {
    const tid = traceId && HEX_TRACE_ID_RE.test(traceId) ? traceId.toLowerCase() : randomHex(32);
    const spanId = randomHex(16);
    return `00-${tid}-${spanId}-01`;
  }
  function toArray2(value) {
    if (!value)
      return [];
    return Array.isArray(value) ? value : [value];
  }
  async function applyInterceptors(interceptors, value) {
    let result = value;
    for (const interceptor of interceptors) {
      result = await interceptor(result);
    }
    return result;
  }
  var MAX_CLIENT_CACHE_SIZE = 100;
  var restClientCache = /* @__PURE__ */ new Map();
  function clearRestClientCache() {
    restClientCache.clear();
  }
  function createRestClient(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const httpClient = config.adapter ? void 0 : axios_default.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: config.headers,
      withCredentials: config.withCredentials
    });
    const responseCache = (_b = (_a = config.cache) === null || _a === void 0 ? void 0 : _a.store) !== null && _b !== void 0 ? _b : new TtlCache(1e3);
    const rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null;
    const circuitBreaker = config.circuitBreaker ? new CircuitBreaker(config.circuitBreaker) : null;
    const offlineQueue = ((_c = config.offlineQueue) === null || _c === void 0 ? void 0 : _c.enabled) ? new OfflineQueue(config.offlineQueue, (queued) => _executeRequest(queued.url, {
      method: queued.method,
      data: queued.data,
      params: queued.params,
      headers: queued.headers,
      idempotencyKey: queued.idempotencyKey
    }), toApiError) : null;
    const shouldSanitize = (_d = config.sanitizeHeaders) !== null && _d !== void 0 ? _d : true;
    const extraSensitive = (_e = config.sensitiveHeaders) !== null && _e !== void 0 ? _e : [];
    const reqInterceptors = toArray2((_f = config.interceptors) === null || _f === void 0 ? void 0 : _f.request);
    const resInterceptors = toArray2((_g = config.interceptors) === null || _g === void 0 ? void 0 : _g.response);
    const errInterceptors = toArray2((_h = config.interceptors) === null || _h === void 0 ? void 0 : _h.error);
    const inFlightRequests = /* @__PURE__ */ new Map();
    let cachedToken = null;
    function invalidateTokenCache() {
      cachedToken = null;
    }
    async function getAuthToken() {
      const auth = config.auth;
      if (auth.tokenTtlMs && cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.value;
      }
      const token = await auth.getToken();
      if (auth.tokenTtlMs) {
        cachedToken = { value: token, expiresAt: Date.now() + auth.tokenTtlMs };
      }
      return token;
    }
    function maybeSanitize(headers) {
      return shouldSanitize ? sanitizeHeadersMap(headers, extraSensitive) : headers;
    }
    function buildCacheKey(method, url, req) {
      return JSON.stringify({
        method: method.toUpperCase(),
        url,
        params: req === null || req === void 0 ? void 0 : req.params,
        cacheKey: req === null || req === void 0 ? void 0 : req.cacheKey
      });
    }
    async function invalidateCache(matcher) {
      if (!responseCache.deleteWhere)
        return 0;
      return responseCache.deleteWhere((key) => {
        let parsed;
        try {
          parsed = JSON.parse(key);
        } catch {
          return false;
        }
        if (typeof matcher === "function")
          return matcher(parsed);
        if (matcher instanceof RegExp)
          return matcher.test(parsed.url);
        return parsed.url.includes(matcher);
      });
    }
    async function _executeRequest(command, req, _retried = false) {
      var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
      const reqId = (_a2 = req === null || req === void 0 ? void 0 : req.requestId) !== null && _a2 !== void 0 ? _a2 : Math.random().toString(36).slice(2);
      const methodUpper = ((_b2 = req === null || req === void 0 ? void 0 : req.method) !== null && _b2 !== void 0 ? _b2 : "GET").toUpperCase();
      const fullUrl = `${(_c2 = config.baseURL) !== null && _c2 !== void 0 ? _c2 : ""}${command}`;
      if (circuitBreaker && !await circuitBreaker.canExecute()) {
        const apiError = toApiError(new CircuitOpenError());
        (_e2 = (_d2 = config.metrics) === null || _d2 === void 0 ? void 0 : _d2.onRequestStart) === null || _e2 === void 0 ? void 0 : _e2.call(_d2, {
          id: reqId,
          method: methodUpper,
          url: fullUrl,
          timestamp: Date.now(),
          requestBody: req === null || req === void 0 ? void 0 : req.data,
          requestParams: req === null || req === void 0 ? void 0 : req.params
        });
        (_g2 = (_f2 = config.metrics) === null || _f2 === void 0 ? void 0 : _f2.onRequestEnd) === null || _g2 === void 0 ? void 0 : _g2.call(_f2, { id: reqId, durationMs: 0, error: apiError });
        if (config.onError)
          await config.onError(apiError, req !== null && req !== void 0 ? req : {});
        throw new CircuitOpenError();
      }
      let authHeaders = {};
      if (config.auth) {
        const token = await getAuthToken();
        authHeaders = { Authorization: `Bearer ${token}` };
      }
      let tracingHeaders = {};
      const existingHeaders = req === null || req === void 0 ? void 0 : req.headers;
      const hasExplicitTraceparent = existingHeaders && Object.keys(existingHeaders).some((h) => h.toLowerCase() === "traceparent");
      if (((_h2 = config.tracing) === null || _h2 === void 0 ? void 0 : _h2.generateTraceparent) && !hasExplicitTraceparent) {
        tracingHeaders = { traceparent: generateTraceparent(req === null || req === void 0 ? void 0 : req.traceId) };
      }
      let idempotencyHeaders = {};
      if (req === null || req === void 0 ? void 0 : req.idempotencyKey) {
        const headerName = (_j = config.idempotencyHeaderName) !== null && _j !== void 0 ? _j : "Idempotency-Key";
        idempotencyHeaders = { [headerName]: req.idempotencyKey };
      }
      const mergedHeaders = {
        ...tracingHeaders,
        ...idempotencyHeaders,
        ...req === null || req === void 0 ? void 0 : req.headers,
        ...authHeaders
      };
      let processedReq = { ...req, headers: mergedHeaders };
      if (reqInterceptors.length > 0) {
        processedReq = await applyInterceptors(reqInterceptors, processedReq);
      }
      const span = (_l = (_k = config.tracing) === null || _k === void 0 ? void 0 : _k.provider) === null || _l === void 0 ? void 0 : _l.startSpan(`HTTP ${methodUpper} ${command}`, { "http.method": methodUpper, "http.url": fullUrl });
      (_o = (_m = config.metrics) === null || _m === void 0 ? void 0 : _m.onRequestStart) === null || _o === void 0 ? void 0 : _o.call(_m, {
        id: reqId,
        method: methodUpper,
        url: fullUrl,
        timestamp: Date.now(),
        requestBody: processedReq === null || processedReq === void 0 ? void 0 : processedReq.data,
        requestParams: processedReq === null || processedReq === void 0 ? void 0 : processedReq.params,
        requestHeaders: maybeSanitize(processedReq === null || processedReq === void 0 ? void 0 : processedReq.headers)
      });
      const startTs = Date.now();
      let release;
      if (rateLimiter && !(processedReq === null || processedReq === void 0 ? void 0 : processedReq.skipRateLimit)) {
        release = await rateLimiter.acquire();
      }
      try {
        let payload;
        if (config.adapter) {
          payload = await config.adapter.request({
            ...processedReq,
            baseURL: config.baseURL,
            url: command
          });
        } else {
          const response = await httpClient.request({
            url: command,
            ...processedReq,
            headers: processedReq === null || processedReq === void 0 ? void 0 : processedReq.headers
          });
          payload = {
            data: response.data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          };
        }
        const duration = Date.now() - startTs;
        let responseBytes;
        const respHeaders = payload.headers;
        const contentLengthHeader = respHeaders["content-length"] || respHeaders["Content-Length"];
        const parsedLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
        if (Number.isFinite(parsedLength) && parsedLength !== 0) {
          responseBytes = parsedLength;
        } else {
          try {
            const raw = payload.data;
            if (typeof raw === "string") {
              responseBytes = new TextEncoder().encode(raw).length;
            } else if (raw !== void 0) {
              responseBytes = new TextEncoder().encode(JSON.stringify(raw)).length;
            }
          } catch {
          }
        }
        if (((_p = config.rateLimit) === null || _p === void 0 ? void 0 : _p.onRateLimitHeaders) && rateLimiter) {
          config.rateLimit.onRateLimitHeaders(payload.headers, rateLimiter.asControl());
        }
        (_r = (_q = config.metrics) === null || _q === void 0 ? void 0 : _q.onRequestEnd) === null || _r === void 0 ? void 0 : _r.call(_q, {
          id: reqId,
          durationMs: duration,
          status: payload.status,
          bytes: responseBytes,
          responseBody: payload.data,
          responseHeaders: maybeSanitize(payload.headers)
        });
        if (resInterceptors.length > 0) {
          payload = await applyInterceptors(resInterceptors, payload);
        }
        const cacheEnabled = (_s = processedReq === null || processedReq === void 0 ? void 0 : processedReq.useCache) !== null && _s !== void 0 ? _s : ((_t = config.cache) === null || _t === void 0 ? void 0 : _t.enabled) && methodUpper === "GET";
        if (cacheEnabled) {
          const cacheTtl = (_w = (_u = processedReq === null || processedReq === void 0 ? void 0 : processedReq.cacheTtlMs) !== null && _u !== void 0 ? _u : (_v = config.cache) === null || _v === void 0 ? void 0 : _v.ttlMs) !== null && _w !== void 0 ? _w : 6e4;
          const cacheKey = buildCacheKey(methodUpper, fullUrl, processedReq);
          await responseCache.set(cacheKey, payload, cacheTtl);
        }
        await (circuitBreaker === null || circuitBreaker === void 0 ? void 0 : circuitBreaker.onSuccess());
        (_x = span === null || span === void 0 ? void 0 : span.setStatus) === null || _x === void 0 ? void 0 : _x.call(span, { code: "ok" });
        span === null || span === void 0 ? void 0 : span.end();
        return payload;
      } catch (error) {
        const duration = Date.now() - startTs;
        const errorStatus = axios_default.isAxiosError(error) ? (_y = error.response) === null || _y === void 0 ? void 0 : _y.status : error === null || error === void 0 ? void 0 : error.status;
        const errorHeaders = axios_default.isAxiosError(error) ? (_z = error.response) === null || _z === void 0 ? void 0 : _z.headers : void 0;
        if (((_0 = config.rateLimit) === null || _0 === void 0 ? void 0 : _0.onRateLimitHeaders) && rateLimiter && errorHeaders) {
          config.rateLimit.onRateLimitHeaders(errorHeaders, rateLimiter.asControl());
        }
        if (config.auth && !_retried && errorStatus === 401) {
          invalidateTokenCache();
          await ((_2 = (_1 = config.auth).onUnauthorized) === null || _2 === void 0 ? void 0 : _2.call(_1));
          (_3 = span === null || span === void 0 ? void 0 : span.setStatus) === null || _3 === void 0 ? void 0 : _3.call(span, { code: "error", message: "401 \u2014 retrying with refreshed token" });
          span === null || span === void 0 ? void 0 : span.end();
          return _executeRequest(command, req, true);
        }
        let apiError = toApiError(error);
        if (errInterceptors.length > 0) {
          apiError = await applyInterceptors(errInterceptors, apiError);
        }
        const isCancellation = apiError.code === "REQUEST_CANCELLED" || (error === null || error === void 0 ? void 0 : error.name) === "AbortError";
        if (circuitBreaker && !isCancellation) {
          await circuitBreaker.onFailure(apiError);
        }
        (_5 = (_4 = config.metrics) === null || _4 === void 0 ? void 0 : _4.onRequestEnd) === null || _5 === void 0 ? void 0 : _5.call(_4, {
          id: reqId,
          durationMs: duration,
          error: apiError
        });
        (_6 = span === null || span === void 0 ? void 0 : span.setStatus) === null || _6 === void 0 ? void 0 : _6.call(span, { code: "error", message: apiError.message });
        (_7 = span === null || span === void 0 ? void 0 : span.recordException) === null || _7 === void 0 ? void 0 : _7.call(span, error);
        span === null || span === void 0 ? void 0 : span.end();
        if (config.onError) {
          await config.onError(apiError, processedReq !== null && processedReq !== void 0 ? processedReq : {});
        }
        throw error;
      } finally {
        release === null || release === void 0 ? void 0 : release();
      }
    }
    async function request(command, req, _retried = false) {
      var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _j, _k, _l, _m, _o, _p, _q, _r;
      const methodUpper = ((_a2 = req === null || req === void 0 ? void 0 : req.method) !== null && _a2 !== void 0 ? _a2 : "GET").toUpperCase();
      const fullUrl = `${(_b2 = config.baseURL) !== null && _b2 !== void 0 ? _b2 : ""}${command}`;
      if (offlineQueue && !offlineQueue.isOnline() && offlineQueue.shouldQueue({ method: methodUpper, url: command, data: req === null || req === void 0 ? void 0 : req.data })) {
        const queued = await offlineQueue.enqueue({
          method: methodUpper,
          url: command,
          data: req === null || req === void 0 ? void 0 : req.data,
          params: req === null || req === void 0 ? void 0 : req.params,
          headers: req === null || req === void 0 ? void 0 : req.headers,
          idempotencyKey: req === null || req === void 0 ? void 0 : req.idempotencyKey
        });
        const queuedError = new OfflineQueuedError(queued.id, methodUpper, command);
        const apiError = toApiError(queuedError);
        (_d2 = (_c2 = config.metrics) === null || _c2 === void 0 ? void 0 : _c2.onRequestStart) === null || _d2 === void 0 ? void 0 : _d2.call(_c2, {
          id: queued.id,
          method: methodUpper,
          url: fullUrl,
          timestamp: queued.queuedAt,
          requestBody: req === null || req === void 0 ? void 0 : req.data,
          requestParams: req === null || req === void 0 ? void 0 : req.params
        });
        (_f2 = (_e2 = config.metrics) === null || _e2 === void 0 ? void 0 : _e2.onRequestEnd) === null || _f2 === void 0 ? void 0 : _f2.call(_e2, { id: queued.id, durationMs: 0, error: apiError });
        if (config.onError)
          await config.onError(apiError, req !== null && req !== void 0 ? req : {});
        throw queuedError;
      }
      const cacheEnabled = (_g2 = req === null || req === void 0 ? void 0 : req.useCache) !== null && _g2 !== void 0 ? _g2 : ((_h2 = config.cache) === null || _h2 === void 0 ? void 0 : _h2.enabled) && methodUpper === "GET";
      const cacheTtl = (_l = (_j = req === null || req === void 0 ? void 0 : req.cacheTtlMs) !== null && _j !== void 0 ? _j : (_k = config.cache) === null || _k === void 0 ? void 0 : _k.ttlMs) !== null && _l !== void 0 ? _l : 6e4;
      const cacheStrategy = (_o = (_m = config.cache) === null || _m === void 0 ? void 0 : _m.strategy) !== null && _o !== void 0 ? _o : "strict";
      const staleMs = (_q = (_p = config.cache) === null || _p === void 0 ? void 0 : _p.staleMs) !== null && _q !== void 0 ? _q : 0;
      if (cacheEnabled) {
        const cacheKey = buildCacheKey(methodUpper, fullUrl, req);
        if (cacheStrategy === "stale-while-revalidate" && responseCache.getStale) {
          const staleResult = await responseCache.getStale(cacheKey, staleMs);
          if (staleResult) {
            if (staleResult.isStale) {
              _executeRequest(command, req, _retried).then((fresh) => responseCache.set(cacheKey, fresh, cacheTtl)).catch(() => {
              });
            }
            return staleResult.value;
          }
        } else {
          const cached = await responseCache.get(cacheKey);
          if (cached)
            return cached;
        }
      }
      const shouldDedup = ((_r = config.deduplicateRequests) !== null && _r !== void 0 ? _r : false) && methodUpper === "GET" && !(req === null || req === void 0 ? void 0 : req.skipRateLimit);
      if (shouldDedup) {
        const dedupKey = buildCacheKey(methodUpper, fullUrl, req);
        const existing = inFlightRequests.get(dedupKey);
        if (existing)
          return existing;
        const promise = _executeRequest(command, req, _retried).finally(() => {
          inFlightRequests.delete(dedupKey);
        });
        inFlightRequests.set(dedupKey, promise);
        return promise;
      }
      return _executeRequest(command, req, _retried);
    }
    const abortControllers = /* @__PURE__ */ new Map();
    function cancelRequest(key) {
      var _a2;
      (_a2 = abortControllers.get(key)) === null || _a2 === void 0 ? void 0 : _a2.abort();
      abortControllers.delete(key);
    }
    async function cancellableRequest(key, command, reqConfig) {
      cancelRequest(key);
      const controller = new AbortController();
      abortControllers.set(key, controller);
      try {
        return await request(command, {
          ...reqConfig,
          signal: controller.signal
        });
      } finally {
        abortControllers.delete(key);
      }
    }
    return {
      request,
      get: (command, reqConfig) => request(command, { ...reqConfig, method: "GET" }),
      post: (command, data, reqConfig) => request(command, { ...reqConfig, method: "POST", data }),
      put: (command, data, reqConfig) => request(command, { ...reqConfig, method: "PUT", data }),
      patch: (command, data, reqConfig) => request(command, { ...reqConfig, method: "PATCH", data }),
      delete: (command, reqConfig) => request(command, { ...reqConfig, method: "DELETE" }),
      head: (command, reqConfig) => request(command, { ...reqConfig, method: "HEAD" }),
      options: (command, reqConfig) => request(command, { ...reqConfig, method: "OPTIONS" }),
      cancellableRequest,
      cancelRequest,
      /** Clear this client's response cache */
      clearCache: async () => {
        await responseCache.clear();
      },
      /**
       * Selectively invalidate the response cache by URL (substring, RegExp, or predicate),
       * without affecting entries for other endpoints. Returns the number of deleted entries.
       */
      invalidateCache,
      /** Current circuit breaker state ("closed" | "open" | "half-open"), or null if it is not configured. `async` when circuitBreaker.store is set (otherwise resolves instantly). */
      getCircuitBreakerState: async () => circuitBreaker ? await circuitBreaker.getState() : null,
      /** Requests currently queued awaiting the next flush (empty array if `offlineQueue` isn't configured). */
      getQueuedRequests: async () => offlineQueue ? offlineQueue.getAll() : [],
      /**
       * Manually attempts to send everything currently queued — also happens
       * automatically on reconnect (see `offlineQueue.onOnlineChange`). No-op
       * if `offlineQueue` isn't configured.
       */
      flushQueue: async () => {
        await (offlineQueue === null || offlineQueue === void 0 ? void 0 : offlineQueue.flush());
      }
    };
  }
  var authProviderIds = /* @__PURE__ */ new WeakMap();
  var nextAuthProviderId = 0;
  function getAuthProviderKey(auth) {
    if (!auth)
      return null;
    let id = authProviderIds.get(auth);
    if (id === void 0) {
      id = `auth-${nextAuthProviderId++}`;
      authProviderIds.set(auth, id);
    }
    return id;
  }
  function getRestClient(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const key = JSON.stringify({
      baseURL: config.baseURL,
      timeout: config.timeout,
      withCredentials: config.withCredentials,
      headers: (_a = config.headers) !== null && _a !== void 0 ? _a : {},
      retry: (_b = config.retry) !== null && _b !== void 0 ? _b : {},
      // Function-valued fields (store/isFailure/provider) are dropped by
      // JSON.stringify — tracked as booleans instead so two configs that only
      // differ in *which* store/predicate/provider they pass don't collide on
      // the same cached client.
      cache: { ...(_c = config.cache) !== null && _c !== void 0 ? _c : {}, store: !!((_d = config.cache) === null || _d === void 0 ? void 0 : _d.store) },
      rateLimit: { ...(_e = config.rateLimit) !== null && _e !== void 0 ? _e : {}, store: !!((_f = config.rateLimit) === null || _f === void 0 ? void 0 : _f.store) },
      circuitBreaker: {
        ...(_g = config.circuitBreaker) !== null && _g !== void 0 ? _g : {},
        store: !!((_h = config.circuitBreaker) === null || _h === void 0 ? void 0 : _h.store),
        isFailure: !!((_j = config.circuitBreaker) === null || _j === void 0 ? void 0 : _j.isFailure)
      },
      sanitizeHeaders: (_k = config.sanitizeHeaders) !== null && _k !== void 0 ? _k : true,
      sensitiveHeaders: (_l = config.sensitiveHeaders) !== null && _l !== void 0 ? _l : [],
      metrics: !!config.metrics,
      auth: getAuthProviderKey(config.auth),
      deduplicateRequests: (_m = config.deduplicateRequests) !== null && _m !== void 0 ? _m : false,
      interceptors: !!config.interceptors,
      onError: !!config.onError,
      adapter: !!config.adapter,
      tracing: {
        generateTraceparent: !!((_o = config.tracing) === null || _o === void 0 ? void 0 : _o.generateTraceparent),
        provider: !!((_p = config.tracing) === null || _p === void 0 ? void 0 : _p.provider)
      },
      idempotencyHeaderName: config.idempotencyHeaderName,
      autoIdempotencyKey: !!config.autoIdempotencyKey,
      offlineQueue: {
        enabled: !!((_q = config.offlineQueue) === null || _q === void 0 ? void 0 : _q.enabled),
        persistAdapter: !!((_r = config.offlineQueue) === null || _r === void 0 ? void 0 : _r.persistAdapter),
        isOnline: !!((_s = config.offlineQueue) === null || _s === void 0 ? void 0 : _s.isOnline),
        onOnlineChange: !!((_t = config.offlineQueue) === null || _t === void 0 ? void 0 : _t.onOnlineChange),
        shouldQueue: !!((_u = config.offlineQueue) === null || _u === void 0 ? void 0 : _u.shouldQueue),
        maxQueueSize: (_v = config.offlineQueue) === null || _v === void 0 ? void 0 : _v.maxQueueSize
      }
    });
    const cachedClient = restClientCache.get(key);
    if (cachedClient)
      return cachedClient;
    if (restClientCache.size >= MAX_CLIENT_CACHE_SIZE) {
      const oldestKey = restClientCache.keys().next().value;
      if (oldestKey !== void 0)
        restClientCache.delete(oldestKey);
    }
    const client = createRestClient(config);
    restClientCache.set(key, client);
    return client;
  }

  // dist/esm/http/request-executor.js
  function sleep2(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal === null || signal === void 0 ? void 0 : signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  function mergeSignals(a, b) {
    if (!a && !b)
      return void 0;
    if (!a)
      return b;
    if (!b)
      return a;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (a.aborted || b.aborted) {
      controller.abort();
    } else {
      a.addEventListener("abort", abort, { once: true });
      b.addEventListener("abort", abort, { once: true });
    }
    return controller.signal;
  }
  var MUTATING_METHODS2 = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
  function generateIdempotencyKey() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
      return g.crypto.randomUUID();
    return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function parseRetryAfter(value, maxMs) {
    const asNumber = Number(value);
    if (!isNaN(asNumber) && value.trim() !== "") {
      return Math.min(Math.max(asNumber * 1e3, 0), maxMs);
    }
    const asDate = new Date(value);
    if (!isNaN(asDate.getTime())) {
      const waitMs = asDate.getTime() - Date.now();
      return Math.min(Math.max(waitMs, 0), maxMs);
    }
    return null;
  }
  var RequestExecutor = class {
    constructor(httpConfig) {
      var _a;
      this.httpConfig = httpConfig;
      this.client = getRestClient(httpConfig);
      this.retryCfg = (_a = httpConfig.retry) !== null && _a !== void 0 ? _a : {};
    }
    /**
     * Executes a single request with support for:
     * - retry with delay, exponential backoff, and jitter
     * - filtering retries by HTTP status (retriableStatus)
     * - parsing the Retry-After header (takes priority over the backoff delay)
     * - a maxRetryAfterMs ceiling for Retry-After
     * - a timeout via AbortController (actually cancels the HTTP request)
     * - an external AbortSignal (from orchestrator.abort())
     */
    async execute(command, reqConfig, retryCount, timeoutMs = 1e4, externalSignal) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
      const maxAttempts = (_a = retryCount !== null && retryCount !== void 0 ? retryCount : this.retryCfg.attempts) !== null && _a !== void 0 ? _a : 0;
      const baseDelay = (_b = this.retryCfg.delayMs) !== null && _b !== void 0 ? _b : 0;
      const backoffMult = (_c = this.retryCfg.backoffMultiplier) !== null && _c !== void 0 ? _c : 1;
      const retriableStatus = this.retryCfg.retriableStatus;
      const maxRetryAfterMs = (_d = this.retryCfg.maxRetryAfterMs) !== null && _d !== void 0 ? _d : 6e4;
      const jitterStrategy = (_e = this.retryCfg.jitterStrategy) !== null && _e !== void 0 ? _e : "fixed";
      const decorrelatedCap = baseDelay * Math.pow(backoffMult, maxAttempts);
      let prevDelay = baseDelay;
      function computeBackoffDelay(n) {
        if (baseDelay <= 0)
          return 0;
        const nominal = baseDelay * Math.pow(backoffMult, n - 1);
        switch (jitterStrategy) {
          case "full":
            return Math.random() * nominal;
          case "decorrelated": {
            const next = Math.min(decorrelatedCap, baseDelay + Math.random() * (prevDelay * 3 - baseDelay));
            prevDelay = next;
            return next;
          }
          case "fixed":
          default:
            return nominal + Math.random() * baseDelay * 0.1;
        }
      }
      let effectiveReqConfig = reqConfig;
      if (this.httpConfig.autoIdempotencyKey && !(reqConfig === null || reqConfig === void 0 ? void 0 : reqConfig.idempotencyKey)) {
        const method = ((_f = reqConfig === null || reqConfig === void 0 ? void 0 : reqConfig.method) !== null && _f !== void 0 ? _f : "GET").toString().toUpperCase();
        if (MUTATING_METHODS2.has(method)) {
          effectiveReqConfig = { ...reqConfig, idempotencyKey: generateIdempotencyKey() };
        }
      }
      let attempt = 0;
      let lastError;
      while (attempt <= maxAttempts) {
        if (externalSignal === null || externalSignal === void 0 ? void 0 : externalSignal.aborted) {
          throw new DOMException("Pipeline aborted", "AbortError");
        }
        const timeoutController = new AbortController();
        const timeoutId = timeoutMs > 0 ? setTimeout(() => timeoutController.abort(), timeoutMs) : void 0;
        const signal = mergeSignals(externalSignal, timeoutController.signal);
        try {
          const result = await this.client.request(command, {
            ...effectiveReqConfig,
            signal
          });
          return result;
        } catch (err) {
          lastError = err;
          const e = err;
          const isAbort = (e === null || e === void 0 ? void 0 : e.name) === "AbortError" || (e === null || e === void 0 ? void 0 : e.code) === "ERR_CANCELED" || (externalSignal === null || externalSignal === void 0 ? void 0 : externalSignal.aborted);
          if (isAbort)
            throw err;
          const httpStatus = (_h = (_g = e === null || e === void 0 ? void 0 : e.response) === null || _g === void 0 ? void 0 : _g.status) !== null && _h !== void 0 ? _h : e === null || e === void 0 ? void 0 : e.status;
          if (retriableStatus && httpStatus !== void 0) {
            if (!retriableStatus.includes(httpStatus)) {
              throw err;
            }
          }
          attempt++;
          if (attempt > maxAttempts)
            break;
          const retryAfterHeader = (_l = (_k = (_j = e === null || e === void 0 ? void 0 : e.response) === null || _j === void 0 ? void 0 : _j.headers) === null || _k === void 0 ? void 0 : _k["retry-after"]) !== null && _l !== void 0 ? _l : (_o = (_m = e === null || e === void 0 ? void 0 : e.response) === null || _m === void 0 ? void 0 : _m.headers) === null || _o === void 0 ? void 0 : _o["Retry-After"];
          let delay;
          if (retryAfterHeader !== void 0) {
            const parsed = parseRetryAfter(retryAfterHeader, maxRetryAfterMs);
            delay = parsed !== null ? parsed : computeBackoffDelay(attempt);
          } else {
            delay = computeBackoffDelay(attempt);
          }
          if (delay > 0) {
            await sleep2(Math.round(delay), externalSignal);
          }
        } finally {
          if (timeoutId !== void 0)
            clearTimeout(timeoutId);
        }
      }
      throw lastError;
    }
  };

  // dist/esm/http/error-handler.js
  var ErrorHandler = class {
    handle(error, _stageKey) {
      return {
        message: error instanceof Error ? error.message : String(error !== null && error !== void 0 ? error : "Unknown error"),
        status: typeof (error === null || error === void 0 ? void 0 : error.status) === "number" ? error.status : void 0
      };
    }
  };

  // dist/esm/pipeline/progress-tracker.js
  var ProgressTracker = class {
    constructor(totalStages) {
      this.listeners = [];
      this.progress = {
        currentStage: 0,
        totalStages,
        stageStatuses: Array(totalStages).fill("pending")
      };
    }
    reset() {
      this.progress.currentStage = 0;
      this.progress.stageStatuses = Array(this.progress.totalStages).fill("pending");
      this.notify();
    }
    /**
     * Returns a snapshot of the current progress.
     * Alias for getProgress() — use subscribeProgress to track changes.
     */
    getProgressRef() {
      return this.snapshot();
    }
    updateStage(stage, status) {
      this.progress.stageStatuses[stage] = status;
      this.progress.currentStage = stage;
      this.notify();
    }
    getProgress() {
      return this.snapshot();
    }
    subscribe(listener) {
      this.listeners.push(listener);
      listener(this.snapshot());
      return () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      };
    }
    notify() {
      for (const listener of this.listeners) {
        listener(this.snapshot());
      }
    }
    /** A shallow copy of `progress` with `stageStatuses` also cloned, so a returned snapshot is a stable point-in-time value — `updateStage()` mutates the live array in place, and without cloning it, every previously-returned snapshot would silently reflect later updates too. */
    snapshot() {
      return { ...this.progress, stageStatuses: [...this.progress.stageStatuses] };
    }
  };

  // dist/esm/pipeline/orchestrator/pause-resume.js
  var PauseController = class {
    constructor() {
      this._paused = false;
      this._resumePromise = null;
      this._resumeResolve = null;
    }
    /** Pause after the current stage finishes. No-op if already paused. */
    pause() {
      if (!this._paused) {
        this._paused = true;
        this._resumePromise = new Promise((resolve) => {
          this._resumeResolve = resolve;
        });
      }
    }
    /** Resume execution. No-op if not paused. */
    resume() {
      var _a;
      if (this._paused) {
        this._paused = false;
        (_a = this._resumeResolve) === null || _a === void 0 ? void 0 : _a.call(this);
        this._resumeResolve = null;
        this._resumePromise = null;
      }
    }
    get isPaused() {
      return this._paused;
    }
    /**
     * Resolves immediately if not paused; otherwise waits until `resume()` is
     * called. Call this right after committing a stage's success/emitting its
     * events — matching where the orchestrator checks for a pause today.
     */
    async waitIfPaused() {
      if (this._paused && this._resumePromise) {
        await this._resumePromise;
      }
    }
    /**
     * Resets to the not-paused state without resolving any pending resume
     * promise — used when `run()`/a `pipelineRetry` attempt restarts, as
     * opposed to an actual user-triggered `resume()`.
     */
    reset() {
      this._paused = false;
      this._resumePromise = null;
      this._resumeResolve = null;
    }
  };

  // dist/esm/pipeline/orchestrator/stage-guards.js
  function isParallelGroup(item) {
    return typeof item === "object" && item !== null && "parallel" in item;
  }
  function isSubPipeline(item) {
    return typeof item === "object" && item !== null && "subPipeline" in item;
  }
  function isStreamStage(item) {
    return typeof item === "object" && item !== null && "stream" in item;
  }
  function isWebSocketStage(item) {
    return typeof item === "object" && item !== null && "onMessage" in item;
  }

  // dist/esm/pipeline/orchestrator/state-persistence.js
  function exportPipelineState(stageResults, logs) {
    return {
      stageResults: JSON.parse(JSON.stringify(stageResults)),
      logs: logs.map((l) => ({
        ...l,
        timestamp: l.timestamp.toISOString()
      }))
    };
  }
  function parseImportedPipelineState(state) {
    return {
      stageResults: JSON.parse(JSON.stringify(state.stageResults)),
      logs: state.logs.map((l) => ({
        ...l,
        timestamp: new Date(l.timestamp)
      }))
    };
  }
  function computeProgressUpdatesFromStageResults(stages, stageResults) {
    var _a, _b, _c;
    const updates = [];
    for (let i = 0; i < stages.length; i++) {
      const item = stages[i];
      let status;
      if (isParallelGroup(item)) {
        status = item.parallel.map((s) => {
          var _a2;
          return (_a2 = stageResults[s.key]) === null || _a2 === void 0 ? void 0 : _a2.status;
        }).find((s) => s !== void 0);
      } else if (isSubPipeline(item)) {
        status = (_a = stageResults[item.key]) === null || _a === void 0 ? void 0 : _a.status;
      } else if (isStreamStage(item)) {
        status = (_b = stageResults[item.key]) === null || _b === void 0 ? void 0 : _b.status;
      } else {
        status = (_c = stageResults[item.key]) === null || _c === void 0 ? void 0 : _c.status;
      }
      if (status)
        updates.push({ index: i, status });
    }
    return updates;
  }

  // dist/esm/pipeline/orchestrator/sub-pipeline.js
  async function executeSubPipeline(ctx, stepIndex, item, signal, globalContinueOnError) {
    var _a, _b;
    const key = item.key;
    const shouldContinue = (_a = item.continueOnError) !== null && _a !== void 0 ? _a : globalContinueOnError;
    ctx.stageResults[key] = { status: "pending" };
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "loading");
    await ctx.emit(`step:${key}:progress`, "loading");
    ctx.addLog("log", `subPipeline:${key}:start`, { stepIndex });
    await ctx.emit("log", {
      type: "subPipeline:start",
      stepKey: key,
      stepIndex
    });
    let subOrchestrator;
    try {
      subOrchestrator = new PipelineOrchestrator({
        config: item.subPipeline,
        httpConfig: item.httpConfig,
        sharedData: {
          ...ctx.sharedData,
          ...(_b = item.sharedData) !== null && _b !== void 0 ? _b : {}
        }
      });
      const subResult = await subOrchestrator.run(void 0, signal);
      if (!subResult.success && !shouldContinue) {
        const error = new Error(`Sub-pipeline "${key}" failed`);
        error.subResult = subResult;
        throw error;
      }
      const resultStatus = subResult.success ? "success" : "error";
      const result = {
        status: resultStatus,
        data: subResult
      };
      ctx.stageResults[key] = result;
      ctx.notifyStageResults();
      ctx.progress.updateStage(stepIndex, resultStatus);
      await ctx.emit(`step:${key}:progress`, resultStatus);
      if (subResult.success) {
        ctx.addLog("log", `subPipeline:${key}:success`, { stepIndex });
        await ctx.emit("log", {
          type: "subPipeline:success",
          stepKey: key,
          stepIndex
        });
      } else {
        ctx.addLog("error", `subPipeline:${key}:error`, {
          stepIndex,
          error: subResult
        });
        await ctx.emit("log", {
          type: "subPipeline:error",
          stepKey: key,
          stepIndex,
          error: subResult
        });
      }
      return result;
    } catch (err) {
      const apiError = ctx.errorHandler.handle(err, key);
      const errorResult = {
        status: "error",
        error: apiError
      };
      ctx.stageResults[key] = errorResult;
      ctx.notifyStageResults();
      ctx.progress.updateStage(stepIndex, "error");
      await ctx.emit(`step:${key}:progress`, "error");
      ctx.addLog("error", `subPipeline:${key}:exception`, {
        stepIndex,
        error: apiError
      });
      await ctx.emit("log", {
        type: "subPipeline:exception",
        stepKey: key,
        stepIndex,
        error: apiError
      });
      throw err;
    } finally {
      subOrchestrator === null || subOrchestrator === void 0 ? void 0 : subOrchestrator.destroy();
    }
  }

  // dist/esm/pipeline/orchestrator/stream-stage.js
  async function executeStreamStage(ctx, stepIndex, item, signal) {
    var _a, _b, _c, _d, _e, _f;
    const key = item.key;
    const prevData = ctx._getPrevData(stepIndex);
    const stepStartTs = Date.now();
    ctx.stageResults[key] = { status: "pending" };
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "loading");
    await ctx.emit(`step:${key}:progress`, "loading");
    await ctx.emitStepStart({
      stepIndex,
      stepKey: key,
      status: "loading",
      stageResults: { ...ctx.stageResults }
    });
    ctx.addLog("log", `stream:${key}:start`, { stepIndex });
    await ctx.emit("log", { type: "stream:start", stepKey: key, stepIndex });
    try {
      if (signal.aborted)
        throw new Error("Pipeline aborted");
      const chunks = [];
      const asyncIter = item.stream({
        prev: prevData,
        allResults: ctx.stageResults,
        sharedData: ctx.sharedData,
        signal
      });
      for await (const chunk of asyncIter) {
        if (signal.aborted)
          throw new Error("Pipeline aborted");
        chunks.push(chunk);
        (_a = item.onChunk) === null || _a === void 0 ? void 0 : _a.call(item, chunk, ctx.sharedData);
        await ctx.emit(`step:${key}:progress`, { chunk, chunks: [...chunks] });
      }
      const successResult = { status: "success", data: chunks };
      ctx.stageResults[key] = successResult;
      ctx.notifyStageResults();
      ctx.progress.updateStage(stepIndex, "success");
      await ctx.emit(`step:${key}:progress`, "success");
      (_c = (_b = ctx.config.metrics) === null || _b === void 0 ? void 0 : _b.onStepDuration) === null || _c === void 0 ? void 0 : _c.call(_b, {
        stepKey: key,
        durationMs: Date.now() - stepStartTs,
        status: "success",
        runId: ctx._runId
      });
      const persistAdapter = (_d = ctx.config.options) === null || _d === void 0 ? void 0 : _d.persistAdapter;
      if (persistAdapter) {
        try {
          await persistAdapter.save(ctx.exportState());
        } catch {
        }
      }
      ctx.addLog("log", `stream:${key}:success`, { stepIndex, chunks: chunks.length });
      await ctx.emit("log", { type: "stream:success", stepKey: key, stepIndex });
      await ctx.emitStepFinish({
        stepIndex,
        stepKey: key,
        status: "success",
        data: chunks,
        stageResults: { ...ctx.stageResults }
      });
      await ctx._pauseController.waitIfPaused();
      return successResult;
    } catch (err) {
      const apiError = ctx.errorHandler.handle(err, key);
      const errorResult = { status: "error", error: apiError };
      ctx.stageResults[key] = errorResult;
      ctx.notifyStageResults();
      ctx.progress.updateStage(stepIndex, "error");
      await ctx.emit(`step:${key}:progress`, "error");
      (_f = (_e = ctx.config.metrics) === null || _e === void 0 ? void 0 : _e.onStepDuration) === null || _f === void 0 ? void 0 : _f.call(_e, {
        stepKey: key,
        durationMs: Date.now() - stepStartTs,
        status: "error",
        runId: ctx._runId
      });
      ctx.addLog("error", `stream:${key}:error`, { stepIndex, error: apiError });
      await ctx.emit("log", { type: "stream:error", stepKey: key, stepIndex, error: apiError });
      await ctx.emitStepError({
        stepIndex,
        stepKey: key,
        status: "error",
        error: apiError,
        stageResults: { ...ctx.stageResults }
      });
      return errorResult;
    }
  }

  // dist/esm/pipeline/orchestrator/websocket-stage.js
  function defaultCreateWebSocket(url, protocols) {
    const g = globalThis;
    if (!g.WebSocket) {
      throw new Error('No global WebSocket available. Pass WebSocketStageConfig.createWebSocket (e.g. `(url, protocols) => new (require("ws"))(url, protocols)` on Node <22).');
    }
    return new g.WebSocket(url, protocols);
  }
  async function executeWebSocketStage(ctx, stepIndex, item, signal) {
    var _a, _b, _c, _d, _e, _f;
    const key = item.key;
    const prevData = ctx._getPrevData(stepIndex);
    const stepStartTs = Date.now();
    ctx.stageResults[key] = { status: "pending" };
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "loading");
    await ctx.emit(`step:${key}:progress`, "loading");
    await ctx.emitStepStart({
      stepIndex,
      stepKey: key,
      status: "loading",
      stageResults: { ...ctx.stageResults }
    });
    ctx.addLog("log", `websocket:${key}:start`, { stepIndex });
    await ctx.emit("log", { type: "websocket:start", stepKey: key, stepIndex });
    const hookParams = {
      prev: prevData,
      allResults: ctx.stageResults,
      sharedData: ctx.sharedData,
      signal
    };
    try {
      if (signal.aborted)
        throw new Error("Pipeline aborted");
      const url = typeof item.url === "function" ? item.url(hookParams) : item.url;
      const createWs = (_a = item.createWebSocket) !== null && _a !== void 0 ? _a : defaultCreateWebSocket;
      const ws = createWs(url, item.protocols);
      const messages = await new Promise((resolve, reject) => {
        const collected = [];
        let settled = false;
        let sawError = false;
        const cleanup = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("message", onMessage);
          ws.removeEventListener("close", onClose);
          ws.removeEventListener("error", onError);
          signal.removeEventListener("abort", onAbort);
          if (timeoutId !== void 0)
            clearTimeout(timeoutId);
        };
        const settle2 = (fn) => {
          if (settled)
            return;
          settled = true;
          cleanup();
          fn();
        };
        const onOpen = (event) => {
          var _a2;
          void ((_a2 = item.onOpen) === null || _a2 === void 0 ? void 0 : _a2.call(item, { ...hookParams, event }));
        };
        let messageChain = Promise.resolve();
        const onMessage = (event) => {
          messageChain = messageChain.then(async () => {
            var _a2, _b2;
            try {
              const data = await item.onMessage(event === null || event === void 0 ? void 0 : event.data, { ...hookParams, event });
              if (data !== void 0) {
                collected.push(data);
                (_a2 = item.onChunk) === null || _a2 === void 0 ? void 0 : _a2.call(item, data, ctx.sharedData);
                await ctx.emit(`step:${key}:progress`, { chunk: data, chunks: [...collected] });
              }
              if (data !== void 0 && ((_b2 = item.closeOn) === null || _b2 === void 0 ? void 0 : _b2.call(item, data, hookParams))) {
                try {
                  ws.close();
                } catch {
                }
              }
            } catch (err) {
              settle2(() => reject(err));
            }
          });
        };
        const onClose = (event) => {
          settle2(() => {
            var _a2;
            const wasClean = (_a2 = event === null || event === void 0 ? void 0 : event.wasClean) !== null && _a2 !== void 0 ? _a2 : !sawError;
            void (async () => {
              var _a3;
              try {
                await ((_a3 = item.onClose) === null || _a3 === void 0 ? void 0 : _a3.call(item, {
                  ...hookParams,
                  code: event === null || event === void 0 ? void 0 : event.code,
                  reason: event === null || event === void 0 ? void 0 : event.reason,
                  wasClean
                }));
                if (wasClean) {
                  resolve(collected);
                } else {
                  reject(new Error(`WebSocket stage "${key}" closed uncleanly` + ((event === null || event === void 0 ? void 0 : event.code) !== void 0 ? ` (code ${event.code})` : "")));
                }
              } catch (hookErr) {
                reject(hookErr);
              }
            })();
          });
        };
        const onError = (event) => {
          var _a2;
          sawError = true;
          void ((_a2 = item.onError) === null || _a2 === void 0 ? void 0 : _a2.call(item, event, hookParams));
        };
        const onAbort = () => {
          settle2(() => {
            try {
              ws.close();
            } catch {
            }
            reject(new Error("Pipeline aborted"));
          });
        };
        let timeoutId;
        if (item.timeoutMs && item.timeoutMs > 0) {
          timeoutId = setTimeout(() => {
            settle2(() => {
              try {
                ws.close();
              } catch {
              }
              reject(new Error(`WebSocket stage "${key}" timed out after ${item.timeoutMs}ms`));
            });
          }, item.timeoutMs);
        }
        ws.addEventListener("open", onOpen);
        ws.addEventListener("message", onMessage);
        ws.addEventListener("close", onClose);
        ws.addEventListener("error", onError);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted)
          onAbort();
      });
      const successResult = { status: "success", data: messages };
      ctx.stageResults[key] = successResult;
      ctx.notifyStageResults();
      ctx.progress.updateStage(stepIndex, "success");
      await ctx.emit(`step:${key}:progress`, "success");
      (_c = (_b = ctx.config.metrics) === null || _b === void 0 ? void 0 : _b.onStepDuration) === null || _c === void 0 ? void 0 : _c.call(_b, {
        stepKey: key,
        durationMs: Date.now() - stepStartTs,
        status: "success",
        runId: ctx._runId
      });
      const persistAdapter = (_d = ctx.config.options) === null || _d === void 0 ? void 0 : _d.persistAdapter;
      if (persistAdapter) {
        try {
          await persistAdapter.save(ctx.exportState());
        } catch {
        }
      }
      ctx.addLog("log", `websocket:${key}:success`, { stepIndex, messages: messages.length });
      await ctx.emit("log", { type: "websocket:success", stepKey: key, stepIndex });
      await ctx.emitStepFinish({
        stepIndex,
        stepKey: key,
        status: "success",
        data: messages,
        stageResults: { ...ctx.stageResults }
      });
      await ctx._pauseController.waitIfPaused();
      return successResult;
    } catch (err) {
      const apiError = ctx.errorHandler.handle(err, key);
      const errorResult = { status: "error", error: apiError };
      ctx.stageResults[key] = errorResult;
      ctx.notifyStageResults();
      ctx.progress.updateStage(stepIndex, "error");
      await ctx.emit(`step:${key}:progress`, "error");
      (_f = (_e = ctx.config.metrics) === null || _e === void 0 ? void 0 : _e.onStepDuration) === null || _f === void 0 ? void 0 : _f.call(_e, {
        stepKey: key,
        durationMs: Date.now() - stepStartTs,
        status: "error",
        runId: ctx._runId
      });
      ctx.addLog("error", `websocket:${key}:error`, { stepIndex, error: apiError });
      await ctx.emit("log", { type: "websocket:error", stepKey: key, stepIndex, error: apiError });
      await ctx.emitStepError({
        stepIndex,
        stepKey: key,
        status: "error",
        error: apiError,
        stageResults: { ...ctx.stageResults }
      });
      return errorResult;
    }
  }

  // dist/esm/pipeline/pipeline-orchestrator.js
  function sleep3(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  var PipelineOrchestrator = class {
    constructor(params) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      this.onStepStartHandlers = [];
      this.onStepFinishHandlers = [];
      this.onStepErrorHandlers = [];
      this.eventHandlers = {};
      this.logs = [];
      this.stageResults = {};
      this.stageResultsListeners = [];
      this.abortController = null;
      this._rerunAbortController = null;
      this._pauseController = new PauseController();
      this._lastFailedIndex = -1;
      this._runId = "";
      this._pluginCleanups = [];
      this.config = params.config;
      this.progress = new ProgressTracker(params.config.stages.length);
      this.errorHandler = new ErrorHandler();
      this.executor = new RequestExecutor((_a = params.httpConfig) !== null && _a !== void 0 ? _a : {});
      this.sharedData = (_b = params.sharedData) !== null && _b !== void 0 ? _b : {};
      this.autoReset = (_f = (_d = (_c = params.config.options) === null || _c === void 0 ? void 0 : _c.autoReset) !== null && _d !== void 0 ? _d : (_e = params.options) === null || _e === void 0 ? void 0 : _e.autoReset) !== null && _f !== void 0 ? _f : false;
      const plugins = (_h = (_g = params.config.options) === null || _g === void 0 ? void 0 : _g.plugins) !== null && _h !== void 0 ? _h : [];
      for (const plugin of plugins) {
        const cleanup = plugin.install(this);
        if (typeof cleanup === "function") {
          this._pluginCleanups.push(cleanup);
        }
      }
    }
    /**
     * Release plugin resources. Call this when destroying the orchestrator.
     */
    destroy() {
      for (const cleanup of this._pluginCleanups) {
        try {
          cleanup();
        } catch {
        }
      }
      this._pluginCleanups = [];
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Pause / Resume
    // ─────────────────────────────────────────────────────────────────────────
    /** Pause the pipeline after the current stage finishes */
    pause() {
      this._pauseController.pause();
    }
    /** Resume pipeline execution */
    resume() {
      this._pauseController.resume();
    }
    /** Check whether the pipeline is paused */
    isPaused() {
      return this._pauseController.isPaused;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Subscriptions
    // ─────────────────────────────────────────────────────────────────────────
    subscribeStageResults(listener) {
      this.stageResultsListeners.push(listener);
      listener({ ...this.stageResults });
      return () => {
        this.stageResultsListeners = this.stageResultsListeners.filter((l) => l !== listener);
      };
    }
    on(event, handler) {
      if (!this.eventHandlers[event])
        this.eventHandlers[event] = [];
      this.eventHandlers[event].push(handler);
      return () => {
        this.eventHandlers[event] = this.eventHandlers[event].filter((h) => h !== handler);
      };
    }
    onStepStart(handler) {
      this.onStepStartHandlers.push(handler);
      return () => {
        this.onStepStartHandlers = this.onStepStartHandlers.filter((h) => h !== handler);
      };
    }
    onStepFinish(handler) {
      this.onStepFinishHandlers.push(handler);
      return () => {
        this.onStepFinishHandlers = this.onStepFinishHandlers.filter((h) => h !== handler);
      };
    }
    onStepError(handler) {
      this.onStepErrorHandlers.push(handler);
      return () => {
        this.onStepErrorHandlers = this.onStepErrorHandlers.filter((h) => h !== handler);
      };
    }
    subscribeProgress(listener) {
      return this.progress.subscribe(listener);
    }
    subscribeStepProgress(stepKey, listener) {
      return this.on(`step:${stepKey}:progress`, listener);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // State getters
    // ─────────────────────────────────────────────────────────────────────────
    getProgress() {
      return this.progress.getProgress();
    }
    /** Returns a snapshot of the progress. For reactivity, use subscribeProgress. */
    getProgressRef() {
      return this.progress.getProgressRef();
    }
    getLogs() {
      return [...this.logs];
    }
    /** Returns a synchronous snapshot of the results of all stages. */
    getStageResults() {
      return { ...this.stageResults };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // State management
    // ─────────────────────────────────────────────────────────────────────────
    clearStageResults() {
      this.stageResults = {};
      this.notifyStageResults();
      this.progress.reset();
    }
    /** Export a snapshot of the pipeline state (for saving and restoring) */
    exportState() {
      return exportPipelineState(this.stageResults, this.logs);
    }
    /** Restore pipeline state from a previously saved snapshot */
    importState(state) {
      const parsed = parseImportedPipelineState(state);
      this.stageResults = parsed.stageResults;
      this.logs = parsed.logs;
      this.notifyStageResults();
      for (const { index, status } of computeProgressUpdatesFromStageResults(this.config.stages, this.stageResults)) {
        this.progress.updateStage(index, status);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Abort
    // ─────────────────────────────────────────────────────────────────────────
    abort() {
      if (this.abortController) {
        this.abortController.abort();
      }
      if (this._rerunAbortController) {
        this._rerunAbortController.abort();
      }
      if (this._pauseController.isPaused)
        this.resume();
    }
    isAborted() {
      var _a, _b;
      return (_b = (_a = this.abortController) === null || _a === void 0 ? void 0 : _a.signal.aborted) !== null && _b !== void 0 ? _b : false;
    }
    /** Identifier of the current/last run (run() or rerunStep()). Empty string if nothing has run yet. */
    getRunId() {
      return this._runId;
    }
    _generateRunId() {
      var _a;
      const g = globalThis;
      if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
        return g.crypto.randomUUID();
      return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Emit helpers
    // ─────────────────────────────────────────────────────────────────────────
    async emit(event, ...args) {
      if (this.eventHandlers[event]) {
        for (const handler of this.eventHandlers[event]) {
          try {
            await handler(...args);
          } catch (err) {
            this.addLog("error", `event handler for "${event}" threw`, { error: err });
          }
        }
      }
    }
    notifyStageResults() {
      for (const listener of this.stageResultsListeners) {
        listener({ ...this.stageResults });
      }
    }
    addLog(type, message, data) {
      var _a;
      this.logs.push({ type, message, data, timestamp: /* @__PURE__ */ new Date(), runId: this._runId });
      const maxLogs = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.maxLogs;
      if (maxLogs !== void 0 && this.logs.length > maxLogs) {
        this.logs.splice(0, this.logs.length - maxLogs);
      }
    }
    async emitStepStart(event) {
      const e = { ...event, runId: this._runId };
      for (const handler of this.onStepStartHandlers)
        await handler(e);
      await this.emit(`step:${e.stepKey}:start`, e);
      this.addLog("log", `step:${e.stepKey}:start`, e);
      await this.emit("log", { type: "step:start", ...e });
    }
    async emitStepFinish(event) {
      const e = { ...event, runId: this._runId };
      for (const handler of this.onStepFinishHandlers)
        await handler(e);
      await this.emit(`step:${e.stepKey}:success`, e);
      this.addLog("log", `step:${e.stepKey}:success`, e);
      await this.emit("log", { type: "step:success", ...e });
    }
    async emitStepError(event) {
      const e = { ...event, runId: this._runId };
      for (const handler of this.onStepErrorHandlers)
        await handler(e);
      await this.emit(`step:${e.stepKey}:error`, e);
      this.addLog("error", `step:${e.stepKey}:error`, e);
      await this.emit("log", { type: "step:error", ...e });
    }
    async emitStepSkipped(event) {
      const e = { ...event, runId: this._runId };
      await this.emit(`step:${e.stepKey}:skipped`, e);
      this.addLog("log", `step:${e.stepKey}:skipped`, e);
      await this.emit("log", { type: "step:skipped", ...e });
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Core: execution of a single stage
    // ─────────────────────────────────────────────────────────────────────────
    /** Get the data of the previous (per config) regular stage */
    _getPrevData(stepIndex) {
      var _a;
      const prevItems = this.config.stages.slice(0, stepIndex).filter((s) => !isParallelGroup(s) && !isSubPipeline(s) && !isStreamStage(s) && !isWebSocketStage(s));
      const prevStage = prevItems[prevItems.length - 1];
      return prevStage ? (_a = this.stageResults[prevStage.key]) === null || _a === void 0 ? void 0 : _a.data : void 0;
    }
    /**
     * Execute a single pipeline stage.
     * The single implementation point for stage logic — used by both run() and rerunStep().
     */
    async executeStage(stepIndex, stage, signal, onStepPause) {
      var _a;
      const key = stage.key;
      const prevData = this._getPrevData(stepIndex);
      const stepStartTs = Date.now();
      if (typeof stage.condition === "function") {
        const shouldRun = stage.condition({
          prev: prevData,
          allResults: this.stageResults,
          sharedData: this.sharedData,
          signal
        });
        if (!shouldRun) {
          const skippedResult = { status: "skipped" };
          this.stageResults[key] = skippedResult;
          this.notifyStageResults();
          this.progress.updateStage(stepIndex, "skipped");
          await this.emit(`step:${key}:progress`, "skipped");
          await this.emitStepSkipped({
            stepIndex,
            stepKey: key,
            status: "skipped",
            stageResults: { ...this.stageResults }
          });
          return skippedResult;
        }
      }
      this.stageResults[key] = { status: "pending" };
      this.notifyStageResults();
      this.progress.updateStage(stepIndex, "loading");
      await this.emit(`step:${key}:progress`, "loading");
      await this.emitStepStart({
        stepIndex,
        stepKey: key,
        status: "loading",
        stageResults: { ...this.stageResults }
      });
      try {
        if (signal.aborted) {
          throw new Error("Pipeline aborted");
        }
        if (typeof ((_a = this.config.middleware) === null || _a === void 0 ? void 0 : _a.beforeEach) === "function") {
          await this.config.middleware.beforeEach({
            stage,
            index: stepIndex,
            sharedData: this.sharedData
          });
        }
        if (typeof stage.pauseBefore === "number" && stage.pauseBefore > 0) {
          await new Promise((resolve) => setTimeout(resolve, stage.pauseBefore));
        }
        if (signal.aborted) {
          throw new Error("Pipeline aborted");
        }
        let prevInput = prevData;
        if (typeof stage.before === "function") {
          const beforeResult = await stage.before({
            prev: prevInput,
            allResults: this.stageResults,
            sharedData: this.sharedData,
            signal
          });
          if (beforeResult !== void 0)
            prevInput = beforeResult;
        }
        if (signal.aborted) {
          throw new Error("Pipeline aborted");
        }
        if (typeof stage.validateInput === "function") {
          prevInput = await stage.validateInput(prevInput, {
            allResults: this.stageResults,
            sharedData: this.sharedData,
            signal
          });
        }
        let stepResult;
        if (typeof stage.request === "function") {
          if (signal.aborted) {
            throw new Error("Pipeline aborted");
          }
          stepResult = await stage.request({
            prev: prevInput,
            allResults: this.stageResults,
            sharedData: this.sharedData,
            signal
          });
        } else if (stage.key) {
          const res = await this.executor.execute(stage.key, void 0, stage.retryCount, stage.timeoutMs, signal);
          stepResult = res.data;
        } else {
          stepResult = void 0;
        }
        if (signal.aborted) {
          throw new Error("Pipeline aborted");
        }
        if (typeof stage.after === "function") {
          stepResult = await stage.after({
            result: stepResult,
            allResults: this.stageResults,
            sharedData: this.sharedData,
            signal
          });
        }
        if (typeof stage.pauseAfter === "number" && stage.pauseAfter > 0) {
          await new Promise((resolve) => setTimeout(resolve, stage.pauseAfter));
        }
        if (onStepPause) {
          stepResult = await onStepPause(stepIndex, stepResult, this.stageResults);
        }
        if (typeof stage.validateOutput === "function") {
          stepResult = await stage.validateOutput(stepResult, {
            allResults: this.stageResults,
            sharedData: this.sharedData,
            signal
          });
        }
        return await this._commitStepSuccess(stepIndex, stage, stepResult, stepStartTs);
      } catch (err) {
        if (typeof stage.errorHandler === "function") {
          const handled = stage.errorHandler({
            error: err,
            key: stage.key,
            sharedData: this.sharedData,
            signal
          });
          if (isStepRecovery(handled)) {
            return await this._commitStepSuccess(stepIndex, stage, handled.data, stepStartTs);
          }
          return await this._commitStepError(stepIndex, stage, toApiError(handled !== null && handled !== void 0 ? handled : err), stepStartTs);
        }
        return await this._commitStepError(stepIndex, stage, this.errorHandler.handle(err, stage.key), stepStartTs);
      }
    }
    /** Commit a successful stage result: record it in stageResults, metrics, persist, middleware, events. */
    async _commitStepSuccess(stepIndex, stage, stepResult, stepStartTs) {
      var _a, _b, _c, _d;
      const key = stage.key;
      const successResult = {
        status: "success",
        data: stepResult
      };
      this.stageResults[key] = successResult;
      this.notifyStageResults();
      this.progress.updateStage(stepIndex, "success");
      await this.emit(`step:${key}:progress`, "success");
      (_b = (_a = this.config.metrics) === null || _a === void 0 ? void 0 : _a.onStepDuration) === null || _b === void 0 ? void 0 : _b.call(_a, {
        stepKey: key,
        durationMs: Date.now() - stepStartTs,
        status: "success",
        runId: this._runId
      });
      const persistAdapter = (_c = this.config.options) === null || _c === void 0 ? void 0 : _c.persistAdapter;
      if (persistAdapter) {
        try {
          await persistAdapter.save(this.exportState());
        } catch {
        }
      }
      if (typeof ((_d = this.config.middleware) === null || _d === void 0 ? void 0 : _d.afterEach) === "function") {
        await this.config.middleware.afterEach({
          stage,
          index: stepIndex,
          result: successResult,
          sharedData: this.sharedData
        });
      }
      await this.emitStepFinish({
        stepIndex,
        stepKey: key,
        status: "success",
        data: stepResult,
        stageResults: { ...this.stageResults }
      });
      await this._pauseController.waitIfPaused();
      return successResult;
    }
    /** Commit a stage error: record it in stageResults, metrics, middleware, events. */
    async _commitStepError(stepIndex, stage, apiError, stepStartTs) {
      var _a, _b, _c;
      const key = stage.key;
      const errorResult = {
        status: "error",
        error: apiError
      };
      this.stageResults[key] = errorResult;
      this.notifyStageResults();
      this.progress.updateStage(stepIndex, "error");
      await this.emit(`step:${key}:progress`, "error");
      (_b = (_a = this.config.metrics) === null || _a === void 0 ? void 0 : _a.onStepDuration) === null || _b === void 0 ? void 0 : _b.call(_a, {
        stepKey: key,
        durationMs: Date.now() - stepStartTs,
        status: "error",
        runId: this._runId
      });
      if (typeof ((_c = this.config.middleware) === null || _c === void 0 ? void 0 : _c.onError) === "function") {
        await this.config.middleware.onError({
          stage,
          index: stepIndex,
          error: apiError,
          sharedData: this.sharedData
        });
      }
      await this.emitStepError({
        stepIndex,
        stepKey: key,
        status: "error",
        error: apiError,
        stageResults: { ...this.stageResults }
      });
      return errorResult;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Core: execution of a stream stage (StreamStageConfig)
    // ─────────────────────────────────────────────────────────────────────────
    executeStreamStage(stepIndex, item, signal) {
      return executeStreamStage(this, stepIndex, item, signal);
    }
    executeWebSocketStage(stepIndex, item, signal) {
      return executeWebSocketStage(this, stepIndex, item, signal);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Core: execution of a nested pipeline (SubPipelineStage)
    // ─────────────────────────────────────────────────────────────────────────
    executeSubPipeline(stepIndex, item, signal) {
      var _a, _b;
      const globalContinueOnError = (_b = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.continueOnError) !== null && _b !== void 0 ? _b : false;
      return executeSubPipeline(this, stepIndex, item, signal, globalContinueOnError);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Helper method: find a stage by key, returning its index
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Finds a stage by key for `rerunStep()` — deliberately excludes stream/
     * WebSocket stages (in addition to sub-pipelines), since the returned
     * `.stage` is cast to `PipelineStageConfig` and handed to `executeStage()`,
     * which only knows the `request`-based execution path. A stream/WebSocket
     * item has no `request`, so `executeStage()` would silently fall through
     * to the "no request function — use `key` as a URL" shorthand, treating
     * the stage's key as a literal URL to GET.
     */
    findStageByKey(key) {
      for (let i = 0; i < this.config.stages.length; i++) {
        const item = this.config.stages[i];
        if (isParallelGroup(item)) {
          const found = item.parallel.find((s) => s.key === key);
          if (found)
            return { stage: found, index: i };
        } else if (!isSubPipeline(item) && !isStreamStage(item) && !isWebSocketStage(item)) {
          const stage = item;
          if (stage.key === key)
            return { stage, index: i };
        }
      }
      return void 0;
    }
    /**
     * Run a worker for each item in items with a concurrency limit.
     * Without a limit (undefined/0/>= items.length) it behaves like Promise.all — all items start at once.
     * Results are returned in the original order of items regardless of completion order.
     */
    async _runPooled(items, limit, worker) {
      if (!limit || limit >= items.length) {
        return Promise.all(items.map((item, index) => worker(item, index)));
      }
      const results = new Array(items.length);
      let nextIndex = 0;
      const runNext = async () => {
        const index = nextIndex++;
        if (index >= items.length)
          return;
        results[index] = await worker(items[index], index);
        return runNext();
      };
      const poolSize = Math.max(1, Math.min(limit, items.length));
      await Promise.all(Array.from({ length: poolSize }, () => runNext()));
      return results;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // _runOnce() — a single attempt at running the pipeline
    // ─────────────────────────────────────────────────────────────────────────
    async _runOnce(onStepPause, signal, startFromIndex = 0) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j;
      const globalContinueOnError = (_b = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.continueOnError) !== null && _b !== void 0 ? _b : false;
      const maxSteps = (_d = (_c = this.config.options) === null || _c === void 0 ? void 0 : _c.maxSteps) !== null && _d !== void 0 ? _d : this.config.stages.length * 10;
      let success = true;
      let stepCount = 0;
      let i = startFromIndex;
      while (i < this.config.stages.length) {
        stepCount++;
        if (stepCount > maxSteps) {
          const loopError = toApiError(new Error(`Pipeline exceeded maxSteps (${maxSteps}). Possible infinite loop in 'next' transitions.`));
          this.addLog("error", "pipeline:maxSteps:exceeded", { maxSteps });
          await this.emit("log", { type: "pipeline:error", error: loopError });
          return { stageResults: { ...this.stageResults }, success: false };
        }
        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
          success = false;
          this.markRemainingAborted(i, signal);
          break;
        }
        const item = this.config.stages[i];
        if (isStreamStage(item)) {
          const streamItem = item;
          const shouldContinue = (_e = streamItem.continueOnError) !== null && _e !== void 0 ? _e : globalContinueOnError;
          const result2 = await this.executeStreamStage(i, streamItem, signal);
          if (result2.status === "error") {
            if (!shouldContinue) {
              success = false;
              this._lastFailedIndex = i;
              break;
            }
          }
          i++;
          continue;
        }
        if (isWebSocketStage(item)) {
          const wsItem = item;
          const shouldContinue = (_f = wsItem.continueOnError) !== null && _f !== void 0 ? _f : globalContinueOnError;
          const result2 = await this.executeWebSocketStage(i, wsItem, signal);
          if (result2.status === "error") {
            if (!shouldContinue) {
              success = false;
              this._lastFailedIndex = i;
              break;
            }
          }
          i++;
          continue;
        }
        if (isSubPipeline(item)) {
          const subItem = item;
          const shouldContinue = (_g = subItem.continueOnError) !== null && _g !== void 0 ? _g : globalContinueOnError;
          try {
            const result2 = await this.executeSubPipeline(i, subItem, signal);
            if (result2.status === "error") {
              if (!shouldContinue) {
                success = false;
                this._lastFailedIndex = i;
                break;
              }
            }
            i++;
            continue;
          } catch (err) {
            const apiError = toApiError(err);
            this.addLog("error", `subPipeline:${subItem.key}:unhandled_error`, {
              stepIndex: i,
              error: apiError
            });
            await this.emit("log", {
              type: "subPipeline:unhandled_error",
              stepKey: subItem.key,
              stepIndex: i,
              error: apiError
            });
            if (!shouldContinue) {
              success = false;
              this._lastFailedIndex = i;
              break;
            }
            i++;
            continue;
          }
        }
        if (isParallelGroup(item)) {
          const group = item;
          this.progress.updateStage(i, "loading");
          const parallelResults = await this._runPooled(group.parallel, group.concurrency, (stage2) => this.executeStage(i, stage2, signal, onStepPause));
          const anyFailed = parallelResults.some((r) => r.status === "error");
          this.progress.updateStage(i, anyFailed ? "error" : "success");
          if (anyFailed) {
            const shouldContinue = (_h = group.continueOnError) !== null && _h !== void 0 ? _h : globalContinueOnError;
            if (!shouldContinue) {
              success = false;
              this._lastFailedIndex = i;
              break;
            }
          }
          i++;
          continue;
        }
        const stage = item;
        const result = await this.executeStage(i, stage, signal, onStepPause);
        if (result.status === "error") {
          const shouldContinue = (_j = stage.continueOnError) !== null && _j !== void 0 ? _j : globalContinueOnError;
          if (!shouldContinue) {
            success = false;
            this._lastFailedIndex = i;
            break;
          }
          i++;
          continue;
        }
        if (typeof stage.next === "function") {
          const nextKey = stage.next({
            result: result.data,
            allResults: this.stageResults,
            sharedData: this.sharedData
          });
          if (nextKey !== null) {
            const found = this.findStageByKey(nextKey);
            if (found) {
              i = found.index;
              continue;
            } else {
              this.addLog("log", `pipeline:next:key_not_found`, {
                stepKey: stage.key,
                nextKey
              });
              break;
            }
          }
        }
        i++;
      }
      return { stageResults: { ...this.stageResults }, success };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // run()
    // ─────────────────────────────────────────────────────────────────────────
    async run(onStepPause, externalSignal) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j;
      if (this.autoReset) {
        this.stageResults = {};
        this.logs = [];
        this.notifyStageResults();
      }
      this._pauseController.reset();
      this._lastFailedIndex = -1;
      this._runId = this._generateRunId();
      this.abortController = new AbortController();
      const signal = externalSignal ? this.mergeSignals(externalSignal, this.abortController.signal) : this.abortController.signal;
      const retryOpts = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.pipelineRetry;
      const maxAttempts = (_b = retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.attempts) !== null && _b !== void 0 ? _b : 0;
      let attempt = 0;
      let lastResult = { stageResults: {}, success: false };
      const pipelineStartTs = Date.now();
      const persistAdapter = (_c = this.config.options) === null || _c === void 0 ? void 0 : _c.persistAdapter;
      if (persistAdapter && !this.autoReset) {
        try {
          const saved = await persistAdapter.load();
          if (saved)
            this.importState(saved);
        } catch {
        }
      }
      (_e = (_d = this.config.metrics) === null || _d === void 0 ? void 0 : _d.onPipelineStart) === null || _e === void 0 ? void 0 : _e.call(_d, { timestamp: pipelineStartTs, runId: this._runId });
      let pipelineTimeoutId;
      if ((_f = this.config.options) === null || _f === void 0 ? void 0 : _f.pipelineTimeoutMs) {
        pipelineTimeoutId = setTimeout(() => {
          this.abort();
        }, this.config.options.pipelineTimeoutMs);
      }
      try {
        do {
          if (attempt > 0) {
            if (retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.delayMs)
              await sleep3(retryOpts.delayMs);
            const retryFrom = (_g = retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.retryFrom) !== null && _g !== void 0 ? _g : "start";
            const startIndex = retryFrom === "failed-step" && this._lastFailedIndex >= 0 ? this._lastFailedIndex : 0;
            if (startIndex === 0) {
              this.stageResults = {};
              this.notifyStageResults();
              this.progress.reset();
            }
            this._lastFailedIndex = -1;
            this._pauseController.reset();
            this.addLog("log", `pipeline:retry:attempt:${attempt}`, {
              attempt,
              startIndex
            });
            await this.emit("log", {
              type: "pipeline:retry",
              attempt,
              startIndex
            });
            lastResult = await this._runOnce(onStepPause, signal, startIndex);
          } else {
            lastResult = await this._runOnce(onStepPause, signal);
          }
          attempt++;
        } while (!lastResult.success && attempt <= maxAttempts && !signal.aborted);
      } finally {
        if (pipelineTimeoutId !== void 0)
          clearTimeout(pipelineTimeoutId);
      }
      (_j = (_h = this.config.metrics) === null || _h === void 0 ? void 0 : _h.onPipelineEnd) === null || _j === void 0 ? void 0 : _j.call(_h, {
        durationMs: Date.now() - pipelineStartTs,
        success: lastResult.success,
        stageResults: lastResult.stageResults,
        runId: this._runId
      });
      return lastResult;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // rerunStep()
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Re-run just a single pipeline stage (without a full restart).
     * Fully mirrors the behavior of run(): invokes before/after/condition/middleware.
     */
    async rerunStep(stepKey, options) {
      var _a;
      const found = this.findStageByKey(stepKey);
      if (!found)
        return void 0;
      const { stage, index: stepIndex } = found;
      this._runId = this._generateRunId();
      const ownController = (options === null || options === void 0 ? void 0 : options.externalSignal) ? null : new AbortController();
      if (ownController)
        this._rerunAbortController = ownController;
      const signal = (_a = options === null || options === void 0 ? void 0 : options.externalSignal) !== null && _a !== void 0 ? _a : ownController.signal;
      try {
        this.addLog("log", `rerunStep:${stepKey}:start`, { stepIndex });
        await this.emit("log", { type: "rerunStep:start", stepKey, stepIndex });
        const result = await this.executeStage(stepIndex, stage, signal, options === null || options === void 0 ? void 0 : options.onStepPause);
        const logType = result.status === "error" ? "error" : "log";
        this.addLog(logType, `rerunStep:${stepKey}:${result.status}`, {
          stepIndex,
          ...result.status === "error" ? { error: result.error } : { data: result.data }
        });
        await this.emit("log", {
          type: `rerunStep:${result.status}`,
          stepKey,
          stepIndex,
          ...result.status === "error" ? { error: result.error } : { data: result.data }
        });
        return result;
      } finally {
        if (ownController && this._rerunAbortController === ownController) {
          this._rerunAbortController = null;
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    mergeSignals(a, b) {
      const controller = new AbortController();
      const cleanup = () => {
        a.removeEventListener("abort", onAbort);
        b.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        controller.abort();
      };
      if (a.aborted || b.aborted) {
        controller.abort();
      } else {
        a.addEventListener("abort", onAbort);
        b.addEventListener("abort", onAbort);
      }
      return controller.signal;
    }
    markRemainingAborted(fromIndex, _signal) {
      const apiError = toApiError({
        message: "Pipeline aborted",
        code: "ABORTED"
      });
      for (let i = fromIndex; i < this.config.stages.length; i++) {
        const item = this.config.stages[i];
        let keys;
        if (isParallelGroup(item)) {
          keys = item.parallel.map((s) => s.key);
        } else if (isSubPipeline(item)) {
          keys = [item.key];
        } else if (isStreamStage(item)) {
          keys = [item.key];
        } else {
          keys = [item.key];
        }
        for (const key of keys) {
          if (!this.stageResults[key] || this.stageResults[key].status === "pending") {
            this.stageResults[key] = { status: "error", error: apiError };
          }
        }
        this.progress.updateStage(i, "error");
      }
      this.notifyStageResults();
    }
  };

  // dist/esm/pipeline/pipeline-builder.js
  function createPipeline(stages, options = {}) {
    return new PipelineOrchestrator({
      config: {
        stages,
        middleware: options.middleware,
        options: options.pipelineOptions,
        metrics: options.metrics
      },
      httpConfig: options.httpConfig,
      sharedData: options.sharedData
    });
  }
  var PipelineBuilder = class {
    constructor() {
      this.stages = [];
    }
    /**
     * Add a regular (sequential) stage.
     * `prev` in this stage is typed as the result of the previous `.step()` (or `undefined` for the first).
     * The `TOutput` type is usually inferred automatically from the return value of `request`/`after`.
     */
    step(stage) {
      this.stages.push(stage);
      return this;
    }
    /**
     * Add a group of parallel stages.
     * All stages in the group run simultaneously via Promise.all (or through a pool
     * if `concurrency` is set).
     */
    parallel(stages, options) {
      var _a;
      const group = {
        key: (_a = options === null || options === void 0 ? void 0 : options.key) !== null && _a !== void 0 ? _a : `parallel-${this.stages.length}`,
        parallel: stages,
        ...(options === null || options === void 0 ? void 0 : options.continueOnError) !== void 0 ? { continueOnError: options.continueOnError } : {},
        ...(options === null || options === void 0 ? void 0 : options.concurrency) !== void 0 ? { concurrency: options.concurrency } : {}
      };
      this.stages.push(group);
      return this;
    }
    /**
     * Add a nested pipeline as a stage.
     */
    subPipeline(item) {
      this.stages.push(item);
      return this;
    }
    /**
     * Add a stream stage (SSE / AsyncIterable).
     */
    stream(stage) {
      this.stages.push(stage);
      return this;
    }
    /**
     * Add a WebSocket stage.
     */
    websocket(stage) {
      this.stages.push(stage);
      return this;
    }
    /**
     * Create a PipelineOrchestrator from the accumulated stages.
     */
    build(options = {}) {
      return createPipeline([...this.stages], options);
    }
    /**
     * Get just the config (without creating an orchestrator).
     * Useful for passing the config somewhere else.
     */
    toConfig(options = {}) {
      return {
        stages: [...this.stages],
        middleware: options.middleware,
        options: options.pipelineOptions,
        metrics: options.metrics
      };
    }
  };
  function pipe() {
    return new PipelineBuilder();
  }

  // dist/esm/pipeline/pipeline-validator.js
  function validatePipelineConfig(config, context = "root") {
    const errors = [];
    if (!config || typeof config !== "object") {
      return { valid: false, errors: [`[${context}] config must be an object`] };
    }
    if (!Array.isArray(config.stages)) {
      errors.push(`[${context}] config.stages must be an array`);
      return { valid: false, errors };
    }
    if (config.stages.length === 0) {
      errors.push(`[${context}] config.stages must not be empty`);
    }
    const allKeys = collectAllKeys(config.stages, context, errors);
    checkDuplicateKeys(allKeys, context, errors);
    return { valid: errors.length === 0, errors };
  }
  function collectAllKeys(stages, context, errors) {
    const keys = [];
    for (const item of stages) {
      if (isParallelGroup(item)) {
        validateKey(item.key, `${context} > parallel group`, errors);
        if (isValidKey(item.key))
          keys.push(item.key);
        if (!Array.isArray(item.parallel) || item.parallel.length === 0) {
          errors.push(`[${context}] parallel group "${item.key}" must have at least one stage`);
        } else {
          const subKeys = collectAllKeys(item.parallel, `${context} > ${item.key}`, errors);
          keys.push(...subKeys);
        }
      } else if (isSubPipeline(item)) {
        validateKey(item.key, `${context} > subPipeline`, errors);
        if (isValidKey(item.key))
          keys.push(item.key);
        const subResult = validatePipelineConfig(item.subPipeline, `${context} > subPipeline:${item.key}`);
        errors.push(...subResult.errors);
      } else if (isStreamStage(item)) {
        validateKey(item.key, `${context} > stream`, errors);
        if (isValidKey(item.key))
          keys.push(item.key);
        if (typeof item.stream !== "function") {
          errors.push(`[${context}] stream stage "${item.key}": stream must be a function`);
        }
      } else if (isWebSocketStage(item)) {
        validateKey(item.key, `${context} > websocket`, errors);
        if (isValidKey(item.key))
          keys.push(item.key);
        if (item.url === void 0 || typeof item.url !== "string" && typeof item.url !== "function") {
          errors.push(`[${context}] websocket stage "${item.key}": url must be a string or function`);
        }
        if (typeof item.onMessage !== "function") {
          errors.push(`[${context}] websocket stage "${item.key}": onMessage must be a function`);
        }
        if (item.timeoutMs !== void 0 && (typeof item.timeoutMs !== "number" || item.timeoutMs <= 0)) {
          errors.push(`[${context}] websocket stage "${item.key}": timeoutMs must be a positive number`);
        }
      } else {
        const stage = item;
        validateKey(stage.key, context, errors);
        if (isValidKey(stage.key))
          keys.push(stage.key);
        if (stage.request !== void 0 && typeof stage.request !== "function") {
          errors.push(`[${context}] stage "${stage.key}": request must be a function`);
        }
        if (stage.condition !== void 0 && typeof stage.condition !== "function") {
          errors.push(`[${context}] stage "${stage.key}": condition must be a function`);
        }
        if (stage.retryCount !== void 0 && (typeof stage.retryCount !== "number" || stage.retryCount < 0)) {
          errors.push(`[${context}] stage "${stage.key}": retryCount must be a non-negative number`);
        }
        if (stage.timeoutMs !== void 0 && (typeof stage.timeoutMs !== "number" || stage.timeoutMs <= 0)) {
          errors.push(`[${context}] stage "${stage.key}": timeoutMs must be a positive number`);
        }
      }
    }
    return keys;
  }
  function isValidKey(key) {
    return typeof key === "string" && key.trim() !== "";
  }
  function validateKey(key, context, errors) {
    if (typeof key !== "string" || key.trim() === "") {
      errors.push(`[${context}] stage key must be a non-empty string (got: ${JSON.stringify(key)})`);
    }
  }
  function checkDuplicateKeys(keys, context, errors) {
    const seen = /* @__PURE__ */ new Set();
    for (const key of keys) {
      if (seen.has(key)) {
        errors.push(`[${context}] duplicate stage key: "${key}"`);
      }
      seen.add(key);
    }
  }

  // dist/esm/pagination.js
  function isOffsetOptions(options) {
    return options.strategy === "offset";
  }
  async function* paginate(options) {
    var _a, _b, _c;
    if (isOffsetOptions(options)) {
      let offset = (_a = options.startOffset) !== null && _a !== void 0 ? _a : 0;
      while (true) {
        if ((_b = options.signal) === null || _b === void 0 ? void 0 : _b.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const { items, total } = await options.fetchPage(offset, options.limit, options.signal);
        if (items.length > 0)
          yield items;
        offset += items.length;
        if (items.length === 0)
          return;
        if (typeof total === "number" && offset >= total)
          return;
        if (items.length < options.limit)
          return;
      }
    } else {
      let cursor;
      while (true) {
        if ((_c = options.signal) === null || _c === void 0 ? void 0 : _c.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const { items, nextCursor } = await options.fetchPage(cursor, options.signal);
        if (items.length > 0)
          yield items;
        if (nextCursor === void 0 || nextCursor === null)
          return;
        cursor = nextCursor;
      }
    }
  }
  async function paginateAll(options) {
    const all3 = [];
    for await (const page of paginate(options)) {
      all3.push(...page);
    }
    return all3;
  }
  async function* flattenPages(pages) {
    for await (const page of pages) {
      for (const item of page) {
        yield item;
      }
    }
  }
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=rest-pipeline.umd.js.map
