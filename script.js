// User management
let currentUser = localStorage.getItem('currentUser');
let userStats = {};

// Load saved data from Firebase
async function loadUserData() {
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        userStats = {};
        querySnapshot.forEach((doc) => {
            userStats[doc.id] = doc.data();
        });
        
        // If we have a saved user, load their data
        if (currentUser) {
            // Check if the user still exists in the database
            const userRef = doc(db, "users", currentUser);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                userStats[currentUser] = userDoc.data();
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
                generateProblem(); // Start the game directly if we have a user
            } else {
                // If the user doesn't exist in the database, clear localStorage
                localStorage.removeItem('currentUser');
                currentUser = null;
                showUserModal();
            }
        } else {
            showUserModal();
        }
        
        // Update the list of users
        updatePreviousUsersList();
    } catch (error) {
        console.error("Error loading user data:", error);
        showUserModal();
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

// User interface management
function showUserModal() {
    document.getElementById('userModal').style.display = 'block';
    loadUserData(); // Update the list every time the modal is opened
}

function hideUserModal() {
    document.getElementById('userModal').style.display = 'none';
}

async function updatePreviousUsersList() {
    const userList = document.getElementById('previousUsers');
    if (!userList) return;
    
    userList.innerHTML = '';
    
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        let userListHTML = '';
        
        // Use Array.from instead of forEach
        const documents = Array.from(querySnapshot.docs);
        for (const document of documents) {
            const user = document.id;
            const stats = document.data();
            const level = Math.floor(stats.totalExercises / 100) + 1;
            const currentTitle = titles.find(t => t.level <= level) || titles[0];
            
            userListHTML += `
                <li class="user-list-item" onclick="selectUser('${user}')">
                    <img src="avatars/level${Math.min(level, 8)}.png" alt="Avatar" class="user-list-avatar">
                    <div class="user-list-info">
                        <span class="user-list-name">${user}</span>
                        <span class="user-list-title">${currentTitle.title}</span>
                    </div>
                </li>
            `;
        }
        
        userList.innerHTML = userListHTML;
    } catch (error) {
        console.error("Error updating users list:", error);
    }
}

async function selectUser(userName) {
    currentUser = userName;
    localStorage.setItem('currentUser', userName);
    
    try {
        const userRef = doc(db, "users", userName);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            // Skapa ny användare
            const newUserData = {
                totalExercises: 0,
                correct: 0,
                incorrect: 0,
                tableStats: {},
                lastPlayed: new Date().toISOString(),
                fastestTime: null,
                bestStreak: 0,
                currentStreak: 0
            };
            
            await setDoc(userRef, newUserData);
            userStats[userName] = newUserData;
        } else {
            userStats[userName] = userDoc.data();
        }
        
        const stats = userStats[userName];
        const level = Math.floor(stats.totalExercises / 100) + 1;
        const currentTitle = titles.find(t => t.level <= level) || titles[0];
        
        document.getElementById('currentUser').innerHTML = `
            <img src="avatars/level${Math.min(level, 8)}.png" alt="Avatar" class="current-user-avatar">
            <div class="current-user-info">
                <span class="current-user-name">${userName}</span>
                <span class="current-user-title">${currentTitle.title}</span>
            </div>
        `;
        document.getElementById('statsUserName').textContent = userName;
        hideUserModal();
        updateStats();
        updateUserProfile();
        
    } catch (error) {
        console.error("Error selecting user:", error);
    }
}

// Gör selectUser tillgänglig globalt
window.selectUser = selectUser;

// Game variables
let score = 0;
let correct = 0;
let incorrect = 0;
let currentTable = 0;
let selectedTables = Array.from({length: 10}, (_, i) => i + 1);
let trainingMode = 'free';
let startTime = null; // For time measurement
let gameMode = null; // 'practice' or 'challenge'
let remainingProblems = 0; // For challenge mode
let timeLimit = null; // For time limit
let gameTimer = null; // For time limit

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
        showUserModal();
        return;
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

