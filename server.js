var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
  ip = process.env.IP || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';
//  OpenShift sample Node application
var express = require('express');
var fs = require('fs');
var app = express();
var morgan = require('morgan');
Object.assign = require('object-assign');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var ExpressPeerServer = require('peer').ExpressPeerServer;
var server = require('http').Server(app);
var io = require('socket.io')(server);
var MongoDB = require('./server/mongodb.js');
var db = MongoDB.db;
var User = require('./server/user.js');
//app.use(morgan('combined'))
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(cookieParser())
var sess = {
  secret: process.env.COOKIE_SECRET || "cookie secret",
  saveUninitialized: false,
  resave: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}
app.use(session(sess));
app.use(passport.initialize());
app.use(passport.session());
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get('*', function (req, res, next) {
  if (!db) {
    MongoDB.initDb(function (err) {});
  }
  next();
});
var routes = [
  '/lobbies',
  '/lobby',
  '/game',
  '/outcome',
];
var publicRoutes = [
  '',
  '/login',
  '/register'
];
app.get(routes, function (req, res) {
  if(req.user){
    res.sendFile(__dirname + '/files/index.html');
  }else{
    res.redirect('/login');
  }
});
app.get(publicRoutes, function (req, res) {
  res.sendFile(__dirname + '/files/index.html');
});

app.get('/files/*', function (req, res) {
  res.sendFile(__dirname + req.url);
});
app.get('/images/*', function (req, res) {
  res.sendFile(__dirname + "/files" + req.url);
});

app.post('/login', function (req, res, next) {
  passport.authenticate('local', function (err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.json({
        error: info
      });
    }
    req.logIn(user, function (err) {
      if (err) {
        return res.json({
          error: 'Could not log in user'
        });
      }
      res.status(200).json({
        success: true,
        username: user.username
      });
    });
  })(req, res, next);
});
app.post('/logout', function(req, res){
  req.logOut();
  res.redirect('/login')
});
app.post('/user', function(req, res){
  res.json({username:req.user?req.user.username:null});
});
app.post('/register', function (req, res) {
  User.register(new User({
    username: req.body.username
  }), req.body.password, function (err, user) {
    if (err) {
      return res.send(err)
    }

    passport.authenticate('local')(req, res, function () {
      req.session.save(function (err) {
        if (err) {
          res.send(err);
        }
        res.redirect('/');
      });
    });
  });
});

var options = {
  debug: true
}
var peerServer = ExpressPeerServer(server, options);
app.use('/peerjs', peerServer);

peerServer.on('connection', function (id) {
  console.log(`${id} connected`);
});

var connected = [];
io.on('connection', function (socket) {
  console.log(JSON.stringify(connected))
  socket.emit('lobbies', connected);
  var id;
  socket.on('peer id', function (data) {
    id = data;
    connected.push(id);
    socket.broadcast.emit('lobby created', id);
    console.log("public:" + JSON.stringify(id));
  });
  socket.on('disconnect', function () {
    if (id) {
      connected.splice(connected.indexOf(id), 1);
      socket.broadcast.broadcast.emit('lobby closed', id);
    }
  });
});

// error handling
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});


server.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app;