// This will refer to the currently executing module for the scheduler and state.
var _modules = [];

function getModule() {
  return _modules[_modules.length - 1];
}

// Returns an object with methods to interact with the environment without leaking anything.
function createInterface(scheduler, state) {
  var triggers = {};

  var iface = {
    addTrigger: function (key, fn) {
      if (!triggers.hasOwnProperty(key)) {
        triggers[key] = [];
      }
      triggers[key].push(fn);
    },

    get: function (key) {
      return state.get(key);
    },

    schedule: function (fn, opts) {
      scheduler.schedule(fn, opts);
    },

    set: function (key, value) {
      if (!_modules.length) {
        throw new Error('Attempted to change state outside of runtime');
      }
      var module = getModule();

      var oldValue = state.get(key);
      state.set(key, value);
      if (triggers.hasOwnProperty(key)) {
        triggers[key].forEach(function (callback) {
          _modules.push(module);
          callback(value, oldValue);
          _modules.pop();
        });
      }
    }
  };

  return iface;
}

function Runtime(scheduler, state) {
  this._interface = createInterface(scheduler, state);
  this._modules = {};
  this._scheduler = scheduler;
  this._state = state;
}

Runtime.fromJSON = function (json) {
  var data = JSON.parse(json);
  var scheduler = new Scheduler(data.schedule);
  var state = new State(data.state);
  return new Runtime(scheduler, state);
};

Runtime.prototype.registerModule = function (module) {
  if (typeof module.name != 'string') {
    throw new Error('A module must expose a name property');
  }

  if (this._modules.hasOwnProperty(module.name)) {
    throw new Error('Attempted to register a module that was already registered');
  }

  this._modules[module.name] = module;

  if (typeof module.init == 'function') {
    _modules.push(module);
    module.init(this._interface);
    _modules.pop();
  } else {
    console.warn('Module "' + module.name + '" has no init function');
  }
};

Runtime.prototype.tick = function () {
  var exec = this._scheduler.getNext();
  if (!exec) return false;

  var parts = exec.id.split('.');
  if (!this._modules.hasOwnProperty(parts[0])) {
    console.warn('Could not find module ' + parts[0]);
    return this.tick();
  }

  var module = this._modules[parts[0]];
  if (!module.hasOwnProperty(parts[1])) {
    console.warn('Could not find function ' + exec.id);
    return this.tick();
  }

  _modules.push(module);
  module[parts[1]](this._interface);
  _modules.pop();

  return true;
};

Runtime.prototype.toJSON = function () {
  var data = {
    scheduler: this._scheduler.getObject(),
    state: this._state.getObject()
  };
  return JSON.stringify(data);
};


function Scheduler(opt_schedule) {
  this._schedule = opt_schedule || [];
}

Scheduler.prototype.getNext = function () {
  var now = +new Date();
  for (var i = 0; i < this._schedule.length; i++) {
    var item = this._schedule[i];
    if (item.garbage || item.when > now) continue;

    // Mark the item as unusable again.
    item.garbage = true;

    if (item.until < now) {
      // Item passed its expiration date.
      continue;
    }

    return item;
  }

  return null;
};

Scheduler.prototype.getObject = function () {
  return this._schedule.filter(function (item) {
    return !item.garbage;
  });
};

Scheduler.prototype.schedule = function (fn, opts) {
  if (!_modules.length) {
    throw new Error('Cannot schedule calls from outside a module');
  }

  var fnName, module = getModule();
  for (var member in module) {
    if (module.hasOwnProperty(member) && module[member] == fn) {
      fnName = member;
      break;
    }
  }

  if (!fnName) {
    throw new Error('The specified function is not available in the current module');
  }

  if (!opts.delay) opts.delay = 0;
  if (!opts.priority) opts.priority = 0;

  var now = +new Date(), when = now + opts.delay, until;
  if (opts.expireAfter) {
    until = when + opts.expireAfter;
  }

  // Create a schedule item for the function.
  var newItem = {
    id: module.name + '.' + fnName,
    priority: opts.priority,
    when: when,
    until: until
  };

  // Calculate the index to insert the item at, based on priority and time.
  var index = 0;
  while (index < this._schedule.length) {
    var item = this._schedule[index];
    if (item.priority == newItem.priority) {
      if (item.when > newItem.when) break;
    } else if (item.priority < newItem.priority) {
      break;
    }
    index++;
  }

  this._schedule.splice(index, 0, newItem);
};


function State(opt_data) {
  this._data = opt_data || {};
}

State.prototype.get = function (key) {
  return this._data[key];
};

State.prototype.getObject = function () {
  return this._data;
};

State.prototype.set = function (key, value) {
  this._data[key] = value;
};

module.exports = {
  Runtime: Runtime,
  Scheduler: Scheduler,
  State: State
};
