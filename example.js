var gos = require('./');

var module = {
  name: 'mymod',

  init: function (game) {
    console.log('Initialized mymod');

    game.set('happiness', 25);

    game.addTrigger('happiness', function (value, oldValue) {
      console.log('At first I was like ' + oldValue + ' but then I was like ' + value);
    });

    game.schedule(module.makeHappy, {delay: 5000, data: 123});
  },

  makeHappy: function (game, data) {
    game.set('happiness', data);
  }
};

var runtime = new gos.Runtime(new gos.Scheduler(), new gos.State());
runtime.registerModule(module);

for (var i = 0; i < 10; i++) {
  setTimeout(function () {
    console.log('ticking runtime... ' + runtime.toJSON());
    runtime.tick();
  }, i * 1500);
}
