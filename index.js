
'use strict';

// socket.io and express setup
var express = require('express');									// obtains express
var app     = express();											// applies express to the app
var server  = require('http').Server(app);							// create a 'server' using the app data
var io      = require('socket.io')(server);							// obtains socket.io and attaches the server
var clients = [];													// list of clients currently connected

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
  		clients.push(socket);
  		io.emit('command message', (msg+' has connected'));
		console.log(msg+" has connected");

		addUser(socket);
  	});

  	// conform a user exisits within the database, then add them to chatroom
  	socket.on('confirm details', function(user_name, user_password){
  		var result = searchUser(user_name, user_password);

  		// add the user to the chatroom
  		/*
  		socket.user_name = msg;
  		clients.push(socket);
  		io.emit('command message', (msg+' has connected'));
		console.log(msg+" has connected");
		*/
		io.emit('command message', result);
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
				var currentUsers = ("* ("+clients.length+") current users:");
				for (var x = 0; x < clients.length; x++)
					currentUsers += (" " + clients[x].user_name);
				currentUsers += " *";
				io.sockets.connected[socket.id].emit('command message', currentUsers);
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
				for (var p = 0; (p < clients.length && !foundUser); p++)
					if (receiver === clients[p].user_name)
					{
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

					io.emit('chat message', (socket.user_name), msg, time);
	    			console.log('message: '+socket.user_name+" ("+time+"): "+msg);
    			}
    			else
    				io.emit('command message', "! "+message[0]+" is not a valid command!");
    			
			}
		}	
  	});

	// announce when a user leaves the chat
	socket.on('disconnect', function(){
		clients.splice(clients.indexOf(socket), 1);
		io.emit('command message', (socket.user_name+' has disconnected'));
		console.log(socket.user_name + ' disconnected');
	});
});

function addUser(socket) {
	try {
   		mongodb.collection("users").insertOne({name: socket.user_name, password: "test"}) 
	} catch (e) {
   		print (e);
	};
};

function searchUser(user_name, user_password) {
	var query = {name : user_name, password : user_password};
	var results;

	mongodb.collection("users").find(query).toArray(function(err, result) {
		console.log("-- SEARCH --"+query);
		console.log("-- RESULT --"+result);
    	results = result;
  	});

  	return (results.length > 0 ? true : false);
};

// start server listening on port
server.listen(port, () =>  {
	console.log('Server running on port: '+port);
});