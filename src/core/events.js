/**
 * @class Hook.Events
 */
Hook.Events = function() {
  this._events = {};
};

Hook.Events.prototype.on = function(event, callback, context) {
  if (!this._events[event]) { this._events[event] = []; }
  this._events[event].push({callback: callback, context: context || this});
};

Hook.Events.prototype.trigger = function(event, data) {
  var c, args = Array.prototype.slice.call(arguments,1);
  if (this._events[event]) {
    for (var i=0,length=this._events[event].length;i<length;i++)  {
      c = this._events[event][i];
      c.callback.apply(c.context || this.client, args);
    }
  }
};
