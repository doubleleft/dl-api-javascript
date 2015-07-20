/**
 * Hook.Client is the entry-point for using hook.
 *
 * You should instantiate a global javascript client for consuming hook.
 *
 * ```javascript
 * var client = new Hook.Client({
 *   endpoint: "http://local-or-remote-hook-address.com/public/index.php/",
 *   app_id: 1,   // your application id
 *   key: 'browser credential'  // your hook-ext/credentials/{environment}/browser.json
 * });
 * ```
 *
 * @module Hook
 * @class Hook.Client
 *
 * @param {Object} options
 *   @param {String} options.app_id
 *   @param {String} options.key
 *   @param {String} options.endpoint default: window.location.origin
 *
 * @constructor
 */
Hook.Client = function(options) {
  if (!options) { options = {}; }

  this.endpoint = options.endpoint || options.url || window.location.origin;
  this.app_id = options.app_id || options.appId || "";
  this.key = options.key || "";

  this.options = (typeof(options.options) !== "undefined") ? options.options : {};

  // append last slash if doesn't have it
  if (this.endpoint.lastIndexOf('/') != this.endpoint.length - 1) {
    this.endpoint += "/";
  }

  /**
   * @property {Hook.KeyValues} keys
   */
  this.keys = new Hook.KeyValues(this);

  /**
   * @property {Hook.Auth} auth
   */
  this.auth = new Hook.Auth(this);

  /**
   * @property {Hook.System} system
   */
  this.system = new Hook.System(this);

  // Setup all registered plugins.
  Hook.Plugin.Manager.setup(this);
};

/**
 * Get collection instance.
 * @method collection
 * @param {String} collectionName
 * @return {Hook.Collection}
 *
 * @example Retrieve a collection reference. Your collection tables are created on demand.
 *
 *     // Users collection
 *     var users = client.collection('users');
 *
 *     // Highscores
 *     var highscores = client.collection('highscores');
 *
 */
Hook.Client.prototype.collection = function(collectionName) {
  return new Hook.Collection(this, collectionName);
};

/**
 * Get channel instance.
 * @method channel
 * @param {String} name
 * @param {Object} options (optional)
 * @return {Hook.Channel}
 *
 * @example Create a channel using Servet-Sent Events transport.
 *
 *     var channel = client.channel('messages');
 *
 * @example Create a channel using WebSockets transport.
 *
 *     var channel = client.channel('messages', { transport: "websockets" });
 *
 */
Hook.Client.prototype.channel = function(name, options) {
  if (typeof(options)==="undefined") { options = {}; }

  var collection = this.collection(name);
  collection.segments = collection.segments.replace('collection/', 'channel/');

  // Use 'SSE' as default transport layer
  if (!options.transport) { options.transport = 'sse'; }
  options.transport = options.transport.toUpperCase();

  return new Hook.Channel[options.transport](this, collection, options);
};

/**
 * Get remote URL string.
 * @method url
 * @param {String} route
 * @return {String}
 *
 * @example Downloading data from a hook route
 *
 *     location.href = client.url('download', { something: "hey" })
 *
 * @example Using custom hook route for image catpcha
 *
 *     // Implementing custom route for captcha: https://github.com/doubleleft/hook/wiki/Composer-dependencies
 *     var img = new Image();
 *     img.src = client.url('captcha');
 *
 */
Hook.Client.prototype.url = function(route, params) {
  var serializedParams = "";
  if (params) { serializedParams = "&" + this.serialize(params); }
  return this.endpoint + route + this._getCredentialsParams() + serializedParams;
};

/**
 * Create resource
 * @method post
 * @param {String} segments
 * @param {Object} data
 */
Hook.Client.prototype.post = function(segments, data) {
  if (typeof(data)==="undefined") {
    data = {};
  }
  return this.request(segments, "POST", data);
};

/**
 * Retrieve a resource
 * @method get
 * @param {String} segments
 * @param {Object} data
 */
Hook.Client.prototype.get = function(segments, data) {
  return this.request(segments, "GET", data);
};

/**
 * Update existing resource
 * @method put
 * @param {String} segments
 * @param {Object} data
 */
Hook.Client.prototype.put = function(segments, data) {
  return this.request(segments, "PUT", data);
};

/**
 * Delete existing resource.
 * @method delete
 * @param {String} segments
 */
Hook.Client.prototype.remove = function(segments, data) {
  return this.request(segments, "DELETE", data);
};

/**
 * @method request
 * @param {String} segments
 * @param {String} method
 * @param {Object} data
 */
