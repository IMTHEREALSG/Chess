const socket = io();
const chess = new Chess();
const boardElement = document.getElementById("chessboard");
const statusElement = document.getElementById("status");
const playerColorElement = document.getElementById("player-color");
const startButton = document.getElementById("start-game");
const shareUrlContainer = document.getElementById("share-url-container");
const gameUrlElement = document.getElementById("game-url");
const copyUrlBtn = document.getElementById("copy-url-btn");

let draggedPiece = null;
let draggedPieceSource = null;
let playerRole = null;
let gameStarted = false;
let gameId = null;

// Detailed logging function for socket events
function logSocketEvent(event, data) {
    console.log(`[Socket] ${event}:`, data, `(GameID: ${gameId})`);
}

// Helper function to update UI
function updateStatus(message) {
    if (statusElement) {
        statusElement.innerHTML = message;
    }
}

// Generate or extract game ID from URL
function setupGameId() {
    // Check if we're joining an existing game
    const urlParams = new URLSearchParams(window.location.search);
    const existingGameId = urlParams.get('game');
    
    if (existingGameId && existingGameId.match(/^[a-zA-Z0-9]{6,10}$/)) {
        // We're joining an existing game with valid ID format
        gameId = existingGameId;
        socket.emit('joinGame', gameId);
        logSocketEvent('joinGame', gameId);
        updateStatus("Joining existing game...");
        
        // Hide share container for players joining via link
        if (shareUrlContainer) {
            shareUrlContainer.style.display = "none";
        }
        
        // Set a timeout in case the game isn't found
        setTimeout(() => {
            if (!playerRole) {
                updateStatus("Game not found or expired. Creating a new game...");
                // Create a new game instead
                setupNewGame();
            }
        }, 5000);
    } else {
        setupNewGame();
    }
}

function setupNewGame() {
    // We're creating a new game
    gameId = generateGameId();
    
    // Update URL without reloading the page
    const newUrl = `${window.location.pathname}?game=${gameId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    
    socket.emit('createGame', gameId);
    logSocketEvent('createGame', gameId);
    
    // Show the share URL section with emphasis
    if (shareUrlContainer) {
        shareUrlContainer.style.display = "block";
    }
    
    // Set the game URL for sharing
    if (gameUrlElement) {
        const fullUrl = `${window.location.origin}${window.location.pathname}?game=${gameId}`;
        gameUrlElement.innerText = fullUrl;
    }
    
    // Update status to emphasize sharing
    updateStatus("⚠️ SHARE the URL above with your opponent before starting!");
}

// Generate a random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 10);
}

// Function to update opponent status UI
function updateOpponentStatus(joined) {
    if (joined) {
        updateStatus("✅ Opponent joined! You can start the game now.");
    } else {
        updateStatus("⏳ Waiting for opponent to join...");
    }
    
    if (startButton) {
        startButton.disabled = !joined;
        if (joined) {
            startButton.className = "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition";
        } else {
            startButton.className = "px-4 py-2 bg-gray-400 text-white rounded cursor-not-allowed";
        }
    }
}

// Copy URL to clipboard functionality
if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', () => {
        const url = gameUrlElement.innerText;
        navigator.clipboard.writeText(url).then(() => {
            copyUrlBtn.innerText = "Copied!";
            setTimeout(() => {
                copyUrlBtn.innerText = "Copy URL";
            }, 2000);
        }).catch(err => {
            console.error('Could not copy text: ', err);
        });
    });
}

// Initialize the game setup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, setting up game");
    setupGameId();
    
    // Start button event listener
    if (startButton) {
        startButton.addEventListener("click", () => {
            console.log("Start button clicked, player role:", playerRole);
            if (playerRole) {
                socket.emit("startGame", gameId);
                logSocketEvent('startGame', gameId);
                startButton.disabled = true;
                startButton.className = "px-4 py-2 bg-gray-400 text-white rounded cursor-not-allowed";
                startButton.innerText = "Waiting for opponent...";
            } else {
                updateStatus("Please wait for a role assignment first");
            }
        });
    } else {
        console.error("Start button not found!");
    }
});

// Socket event handlers for game setup
socket.on("gameCreated", (data) => {
    logSocketEvent("gameCreated", data);
    updateOpponentStatus(false);
});

socket.on("opponentJoined", () => {
    logSocketEvent("opponentJoined", {});
    updateOpponentStatus(true);
});

socket.on("playerRole", (role) => {
    logSocketEvent("playerRole", role);
    playerRole = role;
    if (playerColorElement) {
        playerColorElement.innerText = role === "W" ? "White" : "Black";
    }
    updateStatus("Waiting for game to start...");
    
    // If this player is Black, flip the board
    if (role === "B" && boardElement) {
        boardElement.classList.add("flipped");
    }
    
    renderBoard();
});

socket.on("gameStarted", () => {
    logSocketEvent("gameStarted", {});
    gameStarted = true;
    updateStatus(`Game started! ${chess.turn() === 'w' ? "White" : "Black"}'s turn`);
    if (startButton) {
        startButton.style.display = "none"; // Hide the start button
    }
    if (shareUrlContainer) {
        shareUrlContainer.style.display = "none"; // Hide share URL container
    }
    renderBoard();
});

