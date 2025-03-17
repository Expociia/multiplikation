// User management
let currentUser = null;
let userStats = {};

// Load saved data from Firebase
async function loadUserData() {
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        userStats = {};
        querySnapshot.forEach((doc) => {
            userStats[doc.id] = doc.data();
        });
        
        // Check if we have a saved login token
        const savedToken = localStorage.getItem('userToken');
        if (savedToken) {
            const [userName, token] = savedToken.split(':');
            // Verify token
            const userRef = doc(db, "users", userName);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists() && userDoc.data().token === token) {
                currentUser = userName;
                userStats[currentUser] = userDoc.data();
                updateUserInterface();
                generateProblem();
            } else {
                localStorage.removeItem('userToken');
                showLoginPage();
            }
        } else {
            showLoginPage();
        }
    } catch (error) {
        console.error("Error loading user data:", error);
        showLoginPage();
    }
}

// Save data to Firebase
async function saveUserData() {
    if (!currentUser) return;
    
    try {
        const userRef = doc(db, "users", currentUser);
        await setDoc(userRef, userStats[currentUser]);
    } catch (error) {
        console.error("Error saving user data:", error);
    }
}

// Show login page
function showLoginPage() {
    // Hide main container
    document.querySelector('.container').style.display = 'none';
    
    // Show login container
    const loginContainer = document.getElementById('loginContainer');
    if (!loginContainer) {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="loginContainer" class="login-container">
                <h1>Multiplikationsträning</h1>
                <div class="existing-users">
                    <h2>Välj användare</h2>
                    <div id="userList" class="user-list"></div>
                </div>
                <div class="new-user">
                    <h2>Skapa ny användare</h2>
                    <form id="registerForm" class="user-form">
                        <input type="text" id="newUserName" placeholder="Användarnamn" required>
                        <input type="password" id="newPassword" placeholder="Lösenord" required>
                        <button type="submit">Skapa användare</button>
                    </form>
                </div>
            </div>
        `);
        
        // Set up event listeners for the login page
        setupLoginPageListeners();
    }
    
    // Update user list
    updateUserList();
}

// Update user list on login page
async function updateUserList() {
    const userList = document.getElementById('userList');
    if (!userList) return;
    
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        let userListHTML = '';
        
        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            const level = Math.floor(userData.totalExercises / 100) + 1;
            const currentTitle = titles.find(t => t.level <= level) || titles[0];
            
            userListHTML += `
                <div class="user-card" data-username="${doc.id}">
                    <img src="avatars/level${Math.min(level, 8)}.png" alt="Avatar" class="user-avatar">
                    <div class="user-info">
                        <span class="user-name">${doc.id}</span>
                        <span class="user-title">${currentTitle.title}</span>
                    </div>
                </div>
            `;
        });
        
        userList.innerHTML = userListHTML;

        // Lägg till klickhändelser för användarkorten
        document.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', () => {
                const username = card.dataset.username;
                showLoginForm(username);
            });
        });
    } catch (error) {
        console.error("Error updating user list:", error);
    }
}

// Visa inloggningsformulär för vald användare
function showLoginForm(username) {
    const loginContainer = document.getElementById('loginContainer');
    const loginForm = document.createElement('div');
    loginForm.className = 'login-form-overlay';
    loginForm.innerHTML = `
        <div class="login-form-modal">
            <h2>Logga in som ${username}</h2>
            <form id="userLoginForm">
                <input type="password" id="userPassword" placeholder="Lösenord" required>
                <div class="button-group">
                    <button type="submit" class="primary-btn">Logga in</button>
                    <button type="button" class="secondary-btn" id="cancelLogin">Avbryt</button>
                </div>
            </form>
        </div>
    `;
    
    loginContainer.appendChild(loginForm);
    
    const userLoginForm = document.getElementById('userLoginForm');
    const cancelButton = document.getElementById('cancelLogin');
    const passwordInput = document.getElementById('userPassword');
    
    // Fokusera på lösenordsfältet
    passwordInput.focus();
    
    userLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = passwordInput.value;
        
        try {
            const userRef = doc(db, "users", username);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists() && verifyPassword(password, userDoc.data().password)) {
                const token = generateToken();
                // Uppdatera token i databasen
                await updateDoc(userRef, { token: token });
                loginForm.remove();
                await loginUser(username, token);
            } else {
                alert('Fel lösenord');
            }
        } catch (error) {
            console.error("Error logging in:", error);
            alert('Ett fel uppstod vid inloggning');
        }
    });
    
    cancelButton.addEventListener('click', () => {
        loginForm.remove();
    });
}

// Set up login page event listeners
function setupLoginPageListeners() {
    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userName = document.getElementById('newUserName').value.trim();
            const password = document.getElementById('newPassword').value;
            
            try {
                // Check if user already exists
                const userRef = doc(db, "users", userName);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists()) {
                    alert('Användarnamnet är redan taget');
                    return;
                }
                
                // Create new user
                const token = generateToken();
                const newUserData = {
                    password: hashPassword(password),
                    token: token,
                    totalExercises: 0,
                    correct: 0,
                    incorrect: 0,
                    tableStats: {},
                    lastPlayed: new Date().toISOString(),
                    fastestTime: null,
                    bestStreak: 0,
                    currentStreak: 0,
                    achievements: [],
                    level: 1
                };
                
                await setDoc(userRef, newUserData);
                userStats[userName] = newUserData;
                
                // Log in the new user
                await loginUser(userName, token);
                
            } catch (error) {
                console.error("Error creating user:", error);
                alert('Ett fel uppstod när användaren skulle skapas');
            }
        });
    }
    
    // Login forms
    document.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('login-form')) {
            e.preventDefault();
            const userName = e.target.querySelector('button').dataset.username;
            const password = e.target.querySelector('.password-input').value;
            
            try {
                const userRef = doc(db, "users", userName);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists() && verifyPassword(password, userDoc.data().password)) {
                    const token = generateToken();
                    // Update token in database
                    await updateDoc(userRef, { token: token });
                    await loginUser(userName, token);
                } else {
                    alert('Fel lösenord');
                }
            } catch (error) {
                console.error("Error logging in:", error);
                alert('Ett fel uppstod vid inloggning');
            }
        }
    });
}

// Login user
async function loginUser(userName, token) {
    currentUser = userName;
    localStorage.setItem('userToken', `${userName}:${token}`);
    
    // Hide login container
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.style.display = 'none';
    }
    
    // Show main container
    document.querySelector('.container').style.display = 'block';
    
    // Update interface
    updateUserInterface();
    generateProblem();
}

// Update user interface after login
function updateUserInterface() {
    const stats = userStats[currentUser];
    const level = Math.floor(stats.totalExercises / 100) + 1;
    const currentTitle = titles.find(t => t.level <= level) || titles[0];
    
    document.getElementById('currentUser').innerHTML = `
        <img src="avatars/level${Math.min(level, 8)}.png" alt="Avatar" class="current-user-avatar">
        <div class="current-user-info">
            <span class="current-user-name">${currentUser}</span>
            <span class="current-user-title">${currentTitle.title}</span>
        </div>
    `;
    document.getElementById('statsUserName').textContent = currentUser;
    updateStats();
    updateUserProfile();
}

// Utility functions for password handling
function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function hashPassword(password) {
    // In a real application, use a proper hashing algorithm
    // This is a simple example
    return btoa(password);
}

function verifyPassword(password, hashedPassword) {
    return btoa(password) === hashedPassword;
}

// Logout user
function logoutUser() {
    localStorage.removeItem('userToken');
    currentUser = null;
    showLoginPage();
}

// User interface management
function showGameModal() {
    const modal = document.getElementById('gameModal');
    modal.style.display = 'flex';
}

function hideGameModal() {
    const modal = document.getElementById('gameModal');
    modal.style.display = 'none';
}

// Game variables
let score = 0;
let correct = 0;
let incorrect = 0;
let currentTable = 0;
let selectedTables = Array.from({length: 10}, (_, i) => i + 1);
let trainingMode = 'free';
let startTime = null;
let gameMode = 'practice'; // Set default game mode
let remainingProblems = null;
let timeLimit = null;
let gameTimer = null;

// Game types
const gameTypes = [
    {
        name: "Alla tabeller",
        description: "20 tal från alla tabeller",
        problems: 20,
        tables: "all",
        timeLimit: null
    },
    {
        name: "Höga tabeller",
        description: "10 tal från 6-10:ans tabeller",
        problems: 10,
        tables: "high",
        timeLimit: null
    },
    {
        name: "Låga tabeller",
        description: "25 tal från 1-5:ans tabeller",
        problems: 25,
        tables: "low",
        timeLimit: null
    },
    {
        name: "Tidsutmaning",
        description: "Så många tal som möjligt på 1 minut",
        problems: null,
        tables: "all",
        timeLimit: 60
    },
    {
        name: "Svåra tabeller",
        description: "15 tal från dina svåraste tabeller",
        problems: 15,
        tables: "hard",
        timeLimit: null
    }
];

// DOM elements
const number1Element = document.getElementById('number1');
const number2Element = document.getElementById('number2');
const answerInput = document.getElementById('answer');
const checkButton = document.getElementById('check');
const feedbackElement = document.getElementById('feedback');
const scoreElement = document.getElementById('score');
const correctElement = document.getElementById('correct');
const incorrectElement = document.getElementById('incorrect');
const hintButton = document.getElementById('hint');

// Hint system
const hints = {
    5: [
        "Think of 5 as half of 10!",
        "If you multiply by 10 and then divide by 2, you get the same answer",
        "For 5 × 6: think 10 × 6 = 60, then 60 ÷ 2 = 30"
    ],
    9: [
        "For the 9 times table, you can use your fingers!",
        "For 9 × 6: hold up 6 fingers, put down the 6th finger. You see 5 fingers on the left and 4 on the right = 54",
        "Another way: multiply by 10 and subtract the number itself. For 9 × 6: 10 × 6 = 60, then 60 - 6 = 54"
    ],
    4: [
        "For the 4 times table, double twice!",
        "For 4 × 6: first 6 + 6 = 12, then 12 + 12 = 24",
        "Another way: think of having 4 groups with the same amount"
    ],
    6: [
        "For the 6 times table, think 5 times the number plus the number itself",
        "For 6 × 6: first 5 × 6 = 30, then 30 + 6 = 36",
        "Another way: think of having 6 groups with the same amount"
    ],
    7: [
        "For the 7 times table, think 5 times the number plus 2 times the number",
        "For 7 × 6: first 5 × 6 = 30, then 2 × 6 = 12, and 30 + 12 = 42",
        "Another way: think of having 7 groups with the same amount"
    ],
    8: [
        "For the 8 times table, double three times!",
        "For 8 × 6: first 6 + 6 = 12, then 12 + 12 = 24, and 24 + 24 = 48",
        "Another way: think of having 8 groups with the same amount"
    ]
};

let currentHintIndex = 0;

// Titles and levels
const titles = [
    { level: 1, title: "Nykomling" },
    { level: 2, title: "Matematikstudent" },
    { level: 3, title: "Räknemästare" },
    { level: 4, title: "Matematikgeni" },
    { level: 5, title: "Human Calculator" },
    { level: 6, title: "Einstein" },
    { level: 7, title: "Matematiklegendar" },
    { level: 8, title: "Universums Räknare" }
];

const achievements = [
    {
        id: "table_master_1",
        title: "Kung av 1:ans tabell",
        description: "Klara 50 tal i 1:ans tabell",
        icon: "achievements/table1.png",
        condition: (stats) => stats.tableStats[1]?.correct >= 50
    },
    {
        id: "table_master_2",
        title: "Kung av 2:ans tabell",
        description: "Klara 50 tal i 2:ans tabell",
        icon: "achievements/table2.png",
        condition: (stats) => stats.tableStats[2]?.correct >= 50
    },
    {
        id: "speed_demon",
        title: "Snabb som blixten",
        description: "Svara på ett tal inom 2 sekunder",
        icon: "achievements/speed.png",
        condition: (stats) => stats.fastestTime <= 2000
    },
    {
        id: "perfect_streak",
        title: "Perfekt svit",
        description: "Svara rätt på 10 tal i rad",
        icon: "achievements/streak.png",
        condition: (stats) => stats.bestStreak >= 10
    },
    {
        id: "hundred_master",
        title: "Hundramästare",
        description: "Klara 100 tal totalt",
        icon: "achievements/100.png",
        condition: (stats) => stats.totalExercises >= 100
    }
];

// Generate new problem
function generateProblem() {
    if (!currentUser) {
        showLoginPage();
        return;
    }

    // Show game play area
    const gamePlayArea = document.querySelector('.game-play-area');
    if (gamePlayArea) {
        gamePlayArea.style.display = 'block';
    }

    // Hide game type selector during active game
    const gameTypeSelector = document.querySelector('.game-type-selector');
    if (gameTypeSelector) {
        gameTypeSelector.style.display = 'none';
    }

    let num1, num2;
    if (trainingMode === 'hard') {
        const hardestTable = findHardestTable();
        num1 = hardestTable;
        num2 = Math.floor(Math.random() * 10) + 1;
    } else if (trainingMode === 'mixed') {
        if (Math.random() < 0.7) {
            const hardestTable = findHardestTable();
            num1 = hardestTable;
        } else {
            num1 = selectedTables[Math.floor(Math.random() * selectedTables.length)];
        }
        num2 = Math.floor(Math.random() * 10) + 1;
    } else {
        num1 = selectedTables[Math.floor(Math.random() * selectedTables.length)];
        num2 = Math.floor(Math.random() * 10) + 1;
    }

    number1Element.textContent = num1;
    number2Element.textContent = num2;
    currentTable = num1;
    answerInput.value = '';
    feedbackElement.textContent = '';
    hintButton.style.display = 'none';
    currentHintIndex = 0;
    startTime = Date.now(); // Start time measurement
}

// Find the hardest table
function findHardestTable() {
    let worstTable = 1;
    let worstRatio = 1;

    Object.entries(userStats[currentUser].tableStats).forEach(([table, stats]) => {
        if (stats.total > 0) {
            const ratio = stats.correct / stats.total;
            if (ratio < worstRatio) {
                worstRatio = ratio;
                worstTable = parseInt(table);
            }
        }
    });

    return worstTable;
}

// Check answer
function checkAnswer() {
    const num1 = parseInt(number1Element.textContent);
    const num2 = parseInt(number2Element.textContent);
    const userAnswer = parseInt(answerInput.value);
    const correctAnswer = num1 * num2;
    const timeSpent = startTime ? Date.now() - startTime : 0;

    if (userAnswer === correctAnswer) {
        score += 1;
        correct += 1;
        feedbackElement.textContent = 'Helt rätt! Fortsätt så!';
        feedbackElement.style.color = 'green';
        updateTableStats(true, timeSpent);
        
        // Update fastest time
        if (!userStats[currentUser].fastestTime || timeSpent < userStats[currentUser].fastestTime) {
            userStats[currentUser].fastestTime = timeSpent;
        }
        
        // Update best streak
        userStats[currentUser].currentStreak = (userStats[currentUser].currentStreak || 0) + 1;
        if (userStats[currentUser].currentStreak > (userStats[currentUser].bestStreak || 0)) {
            userStats[currentUser].bestStreak = userStats[currentUser].currentStreak;
        }
        
        // Update remaining problems for challenge mode
        if (gameMode === 'challenge' && remainingProblems !== null) {
            remainingProblems--;
            if (remainingProblems === 0) {
                endGame();
                return;
            }
        }
        
        generateProblem();
    } else {
        incorrect += 1;
        feedbackElement.textContent = 'Fel! Försök igen!';
        feedbackElement.style.color = 'red';
        hintButton.style.display = 'block';
        updateTableStats(false, timeSpent);
        
        // Reset streak on incorrect answer
        userStats[currentUser].currentStreak = 0;
    }

    scoreElement.textContent = score;
    correctElement.textContent = correct;
    incorrectElement.textContent = incorrect;
    saveUserData();
    updateStats();
    updateUserProfile();
}

// Update statistics for current table
function updateTableStats(isCorrect, timeSpent) {
    if (!userStats[currentUser].tableStats[currentTable]) {
        userStats[currentUser].tableStats[currentTable] = {
            total: 0,
            correct: 0,
            incorrect: 0,
            totalTime: 0,
            averageTime: 0,
            times: [] // Store all times for analysis
        };
    }

    const stats = userStats[currentUser].tableStats[currentTable];
    stats.total++;
    stats.totalTime += timeSpent;
    stats.averageTime = stats.totalTime / stats.total;
    stats.times.push(timeSpent);

    if (isCorrect) {
        stats.correct++;
        userStats[currentUser].correct = (userStats[currentUser].correct || 0) + 1;
    } else {
        stats.incorrect++;
        userStats[currentUser].incorrect = (userStats[currentUser].incorrect || 0) + 1;
    }

    // Update total exercises for user
    userStats[currentUser].totalExercises = (userStats[currentUser].totalExercises || 0) + 1;
    userStats[currentUser].lastPlayed = new Date().toISOString();
}

// Show hint
function showHint() {
    const num1 = parseInt(number1Element.textContent);
    const hintList = hints[num1];
    
    if (!hintList) {
        feedbackElement.textContent = 'Försök räkna ut det steg för steg!';
        feedbackElement.style.color = '#ff9800';
        return;
    }
    
    if (currentHintIndex < hintList.length) {
        feedbackElement.textContent = `Ledtråd ${currentHintIndex + 1}: ${hintList[currentHintIndex]}`;
        feedbackElement.style.color = '#ffc107';
        currentHintIndex++;
    } else {
        feedbackElement.textContent = 'Försök räkna ut det steg för steg!';
        feedbackElement.style.color = '#ff9800';
    }
}

// Update statistics view
function updateStats() {
    if (!currentUser) return;

    const stats = userStats[currentUser];
    
    // Update overview
    document.getElementById('totalExercises').textContent = stats.totalExercises;
    document.getElementById('totalCorrect').textContent = stats.correct;
    document.getElementById('totalIncorrect').textContent = stats.incorrect;

    // Find hardest and best tables
    const tableStats = Object.entries(stats.tableStats);
    const hardestTables = tableStats
        .filter(([_, stat]) => stat.total > 0) // Filtrera bort tabeller utan aktivitet
        .sort((a, b) => {
            const ratioA = a[1].correct / a[1].total;
            const ratioB = b[1].correct / b[1].total;
            return ratioA - ratioB;
        })
        .slice(0, 3);
    
    const bestTables = tableStats
        .filter(([_, stat]) => stat.total > 0) // Filtrera bort tabeller utan aktivitet
        .sort((a, b) => {
            const ratioA = a[1].correct / a[1].total;
            const ratioB = b[1].correct / b[1].total;
            return ratioB - ratioA;
        })
        .slice(0, 3);

    // Find fastest tables - använd faktisk genomsnittlig tid
    const fastestTables = tableStats
        .filter(([_, stat]) => stat.total >= 5 && stat.totalTime > 0) // Minst 5 uppgifter och har registrerad tid
        .sort((a, b) => (a[1].totalTime / a[1].total) - (b[1].totalTime / b[1].total))
        .slice(0, 3);

    // Find slowest tables - använd faktisk genomsnittlig tid
    const slowestTables = tableStats
        .filter(([_, stat]) => stat.total >= 5 && stat.totalTime > 0) // Minst 5 uppgifter och har registrerad tid
        .sort((a, b) => (b[1].totalTime / b[1].total) - (a[1].totalTime / a[1].total))
        .slice(0, 3);

    // Update hardest tables list
    const hardestList = document.getElementById('hardestTables');
    hardestList.innerHTML = hardestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${Math.round(stat.correct/stat.total * 100)}% rätt)</li>`
    ).join('');

    // Update best tables list
    const bestList = document.getElementById('bestTables');
    bestList.innerHTML = bestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${Math.round(stat.correct/stat.total * 100)}% rätt)</li>`
    ).join('');

    // Update fastest tables list
    const fastestList = document.getElementById('fastestTables');
    fastestList.innerHTML = fastestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${((stat.totalTime / stat.total)/1000).toFixed(2)} sekunder)</li>`
    ).join('');

    // Update slowest tables list
    const slowestList = document.getElementById('slowestTables');
    slowestList.innerHTML = slowestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${((stat.totalTime / stat.total)/1000).toFixed(2)} sekunder)</li>`
    ).join('');

    // Update detailed statistics
    const tableDetails = document.getElementById('tableDetails');
    tableDetails.innerHTML = tableStats.map(([table, stat]) => `
        <div class="table-stat">
            <h4>${table}:ans tabell</h4>
            <p>Totalt: ${stat.total} | Rätt: ${stat.correct} | Fel: ${stat.incorrect}</p>
            <p>Rättprocent: ${Math.round(stat.correct/stat.total * 100)}%</p>
            <p>Genomsnittlig tid: ${((stat.totalTime / stat.total)/1000).toFixed(2)} sekunder</p>
        </div>
    `).join('');
}

// Reset statistics
function resetStats() {
    if (!currentUser) return;
    
    if (confirm('Är du säker på att du vill återställa din statistik? Dina utmärkelser och level behålls.')) {
        // Save current level and achievements
        const currentLevel = Math.floor(userStats[currentUser].totalExercises / 100) + 1;
        const achievements = userStats[currentUser].achievements || [];
        
        // Reset statistics but keep level and achievements
        userStats[currentUser] = {
            ...userStats[currentUser], // Keep existing properties like password and token
            totalExercises: (currentLevel - 1) * 100, // Keep level
            correct: 0,
            incorrect: 0,
            tableStats: {},
            lastPlayed: new Date().toISOString(),
            fastestTime: null,
            bestStreak: 0,
            currentStreak: 0,
            achievements: achievements // Keep achievements
        };
        
        // Reset current game variables
        score = 0;
        correct = 0;
        incorrect = 0;
        
        // Update display
        scoreElement.textContent = '0';
        correctElement.textContent = '0';
        incorrectElement.textContent = '0';
        
        // Save and update statistics
        saveUserData();
        updateStats();
        updateUserProfile();
        
        // Show confirmation
        feedbackElement.textContent = 'Statistik återställd!';
        feedbackElement.style.color = '#4CAF50';
        setTimeout(() => {
            feedbackElement.textContent = '';
        }, 2000);
    }
}

// Update user profile
function updateUserProfile() {
    if (!currentUser) return;
    
    const stats = userStats[currentUser];
    const level = Math.floor(stats.totalExercises / 100) + 1;
    const levelProgress = (stats.totalExercises % 100) / 100 * 100;
    
    // Update level and progress bar
    document.getElementById('userLevel').textContent = level;
    document.getElementById('levelProgress').style.width = `${levelProgress}%`;
    
    // Update title
    const currentTitle = titles.find(t => t.level <= level) || titles[titles.length - 1];
    document.getElementById('userTitle').textContent = currentTitle.title;
    
    // Update avatar
    document.getElementById('userAvatar').src = `avatars/level${Math.min(level, 8)}.png`;
    
    // Update achievements
    updateAchievements(stats);
}

// Update achievements
function updateAchievements(stats) {
    const achievementsList = document.getElementById('achievementsList');
    if (!achievementsList) return;
    
    let achievementsHTML = '';
    
    achievements.forEach(achievement => {
        const isUnlocked = achievement.condition(stats);
        achievementsHTML += `
            <div class="achievement-card ${isUnlocked ? '' : 'locked'}">
                <img src="${achievement.icon}" alt="${achievement.title}" class="achievement-icon">
                <div class="achievement-title">${achievement.title}</div>
                <div class="achievement-description">${achievement.description}</div>
            </div>
        `;
    });
    
    achievementsList.innerHTML = achievementsHTML;
}

// Start game
function startGame(gameType) {
    console.log('Starting game with type:', gameType);
    gameMode = 'challenge';
    score = 0;
    correct = 0;
    incorrect = 0;
    remainingProblems = gameType.problems;
    timeLimit = gameType.timeLimit;
    
    // Reset UI elements
    scoreElement.textContent = '0';
    correctElement.textContent = '0';
    incorrectElement.textContent = '0';
    feedbackElement.textContent = '';
    
    // Show game modal
    const gameModal = document.getElementById('gameModal');
    const countdown = document.getElementById('countdown');
    const gameSummary = document.getElementById('gameSummary');
    if (gameModal && countdown && gameSummary) {
        gameModal.style.display = 'flex';
        countdown.style.display = 'block';
        gameSummary.style.display = 'none';
    }
    
    // Select tables based on game type
    if (!Array.isArray(gameType.tables)) {
        if (gameType.tables === 'all') {
            selectedTables = Array.from({length: 10}, (_, i) => i + 1);
        } else if (gameType.tables === 'high') {
            selectedTables = [6, 7, 8, 9, 10];
        } else if (gameType.tables === 'low') {
            selectedTables = [1, 2, 3, 4, 5];
        } else if (gameType.tables === 'hard') {
            selectedTables = findHardestTables(3);
        }
    } else {
        selectedTables = gameType.tables;
    }
    
    // Start countdown
    let count = 3;
    if (countdown) {
        countdown.textContent = count;
        countdown.classList.add('animate');
    }
    
    const countdownInterval = setInterval(() => {
        count--;
        if (countdown) {
            countdown.textContent = count;
        }
        
        if (count <= 0) {
            clearInterval(countdownInterval);
            if (countdown) {
                countdown.classList.remove('animate');
                countdown.style.display = 'none';
            }
            startGamePlay(gameType);
        }
    }, 1000);
}

// Start actual game
function startGamePlay(gameType) {
    // Show game area
    document.querySelector('.game-play-area').style.display = 'block';
    
    // Update UI
    scoreElement.textContent = '0';
    correctElement.textContent = '0';
    incorrectElement.textContent = '0';
    
    // Set focus on answer field
    answerInput.focus();
    
    // Set up time limit if there is one
    if (timeLimit) {
        startTimer(timeLimit);
    }
    
    // Start game
    generateProblem();
}

// End game
function endGame() {
    if (gameTimer) {
        clearInterval(gameTimer);
    }
    
    // Hide game area
    document.querySelector('.game-play-area').style.display = 'none';
    
    // Calculate average time
    const totalTime = Object.values(userStats[currentUser].tableStats)
        .reduce((sum, stat) => sum + stat.totalTime, 0);
    const totalProblems = Object.values(userStats[currentUser].tableStats)
        .reduce((sum, stat) => sum + stat.total, 0);
    const avgTime = totalProblems > 0 ? totalTime / totalProblems : 0;
    
    // Update summary
    document.getElementById('summaryCorrect').textContent = correct;
    document.getElementById('summaryIncorrect').textContent = incorrect;
    document.getElementById('summaryAvgTime').textContent = (avgTime/1000).toFixed(2);
    document.getElementById('summaryBestStreak').textContent = userStats[currentUser].bestStreak;
    
    // Show summary
    const gameModal = document.getElementById('gameModal');
    const countdown = document.getElementById('countdown');
    const gameSummary = document.getElementById('gameSummary');
    countdown.style.display = 'none';
    gameSummary.style.display = 'block';
    
    // Return to practice mode
    gameMode = 'practice';
    remainingProblems = null;
    timeLimit = null;
    
    // Update statistics
    updateStats();
    updateUserProfile();
}

// Start timer
function startTimer(seconds) {
    let timeLeft = seconds;
    const gameArea = document.querySelector('.game-area');
    if (!gameArea) return;
    
    // Add timer element
    gameArea.insertAdjacentHTML('afterbegin', `
        <div id="timer" class="timer">Tid kvar: ${timeLeft}s</div>
    `);
    
    const timerElement = document.getElementById('timer');
    
    gameTimer = setInterval(() => {
        timeLeft--;
        if (timerElement) {
            timerElement.textContent = `Tid kvar: ${timeLeft}s`;
        }
        
        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000);
}

// Find hardest tables
function findHardestTables(count) {
    const tableStats = userStats[currentUser].tableStats;
    return Object.entries(tableStats)
        .sort((a, b) => {
            const ratioA = a[1].correct / a[1].total;
            const ratioB = b[1].correct / b[1].total;
            return ratioA - ratioB;
        })
        .slice(0, count)
        .map(([table]) => parseInt(table));
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    // Wait for Firebase to be ready
    const checkFirebase = setInterval(() => {
        if (window.db && window.collection && window.getDocs && window.doc && window.getDoc && window.setDoc) {
            console.log('Firebase is ready');
            clearInterval(checkFirebase);
            initializeApp();
            
            // Trigga initial visning av aktiv vy
            const activeView = document.querySelector('.nav-btn.active');
            if (activeView) {
                showView(activeView.dataset.view);
            }
        } else {
            console.log('Waiting for Firebase...');
        }
    }, 100);
});

// Handle user settings
function setupSettingsListeners() {
    const saveUsernameBtn = document.getElementById('saveUsername');
    const savePasswordBtn = document.getElementById('savePassword');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (saveUsernameBtn) {
        saveUsernameBtn.addEventListener('click', async () => {
            const newUsername = document.getElementById('changeUsername').value.trim();
            if (!newUsername) {
                alert('Ange ett nytt användarnamn');
                return;
            }
            
            try {
                // Check if new username is available
                const userRef = doc(db, "users", newUsername);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists()) {
                    alert('Användarnamnet är redan taget');
                    return;
                }
                
                // Get current user data
                const currentUserRef = doc(db, "users", currentUser);
                const currentUserData = userStats[currentUser];
                
                // Create new user document
                await setDoc(userRef, currentUserData);
                
                // Delete old user document
                await deleteDoc(currentUserRef);
                
                // Update local storage and variables
                localStorage.setItem('userToken', `${newUsername}:${currentUserData.token}`);
                userStats[newUsername] = currentUserData;
                delete userStats[currentUser];
                currentUser = newUsername;
                
                // Update interface
                updateUserInterface();
                document.getElementById('changeUsername').value = '';
                
                alert('Användarnamn ändrat!');
            } catch (error) {
                console.error("Error changing username:", error);
                alert('Ett fel uppstod när användarnamnet skulle ändras');
            }
        });
    }
    
    if (savePasswordBtn) {
        savePasswordBtn.addEventListener('click', async () => {
            const newPassword = document.getElementById('changePassword').value;
            if (!newPassword) {
                alert('Ange ett nytt lösenord');
                return;
            }
            
            try {
                // Update password in database
                const userRef = doc(db, "users", currentUser);
                await updateDoc(userRef, {
                    password: hashPassword(newPassword)
                });
                
                // Update local data
                userStats[currentUser].password = hashPassword(newPassword);
                
                document.getElementById('changePassword').value = '';
                alert('Lösenord ändrat!');
            } catch (error) {
                console.error("Error changing password:", error);
                alert('Ett fel uppstod när lösenordet skulle ändras');
            }
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Är du säker på att du vill logga ut?')) {
                logoutUser();
            }
        });
    }
}

// Initialize application
function initializeApp() {
    console.log('Initializing application');
    
    // Load user data first
    loadUserData();
    
    // Set up all event listeners
    setupLoginPageListeners();
    setupSettingsListeners();
    
    // Set up navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('Navigation button clicked:', btn.dataset.view);
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showView(btn.dataset.view);
        });
    });

    // Trigga initial visning av aktiv vy
    const activeView = document.querySelector('.nav-btn.active');
    if (activeView) {
        showView(activeView.dataset.view);
    } else {
        // Om ingen vy är aktiv, sätt game som standard
        const gameBtn = document.querySelector('.nav-btn[data-view="game"]');
        if (gameBtn) {
            gameBtn.classList.add('active');
            showView('game');
        }
    }

    // User management
    const changeUserBtn = document.getElementById('changeUser');
    if (changeUserBtn) {
        changeUserBtn.addEventListener('click', () => {
            console.log('Change user button clicked');
            logoutUser();
        });
    }

    // Game controls
    const checkBtn = document.getElementById('check');
    const answerInput = document.getElementById('answer');
    const hintBtn = document.getElementById('hint');
    
    // Hantera numerisk knappsats
    document.querySelectorAll('.numpad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const value = btn.dataset.value;
            
            if (value === 'clear') {
                answerInput.value = '';
            } else if (value === 'enter') {
                checkAnswer();
            } else {
                answerInput.value += value;
            }
            
            // Fokusera på input-fältet för att undvika att tangentbordet visas
            answerInput.focus();
            if (document.activeElement) {
                document.activeElement.blur();
            }
        });
    });
    
    if (checkBtn) {
        checkBtn.addEventListener('click', checkAnswer);
    }
    
    if (hintBtn) {
        hintBtn.addEventListener('click', showHint);
    }

    // Game types
    document.querySelectorAll('.game-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('Game type button clicked:', btn.dataset.type);
            const gameType = gameTypes.find(type => type.name === btn.dataset.type);
            if (gameType) {
                startGame(gameType);
            }
        });
    });

    // Custom game
    const startCustomGameBtn = document.getElementById('startCustomGame');
    if (startCustomGameBtn) {
        startCustomGameBtn.addEventListener('click', () => {
            console.log('Start custom game button clicked');
            const problemsInput = document.getElementById('customProblems');
            const problems = problemsInput ? parseInt(problemsInput.value) : 10;
            
            const selectedTables = Array.from(document.querySelectorAll('.custom-game .table-selection input:checked'))
                .map(cb => parseInt(cb.value));
            
            if (problems < 1) {
                alert('Välj minst ett tal!');
                return;
            }
            
            if (selectedTables.length === 0) {
                alert('Välj minst en tabell!');
                return;
            }
            
            startGame({
                name: "Anpassat spel",
                description: `${problems} tal från valda tabeller`,
                problems: problems,
                tables: selectedTables,
                timeLimit: null
            });
        });
    }

    // Settings
    const trainingModeSelect = document.getElementById('trainingMode');
    if (trainingModeSelect) {
        trainingModeSelect.addEventListener('change', (e) => {
            console.log('Training mode changed to:', e.target.value);
            trainingMode = e.target.value;
        });
    }

    // Reset stats
    const resetStatsBtn = document.getElementById('resetStats');
    if (resetStatsBtn) {
        resetStatsBtn.addEventListener('click', resetStats);
    }

    // Game modal controls
    const playAgainBtn = document.getElementById('playAgain');
    const closeSummaryBtn = document.getElementById('closeSummary');
    
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            console.log('Play again button clicked');
            const gameModal = document.getElementById('gameModal');
            if (gameModal) {
                gameModal.style.display = 'none';
            }
            const gameType = gameTypes.find(type => type.name === "Alla tabeller");
            if (gameType) {
                startGame(gameType);
            }
        });
    }
    
    if (closeSummaryBtn) {
        closeSummaryBtn.addEventListener('click', () => {
            console.log('Close summary button clicked');
            const gameModal = document.getElementById('gameModal');
            if (gameModal) {
                gameModal.style.display = 'none';
            }
            // Show game type selector when closing summary
            const gameTypeSelector = document.querySelector('.game-type-selector');
            if (gameTypeSelector) {
                gameTypeSelector.style.display = 'block';
            }
        });
    }

    // Lägg till event listeners för topplistans tabs
    document.querySelectorAll('.leaderboard-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.leaderboard-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            updateLeaderboard(tab.dataset.tab);
        });
    });

    // Make selectUser function globally available
    window.selectUser = selectUser;

    console.log('Application initialized');
}

// Funktion för att välja användare
async function selectUser(userName) {
    try {
        const userRef = doc(db, "users", userName);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            alert('Användaren finns inte');
            return;
        }
        
        const token = generateToken();
        // Update token in database
        await updateDoc(userRef, { token: token });
        await loginUser(userName, token);
        
    } catch (error) {
        console.error("Error selecting user:", error);
        alert('Ett fel uppstod när användaren skulle väljas');
    }
}

// Lägg till nya funktioner för topplistan
async function updateLeaderboard(type) {
    const leaderboardList = document.getElementById('leaderboardList');
    leaderboardList.innerHTML = '<div class="loading">Laddar topplistan...</div>';
    
    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            // Lägg bara till användare som har aktivitet
            if (userData.totalExercises > 0) {
                users.push({
                    username: doc.id,
                    totalSolved: userData.totalExercises || 0,
                    correctAnswers: userData.correct || 0,
                    averageTime: userData.fastestTime || 0,
                    bestStreak: userData.bestStreak || 0
                });
            }
        });
        
        // Sortera användare baserat på vald typ
        users.sort((a, b) => {
            switch(type) {
                case 'total':
                    return b.totalSolved - a.totalSolved;
                case 'correct':
                    return b.correctAnswers - a.correctAnswers;
                case 'speed':
                    // Filtrera bort användare utan tid för speed-tabellen
                    if (type === 'speed') {
                        return a.averageTime - b.averageTime;
                    }
                    return 0;
                case 'streak':
                    return b.bestStreak - a.bestStreak;
                default:
                    return 0;
            }
        });
        
        // Uppdatera topplistan
        leaderboardList.innerHTML = users.map((user, index) => `
            <div class="leaderboard-item ${index < 3 ? 'top-' + (index + 1) : ''}">
                <div class="leaderboard-rank">${index + 1}</div>
                <div class="leaderboard-user">
                    <div class="leaderboard-avatar">${user.username[0].toUpperCase()}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${user.username}</div>
                        <div class="leaderboard-value">
                            ${getLeaderboardValue(user, type)}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error updating leaderboard:', error);
        leaderboardList.innerHTML = '<div class="error">Ett fel uppstod vid laddning av topplistan</div>';
    }
}

