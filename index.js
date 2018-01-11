
'use strict';

// socket.io and express setup
var express = require('express');									// obtains express
var app     = express();											// applies express to the app
var server  = require('http').Server(app);							// create a 'server' using the app data
app.enable('trust proxy');

var io      = require('socket.io')(server);							// obtains socket.io and attaches the server
//var clients = [];													// list of clients currently connected
var chatroom_id = 1;												// arbitrary chatroom value (would be changed depending on which chatroom is being hosted)

require('https').globalAgent.options.rejectUnauthorized = false;	// attempt at security

// mongoDB setup
var port = process.env.PORT || process.env.VCAP_APP_PORT || 3000;	// obtain running port
var mongoClient = require("mongodb").MongoClient;					// obtain client library
var cfenv = require('cfenv');										// obtain cfenv
var appenv = cfenv.getAppEnv();										// parse enviroment and store
var services = appenv.services;										// obtain services from the parsed enviroment
var mongodbServices = services["compose-for-mongodb"];				// obtain the speciffic service for mongoDB
var credentials = mongodbServices[0].credentials;					// obtain credentials from first mongoDB service
var caCertificate = 
	[new Buffer(credentials.ca_certificate_base64, 'base64')];		// obtain ca certificate for use when connecting
var mongodb;														// used as a global variable to hold link to mongoDB client

// security setup
function requireHTTPS(req, res, next) {
if (req.headers && req.headers.$wssp === "80") {
	return res.redirect('https://' + req.get('host') + req.url);
	}
	next();
}
app.use(requireHTTPS);

var helmet = require('helmet');
app.use(helmet());
/*
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'", default.com],
    styleSrc: ["'self'", 'maxcdn.bootstrapcdn.com'],
  }
}))
*/

// --= mongoDB functionality =--

// connect to the mongoDB server
mongoClient.connect(credentials.uri, {
        mongos: {
            ssl: true,
            sslValidate: true,
            sslCA: caCertificate,
            poolSize: 1,
            reconnectTries: 1
        }
    },
    function(err, db) {
        if (err)
            console.log(err);
        else 
            mongodb = db.db("userData");
    }
);


// --= socket.io functionality =--

app.use(express.static("Public"));


