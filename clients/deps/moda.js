/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at:
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Raindrop Code.
 *
 * The Initial Developer of the Original Code is
 *   The Mozilla Foundation
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/*jslint indent: 2, strict: false, plusplus: false */
/*global define: false, console: false */

// from https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind
// bootstrap the JS env in some browsers that do not have full ES5
if (!Function.prototype.bind) {

  Function.prototype.bind = function (obj) {
    var slice = [].slice,
        args = slice.call(arguments, 1),
        self = this,
        Nop = function () {},
        bound = function () {
          return self.apply(this instanceof Nop ? this : (obj || {}),
                            args.concat(slice.call(arguments)));
        };

    Nop.prototype = self.prototype;

    bound.prototype = new Nop();

    return bound;
  };
}


/**
 * The data store layer.
 */
define(function (require, exports) {
  var q = require('q'),
      transport = require('modaTransport'),
      listeners = {},
      listenerCounter = 0,
      moda = exports,
      convCache = {},
      peepCache = {},
      me;

  /**
   * Trigger listeners on an object an any global listeners.
   */
  function trigger(obj, name, args) {
    var prop, cb;
    if (obj.on[name]) {
      obj.on[name].apply(obj, args);
    }

    for (prop in listeners) {
      if (listeners.hasOwnProperty(prop)) {
        cb = listeners[prop][name];
        if (cb) {
          cb.apply(listeners[prop], args);
        }
      }
    }
  }

  function peepSort(a, b) {
    if (a.name > b.name) {
      return 1;
    } else if (a.name < b.name) {
      return -1;
    } else {
      return 0;
    }
  }

/*

Peep
* id
* name
* pic
* onChange
* pinned
* pin()
* frecency
* conversations []
* onConvAdd  for conversation add
* onConvChange
* areConversationsLoaded
* loadConversations()
* onPeepChange
* destroy()
* remove()
* connect()
* reject()
* connected
* rejected
*/

  function Peep(obj) {
    this.id = obj.id;
    this.name = obj.name;
    this.pic = obj.pic;
    this.pinned = false;
    this.frecency = 0;

    //TODO: this should start as false
    this.connected = true;

    this.rejected = false;

    // Add the peep to the peepCache
    if (!peepCache[this.id]) {
      peepCache[this.id] = this;
    }
  }

  Peep.prototype = {
    /**
     * Gets the conversations for this user.
     * @param {Function} callback a callback to call when the conversations
     * are retrieved. The callback will receive an array of Conversation
     * objects.
     */
    getConversations: function (callback) {
      transport.getPeepConversations(this.id, callback);
    }
  };

  function Users(query, on) {
    this.items = [];
    this.isComplete = false;
    this.query = query;
    this.on = on;

    var d = q.defer();
    q.when(d.promise, function (users) {

      // Convert users into instance of peep objects
      users = users.map(function (user) {
        return new Peep(user);
      });

      this.items = users;
      trigger(this, 'usersComplete', [users]);
    }.bind(this));

    //Ignore the query for now, use
    //dummy data.
    transport.users(query, function (users) {
      d.resolve(users);
    });
  }


/*
Peeps
* query: {
  by: 'recency|alphabet|pinned'
  filter: ''
}
* onPeepsComplete: function(), event
* onAddPeep: function(item), event
* addPeep: function(item)
* onremovePeep: function(item), event
* remove: function(item)
* peeps: Array, the array of items.
* onChangePeep: function(item) when a peep changes.
* byId: function(id) ?
* destroy()
*/
  function Peeps(query, on) {
    this.items = [];
    this.isComplete = false;
    this.query = query;
    this.on = on;

    var d = q.defer();
    q.when(d.promise, function (peeps) {
      // Convert peeps into instance of peep objects
      peeps = peeps.map(function (peep) {
        return new Peep(peep);
      });

      this.items = peeps;
      trigger(this, 'peepsComplete', [peeps]);
    }.bind(this));

    //Ignore the query for now, use
    //dummy data.

    transport.peeps(query, function (peeps) {
      d.resolve(peeps);
    });
  }

  Peeps.prototype = {
    /**
     * Adds a peep to the peeps.
     * @param {String} peepId
     */
    addPeep: function (peepId, callback) {
      transport.addPeep(peepId, function (peep) {
        this.items.push(new Peep(peep));
        this.items.sort(peepSort);

        if (callback) {
          callback(peep);
        }
        trigger(this, 'addPeep', arguments);
      }.bind(this));
    },

    removePeep: function (peep) {

    },

    destroy: function () {

    }
  };

  function Message(msg) {
    this.convId = msg.convId;
    this.id = msg.id;
    this.from = peepCache[msg.from];
    this.text = msg.text;
    this.time = msg.time;
  }

/*
Conversation
* id
* seen {
  'peepId': 'messageId'
}
* received: {
  'peepId', 'messageId'
}
* onSeenUpdated
* onReceivedUpdated
* peeps: Array
* onPeepAdd()
* addPeep()
*
* messages: Array
* onMessage: function for when message is added.
* onMessagesLoaded: called when conversation is in a completed state.
* areMesssagesLoaded
* loadMessages()
* addMessage()
*
* pin()
* markSeen(msgId)
* destroy()
* remove()
*
*/

  function Conversation(id, on) {
    this.id = id;
    this.peeps = null;
    this.messages = null;
    this.on = {};
    this.messageDeferred = q.defer();

    convCache[id] = this;

    // Set up the retrieval of the messages and people.
    transport.loadConversation(id, function (details) {
      this.peeps = [];
      details.peepIds.forEach(function (peepId) {
        this.peeps.push(peepCache[peepId]);
      }.bind(this));

      this.messages = details.messages.map(function (message) {
        return new Message(message);
      });

      // Make sure messages are in time order.
      this.messages.sort(function (a, b) {
        if (a.time > b.time) {
          return 1;
        } else if (a.time < b.time) {
          return -1;
        } else {
          return 0;
        }
      });

      this.messageDeferred.resolve(this);

      trigger(this, 'conversationComplete', [this]);
    }.bind(this));
  }

  Conversation.prototype = {
    withMessages: function (callback) {
      q.when(this.messageDeferred.promise, callback);
    },

    sendMessage: function (message) {
      transport.sendMessage(message);
    },

    setSeen: function () {
      var message = this.messages.length ? this.messages[this.messages.length - 1] : null;
      if (message) {
        transport.messageSeen(this.id, message.id);
      }
    }
  };


  /**
   * Define moda.
   */

/*
moda.on({
  message: ''
  peepChange
  peepsComplete
  peepConnectRequest
  networkConnected
  networkDisconnect
  networkReconnect
  networkReconnecting
  badProgrammer
  peepConnectError

});
*/
  /**
   * Listen to events.
   *
   * @param {Object|String} listener if an object, the properties of the
   * object should be string names of events, and the values should be
   * the functions to call on that event. If a string, an event name
   * that should trigger the cb function
   *
   * @param {Function} [cb] If listener is a string, this is the function
   * callback to call for that event listener name.
   *
   * @returns {String} a listener ID. Use it to call removeOn to remove
   * this listener.
   */
  moda.on = function (listener, cb) {
    var obj, listenerId;
    if (typeof listener === 'string') {
      obj = {};
      obj[listener] = cb;
    } else {
      obj = listener;
    }
    listenerId = 'listen' + (listenerCounter++);
    listeners[listenerId] = obj;
    return listenerId;
  };

  /**
   * Removes an event listener for the given listenerId
   *
   * @param {String} listenerId, the ID of the listener to remove.
   */
  moda.removeOn = function (listenerId) {
    delete listeners[listenerId];
  };

  /**
   * Triggers an on event.
   */
  moda.trigger = function (name, data) {
    var triggered = false,
        prop, conv, peep;

    // Some messages require updates to cached objects
    if (name === 'message') {
      conv = convCache[data.convId];

      // The from field should be a reference to the peepCache.
      peep = peepCache[data.from];
      if (!peep) {
        // Need to fetch the peep and bail out.
        transport.peep(data.from, function (peepData) {
          var peep = new Peep(peepData);

          //Re-trigger the event.
          moda.trigger(name, data);
        });

        // Bail on this trigger, wait for peep response to re-trigger.
        return;
      }

      data.from = peep;
      if (conv && conv.messages) {
        conv.messages.push(data);
      }
    } else if (name === 'me') {
      me = new Peep(data);
    }

    // Cycle through listeners and notify them.
    for (prop in listeners) {
      if (listeners.hasOwnProperty(prop) && listeners[prop][name]) {
        listeners[prop][name](data);
        triggered = true;
      }
    }

    if (!triggered) {
      console.log('moda event [' + name + ']: ' + JSON.stringify(data));
    }
  };

  /**
   * Grabs a list of Peeps based on a query value.
   *
   * @param {Object} query the query to used for data selection.
   * @param {Object} on an object whose properties are event names
   * and values are event handlers for events that can be triggered
   * for the return object.
   *
   * @returns {Peeps}
   */
  moda.peeps = function (query, on) {
    return new Peeps(query, on);
  };

  moda.users = function (query, on) {
    return new Users(query, on);
  };

  moda.conversation = function (query) {
    // only support by ID filtering
    var conv;

    if (query.by === 'id') {
      conv = convCache[query.filter];
      if (!conv) {
        conv = new Conversation(query.filter);
      }
    }

    return conv;
  };

  moda.startConversation = function (args) {
    transport.startConversation(args);
  };

  moda.signIn = function (assertion, callback) {
    return transport.signIn(assertion, callback);
  };

  moda.signOut = function (callback) {
    return transport.signOut(callback);
  };

  moda.listUnseen = function () {
    return transport.listUnseen(function (unseen) {
      // TODO: may want to optimize this display at some point
      // but passing it through the trigger machinery since it
      // has logic to make sure the peep object is loaded for
      // the message senders.
      var prop, message;

      for (prop in unseen) {
        if (unseen.hasOwnProperty(prop)) {
          message = unseen[prop];
          moda.trigger('message', message);
        }
      }
    });
  };

  /**
   * Returns the user object for the signed in user. If not an object,
   * then it means the user is not signed in, and signIn should be called.
   */
  moda.me = function () {
    if (!me) {
      me = transport.me();
    }
    return me;
  };

/*
  //Fake data to use for UI mockups.
  peepData = {
    'me@raindrop.it': new Peep({
      name: 'Me',
      id: 'me@raindrop.it',
      pic: 'i/fake/me.png'
    }),
    'james@raindrop.it': new Peep({
      name: 'James',
      id: 'james@raindrop.it',
      pic: 'i/fake/james.jpg'
    }),
    'bryan@raindrop.it': new Peep({
      name: 'Bryan',
      id: 'bryan@raindrop.it',
      pic: 'i/fake/bryan.jpg'
    }),
    'andrew@raindrop.it': new Peep({
      name: 'Andrew',
      id: 'andrew@raindrop.it',
      pic: 'i/fake/andrew.jpg'
    })
  };

  // Fake peeps data.
  peeps = [];
  for (prop in peepData) {
    if (peepData.hasOwnProperty(prop) && prop !== 'me@raindrop.it') {
      peeps.push(peepData[prop]);
    }
  }

  //Fake conversations
  conv1 = new Conversation('conv1', [
    peepData['james@raindrop.it'], peepData['bryan@raindrop.it']
  ]);
  conv1.addMessage(new Message('me@raindrop.it', 'what\'s for lunch?'));
  conv1.addMessage(new Message('james@raindrop.it', 'fatburger'));
  conv1.addMessage(new Message('bryan@raindrop.it', 'what about acme?'));
  conv1.addMessage(new Message('me@raindrop.it', 'i like acme'));
  conv1.addMessage(new Message('james@raindrop.it', 'sounds good, let\'s do it!'));

  conv2 = new Conversation('conv2', [
    peepData['james@raindrop.it']
  ]);
  conv2.addMessage(new Message('james@raindrop.it', 'yt?'));
  conv2.addMessage(new Message('me@raindrop.it', 'yup'));
  conv2.addMessage(new Message('james@raindrop.it', 'What is that new game coming out?'));
  conv2.addMessage(new Message('me@raindrop.it', 'Mass Effect 3! I can\'t wait for it!'));
  conv2.addMessage(new Message('james@raindrop.it', 'Where are you going to get it?'));
  conv2.addMessage(new Message('me@raindrop.it', 'I will just order it online.'));
  conv2.addMessage(new Message('james@raindrop.it', 'OK. I\'ll wait for the reviews.'));

  convData = {
    conv1: conv1,
    conv2: conv2
  };

  conversations = {
    'james@raindrop.it': [
      conv1,
      conv2
    ],

    'bryan@raindrop.it' : [
      conv1
    ]
  };
  */

});

/*


Requests
* onComplete
* peeps

*/


/*
Requests (email addr)
- by timer

Peeps
- by recency
- by alphabet/frecency (popularity)
- pinned

Peep Conversations
- time ordered
- pinned (per peep vs all peeps)

Conversations
- time-ordered

Messages
- body
- location

A conversation can have
- write: watermark/seen
- read: watermarks (seen) (received)

---------------

signup(email)

pin a conversation
pin a peep
update watermark for conversation
start new conversation:
  - peeps
  - message text
  - location
reply to conversation:
  - message text,
  - location
add someone(s) to conversation
  - peeps
delete a conversation
connect to a peep:
  - email
  - optional message
reject a peep
  - email
  - report(as)

-------------------

Peeps
+Compose
Pinned Peeps
Pinned Conversations

David
James

David
Hello....yesterday
hi.....today
[     ] send

conversation view
james invited roland
Show location in bubble
*/