// Kontrollera svar
function checkAnswer() {
    const num1 = parseInt(number1Element.textContent);
    const num2 = parseInt(number2Element.textContent);
    const userAnswer = parseInt(answerInput.value);
    const correctAnswer = num1 * num2;
    const timeSpent = startTime ? Date.now() - startTime : 0;

    if (userAnswer === correctAnswer) {
        score += 1;
        correct += 1;
        feedbackElement.textContent = 'Rätt! Bra jobbat!';
        feedbackElement.style.color = 'green';
        updateTableStats(true, timeSpent);
        
        // Uppdatera snabbaste tid
        if (!userStats[currentUser].fastestTime || timeSpent < userStats[currentUser].fastestTime) {
            userStats[currentUser].fastestTime = timeSpent;
        }
        
        // Uppdatera bästa svit
        userStats[currentUser].currentStreak = (userStats[currentUser].currentStreak || 0) + 1;
        if (userStats[currentUser].currentStreak > (userStats[currentUser].bestStreak || 0)) {
            userStats[currentUser].bestStreak = userStats[currentUser].currentStreak;
        }
        
        // Uppdatera återstående problem för utmaningsläge
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
        
        // Återställ svit vid fel
        userStats[currentUser].currentStreak = 0;
    }

    scoreElement.textContent = score;
    correctElement.textContent = correct;
    incorrectElement.textContent = incorrect;
    saveUserData();
    updateStats();
    updateUserProfile();
}

