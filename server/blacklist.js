const {
    RegExpMatcher,
    englishDataset,
    englishRecommendedTransformers,
    DataSet, 
    pattern,
} = require('obscenity');

const fs = require('fs');
let matcher = null;

let kills = [];

const MOVE = 6 << 4;
const COPY = 5 << 4;
const WRITE_DEEP = 0x24;

module.exports = {
    isBlacklisted: function (bytecode) {
        if (!Number.isInteger(bytecode.length / 4)) {
            log.error(`Passed a program that is not divisible by four, should never happen! ${bytecode.length} bytes (${bytecode.length / 4})`);
            return "looks wrong"; // filter in doubt...
        }

        if (isSimpleWorm(bytecode)) {
            return "is simple worm";
        }

        if (isWormFragment(bytecode)) {
            return "is worm fragment";
        }

        return false;
    },

    isBlacklistedName: function (name) {
        
        for (const k in matcher.blacklistedTerms)
        {
            if (matcher.blacklistedTerms[k].regExp.test(name))
            {
                return true;
            }
        }

    // Doesn't work !
        // if (matcher) {
        //     if (matcher.hasMatch(name)) {
        //         return true;
        //     }
        // }

        return false;
    },

    isBannedAddress: function (address) {
        return kills.includes(address);
    },

    ban: function (address) {
        kills.push(address);
        fs.writeFile("kill.txt", kills.join(`\n`), function () { });
    }
}

function refreshBanList() {
    fs.readFile("kill.txt", { encoding: 'utf-8' }, function (err, buff) {
        if (!err) {
            kills = buff.split('\n')
                .filter(o => o && o.length != 0)
                .map(o => o.trim());
        }
    });
}

function refreshWordsBlacklist() {
    fs.readFile("badnames.txt", { encoding: 'utf-8' }, function (err, buff) {
        const dataset = new DataSet().addAll(englishDataset); // copy array

        if (err) {
            // It's fine
        }
        else {
            const additionalBlacklistedWords = buff
                .split('\n')
                .map(o => o.trim())
                .filter(o => o.length > 0);

            for (const k in additionalBlacklistedWords) {
                dataset.addPhrase((phrase) =>
                     phrase
                     .setMetadata({ originalWord: additionalBlacklistedWords[k] })
                     .addPattern(pattern`${additionalBlacklistedWords[k]}`)
                );
            }
        }

        matcher = new RegExpMatcher({
            ...dataset.build(),
            ...englishRecommendedTransformers,
        });

        WORLD.nameCheckAllCores();
    });
}


function isSimpleWorm(buff) {
    const maxAddress = buff.length / 4;
    let targetNumber = maxAddress;
    for (let address = 0; address < maxAddress; address++) {
        if (buff.readInt8(address * 4) == targetNumber) // Destination => End of program
        {
            if (buff.readInt8(address * 4 + 1) == 0  // Self op
                && buff.readInt8(address * 4 + 2) == 0
            ) {
                const tail = buff.readInt8(address * 4 + 3);
                if (tail == MOVE 
                    || tail == COPY
                    || tail == WRITE_DEEP) // copy or move or write from ref
                {
                    return true;
                }
            }
        }
        else {
            targetNumber--;
        }
    }

    return false;
}

function isWormFragment(buff) {
    const maxAddress = buff.length / 4;
    for (let address = 0; address < maxAddress; address++) {
        if (buff.readInt8(address * 4) == 1) // Destination => Next
        {
            if (buff.readInt8(address * 4 + 1) == 0  // Self op
                && buff.readInt8(address * 4 + 2) == 0
            ) {
                const tail = buff.readInt8(address * 4 + 3);
                if (tail == MOVE 
                    || tail == COPY
                    || tail == WRITE_DEEP)  // copy or move
                {
                    return true;
                }
            }
        }
    }

    return false;
}


setInterval(refreshWordsBlacklist, 5000);
setInterval(refreshBanList, 10000);
refreshBanList();
refreshWordsBlacklist();