Hook.Client.prototype.request = function(segments, method, data) {
  var payload
    , request_headers
    , synchronous = false;

  // FIXME: find a better way to write this
  if (data && data._sync) {
    delete data._sync;
    synchronous = true;
  }

  // Compute payload
  payload = this.getPayload(method, data);

  // Compute request headers
  request_headers = this.getHeaders();
  if (!(payload instanceof FormData)){
    request_headers["Content-Type"] = 'application/json'; // exchange data via JSON to keep basic data types
  }

  // Use method override? (some web servers doesn't respond to DELETE/PUT requests)
  if (method !== "GET" && method !== "POST" && this.options.method_override) {
    request_headers['X-HTTP-Method-Override'] = method;
    method = "POST";
  }

  if (typeof(XDomainRequest) !== "undefined") {
    // XMLHttpRequest#setRequestHeader isn't implemented on Internet Explorer's XDomainRequest
    segments += this._getCredentialsParams() + "&r=" + Math.floor(Math.random()*1000);
  }

  var promise = new Promise(function(resolve, reject) {
    var xhr = uxhr(this.endpoint + segments, payload, {
      method: method,
      headers: request_headers,
      sync: synchronous,
      success: function(response) {
        var total,
            data = null,
            // IE<10 doesn't have 'getAllResponseHeaders' method.
            responseHeaders = (xhr.getAllResponseHeaders && xhr.getAllResponseHeaders()) || "";

        try {
          data = JSON.parseWithDate(response);
        } catch(e) { }

        if (data === false || data === null || data.error) {
          // log error on console
          if (data && data.error) { console.error(data.error); }
          reject(data);
        } else {

          // get X-Total-Count for pagination
          total = responseHeaders.match(/x-total-count: ([^\n]+)/i);
          if (total) { data.total = parseInt(total[1]); }

          resolve(data);
        }
      },
      error: function(response) {
        var data = null;
        try {
          data = JSON.parseWithDate(response);
        } catch(e) { }
        console.log("Error: ", data || "Invalid JSON response.");
        reject(data);
      }
    });

  }.bind(this));

  return promise;
};

/**
 * Get XHR headers for app/auth context.
 * @method getHeaders
 * @return {Object}
 */
Hook.Client.prototype.getHeaders = function() {
  // App authentication request headers
  var request_headers = {
    'X-App-Id': this.app_id,
    'X-App-Key': this.key
  }, auth_token;

  // Forward user authentication token, if it is set
  var auth_token = this.auth.getToken();
  if (auth_token) {
    request_headers['X-Auth-Token'] = auth_token;
  }
  return request_headers;
}

/**
 * Get payload of given data
 * @method getPayload
 * @param {String} requestMethod
 * @param {Object} data
 * @return {String|FormData}
 */
Hook.Client.prototype.getPayload = function(method, data) {
  var payload = null;
  if (data) {

    if (data instanceof FormData){
      payload = data;
    } else if (method !== "GET") {
      var formdata = new FormData(),
          worth = false;

      var getFieldName = function(nested) {
          var name = nested.shift();
          return (nested.length > 0) ? name + '[' + getFieldName(nested) + ']' : name;
      };

      var appendFormdataRecursively = function(formdata, data, previous) {
        var field, value, filename, isFile = false;

        for (field in data) {
          value = data[field];
          filename = null;

          if (typeof(value)==='undefined' || value === null) {
            continue;

          } else if (typeof(value)==='boolean' || typeof(value)==='number' || typeof(value)==="string") {
            value = value.toString();

          // IE8 can't compare instanceof String with HTMLInputElement.
          } else if (value instanceof HTMLInputElement && value.files && value.files.length > 0) {
            filename = value.files[0].name;
            value = value.files[0];
            worth = true;
            isFile = true;

          } else if (value instanceof HTMLInputElement) {
            value = value.value;

          } else if (value instanceof HTMLCanvasElement) {
            value = dataURLtoBlob(value.toDataURL());
            worth = true;
            filename = 'canvas.png';

          } else if (typeof(Blob) !== "undefined" && value instanceof Blob) {
            worth = true;
            filename = 'blob.' + value.type.match(/\/(.*)/)[1]; // get extension from blob mime/type

          } else if (typeof(value)==="object") {
            appendFormdataRecursively(formdata, value, previous.concat(field));
            continue;
          }

          //
          // Consider serialization to keep data types here: http://phpjs.org/functions/serialize/
          //
          if (!(value instanceof Array)) { // fixme
            var fieldname = (isFile) ? field : getFieldName(previous.concat(field));

            if (typeof(value)==="string") {
              formdata.append(fieldname, value);
            } else {
              try {
                formdata.append(fieldname, value, filename || "file");
              } catch (e) {
                // TODO:
                // Node.js (CLI console) throws exception here
              }
            }
          }
        }
      };

      appendFormdataRecursively(formdata, data, []);

      if (worth) {
        payload = formdata;
      }
    }

    payload = payload || JSON.stringify(data, function(key, value) {
      if (this[key] instanceof Date) {
        return Math.round(this[key].getTime() / 1000);
      } else {
        return value;
      }
    });

    // empty payload, return null.
    if (payload == "{}") { return null; }

    if (method==="GET" && typeof(payload)==="string") {
      payload = encodeURIComponent(payload);
    }
  }
  return payload;
}

Hook.Client.prototype._getCredentialsParams = function() {
  var params = "?X-App-Id=" + this.app_id + "&X-App-Key=" + this.key;
  var auth_token = this.auth.getToken();
  if (auth_token) { params += '&X-Auth-Token=' + auth_token; }
  return params;
}

Hook.Client.prototype.serialize = function(obj, prefix) {
  var str = [];
  for (var p in obj) {
    if (obj.hasOwnProperty(p)) {
      var k = prefix ? prefix + "[" + p + "]" : p,
      v = obj[p];
      str.push(typeof v == "object" ? this.serialize(v, k) : encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
  }
  return str.join("&");
};