io.on('connection', function(socket){

	// announce when a user enters the chat
  	socket.on('user connected', function(msg){
  		socket.user_name = msg;
	  		//clients.push(socket);
	  		addToChatroom(msg, chatroom_id);
  		io.emit('command message', (msg+' has connected'));
		console.log(msg+" has connected");
  	});

  	// attempt to add user to database
  	socket.on('new details', function(newName, newPassword){
  		
  		//confirm that username doesn't exists within databse
		var query = {name : newName};

  		mongodb.collection("users").find(query).toArray(function(err, result) {
  			if (err) throw err;
  			var exists = (result.length > 0 ? true : false);

  			if (!exists) 
  				addUser(newName, newPassword);

  			io.sockets.connected[socket.id].emit('new details', !exists);
		});
  	});

  	// set a user's current chatroom
  	socket.on('set chatroom', function(user_name, chatroomID){

  		// create JSON object
  		var query = {name : user_name};

  		// confirm that user exists within database
		var cursorArray = mongodb.collection("users").find(query).toArray(function(err, result) {
			if (err) throw err;
			var exists = (result.length > 0 ? true : false);

			// if user exists, find them in the chatroom and update their chatroom id
			if (exists) {
				var exists;
				mongodb.collection("chatroom").findOne(query, function (err, result){

					// update the chatroom of user
					if (result===null) console.log(user_name+" not found!");
					else {
						mongodb.collection("chatroom").update(
							{name : user_name},
							{ $set:
								{chatroom_id : chatroomID}
							}
						);
					}
				});
			}
		});
  	}

  	// conform a user exisits within the database, then add them to chatroom
  	socket.on('confirm details', function(user_name, user_password){

  		// create JSON object
  		var query = {name : user_name, password : user_password};

		// confirm that user exists within database
		var cursorArray = mongodb.collection("users").find(query).toArray(function(err, result) {
			if (err) throw err;
			var exists = (result.length > 0 ? true : false);

			query = {name : user_name, password : user_password, imageURI: { $exists: true, $ne: null }};
			mongodb.collection("users").find(query).toArray(function(err, result) {

				var imgExists = (result.length > 0 ? true : false);

				io.sockets.connected[socket.id].emit('confirm details', exists, user_name, (imgExists?result[0].imageURI:null));

				if (exists) {

					socket.user_name = user_name;
	  					//clients.push(socket);
	  					addToChatroom(user_name, chatroom_id);
	  				io.emit('command message', (user_name+' has connected'));
					console.log(user_name+" has connected");
				}
			});
		});
  	});

  	// assign a profile picture to a user
  	socket.on('set profilePic', function(user_name, imgURI){

  		// create JSON object
  		var query = {name : user_name};

  		// confirm that user exists within database
		var cursorArray = mongodb.collection("users").find(query).toArray(function(err, result) {
			if (err) throw err;
			var exists = (result.length > 0 ? true : false);

			if (exists) {
				mongodb.collection("users").update(
					{name : user_name},
					{ $set:
						{imageURI : imgURI}
					}
				);
			}
		});
  	});

	// send chat messages to everyone
	socket.on('chat message', function(msg){
		var splitIndex = msg.indexOf(" ");
		var message = [msg.slice(0,splitIndex), msg.slice(splitIndex+1)];

		// check to see if comment is a command
		switch (splitIndex < 0?encodeURI(msg):encodeURI(message[0]))
		{
			case "%5Clist":
			{
				// Command to list current users in chatroom

				console.log("\\list used by "+socket.user_name);
				var query = {chatroom_id : chatroom_id};

				var cursorArray = mongodb.collection("chatroom").find({}).toArray(function(err, result) {
					if (err) throw err;

					console.log(result);
					if(result.length > 0) {
						var currentUsers = ("* ("+result.length+") current users:");
						for (var x = 0; x < result.length; x++)
							currentUsers += (" " + result[x].name);
						currentUsers += " *";
						io.sockets.connected[socket.id].emit('command message', currentUsers);
					};
				});
				
				break;
			}
			case "%5Chelp":
			{
				// Command to list all commands that user can use

				var message = "\\list - lists all users in chatroom\n\\whisper X Y - Whisper to user X message Y";
				io.sockets.connected[socket.id].emit('command message', message);
				break;
			}
			case "%5Cwhisper":
			{
				// Command to send private message to other user

				splitIndex = message[1].indexOf(' ');
				var receiver = message[1].slice(0,splitIndex);
				var saveMessage = "You whisper to "+receiver;
				var sendMessage = socket.user_name + " whispers to you";
				var messageTxt = message[1].slice(splitIndex+1);
				var foundUser = false;

				// get time data
				var d = new Date();
	      		var time = d.getHours()+":"+(d.getMinutes()<10?("0"+d.getMinutes()):d.getMinutes());

				// cycle through current clients in chatroom
				var clients = getChatroom(chatroom_id);
				for (var p = 0; (p < clients.length && !foundUser); p++)
				if (receiver === clients[p].user_name) {
					io.sockets.connected[socket.id].emit('secret message', saveMessage, messageTxt, time);
					io.sockets.connected[clients[p].id].emit('secret message', sendMessage, messageTxt, time);
					foundUser = true;
				}
				if (!foundUser)
					io.sockets.connected[socket.id].emit('command message', "! "+receiver+" is not in the chatroom!");

				break;
			}
			default:
			{
				// regular message (catch any incorrect commands)

				if (message[0].indexOf("\\") < 0)
				{
					// get time data
					var d = new Date();
	      			var time = d.getHours()+":"+(d.getMinutes()<10?("0"+d.getMinutes()):d.getMinutes());

	      			// get user's profile picture
	      			var query = {name : socket.user_name};
					mongodb.collection("users").find(query).toArray(function(err, result) {
						if (err) throw err;
						var exists = (result.length > 0 ? true : false);

						if (exists) {
							io.emit('chat message', result[0].imageURI, (socket.user_name), msg, time);
	    					console.log('message: '+socket.user_name+" ("+time+"): "+msg);
						}
					});	
    			}
    			else
    				io.sockets.connected[socket.id].emit('command message', "! "+message[0]+" is not a valid command!");
    			
			}
		}	
  	});

	// announce when a user leaves the chat
	socket.on('disconnect', function(){
			//clients.splice(clients.indexOf(socket), 1);
			removeFromChatroom(socket.user_name, chatroom_id);
		io.emit('command message', (socket.user_name+' has disconnected'));
		console.log(socket.user_name + ' disconnected');
	});
});

// --= FUNCTIONS =--

// adds a new user to the users collection
function addUser(username, password) {
	try {
   		mongodb.collection("users").insertOne({name: username, password: password}) 
	} catch (e) {
   		print (e);
	};
};

// looks for a user in the users collectiom
function searchUser(user_name, user_password) {
	var query = {name : user_name, password : user_password};
	var exists;

	var cursorArray = mongodb.collection("users").find(query).toArray(function(err, result) {
		if (err) throw err;
		exists = (result.length > 0 ? true : false)
  	});

  	return (exists);
};

// adds a user into a chatroom
function addToChatroom(user_name, chatroomID) {
	try {
   		mongodb.collection("chatroom").insertOne({name : user_name, chatroom_id : chatroomID}) 
	} catch (e) {
   		print (e);
	};
}

// removes a user from a chatroom
function removeFromChatroom(user_name, chatroomID) {
	var query = {name : user_name, chatroom_id : chatroomID};
	var exists;

	mongodb.collection("chatroom").findOne(query, function (err, result){
		if (result===null) console.log(user_name+" - "+chatroomID+" pair not found!");
		else {
			mongodb.collection("chatroom").remove(query, function (err){
				if (err) console.log("Error removing "+user_name+" from chatroom "+chatroomID);
				else console.log("Removed "+user_name+" from chatroom "+chatroomID);
			});
		}
	});
}

// returns array of users in a chatroom
function getChatroom(chatroomID) {
	var query = {chatroom_id : chatroomID};

	var cursorArray = mongodb.collection("chatroom").find({}).toArray(function(err, result) {
		if (err) throw err;

		console.log(result);
		if(result.length > 0)
			return result;
		else
			return {};
  	});
}

// start server listening on port
server.listen(port, () =>  {
	console.log('Server running on port: '+port);
});