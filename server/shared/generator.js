module.exports.bystander = {
    generate: function (allowSuicidal) {
        function randomInt(min, max) {
            return Math.floor(Math.random() * (max - min) + min);
        }

        if (Math.random() < 0.3 || !allowSuicidal) { // Permanent runners
            const instructions = [];

            // TODO Wall
            if (Math.random() < 0.4) {
                const length = randomInt(2, 5);
                for (let i = 0; i < length; i++) {
                    instructions.push(`write -999 at -${(i + 1)}`);
                }

                instructions.push(`go to -${instructions.length}`);
            }
            else {
                instructions.push(`add ${randomInt(117, 263)} to 10`);

                if (Math.random() < 0.5) {
                    instructions.push(`copy 3 to the address specified at 9`);
                } else {
                    instructions.push(`copy 2 to -${(allowSuicidal ? randomInt(1, 10) : randomInt(10, 12))}`);
                }

                if (Math.random() < 0.5) {
                    instructions.push(`add ${randomInt(1, 2)} to the value at -${randomInt(3, 4)}`);
                }
                else {
                    let f = 0.0;
                    while (Math.random() > f) {
                        f += 0.25;
                        instructions.push(`copy 1 to ${randomInt(5, 8)}`);
                    }
                }

                instructions.push(`go to -${instructions.length}`);
            }

            return instructions.join('\n');
        }
        else { // Suicide
            return `add 1 to 3
                skip if the value at 2 equals ${randomInt(11, 45)}
                jump -2
                data 0`;
        }
    }
}

module.exports.programs = ['ARTILLERY', ];