socket.on("needsOpponent", (data) => {
    logSocketEvent("needsOpponent", data);
    // Show share URL with emphasis
    if (shareUrlContainer) {
        shareUrlContainer.style.display = "block";
        shareUrlContainer.classList.add("animate-pulse");
        setTimeout(() => {
            shareUrlContainer.classList.remove("animate-pulse");
        }, 2000);
    }
    
    updateStatus("⚠️ You need an opponent! Share the URL above to invite someone.");
    
    // Re-enable the start button
    if (startButton) {
        startButton.disabled = false;
        startButton.className = "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition";
        startButton.innerText = "Start Game";
    }
});

const renderBoard = () => {
    if (!boardElement) {
        console.error("Board element not found!");
        return;
    }

    try {
        const board = chess.board();
        boardElement.innerHTML = "";
        boardElement.classList.add("chessboard");
        
        board.forEach((row, rowIndex) => {
            row.forEach((square, colIndex) => {
                const squareElement = document.createElement("div");
                squareElement.classList.add("square", (rowIndex + colIndex) % 2 === 0 ? "light" : "dark");
                squareElement.dataset.row = rowIndex;
                squareElement.dataset.col = colIndex;
            
                if (square) {
                    const pieceElement = document.createElement("div");
                    pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
                    pieceElement.innerText = getUnicode(square.type, square.color);
                    
                    // Only allow dragging if the game has started, it's this player's turn, and it's this player's piece
                    const isPlayersTurn = (playerRole === "W" && chess.turn() === 'w') || (playerRole === "B" && chess.turn() === 'b');
                    const isPlayersColor = (playerRole === "W" && square.color === "w") || (playerRole === "B" && square.color === "b");
                    
                    pieceElement.draggable = gameStarted && isPlayersTurn && isPlayersColor;
                    
                    if (pieceElement.draggable) {
                        pieceElement.classList.add("draggable");
                    }
                    
                    pieceElement.addEventListener("dragstart", (e) => {
                        if (pieceElement.draggable) {
                            draggedPiece = pieceElement;
                            draggedPieceSource = {row: rowIndex, col: colIndex};
                            e.dataTransfer.setData("text/plain", "");
                            pieceElement.classList.add("dragging");
                        }
                    });

                    pieceElement.addEventListener("dragend", () => {
                        if (draggedPiece) {
                            draggedPiece.classList.remove("dragging");
                        }
                        draggedPiece = null;
                        draggedPieceSource = null;
                    });

                    squareElement.appendChild(pieceElement);
                }

                squareElement.addEventListener("dragover", (e) => {
                    e.preventDefault();
                });

                squareElement.addEventListener("drop", (e) => {
                    e.preventDefault();
                    if (draggedPiece && gameStarted) {
                        const target = {
                            row: parseInt(squareElement.dataset.row),
                            col: parseInt(squareElement.dataset.col)   
                        };

                        handleMove(draggedPieceSource, target);
                    }
                });
                
                boardElement.appendChild(squareElement);
            });
        });
    } catch (error) {
        console.error("Error rendering board:", error);
        // Create an empty board if there's an error
        boardElement.innerHTML = "Error loading board. Please refresh the page.";
    }
};

const handleMove = (source, target) => {
    // Only allow moves if the game has started
    if (!gameStarted) return;
    
    const move = {
        from: algebraic(source.row, source.col),
        to: algebraic(target.row, target.col),
        promotion: 'q' // Always promote to queen for simplicity
    };
    
    // Try to make the move locally first
    try {
        const result = chess.move(move);
        
        if (result) {
            // If move is valid, send to server
            socket.emit("move", {
                gameId: gameId,
                move: move
            });
            logSocketEvent('move', { gameId, move });
            
            updateStatus(`Move made. ${chess.turn() === 'w' ? "White" : "Black"}'s turn`);
            renderBoard();
        } else {
            console.error("Invalid move");
            renderBoard(); // Reset the board view
        }
    } catch (error) {
        console.error("Invalid move:", error);
        // Reset the board to ensure consistency
        renderBoard();
    }
};

