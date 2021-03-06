/**
 * @module Hook
 * @class Hook.Channel.WEBSOCKETS
 *
 * @param {Client} client
 * @param {String} namespace
 * @param {Object} options optional
 * @constructor
 *
 * @example Connecting through websockets.
 *
 *     var channel = client.channel('messages', { transport: "websockets" });
 *
 * @example Force socket server endpoint.
 *
 *     var channel = client.channel('messages', {
 *       transport: "websockets",
 *       url: "ws://localhost:8080"
 *     });
 */
Hook.Channel.WEBSOCKETS = function(client, collection, options) {
  var that = this;

  this.client = client;
  this.collection = collection;
  this.client_id = null;

  if (!options.url) {
    var scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://',
        url = client.url.replace(/(?:https?:)?\/\//, scheme)

    if (url.match(/index\.php/)) {
      url = url.replace("index.php", "ws/");
    } else {
      url += "ws/";
    }

    options.url = url;
  }

  options.url += this.collection.name + "?X-App-Id=" + this.client.app_id + "&X-App-Key=" + this.client.key;
  var auth_token = this.client.auth.getToken();
  if (auth_token) {
    options.url += '&X-Auth-Token=' + auth_token;
  }

  // WAMP message debugging
  ab.debug(options.debug === true, options.verbose === true, options.debug === true);

  // subscribe to queued events when successfully connected.
  this.queued_subscriptions = {};
  this.on('connected', function() {
    for (var event in that.queued_subscriptions) {
      if (that.queued_subscriptions.hasOwnProperty(event)) {
        that.subscribe(event, that.queued_subscriptions[event]);
      }
    }
    that.queued_subscriptions = null;
  });

  ab.connect(options.url, function(session) {
    that.ws = session;
    that.client_id = session.sessionid();
    that.trigger('connected');
  }, function(err) {
    console.error("Can't connect with WebSocket server: " + options.url, err);
  }, {
    retryDelay: 1000,
    maxRetries: 10
  });
};

// Inherits from Events

Hook.Channel.WEBSOCKETS.prototype = new Hook.Events();
Hook.Channel.WEBSOCKETS.prototype.constructor = Hook.Channel.WEBSOCKETS;

/**
 * Subscribe to channel. Publishes a 'connected' message on the first time.
 * @method subscribe
 * @param {String} event (optional)
 * @param {Function} callback
 * @return {Hook.Channel}
 *
 * @example Registering for a single custom event
 *
 *     channel.subscribe('some-event', function(data) {
 *       console.log("Custom event triggered: ", data);
 *     })
 *
 * @example Registering for client connected/disconnected events
 *
 *     channel.subscribe('connected', function(data) {
 *       console.log("New client connected: ", data.client_id);
 *     });
 *     channel.subscribe('disconnected', function(data) {
 *       console.log("Client disconnected: ", data.client_id);
 *     });
 *
 */
Hook.Channel.WEBSOCKETS.prototype.subscribe = function(event, callback) {
  if (!this.ws) {
    // not connected yet, let's postpone this subscription.
    this.queued_subscriptions[event] = callback;

  } else {
    this.ws.subscribe(this.collection.name + '.' + event, function(topic, data) {
      callback(data);
    });
  }
  return this;
};

/**
 * Is EventSource listenning to messages?
 * @method isConnected
 * @return {Boolean}
 */
Hook.Channel.WEBSOCKETS.prototype.isConnected = function() {
  return this.ws && this.ws._websocket_connected;
};

/**
 * Unsubscribe to a event listener
 * @method unsubscribe
 * @param {String} event
 * @return {Hook.Channel}
 */
Hook.Channel.WEBSOCKETS.prototype.unsubscribe = function(event) {
  if (this.ws && this.ws._subscriptions[this.collection.name + '.' + event]) {
    this.ws.unsubscribe(this.collection.name + '.' + event);
  }
  return this;
};

/**
 * Publish event message
 * @method publish
 * @param {String} event
 * @param {Object} message
 * @param {Object} options 'exclude' and 'elegible' are optional options.
 * @return {Hook.Channel}
 */
Hook.Channel.WEBSOCKETS.prototype.publish = function(event, message, options) {
  var exclude = [], eligible = [];

  if (typeof(options)==="undefined") {
    options = {};
  }

  if (options.exclude && options.exclude instanceof Array) {
    exclude = options.exclude;
  }

  if (options.eligible && options.eligible instanceof Array) {
    eligible = options.eligible;
  }

  this.ws.publish(this.collection.name + '.' + event, message, exclude, eligible);
  return this;
};

/**
 * Disconnect from channel, publishing a 'disconnected' message.
 * @method disconnect
 * @return {Hook.Channel} this
 */
Hook.Channel.WEBSOCKETS.prototype.disconnect = function() {
  this.ws.close();
  return this;
};

/**
 * @method call
 * @param {String} procedure
 * @return {Promise}
 */
Hook.Channel.WEBSOCKETS.prototype.call = function(procedure, callbacks) {
  this.ws.call(procedure, callbacks);
  return this;
};
Hook.Channel.WEBSOCKETS.prototype.connect = function() {
  this.ws.connect();
  return this;
};
