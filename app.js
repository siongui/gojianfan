"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = this;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $flushConsole = function() {};
var $throwRuntimeError; /* set by package "runtime" */
var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $call = function(fn, rcvr, args) { return fn.apply(rcvr, args); };
var $makeFunc = function(fn) { return function() { return $externalize(fn(this, new ($sliceType($jsObjectPtr))($global.Array.prototype.slice.call(arguments, []))), $emptyInterface); }; };
var $unused = function(v) {};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(typ, name) {
  var method = typ.prototype[name];
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        if (typ.wrapped) {
          arguments[0] = new typ(arguments[0]);
        }
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $ifaceMethodExprs = {};
var $ifaceMethodExpr = function(name) {
  var expr = $ifaceMethodExprs["$" + name];
  if (expr === undefined) {
    expr = $ifaceMethodExprs["$" + name] = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(arguments[0][name], arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return expr;
};

var $subslice = function(slice, low, high, max) {
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = slice.$length - low;
  s.$capacity = slice.$capacity - low;
  if (high !== undefined) {
    s.$length = high - low;
  }
  if (max !== undefined) {
    s.$capacity = max - low;
  }
  return s;
};

var $substring = function(str, low, high) {
  if (low < 0 || high < low || high > str.length) {
    $throwRuntimeError("slice bounds out of range");
  }
  return str.substring(low, high);
};

var $sliceToArray = function(slice) {
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(undefined, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $copyArray(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copyArray = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        elem.copy(dst[dstOffset + i], src[srcOffset + i]);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      elem.copy(dst[dstOffset + i], src[srcOffset + i]);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  type.copy(clone, src);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; }
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  if (toAppend.constructor === String) {
    var bytes = $stringToBytes(toAppend);
    return $internalAppend(slice, bytes, 0, bytes.length);
  }
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $copyArray(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (type === $jsObjectPtr) {
    return a === b;
  }
  switch (type.kind) {
  case $kindComplex64:
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindArray:
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.typ)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === $jsObjectPtr) {
    return a.object === b.object;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $froundBuf = new Float32Array(1);
var $fround = Math.fround || function(f) {
  $froundBuf[0] = f;
  return $froundBuf[0];
};

var $imul = Math.imul || function(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) >> 0);
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === Infinity || n.$real === -Infinity || n.$imag === Infinity || n.$imag === -Infinity;
  var dinf = d.$real === Infinity || d.$real === -Infinity || d.$imag === Infinity || d.$imag === -Infinity;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(NaN, NaN);
  }
  if (ninf && !dinf) {
    return new n.constructor(Infinity, Infinity);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(NaN, NaN);
    }
    return new n.constructor(Infinity, Infinity);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $methodSynthesizers = [];
var $addMethodSynthesizer = function(f) {
  if ($methodSynthesizers === null) {
    f();
    return;
  }
  $methodSynthesizers.push(f);
};
var $synthesizeMethods = function() {
  $methodSynthesizers.forEach(function(f) { f(); });
  $methodSynthesizers = null;
};

var $ifaceKeyFor = function(x) {
  if (x === $ifaceNil) {
    return 'nil';
  }
  var c = x.constructor;
  return c.string + '$' + c.keyFor(x.$val);
};

var $identity = function(x) { return x; };

var $typeIDCounter = 0;

var $idKey = function(x) {
  if (x.$id === undefined) {
    $idCounter++;
    x.$id = $idCounter;
  }
  return String(x.$id);
};

var $newType = function(size, kind, string, named, pkg, exported, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $identity;
    break;

  case $kindString:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return "$" + x; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return $floatKey(x); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindComplex64:
    typ = function(real, imag) {
      this.$real = $fround(real);
      this.$imag = $fround(imag);
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", false, function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { typ.copy(this, v); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.keyFor = function(x) {
        return Array.prototype.join.call($mapArray(x, function(e) {
          return String(elem.keyFor(e)).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.copy = function(dst, src) {
        $copyArray(dst, src, 0, 0, src.length, elem);
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $idKey;
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.keyFor = $ifaceKeyFor;
    typ.init = function(methods) {
      typ.methods = methods;
      methods.forEach(function(m) {
        $ifaceNil[m.prop] = $throwNilPointerError;
      });
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.keyFor = $idKey;
    typ.init = function(elem) {
      typ.elem = elem;
      typ.wrapped = (elem.kind === $kindArray);
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", exported, constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { typ.copy(this, v); };
    typ.init = function(pkgPath, fields) {
      typ.pkgPath = pkgPath;
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.typ.comparable) {
          typ.comparable = false;
        }
      });
      typ.keyFor = function(x) {
        var val = x.$val;
        return $mapArray(fields, function(f) {
          return String(f.typ.keyFor(val[f.prop])).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      typ.copy = function(dst, src) {
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          switch (f.typ.kind) {
          case $kindArray:
          case $kindStruct:
            f.typ.copy(dst[f.prop], src[f.prop]);
            continue;
          default:
            dst[f.prop] = src[f.prop];
            continue;
          }
        }
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      $addMethodSynthesizer(function() {
        var synthesizeMethod = function(target, m, f) {
          if (target.prototype[m.prop] !== undefined) { return; }
          target.prototype[m.prop] = function() {
            var v = this.$val[f.prop];
            if (f.typ === $jsObjectPtr) {
              v = new $jsObjectPtr(v);
            }
            if (v.$val === undefined) {
              v = new f.typ(v);
            }
            return v[m.prop].apply(v, arguments);
          };
        };
        fields.forEach(function(f) {
          if (f.name === "") {
            $methodSet(f.typ).forEach(function(m) {
              synthesizeMethod(typ, m, f);
              synthesizeMethod(typ.ptr, m, f);
            });
            $methodSet($ptrType(f.typ)).forEach(function(m) {
              synthesizeMethod(typ.ptr, m, f);
            });
          }
        });
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindChan:
    typ.zero = function() { return $chanNil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.id = $typeIDCounter;
  $typeIDCounter++;
  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.named = named;
  typ.pkg = pkg;
  typ.exported = exported;
  typ.methods = [];
  typ.methodSetCache = null;
  typ.comparable = true;
  return typ;
};

var $methodSet = function(typ) {
  if (typ.methodSetCache !== null) {
    return typ.methodSetCache;
  }
  var base = {};

  var isPtr = (typ.kind === $kindPtr);
  if (isPtr && typ.elem.kind === $kindInterface) {
    typ.methodSetCache = [];
    return [];
  }

  var current = [{typ: isPtr ? typ.elem : typ, indirect: isPtr}];

  var seen = {};

  while (current.length > 0) {
    var next = [];
    var mset = [];

    current.forEach(function(e) {
      if (seen[e.typ.string]) {
        return;
      }
      seen[e.typ.string] = true;

      if (e.typ.named) {
        mset = mset.concat(e.typ.methods);
        if (e.indirect) {
          mset = mset.concat($ptrType(e.typ).methods);
        }
      }

      switch (e.typ.kind) {
      case $kindStruct:
        e.typ.fields.forEach(function(f) {
          if (f.name === "") {
            var fTyp = f.typ;
            var fIsPtr = (fTyp.kind === $kindPtr);
            next.push({typ: fIsPtr ? fTyp.elem : fTyp, indirect: e.indirect || fIsPtr});
          }
        });
        break;

      case $kindInterface:
        mset = mset.concat(e.typ.methods);
        break;
      }
    });

    mset.forEach(function(m) {
      if (base[m.name] === undefined) {
        base[m.name] = m;
      }
    });

    current = next;
  }

  typ.methodSetCache = [];
  Object.keys(base).sort().forEach(function(name) {
    typ.methodSetCache.push(base[name]);
  });
  return typ.methodSetCache;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           true, "", false, null);
var $Int           = $newType( 4, $kindInt,           "int",            true, "", false, null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           true, "", false, null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          true, "", false, null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          true, "", false, null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          true, "", false, null);
var $Uint          = $newType( 4, $kindUint,          "uint",           true, "", false, null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          true, "", false, null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         true, "", false, null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         true, "", false, null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         true, "", false, null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        true, "", false, null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        true, "", false, null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        true, "", false, null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      true, "", false, null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     true, "", false, null);
var $String        = $newType( 8, $kindString,        "string",         true, "", false, null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", true, "", false, null);

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var typeKey = elem.id + "$" + len;
  var typ = $arrayTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, "[" + len + "]" + elem.string, false, "", false, null);
    $arrayTypes[typeKey] = typ;
    typ.init(elem, len);
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, false, "", false, null);
    elem[field] = typ;
    typ.init(elem, sendOnly, recvOnly);
  }
  return typ;
};
var $Chan = function(elem, capacity) {
  if (capacity < 0 || capacity > 2147483647) {
    $throwRuntimeError("makechan: size out of range");
  }
  this.$elem = elem;
  this.$capacity = capacity;
  this.$buffer = [];
  this.$sendQueue = [];
  this.$recvQueue = [];
  this.$closed = false;
};
var $chanNil = new $Chan(null, 0);
$chanNil.$sendQueue = $chanNil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var typeKey = $mapArray(params, function(p) { return p.id; }).join(",") + "$" + $mapArray(results, function(r) { return r.id; }).join(",") + "$" + variadic;
  var typ = $funcTypes[typeKey];
  if (typ === undefined) {
    var paramTypes = $mapArray(params, function(p) { return p.string; });
    if (variadic) {
      paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
    }
    var string = "func(" + paramTypes.join(", ") + ")";
    if (results.length === 1) {
      string += " " + results[0].string;
    } else if (results.length > 1) {
      string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
    }
    typ = $newType(4, $kindFunc, string, false, "", false, null);
    $funcTypes[typeKey] = typ;
    typ.init(params, results, variadic);
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var typeKey = $mapArray(methods, function(m) { return m.pkg + "," + m.name + "," + m.typ.id; }).join("$");
  var typ = $interfaceTypes[typeKey];
  if (typ === undefined) {
    var string = "interface {}";
    if (methods.length !== 0) {
      string = "interface { " + $mapArray(methods, function(m) {
        return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substr(4);
      }).join("; ") + " }";
    }
    typ = $newType(8, $kindInterface, string, false, "", false, null);
    $interfaceTypes[typeKey] = typ;
    typ.init(methods);
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = {};
var $error = $newType(8, $kindInterface, "error", true, "", false, null);
$error.init([{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}]);

var $mapTypes = {};
var $mapType = function(key, elem) {
  var typeKey = key.id + "$" + elem.id;
  var typ = $mapTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, "map[" + key.string + "]" + elem.string, false, "", false, null);
    $mapTypes[typeKey] = typ;
    typ.init(key, elem);
  }
  return typ;
};
var $makeMap = function(keyForFunc, entries) {
  var m = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    m[keyForFunc(e.k)] = e;
  }
  return m;
};

var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, false, "", elem.exported, null);
    elem.ptr = typ;
    typ.init(elem);
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $indexPtr = function(array, index, constructor) {
  array.$ptr = array.$ptr || {};
  return array.$ptr[index] || (array.$ptr[index] = new constructor(function() { return array[index]; }, function(v) { array[index] = v; }));
};

var $sliceType = function(elem) {
  var typ = elem.slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, false, "", false, null);
    elem.slice = typ;
    typ.init(elem);
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  if (length < 0 || length > 2147483647) {
    $throwRuntimeError("makeslice: len out of range");
  }
  if (capacity < 0 || capacity < length || capacity > 2147483647) {
    $throwRuntimeError("makeslice: cap out of range");
  }
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(pkgPath, fields) {
  var typeKey = $mapArray(fields, function(f) { return f.name + "," + f.typ.id + "," + f.tag; }).join("$");
  var typ = $structTypes[typeKey];
  if (typ === undefined) {
    var string = "struct { " + $mapArray(fields, function(f) {
      return f.name + " " + f.typ.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
    }).join("; ") + " }";
    if (fields.length === 0) {
      string = "struct {}";
    }
    typ = $newType(0, $kindStruct, string, false, "", false, function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.typ.zero();
      }
    });
    $structTypes[typeKey] = typ;
    typ.init(pkgPath, fields);
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethodSet = $methodSet(value.constructor);
      var interfaceMethods = type.methods;
      for (var i = 0; i < interfaceMethods.length; i++) {
        var tm = interfaceMethods[i];
        var found = false;
        for (var j = 0; j < valueMethodSet.length; j++) {
          var vm = valueMethodSet[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.typ === tm.typ) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $jsObjectPtr) {
    value = value.object;
  }
  return returnTuple ? [value, true] : value;
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr, fromPanic) {
  if (!fromPanic && deferred !== null && deferred.index >= $curGoroutine.deferStack.length) {
    throw jsErr;
  }
  if (jsErr !== null) {
    var newErr = null;
    try {
      $curGoroutine.deferStack.push(deferred);
      $panic(new $jsErrorPtr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $curGoroutine.deferStack.pop();
    $callDeferred(deferred, newErr);
    return;
  }
  if ($curGoroutine.asleep) {
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  try {
    while (true) {
      if (deferred === null) {
        deferred = $curGoroutine.deferStack[$curGoroutine.deferStack.length - 1];
        if (deferred === undefined) {
          /* The panic reached the top of the stack. Clear it and throw it as a JavaScript error. */
          $panicStackDepth = null;
          if (localPanicValue.Object instanceof Error) {
            throw localPanicValue.Object;
          }
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          throw new Error(msg);
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        $curGoroutine.deferStack.pop();
        if (localPanicValue !== undefined) {
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(call[2], call[1]);
      if (r && r.$blk !== undefined) {
        deferred.push([r.$blk, [], r]);
        if (fromPanic) {
          throw null;
        }
        return;
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null, true);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };

var $noGoroutine = { asleep: false, exit: false, deferStack: [], panicStack: [] };
var $curGoroutine = $noGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $mainFinished = false;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  var $goroutine = function() {
    try {
      $curGoroutine = $goroutine;
      var r = fun.apply(undefined, args);
      if (r && r.$blk !== undefined) {
        fun = function() { return r.$blk(); };
        args = [];
        return;
      }
      $goroutine.exit = true;
    } catch (err) {
      if (!$goroutine.exit) {
        throw err;
      }
    } finally {
      $curGoroutine = $noGoroutine;
      if ($goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        $goroutine.asleep = true;
      }
      if ($goroutine.asleep) {
        $awakeGoroutines--;
        if (!$mainFinished && $awakeGoroutines === 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
          if ($global.process !== undefined) {
            $global.process.exit(2);
          }
        }
      }
    }
  };
  $goroutine.asleep = false;
  $goroutine.exit = false;
  $goroutine.deferStack = [];
  $goroutine.panicStack = [];
  $schedule($goroutine);
};

var $scheduled = [];
var $runScheduled = function() {
  try {
    var r;
    while ((r = $scheduled.shift()) !== undefined) {
      r();
    }
  } finally {
    if ($scheduled.length > 0) {
      setTimeout($runScheduled, 0);
    }
  }
};

var $schedule = function(goroutine) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }
  $scheduled.push(goroutine);
  if ($curGoroutine === $noGoroutine) {
    $runScheduled();
  }
};

var $setTimeout = function(f, t) {
  $awakeGoroutines++;
  return setTimeout(function() {
    $awakeGoroutines--;
    f();
  }, t);
};

var $block = function() {
  if ($curGoroutine === $noGoroutine) {
    $throwRuntimeError("cannot block in JavaScript callback, fix by wrapping code in goroutine");
  }
  $curGoroutine.asleep = true;
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  var closedDuringSend;
  chan.$sendQueue.push(function(closed) {
    closedDuringSend = closed;
    $schedule(thisGoroutine);
    return value;
  });
  $block();
  return {
    $blk: function() {
      if (closedDuringSend) {
        $throwRuntimeError("send on closed channel");
      }
    }
  };
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend(false));
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.$elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.value; } };
  var queueEntry = function(v) {
    f.value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  $block();
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(true); /* will panic */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.$elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.selection; } };
  var removeFromQueues = function() {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          f.selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          f.selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  $block();
  return f;
};

var $jsObjectPtr, $jsErrorPtr;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    default:
      return t !== $jsObjectPtr;
  }
};

var $externalize = function(v, t) {
  if (t === $jsObjectPtr) {
    return v;
  }
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    return $externalizeFunction(v, t, false);
  case $kindInterface:
    if (v === $ifaceNil) {
      return null;
    }
    if (v.constructor === $jsObjectPtr) {
      return v.$val.object;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    if (v === t.nil) {
      return null;
    }
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      var c = r[0];
      if (c > 0xFFFF) {
        var h = Math.floor((c - 0x10000) / 0x400) + 0xD800;
        var l = (c - 0x10000) % 0x400 + 0xDC00;
        s += String.fromCharCode(h, l);
        continue;
      }
      s += String.fromCharCode(c);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg !== undefined && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var noJsObject = {};
    var searchJsObject = function(v, t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      switch (t.kind) {
      case $kindPtr:
        if (v === t.nil) {
          return noJsObject;
        }
        return searchJsObject(v.$get(), t.elem);
      case $kindStruct:
        var f = t.fields[0];
        return searchJsObject(v[f.prop], f.typ);
      case $kindInterface:
        return searchJsObject(v.$val, v.constructor);
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(v, t);
    if (o !== noJsObject) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (!f.exported) {
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.typ);
    }
    return o;
  }
  $throwRuntimeError("cannot externalize " + t.string);
};

var $externalizeFunction = function(v, t, passThis) {
  if (v === $throwNilPointerError) {
    return null;
  }
  if (v.$externalizeWrapper === undefined) {
    $checkForDeadlock = false;
    v.$externalizeWrapper = function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = [];
          for (var j = i; j < arguments.length; j++) {
            varargs.push($internalize(arguments[j], vt));
          }
          args.push(new (t.params[i])(varargs));
          break;
        }
        args.push($internalize(arguments[i], t.params[i]));
      }
      var canBlock = $curGoroutine.canBlock;
      $curGoroutine.canBlock = false;
      try {
        var result = v.apply(passThis ? this : undefined, args);
      } finally {
        $curGoroutine.canBlock = canBlock;
      }
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $externalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $externalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  }
  return v.$externalizeWrapper;
};

var $internalize = function(v, t, recv) {
  if (t === $jsObjectPtr) {
    return v;
  }
  if (t === $jsObjectPtr.elem) {
    $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
  }
  if (v && v.__internal_object__ !== undefined) {
    return $assertType(v.__internal_object__, t, false);
  }
  var timePkg = $packages["time"];
  if (timePkg !== undefined && t === timePkg.Time) {
    if (!(v !== null && v !== undefined && v.constructor === Date)) {
      $throwRuntimeError("cannot internalize time.Time from " + typeof v + ", must be Date");
    }
    return timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000));
  }
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t.methods.length !== 0) {
      $throwRuntimeError("cannot internalize " + t.string);
    }
    if (v === null) {
      return $ifaceNil;
    }
    if (v === undefined) {
      return new $jsObjectPtr(undefined);
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      if (timePkg === undefined) {
        /* time package is not present, internalize as &js.Object{Date} so it can be externalized into original Date. */
        return new $jsObjectPtr(v);
      }
      return new timePkg.Time($internalize(v, timePkg.Time));
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$jsObjectPtr], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $jsObjectPtr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = $internalize(keys[i], t.key);
      m[t.key.keyFor(k)] = { k: k, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "";
    var i = 0;
    while (i < v.length) {
      var h = v.charCodeAt(i);
      if (0xD800 <= h && h <= 0xDBFF) {
        var l = v.charCodeAt(i + 1);
        var c = (h - 0xD800) * 0x400 + l - 0xDC00 + 0x10000;
        s += $encodeRune(c);
        i += 2;
        continue;
      }
      s += $encodeRune(h);
      i++;
    }
    return s;
  case $kindStruct:
    var noJsObject = {};
    var searchJsObject = function(t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      if (t === $jsObjectPtr.elem) {
        $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
      }
      switch (t.kind) {
      case $kindPtr:
        return searchJsObject(t.elem);
      case $kindStruct:
        var f = t.fields[0];
        var o = searchJsObject(f.typ);
        if (o !== noJsObject) {
          var n = new t.ptr();
          n[f.prop] = o;
          return n;
        }
        return noJsObject;
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(t);
    if (o !== noJsObject) {
      return o;
    }
  }
  $throwRuntimeError("cannot internalize " + t.string);
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(0, $kindStruct, "js.Object", true, "github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", true, "github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	sliceType = $sliceType($emptyInterface);
	ptrType = $ptrType(Object);
	ptrType$1 = $ptrType(Error);
	Object.ptr.prototype.Get = function(key) {
		var $ptr, key, o;
		o = this;
		return o.object[$externalize(key, $String)];
	};
	Object.prototype.Get = function(key) { return this.$val.Get(key); };
	Object.ptr.prototype.Set = function(key, value) {
		var $ptr, key, o, value;
		o = this;
		o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	Object.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	Object.ptr.prototype.Delete = function(key) {
		var $ptr, key, o;
		o = this;
		delete o.object[$externalize(key, $String)];
	};
	Object.prototype.Delete = function(key) { return this.$val.Delete(key); };
	Object.ptr.prototype.Length = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object.length);
	};
	Object.prototype.Length = function() { return this.$val.Length(); };
	Object.ptr.prototype.Index = function(i) {
		var $ptr, i, o;
		o = this;
		return o.object[i];
	};
	Object.prototype.Index = function(i) { return this.$val.Index(i); };
	Object.ptr.prototype.SetIndex = function(i, value) {
		var $ptr, i, o, value;
		o = this;
		o.object[i] = $externalize(value, $emptyInterface);
	};
	Object.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	Object.ptr.prototype.Call = function(name, args) {
		var $ptr, args, name, o, obj;
		o = this;
		return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
	};
	Object.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	Object.ptr.prototype.Invoke = function(args) {
		var $ptr, args, o;
		o = this;
		return o.object.apply(undefined, $externalize(args, sliceType));
	};
	Object.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	Object.ptr.prototype.New = function(args) {
		var $ptr, args, o;
		o = this;
		return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
	};
	Object.prototype.New = function(args) { return this.$val.New(args); };
	Object.ptr.prototype.Bool = function() {
		var $ptr, o;
		o = this;
		return !!(o.object);
	};
	Object.prototype.Bool = function() { return this.$val.Bool(); };
	Object.ptr.prototype.String = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $String);
	};
	Object.prototype.String = function() { return this.$val.String(); };
	Object.ptr.prototype.Int = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object) >> 0;
	};
	Object.prototype.Int = function() { return this.$val.Int(); };
	Object.ptr.prototype.Int64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Int64);
	};
	Object.prototype.Int64 = function() { return this.$val.Int64(); };
	Object.ptr.prototype.Uint64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Uint64);
	};
	Object.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Object.ptr.prototype.Float = function() {
		var $ptr, o;
		o = this;
		return $parseFloat(o.object);
	};
	Object.prototype.Float = function() { return this.$val.Float(); };
	Object.ptr.prototype.Interface = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $emptyInterface);
	};
	Object.prototype.Interface = function() { return this.$val.Interface(); };
	Object.ptr.prototype.Unsafe = function() {
		var $ptr, o;
		o = this;
		return o.object;
	};
	Object.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var $ptr, err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var $ptr, err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var $ptr, e;
		e = new Error.ptr(null);
		$unused(e);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "", exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime/internal/sys"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, $init, js, sys, TypeAssertionError, errorString, ptrType$3, init;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	sys = $packages["runtime/internal/sys"];
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.interfaceString = "";
			this.concreteString = "";
			this.assertedString = "";
			this.missingMethod = "";
			return;
		}
		this.interfaceString = interfaceString_;
		this.concreteString = concreteString_;
		this.assertedString = assertedString_;
		this.missingMethod = missingMethod_;
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	ptrType$3 = $ptrType(TypeAssertionError);
	init = function() {
		var $ptr, e, jsPkg;
		jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$jsObjectPtr = jsPkg.Object.ptr;
		$jsErrorPtr = jsPkg.Error.ptr;
		$throwRuntimeError = (function(msg) {
			var $ptr, msg;
			$panic(new errorString(msg));
		});
		e = $ifaceNil;
		e = new TypeAssertionError.ptr("", "", "", "");
		$unused(e);
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
		var $ptr;
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var $ptr, e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var $ptr, e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var $ptr, e;
		e = this.$val;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType$3.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	TypeAssertionError.init("runtime", [{prop: "interfaceString", name: "interfaceString", exported: false, typ: $String, tag: ""}, {prop: "concreteString", name: "concreteString", exported: false, typ: $String, tag: ""}, {prop: "assertedString", name: "assertedString", exported: false, typ: $String, tag: ""}, {prop: "missingMethod", name: "missingMethod", exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sys.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/siongui/godom"] = (function() {
	var $pkg = {}, $init, js, CSSStyleDeclaration, Object, DOMRect, Event, DOMTokenList, ptrType, sliceType, funcType, ptrType$1, ptrType$2, ptrType$3, ptrType$4, sliceType$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	CSSStyleDeclaration = $pkg.CSSStyleDeclaration = $newType(0, $kindStruct, "godom.CSSStyleDeclaration", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	Object = $pkg.Object = $newType(0, $kindStruct, "godom.Object", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	DOMRect = $pkg.DOMRect = $newType(0, $kindStruct, "godom.DOMRect", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	Event = $pkg.Event = $newType(0, $kindStruct, "godom.Event", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	DOMTokenList = $pkg.DOMTokenList = $newType(0, $kindStruct, "godom.DOMTokenList", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	ptrType = $ptrType(Object);
	sliceType = $sliceType(ptrType);
	funcType = $funcType([Event], [], false);
	ptrType$1 = $ptrType(CSSStyleDeclaration);
	ptrType$2 = $ptrType(js.Object);
	ptrType$3 = $ptrType(DOMTokenList);
	ptrType$4 = $ptrType(DOMRect);
	sliceType$1 = $sliceType($emptyInterface);
	CSSStyleDeclaration.ptr.prototype.CssText = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.cssText, $String);
	};
	CSSStyleDeclaration.prototype.CssText = function() { return this.$val.CssText(); };
	CSSStyleDeclaration.ptr.prototype.Length = function() {
		var $ptr, s;
		s = this;
		return $parseInt(s.Object.length) >> 0;
	};
	CSSStyleDeclaration.prototype.Length = function() { return this.$val.Length(); };
	CSSStyleDeclaration.ptr.prototype.AlignContent = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.alignContent, $String);
	};
	CSSStyleDeclaration.prototype.AlignContent = function() { return this.$val.AlignContent(); };
	CSSStyleDeclaration.ptr.prototype.SetAlignContent = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.alignContent = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAlignContent = function(v) { return this.$val.SetAlignContent(v); };
	CSSStyleDeclaration.ptr.prototype.AlignItems = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.alignItems, $String);
	};
	CSSStyleDeclaration.prototype.AlignItems = function() { return this.$val.AlignItems(); };
	CSSStyleDeclaration.ptr.prototype.SetAlignItems = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.alignItems = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAlignItems = function(v) { return this.$val.SetAlignItems(v); };
	CSSStyleDeclaration.ptr.prototype.AlignSelf = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.alignSelf, $String);
	};
	CSSStyleDeclaration.prototype.AlignSelf = function() { return this.$val.AlignSelf(); };
	CSSStyleDeclaration.ptr.prototype.SetAlignSelf = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.alignSelf = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAlignSelf = function(v) { return this.$val.SetAlignSelf(v); };
	CSSStyleDeclaration.ptr.prototype.Animation = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animation, $String);
	};
	CSSStyleDeclaration.prototype.Animation = function() { return this.$val.Animation(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimation = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animation = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimation = function(v) { return this.$val.SetAnimation(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationDelay = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationDelay, $String);
	};
	CSSStyleDeclaration.prototype.AnimationDelay = function() { return this.$val.AnimationDelay(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationDelay = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationDelay = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationDelay = function(v) { return this.$val.SetAnimationDelay(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationDirection = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationDirection, $String);
	};
	CSSStyleDeclaration.prototype.AnimationDirection = function() { return this.$val.AnimationDirection(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationDirection = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationDirection = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationDirection = function(v) { return this.$val.SetAnimationDirection(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationDuration = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationDuration, $String);
	};
	CSSStyleDeclaration.prototype.AnimationDuration = function() { return this.$val.AnimationDuration(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationDuration = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationDuration = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationDuration = function(v) { return this.$val.SetAnimationDuration(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationFillMode = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationFillMode, $String);
	};
	CSSStyleDeclaration.prototype.AnimationFillMode = function() { return this.$val.AnimationFillMode(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationFillMode = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationFillMode = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationFillMode = function(v) { return this.$val.SetAnimationFillMode(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationIterationCount = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationIterationCount, $String);
	};
	CSSStyleDeclaration.prototype.AnimationIterationCount = function() { return this.$val.AnimationIterationCount(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationIterationCount = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationIterationCount = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationIterationCount = function(v) { return this.$val.SetAnimationIterationCount(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationName = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationName, $String);
	};
	CSSStyleDeclaration.prototype.AnimationName = function() { return this.$val.AnimationName(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationName = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationName = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationName = function(v) { return this.$val.SetAnimationName(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationTimingFunction = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationTimingFunction, $String);
	};
	CSSStyleDeclaration.prototype.AnimationTimingFunction = function() { return this.$val.AnimationTimingFunction(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationTimingFunction = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationTimingFunction = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationTimingFunction = function(v) { return this.$val.SetAnimationTimingFunction(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationPlayState = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.animationPlayState, $String);
	};
	CSSStyleDeclaration.prototype.AnimationPlayState = function() { return this.$val.AnimationPlayState(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationPlayState = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.animationPlayState = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationPlayState = function(v) { return this.$val.SetAnimationPlayState(v); };
	CSSStyleDeclaration.ptr.prototype.Background = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.background, $String);
	};
	CSSStyleDeclaration.prototype.Background = function() { return this.$val.Background(); };
	CSSStyleDeclaration.ptr.prototype.SetBackground = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.background = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackground = function(v) { return this.$val.SetBackground(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundAttachment = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundAttachment, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundAttachment = function() { return this.$val.BackgroundAttachment(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundAttachment = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundAttachment = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundAttachment = function(v) { return this.$val.SetBackgroundAttachment(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundColor, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundColor = function() { return this.$val.BackgroundColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundColor = function(v) { return this.$val.SetBackgroundColor(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundImage = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundImage, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundImage = function() { return this.$val.BackgroundImage(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundImage = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundImage = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundImage = function(v) { return this.$val.SetBackgroundImage(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundPosition = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundPosition, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundPosition = function() { return this.$val.BackgroundPosition(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundPosition = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundPosition = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundPosition = function(v) { return this.$val.SetBackgroundPosition(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundRepeat = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundRepeat, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundRepeat = function() { return this.$val.BackgroundRepeat(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundRepeat = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundRepeat = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundRepeat = function(v) { return this.$val.SetBackgroundRepeat(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundClip = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundClip, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundClip = function() { return this.$val.BackgroundClip(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundClip = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundClip = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundClip = function(v) { return this.$val.SetBackgroundClip(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundOrigin = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundOrigin, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundOrigin = function() { return this.$val.BackgroundOrigin(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundOrigin = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundOrigin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundOrigin = function(v) { return this.$val.SetBackgroundOrigin(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundSize = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backgroundSize, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundSize = function() { return this.$val.BackgroundSize(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundSize = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backgroundSize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundSize = function(v) { return this.$val.SetBackgroundSize(v); };
	CSSStyleDeclaration.ptr.prototype.BackfaceVisibility = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.backfaceVisibility, $String);
	};
	CSSStyleDeclaration.prototype.BackfaceVisibility = function() { return this.$val.BackfaceVisibility(); };
	CSSStyleDeclaration.ptr.prototype.SetBackfaceVisibility = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.backfaceVisibility = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackfaceVisibility = function(v) { return this.$val.SetBackfaceVisibility(v); };
	CSSStyleDeclaration.ptr.prototype.Border = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.border, $String);
	};
	CSSStyleDeclaration.prototype.Border = function() { return this.$val.Border(); };
	CSSStyleDeclaration.ptr.prototype.SetBorder = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.border = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorder = function(v) { return this.$val.SetBorder(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottom = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderBottom, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottom = function() { return this.$val.BorderBottom(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottom = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderBottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottom = function(v) { return this.$val.SetBorderBottom(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderBottomColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomColor = function() { return this.$val.BorderBottomColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderBottomColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomColor = function(v) { return this.$val.SetBorderBottomColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomLeftRadius = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderBottomLeftRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomLeftRadius = function() { return this.$val.BorderBottomLeftRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomLeftRadius = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderBottomLeftRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomLeftRadius = function(v) { return this.$val.SetBorderBottomLeftRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomRightRadius = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderBottomRightRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomRightRadius = function() { return this.$val.BorderBottomRightRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomRightRadius = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderBottomRightRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomRightRadius = function(v) { return this.$val.SetBorderBottomRightRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderBottomStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomStyle = function() { return this.$val.BorderBottomStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderBottomStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomStyle = function(v) { return this.$val.SetBorderBottomStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderBottomWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomWidth = function() { return this.$val.BorderBottomWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderBottomWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomWidth = function(v) { return this.$val.SetBorderBottomWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderCollapse = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderCollapse, $String);
	};
	CSSStyleDeclaration.prototype.BorderCollapse = function() { return this.$val.BorderCollapse(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderCollapse = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderCollapse = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderCollapse = function(v) { return this.$val.SetBorderCollapse(v); };
	CSSStyleDeclaration.ptr.prototype.BorderColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderColor = function() { return this.$val.BorderColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderColor = function(v) { return this.$val.SetBorderColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImage = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderImage, $String);
	};
	CSSStyleDeclaration.prototype.BorderImage = function() { return this.$val.BorderImage(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImage = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderImage = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImage = function(v) { return this.$val.SetBorderImage(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageOutset = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderImageOutset, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageOutset = function() { return this.$val.BorderImageOutset(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageOutset = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderImageOutset = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageOutset = function(v) { return this.$val.SetBorderImageOutset(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageRepeat = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderImageRepeat, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageRepeat = function() { return this.$val.BorderImageRepeat(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageRepeat = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderImageRepeat = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageRepeat = function(v) { return this.$val.SetBorderImageRepeat(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageSlice = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderImageSlice, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageSlice = function() { return this.$val.BorderImageSlice(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageSlice = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderImageSlice = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageSlice = function(v) { return this.$val.SetBorderImageSlice(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageSource = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderImageSource, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageSource = function() { return this.$val.BorderImageSource(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageSource = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderImageSource = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageSource = function(v) { return this.$val.SetBorderImageSource(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderImageWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageWidth = function() { return this.$val.BorderImageWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderImageWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageWidth = function(v) { return this.$val.SetBorderImageWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeft = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderLeft, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeft = function() { return this.$val.BorderLeft(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeft = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderLeft = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeft = function(v) { return this.$val.SetBorderLeft(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeftColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderLeftColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeftColor = function() { return this.$val.BorderLeftColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeftColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderLeftColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeftColor = function(v) { return this.$val.SetBorderLeftColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeftStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderLeftStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeftStyle = function() { return this.$val.BorderLeftStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeftStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderLeftStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeftStyle = function(v) { return this.$val.SetBorderLeftStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeftWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderLeftWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeftWidth = function() { return this.$val.BorderLeftWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeftWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderLeftWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeftWidth = function(v) { return this.$val.SetBorderLeftWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRadius = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderRadius = function() { return this.$val.BorderRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRadius = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRadius = function(v) { return this.$val.SetBorderRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRight = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderRight, $String);
	};
	CSSStyleDeclaration.prototype.BorderRight = function() { return this.$val.BorderRight(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderRight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRight = function(v) { return this.$val.SetBorderRight(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRightColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderRightColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderRightColor = function() { return this.$val.BorderRightColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRightColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderRightColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRightColor = function(v) { return this.$val.SetBorderRightColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRightStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderRightStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderRightStyle = function() { return this.$val.BorderRightStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRightStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderRightStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRightStyle = function(v) { return this.$val.SetBorderRightStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRightWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderRightWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderRightWidth = function() { return this.$val.BorderRightWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRightWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderRightWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRightWidth = function(v) { return this.$val.SetBorderRightWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderSpacing = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderSpacing, $String);
	};
	CSSStyleDeclaration.prototype.BorderSpacing = function() { return this.$val.BorderSpacing(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderSpacing = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderSpacing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderSpacing = function(v) { return this.$val.SetBorderSpacing(v); };
	CSSStyleDeclaration.ptr.prototype.BorderStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderStyle = function() { return this.$val.BorderStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderStyle = function(v) { return this.$val.SetBorderStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTop = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderTop, $String);
	};
	CSSStyleDeclaration.prototype.BorderTop = function() { return this.$val.BorderTop(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTop = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderTop = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTop = function(v) { return this.$val.SetBorderTop(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderTopColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopColor = function() { return this.$val.BorderTopColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderTopColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopColor = function(v) { return this.$val.SetBorderTopColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopLeftRadius = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderTopLeftRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopLeftRadius = function() { return this.$val.BorderTopLeftRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopLeftRadius = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderTopLeftRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopLeftRadius = function(v) { return this.$val.SetBorderTopLeftRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopRightRadius = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderTopRightRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopRightRadius = function() { return this.$val.BorderTopRightRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopRightRadius = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderTopRightRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopRightRadius = function(v) { return this.$val.SetBorderTopRightRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderTopStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopStyle = function() { return this.$val.BorderTopStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderTopStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopStyle = function(v) { return this.$val.SetBorderTopStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderTopWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopWidth = function() { return this.$val.BorderTopWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderTopWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopWidth = function(v) { return this.$val.SetBorderTopWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.borderWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderWidth = function() { return this.$val.BorderWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.borderWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderWidth = function(v) { return this.$val.SetBorderWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Bottom = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.bottom, $String);
	};
	CSSStyleDeclaration.prototype.Bottom = function() { return this.$val.Bottom(); };
	CSSStyleDeclaration.ptr.prototype.SetBottom = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.bottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBottom = function(v) { return this.$val.SetBottom(v); };
	CSSStyleDeclaration.ptr.prototype.BoxShadow = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.boxShadow, $String);
	};
	CSSStyleDeclaration.prototype.BoxShadow = function() { return this.$val.BoxShadow(); };
	CSSStyleDeclaration.ptr.prototype.SetBoxShadow = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.boxShadow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBoxShadow = function(v) { return this.$val.SetBoxShadow(v); };
	CSSStyleDeclaration.ptr.prototype.BoxSizing = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.boxSizing, $String);
	};
	CSSStyleDeclaration.prototype.BoxSizing = function() { return this.$val.BoxSizing(); };
	CSSStyleDeclaration.ptr.prototype.SetBoxSizing = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.boxSizing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBoxSizing = function(v) { return this.$val.SetBoxSizing(v); };
	CSSStyleDeclaration.ptr.prototype.CaptionSide = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.captionSide, $String);
	};
	CSSStyleDeclaration.prototype.CaptionSide = function() { return this.$val.CaptionSide(); };
	CSSStyleDeclaration.ptr.prototype.SetCaptionSide = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.captionSide = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCaptionSide = function(v) { return this.$val.SetCaptionSide(v); };
	CSSStyleDeclaration.ptr.prototype.Clear = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.clear, $String);
	};
	CSSStyleDeclaration.prototype.Clear = function() { return this.$val.Clear(); };
	CSSStyleDeclaration.ptr.prototype.SetClear = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.clear = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetClear = function(v) { return this.$val.SetClear(v); };
	CSSStyleDeclaration.ptr.prototype.Clip = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.clip, $String);
	};
	CSSStyleDeclaration.prototype.Clip = function() { return this.$val.Clip(); };
	CSSStyleDeclaration.ptr.prototype.SetClip = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.clip = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetClip = function(v) { return this.$val.SetClip(v); };
	CSSStyleDeclaration.ptr.prototype.Color = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.color, $String);
	};
	CSSStyleDeclaration.prototype.Color = function() { return this.$val.Color(); };
	CSSStyleDeclaration.ptr.prototype.SetColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.color = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColor = function(v) { return this.$val.SetColor(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnCount = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnCount, $String);
	};
	CSSStyleDeclaration.prototype.ColumnCount = function() { return this.$val.ColumnCount(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnCount = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnCount = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnCount = function(v) { return this.$val.SetColumnCount(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnFill = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnFill, $String);
	};
	CSSStyleDeclaration.prototype.ColumnFill = function() { return this.$val.ColumnFill(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnFill = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnFill = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnFill = function(v) { return this.$val.SetColumnFill(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnGap = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnGap, $String);
	};
	CSSStyleDeclaration.prototype.ColumnGap = function() { return this.$val.ColumnGap(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnGap = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnGap = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnGap = function(v) { return this.$val.SetColumnGap(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRule = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnRule, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRule = function() { return this.$val.ColumnRule(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRule = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnRule = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRule = function(v) { return this.$val.SetColumnRule(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRuleColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnRuleColor, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRuleColor = function() { return this.$val.ColumnRuleColor(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRuleColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnRuleColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRuleColor = function(v) { return this.$val.SetColumnRuleColor(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRuleStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnRuleStyle, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRuleStyle = function() { return this.$val.ColumnRuleStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRuleStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnRuleStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRuleStyle = function(v) { return this.$val.SetColumnRuleStyle(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRuleWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnRuleWidth, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRuleWidth = function() { return this.$val.ColumnRuleWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRuleWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnRuleWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRuleWidth = function(v) { return this.$val.SetColumnRuleWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Columns = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columns, $String);
	};
	CSSStyleDeclaration.prototype.Columns = function() { return this.$val.Columns(); };
	CSSStyleDeclaration.ptr.prototype.SetColumns = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columns = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumns = function(v) { return this.$val.SetColumns(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnSpan = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnSpan, $String);
	};
	CSSStyleDeclaration.prototype.ColumnSpan = function() { return this.$val.ColumnSpan(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnSpan = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnSpan = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnSpan = function(v) { return this.$val.SetColumnSpan(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.columnWidth, $String);
	};
	CSSStyleDeclaration.prototype.ColumnWidth = function() { return this.$val.ColumnWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.columnWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnWidth = function(v) { return this.$val.SetColumnWidth(v); };
	CSSStyleDeclaration.ptr.prototype.CounterIncrement = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.counterIncrement, $String);
	};
	CSSStyleDeclaration.prototype.CounterIncrement = function() { return this.$val.CounterIncrement(); };
	CSSStyleDeclaration.ptr.prototype.SetCounterIncrement = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.counterIncrement = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCounterIncrement = function(v) { return this.$val.SetCounterIncrement(v); };
	CSSStyleDeclaration.ptr.prototype.CounterReset = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.counterReset, $String);
	};
	CSSStyleDeclaration.prototype.CounterReset = function() { return this.$val.CounterReset(); };
	CSSStyleDeclaration.ptr.prototype.SetCounterReset = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.counterReset = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCounterReset = function(v) { return this.$val.SetCounterReset(v); };
	CSSStyleDeclaration.ptr.prototype.Cursor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.cursor, $String);
	};
	CSSStyleDeclaration.prototype.Cursor = function() { return this.$val.Cursor(); };
	CSSStyleDeclaration.ptr.prototype.SetCursor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.cursor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCursor = function(v) { return this.$val.SetCursor(v); };
	CSSStyleDeclaration.ptr.prototype.Direction = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.direction, $String);
	};
	CSSStyleDeclaration.prototype.Direction = function() { return this.$val.Direction(); };
	CSSStyleDeclaration.ptr.prototype.SetDirection = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.direction = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetDirection = function(v) { return this.$val.SetDirection(v); };
	CSSStyleDeclaration.ptr.prototype.Display = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.display, $String);
	};
	CSSStyleDeclaration.prototype.Display = function() { return this.$val.Display(); };
	CSSStyleDeclaration.ptr.prototype.SetDisplay = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.display = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetDisplay = function(v) { return this.$val.SetDisplay(v); };
	CSSStyleDeclaration.ptr.prototype.EmptyCells = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.emptyCells, $String);
	};
	CSSStyleDeclaration.prototype.EmptyCells = function() { return this.$val.EmptyCells(); };
	CSSStyleDeclaration.ptr.prototype.SetEmptyCells = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.emptyCells = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetEmptyCells = function(v) { return this.$val.SetEmptyCells(v); };
	CSSStyleDeclaration.ptr.prototype.Filter = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.filter, $String);
	};
	CSSStyleDeclaration.prototype.Filter = function() { return this.$val.Filter(); };
	CSSStyleDeclaration.ptr.prototype.SetFilter = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.filter = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFilter = function(v) { return this.$val.SetFilter(v); };
	CSSStyleDeclaration.ptr.prototype.Flex = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.flex, $String);
	};
	CSSStyleDeclaration.prototype.Flex = function() { return this.$val.Flex(); };
	CSSStyleDeclaration.ptr.prototype.SetFlex = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.flex = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlex = function(v) { return this.$val.SetFlex(v); };
	CSSStyleDeclaration.ptr.prototype.FlexBasis = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.flexBasis, $String);
	};
	CSSStyleDeclaration.prototype.FlexBasis = function() { return this.$val.FlexBasis(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexBasis = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.flexBasis = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexBasis = function(v) { return this.$val.SetFlexBasis(v); };
	CSSStyleDeclaration.ptr.prototype.FlexDirection = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.flexDirection, $String);
	};
	CSSStyleDeclaration.prototype.FlexDirection = function() { return this.$val.FlexDirection(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexDirection = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.flexDirection = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexDirection = function(v) { return this.$val.SetFlexDirection(v); };
	CSSStyleDeclaration.ptr.prototype.FlexFlow = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.flexFlow, $String);
	};
	CSSStyleDeclaration.prototype.FlexFlow = function() { return this.$val.FlexFlow(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexFlow = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.flexFlow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexFlow = function(v) { return this.$val.SetFlexFlow(v); };
	CSSStyleDeclaration.ptr.prototype.FlexGrow = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.flexGrow, $String);
	};
	CSSStyleDeclaration.prototype.FlexGrow = function() { return this.$val.FlexGrow(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexGrow = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.flexGrow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexGrow = function(v) { return this.$val.SetFlexGrow(v); };
	CSSStyleDeclaration.ptr.prototype.FlexShrink = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.flexShrink, $String);
	};
	CSSStyleDeclaration.prototype.FlexShrink = function() { return this.$val.FlexShrink(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexShrink = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.flexShrink = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexShrink = function(v) { return this.$val.SetFlexShrink(v); };
	CSSStyleDeclaration.ptr.prototype.FlexWrap = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.flexWrap, $String);
	};
	CSSStyleDeclaration.prototype.FlexWrap = function() { return this.$val.FlexWrap(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexWrap = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.flexWrap = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexWrap = function(v) { return this.$val.SetFlexWrap(v); };
	CSSStyleDeclaration.ptr.prototype.CssFloat = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.cssFloat, $String);
	};
	CSSStyleDeclaration.prototype.CssFloat = function() { return this.$val.CssFloat(); };
	CSSStyleDeclaration.ptr.prototype.SetCssFloat = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.cssFloat = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCssFloat = function(v) { return this.$val.SetCssFloat(v); };
	CSSStyleDeclaration.ptr.prototype.Font = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.font, $String);
	};
	CSSStyleDeclaration.prototype.Font = function() { return this.$val.Font(); };
	CSSStyleDeclaration.ptr.prototype.SetFont = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.font = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFont = function(v) { return this.$val.SetFont(v); };
	CSSStyleDeclaration.ptr.prototype.FontFamily = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.fontFamily, $String);
	};
	CSSStyleDeclaration.prototype.FontFamily = function() { return this.$val.FontFamily(); };
	CSSStyleDeclaration.ptr.prototype.SetFontFamily = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.fontFamily = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontFamily = function(v) { return this.$val.SetFontFamily(v); };
	CSSStyleDeclaration.ptr.prototype.FontSize = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.fontSize, $String);
	};
	CSSStyleDeclaration.prototype.FontSize = function() { return this.$val.FontSize(); };
	CSSStyleDeclaration.ptr.prototype.SetFontSize = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.fontSize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontSize = function(v) { return this.$val.SetFontSize(v); };
	CSSStyleDeclaration.ptr.prototype.FontStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.fontStyle, $String);
	};
	CSSStyleDeclaration.prototype.FontStyle = function() { return this.$val.FontStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetFontStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.fontStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontStyle = function(v) { return this.$val.SetFontStyle(v); };
	CSSStyleDeclaration.ptr.prototype.FontVariant = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.fontVariant, $String);
	};
	CSSStyleDeclaration.prototype.FontVariant = function() { return this.$val.FontVariant(); };
	CSSStyleDeclaration.ptr.prototype.SetFontVariant = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.fontVariant = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontVariant = function(v) { return this.$val.SetFontVariant(v); };
	CSSStyleDeclaration.ptr.prototype.FontWeight = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.fontWeight, $String);
	};
	CSSStyleDeclaration.prototype.FontWeight = function() { return this.$val.FontWeight(); };
	CSSStyleDeclaration.ptr.prototype.SetFontWeight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.fontWeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontWeight = function(v) { return this.$val.SetFontWeight(v); };
	CSSStyleDeclaration.ptr.prototype.FontSizeAdjust = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.fontSizeAdjust, $String);
	};
	CSSStyleDeclaration.prototype.FontSizeAdjust = function() { return this.$val.FontSizeAdjust(); };
	CSSStyleDeclaration.ptr.prototype.SetFontSizeAdjust = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.fontSizeAdjust = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontSizeAdjust = function(v) { return this.$val.SetFontSizeAdjust(v); };
	CSSStyleDeclaration.ptr.prototype.Height = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.height, $String);
	};
	CSSStyleDeclaration.prototype.Height = function() { return this.$val.Height(); };
	CSSStyleDeclaration.ptr.prototype.SetHeight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.height = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetHeight = function(v) { return this.$val.SetHeight(v); };
	CSSStyleDeclaration.ptr.prototype.JustifyContent = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.justifyContent, $String);
	};
	CSSStyleDeclaration.prototype.JustifyContent = function() { return this.$val.JustifyContent(); };
	CSSStyleDeclaration.ptr.prototype.SetJustifyContent = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.justifyContent = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetJustifyContent = function(v) { return this.$val.SetJustifyContent(v); };
	CSSStyleDeclaration.ptr.prototype.Left = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.left, $String);
	};
	CSSStyleDeclaration.prototype.Left = function() { return this.$val.Left(); };
	CSSStyleDeclaration.ptr.prototype.SetLeft = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.left = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetLeft = function(v) { return this.$val.SetLeft(v); };
	CSSStyleDeclaration.ptr.prototype.LetterSpacing = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.letterSpacing, $String);
	};
	CSSStyleDeclaration.prototype.LetterSpacing = function() { return this.$val.LetterSpacing(); };
	CSSStyleDeclaration.ptr.prototype.SetLetterSpacing = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.letterSpacing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetLetterSpacing = function(v) { return this.$val.SetLetterSpacing(v); };
	CSSStyleDeclaration.ptr.prototype.LineHeight = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.lineHeight, $String);
	};
	CSSStyleDeclaration.prototype.LineHeight = function() { return this.$val.LineHeight(); };
	CSSStyleDeclaration.ptr.prototype.SetLineHeight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.lineHeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetLineHeight = function(v) { return this.$val.SetLineHeight(v); };
	CSSStyleDeclaration.ptr.prototype.ListStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.listStyle, $String);
	};
	CSSStyleDeclaration.prototype.ListStyle = function() { return this.$val.ListStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetListStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.listStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStyle = function(v) { return this.$val.SetListStyle(v); };
	CSSStyleDeclaration.ptr.prototype.ListStyleImage = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.listStyleImage, $String);
	};
	CSSStyleDeclaration.prototype.ListStyleImage = function() { return this.$val.ListStyleImage(); };
	CSSStyleDeclaration.ptr.prototype.SetListStyleImage = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.listStyleImage = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStyleImage = function(v) { return this.$val.SetListStyleImage(v); };
	CSSStyleDeclaration.ptr.prototype.ListStylePosition = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.listStylePosition, $String);
	};
	CSSStyleDeclaration.prototype.ListStylePosition = function() { return this.$val.ListStylePosition(); };
	CSSStyleDeclaration.ptr.prototype.SetListStylePosition = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.listStylePosition = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStylePosition = function(v) { return this.$val.SetListStylePosition(v); };
	CSSStyleDeclaration.ptr.prototype.ListStyleType = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.listStyleType, $String);
	};
	CSSStyleDeclaration.prototype.ListStyleType = function() { return this.$val.ListStyleType(); };
	CSSStyleDeclaration.ptr.prototype.SetListStyleType = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.listStyleType = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStyleType = function(v) { return this.$val.SetListStyleType(v); };
	CSSStyleDeclaration.ptr.prototype.Margin = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.margin, $String);
	};
	CSSStyleDeclaration.prototype.Margin = function() { return this.$val.Margin(); };
	CSSStyleDeclaration.ptr.prototype.SetMargin = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.margin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMargin = function(v) { return this.$val.SetMargin(v); };
	CSSStyleDeclaration.ptr.prototype.MarginBottom = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.marginBottom, $String);
	};
	CSSStyleDeclaration.prototype.MarginBottom = function() { return this.$val.MarginBottom(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginBottom = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.marginBottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginBottom = function(v) { return this.$val.SetMarginBottom(v); };
	CSSStyleDeclaration.ptr.prototype.MarginLeft = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.marginLeft, $String);
	};
	CSSStyleDeclaration.prototype.MarginLeft = function() { return this.$val.MarginLeft(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginLeft = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.marginLeft = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginLeft = function(v) { return this.$val.SetMarginLeft(v); };
	CSSStyleDeclaration.ptr.prototype.MarginRight = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.marginRight, $String);
	};
	CSSStyleDeclaration.prototype.MarginRight = function() { return this.$val.MarginRight(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginRight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.marginRight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginRight = function(v) { return this.$val.SetMarginRight(v); };
	CSSStyleDeclaration.ptr.prototype.MarginTop = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.marginTop, $String);
	};
	CSSStyleDeclaration.prototype.MarginTop = function() { return this.$val.MarginTop(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginTop = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.marginTop = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginTop = function(v) { return this.$val.SetMarginTop(v); };
	CSSStyleDeclaration.ptr.prototype.MaxHeight = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.maxHeight, $String);
	};
	CSSStyleDeclaration.prototype.MaxHeight = function() { return this.$val.MaxHeight(); };
	CSSStyleDeclaration.ptr.prototype.SetMaxHeight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.maxHeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMaxHeight = function(v) { return this.$val.SetMaxHeight(v); };
	CSSStyleDeclaration.ptr.prototype.MaxWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.maxWidth, $String);
	};
	CSSStyleDeclaration.prototype.MaxWidth = function() { return this.$val.MaxWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetMaxWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.maxWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMaxWidth = function(v) { return this.$val.SetMaxWidth(v); };
	CSSStyleDeclaration.ptr.prototype.MinHeight = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.minHeight, $String);
	};
	CSSStyleDeclaration.prototype.MinHeight = function() { return this.$val.MinHeight(); };
	CSSStyleDeclaration.ptr.prototype.SetMinHeight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.minHeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMinHeight = function(v) { return this.$val.SetMinHeight(v); };
	CSSStyleDeclaration.ptr.prototype.MinWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.minWidth, $String);
	};
	CSSStyleDeclaration.prototype.MinWidth = function() { return this.$val.MinWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetMinWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.minWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMinWidth = function(v) { return this.$val.SetMinWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Opacity = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.opacity, $String);
	};
	CSSStyleDeclaration.prototype.Opacity = function() { return this.$val.Opacity(); };
	CSSStyleDeclaration.ptr.prototype.SetOpacity = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.opacity = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOpacity = function(v) { return this.$val.SetOpacity(v); };
	CSSStyleDeclaration.ptr.prototype.Order = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.order, $String);
	};
	CSSStyleDeclaration.prototype.Order = function() { return this.$val.Order(); };
	CSSStyleDeclaration.ptr.prototype.SetOrder = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.order = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOrder = function(v) { return this.$val.SetOrder(v); };
	CSSStyleDeclaration.ptr.prototype.Orphans = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.orphans, $String);
	};
	CSSStyleDeclaration.prototype.Orphans = function() { return this.$val.Orphans(); };
	CSSStyleDeclaration.ptr.prototype.SetOrphans = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.orphans = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOrphans = function(v) { return this.$val.SetOrphans(v); };
	CSSStyleDeclaration.ptr.prototype.Outline = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.outline, $String);
	};
	CSSStyleDeclaration.prototype.Outline = function() { return this.$val.Outline(); };
	CSSStyleDeclaration.ptr.prototype.SetOutline = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.outline = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutline = function(v) { return this.$val.SetOutline(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.outlineColor, $String);
	};
	CSSStyleDeclaration.prototype.OutlineColor = function() { return this.$val.OutlineColor(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.outlineColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineColor = function(v) { return this.$val.SetOutlineColor(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineOffset = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.outlineOffset, $String);
	};
	CSSStyleDeclaration.prototype.OutlineOffset = function() { return this.$val.OutlineOffset(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineOffset = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.outlineOffset = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineOffset = function(v) { return this.$val.SetOutlineOffset(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.outlineStyle, $String);
	};
	CSSStyleDeclaration.prototype.OutlineStyle = function() { return this.$val.OutlineStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.outlineStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineStyle = function(v) { return this.$val.SetOutlineStyle(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineWidth = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.outlineWidth, $String);
	};
	CSSStyleDeclaration.prototype.OutlineWidth = function() { return this.$val.OutlineWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.outlineWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineWidth = function(v) { return this.$val.SetOutlineWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Overflow = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.overflow, $String);
	};
	CSSStyleDeclaration.prototype.Overflow = function() { return this.$val.Overflow(); };
	CSSStyleDeclaration.ptr.prototype.SetOverflow = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.overflow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOverflow = function(v) { return this.$val.SetOverflow(v); };
	CSSStyleDeclaration.ptr.prototype.OverflowX = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.overflowX, $String);
	};
	CSSStyleDeclaration.prototype.OverflowX = function() { return this.$val.OverflowX(); };
	CSSStyleDeclaration.ptr.prototype.SetOverflowX = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.overflowX = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOverflowX = function(v) { return this.$val.SetOverflowX(v); };
	CSSStyleDeclaration.ptr.prototype.OverflowY = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.overflowY, $String);
	};
	CSSStyleDeclaration.prototype.OverflowY = function() { return this.$val.OverflowY(); };
	CSSStyleDeclaration.ptr.prototype.SetOverflowY = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.overflowY = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOverflowY = function(v) { return this.$val.SetOverflowY(v); };
	CSSStyleDeclaration.ptr.prototype.Padding = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.padding, $String);
	};
	CSSStyleDeclaration.prototype.Padding = function() { return this.$val.Padding(); };
	CSSStyleDeclaration.ptr.prototype.SetPadding = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.padding = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPadding = function(v) { return this.$val.SetPadding(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingBottom = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.paddingBottom, $String);
	};
	CSSStyleDeclaration.prototype.PaddingBottom = function() { return this.$val.PaddingBottom(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingBottom = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.paddingBottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingBottom = function(v) { return this.$val.SetPaddingBottom(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingLeft = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.paddingLeft, $String);
	};
	CSSStyleDeclaration.prototype.PaddingLeft = function() { return this.$val.PaddingLeft(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingLeft = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.paddingLeft = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingLeft = function(v) { return this.$val.SetPaddingLeft(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingRight = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.paddingRight, $String);
	};
	CSSStyleDeclaration.prototype.PaddingRight = function() { return this.$val.PaddingRight(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingRight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.paddingRight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingRight = function(v) { return this.$val.SetPaddingRight(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingTop = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.paddingTop, $String);
	};
	CSSStyleDeclaration.prototype.PaddingTop = function() { return this.$val.PaddingTop(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingTop = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.paddingTop = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingTop = function(v) { return this.$val.SetPaddingTop(v); };
	CSSStyleDeclaration.ptr.prototype.PageBreakAfter = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.pageBreakAfter, $String);
	};
	CSSStyleDeclaration.prototype.PageBreakAfter = function() { return this.$val.PageBreakAfter(); };
	CSSStyleDeclaration.ptr.prototype.SetPageBreakAfter = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.pageBreakAfter = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPageBreakAfter = function(v) { return this.$val.SetPageBreakAfter(v); };
	CSSStyleDeclaration.ptr.prototype.PageBreakBefore = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.pageBreakBefore, $String);
	};
	CSSStyleDeclaration.prototype.PageBreakBefore = function() { return this.$val.PageBreakBefore(); };
	CSSStyleDeclaration.ptr.prototype.SetPageBreakBefore = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.pageBreakBefore = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPageBreakBefore = function(v) { return this.$val.SetPageBreakBefore(v); };
	CSSStyleDeclaration.ptr.prototype.PageBreakInside = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.pageBreakInside, $String);
	};
	CSSStyleDeclaration.prototype.PageBreakInside = function() { return this.$val.PageBreakInside(); };
	CSSStyleDeclaration.ptr.prototype.SetPageBreakInside = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.pageBreakInside = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPageBreakInside = function(v) { return this.$val.SetPageBreakInside(v); };
	CSSStyleDeclaration.ptr.prototype.Perspective = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.perspective, $String);
	};
	CSSStyleDeclaration.prototype.Perspective = function() { return this.$val.Perspective(); };
	CSSStyleDeclaration.ptr.prototype.SetPerspective = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.perspective = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPerspective = function(v) { return this.$val.SetPerspective(v); };
	CSSStyleDeclaration.ptr.prototype.PerspectiveOrigin = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.perspectiveOrigin, $String);
	};
	CSSStyleDeclaration.prototype.PerspectiveOrigin = function() { return this.$val.PerspectiveOrigin(); };
	CSSStyleDeclaration.ptr.prototype.SetPerspectiveOrigin = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.perspectiveOrigin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPerspectiveOrigin = function(v) { return this.$val.SetPerspectiveOrigin(v); };
	CSSStyleDeclaration.ptr.prototype.Position = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.position, $String);
	};
	CSSStyleDeclaration.prototype.Position = function() { return this.$val.Position(); };
	CSSStyleDeclaration.ptr.prototype.SetPosition = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.position = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPosition = function(v) { return this.$val.SetPosition(v); };
	CSSStyleDeclaration.ptr.prototype.Quotes = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.quotes, $String);
	};
	CSSStyleDeclaration.prototype.Quotes = function() { return this.$val.Quotes(); };
	CSSStyleDeclaration.ptr.prototype.SetQuotes = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.quotes = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetQuotes = function(v) { return this.$val.SetQuotes(v); };
	CSSStyleDeclaration.ptr.prototype.Resize = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.resize, $String);
	};
	CSSStyleDeclaration.prototype.Resize = function() { return this.$val.Resize(); };
	CSSStyleDeclaration.ptr.prototype.SetResize = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.resize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetResize = function(v) { return this.$val.SetResize(v); };
	CSSStyleDeclaration.ptr.prototype.Right = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.right, $String);
	};
	CSSStyleDeclaration.prototype.Right = function() { return this.$val.Right(); };
	CSSStyleDeclaration.ptr.prototype.SetRight = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.right = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetRight = function(v) { return this.$val.SetRight(v); };
	CSSStyleDeclaration.ptr.prototype.TableLayout = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.tableLayout, $String);
	};
	CSSStyleDeclaration.prototype.TableLayout = function() { return this.$val.TableLayout(); };
	CSSStyleDeclaration.ptr.prototype.SetTableLayout = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.tableLayout = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTableLayout = function(v) { return this.$val.SetTableLayout(v); };
	CSSStyleDeclaration.ptr.prototype.TabSize = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.tabSize, $String);
	};
	CSSStyleDeclaration.prototype.TabSize = function() { return this.$val.TabSize(); };
	CSSStyleDeclaration.ptr.prototype.SetTabSize = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.tabSize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTabSize = function(v) { return this.$val.SetTabSize(v); };
	CSSStyleDeclaration.ptr.prototype.TextAlign = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textAlign, $String);
	};
	CSSStyleDeclaration.prototype.TextAlign = function() { return this.$val.TextAlign(); };
	CSSStyleDeclaration.ptr.prototype.SetTextAlign = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textAlign = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextAlign = function(v) { return this.$val.SetTextAlign(v); };
	CSSStyleDeclaration.ptr.prototype.TextAlignLast = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textAlignLast, $String);
	};
	CSSStyleDeclaration.prototype.TextAlignLast = function() { return this.$val.TextAlignLast(); };
	CSSStyleDeclaration.ptr.prototype.SetTextAlignLast = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textAlignLast = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextAlignLast = function(v) { return this.$val.SetTextAlignLast(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecoration = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textDecoration, $String);
	};
	CSSStyleDeclaration.prototype.TextDecoration = function() { return this.$val.TextDecoration(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecoration = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textDecoration = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecoration = function(v) { return this.$val.SetTextDecoration(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecorationColor = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textDecorationColor, $String);
	};
	CSSStyleDeclaration.prototype.TextDecorationColor = function() { return this.$val.TextDecorationColor(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecorationColor = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textDecorationColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecorationColor = function(v) { return this.$val.SetTextDecorationColor(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecorationLine = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textDecorationLine, $String);
	};
	CSSStyleDeclaration.prototype.TextDecorationLine = function() { return this.$val.TextDecorationLine(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecorationLine = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textDecorationLine = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecorationLine = function(v) { return this.$val.SetTextDecorationLine(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecorationStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textDecorationStyle, $String);
	};
	CSSStyleDeclaration.prototype.TextDecorationStyle = function() { return this.$val.TextDecorationStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecorationStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textDecorationStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecorationStyle = function(v) { return this.$val.SetTextDecorationStyle(v); };
	CSSStyleDeclaration.ptr.prototype.TextIndent = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textIndent, $String);
	};
	CSSStyleDeclaration.prototype.TextIndent = function() { return this.$val.TextIndent(); };
	CSSStyleDeclaration.ptr.prototype.SetTextIndent = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textIndent = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextIndent = function(v) { return this.$val.SetTextIndent(v); };
	CSSStyleDeclaration.ptr.prototype.TextOverflow = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textOverflow, $String);
	};
	CSSStyleDeclaration.prototype.TextOverflow = function() { return this.$val.TextOverflow(); };
	CSSStyleDeclaration.ptr.prototype.SetTextOverflow = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textOverflow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextOverflow = function(v) { return this.$val.SetTextOverflow(v); };
	CSSStyleDeclaration.ptr.prototype.TextShadow = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textShadow, $String);
	};
	CSSStyleDeclaration.prototype.TextShadow = function() { return this.$val.TextShadow(); };
	CSSStyleDeclaration.ptr.prototype.SetTextShadow = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textShadow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextShadow = function(v) { return this.$val.SetTextShadow(v); };
	CSSStyleDeclaration.ptr.prototype.TextTransform = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.textTransform, $String);
	};
	CSSStyleDeclaration.prototype.TextTransform = function() { return this.$val.TextTransform(); };
	CSSStyleDeclaration.ptr.prototype.SetTextTransform = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.textTransform = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextTransform = function(v) { return this.$val.SetTextTransform(v); };
	CSSStyleDeclaration.ptr.prototype.Top = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.top, $String);
	};
	CSSStyleDeclaration.prototype.Top = function() { return this.$val.Top(); };
	CSSStyleDeclaration.ptr.prototype.SetTop = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.top = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTop = function(v) { return this.$val.SetTop(v); };
	CSSStyleDeclaration.ptr.prototype.Transform = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transform, $String);
	};
	CSSStyleDeclaration.prototype.Transform = function() { return this.$val.Transform(); };
	CSSStyleDeclaration.ptr.prototype.SetTransform = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transform = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransform = function(v) { return this.$val.SetTransform(v); };
	CSSStyleDeclaration.ptr.prototype.TransformOrigin = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transformOrigin, $String);
	};
	CSSStyleDeclaration.prototype.TransformOrigin = function() { return this.$val.TransformOrigin(); };
	CSSStyleDeclaration.ptr.prototype.SetTransformOrigin = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transformOrigin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransformOrigin = function(v) { return this.$val.SetTransformOrigin(v); };
	CSSStyleDeclaration.ptr.prototype.TransformStyle = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transformStyle, $String);
	};
	CSSStyleDeclaration.prototype.TransformStyle = function() { return this.$val.TransformStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetTransformStyle = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transformStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransformStyle = function(v) { return this.$val.SetTransformStyle(v); };
	CSSStyleDeclaration.ptr.prototype.Transition = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transition, $String);
	};
	CSSStyleDeclaration.prototype.Transition = function() { return this.$val.Transition(); };
	CSSStyleDeclaration.ptr.prototype.SetTransition = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transition = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransition = function(v) { return this.$val.SetTransition(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionProperty = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transitionProperty, $String);
	};
	CSSStyleDeclaration.prototype.TransitionProperty = function() { return this.$val.TransitionProperty(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionProperty = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transitionProperty = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionProperty = function(v) { return this.$val.SetTransitionProperty(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionDuration = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transitionDuration, $String);
	};
	CSSStyleDeclaration.prototype.TransitionDuration = function() { return this.$val.TransitionDuration(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionDuration = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transitionDuration = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionDuration = function(v) { return this.$val.SetTransitionDuration(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionTimingFunction = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transitionTimingFunction, $String);
	};
	CSSStyleDeclaration.prototype.TransitionTimingFunction = function() { return this.$val.TransitionTimingFunction(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionTimingFunction = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transitionTimingFunction = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionTimingFunction = function(v) { return this.$val.SetTransitionTimingFunction(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionDelay = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.transitionDelay, $String);
	};
	CSSStyleDeclaration.prototype.TransitionDelay = function() { return this.$val.TransitionDelay(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionDelay = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.transitionDelay = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionDelay = function(v) { return this.$val.SetTransitionDelay(v); };
	CSSStyleDeclaration.ptr.prototype.UnicodeBidi = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.unicodeBidi, $String);
	};
	CSSStyleDeclaration.prototype.UnicodeBidi = function() { return this.$val.UnicodeBidi(); };
	CSSStyleDeclaration.ptr.prototype.SetUnicodeBidi = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.unicodeBidi = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetUnicodeBidi = function(v) { return this.$val.SetUnicodeBidi(v); };
	CSSStyleDeclaration.ptr.prototype.UserSelect = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.userSelect, $String);
	};
	CSSStyleDeclaration.prototype.UserSelect = function() { return this.$val.UserSelect(); };
	CSSStyleDeclaration.ptr.prototype.SetUserSelect = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.userSelect = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetUserSelect = function(v) { return this.$val.SetUserSelect(v); };
	CSSStyleDeclaration.ptr.prototype.VerticalAlign = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.verticalAlign, $String);
	};
	CSSStyleDeclaration.prototype.VerticalAlign = function() { return this.$val.VerticalAlign(); };
	CSSStyleDeclaration.ptr.prototype.SetVerticalAlign = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.verticalAlign = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetVerticalAlign = function(v) { return this.$val.SetVerticalAlign(v); };
	CSSStyleDeclaration.ptr.prototype.Visibility = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.visibility, $String);
	};
	CSSStyleDeclaration.prototype.Visibility = function() { return this.$val.Visibility(); };
	CSSStyleDeclaration.ptr.prototype.SetVisibility = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.visibility = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetVisibility = function(v) { return this.$val.SetVisibility(v); };
	CSSStyleDeclaration.ptr.prototype.WhiteSpace = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.whiteSpace, $String);
	};
	CSSStyleDeclaration.prototype.WhiteSpace = function() { return this.$val.WhiteSpace(); };
	CSSStyleDeclaration.ptr.prototype.SetWhiteSpace = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.whiteSpace = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWhiteSpace = function(v) { return this.$val.SetWhiteSpace(v); };
	CSSStyleDeclaration.ptr.prototype.Width = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.width, $String);
	};
	CSSStyleDeclaration.prototype.Width = function() { return this.$val.Width(); };
	CSSStyleDeclaration.ptr.prototype.SetWidth = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.width = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWidth = function(v) { return this.$val.SetWidth(v); };
	CSSStyleDeclaration.ptr.prototype.WordBreak = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.wordBreak, $String);
	};
	CSSStyleDeclaration.prototype.WordBreak = function() { return this.$val.WordBreak(); };
	CSSStyleDeclaration.ptr.prototype.SetWordBreak = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.wordBreak = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWordBreak = function(v) { return this.$val.SetWordBreak(v); };
	CSSStyleDeclaration.ptr.prototype.WordSpacing = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.wordSpacing, $String);
	};
	CSSStyleDeclaration.prototype.WordSpacing = function() { return this.$val.WordSpacing(); };
	CSSStyleDeclaration.ptr.prototype.SetWordSpacing = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.wordSpacing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWordSpacing = function(v) { return this.$val.SetWordSpacing(v); };
	CSSStyleDeclaration.ptr.prototype.WordWrap = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.wordWrap, $String);
	};
	CSSStyleDeclaration.prototype.WordWrap = function() { return this.$val.WordWrap(); };
	CSSStyleDeclaration.ptr.prototype.SetWordWrap = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.wordWrap = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWordWrap = function(v) { return this.$val.SetWordWrap(v); };
	CSSStyleDeclaration.ptr.prototype.Widows = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.widows, $String);
	};
	CSSStyleDeclaration.prototype.Widows = function() { return this.$val.Widows(); };
	CSSStyleDeclaration.ptr.prototype.SetWidows = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.widows = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWidows = function(v) { return this.$val.SetWidows(v); };
	CSSStyleDeclaration.ptr.prototype.ZIndex = function() {
		var $ptr, s;
		s = this;
		return $internalize(s.Object.zIndex, $String);
	};
	CSSStyleDeclaration.prototype.ZIndex = function() { return this.$val.ZIndex(); };
	CSSStyleDeclaration.ptr.prototype.SetZIndex = function(v) {
		var $ptr, s, v;
		s = this;
		s.Object.zIndex = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetZIndex = function(v) { return this.$val.SetZIndex(v); };
	Object.ptr.prototype.ActiveElement = function() {
		var $ptr, o;
		o = this;
		return new Object.ptr(o.Object.activeElement);
	};
	Object.prototype.ActiveElement = function() { return this.$val.ActiveElement(); };
	Object.ptr.prototype.CreateElement = function(tag) {
		var $ptr, o, tag;
		o = this;
		return new Object.ptr($pkg.Document.Object.createElement($externalize(tag, $String)));
	};
	Object.prototype.CreateElement = function(tag) { return this.$val.CreateElement(tag); };
	Object.ptr.prototype.CreateTextNode = function(textContent) {
		var $ptr, o, textContent;
		o = this;
		return new Object.ptr($pkg.Document.Object.createTextNode($externalize(textContent, $String)));
	};
	Object.prototype.CreateTextNode = function(textContent) { return this.$val.CreateTextNode(textContent); };
	Object.ptr.prototype.GetElementById = function(id) {
		var $ptr, id, o;
		o = this;
		return new Object.ptr(o.Object.getElementById($externalize(id, $String)));
	};
	Object.prototype.GetElementById = function(id) { return this.$val.GetElementById(id); };
	DOMRect.ptr.prototype.X = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.x);
	};
	DOMRect.prototype.X = function() { return this.$val.X(); };
	DOMRect.ptr.prototype.Y = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.y);
	};
	DOMRect.prototype.Y = function() { return this.$val.Y(); };
	DOMRect.ptr.prototype.Width = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.width);
	};
	DOMRect.prototype.Width = function() { return this.$val.Width(); };
	DOMRect.ptr.prototype.Height = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.height);
	};
	DOMRect.prototype.Height = function() { return this.$val.Height(); };
	DOMRect.ptr.prototype.Top = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.top);
	};
	DOMRect.prototype.Top = function() { return this.$val.Top(); };
	DOMRect.ptr.prototype.Right = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.right);
	};
	DOMRect.prototype.Right = function() { return this.$val.Right(); };
	DOMRect.ptr.prototype.Bottom = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.bottom);
	};
	DOMRect.prototype.Bottom = function() { return this.$val.Bottom(); };
	DOMRect.ptr.prototype.Left = function() {
		var $ptr, r;
		r = this;
		return $parseFloat(r.Object.left);
	};
	DOMRect.prototype.Left = function() { return this.$val.Left(); };
	Object.ptr.prototype.ClassList = function() {
		var $ptr, o;
		o = this;
		return new DOMTokenList.ptr(o.Object.classList);
	};
	Object.prototype.ClassList = function() { return this.$val.ClassList(); };
	Object.ptr.prototype.InnerHTML = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.Object.innerHTML, $String);
	};
	Object.prototype.InnerHTML = function() { return this.$val.InnerHTML(); };
	Object.ptr.prototype.SetInnerHTML = function(html) {
		var $ptr, html, o;
		o = this;
		o.Object.innerHTML = $externalize(html, $String);
	};
	Object.prototype.SetInnerHTML = function(html) { return this.$val.SetInnerHTML(html); };
	Object.ptr.prototype.OuterHTML = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.Object.outerHTML, $String);
	};
	Object.prototype.OuterHTML = function() { return this.$val.OuterHTML(); };
	Object.ptr.prototype.SetOuterHTML = function(html) {
		var $ptr, html, o;
		o = this;
		o.Object.outerHTML = $externalize(html, $String);
	};
	Object.prototype.SetOuterHTML = function(html) { return this.$val.SetOuterHTML(html); };
	Object.ptr.prototype.Blur = function() {
		var $ptr, o;
		o = this;
		o.Object.blur();
	};
	Object.prototype.Blur = function() { return this.$val.Blur(); };
	Object.ptr.prototype.Focus = function() {
		var $ptr, o;
		o = this;
		o.Object.focus();
	};
	Object.prototype.Focus = function() { return this.$val.Focus(); };
	Object.ptr.prototype.GetBoundingClientRect = function() {
		var $ptr, o;
		o = this;
		return new DOMRect.ptr(o.Object.getBoundingClientRect());
	};
	Object.prototype.GetBoundingClientRect = function() { return this.$val.GetBoundingClientRect(); };
	Object.ptr.prototype.QuerySelector = function(selectors) {
		var $ptr, o, selectors;
		o = this;
		return new Object.ptr(o.Object.querySelector($externalize(selectors, $String)));
	};
	Object.prototype.QuerySelector = function(selectors) { return this.$val.QuerySelector(selectors); };
	Object.ptr.prototype.QuerySelectorAll = function(selectors) {
		var $ptr, i, length, nodeList, nodes, o, selectors;
		o = this;
		nodeList = o.Object.querySelectorAll($externalize(selectors, $String));
		length = $parseInt(nodeList.length) >> 0;
		nodes = sliceType.nil;
		i = 0;
		while (true) {
			if (!(i < length)) { break; }
			nodes = $append(nodes, new Object.ptr(nodeList.item(i)));
			i = i + (1) >> 0;
		}
		return nodes;
	};
	Object.prototype.QuerySelectorAll = function(selectors) { return this.$val.QuerySelectorAll(selectors); };
	Event.ptr.prototype.Target = function() {
		var $ptr, e;
		e = this;
		return new Object.ptr(e.Object.target);
	};
	Event.prototype.Target = function() { return this.$val.Target(); };
	Object.ptr.prototype.AddEventListener = function(t, listener, args) {
		var $ptr, args, listener, o, t;
		o = this;
		if (args.$length === 1) {
			o.Object.addEventListener($externalize(t, $String), $externalize(listener, funcType), $externalize((0 >= args.$length ? ($throwRuntimeError("index out of range"), undefined) : args.$array[args.$offset + 0]), $emptyInterface));
		} else {
			o.Object.addEventListener($externalize(t, $String), $externalize(listener, funcType));
		}
	};
	Object.prototype.AddEventListener = function(t, listener, args) { return this.$val.AddEventListener(t, listener, args); };
	Object.ptr.prototype.RemoveEventListener = function(t, listener, args) {
		var $ptr, args, listener, o, t;
		o = this;
		if (args.$length === 1) {
			o.Object.removeEventListener($externalize(t, $String), $externalize(listener, funcType), $externalize((0 >= args.$length ? ($throwRuntimeError("index out of range"), undefined) : args.$array[args.$offset + 0]), $emptyInterface));
		} else {
			o.Object.removeEventListener($externalize(t, $String), $externalize(listener, funcType));
		}
	};
	Object.prototype.RemoveEventListener = function(t, listener, args) { return this.$val.RemoveEventListener(t, listener, args); };
	Object.ptr.prototype.RemoveAllChildNodes = function() {
		var $ptr, o;
		o = this;
		while (true) {
			if (!(o.HasChildNodes())) { break; }
			o.RemoveChild(o.LastChild());
		}
	};
	Object.prototype.RemoveAllChildNodes = function() { return this.$val.RemoveAllChildNodes(); };
	Object.ptr.prototype.AppendBefore = function(n) {
		var $ptr, n, o;
		o = this;
		o.ParentNode().InsertBefore(n, o);
	};
	Object.prototype.AppendBefore = function(n) { return this.$val.AppendBefore(n); };
	Object.ptr.prototype.AppendAfter = function(n) {
		var $ptr, n, o;
		o = this;
		o.ParentNode().InsertBefore(n, o.NextSibling());
	};
	Object.prototype.AppendAfter = function(n) { return this.$val.AppendAfter(n); };
	Object.ptr.prototype.IsFocused = function() {
		var $ptr, o;
		o = this;
		return o.IsEqualNode($pkg.Document.ActiveElement());
	};
	Object.prototype.IsFocused = function() { return this.$val.IsFocused(); };
	Object.ptr.prototype.Style = function() {
		var $ptr, o;
		o = this;
		return new CSSStyleDeclaration.ptr(o.Object.style);
	};
	Object.prototype.Style = function() { return this.$val.Style(); };
	Object.ptr.prototype.Value = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.Object.value, $String);
	};
	Object.prototype.Value = function() { return this.$val.Value(); };
	Object.ptr.prototype.SetValue = function(s) {
		var $ptr, o, s;
		o = this;
		o.Object.value = $externalize(s, $String);
	};
	Object.prototype.SetValue = function(s) { return this.$val.SetValue(s); };
	Event.ptr.prototype.Key = function() {
		var $ptr, e;
		e = this;
		return $internalize(e.Object.key, $String);
	};
	Event.prototype.Key = function() { return this.$val.Key(); };
	Event.ptr.prototype.KeyCode = function() {
		var $ptr, e;
		e = this;
		return $parseInt(e.Object.keyCode) >> 0;
	};
	Event.prototype.KeyCode = function() { return this.$val.KeyCode(); };
	Object.ptr.prototype.FirstChild = function() {
		var $ptr, o;
		o = this;
		return new Object.ptr(o.Object.firstChild);
	};
	Object.prototype.FirstChild = function() { return this.$val.FirstChild(); };
	Object.ptr.prototype.LastChild = function() {
		var $ptr, o;
		o = this;
		return new Object.ptr(o.Object.lastChild);
	};
	Object.prototype.LastChild = function() { return this.$val.LastChild(); };
	Object.ptr.prototype.NextSibling = function() {
		var $ptr, o;
		o = this;
		return new Object.ptr(o.Object.nextSibling);
	};
	Object.prototype.NextSibling = function() { return this.$val.NextSibling(); };
	Object.ptr.prototype.ParentNode = function() {
		var $ptr, o;
		o = this;
		return new Object.ptr(o.Object.parentNode);
	};
	Object.prototype.ParentNode = function() { return this.$val.ParentNode(); };
	Object.ptr.prototype.TextContent = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.Object.textContent, $String);
	};
	Object.prototype.TextContent = function() { return this.$val.TextContent(); };
	Object.ptr.prototype.SetTextContent = function(s) {
		var $ptr, o, s;
		o = this;
		o.Object.textContent = $externalize(s, $String);
	};
	Object.prototype.SetTextContent = function(s) { return this.$val.SetTextContent(s); };
	Object.ptr.prototype.AppendChild = function(c) {
		var $ptr, c, o;
		o = this;
		o.Object.appendChild($externalize(c, ptrType));
	};
	Object.prototype.AppendChild = function(c) { return this.$val.AppendChild(c); };
	Object.ptr.prototype.HasChildNodes = function() {
		var $ptr, o;
		o = this;
		return !!(o.Object.hasChildNodes());
	};
	Object.prototype.HasChildNodes = function() { return this.$val.HasChildNodes(); };
	Object.ptr.prototype.InsertBefore = function(newNode, referenceNode) {
		var $ptr, newNode, o, referenceNode;
		o = this;
		return new Object.ptr(o.Object.insertBefore($externalize(newNode, ptrType), $externalize(referenceNode, ptrType)));
	};
	Object.prototype.InsertBefore = function(newNode, referenceNode) { return this.$val.InsertBefore(newNode, referenceNode); };
	Object.ptr.prototype.IsEqualNode = function(n) {
		var $ptr, n, o;
		o = this;
		return !!(o.Object.isEqualNode($externalize(n, ptrType)));
	};
	Object.prototype.IsEqualNode = function(n) { return this.$val.IsEqualNode(n); };
	Object.ptr.prototype.IsSameNode = function(n) {
		var $ptr, n, o;
		o = this;
		return !!(o.Object.isSameNode($externalize(n, ptrType)));
	};
	Object.prototype.IsSameNode = function(n) { return this.$val.IsSameNode(n); };
	Object.ptr.prototype.RemoveChild = function(c) {
		var $ptr, c, o;
		o = this;
		return new Object.ptr(o.Object.removeChild($externalize(c, ptrType)));
	};
	Object.prototype.RemoveChild = function(c) { return this.$val.RemoveChild(c); };
	DOMTokenList.ptr.prototype.Length = function() {
		var $ptr, t;
		t = this;
		return $parseInt(t.Object.length) >> 0;
	};
	DOMTokenList.prototype.Length = function() { return this.$val.Length(); };
	DOMTokenList.ptr.prototype.Contains = function(s) {
		var $ptr, s, t;
		t = this;
		return !!(t.Object.contains($externalize(s, $String)));
	};
	DOMTokenList.prototype.Contains = function(s) { return this.$val.Contains(s); };
	DOMTokenList.ptr.prototype.Add = function(s) {
		var $ptr, s, t;
		t = this;
		t.Object.add($externalize(s, $String));
	};
	DOMTokenList.prototype.Add = function(s) { return this.$val.Add(s); };
	DOMTokenList.ptr.prototype.Remove = function(s) {
		var $ptr, s, t;
		t = this;
		t.Object.remove($externalize(s, $String));
	};
	DOMTokenList.prototype.Remove = function(s) { return this.$val.Remove(s); };
	DOMTokenList.ptr.prototype.Toggle = function(s) {
		var $ptr, s, t;
		t = this;
		t.Object.toggle($externalize(s, $String));
	};
	DOMTokenList.prototype.Toggle = function(s) { return this.$val.Toggle(s); };
	ptrType$1.methods = [{prop: "CssText", name: "CssText", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "AlignContent", name: "AlignContent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAlignContent", name: "SetAlignContent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AlignItems", name: "AlignItems", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAlignItems", name: "SetAlignItems", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AlignSelf", name: "AlignSelf", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAlignSelf", name: "SetAlignSelf", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Animation", name: "Animation", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimation", name: "SetAnimation", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationDelay", name: "AnimationDelay", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationDelay", name: "SetAnimationDelay", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationDirection", name: "AnimationDirection", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationDirection", name: "SetAnimationDirection", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationDuration", name: "AnimationDuration", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationDuration", name: "SetAnimationDuration", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationFillMode", name: "AnimationFillMode", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationFillMode", name: "SetAnimationFillMode", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationIterationCount", name: "AnimationIterationCount", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationIterationCount", name: "SetAnimationIterationCount", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationName", name: "AnimationName", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationName", name: "SetAnimationName", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationTimingFunction", name: "AnimationTimingFunction", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationTimingFunction", name: "SetAnimationTimingFunction", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationPlayState", name: "AnimationPlayState", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationPlayState", name: "SetAnimationPlayState", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Background", name: "Background", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackground", name: "SetBackground", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundAttachment", name: "BackgroundAttachment", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundAttachment", name: "SetBackgroundAttachment", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundColor", name: "BackgroundColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundColor", name: "SetBackgroundColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundImage", name: "BackgroundImage", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundImage", name: "SetBackgroundImage", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundPosition", name: "BackgroundPosition", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundPosition", name: "SetBackgroundPosition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundRepeat", name: "BackgroundRepeat", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundRepeat", name: "SetBackgroundRepeat", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundClip", name: "BackgroundClip", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundClip", name: "SetBackgroundClip", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundOrigin", name: "BackgroundOrigin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundOrigin", name: "SetBackgroundOrigin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundSize", name: "BackgroundSize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundSize", name: "SetBackgroundSize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackfaceVisibility", name: "BackfaceVisibility", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackfaceVisibility", name: "SetBackfaceVisibility", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Border", name: "Border", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorder", name: "SetBorder", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottom", name: "BorderBottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottom", name: "SetBorderBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomColor", name: "BorderBottomColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomColor", name: "SetBorderBottomColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomLeftRadius", name: "BorderBottomLeftRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomLeftRadius", name: "SetBorderBottomLeftRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomRightRadius", name: "BorderBottomRightRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomRightRadius", name: "SetBorderBottomRightRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomStyle", name: "BorderBottomStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomStyle", name: "SetBorderBottomStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomWidth", name: "BorderBottomWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomWidth", name: "SetBorderBottomWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderCollapse", name: "BorderCollapse", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderCollapse", name: "SetBorderCollapse", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderColor", name: "BorderColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderColor", name: "SetBorderColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImage", name: "BorderImage", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImage", name: "SetBorderImage", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageOutset", name: "BorderImageOutset", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageOutset", name: "SetBorderImageOutset", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageRepeat", name: "BorderImageRepeat", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageRepeat", name: "SetBorderImageRepeat", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageSlice", name: "BorderImageSlice", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageSlice", name: "SetBorderImageSlice", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageSource", name: "BorderImageSource", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageSource", name: "SetBorderImageSource", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageWidth", name: "BorderImageWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageWidth", name: "SetBorderImageWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeft", name: "BorderLeft", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeft", name: "SetBorderLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeftColor", name: "BorderLeftColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeftColor", name: "SetBorderLeftColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeftStyle", name: "BorderLeftStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeftStyle", name: "SetBorderLeftStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeftWidth", name: "BorderLeftWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeftWidth", name: "SetBorderLeftWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRadius", name: "BorderRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRadius", name: "SetBorderRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRight", name: "BorderRight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRight", name: "SetBorderRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRightColor", name: "BorderRightColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRightColor", name: "SetBorderRightColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRightStyle", name: "BorderRightStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRightStyle", name: "SetBorderRightStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRightWidth", name: "BorderRightWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRightWidth", name: "SetBorderRightWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderSpacing", name: "BorderSpacing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderSpacing", name: "SetBorderSpacing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderStyle", name: "BorderStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderStyle", name: "SetBorderStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTop", name: "BorderTop", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTop", name: "SetBorderTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopColor", name: "BorderTopColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopColor", name: "SetBorderTopColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopLeftRadius", name: "BorderTopLeftRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopLeftRadius", name: "SetBorderTopLeftRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopRightRadius", name: "BorderTopRightRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopRightRadius", name: "SetBorderTopRightRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopStyle", name: "BorderTopStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopStyle", name: "SetBorderTopStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopWidth", name: "BorderTopWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopWidth", name: "SetBorderTopWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderWidth", name: "BorderWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderWidth", name: "SetBorderWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Bottom", name: "Bottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBottom", name: "SetBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BoxShadow", name: "BoxShadow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBoxShadow", name: "SetBoxShadow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BoxSizing", name: "BoxSizing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBoxSizing", name: "SetBoxSizing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CaptionSide", name: "CaptionSide", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCaptionSide", name: "SetCaptionSide", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Clear", name: "Clear", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetClear", name: "SetClear", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Clip", name: "Clip", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetClip", name: "SetClip", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Color", name: "Color", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColor", name: "SetColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnCount", name: "ColumnCount", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnCount", name: "SetColumnCount", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnFill", name: "ColumnFill", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnFill", name: "SetColumnFill", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnGap", name: "ColumnGap", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnGap", name: "SetColumnGap", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRule", name: "ColumnRule", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRule", name: "SetColumnRule", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRuleColor", name: "ColumnRuleColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRuleColor", name: "SetColumnRuleColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRuleStyle", name: "ColumnRuleStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRuleStyle", name: "SetColumnRuleStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRuleWidth", name: "ColumnRuleWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRuleWidth", name: "SetColumnRuleWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Columns", name: "Columns", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumns", name: "SetColumns", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnSpan", name: "ColumnSpan", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnSpan", name: "SetColumnSpan", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnWidth", name: "ColumnWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnWidth", name: "SetColumnWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CounterIncrement", name: "CounterIncrement", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCounterIncrement", name: "SetCounterIncrement", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CounterReset", name: "CounterReset", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCounterReset", name: "SetCounterReset", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Cursor", name: "Cursor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCursor", name: "SetCursor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Direction", name: "Direction", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetDirection", name: "SetDirection", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Display", name: "Display", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetDisplay", name: "SetDisplay", pkg: "", typ: $funcType([$String], [], false)}, {prop: "EmptyCells", name: "EmptyCells", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetEmptyCells", name: "SetEmptyCells", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Filter", name: "Filter", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFilter", name: "SetFilter", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Flex", name: "Flex", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlex", name: "SetFlex", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexBasis", name: "FlexBasis", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexBasis", name: "SetFlexBasis", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexDirection", name: "FlexDirection", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexDirection", name: "SetFlexDirection", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexFlow", name: "FlexFlow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexFlow", name: "SetFlexFlow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexGrow", name: "FlexGrow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexGrow", name: "SetFlexGrow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexShrink", name: "FlexShrink", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexShrink", name: "SetFlexShrink", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexWrap", name: "FlexWrap", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexWrap", name: "SetFlexWrap", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CssFloat", name: "CssFloat", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCssFloat", name: "SetCssFloat", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Font", name: "Font", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFont", name: "SetFont", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontFamily", name: "FontFamily", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontFamily", name: "SetFontFamily", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontSize", name: "FontSize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontSize", name: "SetFontSize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontStyle", name: "FontStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontStyle", name: "SetFontStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontVariant", name: "FontVariant", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontVariant", name: "SetFontVariant", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontWeight", name: "FontWeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontWeight", name: "SetFontWeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontSizeAdjust", name: "FontSizeAdjust", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontSizeAdjust", name: "SetFontSizeAdjust", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Height", name: "Height", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetHeight", name: "SetHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "JustifyContent", name: "JustifyContent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetJustifyContent", name: "SetJustifyContent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Left", name: "Left", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetLeft", name: "SetLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "LetterSpacing", name: "LetterSpacing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetLetterSpacing", name: "SetLetterSpacing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "LineHeight", name: "LineHeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetLineHeight", name: "SetLineHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStyle", name: "ListStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStyle", name: "SetListStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStyleImage", name: "ListStyleImage", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStyleImage", name: "SetListStyleImage", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStylePosition", name: "ListStylePosition", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStylePosition", name: "SetListStylePosition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStyleType", name: "ListStyleType", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStyleType", name: "SetListStyleType", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Margin", name: "Margin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMargin", name: "SetMargin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginBottom", name: "MarginBottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginBottom", name: "SetMarginBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginLeft", name: "MarginLeft", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginLeft", name: "SetMarginLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginRight", name: "MarginRight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginRight", name: "SetMarginRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginTop", name: "MarginTop", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginTop", name: "SetMarginTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MaxHeight", name: "MaxHeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMaxHeight", name: "SetMaxHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MaxWidth", name: "MaxWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMaxWidth", name: "SetMaxWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MinHeight", name: "MinHeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMinHeight", name: "SetMinHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MinWidth", name: "MinWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMinWidth", name: "SetMinWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Opacity", name: "Opacity", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOpacity", name: "SetOpacity", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Order", name: "Order", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOrder", name: "SetOrder", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Orphans", name: "Orphans", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOrphans", name: "SetOrphans", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Outline", name: "Outline", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutline", name: "SetOutline", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineColor", name: "OutlineColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineColor", name: "SetOutlineColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineOffset", name: "OutlineOffset", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineOffset", name: "SetOutlineOffset", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineStyle", name: "OutlineStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineStyle", name: "SetOutlineStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineWidth", name: "OutlineWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineWidth", name: "SetOutlineWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Overflow", name: "Overflow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOverflow", name: "SetOverflow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OverflowX", name: "OverflowX", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOverflowX", name: "SetOverflowX", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OverflowY", name: "OverflowY", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOverflowY", name: "SetOverflowY", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Padding", name: "Padding", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPadding", name: "SetPadding", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingBottom", name: "PaddingBottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingBottom", name: "SetPaddingBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingLeft", name: "PaddingLeft", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingLeft", name: "SetPaddingLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingRight", name: "PaddingRight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingRight", name: "SetPaddingRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingTop", name: "PaddingTop", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingTop", name: "SetPaddingTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PageBreakAfter", name: "PageBreakAfter", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPageBreakAfter", name: "SetPageBreakAfter", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PageBreakBefore", name: "PageBreakBefore", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPageBreakBefore", name: "SetPageBreakBefore", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PageBreakInside", name: "PageBreakInside", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPageBreakInside", name: "SetPageBreakInside", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Perspective", name: "Perspective", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPerspective", name: "SetPerspective", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PerspectiveOrigin", name: "PerspectiveOrigin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPerspectiveOrigin", name: "SetPerspectiveOrigin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Position", name: "Position", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPosition", name: "SetPosition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Quotes", name: "Quotes", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetQuotes", name: "SetQuotes", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Resize", name: "Resize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetResize", name: "SetResize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Right", name: "Right", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetRight", name: "SetRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TableLayout", name: "TableLayout", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTableLayout", name: "SetTableLayout", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TabSize", name: "TabSize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTabSize", name: "SetTabSize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextAlign", name: "TextAlign", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextAlign", name: "SetTextAlign", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextAlignLast", name: "TextAlignLast", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextAlignLast", name: "SetTextAlignLast", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecoration", name: "TextDecoration", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecoration", name: "SetTextDecoration", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecorationColor", name: "TextDecorationColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecorationColor", name: "SetTextDecorationColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecorationLine", name: "TextDecorationLine", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecorationLine", name: "SetTextDecorationLine", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecorationStyle", name: "TextDecorationStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecorationStyle", name: "SetTextDecorationStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextIndent", name: "TextIndent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextIndent", name: "SetTextIndent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextOverflow", name: "TextOverflow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextOverflow", name: "SetTextOverflow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextShadow", name: "TextShadow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextShadow", name: "SetTextShadow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextTransform", name: "TextTransform", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextTransform", name: "SetTextTransform", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Top", name: "Top", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTop", name: "SetTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Transform", name: "Transform", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransform", name: "SetTransform", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransformOrigin", name: "TransformOrigin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransformOrigin", name: "SetTransformOrigin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransformStyle", name: "TransformStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransformStyle", name: "SetTransformStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Transition", name: "Transition", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransition", name: "SetTransition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionProperty", name: "TransitionProperty", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionProperty", name: "SetTransitionProperty", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionDuration", name: "TransitionDuration", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionDuration", name: "SetTransitionDuration", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionTimingFunction", name: "TransitionTimingFunction", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionTimingFunction", name: "SetTransitionTimingFunction", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionDelay", name: "TransitionDelay", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionDelay", name: "SetTransitionDelay", pkg: "", typ: $funcType([$String], [], false)}, {prop: "UnicodeBidi", name: "UnicodeBidi", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetUnicodeBidi", name: "SetUnicodeBidi", pkg: "", typ: $funcType([$String], [], false)}, {prop: "UserSelect", name: "UserSelect", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetUserSelect", name: "SetUserSelect", pkg: "", typ: $funcType([$String], [], false)}, {prop: "VerticalAlign", name: "VerticalAlign", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetVerticalAlign", name: "SetVerticalAlign", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Visibility", name: "Visibility", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetVisibility", name: "SetVisibility", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WhiteSpace", name: "WhiteSpace", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWhiteSpace", name: "SetWhiteSpace", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWidth", name: "SetWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WordBreak", name: "WordBreak", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWordBreak", name: "SetWordBreak", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WordSpacing", name: "WordSpacing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWordSpacing", name: "SetWordSpacing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WordWrap", name: "WordWrap", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWordWrap", name: "SetWordWrap", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Widows", name: "Widows", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWidows", name: "SetWidows", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ZIndex", name: "ZIndex", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetZIndex", name: "SetZIndex", pkg: "", typ: $funcType([$String], [], false)}];
	ptrType.methods = [{prop: "ActiveElement", name: "ActiveElement", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "CreateElement", name: "CreateElement", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "CreateTextNode", name: "CreateTextNode", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "GetElementById", name: "GetElementById", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "ClassList", name: "ClassList", pkg: "", typ: $funcType([], [ptrType$3], false)}, {prop: "InnerHTML", name: "InnerHTML", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetInnerHTML", name: "SetInnerHTML", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OuterHTML", name: "OuterHTML", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOuterHTML", name: "SetOuterHTML", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Blur", name: "Blur", pkg: "", typ: $funcType([], [], false)}, {prop: "Focus", name: "Focus", pkg: "", typ: $funcType([], [], false)}, {prop: "GetBoundingClientRect", name: "GetBoundingClientRect", pkg: "", typ: $funcType([], [ptrType$4], false)}, {prop: "QuerySelector", name: "QuerySelector", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "QuerySelectorAll", name: "QuerySelectorAll", pkg: "", typ: $funcType([$String], [sliceType], false)}, {prop: "AddEventListener", name: "AddEventListener", pkg: "", typ: $funcType([$String, funcType, sliceType$1], [], true)}, {prop: "RemoveEventListener", name: "RemoveEventListener", pkg: "", typ: $funcType([$String, funcType, sliceType$1], [], true)}, {prop: "RemoveAllChildNodes", name: "RemoveAllChildNodes", pkg: "", typ: $funcType([], [], false)}, {prop: "AppendBefore", name: "AppendBefore", pkg: "", typ: $funcType([ptrType], [], false)}, {prop: "AppendAfter", name: "AppendAfter", pkg: "", typ: $funcType([ptrType], [], false)}, {prop: "IsFocused", name: "IsFocused", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Style", name: "Style", pkg: "", typ: $funcType([], [ptrType$1], false)}, {prop: "Value", name: "Value", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetValue", name: "SetValue", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FirstChild", name: "FirstChild", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "LastChild", name: "LastChild", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "NextSibling", name: "NextSibling", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "ParentNode", name: "ParentNode", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "TextContent", name: "TextContent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextContent", name: "SetTextContent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AppendChild", name: "AppendChild", pkg: "", typ: $funcType([ptrType], [], false)}, {prop: "HasChildNodes", name: "HasChildNodes", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "InsertBefore", name: "InsertBefore", pkg: "", typ: $funcType([ptrType, ptrType], [ptrType], false)}, {prop: "IsEqualNode", name: "IsEqualNode", pkg: "", typ: $funcType([ptrType], [$Bool], false)}, {prop: "IsSameNode", name: "IsSameNode", pkg: "", typ: $funcType([ptrType], [$Bool], false)}, {prop: "RemoveChild", name: "RemoveChild", pkg: "", typ: $funcType([ptrType], [ptrType], false)}];
	ptrType$4.methods = [{prop: "X", name: "X", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Y", name: "Y", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Height", name: "Height", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Top", name: "Top", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Right", name: "Right", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Bottom", name: "Bottom", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Left", name: "Left", pkg: "", typ: $funcType([], [$Float64], false)}];
	Event.methods = [{prop: "Target", name: "Target", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [$String], false)}, {prop: "KeyCode", name: "KeyCode", pkg: "", typ: $funcType([], [$Int], false)}];
	ptrType$3.methods = [{prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Contains", name: "Contains", pkg: "", typ: $funcType([$String], [$Bool], false)}, {prop: "Add", name: "Add", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Remove", name: "Remove", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Toggle", name: "Toggle", pkg: "", typ: $funcType([$String], [], false)}];
	CSSStyleDeclaration.init("", [{prop: "Object", name: "", exported: true, typ: ptrType$2, tag: ""}]);
	Object.init("", [{prop: "Object", name: "", exported: true, typ: ptrType$2, tag: ""}]);
	DOMRect.init("", [{prop: "Object", name: "", exported: true, typ: ptrType$2, tag: ""}]);
	Event.init("", [{prop: "Object", name: "", exported: true, typ: ptrType$2, tag: ""}]);
	DOMTokenList.init("", [{prop: "Object", name: "", exported: true, typ: ptrType$2, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$pkg.Document = new Object.ptr($global.document);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, $init, acceptRange, first, acceptRanges, DecodeRuneInString;
	acceptRange = $pkg.acceptRange = $newType(0, $kindStruct, "utf8.acceptRange", true, "unicode/utf8", false, function(lo_, hi_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.lo = 0;
			this.hi = 0;
			return;
		}
		this.lo = lo_;
		this.hi = hi_;
	});
	DecodeRuneInString = function(s) {
		var $ptr, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, accept, mask, n, r, s, s0, s1, s2, s3, size, sz, x, x$1;
		r = 0;
		size = 0;
		n = s.length;
		if (n < 1) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		s0 = s.charCodeAt(0);
		x = ((s0 < 0 || s0 >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[s0]);
		if (x >= 240) {
			mask = ((x >> 0) << 31 >> 0) >> 31 >> 0;
			_tmp$2 = (((s.charCodeAt(0) >> 0) & ~mask) >> 0) | (65533 & mask);
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		sz = (x & 7) >>> 0;
		accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
		if (n < (sz >> 0)) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		s1 = s.charCodeAt(1);
		if (s1 < accept.lo || accept.hi < s1) {
			_tmp$6 = 65533;
			_tmp$7 = 1;
			r = _tmp$6;
			size = _tmp$7;
			return [r, size];
		}
		if (sz === 2) {
			_tmp$8 = ((((s0 & 31) >>> 0) >> 0) << 6 >> 0) | (((s1 & 63) >>> 0) >> 0);
			_tmp$9 = 2;
			r = _tmp$8;
			size = _tmp$9;
			return [r, size];
		}
		s2 = s.charCodeAt(2);
		if (s2 < 128 || 191 < s2) {
			_tmp$10 = 65533;
			_tmp$11 = 1;
			r = _tmp$10;
			size = _tmp$11;
			return [r, size];
		}
		if (sz === 3) {
			_tmp$12 = (((((s0 & 15) >>> 0) >> 0) << 12 >> 0) | ((((s1 & 63) >>> 0) >> 0) << 6 >> 0)) | (((s2 & 63) >>> 0) >> 0);
			_tmp$13 = 3;
			r = _tmp$12;
			size = _tmp$13;
			return [r, size];
		}
		s3 = s.charCodeAt(3);
		if (s3 < 128 || 191 < s3) {
			_tmp$14 = 65533;
			_tmp$15 = 1;
			r = _tmp$14;
			size = _tmp$15;
			return [r, size];
		}
		_tmp$16 = ((((((s0 & 7) >>> 0) >> 0) << 18 >> 0) | ((((s1 & 63) >>> 0) >> 0) << 12 >> 0)) | ((((s2 & 63) >>> 0) >> 0) << 6 >> 0)) | (((s3 & 63) >>> 0) >> 0);
		_tmp$17 = 4;
		r = _tmp$16;
		size = _tmp$17;
		return [r, size];
	};
	$pkg.DecodeRuneInString = DecodeRuneInString;
	acceptRange.init("unicode/utf8", [{prop: "lo", name: "lo", exported: false, typ: $Uint8, tag: ""}, {prop: "hi", name: "hi", exported: false, typ: $Uint8, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		first = $toNativeArray($kindUint8, [240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 19, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 35, 3, 3, 52, 4, 4, 4, 68, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241]);
		acceptRanges = $toNativeArray($kindStruct, [new acceptRange.ptr(128, 191), new acceptRange.ptr(160, 191), new acceptRange.ptr(128, 159), new acceptRange.ptr(144, 191), new acceptRange.ptr(128, 143)]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/siongui/gojianfan"] = (function() {
	var $pkg = {}, $init, utf8, sliceType, t2sMapping, s2tMapping, init, T2S, S2T;
	utf8 = $packages["unicode/utf8"];
	sliceType = $sliceType($Int32);
	init = function() {
		var $ptr, _i, _key, _key$1, _ref, _rune, _tuple, index, runeValueS, runeValueT;
		if (false) {
			$panic(new $String("cht and chs data length not equal"));
		}
		_ref = "\xE9\x8C\x92\xE7\x9A\x9A\xE8\x97\xB9\xE7\xA4\x99\xE6\x84\x9B\xE5\x99\xAF\xE5\xAC\xA1\xE7\x92\xA6\xE6\x9B\x96\xE9\x9D\x84\xE8\xAB\xB3\xE9\x8A\xA8\xE9\xB5\xAA\xE9\xAA\xAF\xE8\xA5\x96\xE5\xA5\xA7\xE5\xAA\xBC\xE9\xA9\x81\xE9\xB0\xB2\xE5\xA3\xA9\xE7\xBD\xB7\xE9\x88\x80\xE6\x93\xBA\xE6\x95\x97\xE5\x94\x84\xE9\xA0\x92\xE8\xBE\xA6\xE7\xB5\x86\xE9\x88\x91\xE5\xB9\xAB\xE7\xB6\x81\xE9\x8E\x8A\xE8\xAC\x97\xE5\x89\x9D\xE9\xA3\xBD\xE5\xAF\xB6\xE5\xA0\xB1\xE9\xAE\x91\xE9\xB4\x87\xE9\xBD\x99\xE8\xBC\xA9\xE8\xB2\x9D\xE9\x8B\x87\xE7\x8B\xBD\xE5\x82\x99\xE6\x86\x8A\xE9\xB5\xAF\xE8\xB3\x81\xE9\x8C\x9B\xE7\xB9\x83\xE7\xAD\x86\xE7\x95\xA2\xE6\x96\x83\xE5\xB9\xA3\xE9\x96\x89\xE8\x93\xBD\xE5\x97\xB6\xE6\xBD\xB7\xE9\x89\x8D\xE7\xAF\xB3\xE8\xB9\x95\xE9\x82\x8A\xE7\xB7\xA8\xE8\xB2\xB6\xE8\xAE\x8A\xE8\xBE\xAF\xE8\xBE\xAE\xE8\x8A\x90\xE7\xB7\xB6\xE7\xB1\xA9\xE6\xA8\x99\xE9\xA9\x83\xE9\xA2\xAE\xE9\xA3\x86\xE9\x8F\xA2\xE9\x91\xA3\xE9\xB0\xBE\xE9\xB1\x89\xE5\x88\xA5\xE7\x99\x9F\xE7\x80\x95\xE6\xBF\xB1\xE8\xB3\x93\xE6\x93\xAF\xE5\x84\x90\xE7\xB9\xBD\xE6\xAA\xB3\xE6\xAE\xAF\xE8\x87\x8F\xE9\x91\x8C\xE9\xAB\x95\xE9\xAC\xA2\xE9\xA4\x85\xE7\xA8\x9F\xE6\x92\xA5\xE7\xBC\xBD\xE9\x89\x91\xE9\xA7\x81\xE9\xA4\x91\xE9\x88\xB8\xE9\xB5\x93\xE8\xA3\x9C\xE9\x88\xBD\xE8\xB2\xA1\xE5\x8F\x83\xE8\xA0\xB6\xE6\xAE\x98\xE6\x85\x9A\xE6\x85\x98\xE7\x87\xA6\xE9\xA9\x82\xE9\xBB\xB2\xE8\x92\xBC\xE8\x89\x99\xE5\x80\x89\xE6\xBB\x84\xE5\xBB\x81\xE5\x81\xB4\xE5\x86\x8A\xE6\xB8\xAC\xE6\x83\xBB\xE5\xB1\xA4\xE8\xA9\xAB\xE9\x8D\xA4\xE5\x84\x95\xE9\x87\xB5\xE6\x94\x99\xE6\x91\xBB\xE8\x9F\xAC\xE9\xA5\x9E\xE8\xAE\x92\xE7\xBA\x8F\xE9\x8F\x9F\xE7\x94\xA2\xE9\x97\xA1\xE9\xA1\xAB\xE5\x9B\x85\xE8\xAB\x82\xE8\xAE\x96\xE8\x95\x86\xE6\x87\xBA\xE5\xAC\x8B\xE9\xA9\x8F\xE8\xA6\x98\xE7\xA6\xAA\xE9\x90\x94\xE5\xA0\xB4\xE5\x98\x97\xE9\x95\xB7\xE5\x84\x9F\xE8\x85\xB8\xE5\xBB\xA0\xE6\x9A\xA2\xE5\x80\x80\xE8\x90\x87\xE6\x82\xB5\xE9\x96\xB6\xE9\xAF\xA7\xE9\x88\x94\xE8\xBB\x8A\xE5\xBE\xB9\xE7\xA1\xA8\xE5\xA1\xB5\xE9\x99\xB3\xE8\xA5\xAF\xE5\x82\x96\xE8\xAB\xB6\xE6\xAB\xAC\xE7\xA3\xA3\xE9\xBD\x94\xE6\x92\x90\xE7\xA8\xB1\xE6\x87\xB2\xE8\xAA\xA0\xE9\xA8\x81\xE6\xA3\x96\xE6\xAA\x89\xE9\x8B\xAE\xE9\x90\xBA\xE7\x99\xA1\xE9\x81\xB2\xE9\xA6\xB3\xE6\x81\xA5\xE9\xBD\x92\xE7\x86\xBE\xE9\xA3\xAD\xE9\xB4\x9F\xE6\xB2\x96\xE8\xA1\x9D\xE8\x9F\xB2\xE5\xAF\xB5\xE9\x8A\x83\xE7\x96\x87\xE8\xBA\x8A\xE7\xB1\x8C\xE7\xB6\xA2\xE5\x84\x94\xE5\xB9\xAC\xE8\xAE\x8E\xE6\xAB\xA5\xE5\xBB\x9A\xE9\x8B\xA4\xE9\x9B\x9B\xE7\xA4\x8E\xE5\x84\xB2\xE8\xA7\xB8\xE8\x99\x95\xE8\x8A\xBB\xE7\xB5\x80\xE8\xBA\x95\xE5\x82\xB3\xE9\x87\xA7\xE7\x98\xA1\xE9\x97\x96\xE5\x89\xB5\xE6\x84\xB4\xE9\x8C\x98\xE7\xB6\x9E\xE7\xB4\x94\xE9\xB6\x89\xE7\xB6\xBD\xE8\xBC\x9F\xE9\xBD\xAA\xE8\xBE\xAD\xE8\xA9\x9E\xE8\xB3\x9C\xE9\xB6\xBF\xE8\x81\xB0\xE8\x94\xA5\xE5\x9B\xAA\xE5\xBE\x9E\xE5\x8F\xA2\xE8\x93\xAF\xE9\xA9\x84\xE6\xA8\x85\xE6\xB9\x8A\xE8\xBC\xB3\xE8\xBA\xA5\xE7\xAB\x84\xE6\x94\x9B\xE9\x8C\xAF\xE9\x8A\xBC\xE9\xB9\xBA\xE9\x81\x94\xE5\x99\xA0\xE9\x9F\x83\xE5\xB8\xB6\xE8\xB2\xB8\xE9\xA7\x98\xE7\xB4\xBF\xE6\x93\x94\xE5\x96\xAE\xE9\x84\xB2\xE6\x92\xA3\xE8\x86\xBD\xE6\x86\x9A\xE8\xAA\x95\xE5\xBD\x88\xE6\xAE\xAB\xE8\xB3\xA7\xE7\x99\x89\xE7\xB0\x9E\xE7\x95\xB6\xE6\x93\x8B\xE9\xBB\xA8\xE8\x95\xA9\xE6\xAA\x94\xE8\xAE\x9C\xE7\xA2\xAD\xE8\xA5\xA0\xE6\x90\x97\xE5\xB3\xB6\xE7\xA6\xB1\xE5\xB0\x8E\xE7\x9B\x9C\xE7\x87\xBE\xE7\x87\x88\xE9\x84\xA7\xE9\x90\x99\xE6\x95\xB5\xE6\xBB\x8C\xE9\x81\x9E\xE7\xB7\xA0\xE7\xB3\xB4\xE8\xA9\x86\xE8\xAB\xA6\xE7\xB6\x88\xE8\xA6\xBF\xE9\x8F\x91\xE9\xA1\x9B\xE9\xBB\x9E\xE5\xA2\x8A\xE9\x9B\xBB\xE5\xB7\x94\xE9\x88\xBF\xE7\x99\xB2\xE9\x87\xA3\xE8\xAA\xBF\xE9\x8A\x9A\xE9\xAF\x9B\xE8\xAB\x9C\xE7\x96\x8A\xE9\xB0\x88\xE9\x87\x98\xE9\xA0\x82\xE9\x8C\xA0\xE8\xA8\x82\xE9\x8B\x8C\xE4\xB8\x9F\xE9\x8A\xA9\xE6\x9D\xB1\xE5\x8B\x95\xE6\xA3\x9F\xE5\x87\x8D\xE5\xB4\xA0\xE9\xB6\x87\xE7\xAB\x87\xE7\x8A\xA2\xE7\x8D\xA8\xE8\xAE\x80\xE8\xB3\xAD\xE9\x8D\x8D\xE7\x80\x86\xE6\xAB\x9D\xE7\x89\x98\xE7\xAF\xA4\xE9\xBB\xB7\xE9\x8D\x9B\xE6\x96\xB7\xE7\xB7\x9E\xE7\xB1\xAA\xE5\x85\x8C\xE9\x9A\x8A\xE5\xB0\x8D\xE6\x87\x9F\xE9\x90\x93\xE5\x99\xB8\xE9\xA0\x93\xE9\x88\x8D\xE7\x87\x89\xE8\xBA\x89\xE5\xA5\xAA\xE5\xA2\xAE\xE9\x90\xB8\xE9\xB5\x9D\xE9\xA1\x8D\xE8\xA8\x9B\xE6\x83\xA1\xE9\xA4\x93\xE8\xAB\xA4\xE5\xA0\x8A\xE9\x96\xBC\xE8\xBB\x9B\xE9\x8B\xA8\xE9\x8D\x94\xE9\xB6\x9A\xE9\xA1\x8E\xE9\xA1\x93\xE9\xB1\xB7\xE8\xAA\x92\xE5\x85\x92\xE7\x88\xBE\xE9\xA4\x8C\xE8\xB2\xB3\xE9\x82\x87\xE9\x89\xBA\xE9\xB4\xAF\xE9\xAE\x9E\xE7\x99\xBC\xE7\xBD\xB0\xE9\x96\xA5\xE7\x90\xBA\xE7\xA4\xAC\xE9\x87\xA9\xE7\x85\xA9\xE8\xB2\xA9\xE9\xA3\xAF\xE8\xA8\xAA\xE7\xB4\xA1\xE9\x88\x81\xE9\xAD\xB4\xE9\xA3\x9B\xE8\xAA\xB9\xE5\xBB\xA2\xE8\xB2\xBB\xE7\xB7\x8B\xE9\x90\xA8\xE9\xAF\xA1\xE7\xB4\x9B\xE5\xA2\xB3\xE5\xA5\xAE\xE6\x86\xA4\xE7\xB3\x9E\xE5\x83\xA8\xE8\xB1\x90\xE6\xA5\x93\xE9\x8B\x92\xE9\xA2\xA8\xE7\x98\x8B\xE9\xA6\xAE\xE7\xB8\xAB\xE8\xAB\xB7\xE9\xB3\xB3\xE7\x81\x83\xE8\x86\x9A\xE8\xBC\xBB\xE6\x92\xAB\xE8\xBC\x94\xE8\xB3\xA6\xE5\xBE\xA9\xE8\xB2\xA0\xE8\xA8\x83\xE5\xA9\xA6\xE7\xB8\x9B\xE9\xB3\xA7\xE9\xA7\x99\xE7\xB4\xB1\xE7\xB4\xBC\xE8\xB3\xBB\xE9\xBA\xA9\xE9\xAE\x92\xE9\xB0\x92\xE9\x87\x93\xE8\xA9\xB2\xE9\x88\xA3\xE8\x93\x8B\xE8\xB3\x85\xE6\xA1\xBF\xE8\xB6\x95\xE7\xA8\x88\xE8\xB4\x9B\xE5\xB0\xB7\xE6\x90\x9F\xE7\xB4\xBA\xE5\xB2\xA1\xE5\x89\x9B\xE9\x8B\xBC\xE7\xB6\xB1\xE5\xB4\x97\xE6\x88\x87\xE9\x8E\xAC\xE7\x9D\xAA\xE8\xAA\xA5\xE7\xB8\x9E\xE9\x8B\xAF\xE6\x93\xB1\xE9\xB4\xBF\xE9\x96\xA3\xE9\x89\xBB\xE5\x80\x8B\xE7\xB4\x87\xE9\x8E\x98\xE6\xBD\x81\xE7\xB5\xA6\xE4\xBA\x99\xE8\xB3\xA1\xE7\xB6\x86\xE9\xAF\x81\xE9\xBE\x94\xE5\xAE\xAE\xE9\x9E\x8F\xE8\xB2\xA2\xE9\x89\xA4\xE6\xBA\x9D\xE8\x8C\x8D\xE6\xA7\x8B\xE8\xB3\xBC\xE5\xA4\xA0\xE8\xA9\xAC\xE7\xB7\xB1\xE8\xA6\xAF\xE8\xA0\xB1\xE9\xA1\xA7\xE8\xA9\x81\xE8\xBD\x82\xE9\x88\xB7\xE9\x8C\xAE\xE9\xB4\xA3\xE9\xB5\xA0\xE9\xB6\xBB\xE5\x89\xAE\xE6\x8E\x9B\xE9\xB4\xB0\xE6\x91\x91\xE9\x97\x9C\xE8\xA7\x80\xE9\xA4\xA8\xE6\x85\xA3\xE8\xB2\xAB\xE8\xA9\xBF\xE6\x91\x9C\xE9\xB8\x9B\xE9\xB0\xA5\xE5\xBB\xA3\xE7\x8D\xB7\xE8\xA6\x8F\xE6\xAD\xB8\xE9\xBE\x9C\xE9\x96\xA8\xE8\xBB\x8C\xE8\xA9\xAD\xE8\xB2\xB4\xE5\x8A\x8A\xE5\x8C\xAD\xE5\x8A\x8C\xE5\xAA\xAF\xE6\xAA\x9C\xE9\xAE\xAD\xE9\xB1\x96\xE8\xBC\xA5\xE6\xBB\xBE\xE8\xA2\x9E\xE7\xB7\x84\xE9\xAF\x80\xE9\x8D\x8B\xE5\x9C\x8B\xE9\x81\x8E\xE5\xA0\x9D\xE5\x92\xBC\xE5\xB9\x97\xE6\xA7\xA8\xE8\x9F\x88\xE9\x89\xBF\xE9\xA7\xAD\xE9\x9F\x93\xE6\xBC\xA2\xE9\x97\x9E\xE7\xB5\x8E\xE9\xA0\xA1\xE8\x99\x9F\xE7\x81\x9D\xE9\xA1\xA5\xE9\x96\xA1\xE9\xB6\xB4\xE8\xB3\x80\xE8\xA8\xB6\xE9\x97\x94\xE8\xA0\xA3\xE6\xA9\xAB\xE8\xBD\x9F\xE9\xB4\xBB\xE7\xB4\x85\xE9\xBB\x8C\xE8\xA8\x8C\xE8\x91\x92\xE9\x96\x8E\xE9\xB1\x9F\xE5\xA3\xBA\xE8\xAD\xB7\xE6\xBB\xAC\xE6\x88\xB6\xE6\xBB\xB8\xE9\xB6\x98\xE5\x98\xA9\xE8\x8F\xAF\xE7\x95\xAB\xE5\x8A\x83\xE8\xA9\xB1\xE9\xA9\x8A\xE6\xA8\xBA\xE9\x8F\xB5\xE6\x87\xB7\xE5\xA3\x9E\xE6\xAD\xA1\xE7\x92\xB0\xE9\x82\x84\xE7\xB7\xA9\xE6\x8F\x9B\xE5\x96\x9A\xE7\x98\x93\xE7\x85\xA5\xE6\xB8\x99\xE5\xA5\x90\xE7\xB9\xAF\xE9\x8D\xB0\xE9\xAF\x87\xE9\xBB\x83\xE8\xAC\x8A\xE9\xB0\x89\xE6\x8F\xAE\xE8\xBC\x9D\xE6\xAF\x80\xE8\xB3\x84\xE7\xA9\xA2\xE6\x9C\x83\xE7\x87\xB4\xE5\x8C\xAF\xE8\xAB\xB1\xE8\xAA\xA8\xE7\xB9\xAA\xE8\xA9\xBC\xE8\x96\x88\xE5\x99\xA6\xE6\xBE\xAE\xE7\xB9\xA2\xE7\x90\xBF\xE6\x9A\x89\xE8\x91\xB7\xE6\xB8\xBE\xE8\xAB\xA2\xE9\xA4\x9B\xE9\x96\xBD\xE7\x8D\xB2\xE8\xB2\xA8\xE7\xA6\x8D\xE9\x88\xA5\xE9\x91\x8A\xE6\x93\x8A\xE6\xA9\x9F\xE7\xA9\x8D\xE9\xA5\x91\xE8\xB7\xA1\xE8\xAD\x8F\xE9\x9B\x9E\xE7\xB8\xBE\xE7\xB7\x9D\xE6\xA5\xB5\xE8\xBC\xAF\xE7\xB4\x9A\xE6\x93\xA0\xE5\xB9\xBE\xE8\x96\x8A\xE5\x8A\x91\xE6\xBF\x9F\xE8\xA8\x88\xE8\xA8\x98\xE9\x9A\x9B\xE7\xB9\xBC\xE7\xB4\x80\xE8\xA8\x90\xE8\xA9\xB0\xE8\x96\xBA\xE5\x98\xB0\xE5\x9A\x8C\xE9\xA9\xA5\xE7\x92\xA3\xE8\xA6\xAC\xE9\xBD\x8F\xE7\xA3\xAF\xE7\xBE\x88\xE8\xA0\x86\xE8\xBA\x8B\xE9\x9C\xBD\xE9\xB1\xAD\xE9\xAF\xBD\xE5\xA4\xBE\xE8\x8E\xA2\xE9\xA0\xB0\xE8\xB3\x88\xE9\x89\x80\xE5\x83\xB9\xE9\xA7\x95\xE9\x83\x9F\xE6\xB5\xB9\xE9\x8B\x8F\xE9\x8E\xB5\xE8\x9F\xAF\xE6\xAE\xB2\xE7\x9B\xA3\xE5\xA0\x85\xE7\xAE\x8B\xE9\x96\x93\xE8\x89\xB1\xE7\xB7\x98\xE7\xB9\xAD\xE6\xAA\xA2\xE5\xA0\xBF\xE9\xB9\xBC\xE6\x8F\x80\xE6\x92\xBF\xE7\xB0\xA1\xE5\x84\x89\xE6\xB8\x9B\xE8\x96\xA6\xE6\xAA\xBB\xE9\x91\x92\xE8\xB8\x90\xE8\xB3\xA4\xE8\xA6\x8B\xE9\x8D\xB5\xE8\x89\xA6\xE5\x8A\x8D\xE9\xA4\x9E\xE6\xBC\xB8\xE6\xBF\xBA\xE6\xBE\x97\xE8\xAB\xAB\xE7\xB8\x91\xE6\x88\x94\xE6\x88\xA9\xE7\x9E\xBC\xE9\xB6\xBC\xE7\xAD\xA7\xE9\xB0\xB9\xE9\x9F\x89\xE5\xB0\x87\xE6\xBC\xBF\xE8\x94\xA3\xE6\xA7\xB3\xE7\x8D\x8E\xE8\xAC\x9B\xE9\x86\xAC\xE7\xB5\xB3\xE9\x9F\x81\xE8\x86\xA0\xE6\xBE\x86\xE9\xA9\x95\xE5\xAC\x8C\xE6\x94\xAA\xE9\x89\xB8\xE7\x9F\xAF\xE5\x83\xA5\xE8\x85\xB3\xE9\xA4\x83\xE7\xB9\xB3\xE7\xB5\x9E\xE8\xBD\x8E\xE8\xBC\x83\xE6\x92\x9F\xE5\xB6\xA0\xE9\xB7\xA6\xE9\xAE\xAB\xE9\x9A\x8E\xE7\xAF\x80\xE6\xBD\x94\xE7\xB5\x90\xE8\xAA\xA1\xE5\xB1\x86\xE7\x99\xA4\xE9\xA0\x9C\xE9\xAE\x9A\xE7\xB7\x8A\xE9\x8C\xA6\xE5\x83\x85\xE8\xAC\xB9\xE9\x80\xB2\xE6\x99\x89\xE7\x87\xBC\xE7\x9B\xA1\xE5\x8B\x81\xE8\x8D\x8A\xE8\x8E\x96\xE5\xB7\xB9\xE8\x97\x8E\xE9\xA5\x89\xE7\xB8\x89\xE8\xB4\x90\xE8\xA6\xB2\xE9\xAF\xA8\xE9\xA9\x9A\xE7\xB6\x93\xE9\xA0\xB8\xE9\x9D\x9C\xE9\x8F\xA1\xE5\xBE\x91\xE7\x97\x99\xE7\xAB\xB6\xE5\x87\x88\xE5\x89\x84\xE6\xB6\x87\xE9\x80\x95\xE5\xBC\xB3\xE8\x84\x9B\xE9\x9D\x9A\xE7\xB3\xBE\xE5\xBB\x84\xE8\x88\x8A\xE9\xAC\xAE\xE9\xB3\xA9\xE9\xB7\xB2\xE9\xA7\x92\xE8\x88\x89\xE6\x93\x9A\xE9\x8B\xB8\xE6\x87\xBC\xE5\x8A\x87\xE8\xA9\x8E\xE5\xB1\xA8\xE6\xAB\xB8\xE9\xA2\xB6\xE9\x89\x85\xE9\x8B\xA6\xE7\xAA\xB6\xE9\xBD\x9F\xE9\xB5\x91\xE7\xB5\xB9\xE9\x8C\x88\xE9\x90\xAB\xE9\x9B\x8B\xE8\xA6\xBA\xE6\xB1\xBA\xE7\xB5\x95\xE8\xAD\x8E\xE7\x8E\xA8\xE9\x88\x9E\xE8\xBB\x8D\xE9\xA7\xBF\xE7\x9A\xB8\xE9\x96\x8B\xE5\x87\xB1\xE5\x89\xB4\xE5\xA1\x8F\xE6\x84\xBE\xE6\x84\xB7\xE9\x8E\xA7\xE9\x8D\x87\xE9\xBE\x95\xE9\x96\x8C\xE9\x88\xA7\xE9\x8A\xAC\xE9\xA1\x86\xE6\xAE\xBC\xE8\xAA\xB2\xE9\xA8\x8D\xE7\xB7\x99\xE8\xBB\xBB\xE9\x88\xB3\xE9\x8C\x81\xE9\xA0\xB7\xE5\xA2\xBE\xE6\x87\x87\xE9\xBD\xA6\xE9\x8F\x97\xE6\x91\xB3\xE5\xBA\xAB\xE8\xA4\xB2\xE5\x9A\xB3\xE5\xA1\x8A\xE5\x84\x88\xE9\x84\xB6\xE5\x99\xB2\xE8\x86\xBE\xE5\xAF\xAC\xE7\x8D\xAA\xE9\xAB\x96\xE7\xA4\xA6\xE6\x9B\xA0\xE6\xB3\x81\xE8\xAA\x86\xE8\xAA\x91\xE9\x84\xBA\xE5\xA3\x99\xE7\xBA\x8A\xE8\xB2\xBA\xE8\x99\xA7\xE5\xB7\x8B\xE7\xAA\xBA\xE9\xA5\x8B\xE6\xBD\xB0\xE5\x8C\xB1\xE8\x95\xA2\xE6\x86\x92\xE8\x81\xB5\xE7\xB0\xA3\xE9\x96\xAB\xE9\x8C\x95\xE9\xAF\xA4\xE6\x93\xB4\xE9\x97\x8A\xE8\xA0\x90\xE8\xA0\x9F\xE8\x87\x98\xE8\x90\x8A\xE4\xBE\x86\xE8\xB3\xB4\xE5\xB4\x8D\xE5\xBE\xA0\xE6\xB7\xB6\xE7\x80\xA8\xE8\xB3\x9A\xE7\x9D\x9E\xE9\x8C\xB8\xE7\x99\xA9\xE7\xB1\x9F\xE8\x97\x8D\xE6\xAC\x84\xE6\x94\x94\xE7\xB1\x83\xE9\x97\x8C\xE8\x98\xAD\xE7\x80\xBE\xE8\xAE\x95\xE6\x94\xAC\xE8\xA6\xBD\xE6\x87\xB6\xE7\xBA\x9C\xE7\x88\x9B\xE6\xBF\xAB\xE5\xB5\x90\xE6\xAC\x96\xE6\x96\x95\xE9\x91\xAD\xE8\xA5\xA4\xE7\x91\xAF\xE9\x96\xAC\xE9\x8B\x83\xE6\x92\x88\xE5\x8B\x9E\xE6\xBE\x87\xE5\x98\xAE\xE5\xB6\x97\xE9\x8A\xA0\xE9\x90\x92\xE7\x99\x86\xE6\xA8\x82\xE9\xB0\xB3\xE9\x90\xB3\xE5\xA3\x98\xE9\xA1\x9E\xE6\xB7\x9A\xE8\xAA\x84\xE7\xB8\xB2\xE7\xB1\xAC\xE8\xB2\x8D\xE9\x9B\xA2\xE9\xAF\x89\xE7\xA6\xAE\xE9\xBA\x97\xE5\x8E\xB2\xE5\x8B\xB5\xE7\xA4\xAB\xE6\xAD\xB7\xE7\x80\x9D\xE9\x9A\xB8\xE5\x84\xB7\xE9\x85\x88\xE5\xA3\xA2\xE8\x97\xB6\xE8\x92\x9E\xE8\x98\xBA\xE5\x9A\xA6\xE9\x82\x90\xE9\xA9\xAA\xE7\xB8\xAD\xE6\xAB\xAA\xE6\xAB\x9F\xE8\xBD\xA2\xE7\xA4\xAA\xE9\x8B\xB0\xE9\xB8\x9D\xE7\x99\x98\xE7\xB3\xB2\xE8\xBA\x92\xE9\x9D\x82\xE9\xB1\xBA\xE9\xB1\xA7\xE5\x80\x86\xE8\x81\xAF\xE8\x93\xAE\xE9\x80\xA3\xE9\x90\xAE\xE6\x86\x90\xE6\xBC\xA3\xE7\xB0\xBE\xE6\x96\x82\xE8\x87\x89\xE9\x8F\x88\xE6\x88\x80\xE7\x85\x89\xE7\xB7\xB4\xE8\x98\x9E\xE5\xA5\xA9\xE7\x80\xB2\xE7\x92\x89\xE6\xAE\xAE\xE8\xA4\xB3\xE8\xA5\x9D\xE9\xB0\xB1\xE7\xB3\xA7\xE6\xB6\xBC\xE5\x85\xA9\xE8\xBC\x9B\xE8\xAB\x92\xE9\xAD\x8E\xE7\x99\x82\xE9\x81\xBC\xE9\x90\x90\xE7\xB9\x9A\xE9\x87\x95\xE9\xB7\xAF\xE7\x8D\xB5\xE8\x87\xA8\xE9\x84\xB0\xE9\xB1\x97\xE5\x87\x9C\xE8\xB3\x83\xE8\x97\xBA\xE5\xBB\xA9\xE6\xAA\x81\xE8\xBD\x94\xE8\xBA\xAA\xE9\xBD\xA1\xE9\x88\xB4\xE9\x9D\x88\xE5\xB6\xBA\xE9\xA0\x98\xE7\xB6\xBE\xE6\xAC\x9E\xE8\x9F\xB6\xE9\xAF\xAA\xE9\xA4\xBE\xE5\x8A\x89\xE7\x80\x8F\xE9\xA8\xAE\xE7\xB6\xB9\xE9\x8E\xA6\xE9\xB7\x9A\xE9\xBE\x8D\xE8\x81\xBE\xE5\x9A\xA8\xE7\xB1\xA0\xE5\xA3\x9F\xE6\x94\x8F\xE9\x9A\xB4\xE8\x98\xA2\xE7\x80\xA7\xE7\x93\x8F\xE6\xAB\xB3\xE6\x9C\xA7\xE7\xA4\xB1\xE6\xA8\x93\xE5\xA9\x81\xE6\x91\x9F\xE7\xB0\x8D\xE5\x83\x82\xE8\x94\x9E\xE5\x98\x8D\xE5\xB6\x81\xE9\x8F\xA4\xE7\x98\xBA\xE8\x80\xAC\xE8\x9E\xBB\xE9\xAB\x8F\xE8\x98\x86\xE7\x9B\xA7\xE9\xA1\xB1\xE5\xBB\xAC\xE7\x88\x90\xE6\x93\x84\xE9\xB9\xB5\xE8\x99\x9C\xE9\xAD\xAF\xE8\xB3\x82\xE7\xA5\xBF\xE9\x8C\x84\xE9\x99\xB8\xE5\xA3\x9A\xE6\x93\xBC\xE5\x9A\x95\xE9\x96\xAD\xE7\x80\x98\xE6\xB7\xA5\xE6\xAB\xA8\xE6\xAB\x93\xE8\xBD\xA4\xE8\xBC\x85\xE8\xBD\x86\xE6\xB0\x8C\xE8\x87\x9A\xE9\xB8\x95\xE9\xB7\xBA\xE8\x89\xAB\xE9\xB1\xB8\xE5\xB7\x92\xE6\x94\xA3\xE5\xAD\xBF\xE7\x81\xA4\xE4\xBA\x82\xE8\x87\xA0\xE5\xAD\x8C\xE6\xAC\x92\xE9\xB8\x9E\xE9\x91\xBE\xE6\x8E\x84\xE8\xBC\xAA\xE5\x80\xAB\xE4\xBE\x96\xE6\xB7\xAA\xE7\xB6\xB8\xE8\xAB\x96\xE5\x9C\x87\xE8\x98\xBF\xE7\xBE\x85\xE9\x82\x8F\xE9\x91\xBC\xE7\xB1\xAE\xE9\xA8\xBE\xE9\xA7\xB1\xE7\xB5\xA1\xE7\x8A\x96\xE7\x8E\x80\xE6\xBF\xBC\xE6\xAC\x8F\xE8\x85\xA1\xE9\x8F\x8D\xE9\xA9\xA2\xE5\x91\x82\xE9\x8B\x81\xE4\xBE\xB6\xE5\xB1\xA2\xE7\xB8\xB7\xE6\x85\xAE\xE6\xBF\xBE\xE7\xB6\xA0\xE6\xAB\x9A\xE8\xA4\xB8\xE9\x8B\x9D\xE5\x98\xB8\xE5\xAA\xBD\xE7\x91\xAA\xE7\xA2\xBC\xE8\x9E\x9E\xE9\xA6\xAC\xE7\xBD\xB5\xE5\x97\x8E\xE5\x98\x9C\xE5\xAC\xA4\xE6\xA6\xAA\xE8\xB2\xB7\xE9\xBA\xA5\xE8\xB3\xA3\xE9\x82\x81\xE8\x84\x88\xE5\x8B\xB1\xE7\x9E\x9E\xE9\xA5\x85\xE8\xA0\xBB\xE6\xBB\xBF\xE8\xAC\xBE\xE7\xB8\xB5\xE9\x8F\x9D\xE9\xA1\x99\xE9\xB0\xBB\xE8\xB2\x93\xE9\x8C\xA8\xE9\x89\x9A\xE8\xB2\xBF\xE9\xBA\xBC\xE6\xB2\x92\xE9\x8E\x82\xE9\x96\x80\xE6\x82\xB6\xE5\x80\x91\xE6\x8D\xAB\xE7\x87\x9C\xE6\x87\xA3\xE9\x8D\x86\xE9\x8C\xB3\xE5\xA4\xA2\xE7\x9E\x87\xE8\xAC\x8E\xE5\xBD\x8C\xE8\xA6\x93\xE5\x86\xAA\xE7\xBE\x8B\xE8\xAC\x90\xE7\x8D\xBC\xE7\xA6\xB0\xE7\xB6\xBF\xE7\xB7\xAC\xE6\xBE\xA0\xE9\x9D\xA6\xE9\xBB\xBD\xE5\xBB\x9F\xE7\xB7\xB2\xE7\xB9\x86\xE6\xBB\x85\xE6\x86\xAB\xE9\x96\xA9\xE9\x96\x94\xE7\xB7\xA1\xE9\xB3\xB4\xE9\x8A\x98\xE8\xAC\xAC\xE8\xAC\xA8\xE9\xA9\x80\xE9\xA5\x83\xE6\xAD\xBF\xE9\x8F\x8C\xE8\xAC\x80\xE7\x95\x9D\xE9\x89\xAC\xE5\x90\xB6\xE9\x88\x89\xE7\xB4\x8D\xE9\x9B\xA3\xE6\x92\x93\xE8\x85\xA6\xE6\x83\xB1\xE9\xAC\xA7\xE9\x90\x83\xE8\xA8\xA5\xE9\xA4\x92\xE5\x85\xA7\xE6\x93\xAC\xE8\x86\xA9\xE9\x88\xAE\xE9\xAF\xA2\xE6\x94\x86\xE8\xBC\xA6\xE9\xAF\xB0\xE9\x87\x80\xE9\xB3\xA5\xE8\x94\xA6\xE8\xA3\x8A\xE8\x81\xB6\xE5\x9A\x99\xE9\x91\xB7\xE9\x8E\xB3\xE9\x9A\x89\xE8\x98\x97\xE5\x9B\x81\xE9\xA1\xA2\xE8\xBA\xA1\xE6\xAA\xB8\xE7\x8D\xB0\xE5\xAF\xA7\xE6\x93\xB0\xE6\xBF\x98\xE8\x8B\xA7\xE5\x9A\x80\xE8\x81\xB9\xE9\x88\x95\xE7\xB4\x90\xE8\x86\xBF\xE6\xBF\x83\xE8\xBE\xB2\xE5\x84\x82\xE5\x99\xA5\xE9\xA7\x91\xE9\x87\xB9\xE8\xAB\xBE\xE5\x84\xBA\xE7\x98\xA7\xE6\xAD\x90\xE9\xB7\x97\xE6\xAF\x86\xE5\x98\x94\xE6\xBC\x9A\xE8\xAC\xB3\xE6\x85\xAA\xE7\x94\x8C\xE7\x9B\xA4\xE8\xB9\xA3\xE9\xBE\x90\xE6\x8B\x8B\xE7\x9A\xB0\xE8\xB3\xA0\xE8\xBD\xA1\xE5\x99\xB4\xE9\xB5\xAC\xE7\xB4\x95\xE7\xBE\x86\xE9\x88\xB9\xE9\xA8\x99\xE8\xAB\x9E\xE9\xA7\xA2\xE9\xA3\x84\xE7\xB8\xB9\xE9\xA0\xBB\xE8\xB2\xA7\xE5\xAC\xAA\xE8\x98\x8B\xE6\x86\x91\xE8\xA9\x95\xE6\xBD\x91\xE9\xA0\x97\xE9\x87\x99\xE6\x92\xB2\xE9\x8B\xAA\xE6\xA8\xB8\xE8\xAD\x9C\xE9\x8F\xB7\xE9\x90\xA0\xE6\xA3\xB2\xE8\x87\x8D\xE9\xBD\x8A\xE9\xA8\x8E\xE8\xB1\x88\xE5\x95\x9F\xE6\xB0\xA3\xE6\xA3\x84\xE8\xA8\x96\xE8\x98\x84\xE9\xA8\x8F\xE7\xB6\xBA\xE6\xA6\xBF\xE7\xA3\xA7\xE9\xA0\x8E\xE9\xA0\x8F\xE9\xB0\xAD\xE7\x89\xBD\xE9\x87\xAC\xE9\x89\x9B\xE9\x81\xB7\xE7\xB0\xBD\xE8\xAC\x99\xE9\x8C\xA2\xE9\x89\x97\xE6\xBD\x9B\xE6\xB7\xBA\xE8\xAD\xB4\xE5\xA1\xB9\xE5\x83\x89\xE8\x95\x81\xE6\x85\xB3\xE9\xA8\xAB\xE7\xB9\xBE\xE6\xA7\xA7\xE9\x88\x90\xE6\xA7\x8D\xE5\x97\x86\xE5\xA2\xBB\xE8\x96\x94\xE5\xBC\xB7\xE6\x90\xB6\xE5\xAC\x99\xE6\xAA\xA3\xE6\x88\xA7\xE7\x86\x97\xE9\x8C\x86\xE9\x8F\x98\xE9\x8F\xB9\xE7\xBE\xA5\xE8\xB9\x8C\xE9\x8D\xAC\xE6\xA9\x8B\xE5\x96\xAC\xE5\x83\x91\xE7\xBF\xB9\xE7\xAB\x85\xE8\xAA\x9A\xE8\xAD\x99\xE8\x95\x8E\xE7\xB9\xB0\xE7\xA3\xBD\xE8\xB9\xBA\xE7\xAB\x8A\xE6\x84\x9C\xE9\x8D\xA5\xE7\xAF\x8B\xE6\xAC\xBD\xE8\xA6\xAA\xE5\xAF\xA2\xE9\x8B\x9F\xE8\xBC\x95\xE6\xB0\xAB\xE5\x82\xBE\xE9\xA0\x83\xE8\xAB\x8B\xE6\x85\xB6\xE6\x92\xB3\xE9\xAF\x96\xE7\x93\x8A\xE7\xAA\xAE\xE7\x85\xA2\xE8\x9B\xBA\xE5\xB7\xB0\xE8\xB3\x95\xE8\x9F\xA3\xE9\xB0\x8D\xE8\xB6\xA8\xE5\x8D\x80\xE8\xBB\x80\xE9\xA9\x85\xE9\xBD\xB2\xE8\xA9\x98\xE5\xB6\x87\xE9\x97\x83\xE8\xA6\xB7\xE9\xB4\x9D\xE9\xA1\xB4\xE6\xAC\x8A\xE5\x8B\xB8\xE8\xA9\xAE\xE7\xB6\xA3\xE8\xBC\x87\xE9\x8A\x93\xE5\x8D\xBB\xE9\xB5\xB2\xE7\xA2\xBA\xE9\x97\x8B\xE9\x97\x95\xE6\x84\xA8\xE8\xAE\x93\xE9\xA5\x92\xE6\x93\xBE\xE7\xB9\x9E\xE8\x95\x98\xE5\xAC\x88\xE6\xA9\x88\xE7\x86\xB1\xE9\x9F\x8C\xE8\xAA\x8D\xE7\xB4\x89\xE9\xA3\xAA\xE8\xBB\x94\xE6\xA6\xAE\xE7\xB5\xA8\xE5\xB6\xB8\xE8\xA0\x91\xE7\xB8\x9F\xE9\x8A\xA3\xE9\xA1\xB0\xE8\xBB\x9F\xE9\x8A\xB3\xE8\x9C\x86\xE9\x96\x8F\xE6\xBD\xA4\xE7\x81\x91\xE8\x96\xA9\xE9\xA2\xAF\xE9\xB0\x93\xE8\xB3\xBD\xE5\x82\x98\xE6\xAF\xBF\xE7\xB3\x9D\xE5\x96\xAA\xE9\xA8\xB7\xE6\x8E\x83\xE7\xB9\x85\xE6\xBE\x80\xE5\x97\x87\xE9\x8A\xAB\xE7\xA9\xA1\xE6\xAE\xBA\xE5\x89\x8E\xE7\xB4\x97\xE9\x8E\xA9\xE9\xAF\x8A\xE7\xAF\xA9\xE6\x9B\xAC\xE9\x87\x83\xE5\x88\xAA\xE9\x96\x83\xE9\x99\x9C\xE8\xB4\x8D\xE7\xB9\x95\xE8\xA8\x95\xE5\xA7\x8D\xE9\xA8\xB8\xE9\x87\xA4\xE9\xB1\x94\xE5\xA2\x91\xE5\x82\xB7\xE8\xB3\x9E\xE5\x9D\xB0\xE6\xAE\xA4\xE8\xA7\xB4\xE7\x87\x92\xE7\xB4\xB9\xE8\xB3\x92\xE6\x94\x9D\xE6\x87\xBE\xE8\xA8\xAD\xE5\x8E\x99\xE7\x81\x84\xE7\x95\xAC\xE7\xB4\xB3\xE5\xAF\xA9\xE5\xAC\xB8\xE8\x85\x8E\xE6\xBB\xB2\xE8\xA9\xB5\xE8\xAB\x97\xE7\x80\x8B\xE8\x81\xB2\xE7\xB9\xA9\xE5\x8B\x9D\xE5\xB8\xAB\xE7\x8D\x85\xE6\xBF\x95\xE8\xA9\xA9\xE6\x99\x82\xE8\x9D\x95\xE5\xAF\xA6\xE8\xAD\x98\xE9\xA7\x9B\xE5\x8B\xA2\xE9\x81\xA9\xE9\x87\x8B\xE9\xA3\xBE\xE8\xA6\x96\xE8\xA9\xA6\xE8\xAC\x9A\xE5\xA1\x92\xE8\x92\x94\xE5\xBC\x92\xE8\xBB\xBE\xE8\xB2\xB0\xE9\x88\xB0\xE9\xB0\xA3\xE5\xA3\xBD\xE7\x8D\xB8\xE7\xB6\xAC\xE6\xA8\x9E\xE8\xBC\xB8\xE6\x9B\xB8\xE8\xB4\x96\xE5\xB1\xAC\xE8\xA1\x93\xE6\xA8\xB9\xE8\xB1\x8E\xE6\x95\xB8\xE6\x94\x84\xE7\xB4\x93\xE5\xB8\xA5\xE9\x96\x82\xE9\x9B\x99\xE8\xAA\xB0\xE7\xA8\x85\xE9\xA0\x86\xE8\xAA\xAA\xE7\xA2\xA9\xE7\x88\x8D\xE9\x91\xA0\xE7\xB5\xB2\xE9\xA3\xBC\xE5\xBB\x9D\xE9\xA7\x9F\xE7\xB7\xA6\xE9\x8D\xB6\xE9\xB7\xA5\xE8\x81\xB3\xE6\x85\xAB\xE9\xA0\x8C\xE8\xA8\x9F\xE8\xAA\xA6\xE6\x93\xBB\xE8\x97\xAA\xE9\xA4\xBF\xE9\xA2\xBC\xE9\x8E\xAA\xE8\x98\x87\xE8\xA8\xB4\xE8\x82\x85\xE8\xAC\x96\xE7\xA9\x8C\xE9\x9B\x96\xE9\x9A\xA8\xE7\xB6\x8F\xE6\xAD\xB2\xE8\xAA\xB6\xE5\xAD\xAB\xE6\x90\x8D\xE7\xAD\x8D\xE8\x93\x80\xE7\x8C\xBB\xE7\xB8\xAE\xE7\x91\xA3\xE9\x8E\x96\xE5\x97\xA9\xE8\x84\xA7\xE7\x8D\xBA\xE6\x92\xBB\xE9\x97\xA5\xE9\x89\x88\xE9\xB0\xA8\xE8\x87\xBA\xE6\x85\x8B\xE9\x88\xA6\xE9\xAE\x90\xE6\x94\xA4\xE8\xB2\xAA\xE7\x99\xB1\xE7\x81\x98\xE5\xA3\x87\xE8\xAD\x9A\xE8\xAB\x87\xE5\x98\x86\xE6\x9B\x87\xE9\x89\xAD\xE9\x8C\x9F\xE9\xA0\x87\xE6\xB9\xAF\xE7\x87\x99\xE5\x84\xBB\xE9\xA4\xB3\xE9\x90\x8B\xE9\x8F\x9C\xE6\xBF\xA4\xE7\xB5\xB3\xE8\xA8\x8E\xE9\x9F\x9C\xE9\x8B\xB1\xE9\xA8\xB0\xE8\xAC\x84\xE9\x8A\xBB\xE9\xA1\x8C\xE9\xAB\x94\xE5\xB1\x9C\xE7\xB7\xB9\xE9\xB5\x9C\xE9\x97\x90\xE6\xA2\x9D\xE7\xB3\xB6\xE9\xBD\xA0\xE9\xB0\xB7\xE8\xB2\xBC\xE9\x90\xB5\xE5\xBB\xB3\xE8\x81\xBD\xE7\x83\xB4\xE9\x8A\x85\xE7\xB5\xB1\xE6\x85\x9F\xE9\xA0\xAD\xE9\x88\x84\xE7\xA6\xBF\xE5\x9C\x96\xE9\x87\xB7\xE5\x9C\x98\xE6\x91\xB6\xE9\xA0\xB9\xE8\x9B\xBB\xE9\xA3\xA9\xE8\x84\xAB\xE9\xB4\x95\xE9\xA6\xB1\xE9\xA7\x9D\xE6\xA9\xA2\xE7\xB1\x9C\xE9\xBC\x89\xE8\xA5\xAA\xE5\xAA\xA7\xE8\x86\x83\xE5\xBD\x8E\xE7\x81\xA3\xE9\xA0\x91\xE8\x90\xAC\xE7\xB4\x88\xE7\xB6\xB0\xE7\xB6\xB2\xE8\xBC\x9E\xE9\x9F\x8B\xE9\x81\x95\xE5\x9C\x8D\xE7\x82\xBA\xE6\xBF\xB0\xE7\xB6\xAD\xE8\x91\xA6\xE5\x81\x89\xE5\x81\xBD\xE7\xB7\xAF\xE8\xAC\x82\xE8\xA1\x9B\xE8\xAB\x89\xE5\xB9\x83\xE9\x97\x88\xE6\xBA\x88\xE6\xBD\xBF\xE7\x91\x8B\xE9\x9F\x99\xE7\x85\x92\xE9\xAE\xAA\xE6\xBA\xAB\xE8\x81\x9E\xE7\xB4\x8B\xE7\xA9\xA9\xE5\x95\x8F\xE9\x96\xBF\xE7\x94\x95\xE6\x92\xBE\xE8\x9D\xB8\xE6\xB8\xA6\xE7\xAA\xA9\xE8\x87\xA5\xE8\x90\xB5\xE9\xBD\xB7\xE5\x97\x9A\xE9\x8E\xA2\xE7\x83\x8F\xE8\xAA\xA3\xE7\x84\xA1\xE8\x95\xAA\xE5\x90\xB3\xE5\xA1\xA2\xE9\x9C\xA7\xE5\x8B\x99\xE8\xAA\xA4\xE9\x84\x94\xE5\xBB\xA1\xE6\x86\xAE\xE5\xAB\xB5\xE9\xA8\x96\xE9\xB5\xA1\xE9\xB6\xA9\xE9\x8C\xAB\xE7\x8A\xA7\xE8\xA5\xB2\xE7\xBF\x92\xE9\x8A\x91\xE6\x88\xB2\xE7\xB4\xB0\xE9\xA4\xBC\xE9\xAC\xA9\xE7\x92\xBD\xE8\xA6\xA1\xE8\x9D\xA6\xE8\xBD\x84\xE5\xB3\xBD\xE4\xBF\xA0\xE7\x8B\xB9\xE5\xBB\x88\xE5\x9A\x87\xE7\xA1\xA4\xE9\xAE\xAE\xE7\xBA\x96\xE8\xB3\xA2\xE9\x8A\x9C\xE9\x96\x91\xE9\xA1\xAF\xE9\x9A\xAA\xE7\x8F\xBE\xE7\x8D\xBB\xE7\xB8\xA3\xE9\xA4\xA1\xE7\xBE\xA8\xE6\x86\xB2\xE7\xB7\x9A\xE8\x8E\xA7\xE8\x96\x9F\xE8\x98\x9A\xE5\xB3\xB4\xE7\x8D\xAB\xE5\xAB\xBB\xE9\xB7\xB4\xE7\x99\x87\xE8\xA0\x94\xE7\xA7\x88\xE8\xBA\x9A\xE5\xBB\x82\xE9\x91\xB2\xE9\x84\x89\xE8\xA9\xB3\xE9\x9F\xBF\xE9\xA0\x85\xE8\x96\x8C\xE9\xA4\x89\xE9\xA9\xA4\xE7\xB7\x97\xE9\xA5\x97\xE8\x95\xAD\xE5\x9B\x82\xE9\x8A\xB7\xE6\x9B\x89\xE5\x98\xAF\xE5\x98\xB5\xE7\x80\x9F\xE9\xA9\x8D\xE7\xB6\x83\xE6\xA2\x9F\xE7\xB0\xAB\xE5\x8D\x94\xE6\x8C\xBE\xE6\x94\x9C\xE8\x84\x85\xE8\xAB\xA7\xE5\xAF\xAB\xE7\x80\x89\xE8\xAC\x9D\xE8\xA4\xBB\xE6\x93\xB7\xE7\xB4\xB2\xE7\xBA\x88\xE9\x8B\x85\xE9\x87\x81\xE8\x88\x88\xE9\x99\x98\xE6\xBB\x8E\xE5\x85\x87\xE6\xB4\xB6\xE9\x8A\xB9\xE7\xB9\xA1\xE9\xA5\x88\xE9\xB5\x82\xE8\x99\x9B\xE5\x99\x93\xE9\xA0\x88\xE8\xA8\xB1\xE6\x95\x98\xE7\xB7\x92\xE7\xBA\x8C\xE8\xA9\xA1\xE9\xA0\x8A\xE8\xBB\x92\xE6\x87\xB8\xE9\x81\xB8\xE7\x99\xAC\xE7\xB5\xA2\xE8\xAB\xBC\xE9\x89\x89\xE9\x8F\x87\xE5\xAD\xB8\xE8\xAC\x94\xE6\xBE\xA9\xE9\xB1\x88\xE5\x8B\x9B\xE8\xA9\xA2\xE5\xB0\x8B\xE9\xA6\xB4\xE8\xA8\x93\xE8\xA8\x8A\xE9\x81\x9C\xE5\xA1\xA4\xE6\xBD\xAF\xE9\xB1\x98\xE5\xA3\x93\xE9\xB4\x89\xE9\xB4\xA8\xE5\x95\x9E\xE4\xBA\x9E\xE8\xA8\x9D\xE5\x9F\xA1\xE5\xA9\xAD\xE6\xA4\x8F\xE6\xB0\xAC\xE9\x96\xB9\xE7\x85\x99\xE9\xB9\xBD\xE5\x9A\xB4\xE5\xB7\x96\xE9\xA1\x8F\xE9\x96\xBB\xE8\x89\xB7\xE5\x8E\xAD\xE7\xA1\xAF\xE5\xBD\xA5\xE8\xAB\xBA\xE9\xA9\x97\xE5\x8E\xB4\xE8\xB4\x97\xE5\x84\xBC\xE5\x85\x97\xE8\xAE\x9E\xE6\x87\xA8\xE9\x96\x86\xE9\x87\x85\xE9\xAD\x98\xE9\xA5\x9C\xE9\xBC\xB4\xE9\xB4\xA6\xE6\xA5\x8A\xE6\x8F\x9A\xE7\x98\x8D\xE9\x99\xBD\xE7\x99\xA2\xE9\xA4\x8A\xE6\xA8\xA3\xE7\x85\xAC\xE7\x91\xA4\xE6\x90\x96\xE5\xA0\xAF\xE9\x81\x99\xE7\xAA\xAF\xE8\xAC\xA0\xE8\x97\xA5\xE8\xBB\xBA\xE9\xB7\x82\xE9\xB0\xA9\xE7\x88\xBA\xE9\xA0\x81\xE6\xA5\xAD\xE8\x91\x89\xE9\x9D\xA8\xE8\xAC\x81\xE9\x84\xB4\xE6\x9B\x84\xE7\x87\x81\xE9\x86\xAB\xE9\x8A\xA5\xE9\xA0\xA4\xE9\x81\xBA\xE5\x84\x80\xE8\x9F\xBB\xE8\x97\x9D\xE5\x84\x84\xE6\x86\xB6\xE7\xBE\xA9\xE8\xA9\xA3\xE8\xAD\xB0\xE8\xAA\xBC\xE8\xAD\xAF\xE7\x95\xB0\xE7\xB9\xB9\xE8\xA9\x92\xE5\x9B\x88\xE5\xB6\xA7\xE9\xA3\xB4\xE6\x87\x8C\xE9\xA9\x9B\xE7\xB8\x8A\xE8\xBB\xBC\xE8\xB2\xBD\xE9\x87\x94\xE9\x8E\xB0\xE9\x90\xBF\xE7\x98\x9E\xE8\x89\xA4\xE8\x94\xAD\xE9\x99\xB0\xE9\x8A\x80\xE9\xA3\xB2\xE9\x9A\xB1\xE9\x8A\xA6\xE7\x99\xAE\xE6\xAB\xBB\xE5\xAC\xB0\xE9\xB7\xB9\xE6\x87\x89\xE7\xBA\x93\xE7\x91\xA9\xE8\x9E\xA2\xE7\x87\x9F\xE7\x86\x92\xE8\xA0\x85\xE8\xB4\x8F\xE7\xA9\x8E\xE5\xA1\x8B\xE9\xB6\xAF\xE7\xB8\x88\xE9\x8E\xA3\xE6\x94\x96\xE5\x9A\xB6\xE7\x80\x85\xE7\x80\xA0\xE7\x93\x94\xE9\xB8\x9A\xE7\x99\xAD\xE9\xA0\xA6\xE7\xBD\x8C\xE5\x96\xB2\xE6\x93\x81\xE5\x82\xAD\xE7\x99\xB0\xE8\xB8\xB4\xE8\xA9\xA0\xE9\x8F\x9E\xE5\x84\xAA\xE6\x86\x82\xE9\x83\xB5\xE9\x88\xBE\xE7\x8C\xB6\xE8\xAA\x98\xE8\x95\x95\xE9\x8A\xAA\xE9\xAD\xB7\xE8\xBC\xBF\xE9\xAD\x9A\xE6\xBC\x81\xE5\xA8\x9B\xE8\x88\x87\xE5\xB6\xBC\xE8\xAA\x9E\xE7\x8D\x84\xE8\xAD\xBD\xE9\xA0\x90\xE9\xA6\xAD\xE5\x82\xB4\xE4\xBF\x81\xE8\xAB\x9B\xE8\xAB\xAD\xE8\x95\xB7\xE5\xB4\xB3\xE9\xA3\xAB\xE9\x96\xBE\xE5\xAB\x97\xE7\xB4\x86\xE8\xA6\xA6\xE6\xAD\x9F\xE9\x88\xBA\xE9\xB5\x92\xE9\xB7\xB8\xE9\xBD\xAC\xE9\xB4\x9B\xE6\xB7\xB5\xE8\xBD\x85\xE5\x9C\x92\xE5\x93\xA1\xE5\x9C\x93\xE7\xB7\xA3\xE9\x81\xA0\xE6\xAB\x9E\xE9\xB3\xB6\xE9\xBB\xBF\xE7\xB4\x84\xE8\xBA\x8D\xE9\x91\xB0\xE7\xB2\xB5\xE6\x82\x85\xE9\x96\xB1\xE9\x89\x9E\xE9\x84\x96\xE5\x8B\xBB\xE9\x9A\x95\xE9\x81\x8B\xE8\x98\x8A\xE9\x86\x9E\xE6\x9A\x88\xE9\x9F\xBB\xE9\x84\x86\xE8\x95\x93\xE6\x83\xB2\xE6\x85\x8D\xE7\xB4\x9C\xE9\x9F\x9E\xE6\xAE\x9E\xE6\xB0\xB3\xE9\x9B\x9C\xE7\x81\xBD\xE8\xBC\x89\xE6\x94\xA2\xE6\x9A\xAB\xE8\xB4\x8A\xE7\x93\x9A\xE8\xB6\xB2\xE9\x8F\xA8\xE8\xB4\x93\xE8\x87\x9F\xE9\xA7\x94\xE9\x91\xBF\xE6\xA3\x97\xE8\xB2\xAC\xE6\x93\x87\xE5\x89\x87\xE6\xBE\xA4\xE8\xB3\xBE\xE5\x98\x96\xE5\xB9\x98\xE7\xB0\x80\xE8\xB3\x8A\xE8\xAD\x96\xE8\xB4\x88\xE7\xB6\x9C\xE7\xB9\x92\xE8\xBB\x8B\xE9\x8D\x98\xE9\x96\x98\xE6\x9F\xB5\xE8\xA9\x90\xE9\xBD\x8B\xE5\x82\xB5\xE6\xB0\x88\xE7\x9B\x9E\xE6\x96\xAC\xE8\xBC\xBE\xE5\xB6\x84\xE6\xA3\xA7\xE6\x88\xB0\xE7\xB6\xBB\xE8\xAD\xAB\xE5\xBC\xB5\xE6\xBC\xB2\xE5\xB8\xB3\xE8\xB3\xAC\xE8\x84\xB9\xE8\xB6\x99\xE8\xA9\x94\xE9\x87\x97\xE8\x9F\x84\xE8\xBD\x8D\xE9\x8D\xBA\xE9\x80\x99\xE8\xAC\xAB\xE8\xBC\x92\xE9\xB7\x93\xE8\xB2\x9E\xE9\x87\x9D\xE5\x81\xB5\xE8\xA8\xBA\xE9\x8E\xAE\xE9\x99\xA3\xE6\xB9\x9E\xE7\xB8\x9D\xE6\xA5\xA8\xE8\xBB\xAB\xE8\xB3\x91\xE7\xA6\x8E\xE9\xB4\x86\xE6\x8E\x99\xE7\x9D\x9C\xE7\x8C\x99\xE7\x88\xAD\xE5\xB9\x80\xE7\x99\xA5\xE9\x84\xAD\xE8\xAD\x89\xE8\xAB\x8D\xE5\xB4\xA2\xE9\x89\xA6\xE9\x8C\x9A\xE7\xAE\x8F\xE7\xB9\x94\xE8\x81\xB7\xE5\x9F\xB7\xE7\xB4\x99\xE6\x91\xAF\xE6\x93\xB2\xE5\xB9\x9F\xE8\xB3\xAA\xE6\xBB\xAF\xE9\xA8\xAD\xE6\xAB\x9B\xE6\xA2\x94\xE8\xBB\xB9\xE8\xBC\x8A\xE8\xB4\x84\xE9\xB7\x99\xE8\x9E\x84\xE7\xB8\xB6\xE8\xBA\x93\xE8\xBA\x91\xE8\xA7\xB6\xE9\x90\x98\xE7\xB5\x82\xE7\xA8\xAE\xE8\x85\xAB\xE7\x9C\xBE\xE9\x8D\xBE\xE8\xAC\x85\xE8\xBB\xB8\xE7\x9A\xBA\xE6\x99\x9D\xE9\xA9\x9F\xE7\xB4\x82\xE7\xB8\x90\xE8\xB1\xAC\xE8\xAB\xB8\xE8\xAA\x85\xE7\x87\xAD\xE7\x9F\x9A\xE5\x9B\x91\xE8\xB2\xAF\xE9\x91\x84\xE9\xA7\x90\xE4\xBD\x87\xE6\xAB\xA7\xE9\x8A\x96\xE5\xB0\x88\xE7\xA3\x9A\xE8\xBD\x89\xE8\xB3\xBA\xE5\x9B\x80\xE9\xA5\x8C\xE9\xA1\xB3\xE6\xA8\x81\xE8\x8E\x8A\xE8\xA3\x9D\xE5\xA6\x9D\xE5\xA3\xAF\xE7\x8B\x80\xE9\x8C\x90\xE8\xB4\x85\xE5\xA2\x9C\xE7\xB6\xB4\xE9\xA8\x85\xE7\xB8\x8B\xE8\xAB\x84\xE6\xBA\x96\xE8\x91\x97\xE6\xBF\x81\xE8\xAB\x91\xE9\x90\xB2\xE8\x8C\xB2\xE8\xB3\x87\xE6\xBC\xAC\xE8\xAB\xAE\xE7\xB7\x87\xE8\xBC\x9C\xE8\xB2\xB2\xE7\x9C\xA5\xE9\x8C\x99\xE9\xBD\x9C\xE9\xAF\x94\xE8\xB9\xA4\xE7\xB8\xBD\xE7\xB8\xB1\xE5\x82\xAF\xE9\x84\x92\xE8\xAB\x8F\xE9\xA8\xB6\xE9\xAF\xAB\xE8\xA9\x9B\xE7\xB5\x84\xE9\x8F\x83\xE9\x89\x86\xE7\xBA\x98\xE8\xBA\xA6\xE9\xB1\x92\xE7\xBF\xBA\xE4\xB8\xA6\xE8\x94\x94\xE6\xB2\x88\xE9\x86\x9C\xE6\xBE\xB1\xE5\x8F\xA0\xE9\xAC\xA5\xE7\xAF\x84\xE5\xB9\xB9\xE8\x87\xAF\xE7\x9F\xBD\xE6\xAB\x83\xE5\xBE\x8C\xE5\xA4\xA5\xE7\xA8\xAD\xE5\x82\x91\xE8\xA8\xA3\xE8\xAA\x87\xE8\xA3\x8F\xE6\xB7\xA9\xE9\xBA\xBC\xE9\xBB\xB4\xE6\x92\x9A\xE6\xB7\x92\xE6\x89\xA1\xE8\x81\x96\xE5\xB1\x8D\xE6\x93\xA1\xE5\xA1\x97\xE7\xAA\xAA\xE9\xA4\xB5\xE6\xB1\x99\xE9\x8D\x81\xE9\xB9\xB9\xE8\xA0\x8D\xE5\xBD\x9C\xE6\xB9\xA7\xE9\x81\x8A\xE7\xB1\xB2\xE7\xA6\xA6\xE9\xA1\x98\xE5\xB6\xBD\xE9\x9B\xB2\xE7\xAB\x88\xE7\xB4\xAE\xE5\x8A\x84\xE7\xAF\x89\xE6\x96\xBC\xE8\xAA\x8C\xE8\xA8\xBB\xE9\x9B\x95\xE8\xA8\x81\xE8\xAD\xBE\xE9\x83\xA4\xE7\x8C\x9B\xE6\xB0\xB9\xE9\x98\xAA\xE5\xA3\x9F\xE5\xA0\x96\xE5\x9E\xB5\xE5\xA2\x8A\xE6\xAA\xBE\xE8\x95\x92\xE8\x91\xA4\xE8\x93\xA7\xE8\x92\x93\xE8\x8F\x87\xE6\xA7\x81\xE6\x91\xA3\xE5\x92\xA4\xE5\x94\x9A\xE5\x93\xA2\xE5\x99\x9D\xE5\x99\x85\xE6\x92\x85\xE5\x8A\x88\xE8\xAC\x94\xE8\xA5\x86\xE5\xB6\xB4\xE8\x84\x8A\xE4\xBB\xBF\xE5\x83\xA5\xE7\x8D\x81\xE9\xBA\x85\xE9\xA4\x98\xE9\xA4\xB7\xE9\xA5\x8A\xE9\xA5\xA2\xE6\xA5\x9E\xE6\x80\xB5\xE6\x87\x8D\xE7\x88\xBF\xE6\xBC\xB5\xE7\x81\xA9\xE6\xB7\xB7\xE6\xBF\xAB\xE7\x80\xA6\xE6\xB7\xA1\xE5\xAF\xA7\xE7\xB3\xB8\xE7\xB5\x9D\xE7\xB7\x94\xE7\x91\x89\xE6\xA2\x98\xE6\xA3\xAC\xE6\xA1\x88\xE6\xA9\xB0\xE6\xAB\xAB\xE8\xBB\xB2\xE8\xBB\xA4\xE8\xB3\xAB\xE8\x86\x81\xE8\x85\x96\xE9\xA3\x88\xE7\xB3\x8A\xE7\x85\x86\xE6\xBA\x9C\xE6\xB9\xA3\xE6\xB8\xBA\xE7\xA2\xB8\xE6\xBB\xBE\xE7\x9E\x98\xE9\x88\x88\xE9\x89\x95\xE9\x8B\xA3\xE9\x8A\xB1\xE9\x8B\xA5\xE9\x8B\xB6\xE9\x90\xA6\xE9\x90\xA7\xE9\x8D\xA9\xE9\x8D\x80\xE9\x8D\x83\xE9\x8C\x87\xE9\x8E\x84\xE9\x8E\x87\xE9\x8E\xBF\xE9\x90\x9D\xE9\x91\xA5\xE9\x91\xB9\xE9\x91\x94\xE7\xA9\xAD\xE9\xB6\x93\xE9\xB6\xA5\xE9\xB8\x8C\xE7\x99\xA7\xE5\xB1\x99\xE7\x98\x82\xE8\x87\x92\xE8\xA5\x87\xE7\xB9\x88\xE8\x80\xAE\xE9\xA1\xAC\xE8\x9F\x8E\xE9\xBA\xAF\xE9\xAE\x81\xE9\xAE\x83\xE9\xAE\x8E\xE9\xAF\x97\xE9\xAF\x9D\xE9\xAF\xB4\xE9\xB1\x9D\xE9\xAF\xBF\xE9\xB0\xA0\xE9\xB0\xB5\xE9\xB1\x85\xE9\x9E\xBD\xE9\x9F\x9D\xE9\xBD\x87";
		_i = 0;
		while (true) {
			if (!(_i < _ref.length)) { break; }
			_rune = $decodeRune(_ref, _i);
			index = _i;
			runeValueT = _rune[0];
			_tuple = utf8.DecodeRuneInString($substring("\xE9\x94\x95\xE7\x9A\x91\xE8\x94\xBC\xE7\xA2\x8D\xE7\x88\xB1\xE5\x97\xB3\xE5\xAB\x92\xE7\x91\xB7\xE6\x9A\xA7\xE9\x9C\xAD\xE8\xB0\x99\xE9\x93\xB5\xE9\xB9\x8C\xE8\x82\xAE\xE8\xA2\x84\xE5\xA5\xA5\xE5\xAA\xAA\xE9\xAA\x9C\xE9\xB3\x8C\xE5\x9D\x9D\xE7\xBD\xA2\xE9\x92\xAF\xE6\x91\x86\xE8\xB4\xA5\xE5\x91\x97\xE9\xA2\x81\xE5\x8A\x9E\xE7\xBB\x8A\xE9\x92\xA3\xE5\xB8\xAE\xE7\xBB\x91\xE9\x95\x91\xE8\xB0\xA4\xE5\x89\xA5\xE9\xA5\xB1\xE5\xAE\x9D\xE6\x8A\xA5\xE9\xB2\x8D\xE9\xB8\xA8\xE9\xBE\x85\xE8\xBE\x88\xE8\xB4\x9D\xE9\x92\xA1\xE7\x8B\x88\xE5\xA4\x87\xE6\x83\xAB\xE9\xB9\x8E\xE8\xB4\xB2\xE9\x94\x9B\xE7\xBB\xB7\xE7\xAC\x94\xE6\xAF\x95\xE6\xAF\x99\xE5\xB8\x81\xE9\x97\xAD\xE8\x8D\x9C\xE5\x93\x94\xE6\xBB\x97\xE9\x93\x8B\xE7\xAD\x9A\xE8\xB7\xB8\xE8\xBE\xB9\xE7\xBC\x96\xE8\xB4\xAC\xE5\x8F\x98\xE8\xBE\xA9\xE8\xBE\xAB\xE8\x8B\x84\xE7\xBC\x8F\xE7\xAC\xBE\xE6\xA0\x87\xE9\xAA\xA0\xE9\xA3\x91\xE9\xA3\x99\xE9\x95\x96\xE9\x95\xB3\xE9\xB3\x94\xE9\xB3\x96\xE5\x88\xAB\xE7\x98\xAA\xE6\xBF\x92\xE6\xBB\xA8\xE5\xAE\xBE\xE6\x91\x88\xE5\x82\xA7\xE7\xBC\xA4\xE6\xA7\x9F\xE6\xAE\xA1\xE8\x86\x91\xE9\x95\x94\xE9\xAB\x8C\xE9\xAC\x93\xE9\xA5\xBC\xE7\xA6\x80\xE6\x8B\xA8\xE9\x92\xB5\xE9\x93\x82\xE9\xA9\xB3\xE9\xA5\xBD\xE9\x92\xB9\xE9\xB9\x81\xE8\xA1\xA5\xE9\x92\xB8\xE8\xB4\xA2\xE5\x8F\x82\xE8\x9A\x95\xE6\xAE\x8B\xE6\x83\xAD\xE6\x83\xA8\xE7\x81\xBF\xE9\xAA\x96\xE9\xBB\xAA\xE8\x8B\x8D\xE8\x88\xB1\xE4\xBB\x93\xE6\xB2\xA7\xE5\x8E\x95\xE4\xBE\xA7\xE5\x86\x8C\xE6\xB5\x8B\xE6\x81\xBB\xE5\xB1\x82\xE8\xAF\xA7\xE9\x94\xB8\xE4\xBE\xAA\xE9\x92\x97\xE6\x90\x80\xE6\x8E\xBA\xE8\x9D\x89\xE9\xA6\x8B\xE8\xB0\x97\xE7\xBC\xA0\xE9\x93\xB2\xE4\xBA\xA7\xE9\x98\x90\xE9\xA2\xA4\xE5\x86\x81\xE8\xB0\x84\xE8\xB0\xB6\xE8\x92\x87\xE5\xBF\x8F\xE5\xA9\xB5\xE9\xAA\xA3\xE8\xA7\x87\xE7\xA6\x85\xE9\x95\xA1\xE5\x9C\xBA\xE5\xB0\x9D\xE9\x95\xBF\xE5\x81\xBF\xE8\x82\xA0\xE5\x8E\x82\xE7\x95\x85\xE4\xBC\xA5\xE8\x8B\x8C\xE6\x80\x85\xE9\x98\x8A\xE9\xB2\xB3\xE9\x92\x9E\xE8\xBD\xA6\xE5\xBD\xBB\xE7\xA0\x97\xE5\xB0\x98\xE9\x99\x88\xE8\xA1\xAC\xE4\xBC\xA7\xE8\xB0\x8C\xE6\xA6\x87\xE7\xA2\x9C\xE9\xBE\x80\xE6\x92\x91\xE7\xA7\xB0\xE6\x83\xA9\xE8\xAF\x9A\xE9\xAA\x8B\xE6\x9E\xA8\xE6\x9F\xBD\xE9\x93\x96\xE9\x93\x9B\xE7\x97\xB4\xE8\xBF\x9F\xE9\xA9\xB0\xE8\x80\xBB\xE9\xBD\xBF\xE7\x82\xBD\xE9\xA5\xAC\xE9\xB8\xB1\xE5\x86\xB2\xE5\x86\xB2\xE8\x99\xAB\xE5\xAE\xA0\xE9\x93\xB3\xE7\x95\xB4\xE8\xB8\x8C\xE7\xAD\xB9\xE7\xBB\xB8\xE4\xBF\xA6\xE5\xB8\xB1\xE9\x9B\xA0\xE6\xA9\xB1\xE5\x8E\xA8\xE9\x94\x84\xE9\x9B\x8F\xE7\xA1\x80\xE5\x82\xA8\xE8\xA7\xA6\xE5\xA4\x84\xE5\x88\x8D\xE7\xBB\x8C\xE8\xB9\xB0\xE4\xBC\xA0\xE9\x92\x8F\xE7\x96\xAE\xE9\x97\xAF\xE5\x88\x9B\xE6\x80\x86\xE9\x94\xA4\xE7\xBC\x8D\xE7\xBA\xAF\xE9\xB9\x91\xE7\xBB\xB0\xE8\xBE\x8D\xE9\xBE\x8A\xE8\xBE\x9E\xE8\xAF\x8D\xE8\xB5\x90\xE9\xB9\x9A\xE8\x81\xAA\xE8\x91\xB1\xE5\x9B\xB1\xE4\xBB\x8E\xE4\xB8\x9B\xE8\x8B\x81\xE9\xAA\xA2\xE6\x9E\x9E\xE5\x87\x91\xE8\xBE\x8F\xE8\xB9\xBF\xE7\xAA\x9C\xE6\x92\xBA\xE9\x94\x99\xE9\x94\x89\xE9\xB9\xBE\xE8\xBE\xBE\xE5\x93\x92\xE9\x9E\x91\xE5\xB8\xA6\xE8\xB4\xB7\xE9\xAA\x80\xE7\xBB\x90\xE6\x8B\x85\xE5\x8D\x95\xE9\x83\xB8\xE6\x8E\xB8\xE8\x83\x86\xE6\x83\xAE\xE8\xAF\x9E\xE5\xBC\xB9\xE6\xAE\x9A\xE8\xB5\x95\xE7\x98\x85\xE7\xAE\xAA\xE5\xBD\x93\xE6\x8C\xA1\xE5\x85\x9A\xE8\x8D\xA1\xE6\xA1\xA3\xE8\xB0\xA0\xE7\xA0\x80\xE8\xA3\x86\xE6\x8D\xA3\xE5\xB2\x9B\xE7\xA5\xB7\xE5\xAF\xBC\xE7\x9B\x97\xE7\x84\x98\xE7\x81\xAF\xE9\x82\x93\xE9\x95\xAB\xE6\x95\x8C\xE6\xB6\xA4\xE9\x80\x92\xE7\xBC\x94\xE7\xB1\xB4\xE8\xAF\x8B\xE8\xB0\x9B\xE7\xBB\xA8\xE8\xA7\x8C\xE9\x95\x9D\xE9\xA2\xA0\xE7\x82\xB9\xE5\x9E\xAB\xE7\x94\xB5\xE5\xB7\x85\xE9\x92\xBF\xE7\x99\xAB\xE9\x92\x93\xE8\xB0\x83\xE9\x93\xAB\xE9\xB2\xB7\xE8\xB0\x8D\xE5\x8F\xA0\xE9\xB2\xBD\xE9\x92\x89\xE9\xA1\xB6\xE9\x94\xAD\xE8\xAE\xA2\xE9\x93\xA4\xE4\xB8\xA2\xE9\x93\xA5\xE4\xB8\x9C\xE5\x8A\xA8\xE6\xA0\x8B\xE5\x86\xBB\xE5\xB2\xBD\xE9\xB8\xAB\xE7\xAA\xA6\xE7\x8A\x8A\xE7\x8B\xAC\xE8\xAF\xBB\xE8\xB5\x8C\xE9\x95\x80\xE6\xB8\x8E\xE6\xA4\x9F\xE7\x89\x8D\xE7\xAC\x83\xE9\xBB\xA9\xE9\x94\xBB\xE6\x96\xAD\xE7\xBC\x8E\xE7\xB0\x96\xE5\x85\x91\xE9\x98\x9F\xE5\xAF\xB9\xE6\x80\xBC\xE9\x95\xA6\xE5\x90\xA8\xE9\xA1\xBF\xE9\x92\x9D\xE7\x82\x96\xE8\xB6\xB8\xE5\xA4\xBA\xE5\xA0\x95\xE9\x93\x8E\xE9\xB9\x85\xE9\xA2\x9D\xE8\xAE\xB9\xE6\x81\xB6\xE9\xA5\xBF\xE8\xB0\x94\xE5\x9E\xA9\xE9\x98\x8F\xE8\xBD\xAD\xE9\x94\x87\xE9\x94\xB7\xE9\xB9\x97\xE9\xA2\x9A\xE9\xA2\x9B\xE9\xB3\x84\xE8\xAF\xB6\xE5\x84\xBF\xE5\xB0\x94\xE9\xA5\xB5\xE8\xB4\xB0\xE8\xBF\xA9\xE9\x93\x92\xE9\xB8\xB8\xE9\xB2\x95\xE5\x8F\x91\xE7\xBD\x9A\xE9\x98\x80\xE7\x8F\x90\xE7\x9F\xBE\xE9\x92\x92\xE7\x83\xA6\xE8\xB4\xA9\xE9\xA5\xAD\xE8\xAE\xBF\xE7\xBA\xBA\xE9\x92\xAB\xE9\xB2\x82\xE9\xA3\x9E\xE8\xAF\xBD\xE5\xBA\x9F\xE8\xB4\xB9\xE7\xBB\xAF\xE9\x95\x84\xE9\xB2\xB1\xE7\xBA\xB7\xE5\x9D\x9F\xE5\xA5\x8B\xE6\x84\xA4\xE7\xB2\xAA\xE5\x81\xBE\xE4\xB8\xB0\xE6\x9E\xAB\xE9\x94\x8B\xE9\xA3\x8E\xE7\x96\xAF\xE5\x86\xAF\xE7\xBC\x9D\xE8\xAE\xBD\xE5\x87\xA4\xE6\xB2\xA3\xE8\x82\xA4\xE8\xBE\x90\xE6\x8A\x9A\xE8\xBE\x85\xE8\xB5\x8B\xE5\xA4\x8D\xE8\xB4\x9F\xE8\xAE\xA3\xE5\xA6\x87\xE7\xBC\x9A\xE5\x87\xAB\xE9\xA9\xB8\xE7\xBB\x82\xE7\xBB\x8B\xE8\xB5\x99\xE9\xBA\xB8\xE9\xB2\x8B\xE9\xB3\x86\xE9\x92\x86\xE8\xAF\xA5\xE9\x92\x99\xE7\x9B\x96\xE8\xB5\x85\xE6\x9D\x86\xE8\xB5\xB6\xE7\xA7\x86\xE8\xB5\xA3\xE5\xB0\xB4\xE6\x93\x80\xE7\xBB\x80\xE5\x86\x88\xE5\x88\x9A\xE9\x92\xA2\xE7\xBA\xB2\xE5\xB2\x97\xE6\x88\x86\xE9\x95\x90\xE7\x9D\xBE\xE8\xAF\xB0\xE7\xBC\x9F\xE9\x94\x86\xE6\x90\x81\xE9\xB8\xBD\xE9\x98\x81\xE9\x93\xAC\xE4\xB8\xAA\xE7\xBA\xA5\xE9\x95\x89\xE9\xA2\x8D\xE7\xBB\x99\xE4\xBA\x98\xE8\xB5\x93\xE7\xBB\xA0\xE9\xB2\xA0\xE9\xBE\x9A\xE5\xAE\xAB\xE5\xB7\xA9\xE8\xB4\xA1\xE9\x92\xA9\xE6\xB2\x9F\xE8\x8B\x9F\xE6\x9E\x84\xE8\xB4\xAD\xE5\xA4\x9F\xE8\xAF\x9F\xE7\xBC\x91\xE8\xA7\x8F\xE8\x9B\x8A\xE9\xA1\xBE\xE8\xAF\x82\xE6\xAF\x82\xE9\x92\xB4\xE9\x94\xA2\xE9\xB8\xAA\xE9\xB9\x84\xE9\xB9\x98\xE5\x89\x90\xE6\x8C\x82\xE9\xB8\xB9\xE6\x8E\xB4\xE5\x85\xB3\xE8\xA7\x82\xE9\xA6\x86\xE6\x83\xAF\xE8\xB4\xAF\xE8\xAF\x96\xE6\x8E\xBC\xE9\xB9\xB3\xE9\xB3\x8F\xE5\xB9\xBF\xE7\x8A\xB7\xE8\xA7\x84\xE5\xBD\x92\xE9\xBE\x9F\xE9\x97\xBA\xE8\xBD\xA8\xE8\xAF\xA1\xE8\xB4\xB5\xE5\x88\xBD\xE5\x8C\xA6\xE5\x88\xBF\xE5\xA6\xAB\xE6\xA1\xA7\xE9\xB2\x91\xE9\xB3\x9C\xE8\xBE\x8A\xE6\xBB\x9A\xE8\xA1\xAE\xE7\xBB\xB2\xE9\xB2\xA7\xE9\x94\x85\xE5\x9B\xBD\xE8\xBF\x87\xE5\x9F\x9A\xE5\x91\x99\xE5\xB8\xBC\xE6\xA4\x81\xE8\x9D\x88\xE9\x93\xAA\xE9\xAA\x87\xE9\x9F\xA9\xE6\xB1\x89\xE9\x98\x9A\xE7\xBB\x97\xE9\xA2\x89\xE5\x8F\xB7\xE7\x81\x8F\xE9\xA2\xA2\xE9\x98\x82\xE9\xB9\xA4\xE8\xB4\xBA\xE8\xAF\x83\xE9\x98\x96\xE8\x9B\x8E\xE6\xA8\xAA\xE8\xBD\xB0\xE9\xB8\xBF\xE7\xBA\xA2\xE9\xBB\x89\xE8\xAE\xA7\xE8\x8D\xAD\xE9\x97\xB3\xE9\xB2\x8E\xE5\xA3\xB6\xE6\x8A\xA4\xE6\xB2\xAA\xE6\x88\xB7\xE6\xB5\x92\xE9\xB9\x95\xE5\x93\x97\xE5\x8D\x8E\xE7\x94\xBB\xE5\x88\x92\xE8\xAF\x9D\xE9\xAA\x85\xE6\xA1\xA6\xE9\x93\xA7\xE6\x80\x80\xE5\x9D\x8F\xE6\xAC\xA2\xE7\x8E\xAF\xE8\xBF\x98\xE7\xBC\x93\xE6\x8D\xA2\xE5\x94\xA4\xE7\x97\xAA\xE7\x84\x95\xE6\xB6\xA3\xE5\xA5\x82\xE7\xBC\xB3\xE9\x94\xBE\xE9\xB2\xA9\xE9\xBB\x84\xE8\xB0\x8E\xE9\xB3\x87\xE6\x8C\xA5\xE8\xBE\x89\xE6\xAF\x81\xE8\xB4\xBF\xE7\xA7\xBD\xE4\xBC\x9A\xE7\x83\xA9\xE6\xB1\x87\xE8\xAE\xB3\xE8\xAF\xB2\xE7\xBB\x98\xE8\xAF\x99\xE8\x8D\x9F\xE5\x93\x95\xE6\xB5\x8D\xE7\xBC\x8B\xE7\x8F\xB2\xE6\x99\x96\xE8\x8D\xA4\xE6\xB5\x91\xE8\xAF\xA8\xE9\xA6\x84\xE9\x98\x8D\xE8\x8E\xB7\xE8\xB4\xA7\xE7\xA5\xB8\xE9\x92\xAC\xE9\x95\xAC\xE5\x87\xBB\xE6\x9C\xBA\xE7\xA7\xAF\xE9\xA5\xA5\xE8\xBF\xB9\xE8\xAE\xA5\xE9\xB8\xA1\xE7\xBB\xA9\xE7\xBC\x89\xE6\x9E\x81\xE8\xBE\x91\xE7\xBA\xA7\xE6\x8C\xA4\xE5\x87\xA0\xE8\x93\x9F\xE5\x89\x82\xE6\xB5\x8E\xE8\xAE\xA1\xE8\xAE\xB0\xE9\x99\x85\xE7\xBB\xA7\xE7\xBA\xAA\xE8\xAE\xA6\xE8\xAF\x98\xE8\x8D\xA0\xE5\x8F\xBD\xE5\x93\x9C\xE9\xAA\xA5\xE7\x8E\x91\xE8\xA7\x8A\xE9\xBD\x91\xE7\x9F\xB6\xE7\xBE\x81\xE8\x99\xBF\xE8\xB7\xBB\xE9\x9C\x81\xE9\xB2\x9A\xE9\xB2\xAB\xE5\xA4\xB9\xE8\x8D\x9A\xE9\xA2\x8A\xE8\xB4\xBE\xE9\x92\xBE\xE4\xBB\xB7\xE9\xA9\xBE\xE9\x83\x8F\xE6\xB5\x83\xE9\x93\x97\xE9\x95\x93\xE8\x9B\xB2\xE6\xAD\xBC\xE7\x9B\x91\xE5\x9D\x9A\xE7\xAC\xBA\xE9\x97\xB4\xE8\x89\xB0\xE7\xBC\x84\xE8\x8C\xA7\xE6\xA3\x80\xE7\xA2\xB1\xE7\xA1\xB7\xE6\x8B\xA3\xE6\x8D\xA1\xE7\xAE\x80\xE4\xBF\xAD\xE5\x87\x8F\xE8\x8D\x90\xE6\xA7\x9B\xE9\x89\xB4\xE8\xB7\xB5\xE8\xB4\xB1\xE8\xA7\x81\xE9\x94\xAE\xE8\x88\xB0\xE5\x89\x91\xE9\xA5\xAF\xE6\xB8\x90\xE6\xBA\x85\xE6\xB6\xA7\xE8\xB0\x8F\xE7\xBC\xA3\xE6\x88\x8B\xE6\x88\xAC\xE7\x9D\x91\xE9\xB9\xA3\xE7\xAC\x95\xE9\xB2\xA3\xE9\x9E\xAF\xE5\xB0\x86\xE6\xB5\x86\xE8\x92\x8B\xE6\xA1\xA8\xE5\xA5\x96\xE8\xAE\xB2\xE9\x85\xB1\xE7\xBB\x9B\xE7\xBC\xB0\xE8\x83\xB6\xE6\xB5\x87\xE9\xAA\x84\xE5\xA8\x87\xE6\x90\x85\xE9\x93\xB0\xE7\x9F\xAB\xE4\xBE\xA5\xE8\x84\x9A\xE9\xA5\xBA\xE7\xBC\xB4\xE7\xBB\x9E\xE8\xBD\xBF\xE8\xBE\x83\xE6\x8C\xA2\xE5\xB3\xA4\xE9\xB9\xAA\xE9\xB2\x9B\xE9\x98\xB6\xE8\x8A\x82\xE6\xB4\x81\xE7\xBB\x93\xE8\xAF\xAB\xE5\xB1\x8A\xE7\x96\x96\xE9\xA2\x8C\xE9\xB2\x92\xE7\xB4\xA7\xE9\x94\xA6\xE4\xBB\x85\xE8\xB0\xA8\xE8\xBF\x9B\xE6\x99\x8B\xE7\x83\xAC\xE5\xB0\xBD\xE5\x8A\xB2\xE8\x8D\x86\xE8\x8C\x8E\xE5\x8D\xBA\xE8\x8D\xA9\xE9\xA6\x91\xE7\xBC\x99\xE8\xB5\x86\xE8\xA7\x90\xE9\xB2\xB8\xE6\x83\x8A\xE7\xBB\x8F\xE9\xA2\x88\xE9\x9D\x99\xE9\x95\x9C\xE5\xBE\x84\xE7\x97\x89\xE7\xAB\x9E\xE5\x87\x80\xE5\x88\xAD\xE6\xB3\xBE\xE8\xBF\xB3\xE5\xBC\xAA\xE8\x83\xAB\xE9\x9D\x93\xE7\xBA\xA0\xE5\x8E\xA9\xE6\x97\xA7\xE9\x98\x84\xE9\xB8\xA0\xE9\xB9\xAB\xE9\xA9\xB9\xE4\xB8\xBE\xE6\x8D\xAE\xE9\x94\xAF\xE6\x83\xA7\xE5\x89\xA7\xE8\xAE\xB5\xE5\xB1\xA6\xE6\xA6\x89\xE9\xA3\x93\xE9\x92\x9C\xE9\x94\x94\xE7\xAA\xAD\xE9\xBE\x83\xE9\xB9\x83\xE7\xBB\xA2\xE9\x94\xA9\xE9\x95\x8C\xE9\x9A\xBD\xE8\xA7\x89\xE5\x86\xB3\xE7\xBB\x9D\xE8\xB0\xB2\xE7\x8F\x8F\xE9\x92\xA7\xE5\x86\x9B\xE9\xAA\x8F\xE7\x9A\xB2\xE5\xBC\x80\xE5\x87\xAF\xE5\x89\x80\xE5\x9E\xB2\xE5\xBF\xBE\xE6\x81\xBA\xE9\x93\xA0\xE9\x94\xB4\xE9\xBE\x9B\xE9\x97\xB6\xE9\x92\xAA\xE9\x93\x90\xE9\xA2\x97\xE5\xA3\xB3\xE8\xAF\xBE\xE9\xAA\x92\xE7\xBC\x82\xE8\xBD\xB2\xE9\x92\xB6\xE9\x94\x9E\xE9\xA2\x94\xE5\x9E\xA6\xE6\x81\xB3\xE9\xBE\x88\xE9\x93\xBF\xE6\x8A\xA0\xE5\xBA\x93\xE8\xA3\xA4\xE5\x96\xBE\xE5\x9D\x97\xE4\xBE\xA9\xE9\x83\x90\xE5\x93\x99\xE8\x84\x8D\xE5\xAE\xBD\xE7\x8B\xAF\xE9\xAB\x8B\xE7\x9F\xBF\xE6\x97\xB7\xE5\x86\xB5\xE8\xAF\x93\xE8\xAF\xB3\xE9\x82\x9D\xE5\x9C\xB9\xE7\xBA\xA9\xE8\xB4\xB6\xE4\xBA\x8F\xE5\xB2\xBF\xE7\xAA\xA5\xE9\xA6\x88\xE6\xBA\x83\xE5\x8C\xAE\xE8\x92\x89\xE6\x84\xA6\xE8\x81\xA9\xE7\xAF\x91\xE9\x98\x83\xE9\x94\x9F\xE9\xB2\xB2\xE6\x89\xA9\xE9\x98\x94\xE8\x9B\xB4\xE8\x9C\xA1\xE8\x85\x8A\xE8\x8E\xB1\xE6\x9D\xA5\xE8\xB5\x96\xE5\xB4\x83\xE5\xBE\x95\xE6\xB6\x9E\xE6\xBF\x91\xE8\xB5\x89\xE7\x9D\x90\xE9\x93\xBC\xE7\x99\x9E\xE7\xB1\x81\xE8\x93\x9D\xE6\xA0\x8F\xE6\x8B\xA6\xE7\xAF\xAE\xE9\x98\x91\xE5\x85\xB0\xE6\xBE\x9C\xE8\xB0\xB0\xE6\x8F\xBD\xE8\xA7\x88\xE6\x87\x92\xE7\xBC\x86\xE7\x83\x82\xE6\xBB\xA5\xE5\xB2\x9A\xE6\xA6\x84\xE6\x96\x93\xE9\x95\xA7\xE8\xA4\xB4\xE7\x90\x85\xE9\x98\x86\xE9\x94\x92\xE6\x8D\x9E\xE5\x8A\xB3\xE6\xB6\x9D\xE5\x94\xA0\xE5\xB4\x82\xE9\x93\x91\xE9\x93\xB9\xE7\x97\xA8\xE4\xB9\x90\xE9\xB3\x93\xE9\x95\xAD\xE5\x9E\x92\xE7\xB1\xBB\xE6\xB3\xAA\xE8\xAF\x94\xE7\xBC\xA7\xE7\xAF\xB1\xE7\x8B\xB8\xE7\xA6\xBB\xE9\xB2\xA4\xE7\xA4\xBC\xE4\xB8\xBD\xE5\x8E\x89\xE5\x8A\xB1\xE7\xA0\xBE\xE5\x8E\x86\xE6\xB2\xA5\xE9\x9A\xB6\xE4\xBF\xAA\xE9\x83\xA6\xE5\x9D\x9C\xE8\x8B\x88\xE8\x8E\x85\xE8\x93\xA0\xE5\x91\x96\xE9\x80\xA6\xE9\xAA\x8A\xE7\xBC\xA1\xE6\x9E\xA5\xE6\xA0\x8E\xE8\xBD\xB9\xE7\xA0\xBA\xE9\x94\x82\xE9\xB9\x82\xE7\x96\xA0\xE7\xB2\x9D\xE8\xB7\x9E\xE9\x9B\xB3\xE9\xB2\xA1\xE9\xB3\xA2\xE4\xBF\xA9\xE8\x81\x94\xE8\x8E\xB2\xE8\xBF\x9E\xE9\x95\xB0\xE6\x80\x9C\xE6\xB6\x9F\xE5\xB8\x98\xE6\x95\x9B\xE8\x84\xB8\xE9\x93\xBE\xE6\x81\x8B\xE7\x82\xBC\xE7\xBB\x83\xE8\x94\xB9\xE5\xA5\x81\xE6\xBD\x8B\xE7\x90\x8F\xE6\xAE\x93\xE8\xA3\xA2\xE8\xA3\xA3\xE9\xB2\xA2\xE7\xB2\xAE\xE5\x87\x89\xE4\xB8\xA4\xE8\xBE\x86\xE8\xB0\x85\xE9\xAD\x89\xE7\x96\x97\xE8\xBE\xBD\xE9\x95\xA3\xE7\xBC\xAD\xE9\x92\x8C\xE9\xB9\xA9\xE7\x8C\x8E\xE4\xB8\xB4\xE9\x82\xBB\xE9\xB3\x9E\xE5\x87\x9B\xE8\xB5\x81\xE8\x94\xBA\xE5\xBB\xAA\xE6\xAA\xA9\xE8\xBE\x9A\xE8\xBA\x8F\xE9\xBE\x84\xE9\x93\x83\xE7\x81\xB5\xE5\xB2\xAD\xE9\xA2\x86\xE7\xBB\xAB\xE6\xA3\x82\xE8\x9B\x8F\xE9\xB2\xAE\xE9\xA6\x8F\xE5\x88\x98\xE6\xB5\x8F\xE9\xAA\x9D\xE7\xBB\xBA\xE9\x95\x8F\xE9\xB9\xA8\xE9\xBE\x99\xE8\x81\x8B\xE5\x92\x99\xE7\xAC\xBC\xE5\x9E\x84\xE6\x8B\xA2\xE9\x99\x87\xE8\x8C\x8F\xE6\xB3\xB7\xE7\x8F\x91\xE6\xA0\x8A\xE8\x83\xA7\xE7\xA0\xBB\xE6\xA5\xBC\xE5\xA8\x84\xE6\x90\x82\xE7\xAF\x93\xE5\x81\xBB\xE8\x92\x8C\xE5\x96\xBD\xE5\xB5\x9D\xE9\x95\x82\xE7\x98\x98\xE8\x80\xA7\xE8\x9D\xBC\xE9\xAB\x85\xE8\x8A\xA6\xE5\x8D\xA2\xE9\xA2\x85\xE5\xBA\x90\xE7\x82\x89\xE6\x8E\xB3\xE5\x8D\xA4\xE8\x99\x8F\xE9\xB2\x81\xE8\xB5\x82\xE7\xA6\x84\xE5\xBD\x95\xE9\x99\x86\xE5\x9E\x86\xE6\x92\xB8\xE5\x99\x9C\xE9\x97\xBE\xE6\xB3\xB8\xE6\xB8\x8C\xE6\xA0\x8C\xE6\xA9\xB9\xE8\xBD\xB3\xE8\xBE\x82\xE8\xBE\x98\xE6\xB0\x87\xE8\x83\xAA\xE9\xB8\xAC\xE9\xB9\xAD\xE8\x88\xBB\xE9\xB2\x88\xE5\xB3\xA6\xE6\x8C\x9B\xE5\xAD\xAA\xE6\xBB\xA6\xE4\xB9\xB1\xE8\x84\x94\xE5\xA8\x88\xE6\xA0\xBE\xE9\xB8\xBE\xE9\x8A\xAE\xE6\x8A\xA1\xE8\xBD\xAE\xE4\xBC\xA6\xE4\xBB\x91\xE6\xB2\xA6\xE7\xBA\xB6\xE8\xAE\xBA\xE5\x9B\xB5\xE8\x90\x9D\xE7\xBD\x97\xE9\x80\xBB\xE9\x94\xA3\xE7\xAE\xA9\xE9\xAA\xA1\xE9\xAA\x86\xE7\xBB\x9C\xE8\x8D\xA6\xE7\x8C\xA1\xE6\xB3\xBA\xE6\xA4\xA4\xE8\x84\xB6\xE9\x95\x99\xE9\xA9\xB4\xE5\x90\x95\xE9\x93\x9D\xE4\xBE\xA3\xE5\xB1\xA1\xE7\xBC\x95\xE8\x99\x91\xE6\xBB\xA4\xE7\xBB\xBF\xE6\xA6\x88\xE8\xA4\x9B\xE9\x94\x8A\xE5\x91\x92\xE5\xA6\x88\xE7\x8E\x9B\xE7\xA0\x81\xE8\x9A\x82\xE9\xA9\xAC\xE9\xAA\x82\xE5\x90\x97\xE5\x94\x9B\xE5\xAC\xB7\xE6\x9D\xA9\xE4\xB9\xB0\xE9\xBA\xA6\xE5\x8D\x96\xE8\xBF\x88\xE8\x84\x89\xE5\x8A\xA2\xE7\x9E\x92\xE9\xA6\x92\xE8\x9B\xAE\xE6\xBB\xA1\xE8\xB0\xA9\xE7\xBC\xA6\xE9\x95\x98\xE9\xA2\xA1\xE9\xB3\x97\xE7\x8C\xAB\xE9\x94\x9A\xE9\x93\x86\xE8\xB4\xB8\xE9\xBA\xBD\xE6\xB2\xA1\xE9\x95\x81\xE9\x97\xA8\xE9\x97\xB7\xE4\xBB\xAC\xE6\x89\xAA\xE7\x84\x96\xE6\x87\x91\xE9\x92\x94\xE9\x94\xB0\xE6\xA2\xA6\xE7\x9C\xAF\xE8\xB0\x9C\xE5\xBC\xA5\xE8\xA7\x85\xE5\xB9\x82\xE8\x8A\x88\xE8\xB0\xA7\xE7\x8C\x95\xE7\xA5\xA2\xE7\xBB\xB5\xE7\xBC\x85\xE6\xB8\x91\xE8\x85\xBC\xE9\xBB\xBE\xE5\xBA\x99\xE7\xBC\x88\xE7\xBC\xAA\xE7\x81\xAD\xE6\x82\xAF\xE9\x97\xBD\xE9\x97\xB5\xE7\xBC\x97\xE9\xB8\xA3\xE9\x93\xAD\xE8\xB0\xAC\xE8\xB0\x9F\xE8\x93\xA6\xE9\xA6\x8D\xE6\xAE\x81\xE9\x95\x86\xE8\xB0\x8B\xE4\xBA\xA9\xE9\x92\xBC\xE5\x91\x90\xE9\x92\xA0\xE7\xBA\xB3\xE9\x9A\xBE\xE6\x8C\xA0\xE8\x84\x91\xE6\x81\xBC\xE9\x97\xB9\xE9\x93\x99\xE8\xAE\xB7\xE9\xA6\x81\xE5\x86\x85\xE6\x8B\x9F\xE8\x85\xBB\xE9\x93\x8C\xE9\xB2\xB5\xE6\x92\xB5\xE8\xBE\x87\xE9\xB2\xB6\xE9\x85\xBF\xE9\xB8\x9F\xE8\x8C\x91\xE8\xA2\x85\xE8\x81\x82\xE5\x95\xAE\xE9\x95\x8A\xE9\x95\x8D\xE9\x99\xA7\xE8\x98\x96\xE5\x97\xAB\xE9\xA2\x9F\xE8\xB9\x91\xE6\x9F\xA0\xE7\x8B\x9E\xE5\xAE\x81\xE6\x8B\xA7\xE6\xB3\x9E\xE8\x8B\x8E\xE5\x92\x9B\xE8\x81\x8D\xE9\x92\xAE\xE7\xBA\xBD\xE8\x84\x93\xE6\xB5\x93\xE5\x86\x9C\xE4\xBE\xAC\xE5\x93\x9D\xE9\xA9\xBD\xE9\x92\x95\xE8\xAF\xBA\xE5\x82\xA9\xE7\x96\x9F\xE6\xAC\xA7\xE9\xB8\xA5\xE6\xAE\xB4\xE5\x91\x95\xE6\xB2\xA4\xE8\xAE\xB4\xE6\x80\x84\xE7\x93\xAF\xE7\x9B\x98\xE8\xB9\x92\xE5\xBA\x9E\xE6\x8A\x9B\xE7\x96\xB1\xE8\xB5\x94\xE8\xBE\x94\xE5\x96\xB7\xE9\xB9\x8F\xE7\xBA\xB0\xE7\xBD\xB4\xE9\x93\x8D\xE9\xAA\x97\xE8\xB0\x9D\xE9\xAA\x88\xE9\xA3\x98\xE7\xBC\xA5\xE9\xA2\x91\xE8\xB4\xAB\xE5\xAB\x94\xE8\x8B\xB9\xE5\x87\xAD\xE8\xAF\x84\xE6\xB3\xBC\xE9\xA2\x87\xE9\x92\x8B\xE6\x89\x91\xE9\x93\xBA\xE6\x9C\xB4\xE8\xB0\xB1\xE9\x95\xA4\xE9\x95\xA8\xE6\xA0\x96\xE8\x84\x90\xE9\xBD\x90\xE9\xAA\x91\xE5\xB2\x82\xE5\x90\xAF\xE6\xB0\x94\xE5\xBC\x83\xE8\xAE\xAB\xE8\x95\xB2\xE9\xAA\x90\xE7\xBB\xAE\xE6\xA1\xA4\xE7\xA2\x9B\xE9\xA2\x80\xE9\xA2\x83\xE9\xB3\x8D\xE7\x89\xB5\xE9\x92\x8E\xE9\x93\x85\xE8\xBF\x81\xE7\xAD\xBE\xE8\xB0\xA6\xE9\x92\xB1\xE9\x92\xB3\xE6\xBD\x9C\xE6\xB5\x85\xE8\xB0\xB4\xE5\xA0\x91\xE4\xBD\xA5\xE8\x8D\xA8\xE6\x82\xAD\xE9\xAA\x9E\xE7\xBC\xB1\xE6\xA4\xA0\xE9\x92\xA4\xE6\x9E\xAA\xE5\x91\x9B\xE5\xA2\x99\xE8\x94\xB7\xE5\xBC\xBA\xE6\x8A\xA2\xE5\xAB\xB1\xE6\xA8\xAF\xE6\x88\x97\xE7\x82\x9D\xE9\x94\x96\xE9\x94\xB5\xE9\x95\xAA\xE7\xBE\x9F\xE8\xB7\x84\xE9\x94\xB9\xE6\xA1\xA5\xE4\xB9\x94\xE4\xBE\xA8\xE7\xBF\x98\xE7\xAA\x8D\xE8\xAF\xAE\xE8\xB0\xAF\xE8\x8D\x9E\xE7\xBC\xB2\xE7\xA1\x97\xE8\xB7\xB7\xE7\xAA\x83\xE6\x83\xAC\xE9\x94\xB2\xE7\xAE\xA7\xE9\x92\xA6\xE4\xBA\xB2\xE5\xAF\x9D\xE9\x94\x93\xE8\xBD\xBB\xE6\xB0\xA2\xE5\x80\xBE\xE9\xA1\xB7\xE8\xAF\xB7\xE5\xBA\x86\xE6\x8F\xBF\xE9\xB2\xAD\xE7\x90\xBC\xE7\xA9\xB7\xE8\x8C\x95\xE8\x9B\xB1\xE5\xB7\xAF\xE8\xB5\x87\xE8\x99\xAE\xE9\xB3\x85\xE8\xB6\x8B\xE5\x8C\xBA\xE8\xBA\xAF\xE9\xA9\xB1\xE9\xBE\x8B\xE8\xAF\x8E\xE5\xB2\x96\xE9\x98\x92\xE8\xA7\x91\xE9\xB8\xB2\xE9\xA2\xA7\xE6\x9D\x83\xE5\x8A\x9D\xE8\xAF\xA0\xE7\xBB\xBB\xE8\xBE\x81\xE9\x93\xA8\xE5\x8D\xB4\xE9\xB9\x8A\xE7\xA1\xAE\xE9\x98\x95\xE9\x98\x99\xE6\x82\xAB\xE8\xAE\xA9\xE9\xA5\xB6\xE6\x89\xB0\xE7\xBB\x95\xE8\x8D\x9B\xE5\xA8\x86\xE6\xA1\xA1\xE7\x83\xAD\xE9\x9F\xA7\xE8\xAE\xA4\xE7\xBA\xAB\xE9\xA5\xAA\xE8\xBD\xAB\xE8\x8D\xA3\xE7\xBB\x92\xE5\xB5\x98\xE8\x9D\xBE\xE7\xBC\x9B\xE9\x93\xB7\xE9\xA2\xA6\xE8\xBD\xAF\xE9\x94\x90\xE8\x9A\xAC\xE9\x97\xB0\xE6\xB6\xA6\xE6\xB4\x92\xE8\x90\xA8\xE9\xA3\x92\xE9\xB3\x83\xE8\xB5\x9B\xE4\xBC\x9E\xE6\xAF\xB5\xE7\xB3\x81\xE4\xB8\xA7\xE9\xAA\x9A\xE6\x89\xAB\xE7\xBC\xAB\xE6\xB6\xA9\xE5\x95\xAC\xE9\x93\xAF\xE7\xA9\x91\xE6\x9D\x80\xE5\x88\xB9\xE7\xBA\xB1\xE9\x93\xA9\xE9\xB2\xA8\xE7\xAD\x9B\xE6\x99\x92\xE9\x85\xBE\xE5\x88\xA0\xE9\x97\xAA\xE9\x99\x95\xE8\xB5\xA1\xE7\xBC\xAE\xE8\xAE\xAA\xE5\xA7\x97\xE9\xAA\x9F\xE9\x92\x90\xE9\xB3\x9D\xE5\xA2\x92\xE4\xBC\xA4\xE8\xB5\x8F\xE5\x9E\xA7\xE6\xAE\x87\xE8\xA7\x9E\xE7\x83\xA7\xE7\xBB\x8D\xE8\xB5\x8A\xE6\x91\x84\xE6\x85\x91\xE8\xAE\xBE\xE5\x8E\x8D\xE6\xBB\xA0\xE7\x95\xB2\xE7\xBB\x85\xE5\xAE\xA1\xE5\xA9\xB6\xE8\x82\xBE\xE6\xB8\x97\xE8\xAF\x9C\xE8\xB0\x82\xE6\xB8\x96\xE5\xA3\xB0\xE7\xBB\xB3\xE8\x83\x9C\xE5\xB8\x88\xE7\x8B\xAE\xE6\xB9\xBF\xE8\xAF\x97\xE6\x97\xB6\xE8\x9A\x80\xE5\xAE\x9E\xE8\xAF\x86\xE9\xA9\xB6\xE5\x8A\xBF\xE9\x80\x82\xE9\x87\x8A\xE9\xA5\xB0\xE8\xA7\x86\xE8\xAF\x95\xE8\xB0\xA5\xE5\x9F\x98\xE8\x8E\xB3\xE5\xBC\x91\xE8\xBD\xBC\xE8\xB4\xB3\xE9\x93\x88\xE9\xB2\xA5\xE5\xAF\xBF\xE5\x85\xBD\xE7\xBB\xB6\xE6\x9E\xA2\xE8\xBE\x93\xE4\xB9\xA6\xE8\xB5\x8E\xE5\xB1\x9E\xE6\x9C\xAF\xE6\xA0\x91\xE7\xAB\x96\xE6\x95\xB0\xE6\x91\x85\xE7\xBA\xBE\xE5\xB8\x85\xE9\x97\xA9\xE5\x8F\x8C\xE8\xB0\x81\xE7\xA8\x8E\xE9\xA1\xBA\xE8\xAF\xB4\xE7\xA1\x95\xE7\x83\x81\xE9\x93\x84\xE4\xB8\x9D\xE9\xA5\xB2\xE5\x8E\xAE\xE9\xA9\xB7\xE7\xBC\x8C\xE9\x94\xB6\xE9\xB8\xB6\xE8\x80\xB8\xE6\x80\x82\xE9\xA2\x82\xE8\xAE\xBC\xE8\xAF\xB5\xE6\x93\x9E\xE8\x96\xAE\xE9\xA6\x8A\xE9\xA3\x95\xE9\x94\xBC\xE8\x8B\x8F\xE8\xAF\x89\xE8\x82\x83\xE8\xB0\xA1\xE7\xA8\xA3\xE8\x99\xBD\xE9\x9A\x8F\xE7\xBB\xA5\xE5\xB2\x81\xE8\xB0\x87\xE5\xAD\x99\xE6\x8D\x9F\xE7\xAC\x8B\xE8\x8D\xAA\xE7\x8B\xB2\xE7\xBC\xA9\xE7\x90\x90\xE9\x94\x81\xE5\x94\xA2\xE7\x9D\x83\xE7\x8D\xAD\xE6\x8C\x9E\xE9\x97\xBC\xE9\x93\x8A\xE9\xB3\x8E\xE5\x8F\xB0\xE6\x80\x81\xE9\x92\x9B\xE9\xB2\x90\xE6\x91\x8A\xE8\xB4\xAA\xE7\x98\xAB\xE6\xBB\xA9\xE5\x9D\x9B\xE8\xB0\xAD\xE8\xB0\x88\xE5\x8F\xB9\xE6\x98\x99\xE9\x92\xBD\xE9\x94\xAC\xE9\xA1\xB8\xE6\xB1\xA4\xE7\x83\xAB\xE5\x82\xA5\xE9\xA5\xA7\xE9\x93\xB4\xE9\x95\x97\xE6\xB6\x9B\xE7\xBB\xA6\xE8\xAE\xA8\xE9\x9F\xAC\xE9\x93\xBD\xE8\x85\xBE\xE8\xAA\x8A\xE9\x94\x91\xE9\xA2\x98\xE4\xBD\x93\xE5\xB1\x89\xE7\xBC\x87\xE9\xB9\x88\xE9\x98\x97\xE6\x9D\xA1\xE7\xB2\x9C\xE9\xBE\x86\xE9\xB2\xA6\xE8\xB4\xB4\xE9\x93\x81\xE5\x8E\x85\xE5\x90\xAC\xE7\x83\x83\xE9\x93\x9C\xE7\xBB\x9F\xE6\x81\xB8\xE5\xA4\xB4\xE9\x92\xAD\xE7\xA7\x83\xE5\x9B\xBE\xE9\x92\x8D\xE5\x9B\xA2\xE6\x8A\x9F\xE9\xA2\x93\xE8\x9C\x95\xE9\xA5\xA8\xE8\x84\xB1\xE9\xB8\xB5\xE9\xA9\xAE\xE9\xA9\xBC\xE6\xA4\xAD\xE7\xAE\xA8\xE9\xBC\x8D\xE8\xA2\x9C\xE5\xA8\xB2\xE8\x85\xBD\xE5\xBC\xAF\xE6\xB9\xBE\xE9\xA1\xBD\xE4\xB8\x87\xE7\xBA\xA8\xE7\xBB\xBE\xE7\xBD\x91\xE8\xBE\x8B\xE9\x9F\xA6\xE8\xBF\x9D\xE5\x9B\xB4\xE4\xB8\xBA\xE6\xBD\x8D\xE7\xBB\xB4\xE8\x8B\x87\xE4\xBC\x9F\xE4\xBC\xAA\xE7\xBA\xAC\xE8\xB0\x93\xE5\x8D\xAB\xE8\xAF\xBF\xE5\xB8\x8F\xE9\x97\xB1\xE6\xB2\xA9\xE6\xB6\xA0\xE7\x8E\xAE\xE9\x9F\xAA\xE7\x82\x9C\xE9\xB2\x94\xE6\xB8\xA9\xE9\x97\xBB\xE7\xBA\xB9\xE7\xA8\xB3\xE9\x97\xAE\xE9\x98\x8C\xE7\x93\xAE\xE6\x8C\x9D\xE8\x9C\x97\xE6\xB6\xA1\xE7\xAA\x9D\xE5\x8D\xA7\xE8\x8E\xB4\xE9\xBE\x8C\xE5\x91\x9C\xE9\x92\xA8\xE4\xB9\x8C\xE8\xAF\xAC\xE6\x97\xA0\xE8\x8A\x9C\xE5\x90\xB4\xE5\x9D\x9E\xE9\x9B\xBE\xE5\x8A\xA1\xE8\xAF\xAF\xE9\x82\xAC\xE5\xBA\x91\xE6\x80\x83\xE5\xA6\xA9\xE9\xAA\x9B\xE9\xB9\x89\xE9\xB9\x9C\xE9\x94\xA1\xE7\x89\xBA\xE8\xA2\xAD\xE4\xB9\xA0\xE9\x93\xA3\xE6\x88\x8F\xE7\xBB\x86\xE9\xA5\xA9\xE9\x98\x8B\xE7\x8E\xBA\xE8\xA7\x8B\xE8\x99\xBE\xE8\xBE\x96\xE5\xB3\xA1\xE4\xBE\xA0\xE7\x8B\xAD\xE5\x8E\xA6\xE5\x90\x93\xE7\xA1\x96\xE9\xB2\x9C\xE7\xBA\xA4\xE8\xB4\xA4\xE8\xA1\x94\xE9\x97\xB2\xE6\x98\xBE\xE9\x99\xA9\xE7\x8E\xB0\xE7\x8C\xAE\xE5\x8E\xBF\xE9\xA6\x85\xE7\xBE\xA1\xE5\xAE\xAA\xE7\xBA\xBF\xE8\x8B\x8B\xE8\x8E\xB6\xE8\x97\x93\xE5\xB2\x98\xE7\x8C\x83\xE5\xA8\xB4\xE9\xB9\x87\xE7\x97\xAB\xE8\x9A\x9D\xE7\xB1\xBC\xE8\xB7\xB9\xE5\x8E\xA2\xE9\x95\xB6\xE4\xB9\xA1\xE8\xAF\xA6\xE5\x93\x8D\xE9\xA1\xB9\xE8\x8A\x97\xE9\xA5\xB7\xE9\xAA\xA7\xE7\xBC\x83\xE9\xA3\xA8\xE8\x90\xA7\xE5\x9A\xA3\xE9\x94\x80\xE6\x99\x93\xE5\x95\xB8\xE5\x93\x93\xE6\xBD\x87\xE9\xAA\x81\xE7\xBB\xA1\xE6\x9E\xAD\xE7\xAE\xAB\xE5\x8D\x8F\xE6\x8C\x9F\xE6\x90\xBA\xE8\x83\x81\xE8\xB0\x90\xE5\x86\x99\xE6\xB3\xBB\xE8\xB0\xA2\xE4\xBA\xB5\xE6\x92\xB7\xE7\xBB\x81\xE7\xBC\xAC\xE9\x94\x8C\xE8\xA1\x85\xE5\x85\xB4\xE9\x99\x89\xE8\x8D\xA5\xE5\x87\xB6\xE6\xB1\xB9\xE9\x94\x88\xE7\xBB\xA3\xE9\xA6\x90\xE9\xB8\xBA\xE8\x99\x9A\xE5\x98\x98\xE9\xA1\xBB\xE8\xAE\xB8\xE5\x8F\x99\xE7\xBB\xAA\xE7\xBB\xAD\xE8\xAF\xA9\xE9\xA1\xBC\xE8\xBD\xA9\xE6\x82\xAC\xE9\x80\x89\xE7\x99\xA3\xE7\xBB\x9A\xE8\xB0\x96\xE9\x93\x89\xE9\x95\x9F\xE5\xAD\xA6\xE8\xB0\x91\xE6\xB3\xB6\xE9\xB3\x95\xE5\x8B\x8B\xE8\xAF\xA2\xE5\xAF\xBB\xE9\xA9\xAF\xE8\xAE\xAD\xE8\xAE\xAF\xE9\x80\x8A\xE5\x9F\x99\xE6\xB5\x94\xE9\xB2\x9F\xE5\x8E\x8B\xE9\xB8\xA6\xE9\xB8\xAD\xE5\x93\x91\xE4\xBA\x9A\xE8\xAE\xB6\xE5\x9E\xAD\xE5\xA8\x85\xE6\xA1\xA0\xE6\xB0\xA9\xE9\x98\x89\xE7\x83\x9F\xE7\x9B\x90\xE4\xB8\xA5\xE5\xB2\xA9\xE9\xA2\x9C\xE9\x98\x8E\xE8\x89\xB3\xE5\x8E\x8C\xE7\xA0\x9A\xE5\xBD\xA6\xE8\xB0\x9A\xE9\xAA\x8C\xE5\x8E\xA3\xE8\xB5\x9D\xE4\xBF\xA8\xE5\x85\x96\xE8\xB0\xB3\xE6\x81\xB9\xE9\x97\xAB\xE9\x85\xBD\xE9\xAD\x87\xE9\xA4\x8D\xE9\xBC\xB9\xE9\xB8\xAF\xE6\x9D\xA8\xE6\x89\xAC\xE7\x96\xA1\xE9\x98\xB3\xE7\x97\x92\xE5\x85\xBB\xE6\xA0\xB7\xE7\x82\x80\xE7\x91\xB6\xE6\x91\x87\xE5\xB0\xA7\xE9\x81\xA5\xE7\xAA\x91\xE8\xB0\xA3\xE8\x8D\xAF\xE8\xBD\xBA\xE9\xB9\x9E\xE9\xB3\x90\xE7\x88\xB7\xE9\xA1\xB5\xE4\xB8\x9A\xE5\x8F\xB6\xE9\x9D\xA5\xE8\xB0\x92\xE9\x82\xBA\xE6\x99\x94\xE7\x83\xA8\xE5\x8C\xBB\xE9\x93\xB1\xE9\xA2\x90\xE9\x81\x97\xE4\xBB\xAA\xE8\x9A\x81\xE8\x89\xBA\xE4\xBA\xBF\xE5\xBF\x86\xE4\xB9\x89\xE8\xAF\xA3\xE8\xAE\xAE\xE8\xB0\x8A\xE8\xAF\x91\xE5\xBC\x82\xE7\xBB\x8E\xE8\xAF\x92\xE5\x91\x93\xE5\xB3\x84\xE9\xA5\xB4\xE6\x80\xBF\xE9\xA9\xBF\xE7\xBC\xA2\xE8\xBD\xB6\xE8\xB4\xBB\xE9\x92\x87\xE9\x95\x92\xE9\x95\xB1\xE7\x98\x97\xE8\x88\xA3\xE8\x8D\xAB\xE9\x98\xB4\xE9\x93\xB6\xE9\xA5\xAE\xE9\x9A\x90\xE9\x93\x9F\xE7\x98\xBE\xE6\xA8\xB1\xE5\xA9\xB4\xE9\xB9\xB0\xE5\xBA\x94\xE7\xBC\xA8\xE8\x8E\xB9\xE8\x90\xA4\xE8\x90\xA5\xE8\x8D\xA7\xE8\x9D\x87\xE8\xB5\xA2\xE9\xA2\x96\xE8\x8C\x94\xE8\x8E\xBA\xE8\x90\xA6\xE8\x93\xA5\xE6\x92\x84\xE5\x98\xA4\xE6\xBB\xA2\xE6\xBD\x86\xE7\x92\x8E\xE9\xB9\xA6\xE7\x98\xBF\xE9\xA2\x8F\xE7\xBD\x82\xE5\x93\x9F\xE6\x8B\xA5\xE4\xBD\xA3\xE7\x97\x88\xE8\xB8\x8A\xE5\x92\x8F\xE9\x95\x9B\xE4\xBC\x98\xE5\xBF\xA7\xE9\x82\xAE\xE9\x93\x80\xE7\x8A\xB9\xE8\xAF\xB1\xE8\x8E\xB8\xE9\x93\x95\xE9\xB1\xBF\xE8\x88\x86\xE9\xB1\xBC\xE6\xB8\x94\xE5\xA8\xB1\xE4\xB8\x8E\xE5\xB1\xBF\xE8\xAF\xAD\xE7\x8B\xB1\xE8\xAA\x89\xE9\xA2\x84\xE9\xA9\xAD\xE4\xBC\x9B\xE4\xBF\xA3\xE8\xB0\x80\xE8\xB0\x95\xE8\x93\xA3\xE5\xB5\x9B\xE9\xA5\xAB\xE9\x98\x88\xE5\xA6\xAA\xE7\xBA\xA1\xE8\xA7\x8E\xE6\xAC\xA4\xE9\x92\xB0\xE9\xB9\x86\xE9\xB9\xAC\xE9\xBE\x89\xE9\xB8\xB3\xE6\xB8\x8A\xE8\xBE\x95\xE5\x9B\xAD\xE5\x91\x98\xE5\x9C\x86\xE7\xBC\x98\xE8\xBF\x9C\xE6\xA9\xBC\xE9\xB8\xA2\xE9\xBC\x8B\xE7\xBA\xA6\xE8\xB7\x83\xE9\x92\xA5\xE7\xB2\xA4\xE6\x82\xA6\xE9\x98\x85\xE9\x92\xBA\xE9\x83\xA7\xE5\x8C\x80\xE9\x99\xA8\xE8\xBF\x90\xE8\x95\xB4\xE9\x85\x9D\xE6\x99\x95\xE9\x9F\xB5\xE9\x83\x93\xE8\x8A\xB8\xE6\x81\xBD\xE6\x84\xA0\xE7\xBA\xAD\xE9\x9F\xAB\xE6\xAE\x92\xE6\xB0\xB2\xE6\x9D\x82\xE7\x81\xBE\xE8\xBD\xBD\xE6\x94\x92\xE6\x9A\x82\xE8\xB5\x9E\xE7\x93\x92\xE8\xB6\xB1\xE9\x8C\xBE\xE8\xB5\x83\xE8\x84\x8F\xE9\xA9\xB5\xE5\x87\xBF\xE6\x9E\xA3\xE8\xB4\xA3\xE6\x8B\xA9\xE5\x88\x99\xE6\xB3\xBD\xE8\xB5\x9C\xE5\x95\xA7\xE5\xB8\xBB\xE7\xAE\xA6\xE8\xB4\xBC\xE8\xB0\xAE\xE8\xB5\xA0\xE7\xBB\xBC\xE7\xBC\xAF\xE8\xBD\xA7\xE9\x93\xA1\xE9\x97\xB8\xE6\xA0\x85\xE8\xAF\x88\xE6\x96\x8B\xE5\x80\xBA\xE6\xAF\xA1\xE7\x9B\x8F\xE6\x96\xA9\xE8\xBE\x97\xE5\xB4\xAD\xE6\xA0\x88\xE6\x88\x98\xE7\xBB\xBD\xE8\xB0\xB5\xE5\xBC\xA0\xE6\xB6\xA8\xE5\xB8\x90\xE8\xB4\xA6\xE8\x83\x80\xE8\xB5\xB5\xE8\xAF\x8F\xE9\x92\x8A\xE8\x9B\xB0\xE8\xBE\x99\xE9\x94\x97\xE8\xBF\x99\xE8\xB0\xAA\xE8\xBE\x84\xE9\xB9\xA7\xE8\xB4\x9E\xE9\x92\x88\xE4\xBE\xA6\xE8\xAF\x8A\xE9\x95\x87\xE9\x98\xB5\xE6\xB5\x88\xE7\xBC\x9C\xE6\xA1\xA2\xE8\xBD\xB8\xE8\xB5\x88\xE7\xA5\xAF\xE9\xB8\xA9\xE6\x8C\xA3\xE7\x9D\x81\xE7\x8B\xB0\xE4\xBA\x89\xE5\xB8\xA7\xE7\x97\x87\xE9\x83\x91\xE8\xAF\x81\xE8\xAF\xA4\xE5\xB3\xA5\xE9\x92\xB2\xE9\x93\xAE\xE7\xAD\x9D\xE7\xBB\x87\xE8\x81\x8C\xE6\x89\xA7\xE7\xBA\xB8\xE6\x8C\x9A\xE6\x8E\xB7\xE5\xB8\x9C\xE8\xB4\xA8\xE6\xBB\x9E\xE9\xAA\x98\xE6\xA0\x89\xE6\xA0\x80\xE8\xBD\xB5\xE8\xBD\xBE\xE8\xB4\xBD\xE9\xB8\xB7\xE8\x9B\xB3\xE7\xB5\xB7\xE8\xB8\xAC\xE8\xB8\xAF\xE8\xA7\xAF\xE9\x92\x9F\xE7\xBB\x88\xE7\xA7\x8D\xE8\x82\xBF\xE4\xBC\x97\xE9\x94\xBA\xE8\xAF\x8C\xE8\xBD\xB4\xE7\x9A\xB1\xE6\x98\xBC\xE9\xAA\xA4\xE7\xBA\xA3\xE7\xBB\x89\xE7\x8C\xAA\xE8\xAF\xB8\xE8\xAF\x9B\xE7\x83\x9B\xE7\x9E\xA9\xE5\x98\xB1\xE8\xB4\xAE\xE9\x93\xB8\xE9\xA9\xBB\xE4\xBC\xAB\xE6\xA7\xA0\xE9\x93\xA2\xE4\xB8\x93\xE7\xA0\x96\xE8\xBD\xAC\xE8\xB5\x9A\xE5\x95\xAD\xE9\xA6\x94\xE9\xA2\x9E\xE6\xA1\xA9\xE5\xBA\x84\xE8\xA3\x85\xE5\xA6\x86\xE5\xA3\xAE\xE7\x8A\xB6\xE9\x94\xA5\xE8\xB5\x98\xE5\x9D\xA0\xE7\xBC\x80\xE9\xAA\x93\xE7\xBC\x92\xE8\xB0\x86\xE5\x87\x86\xE7\x9D\x80\xE6\xB5\x8A\xE8\xAF\xBC\xE9\x95\xAF\xE5\x85\xB9\xE8\xB5\x84\xE6\xB8\x8D\xE8\xB0\x98\xE7\xBC\x81\xE8\xBE\x8E\xE8\xB5\x80\xE7\x9C\xA6\xE9\x94\xB1\xE9\xBE\x87\xE9\xB2\xBB\xE8\xB8\xAA\xE6\x80\xBB\xE7\xBA\xB5\xE5\x81\xAC\xE9\x82\xB9\xE8\xAF\xB9\xE9\xA9\xBA\xE9\xB2\xB0\xE8\xAF\x85\xE7\xBB\x84\xE9\x95\x9E\xE9\x92\xBB\xE7\xBC\xB5\xE8\xBA\x9C\xE9\xB3\x9F\xE7\xBF\xB1\xE5\xB9\xB6\xE5\x8D\x9C\xE6\xB2\x89\xE4\xB8\x91\xE6\xB7\x80\xE8\xBF\xAD\xE6\x96\x97\xE8\x8C\x83\xE5\xB9\xB2\xE7\x9A\x8B\xE7\xA1\x85\xE6\x9F\x9C\xE5\x90\x8E\xE4\xBC\x99\xE7\xA7\xB8\xE6\x9D\xB0\xE8\xAF\x80\xE5\xA4\xB8\xE9\x87\x8C\xE5\x87\x8C\xE4\xB9\x88\xE9\x9C\x89\xE6\x8D\xBB\xE5\x87\x84\xE6\x89\xA6\xE5\x9C\xA3\xE5\xB0\xB8\xE6\x8A\xAC\xE6\xB6\x82\xE6\xB4\xBC\xE5\x96\x82\xE6\xB1\xA1\xE9\x94\xA8\xE5\x92\xB8\xE8\x9D\x8E\xE5\xBD\x9D\xE6\xB6\x8C\xE6\xB8\xB8\xE5\x90\x81\xE5\xBE\xA1\xE6\x84\xBF\xE5\xB2\xB3\xE4\xBA\x91\xE7\x81\xB6\xE6\x89\x8E\xE6\x9C\xAD\xE7\xAD\x91\xE4\xBA\x8E\xE5\xBF\x97\xE6\xB3\xA8\xE5\x87\x8B\xE8\xAE\xA0\xE8\xB0\xAB\xE9\x83\x84\xE5\x8B\x90\xE5\x87\xBC\xE5\x9D\x82\xE5\x9E\x85\xE5\x9E\xB4\xE5\x9F\xAF\xE5\x9F\x9D\xE8\x8B\x98\xE8\x8D\xAC\xE8\x8D\xAE\xE8\x8E\x9C\xE8\x8E\xBC\xE8\x8F\xB0\xE8\x97\x81\xE6\x8F\xB8\xE5\x90\x92\xE5\x90\xA3\xE5\x92\x94\xE5\x92\x9D\xE5\x92\xB4\xE5\x99\x98\xE5\x99\xBC\xE5\x9A\xAF\xE5\xB9\x9E\xE5\xB2\x99\xE5\xB5\xB4\xE5\xBD\xB7\xE5\xBE\xBC\xE7\x8A\xB8\xE7\x8B\x8D\xE9\xA6\x80\xE9\xA6\x87\xE9\xA6\x93\xE9\xA6\x95\xE6\x84\xA3\xE6\x86\xB7\xE6\x87\x94\xE4\xB8\xAC\xE6\xBA\x86\xE6\xBB\x9F\xE6\xBA\xB7\xE6\xBC\xA4\xE6\xBD\xB4\xE6\xBE\xB9\xE7\x94\xAF\xE7\xBA\x9F\xE7\xBB\x94\xE7\xBB\xB1\xE7\x8F\x89\xE6\x9E\xA7\xE6\xA1\x8A\xE6\xA1\x89\xE6\xA7\x94\xE6\xA9\xA5\xE8\xBD\xB1\xE8\xBD\xB7\xE8\xB5\x8D\xE8\x82\xB7\xE8\x83\xA8\xE9\xA3\x9A\xE7\x85\xB3\xE7\x85\x85\xE7\x86\x98\xE6\x84\x8D\xE6\xB7\xBC\xE7\xA0\x9C\xE7\xA3\x99\xE7\x9C\x8D\xE9\x92\x9A\xE9\x92\xB7\xE9\x93\x98\xE9\x93\x9E\xE9\x94\x83\xE9\x94\x8D\xE9\x94\x8E\xE9\x94\x8F\xE9\x94\x98\xE9\x94\x9D\xE9\x94\xAA\xE9\x94\xAB\xE9\x94\xBF\xE9\x95\x85\xE9\x95\x8E\xE9\x95\xA2\xE9\x95\xA5\xE9\x95\xA9\xE9\x95\xB2\xE7\xA8\x86\xE9\xB9\x8B\xE9\xB9\x9B\xE9\xB9\xB1\xE7\x96\xAC\xE7\x96\xB4\xE7\x97\x96\xE7\x99\xAF\xE8\xA3\xA5\xE8\xA5\x81\xE8\x80\xA2\xE9\xA2\xA5\xE8\x9E\xA8\xE9\xBA\xB4\xE9\xB2\x85\xE9\xB2\x86\xE9\xB2\x87\xE9\xB2\x9E\xE9\xB2\xB4\xE9\xB2\xBA\xE9\xB2\xBC\xE9\xB3\x8A\xE9\xB3\x8B\xE9\xB3\x98\xE9\xB3\x99\xE9\x9E\x92\xE9\x9E\xB4\xE9\xBD\x84", index));
			runeValueS = _tuple[0];
			_key = runeValueT; (t2sMapping || $throwRuntimeError("assignment to entry in nil map"))[$Int32.keyFor(_key)] = { k: _key, v: runeValueS };
			_key$1 = runeValueS; (s2tMapping || $throwRuntimeError("assignment to entry in nil map"))[$Int32.keyFor(_key$1)] = { k: _key$1, v: runeValueT };
			_i += _rune[1];
		}
	};
	T2S = function(s) {
		var $ptr, _entry, _i, _ref, _rune, _tuple, chs, ok, runeValue, s, v;
		chs = sliceType.nil;
		_ref = s;
		_i = 0;
		while (true) {
			if (!(_i < _ref.length)) { break; }
			_rune = $decodeRune(_ref, _i);
			runeValue = _rune[0];
			_tuple = (_entry = t2sMapping[$Int32.keyFor(runeValue)], _entry !== undefined ? [_entry.v, true] : [0, false]);
			v = _tuple[0];
			ok = _tuple[1];
			if (ok) {
				chs = $append(chs, v);
			} else {
				chs = $append(chs, runeValue);
			}
			_i += _rune[1];
		}
		return $runesToString(chs);
	};
	$pkg.T2S = T2S;
	S2T = function(s) {
		var $ptr, _entry, _i, _ref, _rune, _tuple, cht, ok, runeValue, s, v;
		cht = sliceType.nil;
		_ref = s;
		_i = 0;
		while (true) {
			if (!(_i < _ref.length)) { break; }
			_rune = $decodeRune(_ref, _i);
			runeValue = _rune[0];
			_tuple = (_entry = s2tMapping[$Int32.keyFor(runeValue)], _entry !== undefined ? [_entry.v, true] : [0, false]);
			v = _tuple[0];
			ok = _tuple[1];
			if (ok) {
				cht = $append(cht, v);
			} else {
				cht = $append(cht, runeValue);
			}
			_i += _rune[1];
		}
		return $runesToString(cht);
	};
	$pkg.S2T = S2T;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = utf8.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		t2sMapping = {};
		s2tMapping = {};
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, $init, godom, gojianfan, sliceType, main;
	godom = $packages["github.com/siongui/godom"];
	gojianfan = $packages["github.com/siongui/gojianfan"];
	sliceType = $sliceType($emptyInterface);
	main = function() {
		var $ptr, i;
		i = godom.Document.QuerySelector("#info");
		godom.Document.QuerySelector("#tot").AddEventListener("click", (function(e) {
			var $ptr, e;
			i.SetValue(gojianfan.S2T(i.Value()));
		}), new sliceType([]));
		godom.Document.QuerySelector("#tos").AddEventListener("click", (function(e) {
			var $ptr, e;
			i.SetValue(gojianfan.T2S(i.Value()));
		}), new sliceType([]));
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = godom.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = gojianfan.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if ($pkg === $mainPkg) {
			main();
			$mainFinished = true;
		}
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$synthesizeMethods();
var $mainPkg = $packages["main"];
$packages["runtime"].$init();
$go($mainPkg.$init, []);
$flushConsole();

}).call(this);
//# sourceMappingURL=app.js.map
