const fs = require('fs');
const path = require('path');

const LEADERBOARDS_LENGTH = 10;

class KillLeaderboard {
    totalKills = [];
    pvpKills = [];
    bystanderKills = [];
}

const leaderboards = {
    lastUpdate: Date.now(),
    cyclesLived: [],
    cellsWritten: [],
    cellsRead: [],
    dailyKills: new KillLeaderboard(),
    weeklyKills: new KillLeaderboard(),
    monthlyKills: new KillLeaderboard(),
    allTimeKills: new KillLeaderboard(),
};

module.exports = leaderboards;

const userMap = {};
const doLater = [];

let lock = false;

function analyzeStatisticsEntry(obj, forceDoNow=false) {
    const prog = getProgramLeaderboardObject(obj, !forceDoNow);
    if (prog === false)
    {
        doLater.push(obj);
        return false;
    }

    pushOnLeaderboardIfRelevant(leaderboards.cyclesLived, obj.cyclesLived);

    const addVal = ["cellsRead", "cellsWritten"];
    for (const i in addVal) {
        const k = addVal[i];

        let total = 0;
        const values = Object.values(obj[k]);
        for (const i in values) {
            total += values[i];
        }

        pushOnLeaderboardIfRelevant(leaderboards[k], total);
    }

    const now = new Date();
    const monthAgo = new Date(now.getFullYear(), now.getMonth());
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), Math.floor(now.getDate() / 7) * 7);
    const dayAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Midnight

    pushOnKillLeaderboard(leaderboards.dailyKills, dayAgo);
    pushOnKillLeaderboard(leaderboards.weeklyKills, weekAgo);
    pushOnKillLeaderboard(leaderboards.monthlyKills, monthAgo);
    pushOnKillLeaderboard(leaderboards.allTimeKills, false);

    function pushOnKillLeaderboard(killLeaderboard, onlyCountKillsAfterDate) {
        let pvpKills = 0;
        let bystanderKills = 0;

        for (const i in obj.kills) {
            const kill = obj.kills[i];
            if (onlyCountKillsAfterDate === false || kill.time > onlyCountKillsAfterDate) {
                if (kill.isBystanderKill) {
                    bystanderKills++;
                }
                else if (kill.targetAndKillerHaveSameOwner) {
                    // lol you thought
                }
                else {
                    pvpKills++;
                }
            }
        }

        const totalKills = pvpKills + bystanderKills;
        pushOnLeaderboardIfRelevant(killLeaderboard.totalKills, totalKills);
        pushOnLeaderboardIfRelevant(killLeaderboard.bystanderKills, bystanderKills);
        pushOnLeaderboardIfRelevant(killLeaderboard.pvpKills, pvpKills);
    
        return true;
    }

    function pushOnLeaderboardIfRelevant(leaderboard, valueToCompare) {
        while (leaderboard.length < LEADERBOARDS_LENGTH) {
            leaderboard.push(false);
        }

        if (valueToCompare == 0) {
            return;
        }

        let inserted = false;
        for (let i = 0; i < LEADERBOARDS_LENGTH; i++) {
            if (leaderboard[i] === false || leaderboard[i].checksum == prog.checksum) {
                inserted = true;
                leaderboard[i] = { value: valueToCompare, ...prog };
                break;
            }
        }

        if (!inserted) {
            for (let i = 0; i < LEADERBOARDS_LENGTH; i++) {
                if (valueToCompare > leaderboard[i].value) {
                    leaderboard.splice(i, 0, { value: valueToCompare, ...prog });
                    leaderboard.splice(LEADERBOARDS_LENGTH, 1);
                    break;
                }
            }
        }

        // reorder leaderboard because... i don't know?
        // sometimes it's messed up if I don't do it
        // and i'm not sure why
        leaderboard.sort((a, b) => {
            if (a === false) {
                return 1;
            }

            if (b === false) {
                return -1;
            }

            return b.value - a.value;
        });
    }

}

function getProgramLeaderboardObject(obj, allowAuthorless=false) {
    const result = {};

    const authors = Object.keys(obj.knownAuthors);
    result.author = authors.length > 0 ? authors[0] : null;
    result.name = Object.keys(obj.knownNames)[0];
    if (obj.knownNames.length > 1) {
        result.aka = Object.keys(obj.knownNames).splice(0, 1);
    }

    // Try to find author for later
    const firstUser = Object.keys(obj.knownUsers)[0];
    if (result.author === null)
    {
        if (userMap[firstUser])
        {
            result.author = userMap[firstUser];
        }
        else
        {
            if (!allowAuthorless)
            {
                // We can try again later
                return false;
            }
        }
    }
    else
    {
        if (!userMap[firstUser])
        {
            userMap[firstUser] = result.author;
        }
    }

    result.checksum = obj.checksum;

    return result;
}

function refreshLeaderboards() {
    const statsPath = global.STATS.DATABASE_DIRECTORY;

    if (lock) {
        return;
    }

    if (!fs.existsSync(statsPath)) {
        return;
    }

    lock = true;
    Object.keys(userMap).forEach(key => {
        delete userMap[key];
    })

    doLater.length = 0;

    fs.readdir(statsPath, (errDir, files) => {
        if (errDir) {
            log.warn(errDir);
            lock = false;
            return;
        }

        let filesRemaining = files.length;

        files.forEach(file => {
            fs.readFile(path.join(statsPath, file), { encoding: "utf-8" }, (readError, data) => {
                if (!lock) {
                    return;
                }

                let willDoLater = false;

                if (readError) {
                    log.warn(`While reading ${file}: ${readError}\nScoreboard update aborted.`);
                    lock = false;
                    return;
                }
                else {
                    try {
                        const obj = JSON.parse(data);
                        if (analyzeStatisticsEntry(obj))
                        {
                            // OK
                        }
                        else
                        {
                            doLater.push(obj);
                            willDoLater = true;
                        }
                    }
                    catch (e) {
                        log.warn(`Corrupt stats file? on file ${file}  :  ${e}`);
                    }
                }

                filesRemaining--;

                if (filesRemaining <= 0) {
                    // Check if I'm not forgetting anything...
                    for(const statIndex in doLater)
                    {
                        const obj = doLater[statIndex];
                        analyzeStatisticsEntry(obj, true);
                    }

                    // Done updating leaderboards
                    lock = false;
                    leaderboards.lastUpdate = Date.now();
                    return;
                }
            })
        });
    });
}


setInterval(refreshLeaderboards, 30000);
setTimeout(refreshLeaderboards, 1000); // Fire up once