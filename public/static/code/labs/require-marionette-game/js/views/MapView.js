define(['backbone.marionette', 'backbone', 'TweenLite', 'nprogress', 'soundManager', 'models/CellsCollection', 'views/CellView'],
  function (Marionette, Backbone, TweenLite, NProgress, soundManager, CellsCollection, CellView) {
    return Marionette.CollectionView.extend({

      tagName: 'ul',
      className: 'map',
      childView: CellView,
      collection: new CellsCollection(),

      childEvents: {
        'cell:intent': 'onChildIntent'
      },

      MAX_MOVEMENTS: 20,
      CONCURRENT_CELLS: 2,

      MAX_TIME_BETWEEN_SELECTION: 1500,
      RESTART_TIME: 4000,

      model: new Backbone.Model({
        currentCells: [],
        history: [],
        cellsResolved: [],
        movements: this.MAX_MOVEMENTS
      }),

      initialize: function () {
        this.tween = null;
        NProgress.configure({ showSpinner: false, trickle: false, minimum: 0.01 });
        soundManager.createSound({ multiShotEvents: true, id: 'cell-intent', url: './audio/Pickup-coin 19.wav'});
        soundManager.createSound({ multiShotEvents: true, id: 'cell-unmarked', url: './audio/65057_nicebeep.mp3' });
        soundManager.createSound({ multiShotEvents: true, id: 'cell-resolved', url: './audio/Pickup-coin 14.wav' });
      },

      onShow: function () {
        this._restart();
      },

      onChildIntent: function (childView) {

        // don't allow click more than CONCURRENT_CELLS
        if (this.model.get('currentCells').length >= this.CONCURRENT_CELLS) {
          return;
        }

        // remove one movement on every intent
        var movements = this.model.get('movements') - 1;
        this.model.set('movements', movements);

        // mark the clicked cell
        childView.model.set('marked', true);

        // save all the user interactions
        // later we can replay the game
        this.model.get('history').push(childView);

        // save the current selected cell
        this.model.get('currentCells').push(childView);

        // every time the user clicks on a cell
        // renew the turn timer
        NProgress.remove();

        if (this.model.get('currentCells').length === this.CONCURRENT_CELLS) {

          var cells = this.model.get('currentCells');

          // get the first cell code to compare with the other codes
          var code1 = cells[0].model.get('code');

          // get the cells models
          var models = new Backbone.Collection(_.pluck(cells, 'model'));

          // get all the models that has equal codes
          var withTheSameCode = models.where({code: code1});

          // all the codes must match!
          if (withTheSameCode.length === this.CONCURRENT_CELLS) {

            this.trigger('game:cells:match');
            this.tween && this.tween.kill();

            // mark cell as resolved
            this._resolveCells();

            // give more movements to the player if the cells match
            this.model.set('movements', this.model.get('movements') + (this.CONCURRENT_CELLS * 2));

          } else {
            this.$el.addClass('disabled');
            this.tween && this.tween.kill();
            NProgress.remove();
            TweenLite.delayedCall(this.MAX_TIME_BETWEEN_SELECTION / 1000, this._cleanCells.bind(this));
          }

        } else {

          NProgress.remove();
          NProgress.start();

          this.t = 0;
          this.tween = TweenLite.to(this, this.RESTART_TIME / 1000, {t: 1, ease: 'Linear.easeNone', onUpdateParams: [this], onUpdate: function (map) {
            NProgress.set(map.t);
          }, onComplete: this._cleanCells.bind(this)});
        }

        this._updateScore();

        if ((this.model.get('cellsResolved').length === this.collection.length) || (this.model.get('movements') === 0)) {
          // all the cells are resolved
          this.trigger('game:over');
          NProgress.remove();
          TweenLite.delayedCall(this.MAX_TIME_BETWEEN_SELECTION / 1000, this._restart.bind(this));
        }
      },

      _resolveCells: function () {

        soundManager.play('cell-resolved');

        _.each(this.model.get('currentCells'), function (el) {
          el.model.set('resolved', true);
          // save resolved cells
          this.model.get('cellsResolved').push(el);
        }, this);

        this._startNewTurn();
      },

      _cleanCells: function () {

        // deselect the current cells
        _.each(this.model.get('currentCells'), function (el, idx) {
          setTimeout(_.bind(el.model.set, el.model, 'marked', false), 250 * idx);
        }, this);

        this._startNewTurn();
      },

      _cleanResolved: function () {

        // restart to the original style
        // of all resolved cells
        _.each(this.model.get('cellsResolved'), function (el) {
          el.model.set('resolved', false);
          el.model.set('marked', false);
        }, this);

        this._startNewTurn();
      },

      _startNewTurn: function () {

        // restart if player has reached max movements
        if (this.model.get('movements') === 0) {
          this._restart();
          return;
        }

        // set the map interactive
        this.$el.removeClass('disabled');

        this.model.set('currentCells', []);
        this.trigger('game:new:turn');
      },

      _updateScore: function () {

        var total = this.collection.length / this.CONCURRENT_CELLS;
        var resolved = this.model.get('cellsResolved').length / this.CONCURRENT_CELLS;

        this.trigger('game:score:changed', total, resolved, this.model.get('movements'));
      },

      restart: function () {
        this._restart();
      },

      _restart: function () {

        // restart the game
        this.trigger('game:restart');

        // shuffle collection
        this.collection.sort();

        this.model.set('movements', this.MAX_MOVEMENTS);
        this.model.set('history', []);

        this._cleanCells();
        this.model.set('currentCells', []);

        this._cleanResolved();
        this.model.set('cellsResolved', []);

        this._updateScore();

        this.trigger('game:restarted');
      }

    });
  });