// Uppdatera statistik för aktuell tabell
function updateTableStats(isCorrect, timeSpent) {
    if (!userStats[currentUser].tableStats[currentTable]) {
        userStats[currentUser].tableStats[currentTable] = {
            total: 0,
            correct: 0,
            incorrect: 0,
            totalTime: 0,
            averageTime: 0,
            times: [] // Sparar alla tider för analys
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

    // Uppdatera totala övningar för användaren
    userStats[currentUser].totalExercises = (userStats[currentUser].totalExercises || 0) + 1;
    userStats[currentUser].lastPlayed = new Date().toISOString();
}

// Visa ledtråd
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

// Uppdatera statistikvy
function updateStats() {
    if (!currentUser) return;

    const stats = userStats[currentUser];
    
    // Uppdatera översikt
    document.getElementById('totalExercises').textContent = stats.totalExercises;
    document.getElementById('totalCorrect').textContent = stats.correct;
    document.getElementById('totalIncorrect').textContent = stats.incorrect;

    // Hitta svåraste och bästa tabeller
    const tableStats = Object.entries(stats.tableStats);
    const hardestTables = tableStats
        .sort((a, b) => {
            const ratioA = a[1].correct / a[1].total;
            const ratioB = b[1].correct / b[1].total;
            if (ratioA === ratioB) {
                return a[1].averageTime - b[1].averageTime;
            }
            return ratioA - ratioB;
        })
        .slice(0, 3);
    
    const bestTables = tableStats
        .sort((a, b) => {
            const ratioA = a[1].correct / a[1].total;
            const ratioB = b[1].correct / b[1].total;
            if (ratioA === ratioB) {
                return b[1].averageTime - a[1].averageTime;
            }
            return ratioB - ratioA;
        })
        .slice(0, 3);

    // Hitta snabbaste tabeller
    const fastestTables = tableStats
        .filter(([_, stat]) => stat.total >= 5) // Minst 5 tal för att räknas med
        .sort((a, b) => a[1].averageTime - b[1].averageTime)
        .slice(0, 3);

    // Hitta långsammaste tabeller
    const slowestTables = tableStats
        .filter(([_, stat]) => stat.total >= 5) // Minst 5 tal för att räknas med
        .sort((a, b) => b[1].averageTime - a[1].averageTime)
        .slice(0, 3);

    // Uppdatera svåraste tabeller
    const hardestList = document.getElementById('hardestTables');
    hardestList.innerHTML = hardestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${Math.round(stat.correct/stat.total * 100)}% rätt)</li>`
    ).join('');

    // Uppdatera bästa tabeller
    const bestList = document.getElementById('bestTables');
    bestList.innerHTML = bestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${Math.round(stat.correct/stat.total * 100)}% rätt)</li>`
    ).join('');

    // Uppdatera snabbaste tabeller
    const fastestList = document.getElementById('fastestTables');
    fastestList.innerHTML = fastestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${(stat.averageTime/1000).toFixed(2)} sekunder)</li>`
    ).join('');

    // Uppdatera långsammaste tabeller
    const slowestList = document.getElementById('slowestTables');
    slowestList.innerHTML = slowestTables.map(([table, stat]) => 
        `<li>${table}:ans tabell (${(stat.averageTime/1000).toFixed(2)} sekunder)</li>`
    ).join('');

    // Uppdatera detaljerad statistik
    const tableDetails = document.getElementById('tableDetails');
    tableDetails.innerHTML = tableStats.map(([table, stat]) => `
        <div class="table-stat">
            <h4>${table}:ans tabell</h4>
            <p>Totalt: ${stat.total} | Rätt: ${stat.correct} | Fel: ${stat.incorrect}</p>
            <p>Rättprocent: ${Math.round(stat.correct/stat.total * 100)}%</p>
            <p>Genomsnittlig tid: ${(stat.averageTime/1000).toFixed(2)} sekunder</p>
        </div>
    `).join('');
}

// Återställ statistik
function resetStats() {
    if (!currentUser) return;
    
    if (confirm('Är du säker på att du vill återställa din statistik? Detta går inte att ångra.')) {
        // Behåll användaren men återställ all statistik
        userStats[currentUser] = {
            totalExercises: 0,
            correct: 0,
            incorrect: 0,
            tableStats: {},
            lastPlayed: new Date().toISOString(),
            fastestTime: null,
            bestStreak: 0,
            currentStreak: 0
        };
        
        // Återställ aktuella spelvariabler
        score = 0;
        correct = 0;
        incorrect = 0;
        
        // Uppdatera visningen
        scoreElement.textContent = '0';
        correctElement.textContent = '0';
        incorrectElement.textContent = '0';
        
        // Spara och uppdatera statistik
        saveUserData();
        updateStats();
        
        // Generera ny uppgift
        generateProblem();
        
        // Visa bekräftelse
        feedbackElement.textContent = 'Statistik återställd!';
        feedbackElement.style.color = '#4CAF50';
        setTimeout(() => {
            feedbackElement.textContent = '';
        }, 2000);
    }
}

// Uppdatera användarprofil
function updateUserProfile() {
    if (!currentUser) return;
    
    const stats = userStats[currentUser];
    const level = Math.floor(stats.totalExercises / 100) + 1;
    const levelProgress = (stats.totalExercises % 100) / 100 * 100;
    
    // Uppdatera nivå och progress bar
    document.getElementById('userLevel').textContent = level;
    document.getElementById('levelProgress').style.width = `${levelProgress}%`;
    
    // Uppdatera titel
    const currentTitle = titles.find(t => t.level <= level) || titles[titles.length - 1];
    document.getElementById('userTitle').textContent = currentTitle.title;
    
    // Uppdatera avatar
    document.getElementById('userAvatar').src = `avatars/level${Math.min(level, 8)}.png`;
    
    // Uppdatera utmärkelser
    updateAchievements(stats);
}

// Uppdatera utmärkelser
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

// Starta spel
function startGame(gameType) {
    gameMode = 'challenge';
    score = 0;
    correct = 0;
    incorrect = 0;
    remainingProblems = gameType.problems;
    timeLimit = gameType.timeLimit;
    
    // Spara valda tabeller
    if (Array.isArray(gameType.tables)) {
        selectedTables = gameType.tables;
    }
    
    // Visa nedräkning
    const gameModal = document.getElementById('gameModal');
    const countdown = document.getElementById('countdown');
    const gameSummary = document.getElementById('gameSummary');
    gameModal.style.display = 'flex';
    countdown.style.display = 'block';
    gameSummary.style.display = 'none';
    
    // Starta nedräkning
    let count = 3;
    countdown.textContent = count;
    countdown.classList.add('animate');
    
    const countdownInterval = setInterval(() => {
        count--;
        countdown.textContent = count;
        
        if (count <= 0) {
            clearInterval(countdownInterval);
            countdown.classList.remove('animate');
            countdown.style.display = 'none';
            startGamePlay(gameType);
        }
    }, 1000);
}

// Starta själva spelet
function startGamePlay(gameType) {
    // Visa spelområdet
    document.querySelector('.game-play-area').style.display = 'block';
    
    // Uppdatera UI
    scoreElement.textContent = '0';
    correctElement.textContent = '0';
    incorrectElement.textContent = '0';
    
    // Sätt fokus på svarsfältet
    answerInput.focus();
    
    // Sätt upp tidsgräns om det finns
    if (timeLimit) {
        startTimer(timeLimit);
    }
    
    // Välj tabeller baserat på speltyp om det inte är ett anpassat spel
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
    }
    
    // Starta spelet
    generateProblem();
}

// Avsluta spel
function endGame() {
    if (gameTimer) {
        clearInterval(gameTimer);
    }
    
    // Dölj spelområdet
    document.querySelector('.game-play-area').style.display = 'none';
    
    // Beräkna genomsnittlig tid
    const totalTime = Object.values(userStats[currentUser].tableStats)
        .reduce((sum, stat) => sum + stat.totalTime, 0);
    const totalProblems = Object.values(userStats[currentUser].tableStats)
        .reduce((sum, stat) => sum + stat.total, 0);
    const avgTime = totalProblems > 0 ? totalTime / totalProblems : 0;
    
    // Uppdatera sammanfattning
    document.getElementById('summaryCorrect').textContent = correct;
    document.getElementById('summaryIncorrect').textContent = incorrect;
    document.getElementById('summaryAvgTime').textContent = (avgTime/1000).toFixed(2);
    document.getElementById('summaryBestStreak').textContent = userStats[currentUser].bestStreak;
    
    // Visa sammanfattning
    const gameModal = document.getElementById('gameModal');
    const countdown = document.getElementById('countdown');
    const gameSummary = document.getElementById('gameSummary');
    countdown.style.display = 'none';
    gameSummary.style.display = 'block';
    
    // Återgå till övningsläge
    gameMode = 'practice';
    remainingProblems = null;
    timeLimit = null;
    
    // Uppdatera statistik
    updateStats();
    updateUserProfile();
}

// Starta timer
function startTimer(seconds) {
    let timeLeft = seconds;
    const gameArea = document.querySelector('.game-area');
    if (!gameArea) return;
    
    // Lägg till timer-element
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

// Hitta svåraste tabeller
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
    // Vänta på att Firebase är redo
    if (window.firebaseReady) {
        initializeApp();
    } else {
        // Om Firebase inte är redo, vänta på det
        const checkFirebase = setInterval(() => {
            if (window.firebaseReady) {
                clearInterval(checkFirebase);
                initializeApp();
            }
        }, 100);
    }
});

// Initialisera applikationen
function initializeApp() {
    loadUserData();
    if (!currentUser) {
        showUserModal();
    }

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.view}View`).classList.add('active');
        });
    });

    // Användarhantering
    document.getElementById('changeUser').addEventListener('click', showUserModal);
    document.getElementById('saveUser').addEventListener('click', () => {
        const userName = document.getElementById('userName').value.trim();
        if (userName) {
            selectUser(userName);
        }
    });

    // Spelhantering
    checkButton.addEventListener('click', checkAnswer);
    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkAnswer();
        }
    });
    hintButton.addEventListener('click', showHint);

    // Träningsläge
    document.getElementById('trainingMode').addEventListener('change', (e) => {
        trainingMode = e.target.value;
    });

    // Tabellval
    document.querySelectorAll('.table-selection input').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            selectedTables = Array.from(document.querySelectorAll('.table-selection input:checked'))
                .map(cb => parseInt(cb.value));
        });
    });

    // Återställ statistik
    document.getElementById('resetStats').addEventListener('click', resetStats);

    // Lägg till event listeners för speltyper
    document.querySelectorAll('.game-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const gameType = gameTypes.find(type => type.name === btn.dataset.type);
            startGame(gameType);
        });
    });

    // Hantera anpassat spel
    document.getElementById('startCustomGame').addEventListener('click', () => {
        const problems = parseInt(document.getElementById('customProblems').value);
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

    // Hantera spelmodalen
    document.getElementById('playAgain').addEventListener('click', () => {
        document.getElementById('gameModal').style.display = 'none';
        const gameType = gameTypes.find(type => type.name === "Alla tabeller");
        startGame(gameType);
    });

    document.getElementById('closeSummary').addEventListener('click', () => {
        document.getElementById('gameModal').style.display = 'none';
    });

    generateProblem();
} 