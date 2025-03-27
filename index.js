const express = require('express');
const socket = require('socket.io');
const http = require('http');
const {Chess} = require('chess.js');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socket(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, 'public')));

app.get('/',(req,res) => {
    res.render("index", { title: "Chess Game" });
});

// Game rooms storage
const games = {};

// Debug log active games every 30 seconds
setInterval(() => {
    console.log(`[Debug] Active games: ${Object.keys(games).length}`);
    for (const gameId in games) {
        const game = games[gameId];
        console.log(`- GameID: ${gameId}, Started: ${game.started}, Players: ${game.players.white ? 'W' : '_'}${game.players.black ? 'B' : '_'}`);
    }
}, 30000);

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    
    // Create a new game
    socket.on('createGame', (gameId) => {
        console.log(`Player ${socket.id} creating game: ${gameId}`);
        
        games[gameId] = {
            id: gameId,
            board: new Chess(),
            players: {
                white: socket.id
            },
            currentTurn: 'w',
            started: false
        };
        
        socket.join(gameId);
        socket.emit('playerRole', 'W');
        socket.emit('gameCreated', { gameId });
        
        console.log(`Game created: ${gameId} by player ${socket.id}`);
    });
    
    // Join an existing game
    socket.on('joinGame', (gameId) => {
        console.log(`Player ${socket.id} attempting to join game: ${gameId}`);
        
        // Check if game exists
        if (!games[gameId]) {
            console.error(`Game not found: ${gameId}`);
            socket.emit('error', 'Game not found');
            return;
        }
        
        const game = games[gameId];
        
        // Check if game is full
        if (game.players.white && game.players.black) {
            socket.emit('spectator');
            socket.join(gameId);
            
            // Send current board state to spectator
            if (game.started) {
                socket.emit('boardState', game.board.fen());
            }
            return;
        }
        
        // Assign role (if white is taken, assign black)
        if (!game.players.white) {
            game.players.white = socket.id;
            socket.emit('playerRole', 'W');
        } else {
            game.players.black = socket.id;
            socket.emit('playerRole', 'B');
        }
        
        socket.join(gameId);
        
        // Notify the other player that an opponent has joined
        socket.to(gameId).emit('opponentJoined');
        
        console.log(`Player ${socket.id} joined game: ${gameId}`);
    });
    
    // Start the game
    socket.on('startGame', (gameId) => {
        console.log(`Player ${socket.id} attempting to start game: ${gameId}`);
        
        if (!games[gameId]) {
            console.error(`Game not found: ${gameId}`);
            socket.emit('error', 'Game not found');
            return;
        }
        
        const game = games[gameId];
        
        if (!game.players.white || !game.players.black) {
            console.log(`Cannot start game ${gameId}: waiting for opponent`);
            socket.emit('error', 'Waiting for opponent to join');
            socket.emit('needsOpponent', {
                isWhite: game.players.white === socket.id,
                isBlack: game.players.black === socket.id
            });
            return;
        }
        
        game.started = true;
        io.to(gameId).emit('gameStarted');
        io.to(gameId).emit('boardState', game.board.fen());
        
        console.log(`Game started: ${gameId}`);
    });
    
    // Handle player moves
    socket.on('move', (data) => {
        const gameId = data.gameId;
        const move = data.move;
        
        console.log(`Move received: ${JSON.stringify(move)} for game ${gameId} from player ${socket.id}`);
        
        if (!games[gameId]) {
            console.error(`Game not found: ${gameId}`);
            socket.emit('error', 'Game not found');
            return;
        }
        
        const game = games[gameId];
        
        // Check if game has started
        if (!game.started) {
            socket.emit('error', 'Game has not started yet');
            return;
        }
        
        // Check if it's the player's turn
        const isWhite = game.players.white === socket.id;
        const isBlack = game.players.black === socket.id;
        
        if ((game.board.turn() === 'w' && !isWhite) || (game.board.turn() === 'b' && !isBlack)) {
            socket.emit('error', 'Not your turn');
            return;
        }
        
        try {
            const result = game.board.move(move);
            
            if (result) {
                // Broadcast the move to all players in the game
                io.to(gameId).emit('move', {
                    player: socket.id,
                    move: move
                });
                
                // Update current turn
                game.currentTurn = game.board.turn();
                
                // Check for game over
                if (game.board.isGameOver()) {
                    let gameResult;
                    if (game.board.isCheckmate()) {
                        gameResult = `Checkmate! ${game.board.turn() === 'w' ? 'Black' : 'White'} wins!`;
                    } else if (game.board.isDraw()) {
                        gameResult = "Game ended in a draw";
                    } else if (game.board.isStalemate()) {
                        gameResult = "Game ended in stalemate";
                    }
                    
                    io.to(gameId).emit('gameOver', gameResult);
                    game.started = false;
                }
            } else {
                socket.emit('error', 'Invalid move');
            }
        } catch (error) {
            console.error(`Error processing move: ${error.message}`);
            socket.emit('error', error.message);
        }
    });
    
    // Request for current board state
    socket.on('requestBoardState', (gameId) => {
        console.log(`Board state requested for game ${gameId} by player ${socket.id}`);
        
        if (!games[gameId]) {
            socket.emit('error', 'Game not found');
            return;
        }
        
        if (games[gameId] && games[gameId].started) {
            socket.emit('boardState', games[gameId].board.fen());
        }
    });
    
    // Reset/restart game
    socket.on('resetGame', (gameId) => {
        console.log(`Player ${socket.id} attempting to reset game: ${gameId}`);
        
        if (!games[gameId]) {
            socket.emit('error', 'Game not found');
            return;
        }
        
        const game = games[gameId];
        game.board.reset();
        game.currentTurn = 'w';
        game.started = true;
        
        io.to(gameId).emit('gameReset');
        io.to(gameId).emit('boardState', game.board.fen());
        
        console.log(`Game reset: ${gameId}`);
    });
    
    // Handle disconnections
    socket.on('disconnect', () => {
        // Find all games this player is in
        for (const gameId in games) {
            const game = games[gameId];
            
            if (game.players.white === socket.id) {
                console.log(`White player (${socket.id}) disconnected from game: ${gameId}`);
                game.players.white = null;
                io.to(gameId).emit('playerDisconnected', 'White');
            } else if (game.players.black === socket.id) {
                console.log(`Black player (${socket.id}) disconnected from game: ${gameId}`);
                game.players.black = null;
                io.to(gameId).emit('playerDisconnected', 'Black');
            }
            
            // Clean up empty games
            if (!game.players.white && !game.players.black) {
                delete games[gameId];
                console.log(`Game removed: ${gameId}`);
            }
        }
        
        console.log(`User disconnected: ${socket.id}`);
    });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});