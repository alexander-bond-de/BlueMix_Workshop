
'use strict';

var express = require('express');
//var app     = require('express')();
var app     = express();
var server  = require('http').Server(app);
var io      = require('socket.io')(server);

//var app = express();
//var http = require('http').Server(app);
//var io = require('socket.io')(http);
//http.listen(process.env.PORT || 3000);
//var http = require('http');
//var socketIO = require('socket.io');

//app.use(express.static('Public'));

var clients = [];	// list of clients currently connected

/*
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
  res.sendFile(__dirname + '/index.html');
});
*/

app.use(express.static("Public"));

//var server = http.Server(app);

//var io = socketIO(server);

io.on('connection', function(socket){

	// announce when a user enters the chat
  	socket.on('user connected', function(msg){
  		socket.user_name = msg;
  		clients.push(socket);
  		io.emit('command message', (msg+' has connected'));
		console.log(msg+" has connected");
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

// begin listening
let port = process.env.PORT || process.env.VCAP_APP_PORT || 3000;

server.listen(port, () =>  {
	console.log('Server running on port: %d'+port);
});