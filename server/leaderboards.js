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

let lock = false;

function analyzeStatisticsEntry(obj) {
    const prog = getProgramLeaderboardObject(obj);

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
                else {
                    pvpKills++;
                }
            }
        }

        const totalKills = pvpKills + bystanderKills;
        pushOnLeaderboardIfRelevant(killLeaderboard.totalKills, totalKills);
        pushOnLeaderboardIfRelevant(killLeaderboard.bystanderKills, bystanderKills);
        pushOnLeaderboardIfRelevant(killLeaderboard.pvpKills, pvpKills);
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
    }

}

function getProgramLeaderboardObject(obj) {
    const result = {};

    const authors = Object.keys(obj.knownAuthors);
    result.author = authors.length > 0 ? authors[0] : null;
    result.name = Object.keys(obj.knownNames)[0];
    if (obj.knownNames.length > 1) {
        result.aka = Object.keys(obj.knownNames).splice(0, 1);
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

                if (readError) {
                    log.warn(`While reading ${file}: ${readError}\nScoreboard update aborted.`);
                    lock = false;
                    return;
                }
                else {
                    try {
                        const obj = JSON.parse(data);
                        analyzeStatisticsEntry(obj);
                    }
                    catch (e) {
                        log.warn(`Corrupt stats file? on file ${file}  :  ${e}`);
                    }
                }

                filesRemaining--;

                if (filesRemaining <= 0) {
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