function getLeaderboardValue(user, type) {
    switch(type) {
        case 'total':
            return `${user.totalSolved} uppgifter`;
        case 'correct':
            return `${user.correctAnswers} rätt`;
        case 'speed':
            return `${(user.averageTime / 1000).toFixed(1)} sekunder`;
        case 'streak':
            return `${user.bestStreak} i rad`;
        default:
            return '';
    }
}

// Uppdatera showView-funktionen
function showView(viewId) {
    // Dölj alla vyer
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Visa vald vy
    const selectedView = document.getElementById(viewId + 'View');
    if (selectedView) {
        selectedView.classList.add('active');
    }
    
    // Uppdatera topplistan om vi visar den vyn
    if (viewId === 'leaderboard') {
        // Hitta den aktiva tabb-knappen och använd dess data-tab värde
        const activeTab = document.querySelector('.leaderboard-tab.active');
        if (activeTab) {
            updateLeaderboard(activeTab.dataset.tab);
        }
    } else if (viewId === 'game') {
        // Visa spelväljaren när vi går till spelvyn
        const gameTypeSelector = document.querySelector('.game-type-selector');
        if (gameTypeSelector) {
            gameTypeSelector.style.display = 'block';
        }
        // Dölj spelområdet
        const gamePlayArea = document.querySelector('.game-play-area');
        if (gamePlayArea) {
            gamePlayArea.style.display = 'none';
        }
    }
} 