// Convert row/col coordinates to algebraic notation (e.g. e4)
const algebraic = (row, col) => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']; // Reversed because chess board is 0-indexed from top
    
    return files[col] + ranks[row];
};

const getUnicode = (piece, color) => {
    const pieces = {
        'p': {'w': '♙', 'b': '♙'},
        'r': {'w': '♖', 'b': '♖'},
        'n': {'w': '♘', 'b': '♘'},
        'b': {'w': '♗', 'b': '♗'},
        'q': {'w': '♕', 'b': '♕'},
        'k': {'w': '♔', 'b': '♔'}
    };
    
    return pieces[piece][color];
};

// Listen for moves from other player
socket.on("move", (data) => {
    logSocketEvent("move", data);
    try {
        chess.move(data.move);
        updateStatus(`${chess.turn() === 'w' ? "White" : "Black"}'s turn`);
        renderBoard();
    } catch (error) {
        console.error("Error applying move:", error);
        // Request current board state from server to ensure consistency
        socket.emit('requestBoardState', gameId);
        logSocketEvent('requestBoardState', gameId);
    }
});

socket.on("boardState", (fen) => {
    logSocketEvent("boardState", fen);
    try {
        chess.load(fen);
        updateStatus(`${chess.turn() === 'w' ? "White" : "Black"}'s turn`);
        renderBoard();
    } catch (error) {
        console.error("Error loading board state:", error);
    }
});

// Game over notification
socket.on("gameOver", (result) => {
    logSocketEvent("gameOver", result);
    gameStarted = false;
    updateStatus(`Game over: ${result}`);
    
    // Show start button again for a rematch
    if (startButton) {
        startButton.style.display = "block";
        startButton.disabled = false;
        startButton.innerText = "Play Again";
        startButton.className = "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition";
        
        // Change listener to reset game
        startButton.onclick = () => {
            socket.emit('resetGame', gameId);
            logSocketEvent('resetGame', gameId);
            startButton.disabled = true;
            startButton.innerText = "Resetting...";
        };
    }
});

// Game reset
socket.on("gameReset", () => {
    logSocketEvent("gameReset", {});
    gameStarted = true;
    chess.reset();
    updateStatus(`Game reset! White's turn`);
    
    if (startButton) {
        startButton.style.display = "none";
    }
    
    renderBoard();
});

// Added for spectator mode
socket.on("spectator", () => {
    logSocketEvent("spectator", {});
    updateStatus("You are a spectator. Watch the game!");
    if (playerColorElement) {
        playerColorElement.innerText = "Spectator";
    }
    if (startButton) {
        startButton.style.display = "none";
    }
    if (shareUrlContainer) {
        shareUrlContainer.style.display = "none";
    }
    renderBoard();
});

// Error handling
socket.on("error", (message) => {
    logSocketEvent("error", message);
    
    if (message === "Game not found") {
        // Special handling for game not found error
        updateStatus("Error: Game not found or expired. Creating a new game...");
        // Reset game state
        playerRole = null;
        gameStarted = false;
        
        // Create a new game after a short delay
        setTimeout(() => {
            setupNewGame();
        }, 2000);
        return;
    }
    
    if (message === "Waiting for opponent to join") {
        updateStatus("Waiting for an opponent to join. Share the game URL to invite someone!");
        
        // Make sure the share URL container is visible
        if (shareUrlContainer) {
            shareUrlContainer.style.display = "block";
        }
        
        // Enable the start button again
        if (startButton) {
            startButton.disabled = false;
            startButton.className = "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition";
            startButton.innerText = "Start Game";
        }
    } else {
        updateStatus(`Error: ${message}`);
    }
});

socket.on("playerDisconnected", (color) => {
    logSocketEvent("playerDisconnected", color);
    updateStatus(`${color} player disconnected.`);
    gameStarted = false;
    
    // If the game was in progress, show a message
    if (gameStarted) {
        updateStatus(`Game interrupted: ${color} player disconnected.`);
    }
    
    // Show the start button in case another player joins
    if (startButton) {
        startButton.style.display = "block";
        startButton.disabled = true;
        startButton.innerText = "Waiting for opponent...";
    }
});

// Connection status
socket.on('connect', () => {
    logSocketEvent('connect', socket.id);
    updateStatus('Connected to server!');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateStatus('Disconnected from server. Trying to reconnect...');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    updateStatus('Connection error. Please check your internet connection.');
});

// Initial board render
renderBoard();